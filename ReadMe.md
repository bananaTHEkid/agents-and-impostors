# The basic Flow of the server Transaction

## flowchart

flowchart TD
    %% ---------- 1. HTTP ----------
    subgraph HTTP_API
        A[Client POST createLobby] --> B[createLobby handler]
        B -->|insert lobby| DB[(SQLite)]
        B -->|return ids| A
    end

    %% ---------- 2. SOCKET.IO ----------
    subgraph SOCKET_IO
        %% JOIN LOBBY
        C[Client connect] -->|joinLobby| D[on joinLobby]
        D -->|add player| DB
        D -->|playerJoined| R{{LobbyRoom}}

        %% START GAME
        H[Host] -->|startGame| E[on startGame]
        E -->|minCheck| DB
        E -->|assignTeams| R
        E -->|privateOps| P((DM))
        E -->|setPhase TEAM_ASSIGN| DB
        E -->|phaseUpdated| R

        %% VOTING
        V[Voter] -->|submitVote| F[on submitVote]
        F -->|validateVote| DB
        F -->|storeVote| DB
        F -->|voteSubmitted| R
        F --> G{allVotes?}

        %% ROUND RESULTS
        G -- no --> R
        G -- yes --> CR[calcRound]
        CR -->|update elim & win| DB
        CR -->|roundResults| R

        %% NEXT ROUND / END
        CR --> GO{gameOver?}
        GO -- no --> NR[startNewRound]
        NR -->|reset state| DB
        NR -->|setPhase TEAM_ASSIGN| DB
        NR -->|newRound| R

        GO -- yes --> FR[finalResults]
        FR -->|compile stats| DB
        FR -->|gameResults| R
    end

## events and triggers

| Event                   | Type          | Description                                                                                               | Triggers                                                                     |
|-------------------------|---------------|-----------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| POST /create-lobby      | HTTP Endpoint | Creates a new game lobby with a unique ID and code. Stores the lobby and the first player in the database. | Responds with `lobbyId` and `lobbyCode`.                                     |
| join-lobby              | Socket Event  | Allows a player to join an existing lobby by providing a username and lobby code.                         | Emits `player-joined` to the lobby room or `error` if joining fails.         |
| start-game              | Socket Event  | Starts the game for a lobby. Assigns teams (impostors and agents) and assignments for players.            | Emits `team-assignment` and `operation-assigned`.                            |
| submit-vote             | Socket Event  | Submits a player's vote during the voting phase. Includes validation checks.                              | Emits `vote-submitted` and triggers round results calculation when all votes are in. |
| team-assignment         | Socket Emit   | Notifies players of their assigned teams (impostors and agents).                                          | Triggered by `start-game`.                                                   |
| operation-assigned      | Socket Emit   | Notifies a specific player of their assigned operation.                                                   | Triggered by `start-game`.                                                   |
| vote-submitted          | Socket Emit   | Notifies all players in the lobby that a vote has been submitted.                                         | Triggered by `submit-vote`.                                                  |
| new-round              | Socket Emit   | Notifies all players that a new round has started.                                                        | Triggered after round results calculation.                                   |
| game-results           | Socket Emit   | Sends the final game results including MVP and team scores to all players.                                | Triggered when game ends after final round.                                  |
| error                   | Socket Emit   | Sends an error message to the client.                                                                     | Triggered by any error in socket events.                                     |