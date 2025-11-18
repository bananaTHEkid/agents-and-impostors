import { test, expect } from '@playwright/test';

// Test suite for Game Lobby
test.describe('Game Lobby', () => { 

    
  test('should allow five players to join the game lobby', async ({ browser }) => {
    // Create contexts and pages for all players
    const contexts = await Promise.all([...Array(5)].map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map(context => context.newPage()));

    const [player1Page] = pages;

    // Player 1 creates lobby
    await player1Page.goto('http://localhost:5000/');
    await player1Page.getByRole('textbox', { name: 'Username' }).fill('Player1');
    await player1Page.getByTestId('create-game-button').click();
    
    // Wait for the game lobby to be visible and show 1 player
    await expect(player1Page.getByTestId('game-lobby')).toContainText('1 Spieler', { timeout: 15000 });
    const lobbycode = await player1Page.getByTestId('code-viewer').innerHTML();

    // Join lobby with players 2-5
    for(let i = 1; i < 5; i++) {
			const playerPage = pages[i];
			await playerPage.goto('http://localhost:5000/');
			await playerPage.getByRole('textbox', { name: 'Username' }).fill(`Player${i+1}`);
			await playerPage.getByLabel('Lobby Code').fill(lobbycode);
			
			// Wait for socket connection before joining
			await playerPage.waitForLoadState('networkidle');
			await playerPage.getByTestId('join-game-button').click();

			// Verify updated player count for all connected players
			const expectedPlayers = `${i+1} Spieler`;
			for(let j = 0; j <= i; j++) {
				await expect(pages[j].getByTestId('game-lobby')).toContainText(expectedPlayers, { timeout: 120000 });
			}
    }

    // check activated start game button if at least five players are in a lobby (for the host)
    await expect(player1Page.getByTestId('start-game-button')).toBeEnabled();
    await player1Page.getByTestId('start-game-button').click();

    // Cleanup
    //await Promise.all(contexts.map(context => context.close()));
	});


});