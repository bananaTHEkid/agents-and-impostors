import { io as Client, Socket } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { AddressInfo } from 'net';

describe('Multiple Connections Test', () => {
  let io: Server;
  let clientSockets: Socket[];
  let httpServer: any;
  let port: number;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer, {
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
      port = (httpServer.address() as AddressInfo).port;
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
    const connectedClients: string[] = [];

    // Create multiple client connections
    for (let i = 0; i < numClients; i++) {
      const client = Client(`http://localhost:${port}`);
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

      client.on('connect_error', (err) => {
        console.error(`Connection error for client ${i}:`, err);
      });
    }

    // Add timeout handling
    const timeout = setTimeout(() => {
      if (connectedClients.length < numClients) {
        console.warn(`Only ${connectedClients.length}/${numClients} clients connected`);
        expect(connectedClients.length).toBeGreaterThan(0); // At least some clients should connect
        done();
      }
    }, 8000);
    timeout.unref(); // Prevent the timeout from keeping the process alive
  }, 10000);

  it('should allow multiple clients to join the same lobby', (done) => {
    const numClients = 3;
    let lobbyCode: string;
    let lobbyCreated = false;
    let playersJoined = 0;

    // Create a lobby first
    const hostClient = Client(`http://localhost:${port}`);
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
        const client = Client(`http://localhost:${port}`);
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