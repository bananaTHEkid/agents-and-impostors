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
    console.log('Veraltete Verbindungssitzungen aus vorherigen Sitzungen bereinigt');
  } catch (error) {
    console.error('Fehler beim Bereinigen veralteter Verbindungen beim Start:', error);
  }

  // Setup socket.io and handlers
  setupSocket(server);

  return new Promise<void>((resolve) => {
    const portNumber = port;
    server.listen(portNumber, HOST, () => {
      console.log(`Server läuft auf ${HOST}:${portNumber}`);
      startPlayerListRefresh();
      resolve();
    });
  });
};

export const stopServer = () => {
  stopPlayerListRefresh();
  server.close();
};