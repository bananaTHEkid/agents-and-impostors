import { getDB } from '../db/db';
import { GamePhase, Lobby } from '../game-logic/types'; // Assuming Lobby might be used, or a new type can be defined.
import { GAME_CONFIG } from '../game-logic/config'; // For MAX_PLAYERS
import { Server } from 'socket.io'; // For clientIO type, though it's not used in DB operations directly.

export const isValidUsername = (username: string): boolean => {
    return username.length >= 2 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username);
};

export const generateLobbyCode = (): string => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export async function createLobby(username: string): Promise<{ lobbyId: string; lobbyCode: string }> {
    const db = getDB();
    const lobbyCode = generateLobbyCode();
    // Generate a unique lobbyId (simple random string for now, could be UUID)
    const lobbyId = Math.random().toString(36).substring(2, 10); 

    await db.run(
        "INSERT INTO lobbies (id, lobby_code, status, phase, current_round, total_rounds) VALUES (?, ?, 'waiting', ?, 0, 0)", 
        [lobbyId, lobbyCode, GamePhase.WAITING]
    );
    await db.run(
        "INSERT INTO players (username, lobby_id, team, eliminated, operation, operation_info, win_status) VALUES (?, ?, 'agent', 0, NULL, NULL, NULL)",
        [username, lobbyId]
    );
    return { lobbyId, lobbyCode };
}

export async function joinLobby(
    lobbyCode: string, 
    username: string
): Promise<{ success: boolean; error?: string; lobbyId?: string; players?: any[] }> {
    if (!isValidUsername(username)) {
        return { success: false, error: "Invalid username" };
    }

    const db = getDB();
    const lobby = await db.get("SELECT * FROM lobbies WHERE lobby_code = ?", [lobbyCode]);

    if (!lobby) {
        return { success: false, error: "Lobby does not exist" };
    }

    const lobbyId = lobby.id;

    const playersInLobby = await db.all("SELECT * FROM players WHERE lobby_id = ?", [lobbyId]);
    if (playersInLobby.length >= GAME_CONFIG.MAX_PLAYERS) {
        return { success: false, error: `Lobby is full. Maximum ${GAME_CONFIG.MAX_PLAYERS} players allowed.` };
    }

    if (lobby.status !== 'waiting') {
        return { success: false, error: "Game has already started" };
    }

    const existingPlayerThisLobby = playersInLobby.find(p => p.username === username);
    if (existingPlayerThisLobby) {
        return { success: false, error: "You are already in this lobby" };
    }
    
    // Check if username is taken in *any* active lobby - this might be too restrictive
    // Depending on requirements, this check might be removed or adjusted.
    // For now, keeping it similar to the original logic.
    const usernameTakenInAnyLobby = await db.get(
        "SELECT * FROM players p JOIN lobbies l ON p.lobby_id = l.id WHERE p.username = ? AND l.status != 'completed'", 
        [username]
    );
    if (usernameTakenInAnyLobby) {
         return { success: false, error: "Username is already taken in an active game." };
    }


    await db.run(
        "INSERT INTO players (username, lobby_id, team, eliminated, operation, operation_info, win_status) VALUES (?, ?, '', 0, NULL, NULL, NULL)",
        [username, lobbyId]
    );

    const updatedPlayers = await db.all("SELECT username FROM players WHERE lobby_id = ?", [lobbyId]);
    return { success: true, lobbyId, players: updatedPlayers };
}

export async function leaveLobby(lobbyCode: string, username: string): Promise<{ success: boolean; error?: string; lobbyClosed?: boolean }> {
    const db = getDB();
    
    try {
        // First verify the lobby exists
        const lobby = await db.get("SELECT id FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
        if (!lobby) {
            return { success: false, error: "Lobby not found" };
        }
        
        const lobbyId = lobby.id;

        // Verify the player exists in the lobby before deletion
        const player = await db.get(
            "SELECT id FROM players WHERE username = ? AND lobby_id = ?",
            [username, lobbyId]
        );

        if (!player) {
            return { success: false, error: "Player not found in lobby" };
        }

        // Delete the player
        const deleteResult = await db.run(
            "DELETE FROM players WHERE username = ? AND lobby_id = ?",
            [username, lobbyId]
        );

        // Verify deletion was successful
        if (deleteResult.changes === 0) {
            return { success: false, error: "Failed to remove player from lobby" };
        }

        // Check remaining players
        const remainingPlayers = await db.get(
            "SELECT COUNT(*) as count FROM players WHERE lobby_id = ?",
            [lobbyId]
        );

        if (remainingPlayers.count === 0) {
            await db.run("DELETE FROM lobbies WHERE id = ?", [lobbyId]);
            return { success: true, lobbyClosed: true };
        }

        return { success: true, lobbyClosed: false };
    } catch (error) {
        console.error("Error in leaveLobby:", error);
        return { success: false, error: "Database error occurred" };
    }
}

export async function getLobbyPlayers(lobbyCode: string): Promise<{ success: boolean; error?: string; players?: any[] }> {
    const db = getDB();
    const lobby = await db.get("SELECT id FROM lobbies WHERE lobby_code = ?", [lobbyCode]);

    if (!lobby) {
        return { success: false, error: "Lobby not found" };
    }
    const lobbyId = lobby.id;
    const players = await db.all("SELECT username FROM players WHERE lobby_id = ?", [lobbyId]);
    return { success: true, players };
}

export async function getLobby(lobbyCode: string): Promise<Lobby | null> {
    const db = getDB();
    // Cast to Lobby type; ensure the DB schema matches the Lobby interface or adjust accordingly.
    const lobbyData = await db.get("SELECT * FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
    if (!lobbyData) return null;
    // If Lobby type expects players array, it needs to be fetched separately or joined.
    // For now, returning raw lobby data.
    return lobbyData as Lobby; 
}

export async function getLobbyById(lobbyId: string): Promise<Lobby | null> {
    const db = getDB();
    const lobbyData = await db.get("SELECT * FROM lobbies WHERE id = ?", [lobbyId]);
     if (!lobbyData) return null;
    return lobbyData as Lobby;
}
