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
exports.getDB = exports.initDB = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
let dbInstance = null;
/**
 * Initializes the database.
 * Uses an in-memory database if `useMemory` is true.
 */
const initDB = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (useMemory = false) {
    try {
        dbInstance = yield (0, sqlite_1.open)({
            filename: useMemory ? ":memory:" : "database.sqlite",
            driver: sqlite3_1.default.Database
        });
        // Drop existing tables if they exist
        yield dbInstance.run("DROP TABLE IF EXISTS votes");
        yield dbInstance.run("DROP TABLE IF EXISTS players");
        yield dbInstance.run("DROP TABLE IF EXISTS lobbies");
        // Create tables
        yield dbInstance.run(`
            CREATE TABLE IF NOT EXISTS lobbies (
                id TEXT PRIMARY KEY,
                lobby_code TEXT UNIQUE,
                status TEXT CHECK(status IN ('waiting', 'playing', 'completed'))
            )
        `);
        yield dbInstance.run(`
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
        yield dbInstance.run(`
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
    }
    catch (error) {
        console.error("Error initializing database:", error);
        throw error;
    }
});
exports.initDB = initDB;
/**
 * Gets the database instance.
 */
const getDB = () => {
    if (!dbInstance) {
        throw new Error("Database not initialized. Call initDB() first.");
    }
    return dbInstance;
};
exports.getDB = getDB;
