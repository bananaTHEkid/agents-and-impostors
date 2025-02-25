import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./chat.db", (err) => {
    if (err) console.error("Error opening database:", err);
    else console.log("Connected to SQLite DB");
});

// Create table if it doesn't exist
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            userrole TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS lobbies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lobbycode TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`CREATE TABLE IF NOT EXISTS users_lobbies (
        user_id INTEGER,
        lobby_id INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(lobby_id) REFERENCES lobbies(id)
    `)

});


export default db;
