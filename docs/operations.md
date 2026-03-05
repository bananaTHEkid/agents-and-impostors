## Operations and game flow (server-facing)

This doc explains how the server assigns teams/operations, reveals them, processes votes, and how to extend the operation set. For high-level gameplay and setup, see the root [ReadMe](../ReadMe.md); for quick links, see [docs index](./README.md).

## Round flow (server view)
1) `start-game` -> validate lobby and set state.
2) `assignTeamsAndOperations()` picks impostors (per `GAME_CONFIG.IMPOSTOR_THRESHOLDS`) and writes `team` and `operation` to the DB transactionally.
3) `generateOperationInfo()` runs `generateInfo` for each op. If `availablePlayers` is returned, the server selects final targets, persists `operation_info`, and emits `operation-prepared` privately.
4) Sequential reveal: emit room-level `operation-assigned-public` (name or `"hidden operation"`), then send `operation-assigned` to the player. Player replies with `accept-assignment` to advance.
5) Disconnects: if a player is offline at their turn, mark `operation_assigned = 1` and `operation_accepted = 1`, keep their `operation_info`, and continue.
6) All accepted -> set lobby `phase = VOTING` and emit `phase-change`.
7) Voting: one vote per player, no self-votes; highest vote count marks logically eliminated players (ties allowed).
8) Resolution: apply each operation’s `modifyWinCondition` (if any) using the tallied round result, then emit final results and clean per-game tables (players, votes, rounds).

## Data and events
- DB fields: `players.team`, `players.operation`, `players.operation_info`, `players.operation_assigned`, `players.operation_accepted`.
- Socket events (server → clients): `your-team`, `operation-prepared`, `operation-assigned-public`, `operation-assigned`, `phase-change`.
- Hidden ops show as `operation: "hidden operation"` in `operation-assigned-public`; the real op is sent privately.

## Operations reference
Defined in `server/src/game-logic/config.ts` (`GAME_CONFIG.OPERATIONS` + `OPERATION_CONFIG`). Hidden ops are announced to the room as "hidden operation" but the receiving player gets the real details.

- grudge (hidden): server picks opposing-team target; if that target is eliminated, holder wins.
- infatuation (hidden): ties your win to a random target’s outcome.
- scapegoat (hidden): you only win if voted out.
- sleeper agent (hidden): team flips once on resolution.
- secret tip (hidden): reveal one player’s name and team.
- anonymous tip: reveal one player’s team privately.
- old photographs: reveal two players on the same team (team not stated).
- confession: pick a player; they receive your team confession.
- danish intelligence: pick two; reveal if one/both impostors or both agents.
- secret intel: server picks two; same reveal logic as danish intelligence.
- unfortunate encounter: pick one; both see standardized message about your combined status.
- spy transfer: pick one; silently swap teams.
- defector (implemented, not in rotation): pick one; convert to opposite team.

## Add a new operation (checklist)
1) Add entry to `GAME_CONFIG.OPERATIONS` and `OPERATION_CONFIG` in `server/src/game-logic/config.ts`.
2) Implement `generateInfo` (and optional `modifyWinCondition`) in `OPERATION_CONFIG`.
3) Decide hidden vs. public: set `hidden: true` to show "hidden operation" in public assignment.
4) If the op needs player choice, return `availablePlayers` and let the server pick/persist targets in `generateOperationInfo`.
5) Update client UI if new op needs bespoke messaging.
6) Add tests: target persistence, hook behavior, and reveal semantics.
