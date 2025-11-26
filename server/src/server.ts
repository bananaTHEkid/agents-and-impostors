import { createServer } from 'http';
import app from './app';
import { initializeDatabase } from './dbInit';
import { setupSocket } from './socket';
import { startPlayerListRefresh, stopPlayerListRefresh } from './refresh';
import * as gameService from './game-logic/gameService';

export { app };

const PORT = process.env.PORT || 5001;
const HOST = process.env.SERVER_HOST || '0.0.0.0';

const server = createServer(app);

export const startServer = async (port: number = parseInt(PORT.toString())) => {
  await initializeDatabase();

  try {
    await gameService.cleanupStaleConnections();
    console.log('Cleaned up stale connection sessions from previous sessions');
  } catch (error) {
    console.error('Error cleaning up stale connections on startup:', error);
  }

  // Setup socket.io and handlers
  setupSocket(server);

  return new Promise<void>((resolve) => {
    const portNumber = port;
    server.listen(portNumber, HOST, () => {
      console.log(`Server running on ${HOST}:${portNumber}`);
      startPlayerListRefresh();
      resolve();
    });
  });
};

export const stopServer = () => {
  stopPlayerListRefresh();
  server.close();
};