import express, { Application, Request, Response, NextFunction } from 'express';
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { initDB, getDB } from "./db/db";

// Define types for better type safety
// Add GamePhase enum to track game stages
enum GamePhase {
  WAITING = 'waiting',
  TEAM_ASSIGNMENT = 'team_assignment',
  OPERATION_ASSIGNMENT = 'operation_assignment',
  VOTING = 'voting',
  COMPLETED = 'completed'
}

interface Lobby {
    lobbyCode: string;
    players: string[];
    status: 'waiting' | 'playing' | 'completed';
    phase: GamePhase; // Add phase tracking
}

export const app: Application = express();
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: `${process.env.CLIENT_ORIGIN || 'http://localhost:5000'}`,
        methods: ["GET", "POST"],
        credentials: true
    }
});

const lobbies: Record<string, Lobby> = {};
const userSockets: Record<string, string> = {}; // Speichert die Zuordnung von Username zu Socket-ID

// Add a map to track active connections
const activeConnections = new Map<string, string>(); // socketId -> username

// Validate username (example validation)
const isValidUsername = (username: string): boolean => {
    return username.length >= 2 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username);
};

// Generate lobby code with more randomness
const generateLobbyCode = (): string => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Configuration object for game rules
const GAME_CONFIG = {
    MIN_PLAYERS: 5,
    MAX_PLAYERS: 10,
    IMPOSTOR_THRESHOLDS: [
        { min: 5, max: 6, count: 2 },
        { min: 7, max: 10, count: 3 }
    ],
    OPERATIONS: [
        {name: "grudge", hidden: true},
        {name: "infatuation", hidden: true},
        {name: "scapegoat", hidden: true},
        {name: "sleeper agent", hidden: true},
        {name: "secret agent", hidden: true},
        {name: "secret intel", hidden: true},
        {name: "secret tip", hidden: true},
        {name: "confession", hidden: false},
        {name: "secret intel", hidden: false},
        {name: "old photographs", hidden: false},
        {name: "danish intelligence", hidden: false},
        {name: "anonymous tip", hidden: false},
    ]
};

const OPERATION_CONFIG: Record<
    string, {
        fields: string[];
        types: string[];
        generateInfo?: (players: string[], teams: Record<string, string>, self: string) => any;
        modifyWinCondition?: (lobbyId: string, players: string[], votes: Record<string, string>, teams: Record<string, string>, db: any) => Promise<void>;
    }
> = {
    "grudge": {
        fields: [],
        types: [],
        generateInfo: () => null, // No extra info needed
        modifyWinCondition: async () => {}, // No effect on win condition
    },
    "infatuation": {
        fields: [],
        types: [],
        // The player receiving this operation will win the game if the randomly generated player wins
        generateInfo: () => null, // No extra info needed
        modifyWinCondition: async () => {}, // No effect on win condition
    },
    "sleeper agent": {
        fields: [],
        types: [],
        // The player receiving this operation will switch their team to the opposite side
        generateInfo: (players, teams, self) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length === 0) return null;

            const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            return { targetPlayer: randomPlayer, targetTeam: teams[randomPlayer] };
        },
        modifyWinCondition: async () => {}, // No effect on win condition
    },
    "secret agent": {
        fields: ["information"],
        types: ["string"],
        generateInfo: () => null,
        modifyWinCondition: async () => {}, // No effect on win condition
    },
    "anonymous tip": {
        fields: ["message"],
        types: ["string"],
        generateInfo: (players, teams, self) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length === 0) return null;

            const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            return { revealedPlayer: randomPlayer, team: teams[randomPlayer] };
        },
        modifyWinCondition: async () => {}, // No effect on win condition
    },
    "danish intelligence": {
        fields: ["code"],
        types: ["number"],
        generateInfo: () => ({ secretCode: Math.floor(1000 + Math.random() * 9000) }), // 4-digit random code
        modifyWinCondition: async () => {}, // No effect on win condition
    },
};

// Initialize SQLite database
let dbInstance: any;

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
app.post("/create-lobby", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { username } = req.body;
        const dbInstance = getDB(); // Get the database instance safely

        const lobbyId = Math.random().toString(36).substring(2, 8);
        const lobbyCode = generateLobbyCode();

        await dbInstance.run("INSERT INTO lobbies (id, lobby_code, status, phase) VALUES (?, ?, 'waiting', ?)", [lobbyId, lobbyCode, GamePhase.WAITING]);
        lobbies[lobbyId] = { lobbyCode, players: [username], status: "waiting", phase: GamePhase.WAITING };

        await dbInstance.run("INSERT INTO players (username, lobby_id, team) VALUES (?, ?, ?)", [username, lobbyId, "agent"]);
        
        // Emit player list to all clients in the lobby
        io.to(lobbyId).emit("player-list", { players: lobbies[lobbyId].players });
        
        res.json({ lobbyId, lobbyCode });
    } catch (error) {
        console.error("Fehler beim Erstellen der Lobby:", error);
        res.status(500).json({ error: 'Failed to create lobby' });
    }
});

// More comprehensive game start logic
const assignTeamsAndOperations = async (lobbyId: string, players: string[]) => {
    const db = getDB();

    // Determine impostors
    const impostorConfig = GAME_CONFIG.IMPOSTOR_THRESHOLDS.find(
        config => players.length >= config.min && players.length <= config.max
    );

    if (!impostorConfig) throw new Error("Invalid number of players");

    const shuffledPlayers = players.slice().sort(() => 0.5 - Math.random());
    const impostors = shuffledPlayers.slice(0, impostorConfig.count);
    const agents = shuffledPlayers.slice(impostorConfig.count);

    // Store teams in a dictionary
    const teams: Record<string, string> = {};
    for (const player of impostors) teams[player] = "impostor";
    for (const player of agents) teams[player] = "agent";

    // Assign teams in DB
    for (const player of players) {
        await db.run("UPDATE players SET team = ? WHERE username = ?", [teams[player], player]);
    }

    // Shuffle & assign operations
    const shuffledOperations = GAME_CONFIG.OPERATIONS.slice().sort(() => 0.5 - Math.random());
    const playerOperations = players.map((player, index) => ({
        player,
        operation: shuffledOperations[index] || "default-operation"
    }));

    for (const { player, operation } of playerOperations) {
        await db.run("UPDATE players SET operation = ? WHERE username = ?", [operation.name, player]);
    }

    // Generate additional operation information and send it to players
    await generateOperationInfo(lobbyId, players, teams);

    // Notify players of their team (you might want to send this individually as well)
    io.to(lobbyId).emit("team-assignment", { impostors, agents });

    return { impostors, agents, playerOperations };
};

const generateOperationInfo = async (lobbyId: string, players: string[], teams: Record<string, string>) => {
    const db = getDB();

    for (const player of players) {
        const operationRow = await db.get(
            "SELECT operation FROM players WHERE username = ? AND lobby_id = ?",
            [player, lobbyId]
        );

        if (!operationRow || !operationRow.operation) continue;

        const operation = operationRow.operation;
        const config = OPERATION_CONFIG[operation];
        if (!config || !config.generateInfo) continue;

        const generatedInfo = config.generateInfo(players, teams, player);
        await db.run(
            "UPDATE players SET operation_info = ? WHERE username = ?",
            [JSON.stringify(generatedInfo), player]
        );

        const socketId = userSockets[player]; // Hole die Socket-ID anhand des Usernamens
        if (socketId) {
            io.to(socketId).emit("operation-prepared", { // Sende an den spezifischen Socket
                operation,
                info: generatedInfo,
            });
            console.log(`Operation '${operation}' mit Info gesendet an <span class="math-inline">\{player\} \(</span>{socketId})`);
        } else {
            console.warn(`Socket-ID für Spieler ${player} nicht gefunden.`);
        }
    }
};

export const calculateWinConditions = async (lobbyId: string, votes: Record<string, string>) => {
    const db = getDB();
    const playersData = await db.all(
        "SELECT username, team, operation, operation_info FROM players WHERE lobby_id = ?",
        [lobbyId]
    );

    // Create teams lookup for easier access
    const teams: Record<string, string> = {};
    for (const player of playersData) {
        teams[player.username] = player.team;
    }

    // Count votes to determine the most voted player
    const voteCount: Record<string, number> = {};
    for (const target of Object.values(votes)) {
        if (target === "eliminated") continue;
        voteCount[target] = (voteCount[target] || 0) + 1;
    }

    // Find the most voted player
    let mostVotedPlayer = null;
    let highestVotes = 0;

    for (const [player, count] of Object.entries(voteCount)) {
        if (count > highestVotes) {
            highestVotes = count;
            mostVotedPlayer = player;
        } else if (count === highestVotes && count > 0) {
            // Tie - indecisive vote
            mostVotedPlayer = null;
        }
    }

    // Determine base win condition
    let winningTeam: string;
    if (mostVotedPlayer && teams[mostVotedPlayer] === "impostor") {
        // Agents win if an impostor is eliminated
        winningTeam = "agent";
    } else {
        // Impostors win if vote is indecisive or an agent is eliminated
        winningTeam = "impostor";
    }

    // Set default win statuses based on team results
    await db.run("UPDATE players SET win_status = 'lost' WHERE lobby_id = ?", [lobbyId]);
    await db.run(
        "UPDATE players SET win_status = 'won' WHERE team = ? AND lobby_id = ?",
        [winningTeam, lobbyId]
    );

    // Process special operations that modify win conditions
    for (const player of playersData) {
        const username = player.username;
        let operationInfo = null;

        // Parse operation info if exists
        if (player.operation_info) {
            try {
                operationInfo = JSON.parse(player.operation_info);
            } catch (e) {
                console.error(`Failed to parse operation info for ${username}`);
            }
        }

        // Handle special operations
        switch (player.operation) {
            case "grudge":
                // Player with grudge wins if their target is eliminated
                if (operationInfo && operationInfo.targetPlayer === mostVotedPlayer) {
                    await db.run(
                        "UPDATE players SET win_status = 'won' WHERE username = ? AND lobby_id = ?",
                        [username, lobbyId]
                    );
                }
                break;

            case "infatuation":
                // Player with infatuation wins if their target wins
                if (operationInfo && operationInfo.targetPlayer) {
                    const targetTeam = teams[operationInfo.targetPlayer];
                    if (targetTeam === winningTeam) {
                        await db.run(
                            "UPDATE players SET win_status = 'won' WHERE username = ? AND lobby_id = ?",
                            [username, lobbyId]
                        );
                    }
                }
                break;

            case "sleeper agent":
                // Player is actually on the opposite team
                const actualTeam = player.team === "agent" ? "impostor" : "agent";
                if (actualTeam === winningTeam) {
                    await db.run(
                        "UPDATE players SET win_status = 'won' WHERE username = ? AND lobby_id = ?",
                        [username, lobbyId]
                    );
                } else {
                    await db.run(
                        "UPDATE players SET win_status = 'lost' WHERE username = ? AND lobby_id = ?",
                        [username, lobbyId]
                    );
                }
                break;

            case "scapegoat":
                // Player wins if they are eliminated
                if (username === mostVotedPlayer) {
                    await db.run(
                        "UPDATE players SET win_status = 'won' WHERE username = ? AND lobby_id = ?",
                        [username, lobbyId]
                    );
                }
                break;
        }
    }

    // Get final results to send to clients
    const finalResults = await db.all(
        "SELECT username, team, operation, win_status FROM players WHERE lobby_id = ?",
        [lobbyId]
    );

    // Notify all players of the game results
    io.to(lobbyId).emit("game-results", {
        results: finalResults,
        mostVotedPlayer,
        winningTeam
    });
};


// More robust socket event handlers in the connection logic
io.on("connection", (socket: Socket) => {
    console.log("New client connected:", socket.id);

    // Clean up any existing socket for this user
    const cleanupOldSocket = (username: string) => {
        const oldSocketId = userSockets[username];
        if (oldSocketId && oldSocketId !== socket.id) { // Ensure it doesn't disconnect the current socket
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket) {
                oldSocket.disconnect(true);
            }
            delete userSockets[username];
            activeConnections.delete(oldSocketId);
        }
    };

    socket.on("rejoin-game", async ({ lobbyCode, username }) => {
        try {
            cleanupOldSocket(username);
            const db = getDB();
            const lobby = await db.get("SELECT id FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
            
            if (!lobby) {
                socket.emit("error", { message: "Lobby not found" });
                return;
            }

            // Get current game state
            const gameState = await db.get("SELECT status, round, total_rounds FROM lobbies WHERE id = ?", [lobby.id]);
            const players = await db.all("SELECT username, team, operation, score FROM players WHERE lobby_id = ?", [lobby.id]);
            
            // Update socket mapping
            userSockets[username] = socket.id;
            activeConnections.set(socket.id, username);
            socket.join(lobby.id);

            // Send current state to the reconnecting player
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
            cleanupOldSocket(username);
            if (!isValidUsername(username)) {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "Invalid username" 
                    });
                }
                return;
            }

            const dbInstance = getDB();
            const lobby = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);

            if (!lobby) {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "Lobby does not exist" 
                    });
                }
                return;
            }

            const [lobbyId, lobbyData] = lobby;

            if (lobbyData.status !== "waiting") {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "Game has already started" 
                    });
                }
                return;
            }

            // Check if player is already in the lobby
            const existingPlayer = await dbInstance.get(
                "SELECT * FROM players WHERE username = ? AND lobby_id = ?",
                [username, lobbyId]
            );

            if (existingPlayer) {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "You are already in this lobby" 
                    });
                }
                return;
            }

            // Check if username is taken in any lobby
            const usernameTaken = await dbInstance.get(
                "SELECT * FROM players WHERE username = ?",
                [username]
            );

            if (usernameTaken) {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "Username is already taken" 
                    });
                }
                return;
            }

            // Add player to database
            await dbInstance.run(
                "INSERT INTO players (username, lobby_id, team) VALUES (?, ?, '')",
                [username, lobbyId]
            );

            // Add player to lobby
            lobbies[lobbyId].players.push(username);
            userSockets[username] = socket.id;
            activeConnections.set(socket.id, username);
            socket.join(lobbyId);
            
            // Send to all clients in the lobby (including the new player)
            io.to(lobbyId).emit("player-joined", { username, lobbyId });
            
            // Emit updated player list to all clients in the lobby
            io.to(lobbyId).emit("player-list", { players: lobbies[lobbyId].players });
            
            // Send acknowledgment to the joining client
            if (callback) {
                callback({ 
                    success: true,
                    lobbyCode,
                    players: lobbies[lobbyId].players 
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
    socket.on("start-game", async ({ lobbyCode }) => {
        try {
            const dbInstance = getDB();
            const lobbyEntry = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);

            // Check if lobby exists and is in waiting state
            if (!lobbyEntry) {
                throw new Error("Lobby does not exist");
            }

            // Destructure the lobby data
            const [lobbyId, lobbyData] = lobbyEntry;

            // Check if the game has already started
            if (lobbyData.status !== "waiting") {
                throw new Error("Game has already started");
            }

            // Check if there are enough players to start the game
            if (lobbyData.players.length < GAME_CONFIG.MIN_PLAYERS) {
                throw new Error(`Not enough players. Minimum required: ${GAME_CONFIG.MIN_PLAYERS}`);
            }

            // Start game with first phase: TEAM_ASSIGNMENT
            lobbyData.status = "playing";
            lobbyData.phase = GamePhase.TEAM_ASSIGNMENT;
            
            await dbInstance.run(
                "UPDATE lobbies SET status = ?, phase = ? WHERE id = ?",
                ["playing", GamePhase.TEAM_ASSIGNMENT, lobbyId]
            );

            // Notify all players that the game has started
            io.to(lobbyId).emit("game-started", { 
                message: "Game has started!",
                players: lobbyData.players,
                phase: GamePhase.TEAM_ASSIGNMENT
            });

            // Begin TEAM_ASSIGNMENT phase - this happens automatically
            console.log("Starting team assignment phase...");
            
            // Assign teams and operations immediately
            const { impostors, agents, playerOperations } = await assignTeamsAndOperations(lobbyId, lobbyData.players);
            
            // Update lobby phase to OPERATION_ASSIGNMENT
            lobbyData.phase = GamePhase.OPERATION_ASSIGNMENT;
            await dbInstance.run(
                "UPDATE lobbies SET phase = ? WHERE id = ?",
                [GamePhase.OPERATION_ASSIGNMENT, lobbyId]
            );

            // Emit event: Only send team assignments
            io.to(lobbyId).emit("team-assignment", {
                impostors,
                agents,
                phase: GamePhase.OPERATION_ASSIGNMENT
            });

            console.log("Teams assigned. Operation phase starting...");

            // Operation Assignment Phase 
            console.log("Starting operation assignment...");

            // Apply operations to players
            for (const { player, operation } of playerOperations) {
                if (operation) {
                    await dbInstance.run(
                        "UPDATE players SET operation = ? WHERE username = ? AND lobby_id = ?",
                        [operation.name, player, lobbyId]
                    );

                    // Notify only the specific player about their operation
                    const playerSocketId = userSockets[player];
                    if (playerSocketId) {
                        io.to(playerSocketId).emit("operation-assigned", {
                            operation: operation.name
                        });
                    }

                    console.log(`Assigned operation '${operation.name}' to ${player}`);
                }
            }

            // Get player data with team assignments
            const playersData = await dbInstance.all(
                "SELECT username, team FROM players WHERE lobby_id = ?",
                [lobbyId]
            );

            // Generate operation info for players
            const teamLookup = Object.fromEntries(
                playersData.map((p: { username: string; team: string }) => [p.username, p.team])
            );
            await generateOperationInfo(lobbyId, lobbyData.players, teamLookup);

            console.log("Operation phase completed.");

            // Update lobby phase to VOTING
            lobbyData.phase = GamePhase.VOTING;
            await dbInstance.run(
                "UPDATE lobbies SET phase = ? WHERE id = ?",
                [GamePhase.VOTING, lobbyId]
            );

            // Notify all players that the operation phase is complete and voting begins
            io.to(lobbyId).emit("phase-change", {
                phase: GamePhase.VOTING,
                message: "Operation phase completed. Voting phase begins!"
            });

            console.log("Voting phase has begun");

        } catch (error) {
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    });

    socket.on("submit-vote", async ({ lobbyCode, username, vote }) => {
        try {
            const dbInstance = getDB();
            const lobbyEntry = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);

            if (!lobbyEntry) {
                throw new Error("Lobby does not exist");
            }
            const [lobbyId, lobbyData] = lobbyEntry;

            // Check if the game is in the voting phase
            if (lobbyData.phase !== GamePhase.VOTING) {
                throw new Error("Voting is not currently allowed - not in voting phase");
            }

            // Store the vote in the database
            await dbInstance.run(
                "INSERT INTO votes (lobby_id, voter, target) VALUES (?, ?, ?)",
                [lobbyId, username, vote]
            );

            // Notify other players about the vote
            socket.emit("vote-submitted", { username, vote });
            socket.to(lobbyId).emit("player-voted", { username });

            // Check if all players have voted
            const allPlayers = lobbyData.players.length;
            const votesCast = await dbInstance.all(
                "SELECT * FROM votes WHERE lobby_id = ?",
                [lobbyId]
            );

            // If all votes are in, tally the votes and determine the outcome
            if (votesCast.length >= allPlayers) {
                // Compile all votes into a single object for calculation
                const votesMap: Record<string, string> = {};
                for (const v of votesCast) {
                    votesMap[v.voter] = v.target;
                }

                // Calculate game results
                await calculateWinConditions(lobbyId, votesMap);

                // Update lobby phase to COMPLETED
                lobbyData.phase = GamePhase.COMPLETED;
                lobbyData.status = "completed";
                
                await dbInstance.run(
                    "UPDATE lobbies SET status = ?, phase = ? WHERE id = ?",
                    ["completed", GamePhase.COMPLETED, lobbyId]
                );

                // Get final results to send to clients
                const finalResults = await dbInstance.all(
                    "SELECT username, team, operation, win_status FROM players WHERE lobby_id = ?",
                    [lobbyId]
                );

                // Notify all players of the game completion
                io.to(lobbyId).emit("phase-change", {
                    phase: GamePhase.COMPLETED,
                    message: "Game completed. Results available!"
                });

                // Send game results to all players
                io.to(lobbyId).emit("game-results", {
                    results: finalResults,
                    phase: GamePhase.COMPLETED
                });

                // Clear votes for a potential next game
                await dbInstance.run("DELETE FROM votes WHERE lobby_id = ?", [lobbyId]);
            }

        } catch (error) {
            console.error("Error processing vote:", error);
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    });

    socket.on("leave-lobby", async ({ lobbyCode, username }) => {
        try {
            const dbInstance = getDB();
            const lobbyEntry = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);

            if (!lobbyEntry) {
                throw new Error("Lobby does not exist");
            }
            const [lobbyId, lobbyData] = lobbyEntry;

            lobbies[lobbyId].players = lobbyData.players.filter(player => player !== username);
            await dbInstance.run("DELETE FROM players WHERE username = ? AND lobby_id = ?", [username, lobbyId]);
            delete userSockets[username];
            socket.leave(lobbyId);
            io.to(lobbyId).emit("player-left", { username });

            if (lobbies[lobbyId].players.length === 0) {
                delete lobbies[lobbyId];
                await dbInstance.run("DELETE FROM lobbies WHERE id = ?", [lobbyId]);
                console.log(`Lobby ${lobbyId} geschlossen wegen Inaktivität.`);
            }

        } catch (error) {
            console.error("Fehler beim Verlassen der Lobby:", error);
            socket.emit("error", error instanceof Error ? error.message : "Unknown error");
        }
    });

    socket.on("disconnect", () => {
        const username = activeConnections.get(socket.id);
        if (username) {
            delete userSockets[username];
            activeConnections.delete(socket.id);
            console.log(`Socket ${socket.id} for user ${username} disconnected. Entry removed.`);
        }
    });

    socket.on("get-lobby-players", async ({ lobbyCode }, callback) => {
        try {
            const dbInstance = getDB();
            const lobby = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);

            if (!lobby) {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "Lobby does not exist" 
                    });
                }
                return;
            }

            const [lobbyId, lobbyData] = lobby;
            
            if (callback) {
                callback({ 
                    success: true,
                    players: lobbyData.players.map(username => ({ username }))
                });
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
    const portNumber = typeof port === 'number' ? port : 5001;
    server.listen(portNumber, HOST, () => {
      console.log(`Server running on ${HOST}:${portNumber}`);
      resolve();
    });
  });
};

export const stopServer = () => {
  server.close();
};