"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const http_1 = require("http");
const socket_io_1 = require("socket.io");
describe('Multiple Connections Test', () => {
    let io;
    let clientSockets;
    let httpServer;
    let port;
    beforeAll((done) => {
        httpServer = (0, http_1.createServer)();
        io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: "http://localhost:3000",
                methods: ["GET", "POST"],
                credentials: true
            }
        });
        // Mock lobby creation
        io.on('connection', (socket) => {
            socket.on('create-lobby', ({ username }) => {
                const lobbyCode = 'TEST123';
                socket.emit('join-success', { lobbyCode });
            });
            socket.on('join-lobby', ({ username, lobbyCode }) => {
                socket.emit('lobby-update', { players: ['host', 'player0', 'player1', 'player2'] });
            });
        });
        httpServer.listen(() => {
            port = httpServer.address().port;
            done();
        });
    });
    afterAll((done) => {
        // Close all client sockets first
        clientSockets.forEach(socket => {
            if (socket.connected) {
                socket.disconnect();
            }
        });
        // Then close the server
        io.close(() => {
            httpServer.close(() => {
                done();
            });
        });
    });
    beforeEach(() => {
        clientSockets = [];
    });
    afterEach((done) => {
        // Close all client sockets
        clientSockets.forEach(socket => {
            if (socket.connected) {
                socket.disconnect();
            }
        });
        clientSockets = [];
        done();
    });
    it('should handle multiple client connections', (done) => {
        const numClients = 5;
        const connectedClients = [];
        // Create multiple client connections
        for (let i = 0; i < numClients; i++) {
            const client = (0, socket_io_client_1.io)(`http://localhost:${port}`);
            clientSockets.push(client);
            client.on('connect', () => {
                if (client.id) {
                    connectedClients.push(client.id);
                    // When all clients are connected, verify the count
                    if (connectedClients.length === numClients) {
                        expect(connectedClients.length).toBe(numClients);
                        done();
                    }
                }
            });
        }
    }, 10000);
    it('should allow multiple clients to join the same lobby', (done) => {
        const numClients = 3;
        let lobbyCode;
        let lobbyCreated = false;
        let playersJoined = 0;
        // Create a lobby first
        const hostClient = (0, socket_io_client_1.io)(`http://localhost:${port}`);
        clientSockets.push(hostClient);
        hostClient.on('connect', () => {
            // Create lobby
            hostClient.emit('create-lobby', { username: 'host' });
        });
        hostClient.on('join-success', (data) => {
            lobbyCreated = true;
            lobbyCode = data.lobbyCode;
            // Create multiple clients and have them join the lobby
            for (let i = 0; i < numClients; i++) {
                const client = (0, socket_io_client_1.io)(`http://localhost:${port}`);
                clientSockets.push(client);
                client.on('connect', () => {
                    if (client.id) {
                        client.emit('join-lobby', {
                            username: `player${i}`,
                            lobbyCode: lobbyCode
                        });
                    }
                });
                client.on('lobby-update', () => {
                    playersJoined++;
                    if (playersJoined === numClients) {
                        expect(playersJoined).toBe(numClients);
                        done();
                    }
                });
            }
        });
        // Add timeout handling
        const timeout = setTimeout(() => {
            if (!lobbyCreated) {
                done(new Error('Lobby creation timed out'));
            }
        }, 5000);
        timeout.unref(); // Prevent the timeout from keeping the process alive
    }, 15000);
});
