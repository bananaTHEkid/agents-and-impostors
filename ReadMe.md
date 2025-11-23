# Triple

## Table of Contents

- [Introduction](#introduction)
- [How to Play](#how-to-play)
- [Game Concepts](#game-concepts)
- [Operations](#operations)

## Introduction

Triple is an online multiplayer social deduction game where players are divided into teams and must work together to achieve their objectives while trying to identify and eliminate members of the opposing team.

## Game Concepts

### Teams

In Triple, players are secretly assigned to one of two teams:

- **Agents:** The majority of players are Agents. Their primary goal is to identify all Impostors among them and vote them out. Agents must use deduction, communication, and observation to uncover the Impostors.
- **Impostors:** A smaller group of players are Impostors. Their main objective is to deceive the Agents, avoid being voted out.

### Winning Conditions

#### Round Win Conditions

- **Agents win a round if:** 
  - The player voted out is an impostor.
- **Impostors win a round if:**
  - The player voted out is an agent.

### Game Rounds
- One Round consists of exactly three phases: 
1. starting Phase: The players are assigned an association and have to wait for further intel to play the game
2. operations phase: The players get an operations from the pool of operations available. There are rules to what operations are given out to players:
 - there are no duplicate operations
 - there is a limited amount of operations given out that change the objective for the respective player (hidden objectives)
 - one player only gets one operation

3. Voting Phase: every player has exactly one vote and can vote for anybody except himself. The player most voted is gettiong imprisoned.

- Based on the winning coditions of each player the result screen shows up and declares for each player if he lost or won his objective and what objective he got.

## Operations

Every player Gets exactly one operation. But these can vary in input style and nature of information. Operations can change the winning objective or reveal information about some players.

### 1. Confession

- **Description:** Allows a player to reveal their true team identity (e.g., Agent or Impostor) to another chosen player. This is a risky move that can build trust or expose you.
- **Player Information/Choice:** The player with this operation is presented with a list of other players in the game. They must choose one player to reveal their team identity to.
- **Outcome:** The chosen target player receives a notification indicating the team of the player who used the Confession. The player using the Confession does not receive any information in return. The other player get a notification to declare who the player chose.

### 2. Defector

- **Description:** Allows a player (Agent or Impostor) to attempt to switch their team. This operation introduces uncertainty and can shift the balance of power. The success or specific outcome (e.g., if the player knows their new team immediately) might vary.
- **Player Information/Choice:** The player with this operation is presented with a choice to try and defect to the opposing team.
- **Outcome:** If the player chooses to defect, their team alignment is changed by the server. The player is informed of their new team status. Other players are not directly informed of this change by the operation itself.

### 3. Grudge

- **Description:** The player receives a name. The player only wins if this player is voted out in the voting phase.
- **Player Information/Choice:** The player only receives the info of the playername.
- **Outcome:** The only change is the objective of the player receiving the operation.

### 4. Danish Intelligence

- **Description:** An operation that provides the player with information about the team alignment of two players that he chooses.
- **Player Information/Choice:** The player is presented with a list of other players and must select two players. The player is presented with these possible information: "both players are agents" or "one or more players is affiliated with impostors"
- **Outcome:** The player receives the information described above.

### 5. Old Photographs

- **Description:** This operation reveals to the player whether two chosen players are on the same team or different teams, without revealing their specific team alignments. This can help deduce relationships and potential Impostor pairings or confirm Agent alliances.
- **Player Information/Choice:** The player is given two nams chosen by the server. These names are guaranteed to be working togehter on the same team but it is not presented which team.
- **Outcome:** The player receives a message stating the two player names.
