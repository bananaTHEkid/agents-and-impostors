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

export function cleanupOldSocket(username: string, currentSocketId: string, io: Server): void {
    const oldSocketId = userToSocketIdMap.get(username);
    if (oldSocketId && oldSocketId !== currentSocketId) {
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
            console.log(`Disconnecting old socket for user ${username}: ${oldSocketId}`);
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
        console.log(`Player ${username} disconnected from lobby ${lobbyCode}`);
        
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
                    console.error(`Error removing connection session for ${username}:`, sessionError);
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

                        if (result.lobbyClosed) {
                            console.log(`Lobby ${lobbyCode} was closed (no players remaining)`);
                        }
                    } else {
                        console.error(`Failed to remove player ${username} from lobby ${lobbyCode}:`, result.error);
                    }
                } else {
                    // Game in progress - keep player for reconnection
                    console.log(`Game in progress for ${username} - keeping player record for reconnection`);
                }
            }
        } catch (error) {
            console.error(`Error handling disconnect for ${username}:`, error);
        }
    }
    
    // Clean up connection mappings (always remove socket connection)
    removeConnection(socketId);
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
    console.log('Current connections:');
    console.log('Users to sockets:', Object.fromEntries(userToSocketIdMap));
    console.log('Sockets to users:', Object.fromEntries(socketToUsernameMap));
    console.log('Sockets to lobbies:', Object.fromEntries(socketToLobbyMap));
}