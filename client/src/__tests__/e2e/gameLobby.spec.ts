import { test, expect } from '@playwright/test';

// Test suite for Game Lobby
test.describe('Game Lobby', () => {



  test('shoul show game lobby for with creating player in list', async ({ page }) => {
    await page.goto('http://localhost:5000/');
    await page.getByRole('textbox', { name: 'Username' }).click();
    await page.getByRole('textbox', { name: 'Username' }).fill('TestPlayer');
    await page.getByTestId('create-game-button').click();
    await expect(page.getByTestId('game-lobby')).toContainText('1 Spieler');
    await expect(page.getByRole('alert').locator('div')).toBeVisible();
  });

    test('should allow two players to join the game lobby', async ({ browser }) => {
    const contextPlayer1 = await browser.newContext();
    const contextPlayer2 = await browser.newContext();
    const player1Page = await contextPlayer1.newPage();
    const player2Page = await contextPlayer2.newPage();

    // Player 1 joins
    await player1Page.goto('http://localhost:5000/');
    await player1Page.getByRole('textbox', { name: 'Username' }).fill('Player1');
    await player1Page.getByTestId('create-game-button').click();
    
    // Wait for Player 1's socket connection and verify lobby state
    await expect(player1Page.getByText('Socket verbunden: Ja')).toBeVisible({ timeout: 15000 });
    await expect(player1Page.getByTestId('game-lobby')).toContainText('1 Spieler');
    const lobbycode = await player1Page.getByTestId('code-viewer').innerHTML();

    // Add small delay before second player joins
    await player1Page.waitForTimeout(1000);

    // Player 2 joins
    await player2Page.goto('http://localhost:5000/');
    await player2Page.getByRole('textbox', { name: 'Username' }).fill('Player2');
    await player2Page.getByLabel('Lobby Code').fill(lobbycode);
    
    // Wait for socket connection before clicking join
    await player2Page.waitForLoadState('networkidle');
    await player2Page.getByTestId('join-game-button').click();

    // Try alternative selector for socket connection status
    try {
        await expect(player2Page.locator('text=Socket verbunden: Ja')).toBeVisible({ timeout: 15000 });
    } catch (e) {
        // Log the page state if the socket connection fails
        console.log('Page content:', await player2Page.content());
        throw e;
    }

    // Wait for lobby updates
    await expect(player1Page.getByTestId('game-lobby')).toContainText('2 Spieler', { timeout: 30000 });
    await expect(player2Page.getByTestId('game-lobby')).toContainText('2 Spieler', { timeout: 30000 });

    // Cleanup
    await contextPlayer1.close();
    await contextPlayer2.close();
  });
});