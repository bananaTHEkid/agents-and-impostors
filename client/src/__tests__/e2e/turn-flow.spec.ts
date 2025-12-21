import { test, expect } from '@playwright/test';
import { LobbyHelpers } from './LobbyHelpers';

test.describe('Turn-based Operation Flow', () => {
  test('Current turn is shown consistently across connected players', async ({ browser }) => {
    // create contexts/pages for 3 players
    const usernames = ['HostPlayer', 'Player2', 'Player3', 'Player4', 'Player5'];
    const contexts = await Promise.all(usernames.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((c) => c.newPage()));

    try {
      const hostPage = pages[0];

      // Host creates the lobby
      const lobbyCode = await LobbyHelpers.createLobby(hostPage, usernames[0]);

      // Other players join
      for (let i = 1; i < usernames.length; i++) {
        await LobbyHelpers.joinLobby(pages[i], usernames[i], lobbyCode);
        await LobbyHelpers.waitForPlayerCount(pages.slice(0, i + 1), i + 1, 120000);
      }

      // Start the game as host
      await expect(hostPage.getByTestId('start-game-button')).toBeEnabled({ timeout: 10000 });
      await hostPage.getByTestId('start-game-button').click();

      // Wait for all pages to reach Operation Assignment Phase (unique heading)
      await Promise.all(pages.map(page => page.getByRole('heading', { name: 'Operation Assignment Phase' }).waitFor({ timeout: 60000 })));

      // Wait for the turn banner to appear on all pages
      await Promise.all(pages.map(page => page.getByText(/^Current turn:/).waitFor({ timeout: 60000 })));

      // Read current-turn from host page banner
      const bannerText = (await hostPage.getByText(/^Current turn:/).textContent()) || '';
      const match = bannerText.match(/Current turn:\s*(.*?)(\s*\(You\))?$/i);
      const currentTurnPlayer = match ? match[1].trim() : null;
      expect(currentTurnPlayer).not.toBeNull();

      // Verify the same current-turn player is shown on every connected page and that there is only one 'Current Turn' badge
      for (const page of pages) {
        const pageBanner = (await page.getByText(/^Current turn:/).textContent()) || '';
        expect(pageBanner).toContain(currentTurnPlayer!);

        // Ensure exactly one visible badge/text that indicates the current turn in the player list
        const badgeCount = await page.locator('text=Current Turn').count();
        expect(badgeCount).toBe(1);
      }

    } finally {
      // close contexts
      await Promise.all(contexts.map(async (c) => { try { await c.close(); } catch (e) { /* ignore */ } }));
    }
  });
});
