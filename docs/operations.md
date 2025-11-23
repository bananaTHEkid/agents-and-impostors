## Operations Phase — Assignment & Reveal (Server Guide)

Purpose
- Explain how teams and operations are assigned at game start, how operation info is prepared and persisted, and the sequential reveal mechanics used by the server.

Overview
- Teams (agents / impostors) and a single operation per player are assigned server-side when a game starts.
- Operation info is prepared on the server and persisted as an immutable JSON blob (`players.operation_info`).
- Operations are revealed sequentially to players to avoid chaos; some operations are marked `hidden` and show only as a generic placeholder to the room.

Sequence (high level)
1. `start-game` request -> server validates and updates lobby state.
2. `assignTeamsAndOperations()` picks impostors (per `GAME_CONFIG.IMPOSTOR_THRESHOLDS`) and selects an operation for each player; writes `team` and `operation` into DB inside a transaction.
3. `generateOperationInfo()` runs the operation-specific `generateInfo` functions. If the generator returns `availablePlayers`, the server selects final targets (random by default), writes the final `operation_info` to DB, and emits `operation-prepared` to the player socket (if connected).
4. The server begins sequential reveal: for each player, emit a room-level placeholder `operation-assigned-public` (shows real name for non-hidden ops or the literal `"hidden operation"` for hidden ops), then send the actual `operation-assigned` event to the player's socket. The player replies with `accept-assignment` to continue the sequence.
5. If a player is disconnected at their turn, the server auto-marks them as assigned + accepted and continues. Persisted `operation_info` remains and will be delivered when they reconnect.
6. When all players are assigned/accepted, server sets lobby `phase = VOTING` and emits `phase-change` to begin voting.

DB fields involved
- `players.team` — `'agent' | 'impostor'` (assigned at round start)
- `players.operation` — operation name string (assigned at round start)
- `players.operation_info` — JSON blob containing final, server-chosen operation details
- `players.operation_assigned` — boolean/int: whether the player was presented with the operation
- `players.operation_accepted` — boolean/int: whether the player acknowledged the operation

Socket events (server → clients)
- `your-team` — personal: `{ team, message }` with player's own team
- `operation-prepared` — personal: `{ operation, info }` final server-chosen details (persisted)
- `operation-assigned-public` — room: `{ player, operation }` placeholder for UI; `operation` is either operation name or `"hidden operation"`
- `operation-assigned` — personal: `{ operation }` delivered to the actor
- `phase-change` — room: used to transition to `VOTING`

Hidden operation policy
- Operations listed as `hidden: true` in `GAME_CONFIG.OPERATIONS` are represented to the room with `operation: "hidden operation"` in `operation-assigned-public`.
- The receiving player still gets the real operation via `operation-assigned` and `operation-prepared` privately.

Server choice & immutability
- When an operation generator returns an `availablePlayers` list (i.e., expects a choice), the server picks final targets and persists them into `operation_info`. This prevents players from changing choices during the sequential reveal.

Disconnected-player policy
- If a player is disconnected during sequential assignment, the server auto-marks `operation_assigned = 1` and `operation_accepted = 1` for them and continues revealing to the next player.
- Their `operation_info` is still stored and will be delivered when they reconnect.

Example (5-player flow)
- Server picks 2 impostors and 3 agents and assigns operations (some hidden):
  - Alice: `grudge` (hidden)
  - Bob: `confession`
  - Carol: `secret tip` (hidden)
  - Dave: `old photographs`
  - Eve: `defector` (hidden)
- Server persists chosen targets (e.g., grudgeTarget) for hidden ops and emits `operation-prepared` to each player socket when possible.
- Sequential reveal emits `operation-assigned-public` for Alice (`hidden operation`) and sends Alice the actual op privately; Alice accepts; repeat for Bob (public `confession`) and so on.

Testing checklist
- Unit tests:
  - `assignTeamsAndOperations` writes `team` and `operation` for every player.
  - `generateOperationInfo` persists server-chosen targets for ops with `availablePlayers`.
- Integration/e2e:
  - Start a game with N players, disconnect one socket, ensure server auto-accepts and sequence completes.
  - Verify `operation-assigned-public` shows `"hidden operation"` for hidden ops.
  - Reconnect after auto-accept: ensure `operation-prepared` is replayed to the reconnecting player.

Notes & next steps
- Visibility config: currently non-hidden ops are revealed publicly in `operation-assigned-public`. If you prefer all ops to stay private, change the server to omit operation names in that event.
- Audit/logging: consider adding an `operations_log` table for replay and spectating.

Document created to match server implementation in `server/src/game-logic` and `server/src/server.ts`.
