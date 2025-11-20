import express, { Application, Request, Response } from 'express';
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { initDB, getDB } from "./db/db";
import { GamePhase, RoundResult, FinalResults, VoteValidationResult, Lobby } from './game-logic/types'; // Assuming Lobby type might still be useful here, or move/duplicate to lobby-manager/types.ts
import { GAME_CONFIG, OPERATION_CONFIG } from './game-logic/config';
import * as gameService from './game-logic/gameService';
import * as lobbyService from './lobby-manager/lobbyService';
import * as connectionManager from './connectionManager';
import {
  validateUsername,
  validateLobbyCode,
  validateOperationNotUsed,
  validateVoteData,
  sanitizeOperation
} from './utils/validators';
import { generateLobbyToken, verifyLobbyToken } from './utils/auth';

export const app: Application = express();
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: `${process.env.CLIENT_ORIGIN || 'http://localhost:5000'}`,
        methods: ["GET", "POST"],
        credentials: true
    }
});
const playerOperationsByLobby: { [lobbyId: string]: any[] } = {};
let playerListRefreshInterval: NodeJS.Timeout | null = null;

// Initialize SQLite database
let dbInstance: any; // This might not be needed if all DB access goes through services. Kept for now.
// Removed userSockets and activeConnections maps

const initializeDatabase = async (useInMemory: boolean = false) => {
    try {
        dbInstance = await initDB(useInMemory);
        console.log("Database initialized with fresh tables");
    } catch (error) {
        console.error("Failed to initialize database:", error);
        process.exit(1); // Exit if database initialization fails
    }
};

// Middleware
app.use(express.json());

// Update CORS configuration to dynamically use CLIENT_ORIGIN from the environment variables
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5000",
    credentials: true,
}));

// More robust lobby creation
app.post("/create-lobby", async (req: Request, res: Response): Promise<void> => {
    try {
        const { username } = req.body;

        // Validate username format
        if (!validateUsername(username)) {
            res.status(400).json({ error: 'Invalid username. Must be 2-20 characters, alphanumeric and underscores only.' });
            return;
        }

        const { lobbyId, lobbyCode } = await lobbyService.createLobby(username);
        const accessToken = generateLobbyToken(lobbyId, username, lobbyCode);

        // Fetch initial player list (just the creator)
        const playerRows = await getDB().all("SELECT username FROM players WHERE lobby_id = ?", [lobbyId]);

        console.log(`[create-lobby] Created lobby ${lobbyCode} (${lobbyId}) with initial player:`, playerRows);
        // Note: The creator hasn't joined the socket room yet, so we can't emit to the room here
        // The client will need to join the lobby via socket after receiving the lobby code

        res.json({ lobbyId, lobbyCode, accessToken });
    } catch (error) {
        console.error("Error creating lobby:", error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create lobby';
        res.status(400).json({ error: errorMessage });
    }
});


// More robust socket event handlers in the connection logic
io.on("connection", (socket: Socket) => {
    console.log("New client connected:", socket.id);

    // Removed local cleanupOldSocket function

    socket.on("rejoin-game", async ({ lobbyCode, username, accessToken }) => {
    try {
        const db = getDB();
        const lobby = await db.get("SELECT id, phase, status, current_round, total_rounds FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
        
        if (!lobby) {
            socket.emit("error", { message: "Lobby not found" });
            return;
        }

        // Only allow rejoin if game is in progress (not in waiting phase)
        // If in waiting phase, player should use join-lobby instead
        if (lobby.phase === 'waiting' || lobby.status === 'waiting') {
            socket.emit("error", { message: "Cannot rejoin: Game has not started yet. Please use 'join-lobby' to join the lobby." });
            return;
        }

        // Verify player still exists in database (they should if game is in progress)
        const player = await db.get(
            "SELECT id, team, operation, operation_info FROM players WHERE username = ? AND lobby_id = ?",
            [username, lobby.id]
        );

        if (!player) {
            socket.emit("error", { message: "You are no longer in this game. Cannot rejoin." });
            return;
        }

        // Access token is optional - if provided, verify it; if not, allow rejoin based on username/lobbyCode match
        // This allows players to reconnect without needing to store the access token
        if (accessToken) {
            if (!verifyLobbyToken(accessToken, lobby.id, username)) {
                socket.emit("error", { message: "Unauthorized: Invalid or expired access token" });
                return;
            }
        }

        connectionManager.cleanupOldSocket(username, socket.id, io);
        
        // Get all players with their teams
        const players = await db.all("SELECT username, team, operation, eliminated FROM players WHERE lobby_id = ?", [lobby.id]);
        
        // Add connection and join socket room
        connectionManager.addConnection(socket.id, username, lobbyCode);
        socket.join(lobby.id);
        
        // Persist connection session for recovery
        await gameService.saveConnectionSession(socket.id, username, lobby.id, lobbyCode);

        // Send complete game state
        socket.emit("game-state", {
            phase: lobby.phase,
            currentState: lobby.status,
            round: lobby.current_round,
            totalRounds: lobby.total_rounds
        });

        // Send player list with teams
        socket.emit("player-list", { players });

        // Send team assignment to the reconnecting player
        if (player.team) {
            // Get all players grouped by team for the team-assignment event
            const impostors = players.filter(p => p.team === 'impostor').map(p => p.username);
            const agents = players.filter(p => p.team === 'agent').map(p => p.username);
            
            socket.emit("team-assignment", { 
                impostors,
                agents,
                phase: lobby.phase
            });
            socket.emit("your-team", {
                team: player.team,
                message: `You are a ${player.team === 'impostor' ? 'virus agent' : 'service agent'}!`
            });
        }

        // Send operation assignment if player has one
        if (player.operation) {
            socket.emit("operation-assigned", { 
                operation: player.operation 
            });
            
            // Send operation info if available
            if (player.operation_info) {
                try {
                    const operationInfo = JSON.parse(player.operation_info);
                    socket.emit("operation-prepared", {
                        operation: player.operation,
                        info: operationInfo
                    });
                } catch (parseError) {
                    console.error(`Error parsing operation_info for ${username}:`, parseError);
                }
            }
        }

        // Send current phase change notification
        socket.emit("phase-change", {
            phase: lobby.phase,
            message: `Current phase: ${lobby.phase}`
        });

        // Notify other players
        io.to(lobby.id).emit("game-message", {
            type: "system",
            text: `${username} has reconnected`
        });

        console.log(`Player ${username} rejoined game in lobby ${lobbyCode}`);
    } catch (error) {
        console.error("Error in rejoin-game:", error);
        socket.emit("error", { message: "Failed to rejoin game" });
    }
});

socket.on("join-lobby", async (data: { username: string; lobbyCode: string }, callback?: (response: any) => void) => {
    try {
        const { username, lobbyCode } = data;

        // Validate username and lobby code formats
        if (!validateUsername(username)) {
            if (callback) callback({ success: false, error: 'Invalid username. Must be 2-20 characters, alphanumeric and underscores only.' });
            return;
        }

        if (!validateLobbyCode(lobbyCode)) {
            if (callback) callback({ success: false, error: 'Invalid lobby code format. Must be 6 alphanumeric characters.' });
            return;
        }

        // Normalize lobby code to uppercase
        const normalizedLobbyCode = lobbyCode.trim().toUpperCase();
        console.log(`[join-lobby] Received join request for lobby: ${lobbyCode} (normalized: ${normalizedLobbyCode}) from user: ${username}`);

        connectionManager.cleanupOldSocket(username, socket.id, io);
        
        const db = getDB();
        const lobby = await lobbyService.getLobby(normalizedLobbyCode);
        
        if (!lobby) {
            console.error(`[join-lobby] Lobby not found: ${normalizedLobbyCode} (original: ${lobbyCode})`);
            if (callback) callback({ success: false, error: 'Lobby does not exist' });
            return;
        }
        
        console.log(`[join-lobby] Found lobby: ${lobby.id} with code: ${lobby.lobbyCode}`);
        
        const lobbyId = lobby.id;
        
        // Check if player already exists in the lobby
        const existingPlayer = await db.get(
            "SELECT username FROM players WHERE username = ? AND lobby_id = ?",
            [username, lobbyId]
        );
        
        let players;
        let isNewJoin = false;
        
        if (existingPlayer) {
            // Player already in lobby - just join the socket room (reconnection scenario)
            console.log(`[join-lobby] Player ${username} already in lobby ${normalizedLobbyCode}, joining socket room only`);
            const playersResult = await lobbyService.getLobbyPlayers(normalizedLobbyCode);
            players = playersResult.players || [];
        } else {
            // New player joining - add to database
            const joinResult = await lobbyService.joinLobby(normalizedLobbyCode, username);
            
            if (!joinResult.success || !joinResult.lobbyId) {
                if (callback) callback({ success: false, error: joinResult.error });
                return;
            }
            
            players = joinResult.players || [];
            isNewJoin = true;
        }
        
        // Add connection and join socket room (for both new and existing players)
        connectionManager.addConnection(socket.id, username, normalizedLobbyCode);
        socket.join(lobbyId);
        
        // Persist connection session for reconnection recovery
        await gameService.saveConnectionSession(socket.id, username, lobbyId, normalizedLobbyCode);
        
        // Emit player-joined notification only for new joins
        if (isNewJoin) {
            io.to(lobbyId).emit("player-joined", { username, lobbyId });
        }
        
        // Emit updated player list to all players in lobby (including the joining/reconnecting player)
        console.log(`[join-lobby] Emitting player-list to lobby ${lobbyId} with ${players?.length || 0} players:`, players);
        io.to(lobbyId).emit("player-list", { players });
        
        // Also send directly to the joining socket to ensure they receive it
        socket.emit("player-list", { players });
        
        // Emit complete lobby state (including game phase and round info)
        if (lobby) {
            io.to(lobbyId).emit("lobby-state", {
                lobbyId: lobby.id,
                lobbyCode: lobby.lobbyCode || normalizedLobbyCode,
                status: lobby.status,
                currentRound: lobby.current_round,
                totalRounds: lobby.total_rounds,
                players: players,
                updatedAt: new Date().toISOString()
            });
        }
        
        if (callback) {
            callback({ 
                success: true,
                lobbyCode: normalizedLobbyCode,
                players: players 
            });
        }
        console.log(`Player ${username} ${isNewJoin ? 'joined' : 'reconnected to'} lobby ${normalizedLobbyCode}`);

    } catch (error) {
        console.error("Error joining lobby:", error);
        if (callback) {
            callback({ 
                success: false, 
                error: error instanceof Error ? error.message : "Unknown error" 
            });
        }
    }
});

    // Handle game start logic
    socket.on("start-game", async ({ lobbyCode, rounds = 3 }) => {
        try {
            const dbInstance = getDB();
            const lobby = await lobbyService.getLobby(lobbyCode);

            if (!lobby) {
                throw new Error("Lobby does not exist");
            }
            const lobbyId = lobby.id;

            if (lobby.status !== 'waiting') {
                throw new Error("Game has already started");
            }
            
            // Get player count from DB
            const playersInLobby = await dbInstance.all("SELECT username FROM players WHERE lobby_id = ?", [lobbyId]);
            if (playersInLobby.length < GAME_CONFIG.MIN_PLAYERS) {
                throw new Error(`Not enough players. Minimum required: ${GAME_CONFIG.MIN_PLAYERS}`);
            }

            // Update lobby status and phase in DB
            await dbInstance.run(`
                UPDATE lobbies 
                SET total_rounds = ?, current_round = 1, status = 'playing', phase = ?
                WHERE id = ?
            `, [rounds, GamePhase.TEAM_ASSIGNMENT, lobbyId]);
            
            await gameService.startNewRound(lobbyId, 1, {});

            io.to(lobbyId).emit("game-started", { 
                message: "Game has started!",
                players: playersInLobby.map(p => p.username),
                phase: GamePhase.TEAM_ASSIGNMENT
            });

            // Send each player their team/association
            const allPlayers = await dbInstance.all(
                "SELECT username, team FROM players WHERE lobby_id = ?",
                [lobbyId]
            );
            for (const player of allPlayers) {
                const playerSocketId = connectionManager.getSocketId(player.username);
                if (playerSocketId) {
                    io.to(playerSocketId).emit("your-team", {
                        team: player.team,
                        message: `You are a ${player.team === 'impostor' ? 'virus agent' : 'service agent'}!`
                    });
                }
            }

            // Assign teams and operations
            const assignResult = await gameService.assignTeamsAndOperations(
                lobbyId,
                playersInLobby.map(p => p.username),
                io,
                connectionManager.getSocketId
            );

            // Store for later use in accept-assignment
            const playerOperations = assignResult.playerOperations;
            playerOperationsByLobby[lobbyId] = playerOperations;

            // Update lobby phase to OPERATION_ASSIGNMENT
            await dbInstance.run(
                "UPDATE lobbies SET phase = ? WHERE id = ?",
                [GamePhase.OPERATION_ASSIGNMENT, lobbyId]
            );

            // Send operation only to the first player in order
            if (playerOperations.length > 0) {
                const { player, operation } = playerOperations[0];
                if (operation) {
                    const playerSocketId = connectionManager.getSocketId(player);
                    if (playerSocketId) {
                        io.to(playerSocketId).emit("operation-assigned", { operation: operation.name });
                        await dbInstance.run(
                            "UPDATE players SET operation_assigned = 1 WHERE lobby_id = ? AND username = ?",
                            [lobbyId, player]
                        );
                    }
                }
            }

            // Do NOT send operations to all players here!
            // The rest will be handled by the accept-assignment event

        } catch (error) {
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    });

    socket.on("accept-assignment", async ({ lobbyId, username }) => {
    await dbInstance.run(
        "UPDATE players SET operation_accepted = 1 WHERE lobby_id = ? AND username = ?",
        [lobbyId, username]
    );

    // Find next player who hasn't accepted
    const nextPlayerRow = await dbInstance.get(
        "SELECT username FROM players WHERE lobby_id = ? AND operation_accepted = 0 ORDER BY id ASC",
        [lobbyId]
    );
    if (nextPlayerRow) {
        const opObj = playerOperationsByLobby[lobbyId]?.find(po => po.player === nextPlayerRow.username);
        if (opObj && opObj.operation) {
            const playerSocketId = connectionManager.getSocketId(nextPlayerRow.username);
            if (playerSocketId) {
                io.to(playerSocketId).emit("operation-assigned", { operation: opObj.operation.name });
                await dbInstance.run(
                    "UPDATE players SET operation_assigned = 1 WHERE lobby_id = ? AND username = ?",
                    [lobbyId, nextPlayerRow.username]
                );
            }
        }
    } else {
        // All players have accepted, move to voting phase
        await dbInstance.run(
            "UPDATE lobbies SET phase = ? WHERE id = ?",
            [GamePhase.VOTING, lobbyId]
        );
        io.to(lobbyId).emit("phase-change", {
            phase: GamePhase.VOTING,
            message: "All assignments complete. Voting phase begins!"
        });
    }
});

    socket.on("use-confession", async ({ targetPlayer, lobbyId }) => {
        try {
            const db = getDB();

            // Validate vote data (includes targetPlayer existence check)
            if (!validateVoteData(socket.handshake.auth?.username || "", targetPlayer)) {
                socket.emit("error", { message: "Invalid confession target" });
                return;
            }

            const confessor = await db.get(
                "SELECT username, team FROM players WHERE lobby_id = ? AND operation = 'confession'",
                [lobbyId]
            );

            if (!confessor) {
                socket.emit("error", { message: "Invalid confession operation" });
                return;
            }

            // Check if confession operation has already been used
            const confessionUsed = await db.get(
                "SELECT operation_accepted FROM players WHERE lobby_id = ? AND operation = 'confession'",
                [lobbyId]
            );

            if (confessionUsed && !validateOperationNotUsed(confessionUsed.operation_accepted)) {
                socket.emit("error", { message: "Confession operation has already been used" });
                return;
            }

            // Update the target player's operation_info with the confession
            const confessionInfo = sanitizeOperation({
                type: "received_confession",
                fromPlayer: confessor.username,
                theirTeam: confessor.team
            });

            await db.run(
                "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
                [JSON.stringify(confessionInfo), lobbyId, targetPlayer]
            );

            // Mark the confession as used
            await db.run(
                "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
                [JSON.stringify({ confessionMade: true, targetPlayer }), lobbyId, confessor.username]
            );

            // Get the socket ID for the target player and notify them
            const targetSocketId = connectionManager.getSocketId(targetPlayer);
            if (targetSocketId) {
                io.to(targetSocketId).emit("confession-received", confessionInfo);
            } else {
                console.warn(`Target player ${targetPlayer} not connected`);
            }

            socket.emit("operation-used", { success: true });

        } catch (error) {
            console.error("Error processing confession:", error);
            socket.emit("error", { message: "Failed to process confession" });
        }
    });

    socket.on("use-defector", async ({ targetPlayer, lobbyId }) => {
        try {
            const db = getDB();

            // Validate vote data
            if (!validateVoteData(socket.handshake.auth?.username || "", targetPlayer)) {
                socket.emit("error", { message: "Invalid defector target" });
                return;
            }
            
            // Verify the player has the defector operation
            const defector = await db.get(
                "SELECT username, operation_accepted FROM players WHERE lobby_id = ? AND operation = 'defector'",
                [lobbyId]
            );

            if (!defector) {
                socket.emit("error", { message: "Invalid defector operation" });
                return;
            }

            // Check if defector operation has already been used
            if (defector.operation_accepted && !validateOperationNotUsed(defector.operation_accepted)) {
                socket.emit("error", { message: "Defector operation has already been used" });
                return;
            }

            // Verify the target player exists
            const targetExists = await db.get(
                "SELECT username FROM players WHERE lobby_id = ? AND username = ?",
                [lobbyId, targetPlayer]
            );

            if (!targetExists) {
                socket.emit("error", { message: "Target player not found" });
                return;
            }

            // Store the target player choice in operation_info
            await db.run(
                "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
                [JSON.stringify({ targetPlayer, teamChanged: false }), lobbyId, defector.username]
            );

            // Notify the defector that their choice was recorded
            socket.emit("operation-used", { 
                success: true,
                message: `You've chosen ${targetPlayer} as your target. Their team will be switched during the next phase.`
            });

        } catch (error) {
            console.error("Error processing defector operation:", error);
            socket.emit("error", { message: "Failed to process defector operation" });
        }
    });

    socket.on("submit-vote", async ({ lobbyCode, username, vote }) => {
        try {
            // Validate lobby code format
            if (!validateLobbyCode(lobbyCode)) {
                socket.emit("error", { message: "Invalid lobby code format" });
                return;
            }

            // Validate vote data
            if (!validateVoteData(username, vote)) {
                socket.emit("error", { message: "Invalid vote: voter and target must be different valid players" });
                return;
            }

            const dbInstance = getDB(); // Keep for direct DB interactions not covered by services yet
            const lobby = await lobbyService.getLobby(lobbyCode);

            if (!lobby || !lobby.id) { // Ensure lobby and lobby.id are valid
                throw new Error("Lobby does not exist or has no ID");
            }
            const lobbyId = lobby.id;

            const validation = await gameService.validateVote(lobbyId, username, vote);

            if (!validation.isValid) {
                socket.emit("error", { message: validation.error });
                return;
            }

            if (lobby.phase !== GamePhase.VOTING) {
                throw new Error("Voting is not currently allowed - not in voting phase");
            }

            const currentLobbyRound = lobby.current_round; // Directly use current_round from fetched lobby
            if (currentLobbyRound === null || currentLobbyRound === undefined) { // Check for null or undefined
                throw new Error("Could not determine current round for voting.");
            }

            // Record the vote using transaction-wrapped function to prevent race conditions
            const voteRecorded = await gameService.recordVote(lobbyId, username, vote, currentLobbyRound);
            if (!voteRecorded) {
                socket.emit("error", { message: "Failed to record vote" });
                return;
            }

            // Notify clients about the vote
            socket.emit("vote-submitted", { username, vote });
            socket.to(lobbyId).emit("player-voted", { username });

            // Check if all active players have voted
            const [activePlayers, submittedVotes] = await Promise.all([
                dbInstance.all(`
                SELECT COUNT(*) as count 
                FROM players 
                WHERE lobby_id = ? AND eliminated = 0
            `, [lobbyId]),
                dbInstance.all(`
                SELECT COUNT(*) as count 
                FROM votes 
                WHERE lobby_id = ? AND round_number = ?
            `, [lobbyId, currentLobbyRound]) // Ensure round_number is used here
            ]);

            // If all players have voted, trigger results calculation
            if (activePlayers[0].count === submittedVotes[0].count) {
                const roundResult = await gameService.calculateRoundResults(lobbyId); // This line is already correct.
                io.to(lobbyId).emit("voting-complete", roundResult);

                // End round and get next action
                // Pass an empty object for the 'lobbies' parameter as it's no longer used by endRound
                const nextAction = await gameService.endRound(lobbyId, roundResult, {}, io); 

                // Update lobby data for next steps
                const updatedLobby = await lobbyService.getLobbyById(lobbyId); // Fetch updated lobby data

                if (nextAction === 'game_end') {
                    // Emit final game results
                    io.to(lobbyId).emit("game-end", await gameService.calculateFinalResults(lobbyId));
                } else if (nextAction === 'next_round' && updatedLobby) { // ensure updatedLobby is not null
                    // Emit round results and start next round
                    io.to(lobbyId).emit("round-end", roundResult);
                    // Use the current_round from the database, which was updated by startNewRound
                    io.to(lobbyId).emit("round-start", {
                        roundNumber: lobby.current_round
                    });
                }
            }
        } catch (error) {
            console.error("Error processing vote:", error);
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    });
    socket.on("leave-lobby", async ({ lobbyCode, username }) => {
    try {
        const leaveResult = await lobbyService.leaveLobby(lobbyCode, username);

        if (!leaveResult.success) {
            throw new Error(leaveResult.error || "Failed to leave lobby");
        }

        // Get the lobby ID to properly emit to the correct room
        const lobby = await lobbyService.getLobby(lobbyCode);
        
        connectionManager.removeConnection(socket.id); 
        
        socket.leave(lobbyCode);
        
        // Emit to the lobby by ID, not code
        if (lobby && lobby.id) {
            io.to(lobby.id).emit("player-left", { username });
            
            // If lobby still exists (not closed), emit updated player list to remaining players
            if (!leaveResult.lobbyClosed) {
                const playersResult = await lobbyService.getLobbyPlayers(lobbyCode);
                if (playersResult.success && playersResult.players) {
                    io.to(lobby.id).emit("player-list", { players: playersResult.players });
                }
            }
        }

        if (leaveResult.lobbyClosed) {
            console.log(`Lobby ${lobbyCode} closed due to inactivity.`);
        }

    } catch (error) {
        console.error("Error leaving lobby:", error);
        socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
    }
});

    socket.on("return-to-lobby", async ({ lobbyCode, username }) => {
        try {
            const db = getDB();
            
            // Get the lobby
            const lobby = await lobbyService.getLobby(lobbyCode);
            if (!lobby) {
                socket.emit("error", { message: "Lobby not found" });
                return;
            }

            // Reset lobby to waiting phase for a new round
            await db.run(
                "UPDATE lobbies SET status = 'waiting', phase = ? WHERE id = ?",
                [GamePhase.WAITING, lobby.id]
            );

            // Reset all players' operation and round-specific data
            await db.run(
                `UPDATE players SET 
                    operation_assigned = 0, 
                    operation_accepted = 0, 
                    eliminated = 0, 
                    win_status = NULL
                    WHERE lobby_id = ?`,
                [lobby.id]
            );

            // Clear votes for this lobby
            await db.run("DELETE FROM votes WHERE lobby_id = ?", [lobby.id]);
            
            // Clear rounds for this lobby
            await db.run("DELETE FROM rounds WHERE lobby_id = ?", [lobby.id]);

            // Emit lobby-state to all players
            const playersResult = await lobbyService.getLobbyPlayers(lobbyCode);
            if (playersResult.success && playersResult.players) {
                io.to(lobby.id).emit("lobby-state", {
                    lobbyId: lobby.id,
                    lobbyCode: lobby.lobbyCode,
                    status: 'waiting',
                    phase: GamePhase.WAITING,
                    players: playersResult.players,
                    updatedAt: new Date().toISOString()
                });
                io.to(lobby.id).emit("player-list", { players: playersResult.players });
            }

            console.log(`Lobby ${lobbyCode} reset to waiting phase`);

        } catch (error) {
            console.error("Error returning to lobby:", error);
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    });

    socket.on("disconnect", async () => {
        const username = connectionManager.getUsername(socket.id);
        console.log(`Socket ${socket.id} for user ${username} disconnected`);
        
        // Use the new handleDisconnect function for automatic cleanup
        await connectionManager.handleDisconnect(socket.id, io);
    });


    socket.on("get-lobby-players", async ({ lobbyCode }, callback) => {
        try {
            const result = await lobbyService.getLobbyPlayers(lobbyCode);
            if (result.success && result.players) { // Ensure players array is not undefined
                // Get the lobby ID to emit to the correct room
                const lobby = await lobbyService.getLobby(lobbyCode);
                if (lobby && lobby.id) {
                    io.to(lobby.id).emit("player-list", { players: result.players });
                }
                if (callback) callback({ success: true, players: result.players });
            } else {
                if (callback) callback({ success: false, error: result.error || "Could not retrieve players" });
            }
        } catch (error) {
            console.error("Error retrieving lobby players:", error);
            if (callback) {
                callback({ 
                    success: false, 
                    error: error instanceof Error ? error.message : "Unknown error" 
                });
            }
        }
    });
});

// Update the server to use Render's dynamic port and host settings
const PORT = process.env.PORT || 5001;
const HOST = process.env.SERVER_HOST || '0.0.0.0';

/**
 * Periodically refreshes player lists for all active lobbies in waiting phase
 * This ensures all clients have up-to-date player lists even if events are missed
 */
const startPlayerListRefresh = () => {
  // Refresh every 3 seconds (small delay as requested)
  const REFRESH_INTERVAL_MS = 3000;
  
  playerListRefreshInterval = setInterval(async () => {
    try {
      const db = getDB();
      
      // Get all active lobbies in waiting phase
      const activeLobbies = await db.all(
        "SELECT id, lobby_code FROM lobbies WHERE status = 'waiting' AND phase = 'waiting'"
      );
      
      // For each active lobby, refresh the player list
      for (const lobby of activeLobbies) {
        try {
          const playersResult = await lobbyService.getLobbyPlayers(lobby.lobby_code);
          
          if (playersResult.success && playersResult.players) {
            // Check if there are any sockets in this lobby room
            const socketsInRoom = await io.in(lobby.id).fetchSockets();
            
            if (socketsInRoom.length > 0) {
              // Broadcast updated player list to all players in this lobby
              io.to(lobby.id).emit("player-list", { players: playersResult.players });
            }
          }
        } catch (lobbyError) {
          console.error(`Error refreshing player list for lobby ${lobby.lobby_code}:`, lobbyError);
        }
      }
    } catch (error) {
      console.error("Error in player list refresh cycle:", error);
    }
  }, REFRESH_INTERVAL_MS);
  
  console.log(`Player list auto-refresh started (interval: ${REFRESH_INTERVAL_MS}ms)`);
};

export const startServer = async (port: number = parseInt(PORT.toString())) => {
  await initializeDatabase();
  
  // Clean up any stale connection sessions on startup
  try {
    await gameService.cleanupStaleConnections();
    console.log("Cleaned up stale connection sessions from previous sessions");
  } catch (error) {
    console.error("Error cleaning up stale connections on startup:", error);
  }
  
  return new Promise<void>((resolve) => {
    const portNumber = port;
    server.listen(portNumber, HOST, () => {
      console.log(`Server running on ${HOST}:${portNumber}`);
      
      // Start the periodic player list refresh
      startPlayerListRefresh();
      
      resolve();
    });
  });
};

export const stopServer = () => {
  // Clear the player list refresh interval
  if (playerListRefreshInterval) {
    clearInterval(playerListRefreshInterval);
    playerListRefreshInterval = null;
    console.log("Player list auto-refresh stopped");
  }
  
  server.close();
};