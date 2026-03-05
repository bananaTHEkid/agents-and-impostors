import { defineConfig, devices } from '@playwright/test';

/**
 * Environment configuration
 * Supports both development and production environments
 * 
 * Usage:
 * - Development (default): npm run test:e2e:dev
 * - Production: E2E_ENV=production npm run test:e2e:prod
 * - Custom ports: CLIENT_PORT=3000 SERVER_PORT=3001 npm run test:e2e
 */
const ENV = process.env.E2E_ENV || 'dev';
// Default to Vite on 5173 for both dev and preview, but allow override
const CLIENT_PORT = process.env.CLIENT_PORT || '5173';
const SERVER_PORT = process.env.SERVER_PORT || '5001';
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Determine if we're testing production build
const isProduction = ENV === 'production' || ENV === 'prod';

// Log configuration for debugging
if (!process.env.CI) {
  console.log(`[Playwright] Environment: ${ENV}, Client: ${CLIENT_URL}, Server: ${SERVER_URL}`);
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './src/__tests__/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['html'], ['github']] : 'html',
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: CLIENT_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    // Server (optional - set START_SERVER=true to enable, or run server manually)
    // Note: Server is optional because you might want to run it separately
    ...(process.env.START_SERVER === 'true' ? [{
      command: 'npm run dev',
      cwd: '../server',
      url: SERVER_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      stdout: 'pipe' as const,
      stderr: 'pipe' as const,
      env: {
        PORT: SERVER_PORT,
        NODE_ENV: 'development',
      },
    }] : []),
    
    // Client server - different commands for dev vs production
    ...(isProduction ? [
      // Production: build once, preview on the same port used in dev
      {
        command: `npm run build && npx vite preview --port ${CLIENT_PORT} --strict-port`,
        cwd: '.',
        url: CLIENT_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180000, // Longer timeout for build + preview
        stdout: 'pipe' as const,
        stderr: 'pipe' as const,
        env: {
          VITE_SERVER_URL: SERVER_URL,
          NODE_ENV: 'production',
        },
      }
    ] : [
      // Development: run dev server at the configured port (default 5173)
      {
        command: `npm run dev -- --host --port ${CLIENT_PORT}`,
        cwd: '.',
        url: CLIENT_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 40000,
        stdout: 'pipe' as const,
        stderr: 'pipe' as const,
        env: {
          VITE_SERVER_URL: SERVER_URL,
          NODE_ENV: 'development',
        },
      }
    ]),
  ],
});
