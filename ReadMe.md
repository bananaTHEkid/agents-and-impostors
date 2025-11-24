# Triple

## Table of Contents

- [Introduction](#introduction)
- [Ruleset (Codebase)](#ruleset-codebase)
- [Operations (implemented)](#operations-implemented)
- [Developer notes / where to look in code](#developer-notes--where-to-look-in-code)

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

The repository implements a variety of operations which can be assigned to players. Operations are defined in `server/src/game-logic/config.ts` under `OPERATION_CONFIG` and referenced in `GAME_CONFIG.OPERATIONS`. Notable operations and their implemented effects:

- `grudge` – Server selects a target for the player; if that target is among the logically eliminated players (i.e., voted out in the round), the grudge-holder is marked as `win` (their `win_status` is updated). The operation uses the computed round result rather than persisted elimination flags.
- `infatuation` – A player becomes tied to a target player: after the round, the infatuated player's win status is set to match their target's win status.
- `sleeper agent` – Appears to be on one team but is actually on the opposite team; `modifyWinCondition` flips the player's team on processing (and is marked to avoid double application).
- `anonymous tip` – Server reveals a player's name and team field in the player's `operation_info` (no direct win-condition change).
- `danish intelligence` – Server reveals one impostor and one agent (or fails if not enough players), and marks intel as revealed in the player's `operation_info`.
- `confession` – Player chooses another player to reveal their team to (operation implementation prepares available players; processing is no-op in modifyWinCondition stub).
- `old photographs` – Server picks two same-team players and reveals they are on the same team (team identity not revealed), marks operation info as revealed.
- `defector` – Allows selecting a target player to flip to the opposite team; server updates the target's `team` when processed.
- `scapegoat` – The player with this operation wins only if they are voted out (determined from the round's vote tally). The operation uses the in-memory round result to set `win_status` rather than relying on a persisted `eliminated` flag.
- `secret intel` – Choose two players to investigate; server reveals results depending on their teams and stores it in `operation_info`.
- `secret tip` – Server picks a random player and reveals their association (no win-condition change).

Note: Each operation may have a `modifyWinCondition` hook that runs after votes are tallied. Hooks receive the computed `roundResult` (which contains the logically eliminated players) and should use that in-memory information to adjust `win_status` or teams. For backward compatibility some hooks may fall back to DB flags if present, but current single-round mode prefers the `roundResult` and does not persist eliminations between games. Operations are intentionally applied server-side to avoid client tampering.

## Developer notes / where to look in code

- Operation definitions and generation: `server/src/game-logic/config.ts` (`GAME_CONFIG` and `OPERATION_CONFIG`).
- Core round logic, voting validation, assignment, and result calculation: `server/src/game-logic/gameService.ts`.
- Vote validation helpers: `server/src/utils/validators.ts`.
- Types and phase enums: `server/src/game-logic/types.ts`.

---

_Updated to reflect code implementation (inspected `server/src/game-logic/config.ts` and `server/src/game-logic/gameService.ts`)._

