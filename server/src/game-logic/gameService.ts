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
    await db.run("DELETE FROM votes WHERE lobby_id = ?", [lobbyId]);
    await db.run(`
        UPDATE players
        SET eliminated = 0
        WHERE lobby_id = ?
    `, [lobbyId]);
    await db.run(`
        UPDATE lobbies
        SET phase = ?, current_round = ?
        WHERE id = ?
    `, [GamePhase.TEAM_ASSIGNMENT, roundNumber, lobbyId]); // Using GamePhase from types
    await db.run(`
        INSERT INTO rounds (lobby_id, round_number, completed)
        VALUES (?, ?, 0)
    `, [lobbyId, roundNumber]);

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
    const players = await db.all(`SELECT username, team FROM players WHERE lobby_id = ? AND eliminated = 0`, [lobbyId]);
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

    // Use transaction for atomic elimination updates
    await withTransaction(async (db) => {
        for (const player of eliminatedPlayers) {
            await db.run(`UPDATE players SET eliminated = 1 WHERE lobby_id = ? AND username = ?`, [lobbyId, player]);
        }
    });

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

    await db.run(`UPDATE rounds SET winner = ?, completed = 1 WHERE lobby_id = ? AND round_number = ?`, [winner, lobbyId, lobby.current_round]);
    return currentRoundResult;
}

export async function calculateFinalResults(lobbyId: string): Promise<FinalResults> {
    const db = getDB();
    const rounds = await db.all(`SELECT round_number, winner FROM rounds WHERE lobby_id = ? ORDER BY round_number`, [lobbyId]);
    const teamScores = { agents: 0, impostors: 0 };
    rounds.forEach(round => {
        if (round.winner === 'agents') teamScores.agents++;
        if (round.winner === 'impostors') teamScores.impostors++;
    });

    const players = await db.all(`
        SELECT p.username, p.team, p.operation, p.win_status,
               (SELECT COUNT(*) FROM votes v WHERE v.target = p.username AND v.lobby_id = p.lobby_id) as times_voted_out,
               (SELECT COUNT(*) FROM rounds r WHERE r.lobby_id = p.lobby_id AND r.winner = p.team) as rounds_won
        FROM players p
        WHERE p.lobby_id = ?
        GROUP BY p.username
    `, [lobbyId]);
    
    const mvp = players.reduce((prev, current) => {
        const prevScore = (prev.rounds_won || 0) - (prev.times_voted_out || 0);
        const currentScore = (current.rounds_won || 0) - (current.times_voted_out || 0);
        return currentScore > prevScore ? current : prev;
    }, players[0] || {username: "N/A"}).username;


    const roundResults = await Promise.all(rounds.map(async (round): Promise<RoundResult> => {
        const votes = await db.all(`SELECT voter, target FROM votes WHERE lobby_id = ? AND round_number = ?`, [lobbyId, round.round_number]);
        // This part for eliminatedPlayers per round needs historical data not currently stored.
        // For now, it will reflect players eliminated by the end of that specific round if we had such data.
        // As a placeholder, we'll use a simplified version. A more accurate system would snapshot eliminations per round.
        const eliminatedInRound = await db.all(`
            SELECT DISTINCT v.target 
            FROM votes v
            JOIN (
                SELECT target, MAX(COUNT_val) as max_votes_in_round
                FROM (
                    SELECT target, COUNT(*) as COUNT_val
                    FROM votes
                    WHERE lobby_id = ? AND round_number = ?
                    GROUP BY target
                )
                GROUP BY target
                HAVING COUNT_val = (SELECT MAX(c) FROM (SELECT COUNT(*) as c FROM votes WHERE lobby_id = ? AND round_number = ? GROUP BY target))
            ) AS max_vote_targets ON v.target = max_vote_targets.target
            WHERE v.lobby_id = ? AND v.round_number = ?;
        `, [lobbyId, round.round_number, lobbyId, round.round_number, lobbyId, round.round_number]);

        return {
            winner: round.winner as 'agents' | 'impostors',
            eliminatedPlayers: eliminatedInRound.map(p => p.target),
            votes: votes.reduce((acc, vote) => { acc[vote.voter] = vote.target; return acc; }, {} as Record<string, string>),
            roundNumber: round.round_number
        };
    }));

    return {
        overallWinner: teamScores.agents > teamScores.impostors ? 'agents' : 'impostors',
        roundResults,
        mvp,
        totalRounds: rounds.length,
        teamScores,
        players: players.map(p => ({
            username: p.username,
            team: p.team as 'agent' | 'impostor',
            winStatus: (p.win_status as 'win' | 'lose') || 'lose',
            operation: p.operation
        }))
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

        const generatedInfo = config.generateInfo(players, teams, player);
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
            console.warn(`Socket ID for player ${player} not found when sending operation info.`);
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

    // Use transaction for atomic team and operation assignment
    await withTransaction(async (db) => {
        const shuffledPlayers = [...players].sort(() => 0.5 - Math.random());
        const impostors = shuffledPlayers.slice(0, impostorConfig.count);
        const agents = shuffledPlayers.slice(impostorConfig.count);

        const teams: Record<string, string> = {};
        impostors.forEach(player => teams[player] = "impostor");
        agents.forEach(player => teams[player] = "agent");

        // Assign teams atomically
        for (const player of players) {
            await db.run("UPDATE players SET team = ? WHERE username = ? AND lobby_id = ?", [teams[player], player, lobbyId]);
        }

        // Assign operations atomically
        const shuffledOperations = GAME_CONFIG.OPERATIONS
            .filter(op => op.name in OPERATION_CONFIG)
            .sort(() => 0.5 - Math.random());

        const playerOperations = players.map((player, index) => ({
            player,
            operation: shuffledOperations[index % shuffledOperations.length]
        }));

        for (const { player, operation } of playerOperations) {
            if (operation) {
                 await db.run("UPDATE players SET operation = ? WHERE username = ? AND lobby_id = ?", [operation.name, player, lobbyId]);
            }
        }
    });

    // Generate operation info and notify players (outside transaction)
    const teamData = await db.all(`SELECT username, team FROM players WHERE lobby_id = ?`, [lobbyId]);
    const teams: Record<string, string> = {};
    teamData.forEach(p => teams[p.username] = p.team);
    
    await generateOperationInfo(lobbyId, players, teams, io, getSocketIdByUsername);

    io.to(lobbyId).emit("team-assignment", {
        teams,
        phase: GamePhase.OPERATION_ASSIGNMENT,
        requiresAcknowledgment: true
    });

    // Return player operations for logging
    const playerOperations = players.map(async (player) => {
        const op = await db.get("SELECT operation FROM players WHERE username = ? AND lobby_id = ?", [player, lobbyId]);
        return { player, operation: op?.operation };
    });

    return { playerOperations: await Promise.all(playerOperations) };
}


export async function endRound(
    lobbyId: string,
    roundResult: RoundResult,
    lobbies: Record<string, Lobby>, // Pass lobbies state
    io: Server // Pass io instance
): Promise<'game_end' | 'next_round' | false> {
    const db = getDB();
    await db.run(`
        UPDATE rounds 
        SET winner = ?, completed = 1 
        WHERE lobby_id = ? AND round_number = (SELECT current_round FROM lobbies WHERE id = ?)
    `, [roundResult.winner, lobbyId, lobbyId]);

    const lobbyInfo = await db.get(`
        SELECT current_round, total_rounds 
        FROM lobbies 
        WHERE id = ?
    `, [lobbyId]);

    if (!lobbyInfo) return false;

    if (lobbyInfo.current_round >= lobbyInfo.total_rounds) {
        await db.run(`
            UPDATE lobbies 
            SET status = 'completed', phase = 'completed' 
            WHERE id = ?
        `, [lobbyId]);
        // Update in-memory lobby if it exists
        if (lobbies[lobbyId]) {
            lobbies[lobbyId].status = 'completed';
            lobbies[lobbyId].phase = GamePhase.WAITING; // Or a new 'completed' phase
        }
        
        // Schedule cleanup of completed lobby
        scheduleLobbyCleanupp(lobbyId);
        
        return 'game_end';
    }

    // Start next round - ensure lobbies object is passed if startNewRound needs it
    await startNewRound(lobbyId, lobbyInfo.current_round + 1, lobbies); 
    return 'next_round';
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
