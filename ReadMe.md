# Triple

## Table of Contents

- [Introduction](#introduction)
- [How to Play](#how-to-play)
- [Game Concepts](#game-concepts)
- [Operations](#operations)
- [HTTP API](#http-api)
- [Socket Events](#socket-events)
- [Server Architecture Overview](#server-architecture-overview)

## Introduction

Triple is an online multiplayer social deduction game where players are divided into teams and must work together to achieve their objectives while trying to identify and eliminate members of the opposing team.

## How to Play

### Accessing the Game

1.  Navigate to the game's landing page in your web browser.
2.  Enter a unique username to identify yourself in the game.

### Creating a New Game Lobby

1.  On the main screen, click the "Create Lobby" button.
2.  You will be automatically designated as the host of this new lobby.
3.  A unique lobby code will be displayed. Share this code with friends you want to invite to your game.

### Joining an Existing Game Lobby

1.  On the main screen, enter the lobby code you received into the designated field.
2.  Click the "Join Lobby" button.
3.  You will be taken to the game lobby screen.

### Game Lobby

1.  Once in the lobby, you will see a list of players who have joined.
2.  Wait for other players to join. A minimum number of players is required before the game can start (this minimum is displayed on screen or will be enforced by the host).
3.  If you are the host, you will see a "Start Game" button. Once the minimum player count is met, you can click this button to begin the game. All players will then be assigned their roles and objectives.

## Game Concepts

### Teams

In Triple, players are secretly assigned to one of two teams:

- **Agents:** The majority of players are Agents. Their primary goal is to identify all Impostors among them and vote them out. Agents must use deduction, communication, and observation to uncover the Impostors.
- **Impostors:** A smaller group of players are Impostors. Their main objective is to deceive the Agents, avoid being voted out, and survive until their numbers are equal to or greater than the number of Agents, or until a specific sabotage condition is met (if applicable to the game mode).

### Winning Conditions

#### Round Win Conditions

- **Agents win a round if:** All Impostors are successfully identified and voted out.
- **Impostors win a round if:**
  - The number of Impostors becomes equal to or greater than the number of remaining Agents.
  - A critical sabotage objective is completed by the Impostors (if applicable).
  - Agents fail to achieve their round-specific objectives (e.g., failing to prevent a major sabotage).

#### Overall Game Win Conditions

The overall game winner is typically determined by the team that wins the majority of the rounds. Specific game modes might have a final objective or a point system that determines the ultimate victor.

### Player Elimination

- During each round, players can discuss and then vote to eliminate a player they suspect of being an Impostor.
- Being voted out means the player is removed from the current round's activities (e.g., cannot participate in discussions, voting, or tasks for that round).
- Player eliminations are typically for the current round only. At the start of a new round, all players (including those previously eliminated) are usually brought back into the game for new team assignments and objectives, as indicated by the `startNewRound` event which resets player states. Eliminations primarily serve to determine the winner of that specific round.

### Game Rounds

- The game progresses in a series of rounds.
- **Start of a Round:** At the beginning of each round (after the first), team assignments may be shuffled (or remain the same, depending on game settings), new tasks or objectives might be assigned, and any players eliminated in the previous round are typically reset and brought back into play. The game phase is set (e.g., to `TEAM_ASSIGN`).
- **End of a Round:** A round ends when one of the round win conditions is met. Round results are calculated and displayed, and then the game either proceeds to a new round (triggering `newRound` event) or concludes if overall game win conditions are met (triggering `gameResults`).

## Operations

At the start of a round, some players may be assigned special "Operations". These are one-time actions that can significantly impact the game. The information and choices for an operation are presented to the player through a special UI prompt. Here are the currently known operations:

### 1. Confession

- **Description:** Allows a player to reveal their true team identity (e.g., Agent or Impostor) to another chosen player. This is a risky move that can build trust or expose you.
- **Player Information/Choice:** The player with this operation is presented with a list of other players in the game. They must choose one player to reveal their team identity to.
- **Outcome:** The chosen target player receives a notification indicating the team of the player who used the Confession. The player using the Confession does not receive any information in return.

### 2. Defector

- **Description:** Allows a player (Agent or Impostor) to attempt to switch their team. This operation introduces uncertainty and can shift the balance of power. The success or specific outcome (e.g., if the player knows their new team immediately) might vary.
- **Player Information/Choice:** The player with this operation is presented with a choice to try and defect to the opposing team.
- **Outcome:** If the player chooses to defect, their team alignment is changed by the server. The player is informed of their new team status. Other players are not directly informed of this change by the operation itself, but its effects might become apparent through gameplay.

### 3. Grudge

- **Description:** Allows a player to secretly mark another player with a "Grudge." The game mechanics then ensure that if the player who initiated the Grudge is eliminated by vote, the Grudged player is also eliminated. This can be used to deter others from voting for you or to ensure a suspected Impostor goes down with you.
- **Player Information/Choice:** The player with this operation sees a list of other players and can choose one to place a Grudge upon.
- **Outcome:** The chosen player is secretly marked with a Grudge. If the Grudge-initiator is voted out, the Grudged player is also eliminated from the round. The Grudged player is not directly notified that a Grudge has been placed on them until the effect triggers.

### 4. Danish Intelligence

- **Description:** An operation that provides the player with information about the team alignment of a chosen player. This is a powerful tool for an Agent to identify an Impostor or confirm an ally, or for an Impostor to identify a key Agent.
- **Player Information/Choice:** The player is presented with a list of other players and must select one target player to investigate.
- **Outcome:** The player receives information revealing the team (Agent or Impostor) of the selected target player.

### 5. Old Photographs

- **Description:** This operation reveals to the player whether two chosen players are on the same team or different teams, without revealing their specific team alignments. This can help deduce relationships and potential Impostor pairings or confirm Agent alliances.
- **Player Information/Choice:** The player is presented with a list of all other players and must select two distinct players.
- **Outcome:** The player receives a message stating whether the two chosen players are on the "Same Team" or "Different Teams".

## HTTP API

This section details the HTTP endpoints available.

### `POST /create-lobby`

- **Description:** Creates a new game lobby and registers the calling user as the first player (host).
- **Request Payload:**
  ```json
  {
    "username": "string"
  }
  ```
  - `username`: The desired display name for the player creating the lobby. Must be a non-empty string.
- **Response Payload (Success 201 Created):**
  ```json
  {
    "lobbyId": "string",
    "lobbyCode": "string",
    "playerId": "string"
  }
  ```
  - `lobbyId`: A unique identifier for the newly created lobby.
  - `lobbyCode`: A short, shareable code for others to join the lobby.
  - `playerId`: A unique identifier for the player session of the lobby creator.
- **Error Responses:**
  - `400 Bad Request`: If the `username` is missing, empty, or invalid.
  - `500 Internal Server Error`: If the server encounters an unexpected error during lobby creation.

## Socket Events

This table details the major Socket.IO events used in the game for communication between the client and server after joining a lobby.

| Event                   | Type                         | Description                                                                                                                                         | Triggers / Leads to                                                                                                                    |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Client -> Server**    |                              |                                                                                                                                                     |                                                                                                                                        |
| join-lobby              | Socket Event Client->Server  | Player requests to join an existing lobby. Carries `lobbyCode` and `username`.                                                                      | Server validates; on success, adds player, emits `player-joined` & `player-list`.                                                      |
| get-lobby-players       | Socket Event Client->Server  | Client requests the current list of players in its lobby.                                                                                           | Server emits `player-list` to the requesting client.                                                                                   |
| rejoin-game             | Socket Event Client->Server  | Player attempts to rejoin an existing game session. Carries `lobbyId` and `playerId`.                                                               | Server validates, sends `game-state` if successful, or `game-error`.                                                                   |
| get-game-state          | Socket Event Client->Server  | Client requests the full current game state for its lobby.                                                                                          | Server emits `game-state` to the requesting client.                                                                                    |
| start-game              | Socket Event Client->Server  | Host requests to start the game for the current lobby.                                                                                              | Server validates (e.g., min players), assigns teams/ops, emits `phase-change`, `team-assignment`, `operation-prepared`.                |
| submit-vote             | Socket Event Client->Server  | Player submits their vote to eliminate another player. Carries `voterId` and `votedPlayerId`.                                                       | Server validates vote, stores it, emits `player-voted` to lobby, `vote-submitted` to voter. If all votes in, calculates round results. |
| use-confession          | Socket Event Client->Server  | Player uses the "Confession" operation. Carries `targetPlayerId`.                                                                                   | Server processes operation, emits `operation-used` to user, may notify target.                                                         |
| use-defector            | Socket Event Client->Server  | Player uses the "Defector" operation.                                                                                                               | Server processes operation, changes player's team, emits `operation-used` & `game-message` to user.                                    |
| use-grudge              | Socket Event Client->Server  | Player uses the "Grudge" operation. Carries `targetPlayerId`.                                                                                       | Server processes operation, stores grudge, emits `operation-used` to user.                                                             |
| use-danish-intelligence | Socket Event Client->Server  | Player uses "Danish Intelligence". Carries `targetPlayerId`.                                                                                        | Server processes, emits `operation-used` with target's team to user.                                                                   |
| use-old-photographs     | Socket Event Client->Server  | Player uses "Old Photographs". Carries `targetPlayerId1`, `targetPlayerId2`.                                                                        | Server processes, emits `operation-used` with same/different team info.                                                                |
| **Server -> Client**    |                              |                                                                                                                                                     |                                                                                                                                        |
| player-joined           | Socket Emit Server->Lobby    | Notifies all players in a lobby that a new player has joined. Carries new player's info.                                                            | Triggered by successful `join-lobby`. Client updates player list.                                                                      |
| player-list             | Socket Emit Server->Lobby    | Sends the full list of players currently in the lobby.                                                                                              | Triggered by `get-lobby-players` or after a player joins/leaves.                                                                       |
| playerLeft              | Socket Emit Server->Lobby    | Notifies players in a lobby that a player has disconnected. Carries `playerId`.                                                                     | Triggered by client socket disconnection. Client updates player list.                                                                  |
| phase-change            | Socket Emit Server->Lobby    | Notifies all players in the lobby that the game phase has changed (e.g., "VOTING", "RESULTS"). Carries new phase.                                   | Triggered by game logic progression (e.g., `start-game`, all votes in).                                                                |
| team-assignment         | Socket Emit Server->Player   | (DM) Notifies a specific player of their assigned team (Agent/Impostor) and any Impostor teammates.                                                 | Triggered by `start-game` for each player.                                                                                             |
| operation-prepared      | Socket Emit Server->Player   | (DM) Notifies a specific player they have an operation available, with details needed to use it.                                                    | Triggered by `start-game` if player is assigned an operation.                                                                          |
| operation-used          | Socket Emit Server->Player   | (DM) Confirms to the player that their operation has been used and provides any direct result/feedback.                                             | Triggered after server processes a `use-*` operation event from the client.                                                            |
| player-voted            | Socket Emit Server->Lobby    | Notifies all players in the lobby that a specific player has submitted their vote (without revealing the vote itself). Carries `playerId` of voter. | Triggered by `submit-vote`. Client UI might show who has voted.                                                                        |
| vote-submitted          | Socket Emit Server->Player   | (DM) Confirms to the voting player that their specific vote was received.                                                                           | Triggered by `submit-vote` for the voter.                                                                                              |
| round-results           | Socket Emit Server->Lobby    | Sends results of a completed round (e.g., who was eliminated, which team won the round).                                                            | Triggered after all votes are processed and round outcome is determined.                                                               |
| new-round               | Socket Emit Server->Lobby    | Notifies all players that a new round has started. Resets relevant states.                                                                          | Triggered after round results, if game is not over.                                                                                    |
| game-results            | Socket Emit Server->Lobby    | Sends the final game results (e.g., overall winning team, MVP).                                                                                     | Triggered when overall game win conditions are met.                                                                                    |
| game-state              | Socket Emit Server->Player   | (DM) Sends the full current game state to a player. Used for rejoining or initial state sync.                                                       | Triggered by `get-game-state` or successful `rejoin-game`.                                                                             |
| game-message            | Socket Emit Server->Player   | (DM) Sends a generic message to a player (e.g., outcome of their Defector operation).                                                               | Used for various specific feedback messages to a single player.                                                                        |
| game-error              | Socket Emit Server->Player   | (DM) Sends an error message to a client (e.g., lobby full, invalid code, action failed).                                                            | Triggered by various error conditions on the server.                                                                                   |
| _error (legacy)_        | _Socket Emit Server->Player_ | _Previously: Sends an error message to the client._                                                                                                 | _Likely superseded by `game-error` for specific player errors._                                                                        |

## Server Architecture Overview

### Transaction Flowchart

This diagram illustrates the basic flow of client-server interactions, from creating a lobby via HTTP to real-time game events handled by Socket.IO.

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
