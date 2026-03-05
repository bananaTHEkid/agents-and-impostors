# Triple

Online multiplayer social-deduction game with one-round matches, hidden operations, and server-driven logic. This README is a quick start and map to deeper docs.

- **Docs index:** See [docs/README.md](docs/README.md) for all docs.
- **Deep-dive (operations, flow, adding ops):** See [docs/operations.md](docs/operations.md).

## What you get
- Single-round games (lobby → assignment → operations → voting → results → cleanup)
- 5–10 players; impostor count scales by lobby size
- Server-assigned operations (some hidden) that can alter info or win conditions
- Socket-driven realtime updates; per-game data wiped after each round

## Quick start
Prereqs: Node 18+.

```bash
# Server
cd server
npm install
npm run build
npm run dev   # default port 5001

# Client
cd ../client
npm install
npm run dev   # default port 5173 (override with CLIENT_PORT)
```

## Docker
```bash
docker compose build --no-cache client  # rebuild to bake VITE_SERVER_URL
docker compose up -d

# Open
# Client: http://localhost:3000
# Server API / socket: http://localhost:5001
```
- Client bundle is built with `VITE_SERVER_URL=http://localhost:5001` (set in compose). Change that value and rebuild the client if your server runs elsewhere.
- Server CORS origins are set in compose (`CLIENT_ORIGIN`) to allow the client at `http://localhost:3000`.

## Testing
- Unit: `cd client && npm run test:unit`
- E2E (auto-start servers): `cd client && START_SERVER=true CLIENT_PORT=5173 SERVER_PORT=5001 npm run test:e2e`
- E2E dev-only: `cd client && npm run test:e2e:dev` (reuses existing servers if running)

## Configuration
| Name | Where | Default | Purpose |
| --- | --- | --- | --- |
| JWT_SECRET | server | (none) | Required for lobby access tokens |
| CLIENT_ORIGIN | server | http://localhost:5173,http://127.0.0.1:5173 | Allowed CORS origins |
| PORT | server | 5001 | Server listen port |
| VITE_SERVER_URL | client | http://localhost:5001 | API base used by the client |
| CLIENT_PORT | tests/client dev | 5173 | Port for Playwright/Vite dev server |
| SERVER_PORT | tests | 5001 | Port for Playwright-started server |

## How the game resolves a round
- Votes: one per player (no self-votes). Highest vote count marks logically eliminated players (ties allowed).
- Operations: server applies operation hooks after votes to adjust teams/win states.
- Results: server emits final payload, then deletes per-game data (players, votes, rounds) to keep games ephemeral.

## Code map
- Core game logic: [server/src/game-logic](server/src/game-logic)
- Socket and HTTP setup: [server/src/server.ts](server/src/server.ts) and [server/src/socket.ts](server/src/socket.ts)
- Client app: [client/src](client/src)
- Operations deep dive and how-to-add: [docs/operations.md](docs/operations.md)

## Security notes
- Set a strong `JWT_SECRET` in server env.
- Set `CLIENT_ORIGIN` to your deployed frontend in production; tighten rate limits as needed.


