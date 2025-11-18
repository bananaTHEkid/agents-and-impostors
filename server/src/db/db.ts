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
        await dbInstance.run("DROP TABLE IF EXISTS rounds");

        // Create tables
        await dbInstance.run(`
            CREATE TABLE IF NOT EXISTS lobbies (
                id TEXT PRIMARY KEY,
                lobby_code TEXT UNIQUE,
                status TEXT CHECK(status IN ('waiting', 'playing', 'completed')),
                phase TEXT CHECK(phase IN ('waiting', 'team_assignment', 'operation_assignment', 'voting', 'completed')),
                current_round INTEGER DEFAULT 1,
                total_rounds INTEGER DEFAULT 3
            )
        `);

        await dbInstance.run(`
            CREATE TABLE IF NOT EXISTS rounds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lobby_id TEXT,
                round_number INTEGER,
                winner TEXT,
                completed BOOLEAN DEFAULT 0,
                FOREIGN KEY (lobby_id) REFERENCES lobbies(id)
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
                operation_assigned INTEGER DEFAULT 0,   -- NEW: Has the player received their assignment?
                operation_accepted INTEGER DEFAULT 0,   -- NEW: Has the player accepted their assignment?
                FOREIGN KEY (lobby_id) REFERENCES lobbies(id)
            )
        `);

        await dbInstance.run(`
            CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lobby_id TEXT,
                voter TEXT,
                target TEXT,
                round_number INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lobby_id) REFERENCES lobbies(id)
            )
        `);

        await dbInstance.run(`
            CREATE TABLE IF NOT EXISTS connection_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                socket_id TEXT UNIQUE,
                username TEXT,
                lobby_id TEXT,
                lobby_code TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
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

/**
 * Executes a transaction - ensures atomic operations
 * @param callback - Async function containing database operations
 * @returns Result of the callback or null if transaction fails
 */
export const withTransaction = async <T>(
    callback: (db: Database) => Promise<T>
): Promise<T | null> => {
    const db = getDB();
    try {
        await db.exec("BEGIN TRANSACTION");
        const result = await callback(db);
        await db.exec("COMMIT");
        return result;
    } catch (error) {
        await db.exec("ROLLBACK");
        console.error("Transaction failed, rolling back:", error);
        throw error;
    }
};