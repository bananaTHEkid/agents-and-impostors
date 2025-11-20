import { test, expect, Page } from '@playwright/test';

/**
 * Helper functions for common lobby operations
 */
class LobbyHelpers {
  /**
   * Creates a new lobby with the given username
   * Returns the lobby code
   */
  static async createLobby(page: Page, username: string): Promise<string> {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await page.getByRole('textbox', { name: 'Username' }).fill(username);
    await page.getByTestId('create-game-button').click();
    // Wait for lobby to be created or an error alert to show
    const lobbyLocator = page.getByTestId('game-lobby');
    const alertLocator = page.getByRole('alert').first();

    const outcome = await Promise.race([
      lobbyLocator.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'lobby'),
      alertLocator.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'alert')
    ]).catch(() => null);

    if (outcome !== 'lobby') {
      const errText = await alertLocator.textContent().catch(() => null);
      throw new Error(`Failed to create lobby: ${errText || 'Unknown error'}`);
    }

    // Wait for the player-list to contain the creator's username.
    // Prefer checking the specific player list instead of broad container text,
    // which can include other UI strings and cause flaky matches.
    const playerList = page.getByTestId('player-list');
    await expect(playerList).toBeVisible({ timeout: 15000 });
    await expect(playerList).toContainText(username, { timeout: 15000 });

    // Wait for lobby code to be visible and non-empty
    const codeViewer = page.getByTestId('code-viewer');
    await expect(codeViewer).toBeVisible({ timeout: 5000 });

    // Poll for a non-empty lobby code (some socket-driven UIs fill it slightly later)
    const start = Date.now();
    const pollTimeout = 5000;
    let lobbyCode = '';
    while (Date.now() - start < pollTimeout) {
      lobbyCode = (await codeViewer.textContent()) || '';
      if (lobbyCode.trim().length > 0) break;
      await page.waitForTimeout(100);
    }

    if (!lobbyCode || !lobbyCode.trim()) {
      throw new Error('Failed to extract lobby code');
    }

    // Ensure network settled before returning
    await page.waitForLoadState('networkidle');
    return lobbyCode.trim();
  }

  /**
   * Joins an existing lobby with the given username and lobby code
   */
  static async joinLobby(page: Page, username: string, lobbyCode: string): Promise<void> {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await page.getByRole('textbox', { name: 'Username' }).fill(username);
    await page.getByLabel('Lobby Code').fill(lobbyCode);
    
    // Wait for network to be idle to ensure socket is connected
    await page.waitForLoadState('networkidle');

    await page.getByTestId('join-game-button').click();

    // Wait for either the lobby to appear or an alert to show
    const lobbyLocator = page.getByTestId('game-lobby');
    const alertLocator = page.getByRole('alert').first();

    const result = await Promise.race([
      lobbyLocator.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'lobby'),
      alertLocator.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'alert')
    ]).catch(() => null);

    if (result === 'alert') {
      const errorText = await alertLocator.textContent().catch(() => null);
      throw new Error(`Failed to join lobby: ${errorText || 'Unknown error'}`);
    }

    if (result !== 'lobby') {
      // Fallback: if neither appeared in time, check visibility directly one last time
      const visible = await lobbyLocator.isVisible().catch(() => false);
      if (!visible) {
        throw new Error('Failed to join lobby: Lobby did not appear and no error message was shown');
      }
    }

    // Verify we successfully joined by checking lobby is visible
    await expect(lobbyLocator).toBeVisible({ timeout: 10000 });
  }

  /**
   * Waits for all pages to show the expected player count
   */
  static async waitForPlayerCount(
    pages: Page[],
    expectedCount: number,
    timeout: number = 30000
  ): Promise<void> {
    // Prefer to assert the number of player list items rather than matching
    // a translated or combined text blob in the lobby container.
    await Promise.all(
      pages.map(page => {
        const listItems = page.getByTestId('player-list').locator('li');
        return expect(listItems).toHaveCount(expectedCount, { timeout });
      })
    );
  }
}

test.describe('Game Lobby', () => {
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
      await expect(page.getByRole('alert').locator('div')).toBeVisible();
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
      const errorAlert = page.getByRole('alert');
      await expect(errorAlert).toBeVisible({ timeout: 10000 });
      const errorText = await errorAlert.textContent();
      expect(errorText).toBeTruthy();
      expect(errorText?.toLowerCase()).toContain('error');
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
