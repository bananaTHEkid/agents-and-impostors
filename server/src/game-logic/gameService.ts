import { Server, Socket } from 'socket.io';
import { getDB, withTransaction } from '../db/db';
import { GamePhase, RoundResult, FinalResults, VoteValidationResult, Lobby } from './types';
import { GAME_CONFIG, OPERATION_CONFIG } from './config';

// Forward declaration or import of io and userSockets if they are to be passed as parameters.
// For now, we'll define them as parameters for the functions that need them.
// It's assumed that server.ts will handle the actual io instance and userSockets mapping.

export async function updateLobbyPhase(lobbyId: string, phase: GamePhase, lobbies: Record<string, Lobby>) {
    const dbInstance = getDB();
    await dbInstance.run(
        "UPDATE lobbies SET phase = ? WHERE id = ?",
        [phase, lobbyId]
    );

    if (lobbies[lobbyId]) {
        lobbies[lobbyId].phase = phase;
    }
    return true;
}

export async function validateVote(
    lobbyId: string,
    voter: string,
    target: string
): Promise<VoteValidationResult> {
    const db = getDB();
    try {
        const lobby = await db.get(`
            SELECT phase, current_round 
            FROM lobbies 
            WHERE id = ?
        `, [lobbyId]);

        if (!lobby) {
            return { isValid: false, error: "Lobby nicht gefunden" };
        }
        if (lobby.phase !== 'voting') { // Direct use of GamePhase.VOTING might be better if available
            return { isValid: false, error: "Abstimmen ist derzeit nicht erlaubt" };
        }

        const voterPlayer = await db.get(`
            SELECT eliminated 
            FROM players 
            WHERE lobby_id = ? AND username = ?
        `, [lobbyId, voter]);
        if (!voterPlayer) {
            return { isValid: false, error: "Wähler in Lobby nicht gefunden" };
        }
        if (voterPlayer.eliminated === 1) {
            return { isValid: false, error: "Ausgeschiedene Spieler können nicht abstimmen" };
        }

        const targetPlayer = await db.get(`
            SELECT eliminated 
            FROM players 
            WHERE lobby_id = ? AND username = ?
        `, [lobbyId, target]);
        if (!targetPlayer) {
            return { isValid: false, error: "Zielspieler in Lobby nicht gefunden" };
        }
        if (voter === target) {
            return { isValid: false, error: "Du kannst nicht für dich selbst abstimmen" };
        }

        const existingVote = await db.get(`
            SELECT id 
            FROM votes 
            WHERE lobby_id = ? AND voter = ?
        `, [lobbyId, voter]);
        if (existingVote) {
            return { isValid: false, error: "Du hast in dieser Runde bereits abgestimmt" };
        }
        if (targetPlayer.eliminated === 1) {
            return { isValid: false, error: "Du kannst nicht für einen ausgeschiedenen Spieler abstimmen" };
        }
        return { isValid: true };
    } catch (error) {
        console.error("Fehler bei der Validierung der Stimme:", error);
        return { isValid: false, error: "Interner Serverfehler bei der Stimmvalidierung" };
    }
}

/**
 * Records a vote in a transaction to prevent race conditions
 * @param lobbyId - Lobby ID
 * @param voter - Username of voter
 * @param target - Username of vote target
 * @param roundNumber - Current round number
 * @returns true if vote recorded, false otherwise
 */
export async function recordVote(
    lobbyId: string,
    voter: string,
    target: string,
    roundNumber: number
): Promise<boolean> {
    try {
        await withTransaction(async (db) => {
            // Re-validate vote wasn't already cast (prevent race condition)
            const existingVote = await db.get(`
                SELECT id FROM votes 
                WHERE lobby_id = ? AND voter = ? AND round_number = ?
            `, [lobbyId, voter, roundNumber]);

            if (existingVote) {
                throw new Error("Stimme für diesen Spieler in dieser Runde bereits aufgezeichnet");
            }

            // Record the vote
            await db.run(`
                INSERT INTO votes (lobby_id, voter, target, round_number) 
                VALUES (?, ?, ?, ?)
            `, [lobbyId, voter, target, roundNumber]);
        });
        return true;
    } catch (error) {
        console.error("Fehler beim Speichern der Stimme:", error);
        return false;
    }
}

export async function startNewRound(lobbyId: string, roundNumber: number, lobbies: Record<string, Lobby>) {
    const db = getDB();
    // Clear any previous votes for a fresh single-round game
    await db.run("DELETE FROM votes WHERE lobby_id = ?", [lobbyId]);

    // Set lobby into team assignment phase and current round (single round games)
    await db.run(`
        UPDATE lobbies
        SET phase = ?, current_round = ?
        WHERE id = ?
    `, [GamePhase.TEAM_ASSIGNMENT, roundNumber, lobbyId]);

    if (lobbies[lobbyId]) {
        lobbies[lobbyId].phase = GamePhase.TEAM_ASSIGNMENT;
    }
    return true;
}

export async function processSpecialOperations(lobbyId: string, roundResult: RoundResult) {
    const db = getDB();
    // Determine player count to cap how many win-condition-modifying operations run this round
    const playerCountRow = await db.get(`SELECT COUNT(*) as cnt FROM players WHERE lobby_id = ?`, [lobbyId]);
    const playerCount = playerCountRow?.cnt ?? 0;
    // Caps:
    // - <= 6 players: 1 operation
    // - <= 9 players: 2 operations
    // - >= 10 players: 3 operations
    const allowedOpsThisRound = playerCount <= 6 ? 1 : (playerCount <= 9 ? 2 : 3);

    // Pull players with operations in a deterministic order
    const playersWithOps = await db.all(`
        SELECT username, operation, operation_info 
        FROM players 
        WHERE lobby_id = ? AND operation IS NOT NULL
        ORDER BY username ASC
    `, [lobbyId]);

    // Only these operations are allowed to modify win conditions this round
    const winConditionOps = new Set(['grudge', 'infatuation', 'sleeper agent', 'sleeper', 'scapegoat', 'defector']);
    // Prioritize a subset that strongly affects outcomes
    const priorityOps = new Set(['sleeper agent', 'sleeper', 'defector', 'scapegoat', 'grudge']);

    // Filter to only those that actually implement modifyWinCondition
    const hasModifier = (opName: string) => {
        const op = OPERATION_CONFIG[opName];
        return !!op?.modifyWinCondition;
    };

    // Consider only the specified win-condition operations
    const eligible = playersWithOps.filter((p: any) => winConditionOps.has(p.operation) && hasModifier(p.operation));
    const priorityCandidates = eligible.filter((p: any) => priorityOps.has(p.operation));
    const otherCandidates = eligible.filter((p: any) => !priorityOps.has(p.operation));

    // Select up to allowedOpsThisRound, taking from priority first, then others
    const selected: Array<any> = [];
    for (const p of priorityCandidates) {
        if (selected.length >= allowedOpsThisRound) break;
        selected.push(p);
    }
    if (selected.length < allowedOpsThisRound) {
        for (const p of otherCandidates) {
            if (selected.length >= allowedOpsThisRound) break;
            selected.push(p);
        }
    }

    const getTeamsMap = async () => {
        const allPlayersInLobby = await db.all(`
            SELECT username, team 
            FROM players 
            WHERE lobby_id = ?
        `, [lobbyId]);
        return {
            list: allPlayersInLobby.map((p: any) => p.username),
            map: allPlayersInLobby.reduce((acc: Record<string, string>, p: any) => { acc[p.username] = p.team; return acc; }, {})
        } as { list: string[]; map: Record<string, string> };
    };

    // Run only the selected operations' modifyWinCondition in this round
    for (const player of selected) {
        const operationDetails = OPERATION_CONFIG[player.operation];
        if (!operationDetails?.modifyWinCondition) continue;
        try {
            const teamsData = await getTeamsMap();
            await operationDetails.modifyWinCondition(
                lobbyId,
                teamsData.list,
                roundResult.votes,
                teamsData.map,
                db,
                roundResult
            );
        } catch (error) {
            console.error(`Fehler bei der Verarbeitung der Operation ${player.operation} für Spieler ${player.username}:`, error);
        }
    }
}

export async function calculateRoundResults(lobbyId: string): Promise<RoundResult> {
    const db = getDB();
    const lobby = await db.get(`SELECT current_round FROM lobbies WHERE id = ?`, [lobbyId]);
    // For single-round/no-elimination mode include all players when computing results
    const players = await db.all(`SELECT username, team FROM players WHERE lobby_id = ?`, [lobbyId]);
    const votes = await db.all(`SELECT voter, target FROM votes WHERE lobby_id = ? AND round_number = ?`, [lobbyId, lobby.current_round]);

    const voteRecord: Record<string, string> = {};
    votes.forEach(vote => { voteRecord[vote.voter] = vote.target; });

    const voteCounts: Record<string, number> = {};
    players.forEach(player => { voteCounts[player.username] = 0; });
    votes.forEach(vote => { if (voteCounts[vote.target] !== undefined) voteCounts[vote.target]++; });

    const maxVotes = Math.max(...Object.values(voteCounts));
    const eliminatedPlayers = Object.entries(voteCounts)
        .filter(([_, count]) => count === maxVotes)
        .map(([player]) => player);

    // In single-round/no-elimination mode we do not persist eliminations to the DB.
    // eliminatedPlayers is a logical result (players who received the most votes).
    const remainingPlayers = players.filter(p => !eliminatedPlayers.includes(p.username));
    const teamCounts = remainingPlayers.reduce((acc, player) => {
        acc[player.team] = (acc[player.team] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    let winner: 'agent' | 'impostor';
    if (!teamCounts['impostor'] || teamCounts['impostor'] === 0) {
        winner = 'agent';
    } else if (!teamCounts['agent'] || teamCounts['agent'] <= teamCounts['impostor']) {
        winner = 'impostor';
    } else {
        winner = 'agent';
    }
    
    const currentRoundResult: RoundResult = {
        winner,
        eliminatedPlayers,
        votes: voteRecord,
        roundNumber: lobby.current_round
    };

    await processSpecialOperations(lobbyId, currentRoundResult);

    // In single-round/no-persistent-round mode we do not persist round rows here.
    return currentRoundResult;
}

export async function calculateFinalResults(lobbyId: string): Promise<FinalResults> {
    const db = getDB();
    // Single-round mode: derive final results from the single round and current DB state
    // Attempt to reconstruct the most recent round result from votes
    const dbRound = await db.get(`SELECT current_round FROM lobbies WHERE id = ?`, [lobbyId]);
    const currentRoundNumber = dbRound ? dbRound.current_round : 1;

    const votes = await db.all(`SELECT voter, target FROM votes WHERE lobby_id = ? AND round_number = ?`, [lobbyId, currentRoundNumber]);
    const voteRecord: Record<string, string> = {};
    votes.forEach(v => { voteRecord[v.voter] = v.target; });

    // Count votes per target
    const playersList = await db.all(`SELECT username, team, operation, win_status FROM players WHERE lobby_id = ?`, [lobbyId]);
    const voteCounts: Record<string, number> = {};
    playersList.forEach(p => { voteCounts[p.username] = 0; });
    votes.forEach(v => { if (voteCounts[v.target] !== undefined) voteCounts[v.target]++; });

    const maxVotes = Object.values(voteCounts).length ? Math.max(...Object.values(voteCounts)) : 0;
    const eliminatedPlayers = Object.entries(voteCounts).filter(([_, c]) => c === maxVotes).map(([name]) => name);

    // Determine winner by same logic as round calculation
    const remainingPlayers = playersList.filter(p => !eliminatedPlayers.includes(p.username));
    const teamCounts = remainingPlayers.reduce((acc: Record<string, number>, player) => {
        acc[player.team] = (acc[player.team] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    let overallWinner: 'agent' | 'impostor';
    if (!teamCounts['impostor'] || teamCounts['impostor'] === 0) {
        overallWinner = 'agent';
    } else if (!teamCounts['agent'] || teamCounts['agent'] <= teamCounts['impostor']) {
        overallWinner = 'impostor';
    } else {
        overallWinner = 'agent';
    }

    // Team scores: single round
    const teamScores: { agent: number; impostor: number } = { agent: 0, impostor: 0 };
    teamScores[overallWinner] = 1;

    // Compute mvp: simple heuristic using times voted out and whether player's team matched overallWinner
    const playersWithStats = await Promise.all(playersList.map(async (p: any) => {
        const timesVotedOutRow = await db.get(`SELECT COUNT(*) as c FROM votes WHERE target = ? AND lobby_id = ?`, [p.username, lobbyId]);
        const roundsWon = (p.team === overallWinner) ? 1 : 0;
        return {
            username: p.username,
            team: p.team,
            operation: p.operation,
            winStatus: (p.win_status as 'win' | 'lose') || (p.team === overallWinner ? 'win' : 'lose'),
            times_voted_out: timesVotedOutRow ? timesVotedOutRow.c : 0,
            rounds_won: roundsWon
        };
    }));

    const mvp = playersWithStats.reduce((prev: any, curr: any) => {
        const prevScore = (prev.rounds_won || 0) - (prev.times_voted_out || 0);
        const currScore = (curr.rounds_won || 0) - (curr.times_voted_out || 0);
        return currScore > prevScore ? curr : prev;
    }, playersWithStats[0] || { username: 'N/A' }).username;

    const roundResult: RoundResult = {
        winner: overallWinner,
        eliminatedPlayers,
        votes: voteRecord,
        roundNumber: currentRoundNumber
    };

    return {
        overallWinner,
        roundResults: [roundResult],
        mvp,
        totalRounds: 1,
        teamScores,
        players: playersWithStats.map((p: any) => ({ username: p.username, team: p.team, winStatus: p.winStatus, operation: p.operation }))
    };
}


export async function generateOperationInfo(
    lobbyId: string,
    players: string[],
    teams: Record<string, string>,
    io: Server, 
    getSocketIdByUsername: (username: string) => string | undefined
) {
    const db = getDB();
    for (const player of players) {
        const operationRow = await db.get(
            "SELECT operation FROM players WHERE username = ? AND lobby_id = ?",
            [player, lobbyId]
        );
        if (!operationRow?.operation) continue;

        const operationName = operationRow.operation;
        const config = OPERATION_CONFIG[operationName];
        if (!config?.generateInfo) continue;

        // Let the operation generator produce a template. If it returns selectable
        // `availablePlayers` or similar, the server will choose the actual targets
        // now so that operations are prepared and immutable before assignment.
        let generatedInfo = config.generateInfo(players, teams, player) || {};

        // If generator provides `availablePlayers`, pick appropriate fields server-side
        // based on `config.fields` so players cannot change them at assignment time.
        try {
            const opMeta = GAME_CONFIG.OPERATIONS.find(o => o.name === operationName);
            const clientChooses = !!opMeta?.clientChooses;
            if (!clientChooses && generatedInfo.availablePlayers && Array.isArray(generatedInfo.availablePlayers) && config.fields && config.fields.length > 0) {
                const available = generatedInfo.availablePlayers.filter((p: string) => p !== player);
                // Helper to pick unique random values
                const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

                const chosen: Record<string, any> = {};
                for (let i = 0; i < config.fields.length; i++) {
                    const fieldName = config.fields[i];
                    if (!available.length) break;
                    // For multi-field selections, try to avoid duplicates when possible
                    let choice = pickRandom(available);
                    if (config.fields.length > 1) {
                        // Remove chosen from available to avoid duplicates
                        const idx = available.indexOf(choice);
                        if (idx >= 0) available.splice(idx, 1);
                    }
                    chosen[fieldName] = choice;
                }

                generatedInfo = { ...generatedInfo, ...chosen };
                delete generatedInfo.availablePlayers;
            }
        } catch (err) {
            console.error(`Fehler bei der Zielauswahl für Operation ${operationName} für ${player}:`, err);
        }

        // Persist the prepared operation info (immutable/server-chosen)
        await db.run(
            "UPDATE players SET operation_info = ? WHERE username = ? AND lobby_id = ?",
            [JSON.stringify(generatedInfo), player, lobbyId]
        );

        const socketId = getSocketIdByUsername(player);
        if (socketId) {
            io.to(socketId).emit("operation-prepared", {
                operation: operationName,
                info: generatedInfo,
            });
            console.log(`Operation '${operationName}' mit Informationen an ${player} gesendet (${socketId})`);
        } else {
            // Player offline — info persisted for later replay on reconnect
            console.warn(`Socket ID for player ${player} not found when sending operation info. Saved to DB for later delivery.`);
        }
    }
}

export async function assignTeamsAndOperations(
    lobbyId: string,
    players: string[],
    io: Server, 
    getSocketIdByUsername: (username: string) => string | undefined // Changed from userSockets
) {
    const db = getDB();
    const impostorConfig = GAME_CONFIG.IMPOSTOR_THRESHOLDS.find(
        config => players.length >= config.min && players.length <= config.max
    );
    if (!impostorConfig) throw new Error("Invalid number of players for impostor assignment.");

    // Prepare player->operation mapping first (server chooses operations deterministically here)
    const shuffledPlayers = [...players].sort(() => 0.5 - Math.random());
    const impostors = shuffledPlayers.slice(0, impostorConfig.count);
    const agents = shuffledPlayers.slice(impostorConfig.count);

    const teams: Record<string, string> = {};
    impostors.forEach(player => teams[player] = "impostor");
    agents.forEach(player => teams[player] = "agent");

    // Select operations (use metadata from GAME_CONFIG, ensure only available ops are used)
    const baseAvailableOps = GAME_CONFIG.OPERATIONS.filter(op => op.name in OPERATION_CONFIG);
    // With exactly 5 players, exclude operations that change team associations
    const teamChangingOps = new Set(['defector', 'sleeper agent', 'spy transfer']);
    const availableOps = players.length === 5
        ? baseAvailableOps.filter(op => !teamChangingOps.has(op.name))
        : baseAvailableOps;
    const winConditionOpsSet = new Set(['grudge', 'infatuation', 'sleeper agent', 'sleeper', 'scapegoat', 'defector', 'spy transfer']);
    const winConditionOps = availableOps.filter(op => winConditionOpsSet.has(op.name));
    const otherOps = availableOps.filter(op => !winConditionOpsSet.has(op.name));

    // Cap of win-condition operations we want present this round based on player count
    const allowedOpsThisRound = players.length <= 6 ? 1 : (players.length <= 9 ? 2 : 3);

    // Shuffle operations and players for assignment variety
    const shuffle = <T,>(arr: T[]) => [...arr].sort(() => 0.5 - Math.random());
    const shuffledWinOps = shuffle(winConditionOps.length ? winConditionOps : availableOps); // fallback if none configured
    const shuffledOtherOps = shuffle(otherOps.length ? otherOps : availableOps);

    // Assign at least `allowedOpsThisRound` win-condition operations (repeating if needed)
    const assignedOpsByPlayer: Record<string, { name: string; hidden?: boolean; clientChooses?: boolean }> = {};
    const targetWinOpsCount = Math.min(allowedOpsThisRound, players.length);
    for (let i = 0; i < targetWinOpsCount; i++) {
        const p = shuffledPlayers[i % shuffledPlayers.length];
        const op = shuffledWinOps[i % shuffledWinOps.length];
        assignedOpsByPlayer[p] = op;
    }

    // Assign remaining players any operations (mix remaining win ops and others), allowing repeats
    for (const p of shuffledPlayers) {
        if (assignedOpsByPlayer[p]) continue;
        const idx = Object.keys(assignedOpsByPlayer).length; // progress-based index
        const pool = [...shuffledOtherOps, ...shuffledWinOps];
        const op = pool.length ? pool[idx % pool.length] : availableOps[idx % availableOps.length];
        assignedOpsByPlayer[p] = op;
    }

    const playerOperationsLocal = players.map((player) => ({
        player,
        operation: assignedOpsByPlayer[player]
    }));

    // Now write teams and assigned operation names into DB atomically
    await withTransaction(async (db) => {
        for (const player of players) {
            await db.run("UPDATE players SET team = ? WHERE username = ? AND lobby_id = ?", [teams[player], player, lobbyId]);
        }

        for (const { player, operation } of playerOperationsLocal) {
            if (operation) {
                await db.run("UPDATE players SET operation = ? WHERE username = ? AND lobby_id = ?", [operation.name, player, lobbyId]);
            }
        }
    });

    // Generate operation info and notify players (info is prepared server-side)
    const teamData = await db.all(`SELECT username, team FROM players WHERE lobby_id = ?`, [lobbyId]);
    const teamsMap: Record<string, string> = {};
    teamData.forEach(p => teamsMap[p.username] = p.team);

    await generateOperationInfo(lobbyId, players, teamsMap, io, getSocketIdByUsername);

    // Do not broadcast full teams to the room here. The caller (server.ts) will
    // handle per-player notifications and phased reveals.

    // Return the server-chosen operations with metadata so callers can use
    // `.name` and `.hidden` without re-querying the DB.
    return { playerOperations: playerOperationsLocal };
}


export async function endRound(
    lobbyId: string,
    roundResult: RoundResult,
    lobbies: Record<string, Lobby>, // Pass lobbies state
    io: Server // Pass io instance
): Promise<'game_end' | 'next_round' | false> {
    const db = getDB();
    // In single-round mode we treat any endRound as the end of the game.
    // Update lobby to waiting phase and clear player/vote/round state so no data persists between games.
    await db.run(`
        UPDATE lobbies 
        SET status = 'waiting', phase = ? , current_round = 0
        WHERE id = ?
    `, [GamePhase.WAITING, lobbyId]);

    if (lobbies[lobbyId]) {
        lobbies[lobbyId].status = 'waiting';
        lobbies[lobbyId].phase = GamePhase.WAITING;
        lobbies[lobbyId].current_round = 0;
    }

    // Immediately remove per-game data so nothing persists between games.
    try {
        const winConditionOps = new Set(['grudge', 'infatuation', 'sleeper agent', 'sleeper', 'scapegoat', 'defector', 'spy transfer']);
        await db.run("DELETE FROM players WHERE lobby_id = ?", [lobbyId]);
        await db.run("DELETE FROM rounds WHERE lobby_id = ?", [lobbyId]);
    } catch (err) {
        console.error(`Fehler beim Bereinigen der Lobbydaten für ${lobbyId}:`, err);
    }

    return 'game_end';
}

/**
 * Cleans up a completed lobby (removes from memory after delay)
 * @param lobbyId - Lobby ID to clean up
 */
export const scheduleLobbyCleanupp = (lobbyId: string, delayMs: number = 300000) => {
    // Clean up after 5 minutes
    setTimeout(async () => {
        try {
            const db = getDB();
            // Delete all associated data
            await db.run("DELETE FROM votes WHERE lobby_id = ?", [lobbyId]);
            await db.run("DELETE FROM players WHERE lobby_id = ?", [lobbyId]);
            await db.run("DELETE FROM rounds WHERE lobby_id = ?", [lobbyId]);
            await db.run("DELETE FROM lobbies WHERE id = ?", [lobbyId]);
            console.log(`Abgeschlossene Lobby ${lobbyId} bereinigt`);
        } catch (error) {
            console.error(`Fehler beim Bereinigen der Lobby ${lobbyId}:`, error);
        }
    }, delayMs);
};

/**
 * Saves a connection session to database for recovery
 * @param socketId - Socket ID
 * @param username - Player username
 * @param lobbyId - Lobby ID
 * @param lobbyCode - Lobby code
 */
export const saveConnectionSession = async (
    socketId: string,
    username: string,
    lobbyId: string,
    lobbyCode: string
): Promise<void> => {
    try {
        const db = getDB();
        await db.run(`
            INSERT OR REPLACE INTO connection_sessions (socket_id, username, lobby_id, lobby_code, last_heartbeat)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [socketId, username, lobbyId, lobbyCode]);
    } catch (error) {
        console.error("Fehler beim Speichern der Verbindungssitzung:", error);
    }
};

/**
 * Retrieves a saved connection session for recovery
 * @param username - Player username
 * @returns Connection session data or null
 */
export const getConnectionSession = async (username: string): Promise<any | null> => {
    try {
        const db = getDB();
        return await db.get(`
            SELECT * FROM connection_sessions 
            WHERE username = ? 
            ORDER BY last_heartbeat DESC LIMIT 1
        `, [username]);
    } catch (error) {
        console.error("Fehler beim Abrufen der Verbindungssitzung:", error);
        return null;
    }
};

/**
 * Removes a connection session
 * @param socketId - Socket ID to remove
 */
export const removeConnectionSession = async (socketId: string): Promise<void> => {
    try {
        const db = getDB();
        await db.run("DELETE FROM connection_sessions WHERE socket_id = ?", [socketId]);
    } catch (error) {
        console.error("Fehler beim Entfernen der Verbindungssitzung:", error);
    }
};

/**
 * Cleans up stale connection sessions (older than 1 hour)
 */
export const cleanupStaleConnections = async (): Promise<void> => {
    try {
        const db = getDB();
        await db.run(`
            DELETE FROM connection_sessions 
            WHERE datetime(last_heartbeat) < datetime('now', '-1 hour')
        `);
        console.log("Veraltete Verbindungen bereinigt");
    } catch (error) {
        console.error("Fehler beim Bereinigen veralteter Verbindungen:", error);
    }
};
