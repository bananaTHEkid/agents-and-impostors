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

  - what the player needs to do: no input from the player
  - what the player sees: name of one player

- `infatuation` – A player becomes tied to a target player: after the round, the infatuated player's win status is set to match their target's win status.

  - what the player needs to do: no input from the player
  - what the player sees: name of one player

- `sleeper agent` – Appears to be on one team but is actually on the opposite team; `modifyWinCondition` flips the player's team on processing (and is marked to avoid double application).

  - what the player needs to do: no input from the player
  - what the player sees: no additional info needed

- `anonymous tip` – Server reveals a player's name and team field in the player's `operation_info` (no direct win-condition change).

  - what the player needs to do: no input from the player
  - what the player sees: name + actual team of the player

- `danish intelligence` – Server reveals one impostor and one agent (or fails if not enough players), and marks intel as revealed in the player's `operation_info`.

  - what the player needs to do: select two different player (not himself)
  - what the player sees: if either 1. one ore more players or 2. no players are impostors


- `confession` – Player chooses another player to reveal their team to.

  - what the player needs to do: select one player (not himself)
  - what the player sees: no additional info needed
  - what the target player sees: name of the player and their team

- `old photographs` – Server picks two same-team players and reveals they are on the same team (team identity not revealed), marks operation info as revealed.

  - what the player needs to do: no input from the player
  - what the player sees: names of two players

- `scapegoat` – The player with this operation wins only if they are voted out (determined from the round's vote tally). The operation uses the in-memory round result to set `win_status` rather than relying on a persisted `eliminated` flag.

  - what the player needs to do: no input from the player
  - what the player sees: name of one player

- `defector` - The player chooses another player and joins their team

  - what the player needs to do: select one player
  - what the player sees: no additional info, the player has to guess what team he is on now

Note: Each operation may have a `modifyWinCondition` hook that runs after votes are tallied. Hooks receive the computed `roundResult` (which contains the logically eliminated players) and should use that in-memory information to adjust `win_status` or teams. For backward compatibility some hooks may fall back to DB flags if present, but current single-round mode prefers the `roundResult` and does not persist eliminations between games. Operations are intentionally applied server-side to avoid client tampering.

## Developer notes / where to look in code

- Operation definitions and generation: `server/src/game-logic/config.ts` (`GAME_CONFIG` and `OPERATION_CONFIG`).
- Core round logic, voting validation, assignment, and result calculation: `server/src/game-logic/gameService.ts`.
- Vote validation helpers: `server/src/utils/validators.ts`.
- Types and phase enums: `server/src/game-logic/types.ts`.

---

_Updated to reflect code implementation (inspected `server/src/game-logic/config.ts` and `server/src/game-logic/gameService.ts`)._

