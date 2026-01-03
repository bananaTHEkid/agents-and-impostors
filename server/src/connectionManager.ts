import { Server } from 'socket.io';
import { leaveLobby } from './lobby-manager/lobbyService'; // Import your lobby service

const userToSocketIdMap = new Map<string, string>(); // username -> socketId
const socketToUsernameMap = new Map<string, string>(); // socketId -> username
const socketToLobbyMap = new Map<string, string>(); // socketId -> lobbyCode

export function addConnection(socketId: string, username: string, lobbyCode?: string): void {
    // Clean up any existing connection for this username first
    const existingSocketId = userToSocketIdMap.get(username);
    if (existingSocketId && existingSocketId !== socketId) {
        // Remove the old mapping
        socketToUsernameMap.delete(existingSocketId);
        const oldLobbyCode = socketToLobbyMap.get(existingSocketId);
        if (oldLobbyCode) {
            socketToLobbyMap.delete(existingSocketId);
        }
    }

    // Add new mappings
    userToSocketIdMap.set(username, socketId);
    socketToUsernameMap.set(socketId, username);
    
    if (lobbyCode) {
        socketToLobbyMap.set(socketId, lobbyCode);
    }
}

export function removeConnection(socketId: string): void {
    const username = socketToUsernameMap.get(socketId);
    if (username) {
        userToSocketIdMap.delete(username);
    }
    socketToUsernameMap.delete(socketId);
    socketToLobbyMap.delete(socketId);
}

export function getUsername(socketId: string): string | undefined {
    return socketToUsernameMap.get(socketId);
}

export function getSocketId(username: string): string | undefined {
    return userToSocketIdMap.get(username);
}

export function getLobbyCode(socketId: string): string | undefined {
    return socketToLobbyMap.get(socketId);
}

export function updateLobbyCode(socketId: string, lobbyCode: string): void {
    if (socketToUsernameMap.has(socketId)) {
        socketToLobbyMap.set(socketId, lobbyCode);
    }
}

function getConnectedCountForLobby(lobbyCode: string): number {
    let count = 0;
    for (const code of socketToLobbyMap.values()) {
        if (code === lobbyCode) count++;
    }
    return count;
}

async function hardDeleteLobby(lobbyCode: string, io: Server): Promise<void> {
    try {
        const { getDB } = await import('./db/db');
        const db = getDB();
        const lobby = await db.get("SELECT id FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
        if (!lobby) return;
        const lobbyId = lobby.id;

        // Remove all DB state tied to this lobby
        await db.run("DELETE FROM connection_sessions WHERE lobby_code = ?", [lobbyCode]);
        await db.run("DELETE FROM votes WHERE lobby_id = ?", [lobbyId]);
        await db.run("DELETE FROM rounds WHERE lobby_id = ?", [lobbyId]);
        await db.run("DELETE FROM players WHERE lobby_id = ?", [lobbyId]);
        await db.run("DELETE FROM lobbies WHERE id = ?", [lobbyId]);

        // Remove any lingering socket mappings for this lobby (defensive)
        for (const [sid, code] of Array.from(socketToLobbyMap.entries())) {
            if (code === lobbyCode) {
                const uname = socketToUsernameMap.get(sid);
                socketToLobbyMap.delete(sid);
                socketToUsernameMap.delete(sid);
                if (uname) userToSocketIdMap.delete(uname);
                // Ensure socket is disconnected if still around
                const sock = io.sockets.sockets.get(sid);
                if (sock) try { sock.disconnect(true); } catch {}
            }
        }
        console.log(`[Bereinigung] Leere Lobby ${lobbyCode} und alle zugehörigen Zustände gelöscht.`);
    } catch (err) {
        console.error(`[Bereinigung] Löschen der Lobby ${lobbyCode} fehlgeschlagen:`, err);
    }
}

export function cleanupOldSocket(username: string, currentSocketId: string, io: Server): void {
    const oldSocketId = userToSocketIdMap.get(username);
    if (oldSocketId && oldSocketId !== currentSocketId) {
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
            console.log(`Trenne alten Socket für Benutzer ${username}: ${oldSocketId}`);
            oldSocket.disconnect(true);
        }
        
        // Clean up old mappings
        socketToUsernameMap.delete(oldSocketId);
        socketToLobbyMap.delete(oldSocketId);
    }
}


export async function handleDisconnect(socketId: string, io: Server): Promise<void> {
    const username = socketToUsernameMap.get(socketId);
    const lobbyCode = socketToLobbyMap.get(socketId);
    
    if (username && lobbyCode) {
        console.log(`Spieler ${username} wurde von Lobby ${lobbyCode} getrennt`);
        
        try {
            // Import getDB and gameService for session cleanup
            const { getDB } = await import('./db/db');
            const gameService = await import('./game-logic/gameService');
            const db = getDB();
            
            // Get lobby info to check game phase
            const lobby = await db.get("SELECT id, phase, status FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
            
            if (lobby) {
                // Remove connection session for both waiting and in-progress games
                // This allows proper cleanup regardless of game state
                try {
                    await gameService.removeConnectionSession(socketId);
                } catch (sessionError) {
                    console.error(`Fehler beim Entfernen der Verbindungssitzung für ${username}:`, sessionError);
                }
                
                // Only delete player if lobby is still in waiting phase
                // If game is in progress, keep the player record for reconnection
                const shouldDeletePlayer = lobby.phase === 'waiting' || lobby.status === 'completed';
                
                if (shouldDeletePlayer) {
                    // Remove from lobby in database
                    const result = await leaveLobby(lobbyCode, username);
                    
                    if (result.success) {
                        // Notify other players in the lobby
                        io.to(lobby.id).emit('player-left', {
                            username: username,
                            lobbyClosed: result.lobbyClosed
                        });

                        // If lobby still exists (not closed), emit updated player list to remaining players
                        if (!result.lobbyClosed) {
                            const { getLobbyPlayers } = await import('./lobby-manager/lobbyService');
                            const playersResult = await getLobbyPlayers(lobbyCode);
                            if (playersResult.success && playersResult.players) {
                                io.to(lobby.id).emit("player-list", { players: playersResult.players });
                            }
                        }

                        if (result.lobbyClosed) {
                            console.log(`Lobby ${lobbyCode} wurde geschlossen (keine Spieler verbleiben)`);
                        }
                    } else {
                        console.error(`Fehler beim Entfernen des Spielers ${username} aus Lobby ${lobbyCode}:`, result.error);
                    }
                } else {
                    // Game in progress - keep player for reconnection
                    console.log(`Spiel läuft für ${username} – Spieler wird für Wiederverbindung beibehalten`);
                }
            }
        } catch (error) {
            console.error(`Fehler beim Verarbeiten der Trennung für ${username}:`, error);
        }
    }
    
    // Clean up connection mappings (always remove this socket connection)
    removeConnection(socketId);

    // If this was the last connected socket in the lobby, delete the lobby and all residual state
    if (lobbyCode) {
        const remaining = getConnectedCountForLobby(lobbyCode);
        if (remaining === 0) {
            await hardDeleteLobby(lobbyCode, io);
        }
    }
}

// Utility function to get all connected users
export function getAllConnectedUsers(): string[] {
    return Array.from(userToSocketIdMap.keys());
}

// Utility function to get connection count
export function getConnectionCount(): number {
    return userToSocketIdMap.size;
}

// Debug function to log current connections
export function logConnections(): void {
    console.log('Aktuelle Verbindungen:');
    console.log('Benutzer → Sockets:', Object.fromEntries(userToSocketIdMap));
    console.log('Sockets → Benutzer:', Object.fromEntries(socketToUsernameMap));
    console.log('Sockets → Lobbies:', Object.fromEntries(socketToLobbyMap));
}