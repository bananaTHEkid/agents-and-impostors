import express, { Application, Request, Response } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app: Application = express();
const server = createServer(app);
const io = new Server(server);

// Initialize SQLite database
export const initDB = async () => {
    const db = await open({
        filename: "./game.db",
        driver: sqlite3.Database
    });
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            lobby_id TEXT,
            team TEXT CHECK(team IN ('agent', 'spy'))
        );
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS lobbies (
            id TEXT PRIMARY KEY,
            lobby_code TEXT UNIQUE,
            status TEXT CHECK(status IN ('waiting', 'in_progress', 'finished'))
        );
    `);
    
    return db;
};

let dbInstance: any;
initDB().then(db => dbInstance = db);

// Store active lobbies
const lobbies: Record<string, { lobbyCode: string, players: string[], status: string }> = {};

app.use(express.json());

// Generate a 6-digit lobby code
const generateLobbyCode = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Create a new lobby
app.post("/create-lobby", async (req: Request, res: Response) => {
    const lobbyId = Math.random().toString(36).substring(2, 8);
    const lobbyCode = generateLobbyCode();
    await dbInstance.run("INSERT INTO lobbies (id, lobby_code, status) VALUES (?, ?, 'waiting')", [lobbyId, lobbyCode]);
    lobbies[lobbyId] = { lobbyCode, players: [], status: "waiting" };
    res.json({ lobbyId, lobbyCode });
});

// Join a lobby
io.on("connection", (socket: Socket) => {
    console.log("A player connected:", socket.id);

    socket.on("join-lobby", async ({ username, lobbyCode }) => {
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
        
        // Assign team randomly
        const team = lobbies[lobbyId].players.length % 2 === 0 ? "agent" : "spy";
        
        await dbInstance.run("INSERT INTO players (username, lobby_id, team) VALUES (?, ?, ?)", [username, lobbyId, team]);
        lobbies[lobbyId].players.push(username);
        
        socket.join(lobbyId);
        io.to(lobbyId).emit("player-joined", { username, team });
    });

    socket.on("start-game", async ({ lobbyCode }) => {
        const lobby = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);
        if (!lobby) {
            socket.emit("error", "Lobby does not exist");
            return;
        }
        const lobbyId = lobby[0];

        if (lobbies[lobbyId].players.length < 5) {
            socket.emit("error", "At least 5 players are required to start the game");
            return;
        }

        await dbInstance.run("UPDATE lobbies SET status = 'in_progress' WHERE id = ?", [lobbyId]);
        lobbies[lobbyId].status = "in_progress";
        io.to(lobbyId).emit("game-started");
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
export { app };
