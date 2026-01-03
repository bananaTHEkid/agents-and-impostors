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
    // Validate username before creating lobby
    if (!isValidUsername(username)) {
        throw new Error("Ungültiger Benutzername. 2-20 Zeichen, nur alphanumerisch und Unterstriche erlaubt.");
    }

    const db = getDB();
    
    // Note: Username uniqueness is only enforced within a lobby, not globally
    // This allows the same username in different lobbies/games

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
    // Normalize lobby code to uppercase for case-insensitive lookup
    const normalizedCode = lobbyCode.trim().toUpperCase();
    console.log(`[joinLobby] Suche nach Lobby mit Code: ${lobbyCode} (normalisiert: ${normalizedCode})`);
    const lobby = await db.get("SELECT * FROM lobbies WHERE UPPER(lobby_code) = ?", [normalizedCode]);

    if (!lobby) {
        console.log(`[joinLobby] Keine Lobby für Code gefunden: ${lobbyCode} (normalisiert: ${normalizedCode})`);
        return { success: false, error: "Lobby existiert nicht" };
    }

    const lobbyId = lobby.id;

    const playersInLobby = await db.all("SELECT * FROM players WHERE lobby_id = ?", [lobbyId]);
    if (playersInLobby.length >= GAME_CONFIG.MAX_PLAYERS) {
        return { success: false, error: `Lobby ist voll. Maximal ${GAME_CONFIG.MAX_PLAYERS} Spieler erlaubt.` };
    }

    if (lobby.status !== 'waiting') {
        return { success: false, error: "Spiel hat bereits begonnen" };
    }

    // Check if username is already in THIS specific lobby
    // Username uniqueness is only enforced within a lobby, not globally
    const existingPlayerThisLobby = playersInLobby.find(p => p.username === username);
    if (existingPlayerThisLobby) {
        return { success: false, error: "Dieser Benutzername ist in dieser Lobby bereits vergeben. Bitte wähle einen anderen Namen." };
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
            return { success: false, error: "Lobby nicht gefunden" };
        }
        
        const lobbyId = lobby.id;

        // Verify the player exists in the lobby before deletion
        const player = await db.get(
            "SELECT id FROM players WHERE username = ? AND lobby_id = ?",
            [username, lobbyId]
        );

        if (!player) {
            return { success: false, error: "Spieler in Lobby nicht gefunden" };
        }

        // Delete the player
        const deleteResult = await db.run(
            "DELETE FROM players WHERE username = ? AND lobby_id = ?",
            [username, lobbyId]
        );

        // Verify deletion was successful
        if (deleteResult.changes === 0) {
            return { success: false, error: "Spieler konnte nicht aus der Lobby entfernt werden" };
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
        console.error("Fehler in leaveLobby:", error);
        return { success: false, error: "Datenbankfehler aufgetreten" };
    }
}

export async function getLobbyPlayers(lobbyCode: string): Promise<{ success: boolean; error?: string; players?: any[] }> {
    const db = getDB();
    // Normalize lobby code to uppercase for case-insensitive lookup
    const normalizedCode = lobbyCode.trim().toUpperCase();
    const lobby = await db.get("SELECT id FROM lobbies WHERE UPPER(lobby_code) = ?", [normalizedCode]);

    if (!lobby) {
        return { success: false, error: "Lobby nicht gefunden" };
    }
    const lobbyId = lobby.id;
    const players = await db.all("SELECT username FROM players WHERE lobby_id = ?", [lobbyId]);
    return { success: true, players };
}

export async function getLobby(lobbyCode: string): Promise<Lobby | null> {
    const db = getDB();
    // Normalize lobby code to uppercase for case-insensitive lookup
    const normalizedCode = lobbyCode.trim().toUpperCase();
    // Cast to Lobby type; ensure the DB schema matches the Lobby interface or adjust accordingly.
    const lobbyData = await db.get("SELECT * FROM lobbies WHERE UPPER(lobby_code) = ?", [normalizedCode]);
    if (!lobbyData) {
        console.log(`[getLobby] Lobby für Code nicht gefunden: ${lobbyCode} (normalisiert: ${normalizedCode})`);
        return null;
    }
    // Map database snake_case to TypeScript camelCase
    return {
        id: lobbyData.id,
        lobbyCode: lobbyData.lobby_code,
        players: [], // Will be fetched separately if needed
        status: lobbyData.status,
        phase: lobbyData.phase,
        current_round: lobbyData.current_round,
        total_rounds: lobbyData.total_rounds
    } as Lobby;
}

export async function getLobbyById(lobbyId: string): Promise<Lobby | null> {
    const db = getDB();
    const lobbyData = await db.get("SELECT * FROM lobbies WHERE id = ?", [lobbyId]);
     if (!lobbyData) return null;
    return lobbyData as Lobby;
}
