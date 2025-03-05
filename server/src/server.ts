import express, { Application, Request, Response, NextFunction } from 'express';
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { initDB, getDB } from "./db/db";

// Define types for better type safety
interface Operation {
    name: string;
    hidden: boolean;
}

interface Lobby {
    lobbyCode: string;
    players: string[];
    status: 'waiting' | 'playing' | 'completed';
}

const app: Application = express();
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

const lobbies: Record<string, Lobby> = {};

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

// Initialize SQLite database
let dbInstance: any;

const initializeDatabase = async (useInMemory: boolean = false) => {
    dbInstance = await initDB(useInMemory);
};

// Middleware
app.use(express.json());
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));

// More robust lobby creation
app.post("/create-lobby", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { username } = req.body;
        const dbInstance = getDB(); // Get the database instance safely

        const lobbyId = Math.random().toString(36).substring(2, 8);
        const lobbyCode = generateLobbyCode();

        await dbInstance.run("INSERT INTO lobbies (id, lobby_code, status) VALUES (?, ?, 'waiting')", [lobbyId, lobbyCode]);
        lobbies[lobbyId] = { lobbyCode, players: [username], status: "waiting" };

        await dbInstance.run("INSERT INTO players (username, lobby_id, team) VALUES (?, ?, ?)", [username, lobbyId, "agent"]);
        res.json({ lobbyId, lobbyCode });
    } catch (error) {
        // Error handling
        next(error); // Pass to error handling middleware
        // or
        res.status(500).json({ error: 'Failed to create lobby' });
    }
});

// More comprehensive game start logic
const assignTeamsAndOperations = (players: string[]) => {
    // Determine number of impostors based on player count
    const impostorConfig = GAME_CONFIG.IMPOSTOR_THRESHOLDS.find(
        config => players.length >= config.min && players.length <= config.max
    );

    if (!impostorConfig) {
        throw new Error("Invalid number of players");
    }

    // Randomly select impostors
    const impostors = players
        .slice()
        .sort(() => 0.5 - Math.random())
        .slice(0, impostorConfig.count);

    const agents = players.filter(player => !impostors.includes(player));

    // Shuffle and assign operations
    const shuffledOperations = GAME_CONFIG.OPERATIONS
        .slice()
        .sort(() => 0.5 - Math.random());

    const playerOperations = players.map((player, index) => ({
        player, 
        operation: shuffledOperations[index] || null
    }));

    return { impostors, agents, playerOperations };
};

// More robust socket event handlers in the connection logic
io.on("connection", (socket: Socket) => {
    socket.on("join-lobby", async ({ username, lobbyCode }) => {
        try {
            if (!isValidUsername(username)) {
                throw new Error("Invalid username");
            }

            const dbInstance = getDB();
            const lobby = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);

            if (!lobby) {
                throw new Error("Lobby does not exist");
            }

            const [lobbyId, lobbyData] = lobby;

            if (lobbyData.status !== "waiting") {
                throw new Error("Game has already started");
            }

            const existingPlayer = await dbInstance.get(
                "SELECT * FROM players WHERE username = ? AND lobby_id = ?", 
                [username, lobbyId]
            );

            if (existingPlayer) {
                throw new Error("Username already in use");
            }

            await dbInstance.run(
                "INSERT INTO players (username, lobby_id, team) VALUES (?, ?, '')", 
                [username, lobbyId]
            );

            lobbyData.players.push(username);
            socket.join(lobbyId);
            io.to(lobbyId).emit("player-joined", { username });

        } catch (error) {
            socket.emit("error", error instanceof Error ? error.message : "Unknown error");
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

            // Assign teams only (not operations yet)
            const { impostors, agents, playerOperations } = assignTeamsAndOperations(lobbyData.players);

            await dbInstance.run("BEGIN TRANSACTION");
            try {
                for (const player of impostors) {
                    await dbInstance.run(
                        "UPDATE players SET team = 'impostor' WHERE username = ? AND lobby_id = ?",
                        [player, lobbyId]
                    );
                }

                for (const player of agents) {
                    await dbInstance.run(
                        "UPDATE players SET team = 'agent' WHERE username = ? AND lobby_id = ?",
                        [player, lobbyId]
                    );
                }

                await dbInstance.run("COMMIT");
            } catch (err) {
                await dbInstance.run("ROLLBACK");
                throw err;
            }

            // Update lobby status
            lobbyData.status = "playing";

            // Emit event: Only send team assignments
            io.to(lobbyId).emit("team-assignment", {
                impostors,
                agents
            });

            console.log("Teams assigned. Operation phase will begin soon...");

            // **Operation Assignment Phase (Delayed)**
            setTimeout(async () => {
                console.log("Starting operation assignment...");

                for (const { player, operation } of playerOperations) {
                    if (operation) {
                        await dbInstance.run(
                            "UPDATE players SET operation = ? WHERE username = ? AND lobby_id = ?",
                            [operation.name, player, lobbyId]
                        );

                        // Notify only the specific player about their operation
                        io.to(lobbyId).emit("operation-assigned", {
                            player,
                            operation: operation.name
                        });

                        console.log(`Assigned operation '${operation.name}' to ${player}`);

                        // Delay between each player's operation reveal (e.g., 3 seconds)
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }

                console.log("Operation phase completed.");

                // Notify all players that the operation phase is complete
                io.to(lobbyId).emit("operation-phase-complete");

            }, 5000); // Delay before operation phase begins (e.g., 5 seconds)

        } catch (error) {
            socket.emit("error", error instanceof Error ? error.message : "Unknown error");
        }
    });

});


// Export the app and server for testing
export { app, server };

// Start the server
const startServer = async (useInMemory: boolean = false) => {
    await initializeDatabase(useInMemory);
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};

// Stop the server
const stopServer = () => {
    server.close(() => {
        console.log('Server stopped');
    });
};

export { startServer, stopServer };