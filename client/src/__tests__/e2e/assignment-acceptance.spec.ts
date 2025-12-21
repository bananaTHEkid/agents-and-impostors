import { test, expect } from '@playwright/test';
import { LobbyHelpers } from './LobbyHelpers';

test.describe('Operation Assignment Acceptance', () => {
  // Allow ample time for multi-user setup and phase transitions
  test.setTimeout(180000);
  test('All players accepting their operation moves the game to Voting phase', async ({ browser }) => {
    const usernames = ['HostPlayer', 'Player2', 'Player3', 'Player4', 'Player5'];
    const contexts = await Promise.all(usernames.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((c) => c.newPage()));

    try {
      const hostPage = pages[0];

      // Host creates the lobby
      const lobbyCode = await LobbyHelpers.createLobby(hostPage, usernames[0]);

      // Other players join sequentially; wait for each to appear before next
      for (let i = 1; i < usernames.length; i++) {
        await LobbyHelpers.joinLobby(pages[i], usernames[i], lobbyCode);
        // Wait until all previously joined pages reflect the expected count
        await LobbyHelpers.waitForPlayerCount(pages.slice(0, i + 1), i + 1, 120000);
      }

      // Start the game as host
      await hostPage.getByTestId('start-game-button').click();
      // Wait for Operation Assignment Phase to be visible for the host
      await hostPage.getByRole('heading', { name: /Operation Assignment Phase/i }).waitFor({ timeout: 30000 });

      // Each player accepts their assignment when it's their turn
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const username = usernames[i];

        // Wait until it's this player's turn
        await expect(
          page.getByText(new RegExp(`^\s*Current turn:\s*${username}.*\(You\)`, 'i'))
        ).toBeVisible({ timeout: 60000 });

        // Confession (single-choice): select a real player and submit
        const dropdownCount = await page.getByTestId('operation-choose-player').count();
        if (dropdownCount > 0) {
          const combo = page.getByTestId('operation-choose-player').first();
          await expect(combo).toBeEnabled({ timeout: 10000 });

          const options = await combo.locator('option').all();
          const validOptions: string[] = [];
          for (const opt of options) {
            const value = await opt.getAttribute('value');
            // Skip placeholder and self
            if (value && value.trim().length > 0 && value !== username) validOptions.push(value);
          }
          expect(validOptions.length).toBeGreaterThan(0);
          await combo.selectOption(validOptions[0]);

          const submitBtn = page.getByTestId('operation-submit');
          await expect(submitBtn).toBeEnabled();
          await submitBtn.click();

          // Wait for server acknowledgment (operation used message)
          await expect(page.getByTestId('game-messages')).toContainText(/used (confession|defector|operation)/i, { timeout: 15000 });
          // Some flows may still require explicit acceptance; click if present
          const maybeAccept = page.getByTestId('accept-assignment-btn');
          if (await maybeAccept.isVisible().catch(() => false)) {
            await expect(maybeAccept).toBeEnabled();
            await maybeAccept.click();
          }
          continue;
        }

        // Multi-choice: pick any two enabled checkboxes then submit
        // Scope to phase content to avoid unrelated checkboxes
        const checkboxLoc = page.getByTestId('phase-content').getByRole('checkbox');
        const checkboxCount = await checkboxLoc.count();
        if (checkboxCount >= 2) {
          let picked = 0;
          for (let idx = 0; idx < checkboxCount && picked < 2; idx++) {
            const cb = checkboxLoc.nth(idx);
            const disabled = await cb.isDisabled().catch(() => false);
            const visible = await cb.isVisible().catch(() => false);
            if (!disabled && visible) {
              await cb.check();
              picked++;
            }
          }
          const submitBtn = page.getByTestId('operation-submit');
          await expect(submitBtn).toBeEnabled();
          await submitBtn.click();
          await page.waitForTimeout(200);
          // Some flows may still require explicit acceptance; click if present
          const maybeAccept2 = page.getByTestId('accept-assignment-btn');
          if (await maybeAccept2.isVisible().catch(() => false)) {
            await expect(maybeAccept2).toBeEnabled();
            await maybeAccept2.click();
          }
          continue;
        }

        // No-input operation: accept
        const acceptBtn = page.getByTestId('accept-assignment-btn');
        await expect(acceptBtn).toBeEnabled({ timeout: 10000 });
        await acceptBtn.click();
        await page.waitForTimeout(200);
      }

      // After everyone accepted, the server should transition to Voting phase
      // Allow extra time for network and socket scheduling.
      await Promise.all(pages.map(page => page.getByText('Voting Phase').waitFor({ timeout: 30000 })));

      // Assert that the voting header is present on each page
      for (const page of pages) {
        await expect(page.getByText('Voting Phase')).toBeVisible({ timeout: 30000 });
      }

    } finally {
      await Promise.all(contexts.map(async (c) => { try { await c.close(); } catch (e) { /* ignore */ } }));
    }
  });
});
