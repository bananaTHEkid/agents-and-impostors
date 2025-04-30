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
exports.stopServer = exports.startServer = exports.calculateWinConditions = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const db_1 = require("./db/db");
exports.app = (0, express_1.default)();
const server = (0, http_1.createServer)(exports.app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "http://localhost:5174",
        methods: ["GET", "POST"],
        credentials: true
    }
});
const lobbies = {};
const userSockets = {}; // Speichert die Zuordnung von Username zu Socket-ID
// Add a map to track active connections
const activeConnections = new Map(); // socketId -> username
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
        generateInfo: () => null, // No extra info needed
        modifyWinCondition: () => __awaiter(void 0, void 0, void 0, function* () { }), // No effect on win condition
    },
    "infatuation": {
        fields: [],
        types: [],
        // The player receiving this operation will win the game if the randomly generated player wins
        generateInfo: () => null, // No extra info needed
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
        generateInfo: () => ({ secretCode: Math.floor(1000 + Math.random() * 9000) }), // 4-digit random code
        modifyWinCondition: () => __awaiter(void 0, void 0, void 0, function* () { }), // No effect on win condition
    },
};
// Initialize SQLite database
let dbInstance;
const initializeDatabase = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (useInMemory = false) {
    try {
        dbInstance = yield (0, db_1.initDB)(useInMemory);
        console.log("Database initialized with fresh tables");
    }
    catch (error) {
        console.error("Failed to initialize database:", error);
        process.exit(1); // Exit if database initialization fails
    }
});
// Middleware
exports.app.use(express_1.default.json());
exports.app.use((0, cors_1.default)({
    origin: "http://localhost:5174",
    credentials: true,
}));
// More robust lobby creation
exports.app.post("/create-lobby", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
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
        console.error("Fehler beim Erstellen der Lobby:", error);
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
        yield db.run("UPDATE players SET operation = ? WHERE username = ?", [operation.name, player]);
    }
    // Generate additional operation information and send it to players
    yield generateOperationInfo(lobbyId, players, teams);
    // Notify players of their team (you might want to send this individually as well)
    io.to(lobbyId).emit("team-assignment", { impostors, agents });
    return { impostors, agents, playerOperations };
});
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
        const socketId = userSockets[player]; // Hole die Socket-ID anhand des Usernamens
        if (socketId) {
            io.to(socketId).emit("operation-prepared", {
                operation,
                info: generatedInfo,
            });
            console.log(`Operation '${operation}' mit Info gesendet an <span class="math-inline">\{player\} \(</span>{socketId})`);
        }
        else {
            console.warn(`Socket-ID für Spieler ${player} nicht gefunden.`);
        }
    }
});
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
    console.log("New client connected:", socket.id);
    // Clean up any existing socket for this user
    const cleanupOldSocket = (username) => {
        const oldSocketId = userSockets[username];
        if (oldSocketId && oldSocketId !== socket.id) {
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket) {
                oldSocket.disconnect(true);
            }
            delete userSockets[username];
            activeConnections.delete(oldSocketId);
        }
    };
    socket.on("rejoin-game", (_a) => __awaiter(void 0, [_a], void 0, function* ({ lobbyCode, username }) {
        try {
            cleanupOldSocket(username);
            const db = (0, db_1.getDB)();
            const lobby = yield db.get("SELECT id FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
            if (!lobby) {
                socket.emit("error", { message: "Lobby not found" });
                return;
            }
            // Get current game state
            const gameState = yield db.get("SELECT status, round, total_rounds FROM lobbies WHERE id = ?", [lobby.id]);
            const players = yield db.all("SELECT username, team, operation, score FROM players WHERE lobby_id = ?", [lobby.id]);
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
        }
        catch (error) {
            console.error("Error in rejoin-game:", error);
            socket.emit("error", { message: "Failed to rejoin game" });
        }
    }));
    socket.on("join-lobby", (_a) => __awaiter(void 0, [_a], void 0, function* ({ username, lobbyCode }) {
        try {
            cleanupOldSocket(username);
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
            // Check if player is already in the lobby
            const existingPlayer = yield dbInstance.get("SELECT * FROM players WHERE username = ? AND lobby_id = ?", [username, lobbyId]);
            if (existingPlayer) {
                throw new Error("You are already in this lobby");
            }
            // Check if username is taken in any lobby
            const usernameTaken = yield dbInstance.get("SELECT * FROM players WHERE username = ?", [username]);
            if (usernameTaken) {
                throw new Error("Username is already taken");
            }
            // Add player to database
            yield dbInstance.run("INSERT INTO players (username, lobby_id, team) VALUES (?, ?, '')", [username, lobbyId]);
            // Add player to lobby
            lobbies[lobbyId].players.push(username);
            userSockets[username] = socket.id;
            activeConnections.set(socket.id, username);
            socket.join(lobbyId);
            // Send to all clients in the lobby (including the new player)
            io.to(lobbyId).emit("player-joined", { username, lobbyId });
            // Send a successful join confirmation to the joining client only
            socket.emit("join-success", {
                lobbyId,
                lobbyCode,
                players: lobbies[lobbyId].players
            });
            console.log(`Player ${username} joined lobby ${lobbyCode}`);
        }
        catch (error) {
            console.error("Error joining lobby:", error);
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    }));
    // Handle game start logic
    socket.on("start-game", (_a) => __awaiter(void 0, [_a], void 0, function* ({ lobbyCode }) {
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
                // ... (Team assignment in DB)
                yield dbInstance.run("COMMIT");
            }
            catch (err) {
                yield dbInstance.run("ROLLBACK");
                throw err;
            }
            // Update lobby status
            lobbyData.status = "playing";
            // Notify all players that the game has started
            io.to(lobbyId).emit("game-started", {
                message: "Game has started!",
                players: lobbyData.players
            });
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
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    }));
    socket.on("submit-vote", (_a) => __awaiter(void 0, [_a], void 0, function* ({ lobbyCode, username, vote }) {
        try {
            const dbInstance = (0, db_1.getDB)();
            const lobbyEntry = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);
            if (!lobbyEntry) {
                throw new Error("Lobby does not exist");
            }
            const [lobbyId, lobbyData] = lobbyEntry;
            // Basic vote storage (you might need a more complex system for rounds)
            yield dbInstance.run("INSERT INTO votes (lobby_id, voter, target) VALUES (?, ?, ?)", [lobbyId, username, vote]);
            // For simplicity, let's just acknowledge the vote
            socket.emit("vote-submitted", { username, vote });
            // You'd typically have logic here to check if all players have voted
            // and then proceed to tally the votes and potentially eliminate a player
            // or end the game.
            const allPlayers = lobbyData.players.length;
            const votesCast = yield dbInstance.all("SELECT * FROM votes WHERE lobby_id = ?", [lobbyId]);
            if (votesCast.length === allPlayers) {
                const votesByTarget = {};
                for (const v of votesCast) {
                    votesByTarget[v.target] = (votesByTarget[v.target] || 0) + 1;
                }
                let eliminatedPlayer = null;
                let maxVotes = 0;
                for (const player in votesByTarget) {
                    if (votesByTarget[player] > maxVotes) {
                        maxVotes = votesByTarget[player];
                        eliminatedPlayer = player;
                    }
                    else if (votesByTarget[player] === maxVotes && maxVotes > 0) {
                        eliminatedPlayer = null; // Tie, no one eliminated
                    }
                }
                if (eliminatedPlayer) {
                    yield dbInstance.run("UPDATE players SET eliminated = 1 WHERE username = ? AND lobby_id = ?", [eliminatedPlayer, lobbyId]);
                    io.to(lobbyId).emit("player-eliminated", { player: eliminatedPlayer });
                }
                else {
                    io.to(lobbyId).emit("no-player-eliminated");
                }
                // After voting, you'd usually check for win conditions
                const currentVotes = {}; // In a real game, you'd collect votes for the current round
                yield (0, exports.calculateWinConditions)(lobbyId, currentVotes);
                // Clear votes for the next round (in a multi-round game)
                yield dbInstance.run("DELETE FROM votes WHERE lobby_id = ?", [lobbyId]);
            }
        }
        catch (error) {
            console.error("Fehler beim Abgeben der Stimme:", error);
            socket.emit("error", error instanceof Error ? error.message : "Unknown error");
        }
    }));
    socket.on("leave-lobby", (_a) => __awaiter(void 0, [_a], void 0, function* ({ lobbyCode, username }) {
        try {
            const dbInstance = (0, db_1.getDB)();
            const lobbyEntry = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);
            if (!lobbyEntry) {
                throw new Error("Lobby does not exist");
            }
            const [lobbyId, lobbyData] = lobbyEntry;
            lobbies[lobbyId].players = lobbyData.players.filter(player => player !== username);
            yield dbInstance.run("DELETE FROM players WHERE username = ? AND lobby_id = ?", [username, lobbyId]);
            delete userSockets[username];
            socket.leave(lobbyId);
            io.to(lobbyId).emit("player-left", { username });
            if (lobbies[lobbyId].players.length === 0) {
                delete lobbies[lobbyId];
                yield dbInstance.run("DELETE FROM lobbies WHERE id = ?", [lobbyId]);
                console.log(`Lobby ${lobbyId} geschlossen wegen Inaktivität.`);
            }
        }
        catch (error) {
            console.error("Fehler beim Verlassen der Lobby:", error);
            socket.emit("error", error instanceof Error ? error.message : "Unknown error");
        }
    }));
    socket.on("disconnect", () => {
        const username = activeConnections.get(socket.id);
        if (username) {
            delete userSockets[username];
            activeConnections.delete(socket.id);
            console.log(`Socket ${socket.id} for user ${username} disconnected. Entry removed.`);
        }
    });
    socket.on("get-lobby-players", (_a) => __awaiter(void 0, [_a], void 0, function* ({ lobbyCode }) {
        try {
            const dbInstance = (0, db_1.getDB)();
            const lobbyEntry = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);
            if (!lobbyEntry) {
                throw new Error("Lobby does not exist");
            }
            const [lobbyId, lobbyData] = lobbyEntry;
            const playersInLobby = yield dbInstance.all("SELECT username FROM players WHERE lobby_id = ?", [lobbyId]);
            socket.emit("lobby-players", { players: playersInLobby.map(p => ({ username: p.username })) });
        }
        catch (error) {
            console.error("Error retrieving lobby players:", error);
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    }));
});
const startServer = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (port = 3000) {
    yield initializeDatabase();
    return new Promise((resolve) => {
        const portNumber = typeof port === 'number' ? port : 3000;
        server.listen(portNumber, () => {
            console.log(`Server running on port ${portNumber}`);
            resolve();
        });
    });
});
exports.startServer = startServer;
const stopServer = () => {
    server.close();
};
exports.stopServer = stopServer;
