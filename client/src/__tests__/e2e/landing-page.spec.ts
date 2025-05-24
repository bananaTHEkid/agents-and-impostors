import {test, expect} from '@playwright/test';

test.describe('Landing Page', () => {
  test('should load and display essential elements', async ({ page }) => {
    // Navigate to the base URL
    await page.goto('/');

    // Validate page title
    await expect(page).toHaveTitle('Vite + React + TS');

    // Validate the main container
    const landingPageContainer = page.getByTestId('landing-page');
    await expect(landingPageContainer).toBeVisible();

    // Validate welcome message
    await expect(page.getByText('Welcome to Triple')).toBeVisible();
    await expect(page.getByText('Join or create a game to get started')).toBeVisible();
  });

  test('should display and handle user input fields', async ({ page }) => {
    await page.goto('/');

    // Check for username and lobby code input fields
    const usernameInput = page.getByLabel('Username');
    const lobbyCodeInput = page.getByLabel('Lobby Code');

    await expect(usernameInput).toBeVisible();
    await expect(lobbyCodeInput).toBeVisible();

    // Test input functionality
    await usernameInput.fill('TestPlayer');
    await lobbyCodeInput.fill('ABC123');

    await expect(usernameInput).toHaveValue('TestPlayer');
    await expect(lobbyCodeInput).toHaveValue('ABC123');
  });

  test('should display join and create game buttons', async ({ page }) => {
    await page.goto('/');

    // Check for join and create game buttons
    const joinGameButton = page.getByTestId('join-game-button');
    const createGameButton = page.getByTestId('create-game-button');

    await expect(joinGameButton).toBeVisible();
    await expect(createGameButton).toBeVisible();
    await expect(joinGameButton).toHaveText('Join Game');
    await expect(createGameButton).toHaveText('Create New Game');
  });

  test('should show validation error with empty username', async ({ page }) => {
    await page.goto('/');

    const joinGameButton = page.getByTestId('join-game-button');
    await joinGameButton.click();

    const errorAlert = page.getByText('Error');
    await expect(errorAlert).toBeVisible();
    await expect(page.getByText('Please fill in all fields')).toBeVisible();
  });

  test('should show validation error with invalid lobby code', async ({ page }) => {
    await page.goto('/');

    const usernameInput = page.getByLabel('Username');
    const lobbyCodeInput = page.getByLabel('Lobby Code');

    await usernameInput.fill('TestPlayer');
    await lobbyCodeInput.fill('123'); // Invalid code (too short)

    const joinGameButton = page.getByTestId('join-game-button');
    await joinGameButton.click();

    const errorAlert = page.getByText('Error');
    await expect(errorAlert).toBeVisible();
    await expect(page.getByText('Invalid lobby code format')).toBeVisible();
  });

  test('should display game rules button', async ({ page }) => {
    await page.goto('/');

    const gameRulesButton = page.getByTestId('game-rules-button');
    await expect(gameRulesButton).toBeVisible();
    await expect(gameRulesButton).toHaveText('Game Rules & Help');
  });

  test('should successfully create a new game when username is provided', async ({ page }) => {
    // Mock API response for create-lobby endpoint
    await page.route('**/create-lobby', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lobbyId: '123456789',
          lobbyCode: 'ABC123'
        })
      });
    });

    // Navigate to the landing page
    await page.goto('/');

    // Enter username
    const usernameInput = page.getByLabel('Username');
    await usernameInput.fill('TestPlayer');

    // Click on "Create New Game" button
    const createGameButton = page.getByTestId('create-game-button');
    await expect(createGameButton).toBeEnabled();

    // Track network requests
    const requestPromise = page.waitForRequest(request =>
        request.url().includes('/create-lobby') &&
        request.method() === 'POST'
    );

    // Click the create button
    await createGameButton.click();

    // Wait for the API request to be made
    const request = await requestPromise;

    // Verify request payload contains correct data
    const postData = request.postDataJSON();

    expect(postData.username).toBe('TestPlayer');

    // Check local storage values are set correctly
    const isHost = await page.evaluate(() => sessionStorage.getItem('isHost'));
    const storedUsername = await page.evaluate(() => sessionStorage.getItem('username'));
    const storedLobbyCode = await page.evaluate(() => sessionStorage.getItem('lobbyCode'));

    expect(isHost).toBe('true');
    expect(storedUsername).toBe('TestPlayer');
    expect(storedLobbyCode).toBe('ABC123');

  });

  test('should show error when create game fails', async ({ page }) => {
    // Mock API response for create-lobby endpoint with an error
    await page.route('**/create-lobby', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Failed to create lobby'
        })
      });
    });

    // Navigate to the landing page
    await page.goto('/');

    // Enter username
    const usernameInput = page.getByLabel('Username');
    await usernameInput.fill('TestPlayer');

    // Click on "Create New Game" button
    const createGameButton = page.getByTestId('create-game-button');
    await createGameButton.click();

    // Check if error message is displayed
    const errorAlert = page.getByText('Error');
    await expect(errorAlert).toBeVisible();
    await expect(page.getByText('Failed to create lobby')).toBeVisible();

    // Verify we're still on the landing page
    await expect(page.getByTestId('landing-page')).toBeVisible();
  });

  test('should validate username is required for creating a game', async ({ page }) => {
    await page.goto('/');

    // Leave username empty
    const createGameButton = page.getByTestId('create-game-button');
    await createGameButton.click();

    // Check that error message is displayed
    const errorAlert = page.getByText('Error');
    await expect(errorAlert).toBeVisible();
    await expect(page.getByText('Please enter a username')).toBeVisible();
  });

});

