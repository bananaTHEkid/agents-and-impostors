import {test, expect} from '@playwright/test';

test.describe('Landing Page', () => {
  test('should load and display essential elements', async ({ page }) => {
    // Navigate to the base URL
    await page.goto('/');

    // Validate page title
    await expect(page).toHaveTitle('Agent Game');

    // Validate the main container
    const landingPageContainer = page.getByTestId('landing-page');
    await expect(landingPageContainer).toBeVisible();

    // Validate welcome message
    await expect(page.getByText('Welcome to Triple')).toBeVisible();
    await expect(page.getByText('Join or create a game to get started')).toBeVisible();
  });

  test('should show error when joining with empty lobbycode', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Username' }).click();
    await page.getByRole('textbox', { name: 'Username' }).fill('A');
    await page.getByRole('textbox', { name: 'Lobby Code' }).click();
    await page.getByRole('textbox', { name: 'Lobby Code' }).fill('');
    await page.getByTestId('join-game-button').click();
    await expect(page.getByTestId('landing-page')).toContainText('Please fill in all fields');
  });

  test('should show error when joining with wrong lobbycode format', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Username' }).click();
    await page.getByRole('textbox', { name: 'Username' }).fill('ABC');
    await page.getByRole('textbox', { name: 'Lobby Code' }).click();
    await page.getByRole('textbox', { name: 'Lobby Code' }).fill('B');
    await page.getByTestId('join-game-button').click();
    await expect(page.getByTestId('landing-page')).toContainText('Invalid lobby code format');
  });

  test('should be able to create lobby', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Username' }).click();
    await page.getByRole('textbox', { name: 'Username' }).fill('ABCD');
    await page.getByTestId('create-game-button').click();
    await page.getByText('1 Spieler').click();
  });
});
