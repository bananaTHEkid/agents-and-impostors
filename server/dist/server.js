"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOperationInfo = exports.assignTeamsAndOperations = exports.calculateWinConditions = exports.stopServer = exports.startServer = exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const db_1 = require("./db/db");
const app = (0, express_1.default)();
exports.app = app;
const server = (0, http_1.createServer)(app);
exports.server = server;
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});
const lobbies = {};
// Validate username (example validation)
const isValidUsername = (username) => {
    return username.length >= 2 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username);
};
// Generate lobby code with more randomness
const generateLobbyCode = () => {
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
        { name: "grudge", hidden: true },
        { name: "infatuation", hidden: true },
        { name: "scapegoat", hidden: true },
        { name: "sleeper agent", hidden: true },
        { name: "secret agent", hidden: true },
        { name: "secret intel", hidden: true },
        { name: "secret tip", hidden: true },
        { name: "confession", hidden: false },
        { name: "secret intel", hidden: false },
        { name: "old photographs", hidden: false },
        { name: "danish intelligence", hidden: false },
        { name: "anonymous tip", hidden: false },
    ]
};
const OPERATION_CONFIG = {
    "grudge": {
        fields: [],
        types: [],
        generateInfo: () => null,
        modifyWinCondition: () => __awaiter(void 0, void 0, void 0, function* () { }), // No effect on win condition
    },
    "infatuation": {
        fields: [],
        types: [],
        // The player receiving this operation will win the game if the randomly generated player wins
        generateInfo: () => null,
        modifyWinCondition: () => __awaiter(void 0, void 0, void 0, function* () { }), // No effect on win condition
    },
    "sleeper agent": {
        fields: [],
        types: [],
        // The player receiving this operation will switch their team to the opposite side
        generateInfo: (players, teams, self) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length === 0)
                return null;
            const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            return { targetPlayer: randomPlayer, targetTeam: teams[randomPlayer] };
        },
        modifyWinCondition: () => __awaiter(void 0, void 0, void 0, function* () { }), // No effect on win condition
    },
    "secret agent": {
        fields: ["information"],
        types: ["string"],
        generateInfo: () => null,
        modifyWinCondition: () => __awaiter(void 0, void 0, void 0, function* () { }), // No effect on win condition
    },
    "anonymous tip": {
        fields: ["message"],
        types: ["string"],
        generateInfo: (players, teams, self) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length === 0)
                return null;
            const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            return { revealedPlayer: randomPlayer, team: teams[randomPlayer] };
        },
        modifyWinCondition: () => __awaiter(void 0, void 0, void 0, function* () { }), // No effect on win condition
    },
    "danish intelligence": {
        fields: ["code"],
        types: ["number"],
        generateInfo: () => ({ secretCode: Math.floor(1000 + Math.random() * 9000) }),
        modifyWinCondition: () => __awaiter(void 0, void 0, void 0, function* () { }), // No effect on win condition
    },
};
// Initialize SQLite database
let dbInstance;
const initializeDatabase = (useInMemory = false) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        dbInstance = yield (0, db_1.initDB)(useInMemory);
    }
    catch (e) {
        console.error("Database error:", e);
        throw e; //Throw so the server fails to start.
    }
});
// Middleware
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: "http://localhost:3000",
    credentials: true
}));
// More robust lobby creation
app.post("/create-lobby", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username } = req.body;
        const dbInstance = (0, db_1.getDB)(); // Get the database instance safely
        const lobbyId = Math.random().toString(36).substring(2, 8);
        const lobbyCode = generateLobbyCode();
        yield dbInstance.run("INSERT INTO lobbies (id, lobby_code, status) VALUES (?, ?, 'waiting')", [lobbyId, lobbyCode]);
        lobbies[lobbyId] = { lobbyCode, players: [username], status: "waiting" };
        yield dbInstance.run("INSERT INTO players (username, lobby_id, team) VALUES (?, ?, ?)", [username, lobbyId, "agent"]);
        res.json({ lobbyId, lobbyCode });
    }
    catch (error) {
        // Error handling
        next(error); // Pass to error handling middleware
        // or
        res.status(500).json({ error: 'Failed to create lobby' });
    }
}));
// More comprehensive game start logic
const assignTeamsAndOperations = (lobbyId, players) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, db_1.getDB)();
    // Determine impostors
    const impostorConfig = GAME_CONFIG.IMPOSTOR_THRESHOLDS.find(config => players.length >= config.min && players.length <= config.max);
    if (!impostorConfig)
        throw new Error("Invalid number of players");
    const shuffledPlayers = players.slice().sort(() => 0.5 - Math.random());
    const impostors = shuffledPlayers.slice(0, impostorConfig.count);
    const agents = shuffledPlayers.slice(impostorConfig.count);
    // Store teams in a dictionary
    const teams = {};
    for (const player of impostors)
        teams[player] = "impostor";
    for (const player of agents)
        teams[player] = "agent";
    // Assign teams in DB
    for (const player of players) {
        yield db.run("UPDATE players SET team = ? WHERE username = ?", [teams[player], player]);
    }
    // Shuffle & assign operations
    const shuffledOperations = GAME_CONFIG.OPERATIONS.slice().sort(() => 0.5 - Math.random());
    const playerOperations = players.map((player, index) => ({
        player,
        operation: shuffledOperations[index] || "default-operation"
    }));
    for (const { player, operation } of playerOperations) {
        yield db.run("UPDATE players SET operation = ? WHERE username = ?", [operation, player]);
    }
    // Generate additional operation information
    yield generateOperationInfo(lobbyId, players, teams);
    // Notify players of their team
    io.to(lobbyId).emit("team-assignment", { impostors, agents });
    return { impostors, agents, playerOperations };
});
exports.assignTeamsAndOperations = assignTeamsAndOperations;
const generateOperationInfo = (lobbyId, players, teams) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, db_1.getDB)();
    for (const player of players) {
        const operationRow = yield db.get("SELECT operation FROM players WHERE username = ? AND lobby_id = ?", [player, lobbyId]);
        if (!operationRow || !operationRow.operation)
            continue;
        const operation = operationRow.operation;
        const config = OPERATION_CONFIG[operation];
        if (!config || !config.generateInfo)
            continue;
        const generatedInfo = config.generateInfo(players, teams, player);
        yield db.run("UPDATE players SET operation_info = ? WHERE username = ?", [JSON.stringify(generatedInfo), player]);
        io.to(player).emit("operation-prepared", {
            operation,
            info: generatedInfo,
        });
    }
});
exports.generateOperationInfo = generateOperationInfo;
const calculateWinConditions = (lobbyId, votes) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, db_1.getDB)();
    const playersData = yield db.all("SELECT username, team, operation, operation_info FROM players WHERE lobby_id = ?", [lobbyId]);
    // Create teams lookup for easier access
    const teams = {};
    for (const player of playersData) {
        teams[player.username] = player.team;
    }
    // Count votes to determine the most voted player
    const voteCount = {};
    for (const target of Object.values(votes)) {
        if (target === "eliminated")
            continue;
        voteCount[target] = (voteCount[target] || 0) + 1;
    }
    // Find the most voted player
    let mostVotedPlayer = null;
    let highestVotes = 0;
    for (const [player, count] of Object.entries(voteCount)) {
        if (count > highestVotes) {
            highestVotes = count;
            mostVotedPlayer = player;
        }
        else if (count === highestVotes && count > 0) {
            // Tie - indecisive vote
            mostVotedPlayer = null;
        }
    }
    // Determine base win condition
    let winningTeam;
    if (mostVotedPlayer && teams[mostVotedPlayer] === "impostor") {
        // Agents win if an impostor is eliminated
        winningTeam = "agent";
    }
    else {
        // Impostors win if vote is indecisive or an agent is eliminated
        winningTeam = "impostor";
    }
    // Set default win statuses based on team results
    yield db.run("UPDATE players SET win_status = 'lost' WHERE lobby_id = ?", [lobbyId]);
    yield db.run("UPDATE players SET win_status = 'won' WHERE team = ? AND lobby_id = ?", [winningTeam, lobbyId]);
    // Process special operations that modify win conditions
    for (const player of playersData) {
        const username = player.username;
        let operationInfo = null;
        // Parse operation info if exists
        if (player.operation_info) {
            try {
                operationInfo = JSON.parse(player.operation_info);
            }
            catch (e) {
                console.error(`Failed to parse operation info for ${username}`);
            }
        }
        // Handle special operations
        switch (player.operation) {
            case "grudge":
                // Player with grudge wins if their target is eliminated
                if (operationInfo && operationInfo.targetPlayer === mostVotedPlayer) {
                    yield db.run("UPDATE players SET win_status = 'won' WHERE username = ? AND lobby_id = ?", [username, lobbyId]);
                }
                break;
            case "infatuation":
                // Player with infatuation wins if their target wins
                if (operationInfo && operationInfo.targetPlayer) {
                    const targetTeam = teams[operationInfo.targetPlayer];
                    if (targetTeam === winningTeam) {
                        yield db.run("UPDATE players SET win_status = 'won' WHERE username = ? AND lobby_id = ?", [username, lobbyId]);
                    }
                }
                break;
            case "sleeper agent":
                // Player is actually on the opposite team
                const actualTeam = player.team === "agent" ? "impostor" : "agent";
                if (actualTeam === winningTeam) {
                    yield db.run("UPDATE players SET win_status = 'won' WHERE username = ? AND lobby_id = ?", [username, lobbyId]);
                }
                else {
                    yield db.run("UPDATE players SET win_status = 'lost' WHERE username = ? AND lobby_id = ?", [username, lobbyId]);
                }
                break;
            case "scapegoat":
                // Player wins if they are eliminated
                if (username === mostVotedPlayer) {
                    yield db.run("UPDATE players SET win_status = 'won' WHERE username = ? AND lobby_id = ?", [username, lobbyId]);
                }
                break;
        }
    }
    // Get final results to send to clients
    const finalResults = yield db.all("SELECT username, team, operation, win_status FROM players WHERE lobby_id = ?", [lobbyId]);
    // Notify all players of the game results
    io.to(lobbyId).emit("game-results", {
        results: finalResults,
        mostVotedPlayer,
        winningTeam
    });
});
exports.calculateWinConditions = calculateWinConditions;
// More robust socket event handlers in the connection logic
io.on("connection", (socket) => {
    socket.on("join-lobby", ({ username, lobbyCode }) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (!isValidUsername(username)) {
                throw new Error("Invalid username");
            }
            const dbInstance = (0, db_1.getDB)();
            const lobby = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);
            if (!lobby) {
                throw new Error("Lobby does not exist");
            }
            const [lobbyId, lobbyData] = lobby;
            if (lobbyData.status !== "waiting") {
                throw new Error("Game has already started");
            }
            const existingPlayer = yield dbInstance.get("SELECT * FROM players WHERE username = ? AND lobby_id = ?", [username, lobbyId]);
            if (existingPlayer) {
                throw new Error("Username already in use");
            }
            yield dbInstance.run("INSERT INTO players (username, lobby_id, team) VALUES (?, ?, '')", [username, lobbyId]);
            lobbyData.players.push(username);
            socket.join(lobbyId);
            io.to(lobbyId).emit("player-joined", { username });
        }
        catch (error) {
            socket.emit("error", error instanceof Error ? error.message : "Unknown error");
        }
    }));
    // Handle game start logic
    socket.on("start-game", ({ lobbyCode }) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const dbInstance = (0, db_1.getDB)();
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
            // Assign teams and operations immediately
            const { impostors, agents, playerOperations } = yield assignTeamsAndOperations(lobbyId, lobbyData.players);
            yield dbInstance.run("BEGIN TRANSACTION");
            try {
                // ... (Teamzuweisung in DB)
                yield dbInstance.run("COMMIT");
            }
            catch (err) {
                yield dbInstance.run("ROLLBACK");
                throw err;
            }
            // Update lobby status
            lobbyData.status = "playing";
            // Emit event: Only send team assignments
            io.to(lobbyId).emit("team-assignment", {
                impostors,
                agents
            });
            console.log("Teams assigned. Operation phase will begin immediately...");
            // Operation Assignment Phase (Immediate)
            console.log("Starting operation assignment...");
            for (const { player, operation } of playerOperations) {
                if (operation) {
                    yield dbInstance.run("UPDATE players SET operation = ? WHERE username = ? AND lobby_id = ?", [operation.name, player, lobbyId]);
                    // Notify only the specific player about their operation
                    io.to(lobbyId).emit("operation-assigned", {
                        player,
                        operation: operation.name
                    });
                    console.log(`Assigned operation '${operation.name}' to ${player}`);
                }
            }
            console.log("Operation phase completed.");
            // Notify all players that the operation phase is complete
            io.to(lobbyId).emit("operation-phase-complete");
            console.log("Voting phase will begin immediately");
            //Voting phase starts immediately.
        }
        catch (error) {
            socket.emit("error", error instanceof Error ? error.message : "Unknown error");
        }
    }));
    socket.on("submit-vote", ({ lobbyCode, username, targetPlayer }) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const db = (0, db_1.getDB)();
            const lobby = yield db.get("SELECT id FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
            if (!lobby)
                throw new Error("Lobby not found");
            yield db.run("INSERT INTO votes (lobby_id, voter, target) VALUES (?, ?, ?)", [lobby.id, username, targetPlayer]);
            // Check if all players have voted
            const totalVotes = yield db.get("SELECT COUNT(*) as count FROM votes WHERE lobby_id = ?", [lobby.id]);
            const totalPlayers = yield db.get("SELECT COUNT(*) as count FROM players WHERE lobby_id = ?", [lobby.id]);
            if (totalVotes.count >= totalPlayers.count) {
                // Count votes and determine who was eliminated
                const voteResults = yield db.all("SELECT target, COUNT(*) as count FROM votes WHERE lobby_id = ? GROUP BY target", [lobby.id]);
                // Find the player with the most votes
                const eliminatedPlayer = voteResults.reduce((max, player) => (player.count > max.count ? player : max), {
                    target: null,
                    count: 0,
                }).target;
                if (eliminatedPlayer) {
                    yield db.run("UPDATE players SET eliminated = 1 WHERE username = ? AND lobby_id = ?", [
                        eliminatedPlayer,
                        lobby.id,
                    ]);
                }
                // Call win condition calculations
                const votes = Object.fromEntries(voteResults.map(v => [v.target, "eliminated"]));
                yield calculateWinConditions(lobby.id, votes);
            }
            io.to(lobby.id).emit("vote-submitted", { username, targetPlayer });
        }
        catch (error) {
            socket.emit("error", error instanceof Error ? error.message : "Unknown error");
        }
    }));
});
const startServer = (useInMemory = false) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Server started");
    try {
        yield initializeDatabase(useInMemory);
        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1); // Exit with a failure code
    }
});
exports.startServer = startServer;
// Stop the server
const stopServer = () => {
    server.close(() => {
        console.log('Server stopped');
    });
};
exports.stopServer = stopServer;
