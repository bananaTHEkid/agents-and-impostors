import { Page, expect } from '@playwright/test';

export class LobbyHelpers {
  static async createLobby(page: Page, username: string): Promise<string> {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('textbox', { name: 'Username' }).fill(username);
    await page.getByTestId('create-game-button').click();

    const lobbyLocator = page.getByTestId('game-lobby');
    const alertLocator = page.getByRole('alert').first();

    const outcome = await Promise.race([
      lobbyLocator.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'lobby'),
      alertLocator.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'alert')
    ]).catch(() => null);
    if (outcome === 'alert') {
      const errText = await alertLocator.textContent().catch(() => '');
      const lowered = (errText || '').toLowerCase();
      // Consider it an error only if the message indicates an error; otherwise wait for the lobby
      if (/(error|failed|fehler|nicht|cannot|unauthorized)/i.test(lowered)) {
        throw new Error(`Failed to create lobby: ${errText || 'Unknown error'}`);
      }
      // Non-error alert (informational) — wait a bit longer for the lobby to appear
      await lobbyLocator.waitFor({ state: 'visible', timeout: 15000 });
    }

    const playerList = page.getByTestId('player-list');
    await playerList.waitFor({ state: 'visible', timeout: 15000 });
    await playerList.waitFor({ state: 'attached', timeout: 15000 });

    const codeViewer = page.getByTestId('code-viewer');
    await codeViewer.waitFor({ state: 'visible', timeout: 5000 });

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

    // Skip server debug polling; rely on UI state for speed and robustness.

    await page.waitForLoadState('networkidle');
    return lobbyCode.trim();
  }

  static async joinLobby(page: Page, username: string, lobbyCode: string): Promise<void> {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('textbox', { name: 'Username' }).fill(username);
    await page.getByLabel('Lobby Code').fill(lobbyCode);

    await page.waitForLoadState('networkidle');

    // Skip server debug pre-check; rely on UI flow.

    await page.getByTestId('join-game-button').click();

    const lobbyLocator = page.getByTestId('game-lobby');
    const alertLocator = page.getByRole('alert').first();

    const result = await Promise.race([
      lobbyLocator.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'lobby'),
      alertLocator.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'alert')
    ]).catch(() => null);

    if (result === 'alert') {
      const alertText = (await alertLocator.textContent().catch(() => '')) || '';
      const lowered = alertText.toLowerCase();
      // Consider it an error only if the message indicates an error; otherwise wait for the lobby
      if (/(error|failed|fehler|nicht|cannot|unauthorized)/i.test(lowered)) {
        throw new Error(`Failed to join lobby: ${alertText || 'Unknown error'}`);
      }
      // Non-error alert (informational) — wait a bit longer for the lobby to appear
      try {
        await lobbyLocator.waitFor({ state: 'visible', timeout: 15000 });
      } catch (e) {
        throw new Error(`Failed to join lobby: ${alertText || 'Unknown error'}`);
      }
    }

    // Await lobby UI visibility directly
    await lobbyLocator.waitFor({ state: 'visible', timeout: 15000 });
  }

  static async waitForPlayerCount(pages: Page[], expectedCount: number, timeout: number = 30000): Promise<void> {
    await Promise.all(
      pages.map(page => {
        const listItems = page.getByTestId('player-list').locator(':scope > div');
        return expect(listItems).toHaveCount(expectedCount, { timeout });
      })
    );
  }
}
