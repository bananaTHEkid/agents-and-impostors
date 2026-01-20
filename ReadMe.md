# Triple

## Introduction

Triple is an online multiplayer social-deduction game where players are secretly assigned to teams and receive one operation each that can provide information or change their win conditions. The rules below reflect the current implementation in the repository (server-side logic).

## Ruleset (Codebase)

- **Single-round / ephemeral games:** Games run exactly one round. A game starts from the lobby, proceeds through assignment/operations/voting, emits final results to clients, and then the server immediately cleans up per-game data (players, votes, rounds) for that lobby so nothing persists between games. See `server/src/game-logic/gameService.ts`.
- **Player counts:** Minimum players = `5`, Maximum players = `10`. (See `server/src/game-logic/config.ts` `GAME_CONFIG.MIN_PLAYERS` / `MAX_PLAYERS`.)
- **Impostor assignment:** Number of impostors is based on the lobby size per `GAME_CONFIG.IMPOSTOR_THRESHOLDS`:
  - 5–6 players: 2 impostors
  - 7–10 players: 3 impostors
- **Game flow (single round):**
  1. Team assignment (teams and each player's operation are set)
  2. Operations phase (server generates and persists operation info for each player)
  3. Voting phase (players cast one vote each)
  4. Results processing (votes are tallied, operations are processed using the computed round result, final results are emitted, then the server cleans up per-game data)
- **Operations:** Every player receives exactly one operation (server-chosen and persisted). Some operations are marked `hidden` in the config and may change a player's team or win condition. Operations are prepared server-side and delivered to players immutably (see `OPERATION_CONFIG` and `generateOperationInfo` in `server/src/game-logic/config.ts` and `gameService.ts`).

### Voting rules

- Each player (not disconnected) may cast exactly one vote for the single round.
- Players cannot vote for themselves.
- Votes are stored with the round number; once a vote is recorded the voter cannot vote again that round (server re-validates to avoid race conditions).

### Elimination & ties (logical only)

- After voting, the server tallies votes and identifies the maximum vote count.
- Any players whose vote count equals the maximum are treated as the logically "eliminated" players for the purposes of computing results (ties can eliminate multiple players in the logical result).

### Game winner determination

### Final results and cleanup

- The server composes a final results payload (per-player data, team scores, MVP, and the single round result) and emits it to the lobby before performing cleanup.
- Immediately after emitting final results, the server removes per-game data (players, votes, rounds) for the lobby so a new game starts from a clean lobby state. This ensures no persistent per-game state remains between games.
- See `calculateFinalResults` and `endRound` in `server/src/game-logic/gameService.ts`.

## Operations (implemented)

Operations are defined in `server/src/game-logic/config.ts` under `OPERATION_CONFIG` and referenced in `GAME_CONFIG.OPERATIONS`. Hidden operations are announced to the room as “hidden operation” during assignment but the receiving player gets the full details privately. See also the hidden policy in [docs/operations.md](docs/operations.md).

Current rotation (per `GAME_CONFIG.OPERATIONS`):

- `grudge` (hidden) — Server selects an opposing-team target. If that target is among the logically eliminated players (voted out), the grudge-holder is marked as `win`.
  - what the player needs to do: no input
  - what the player sees: name of one target

- `infatuation` (hidden) — Ties your outcome to a random target. After the round, your `win_status` is set to match the target’s `win_status`.
  - what the player needs to do: no input
  - what the player sees: name of one target

- `scapegoat` (hidden) — You only win if you are voted out (based on the round’s vote tally).
  - what the player needs to do: no input
  - what the player sees: a note about this special win condition

- `sleeper agent` (hidden) — You appear to be one team but are actually on the opposite team; on processing, your team flips once.
  - what the player needs to do: no input
  - what the player sees: displayed vs. true team message

- `secret tip` (hidden) — Receive one random player’s name and their actual team. No win-condition changes.
  - what the player needs to do: no input
  - what the player sees: name + team of one player

- `anonymous tip` — Receive a tip about a random player’s team; delivered privately and persisted in your operation info.
  - what the player needs to do: no input
  - what the player sees: name + team of one player

- `old photographs` — Reveals two players who are on the same team (team identity not revealed).
  - what the player needs to do: no input
  - what the player sees: names of two players on the same team

- `confession` — Choose one player; they privately receive your team confession.
  - what the player needs to do: select one player (not yourself)
  - what the player sees: confirmation of your action
  - what the target sees: your name and your team

- `danish intelligence` — Choose two players. If one or both are impostors, reveal; if both are agents, reveal; otherwise no reveal. The message includes names in all cases.
  - what the player needs to do: select two distinct players
  - what the player sees: summary with names (e.g., “Out of X and Y, one or more of them are impostors.” or “X and Y are both agents.”)

- `secret intel` — Same reveal logic as Danish Intelligence, but the server randomly picks two other players for you (no input).
  - what the player needs to do: no input (server picks two names)
  - what the player sees: summary with names per the same rules

- `unfortunate encounter` — Choose one player. Both of you receive the same standardized summary message including names about your combined status (either one or more impostors, or both agents). No win-condition changes.
  - what the player needs to do: select one player (not yourself)
  - what you and the target see: the same message with both names

- `spy transfer` — Choose one player. Your team and the target’s team are silently swapped. The target is not notified; you are not told the outcome.
  - what the player needs to do: select one player (not yourself)
  - what anyone sees: no reveal; the swap is processed silently

Deprecated / not in rotation:

- `defector` — Previously: choose a player and convert them to the opposite team. This operation is implemented in `OPERATION_CONFIG` but is not currently listed in `GAME_CONFIG.OPERATIONS`, so it is not assigned in games.

Note: Each operation may have a `modifyWinCondition` hook that runs after votes are tallied. Hooks receive the computed `roundResult` (which contains the logically eliminated players) and should use that in-memory information to adjust `win_status` or teams. Operations are applied server-side to avoid client tampering.

## Developer notes / where to look in code

- Operation definitions and generation: `server/src/game-logic/config.ts` (`GAME_CONFIG` and `OPERATION_CONFIG`).
- Core round logic, voting validation, assignment, and result calculation: `server/src/game-logic/gameService.ts`.
- Vote validation helpers: `server/src/utils/validators.ts`.
- Types and phase enums: `server/src/game-logic/types.ts`.

## Server Security & Setup (updated)

- Env vars: set `JWT_SECRET` (required) and optional `CLIENT_ORIGIN` (comma-separated origins for CORS).
- Security middleware: Helmet headers and simple rate limiting added.
- Token auth: `create-lobby` returns `accessToken`; `rejoin-game` requires a valid token matching `lobbyId` and `username`.

### Quick commands

```bash
# Server
cd server
npm install
npm run build
npm run dev

# Client
cd ../client
npm install
npm run dev
```

### Example `.env` for server

```
JWT_SECRET=replace-with-strong-secret
CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

### Notes

- Ensure the client uses the returned `accessToken` when reconnecting (passed to `rejoin-game`).
- For production, restrict `CLIENT_ORIGIN` to your deployed frontend and consider stronger rate limits.

## Client Notes (updated)

- Hosts receive `accessToken` on lobby creation and the client stores it in `sessionStorage`.
- The client passes `accessToken` to the server on `rejoin-game` when available.
- If a rejoin fails due to missing/invalid token, the client navigates back to the lobby so users can rejoin fresh.


