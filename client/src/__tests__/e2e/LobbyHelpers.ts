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

    if (outcome !== 'lobby') {
      const errText = await alertLocator.textContent().catch(() => null);
      throw new Error(`Failed to create lobby: ${errText || 'Unknown error'}`);
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

    // Poll server debug endpoint to ensure lobby persisted (if available)
    const serverUrl = 'http://localhost:5001';
    const startServerPoll = Date.now();
    const serverPollTimeout = 10000;
    let creatorSeen = false;
    while (Date.now() - startServerPoll < serverPollTimeout) {
      try {
        const resp = await page.request.get(`${serverUrl}/debug/lobby/${encodeURIComponent(lobbyCode.trim())}`);
        if (resp.ok()) {
          const data = await resp.json() as any;
          if (data && data.success && Array.isArray(data.players)) {
            const players = data.players.map((p: any) => (p.username ? p.username : p));
            if (players.includes(username)) {
              creatorSeen = true;
              break;
            }
          }
        }
      } catch (e) {
        // ignore
      }
      await page.waitForTimeout(250);
    }

    if (!creatorSeen) {
      // warn only
      console.warn(`Creator ${username} not yet present on server for lobby ${lobbyCode}`);
    }

    await page.waitForLoadState('networkidle');
    return lobbyCode.trim();
  }

  static async joinLobby(page: Page, username: string, lobbyCode: string): Promise<void> {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('textbox', { name: 'Username' }).fill(username);
    await page.getByLabel('Lobby Code').fill(lobbyCode);

    await page.waitForLoadState('networkidle');

    // Ensure lobby exists server-side if debug endpoint present
    const serverUrl = 'http://localhost:5001';
    const lobbyExistStart = Date.now();
    const lobbyExistTimeout = 10000;
    let lobbyExists = false;
    while (Date.now() - lobbyExistStart < lobbyExistTimeout) {
      try {
        const resp = await page.request.get(`${serverUrl}/debug/lobby/${encodeURIComponent(lobbyCode)}`);
        if (resp.ok()) {
          const data = await resp.json() as any;
          if (data && data.success) {
            lobbyExists = true;
            break;
          }
        }
      } catch (e) {
        // ignore
      }
      await page.waitForTimeout(250);
    }

    if (!lobbyExists) console.warn(`Lobby ${lobbyCode} not found on server before join attempt`);

    await page.getByTestId('join-game-button').click();

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

    const playerJoinStart = Date.now();
    const playerJoinTimeout = 15000;
    let playerSeenOnServer = false;
    while (Date.now() - playerJoinStart < playerJoinTimeout) {
      try {
        const resp = await page.request.get(`${serverUrl}/debug/lobby/${encodeURIComponent(lobbyCode)}`);
        if (resp.ok()) {
          const data = await resp.json() as any;
          if (data && data.success && Array.isArray(data.players)) {
            const players = data.players.map((p: any) => (p.username ? p.username : p));
            if (players.includes(username)) {
              playerSeenOnServer = true;
              break;
            }
          }
        }
      } catch (e) {
        // ignore
      }
      await page.waitForTimeout(250);
    }

    if (!playerSeenOnServer) {
      const visible = await lobbyLocator.isVisible().catch(() => false);
      if (!visible) throw new Error('Failed to join lobby: Lobby did not appear and no error message was shown');
    }

    await lobbyLocator.waitFor({ state: 'visible', timeout: 10000 });
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
