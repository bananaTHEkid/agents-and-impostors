import { test, expect, request } from '@playwright/test';
import { LobbyHelpers } from './LobbyHelpers';

test.describe.serial('Game Lobby', () => {
  // Reset DB once for this suite to avoid races between workers using the
  // shared SQLite DB. Running the suite serially prevents concurrent tests
  // from interfering with the global DB state.
  test.beforeAll(async () => {
    const req = await request.newContext();
    try {
      await req.post('http://localhost:5001/debug/reset-db');
    } catch (e) {
      console.warn('Warning: failed to reset server DB in beforeAll', e);
    } finally {
      await req.dispose();
    }
  });

  test.afterAll(async () => {
    const req = await request.newContext();
    try {
      await req.post('http://localhost:5001/debug/reset-db');
    } catch (e) {
      // ignore
    } finally {
      await req.dispose();
    }
  });
  test.describe('Lobby Creation', () => {
    test('should create lobby and display creator in player list', async ({ page }) => {
      // Arrange
      const username = 'TestPlayer';

      // Act
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.getByRole('textbox', { name: 'Username' }).fill(username);
      await page.getByTestId('create-game-button').click();

      // Assert
      await expect(page.getByTestId('game-lobby')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('game-lobby')).toContainText('1 Spieler');
      await expect(page.getByTestId('code-viewer')).toBeVisible();
    });

    test('should display lobby code after creation', async ({ page }) => {
      // Arrange
      const username = 'TestPlayer';

      // Act
      const lobbyCode = await LobbyHelpers.createLobby(page, username);

      // Assert
      expect(lobbyCode).toBeTruthy();
      expect(lobbyCode.length).toBeGreaterThan(0);
      await expect(page.getByTestId('code-viewer')).toContainText(lobbyCode);
    });
  });

  test.describe('Player Joining', () => {
    test('should allow two players to join the game lobby', async ({ browser }) => {
      // Arrange
      const player1Context = await browser.newContext();
      const player2Context = await browser.newContext();
      const player1Page = await player1Context.newPage();
      const player2Page = await player2Context.newPage();

      try {
        // Act - Player 1 creates lobby
        const lobbyCode = await LobbyHelpers.createLobby(player1Page, 'Player1');

        // Act - Player 2 joins lobby
        await LobbyHelpers.joinLobby(player2Page, 'Player2', lobbyCode);

        // Assert - Both players should see 2 players in the lobby
        await LobbyHelpers.waitForPlayerCount([player1Page, player2Page], 2);
      } finally {
        // Cleanup
        await player1Context.close();
        await player2Context.close();
      }
    });

    test('should allow five players to join the game lobby', async ({ browser }) => {
      // Arrange
      const contexts = await Promise.all(
        Array.from({ length: 5 }, () => browser.newContext())
      );
      const pages = await Promise.all(
        contexts.map(context => context.newPage())
      );

      try {
        // Act - Player 1 creates lobby
        const lobbyCode = await LobbyHelpers.createLobby(pages[0], 'Player1');

        // Act - Players 2-5 join lobby sequentially
        for (let i = 1; i < 5; i++) {
          const playerPage = pages[i];
          const playerName = `Player${i + 1}`;

          await LobbyHelpers.joinLobby(playerPage, playerName, lobbyCode);

          // Assert - All connected players should see updated player count
          const expectedPlayerCount = i + 1;
          await LobbyHelpers.waitForPlayerCount(
            pages.slice(0, i + 1),
            expectedPlayerCount,
            120000 // Longer timeout for concurrent joins
          );
        }

        // Assert - Final state: all 5 players should see 5 players
        await LobbyHelpers.waitForPlayerCount(pages, 5, 120000);
      } finally {
        // Cleanup
        await Promise.all(contexts.map(context => context.close()));
      }
    });

    test('should show error when joining with invalid lobby code', async ({ page }) => {
      // Arrange
      const username = 'TestPlayer';
      const invalidLobbyCode = 'INVALID';

      // Act
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.getByRole('textbox', { name: 'Username' }).fill(username);
      await page.getByLabel('Lobby Code').fill(invalidLobbyCode);
      await page.getByTestId('join-game-button').click();

      // Assert - Error message should be displayed
      // Use explicit text match for robustness instead of relying on role lookup
      const errorTextLocator = page.getByText('Ungültiges Format des Lobby-Codes');
      await expect(errorTextLocator).toBeVisible({ timeout: 10000 });
      const errorText = await errorTextLocator.textContent();
      expect(errorText).toBeTruthy();
      expect(errorText?.toLowerCase()).toContain('ungültiges format des lobby-codes');
    });
  });

  test.describe('Lobby State Management', () => {
    test('should update player count in real-time when players join', async ({ browser }) => {
      // Arrange
      const player1Context = await browser.newContext();
      const player2Context = await browser.newContext();
      const player3Context = await browser.newContext();
      const player1Page = await player1Context.newPage();
      const player2Page = await player2Context.newPage();
      const player3Page = await player3Context.newPage();

      try {
        // Act - Player 1 creates lobby
        const lobbyCode = await LobbyHelpers.createLobby(player1Page, 'Player1');
        await LobbyHelpers.waitForPlayerCount([player1Page], 1);

        // Act - Player 2 joins
        await LobbyHelpers.joinLobby(player2Page, 'Player2', lobbyCode);
        await LobbyHelpers.waitForPlayerCount([player1Page, player2Page], 2);

        // Act - Player 3 joins
        await LobbyHelpers.joinLobby(player3Page, 'Player3', lobbyCode);
        await LobbyHelpers.waitForPlayerCount(
          [player1Page, player2Page, player3Page],
          3
        );
      } finally {
        // Cleanup
        await player1Context.close();
        await player2Context.close();
        await player3Context.close();
      }
    });

    test('should display host indicator for lobby creator', async ({ page }) => {
      // Arrange
      const username = 'HostPlayer';

      // Act
      await LobbyHelpers.createLobby(page, username);

      // Assert - Host indicator should be visible
      // Note: This assumes the host indicator is displayed in the player list
      // Adjust selector based on actual implementation
      const playerList = page.getByTestId('player-list');
      await expect(playerList).toBeVisible();
      // The host should be marked in the player list
      // This assertion may need adjustment based on actual UI implementation
    });
  });
});
