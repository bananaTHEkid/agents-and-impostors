import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { getDB } from './db/db';
import * as lobbyService from './lobby-manager/lobbyService';
import { validateUsername } from './utils/validators';
import { generateLobbyToken } from './utils/auth';

export const app: Application = express();

// Support multiple local development origins and allow configuring via
// `CLIENT_ORIGIN` environment variable (comma-separated list).
const defaultOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map(s => s.trim())
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://localhost:5000'
    ];

// Middleware
app.use(express.json());

// Express CORS middleware using the same allowed origins list.
app.use(cors({ origin: defaultOrigins, credentials: true }));

// Development-only debug endpoints
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug/lobbies', (async (req: Request, res: Response) => {
    try {
      const db = getDB();
      const lobbies = await db.all('SELECT id, lobby_code, status, phase, current_round, total_rounds FROM lobbies');
      for (const l of lobbies) {
        const players = await db.all('SELECT username FROM players WHERE lobby_id = ?', [l.id]);
        l.players = players.map((p: any) => p.username);
      }
      res.json({ success: true, lobbies });
    } catch (err) {
      console.error('Error fetching debug lobbies:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch lobbies' });
    }
  }) as express.RequestHandler);

  app.get('/debug/lobby/:code', (async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const result = await lobbyService.getLobbyPlayers(code);
      if (!result.success) {
        return res.status(404).json({ success: false, error: 'Lobby not found' });
      }
      res.json({ success: true, players: result.players });
    } catch (err) {
      console.error('Error fetching lobby players:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch players' });
    }
  }) as express.RequestHandler);

  app.post('/debug/reset-db', async (req: Request, res: Response) => {
    try {
      const db = getDB();
      await db.run('DELETE FROM votes');
      await db.run('DELETE FROM players');
      await db.run('DELETE FROM rounds');
      await db.run('DELETE FROM connection_sessions');
      await db.run('DELETE FROM lobbies');
      console.log('Debug: database reset via /debug/reset-db');
      res.json({ success: true });
    } catch (err) {
      console.error('Error resetting database:', err);
      res.status(500).json({ success: false, error: 'Failed to reset database' });
    }
  });
}

// Lobby creation endpoint (kept simple here)
app.post('/create-lobby', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.body;

    if (!validateUsername(username)) {
      res.status(400).json({ error: 'Invalid username. Must be 2-20 characters, alphanumeric and underscores only.' });
      return;
    }

    const { lobbyId, lobbyCode } = await lobbyService.createLobby(username);
    const accessToken = generateLobbyToken(lobbyId, username, lobbyCode);

    const playerRows = await getDB().all('SELECT username FROM players WHERE lobby_id = ?', [lobbyId]);

    console.log(`[create-lobby] Created lobby ${lobbyCode} (${lobbyId}) with initial player:`, playerRows);

    res.json({ lobbyId, lobbyCode, accessToken });
  } catch (error) {
    console.error('Error creating lobby:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create lobby';
    res.status(400).json({ error: errorMessage });
  }
});

export default app;
