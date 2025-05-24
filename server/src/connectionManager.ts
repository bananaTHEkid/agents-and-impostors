import { Server } from 'socket.io';

const userToSocketIdMap = new Map<string, string>(); // username -> socketId
const socketToUsernameMap = new Map<string, string>(); // socketId -> username

export function addConnection(socketId: string, username: string): void {
    userToSocketIdMap.set(username, socketId);
    socketToUsernameMap.set(socketId, username);
}

export function removeConnection(socketId: string): void {
    const username = socketToUsernameMap.get(socketId);
    if (username) {
        userToSocketIdMap.delete(username);
    }
    socketToUsernameMap.delete(socketId);
}

export function getUsername(socketId: string): string | undefined {
    return socketToUsernameMap.get(socketId);
}

export function getSocketId(username: string): string | undefined {
    return userToSocketIdMap.get(username);
}

export function cleanupOldSocket(username: string, currentSocketId: string, io: Server): void {
    const oldSocketId = userToSocketIdMap.get(username);
    if (oldSocketId && oldSocketId !== currentSocketId) {
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
            oldSocket.disconnect(true); // Disconnect the old socket
        }
        // It's important to remove the old socket's entry from socketToUsernameMap as well,
        // because a user might rejoin with a new socket ID before the old one disconnects.
        socketToUsernameMap.delete(oldSocketId); 
    }
    // The new connection will be added by calling addConnection,
    // which will update userToSocketIdMap for the username.
}
