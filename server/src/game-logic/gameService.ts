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
            return { isValid: false, error: "Lobby not found" };
        }
        if (lobby.phase !== 'voting') { // Direct use of GamePhase.VOTING might be better if available
            return { isValid: false, error: "Voting is not currently allowed" };
        }

        const voterPlayer = await db.get(`
            SELECT eliminated 
            FROM players 
            WHERE lobby_id = ? AND username = ?
        `, [lobbyId, voter]);
        if (!voterPlayer) {
            return { isValid: false, error: "Voter not found in lobby" };
        }
        if (voterPlayer.eliminated === 1) {
            return { isValid: false, error: "Eliminated players cannot vote" };
        }

        const targetPlayer = await db.get(`
            SELECT eliminated 
            FROM players 
            WHERE lobby_id = ? AND username = ?
        `, [lobbyId, target]);
        if (!targetPlayer) {
            return { isValid: false, error: "Target player not found in lobby" };
        }
        if (voter === target) {
            return { isValid: false, error: "You cannot vote for yourself" };
        }

        const existingVote = await db.get(`
            SELECT id 
            FROM votes 
            WHERE lobby_id = ? AND voter = ?
        `, [lobbyId, voter]);
        if (existingVote) {
            return { isValid: false, error: "You have already voted this round" };
        }
        if (targetPlayer.eliminated === 1) {
            return { isValid: false, error: "Cannot vote for an eliminated player" };
        }
        return { isValid: true };
    } catch (error) {
        console.error("Error validating vote:", error);
        return { isValid: false, error: "Internal server error during vote validation" };
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
                throw new Error("Vote already recorded for this player this round");
            }

            // Record the vote
            await db.run(`
                INSERT INTO votes (lobby_id, voter, target, round_number) 
                VALUES (?, ?, ?, ?)
            `, [lobbyId, voter, target, roundNumber]);
        });
        return true;
    } catch (error) {
        console.error("Error recording vote:", error);
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
    const playersWithOps = await db.all(`
        SELECT username, operation, operation_info 
        FROM players 
        WHERE lobby_id = ? AND operation IS NOT NULL
    `, [lobbyId]);

    for (const player of playersWithOps) {
        const operationDetails = OPERATION_CONFIG[player.operation];
        if (!operationDetails?.modifyWinCondition) continue;

        try {
            const allPlayersInLobby = await db.all(`
                SELECT username, team 
                FROM players 
                WHERE lobby_id = ?
            `, [lobbyId]);

            const teamsMap = allPlayersInLobby.reduce((acc, p) => {
                acc[p.username] = p.team;
                return acc;
            }, {} as Record<string, string>);

            await operationDetails.modifyWinCondition(
                lobbyId,
                allPlayersInLobby.map(p => p.username),
                roundResult.votes,
                teamsMap,
                db,
                roundResult // Pass the whole roundResult
            );
        } catch (error) {
            console.error(`Error processing operation ${player.operation} for player ${player.username}:`, error);
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

    let winner: 'agents' | 'impostors';
    if (!teamCounts['impostor'] || teamCounts['impostor'] === 0) {
        winner = 'agents';
    } else if (!teamCounts['agent'] || teamCounts['agent'] <= teamCounts['impostor']) {
        winner = 'impostors';
    } else {
        winner = 'agents';
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

    let overallWinner: 'agents' | 'impostors';
    if (!teamCounts['impostor'] || teamCounts['impostor'] === 0) {
        overallWinner = 'agents';
    } else if (!teamCounts['agent'] || teamCounts['agent'] <= teamCounts['impostor']) {
        overallWinner = 'impostors';
    } else {
        overallWinner = 'agents';
    }

    // Team scores: single round
    const teamScores = { agents: 0, impostors: 0 };
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
            if (generatedInfo.availablePlayers && Array.isArray(generatedInfo.availablePlayers) && config.fields && config.fields.length > 0) {
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
            console.error(`Error selecting targets for operation ${operationName} for ${player}:`, err);
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
            console.log(`Operation '${operationName}' with info sent to ${player} (${socketId})`);
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
    const availableOps = GAME_CONFIG.OPERATIONS.filter(op => op.name in OPERATION_CONFIG);
    const shuffledOperations = [...availableOps].sort(() => 0.5 - Math.random());

    const playerOperationsLocal = players.map((player, index) => ({
        player,
        operation: shuffledOperations[index % shuffledOperations.length]
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
        await db.run("DELETE FROM votes WHERE lobby_id = ?", [lobbyId]);
        await db.run("DELETE FROM players WHERE lobby_id = ?", [lobbyId]);
        await db.run("DELETE FROM rounds WHERE lobby_id = ?", [lobbyId]);
    } catch (err) {
        console.error(`Error cleaning up lobby data for ${lobbyId}:`, err);
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
            console.log(`Completed lobby ${lobbyId} cleaned up`);
        } catch (error) {
            console.error(`Error cleaning up lobby ${lobbyId}:`, error);
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
        console.error("Error saving connection session:", error);
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
        console.error("Error retrieving connection session:", error);
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
        console.error("Error removing connection session:", error);
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
        console.log("Stale connections cleaned up");
    } catch (error) {
        console.error("Error cleaning up stale connections:", error);
    }
};
