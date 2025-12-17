import { test, expect } from '@playwright/test';
import { LobbyHelpers } from './LobbyHelpers';

test.describe('Operation Assignment Acceptance', () => {
  test('All players accepting their operation moves the game to Voting phase', async ({ browser }) => {
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

      // Each assigned player should see an accept assignment button. Click accept on each visible one.
      for (const page of pages) {
        // Wait for accept button to be visible for this player (operation-prepared triggers modal)
        const acceptBtn = page.getByTestId('accept-assignment-btn');
        await acceptBtn.waitFor({ timeout: 60000 });
        await acceptBtn.click();
        // small pause to allow server to process assignment chain
        await page.waitForTimeout(200);
      }

      // After everyone accepted, the server should transition to Voting phase
      await Promise.all(pages.map(page => page.getByText('Voting Phase').waitFor({ timeout: 60000 })));

      // Assert that the voting header is present on each page
      for (const page of pages) {
        await expect(page.getByText('Voting Phase')).toBeVisible();
      }

    } finally {
      await Promise.all(contexts.map(async (c) => { try { await c.close(); } catch (e) { /* ignore */ } }));
    }
  });
});
