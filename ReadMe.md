# The basic Flow of the server Transaction

## flowchart

```mermaid
graph TD
    A[User] -->|Creates Lobby| B[POST /create-lobby]
    B -->|Generates lobbyId and lobbyCode| C[Database]
    B -->|Responds with lobbyId and lobbyCode| D[Frontend]

    A -->|Joins Lobby| E[Socket: join-lobby]
    E -->|Validates username and lobbyCode| F[Database]
    F -->|Adds player to lobby| G[Socket Emit: player-joined]
    G -->|Notifies all players| D

    A -->|Starts Game| H[Socket: start-game]
    H -->|Validates lobby and player count| I[Database]
    H -->|Assigns teams and operations| J[Socket Emit: team-assignment]
    J -->|Notifies players of teams| D
    H -->|Assigns operations| K[Socket Emit: operation-assigned]
    K -->|Notifies players of operations| D
    H -->|Operation phase complete| L[Socket Emit: operation-phase-complete]
    L -->|Notifies all players| D

    A -->|Submits Vote| M[Socket: submit-vote]
    M -->|Records vote| N[Database]
    M -->|Checks if all votes are in| O[Database]
    O -->|Calculates win conditions| P[calculateWinConditions]
    P -->|Updates player statuses| Q[Database]
    P -->|Sends game results| R[Socket Emit: game-results]
    R -->|Notifies all players| D
    P -->|Handles special operations| S[Operation Config]
```

## events and triggers

| Event                   | Type          | Description                                                                                               | Triggers                                                                     |
|-------------------------|---------------|-----------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| POST /create-lobby      | HTTP Endpoint | Creates a new game lobby with a unique ID and code. Stores the lobby and the first player in the database. | Responds with `lobbyId` and `lobbyCode`.                                     |
| join-lobby              | Socket Event  | Allows a player to join an existing lobby by providing a username and lobby code.                         | Emits `player-joined` to the lobby room or `error` if joining fails.         |
| start-game              | Socket Event  | Starts the game for a lobby. Assigns teams (impostors and agents) and assigns operations to players.       | Emits `team-assignment`, `operation-assigned`, and `operation-phase-complete`.|
| submit-vote             | Socket Event  | Submits a player's vote during the voting phase.                                                          | Emits `vote-submitted` and triggers `calculateWinConditions` if all votes are in. |
| team-assignment         | Socket Emit   | Notifies players of their assigned teams (impostors and agents).                                          | Triggered by `start-game`.                                                   |
| operation-assigned      | Socket Emit   | Notifies a specific player of their assigned operation.                                                   | Triggered by `start-game`.                                                   |
| operation-phase-complete| Socket Emit   | Notifies all players that the operation assignment phase is complete.                                     | Triggered by `start-game`.                                                   |
| vote-submitted          | Socket Emit   | Notifies all players in the lobby that a vote has been submitted.                                         | Triggered by `submit-vote`.                                                  |
| game-results            | Socket Emit   | Sends the final game results to all players in the lobby.                                                 | Triggered by `calculateWinConditions`.                                       |
| error                   | Socket Emit   | Sends an error message to the client.                                                                     | Triggered by any error in socket events like `join-lobby`, `start-game`, etc.|
