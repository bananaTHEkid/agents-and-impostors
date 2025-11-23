import { test, expect } from '@playwright/test';
import { LobbyHelpers } from './LobbyHelpers';

// Test suite for Game Room
test.describe('Game Room', () => {
  test('should start game and transition to game room when host clicks start', async ({ browser }) => {
    // Create contexts and pages for all players
    const contexts = await Promise.all([...Array(5)].map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map(context => context.newPage()));

    try {
      const player1Page = pages[0];

      // Player 1 creates lobby via helper
      const lobbycode = await LobbyHelpers.createLobby(player1Page, 'Player1');

      // Join lobby with players 2-5 using helper
      for (let i = 1; i < 5; i++) {
        const playerPage = pages[i];
        await LobbyHelpers.joinLobby(playerPage, `Player${i + 1}`, lobbycode);

        // Verify updated player count for all connected players
        await LobbyHelpers.waitForPlayerCount(pages.slice(0, i + 1), i + 1, 120000);
      }

      // Check activated start game button if at least 5 players are in a lobby (for the host)
      await expect(player1Page.getByTestId('start-game-button')).toBeEnabled();
      await player1Page.getByTestId('start-game-button').click();

      // Wait for game room to appear after game starts
      await expect(player1Page.getByTestId('game-room')).toBeVisible({ timeout: 30000 });

      player1Page.pause();

    } finally {
      // Cleanup
      await Promise.all(contexts.map(context => context.close()));
    }
  });
});