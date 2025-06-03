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

export const app: Application = express();
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: `${process.env.CLIENT_ORIGIN || 'http://localhost:5000'}`,
        methods: ["GET", "POST"],
        credentials: true
    }
});

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
app.post("/create-lobby", async (req: Request, res: Response) => {
    try {
        const { username } = req.body;
        const { lobbyId, lobbyCode } = await lobbyService.createLobby(username);
        
        // Fetch initial player list (just the creator)
        const playerRows = await getDB().all("SELECT username FROM players WHERE lobby_id = ?", [lobbyId]);
        io.to(lobbyId).emit("player-list", { players: playerRows }); // Emit to the specific lobby room

        res.json({ lobbyId, lobbyCode });
    } catch (error) {
        console.error("Error creating lobby:", error);
        res.status(500).json({ error: 'Failed to create lobby' });
    }
});


// More robust socket event handlers in the connection logic
io.on("connection", (socket: Socket) => {
    console.log("New client connected:", socket.id);

    // Removed local cleanupOldSocket function

    socket.on("rejoin-game", async ({ lobbyCode, username }) => {
    try {
        connectionManager.cleanupOldSocket(username, socket.id, io);
        const db = getDB(); 
        const lobby = await db.get("SELECT id FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
        
        if (!lobby) {
            socket.emit("error", { message: "Lobby not found" });
            return;
        }

        const gameState = await db.get("SELECT status, round, total_rounds FROM lobbies WHERE id = ?", [lobby.id]);
        const players = await db.all("SELECT username, team, operation FROM players WHERE lobby_id = ?", [lobby.id]);
        
        // CHANGE: Add lobbyCode parameter
        connectionManager.addConnection(socket.id, username, lobbyCode);
        socket.join(lobby.id);

        socket.emit("game-state", {
            currentState: gameState.status,
            round: gameState.round,
            totalRounds: gameState.total_rounds
        });

        socket.emit("player-list", { players });

        // Notify other players
        socket.to(lobby.id).emit("game-message", {
            type: "system",
            text: `${username} has reconnected`
        });
    } catch (error) {
        console.error("Error in rejoin-game:", error);
        socket.emit("error", { message: "Failed to rejoin game" });
    }
});

socket.on("join-lobby", async (data: { username: string; lobbyCode: string }, callback?: (response: any) => void) => {
    try {
        const { username, lobbyCode } = data;
        connectionManager.cleanupOldSocket(username, socket.id, io);
        
        const joinResult = await lobbyService.joinLobby(lobbyCode, username);

        if (!joinResult.success || !joinResult.lobbyId) {
            if (callback) callback({ success: false, error: joinResult.error });
            return;
        }

        const lobbyId = joinResult.lobbyId;
        // CHANGE: Add lobbyCode parameter to track which lobby the user is in
        connectionManager.addConnection(socket.id, username, lobbyCode);
        socket.join(lobbyId);
        
        io.to(lobbyId).emit("player-joined", { username, lobbyId });
        io.to(lobbyId).emit("player-list", { players: joinResult.players });
        
        if (callback) {
            callback({ 
                success: true,
                lobbyCode,
                players: joinResult.players 
            });
        }
        console.log(`Player ${username} joined lobby ${lobbyCode}`);

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
            const dbInstance = getDB(); // Keep for direct DB interactions not covered by services yet
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
            
            // Call gameService.startNewRound, which also sets phase to TEAM_ASSIGNMENT
            // The above query already sets the phase, so startNewRound will just repeat it, which is fine.
            // Or, modify startNewRound to not set phase if it's already set.
            // For now, assuming startNewRound is idempotent or its phase setting is acceptable.
            await gameService.startNewRound(lobbyId, 1, {}); // Pass empty object for lobbies if not used by startNewRound

            io.to(lobbyId).emit("game-started", { 
                message: "Game has started!",
                players: playersInLobby.map(p => p.username), // Send player usernames
                phase: GamePhase.TEAM_ASSIGNMENT
            });

            console.log("Starting team assignment phase...");
            const { impostors, agents, playerOperations } = await gameService.assignTeamsAndOperations(
                lobbyId, 
                playersInLobby.map(p => p.username), 
                io, 
                connectionManager.getSocketId // Pass the getter function
            );
            
            // Update lobby phase to OPERATION_ASSIGNMENT in DB
            await dbInstance.run(
                "UPDATE lobbies SET phase = ? WHERE id = ?",
                [GamePhase.OPERATION_ASSIGNMENT, lobbyId]
            );

            io.to(lobbyId).emit("team-assignment", {
                impostors,
                agents,
                phase: GamePhase.OPERATION_ASSIGNMENT
            });

            console.log("Teams assigned. Operation phase starting...");
            console.log("Starting operation assignment...");

            for (const { player, operation } of playerOperations) {
                if (operation) {
                    const playerSocketId = connectionManager.getSocketId(player); // Use connectionManager
                    if (playerSocketId) {
                        io.to(playerSocketId).emit("operation-assigned", {
                            operation: operation.name
                        });
                    }
                    console.log(`Assigned operation '${operation.name}' to ${player}`);
                }
            }

            console.log("Operation phase completed.");
            // Update lobby phase to VOTING in DB
            await dbInstance.run(
                "UPDATE lobbies SET phase = ? WHERE id = ?",
                [GamePhase.VOTING, lobbyId]
            );

            io.to(lobbyId).emit("phase-change", {
                phase: GamePhase.VOTING,
                message: "Operation phase completed. Voting phase begins!"
            });

            console.log("Voting phase has begun");

        } catch (error) {
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    });

    socket.on("use-confession", async ({ targetPlayer, lobbyId }) => {
        try {
            const db = getDB();
            const confessor = await db.get(
                "SELECT username, team FROM players WHERE lobby_id = ? AND operation = 'confession'",
                [lobbyId]
            );

            if (!confessor) {
                socket.emit("error", { message: "Invalid confession operation" });
                return;
            }

            // Update the target player's operation_info with the confession
            const confessionInfo = {
                type: "received_confession",
                fromPlayer: confessor.username,
                theirTeam: confessor.team
            };

            await db.run(
                "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
                [JSON.stringify(confessionInfo), lobbyId, targetPlayer]
            );

            // Mark the confession as used
            await db.run(
                "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
                [JSON.stringify({ confessionMade: true, targetPlayer }), lobbyId, confessor.username]
            );

            // Notify relevant players
            socket.to(targetPlayer).emit("confession-received", confessionInfo);
            socket.emit("operation-used", { success: true });

        } catch (error) {
            console.error("Error processing confession:", error);
            socket.emit("error", { message: "Failed to process confession" });
        }
    });

    socket.on("use-defector", async ({ targetPlayer, lobbyId }) => {
        try {
            const db = getDB();
            
            // Verify the player has the defector operation
            const defector = await db.get(
                "SELECT username FROM players WHERE lobby_id = ? AND operation = 'defector'",
                [lobbyId]
            );

            if (!defector) {
                socket.emit("error", { message: "Invalid defector operation" });
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

            // Record the vote (only do this once!)
            await dbInstance.run(
                "INSERT INTO votes (lobby_id, voter, target, round_number) VALUES (?, ?, ?, ?)", // Added round_number
                [lobbyId, username, vote, currentLobbyRound]
            );

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
        
        connectionManager.removeConnection(socket.id); 
        
        socket.leave(lobbyCode); 
        io.to(lobbyCode).emit("player-left", { username }); 

        if (leaveResult.lobbyClosed) {
            console.log(`Lobby ${lobbyCode} closed due to inactivity.`);
        }

    } catch (error) {
        console.error("Error leaving lobby:", error);
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
                // Assuming lobbyCode is used as the room identifier for socket.io
                io.to(lobbyCode).emit("player-list", { players: result.players }); 
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

export const startServer = async (port: number = parseInt(PORT.toString())) => {
  await initializeDatabase();
  return new Promise<void>((resolve) => {
    const portNumber = port;
    server.listen(portNumber, HOST, () => {
      console.log(`Server running on ${HOST}:${portNumber}`);
      resolve();
    });
  });
};

export const stopServer = () => {
  server.close();
};