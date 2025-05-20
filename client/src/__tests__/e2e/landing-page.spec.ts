import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should load and display essential elements', async ({ page }) => {
    // Navigate to the base URL (e.g., http://localhost:5000)
    await page.goto('/');

    // Check the page title
    await expect(page).toHaveTitle('Vite + React + TS');

    // Check for the main landing page container
    const landingPageContainer = page.getByTestId('landing-page');
    await expect(landingPageContainer).toBeVisible();

    // Check for a welcome message
    await expect(page.getByText('Welcome to Triple')).toBeVisible();
  });
});
