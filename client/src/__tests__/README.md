# Test Structure

This directory contains all tests for the client application, organized into clear categories.

## Directory Structure

```
__tests__/
├── unit/          # Unit tests (Vitest)
│   ├── App.test.tsx
│   ├── GameLobby.test.tsx
│   ├── GameRoom.test.tsx
│   └── LandingPage.test.tsx
├── e2e/           # End-to-end tests (Playwright)
│   ├── gameLobby.spec.ts
│   ├── gameRoom.spec.ts
│   └── landing-page.spec.ts
└── utils/         # Test utilities and setup
    └── setup.tsx  # Shared test setup and mocks
```

## Running Tests

### Unit Tests

```bash
npm run test:unit        # Run unit tests in watch mode
npm run test:unit -- --run  # Run unit tests once
npm run test:coverage   # Run with coverage report
```

### E2E Tests

```bash
npm run test:e2e        # Run e2e tests in development mode (default)
npm run test:e2e:dev    # Run e2e tests in development mode
npm run test:e2e:prod   # Run e2e tests against production build
npm run test:e2e:ci     # Run e2e tests in CI mode (with retries)
```

### All Tests

```bash
npm test               # Run both unit and e2e tests
```

## Test Configuration

### Unit Tests (Vitest)

- Configuration: `vitest.config.ts`
- Test files: `**/__tests__/unit/**/*.test.{ts,tsx}`
- Setup file: `src/__tests__/utils/setup.tsx`
- Environment: jsdom (browser-like environment)

### E2E Tests (Playwright)

- Configuration: `playwright.config.ts`
- Test directory: `src/__tests__/e2e`
- Base URL: `http://localhost:5000` (configurable via `CLIENT_PORT`)
- Supports both **development** and **production** environments
- Automatically starts dev/production server before tests
- See [e2e/README.md](./e2e/README.md) for detailed configuration

## Test Utilities

The `utils/setup.tsx` file provides:

- Mock Socket.IO client for unit tests
- Socket event trigger helpers
- Mock React Context providers
- Shared test configuration

## Best Practices

1. **Unit Tests**: Test individual components in isolation with mocked dependencies
2. **E2E Tests**: Test complete user flows and interactions
3. **Test Organization**: Keep tests close to the code they test, but organized by type
4. **Shared Utilities**: Place reusable test helpers in `utils/`
