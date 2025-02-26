import express, { Application, Request, Response } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { initDB, getDB } from "./db/db"; // Use getDB() instead of a global db instance

const app: Application = express();
const server = createServer(app);

// Configure CORS for Socket.IO
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Store active lobbies
const lobbies: Record<string, { lobbyCode: string, players: string[], status: string }> = {};

// Middleware
app.use(express.json());
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));

// Generate a 6-digit lobby code
const generateLobbyCode = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Create a new lobby
app.post("/create-lobby", async (req: Request, res: Response) => {
    const { username } = req.body;
    const dbInstance = getDB(); // Get the database instance safely

    const lobbyId = Math.random().toString(36).substring(2, 8);
    const lobbyCode = generateLobbyCode();

    await dbInstance.run("INSERT INTO lobbies (id, lobby_code, status) VALUES (?, ?, 'waiting')", [lobbyId, lobbyCode]);
    lobbies[lobbyId] = { lobbyCode, players: [username], status: "waiting" };

    await dbInstance.run("INSERT INTO players (username, lobby_id, team) VALUES (?, ?, ?)", [username, lobbyId, "agent"]);
    res.json({ lobbyId, lobbyCode });
});

// Handle player joining a lobby
io.on("connection", (socket: Socket) => {
    console.log("A player connected:", socket.id);

    socket.on("join-lobby", async ({ username, lobbyCode }) => {
        const dbInstance = getDB();

        const lobby = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);
        if (!lobby) {
            socket.emit("error", "Lobby does not exist");
            return;
        }
        const lobbyId = lobby[0];

        if (lobbies[lobbyId].status !== "waiting") {
            socket.emit("error", "Game has already started. Cannot join.");
            return;
        }

        const existingPlayer = await dbInstance.get("SELECT * FROM players WHERE username = ? AND lobby_id = ?", [username, lobbyId]);
        if (existingPlayer) {
            socket.emit("error", "User already in the lobby");
            return;
        }

        const team = lobbies[lobbyId].players.length % 2 === 0 ? "agent" : "spy";
        await dbInstance.run("INSERT INTO players (username, lobby_id, team) VALUES (?, ?, ?)", [username, lobbyId, team]);
        lobbies[lobbyId].players.push(username);

        socket.join(lobbyId);
        io.to(lobbyId).emit("player-joined", { username, team });
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
    });
});

// Start the server **after** initializing the DB
const startServer = async (useMemory = false) => {
    await initDB(useMemory);
    server.listen(5000, () => console.log("Server running on http://localhost:5000"));
};

// Stop the server
const stopServer = async () => {
    server.close();
};

export { app, server, startServer, stopServer };
