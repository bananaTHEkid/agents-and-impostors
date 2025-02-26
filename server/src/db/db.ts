import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";

let dbInstance: Database;

/**
 * Initializes the database.
 * Uses an in-memory database if `useMemory` is true.
 */
export const initDB = async (useMemory = false) => {
    dbInstance = await open({
        filename: useMemory ? ":memory:" : "database.sqlite",
        driver: sqlite3.Database
    });

    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS lobbies (
            id TEXT PRIMARY KEY, 
            lobby_code TEXT, 
            status TEXT
        );
        CREATE TABLE IF NOT EXISTS players (
            username TEXT PRIMARY KEY, 
            lobby_id TEXT, 
            team TEXT
        );
    `);
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
