import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";

let dbInstance: Database | null = null;

/**
 * Initializes the database.
 * Uses an in-memory database if `useMemory` is true.
 */
export const initDB = async (useMemory = false) => {
    try {
        dbInstance = await open({
            filename: useMemory ? ":memory:" : "database.sqlite",
            driver: sqlite3.Database
        });

        // Drop existing tables if they exist
        await dbInstance.run("DROP TABLE IF EXISTS votes");
        await dbInstance.run("DROP TABLE IF EXISTS players");
        await dbInstance.run("DROP TABLE IF EXISTS lobbies");

        // Create tables
        await dbInstance.run(`
            CREATE TABLE IF NOT EXISTS lobbies (
                id TEXT PRIMARY KEY,
                lobby_code TEXT UNIQUE,
                status TEXT CHECK(status IN ('waiting', 'playing', 'completed'))
            )
        `);

        await dbInstance.run(`
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                lobby_id TEXT,
                team TEXT,
                operation TEXT,
                operation_info TEXT,
                eliminated INTEGER DEFAULT 0,
                win_status TEXT,
                FOREIGN KEY (lobby_id) REFERENCES lobbies(id)
            )
        `);

        await dbInstance.run(`
            CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lobby_id TEXT,
                voter TEXT,
                target TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lobby_id) REFERENCES lobbies(id)
            )
        `);

        console.log("Database initialized successfully");
        return dbInstance;
    } catch (error) {
        console.error("Error initializing database:", error);
        throw error;
    }
};

/**
 * Gets the database instance.
 */
export const getDB = () => {
    if (!dbInstance) {
        throw new Error("Database not initialized. Call initDB() first.");
    }
    return dbInstance;
};