import { startServer } from './server';

// Allow overriding the port via environment (used by Playwright webServer)
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5001;
startServer(port).catch(console.error);