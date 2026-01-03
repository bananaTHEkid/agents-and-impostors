import { getDB } from './db/db';
import * as lobbyService from './lobby-manager/lobbyService';
import { getIO } from './socket';

let playerListRefreshInterval: NodeJS.Timeout | null = null;

export const startPlayerListRefresh = () => {
  const REFRESH_INTERVAL_MS = 3000;
  playerListRefreshInterval = setInterval(async () => {
    try {
      const db = getDB();
      const activeLobbies = await db.all("SELECT id, lobby_code FROM lobbies WHERE status = 'waiting' AND phase = 'waiting'");
      for (const lobby of activeLobbies) {
        try {
          const playersResult = await lobbyService.getLobbyPlayers(lobby.lobby_code);
          if (playersResult.success && playersResult.players) {
            const io = getIO();
            if (!io) continue;
            const socketsInRoom = await io.in(lobby.id).fetchSockets();
            if (socketsInRoom.length > 0) {
              io.to(lobby.id).emit('player-list', { players: playersResult.players });
            }
          }
        } catch (lobbyError) {
          console.error(`Fehler beim Aktualisieren der Spielerliste für Lobby ${lobby.lobby_code}:`, lobbyError);
        }
      }
    } catch (error) {
      console.error('Fehler im Aktualisierungszyklus der Spielerliste:', error);
    }
  }, REFRESH_INTERVAL_MS);

  console.log(`Automatische Aktualisierung der Spielerliste gestartet (Intervall: ${REFRESH_INTERVAL_MS}ms)`);
};

export const stopPlayerListRefresh = () => {
  if (playerListRefreshInterval) {
    clearInterval(playerListRefreshInterval);
    playerListRefreshInterval = null;
    console.log('Automatische Aktualisierung der Spielerliste gestoppt');
  }
};
