# E2E Test Configuration

This directory contains end-to-end tests that verify the application works correctly in both development and production environments.

## Environment Support

The e2e tests support running in both **development** and **production** environments:

### Development Environment (Default)

- Uses Vite dev server
- Faster startup
- Hot module replacement enabled
- Source maps available

### Production Environment

- Builds the application first
- Serves production build using `vite preview`
- Tests the actual production bundle
- Verifies production optimizations work correctly

## Running Tests

### Development Environment (Default)

**Important:** By default, the e2e tests assume the backend server is already running. Start it manually first:

```bash
# In a separate terminal, start the server:
cd ../server && npm run dev

# Then in the client directory, run tests:
npm run test:e2e:dev
# or simply
npm run test:e2e
```

**Or** let Playwright start the server automatically:

```bash
npm run test:e2e:dev:with-server
```

### Production Environment

```bash
npm run test:e2e:prod
```

### CI Environment

```bash
npm run test:e2e:ci
```

## Environment Variables

You can configure the test environment using environment variables:

- `E2E_ENV`: Set to `dev` (default) or `production`/`prod`
- `CLIENT_PORT`: Port for the client server (default: `5000`)
- `SERVER_PORT`: Port for the backend server (default: `5001`)
- `START_SERVER`: Set to `true` to automatically start the backend server (default: `false` - assumes server is running)
- `CI`: Automatically set in CI environments, enables retries and different reporting

## Test Structure

- `landing-page.spec.ts`: Tests for the landing page functionality
- `gameLobby.spec.ts`: Tests for game lobby creation and player joining
- `gameRoom.spec.ts`: Tests for game room functionality and game start

## Best Practices

1. **Use baseURL**: All tests use relative URLs (`/`) which automatically use the configured `baseURL`
2. **Wait for network**: Use `waitForLoadState('networkidle')` before interacting with socket-dependent features
3. **Cleanup**: Always close browser contexts and pages in cleanup sections
4. **Timeouts**: Use appropriate timeouts for async operations (socket connections, game state changes)

## Troubleshooting

### Tests fail to start

- Ensure ports 5000 and 5001 are available
- Check that the server directory exists and has `npm run dev` script
- Verify Node.js and npm are installed

### Socket connection issues

- **Most common issue**: The backend server must be running before starting tests
  - Start the server manually: `cd ../server && npm run dev`
  - Or use: `npm run test:e2e:dev:with-server` to start it automatically
- Check that `VITE_SERVER_URL` environment variable is set correctly
- Verify network connectivity between client and server
- Ensure the server is listening on the correct port (default: 5001)

### Production build fails

- Ensure all dependencies are installed
- Check for TypeScript errors: `npm run build`
- Verify build output in `dist/` directory
