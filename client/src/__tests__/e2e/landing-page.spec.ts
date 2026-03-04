import {test, expect} from '@playwright/test';

test.describe('Landing Page', () => {
  test('should load and display essential elements', async ({ page }) => {
    // Navigate to the base URL
    await page.goto('/');

    // Validate page title
    await expect(page).toHaveTitle('Triple Spiel');

    // Validate the main container and header
    const landingPageContainer = page.getByTestId('landing-page');
    await expect(landingPageContainer).toBeVisible();
    await expect(page.getByText('Triple Game')).toBeVisible();
  });

  test('should show error when joining with empty lobbycode', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Username' }).click();
    await page.getByRole('textbox', { name: 'Username' }).fill('A');
    await page.getByRole('textbox', { name: 'Lobby Code' }).click();
    await page.getByRole('textbox', { name: 'Lobby Code' }).fill('');
    await page.getByTestId('join-game-button').click();
    await expect(page.getByTestId('landing-page')).toContainText('Bitte fülle alle Felder aus');
  });

  test('should show error when joining with wrong lobbycode format', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Username' }).click();
    await page.getByRole('textbox', { name: 'Username' }).fill('ABC');
    await page.getByRole('textbox', { name: 'Lobby Code' }).click();
    await page.getByRole('textbox', { name: 'Lobby Code' }).fill('B');
    await page.getByTestId('join-game-button').click();
    await expect(page.getByTestId('landing-page')).toContainText('Ungültiges Format des Lobby-Codes');
  });

  test('should be able to create lobby', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Username' }).click();
    await page.getByRole('textbox', { name: 'Username' }).fill('ABCD');
    await page.getByTestId('create-game-button').click();
    await page.getByText('1 Spieler').click();
  });
});
