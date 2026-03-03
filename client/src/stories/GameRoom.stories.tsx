import React, { useEffect } from "react"
import type { Meta, StoryObj } from "@storybook/react"
import GameRoom from "../components/GameRoom"
import { SocketContext } from "@/contexts/SocketContext"
import { createMockSocket } from "./mockSocket"
import { GamePhase, type GameState, type Player, type RoundResult } from "@/types"

const lobbyCode = "TRPL42"

const basePlayers: Player[] = [
  { username: "Alice", team: "agent", isHost: true },
  { username: "Bob", team: "agent" },
  { username: "Charlie", team: "impostor" },
  { username: "Dana", team: "agent" },
  { username: "Eli", team: "impostor" },
]

const waitingState: GameState = {
  phase: GamePhase.WAITING,
  round: 1,
  totalRounds: 3,
}

const operationState: GameState = {
  phase: GamePhase.OPERATION_ASSIGNMENT,
  round: 2,
  totalRounds: 3,
  currentTurnPlayer: "Alice",
}

const votingState: GameState = {
  phase: GamePhase.VOTING,
  round: 2,
  totalRounds: 3,
  votedPlayers: ["Alice", "Dana"],
}

const finalRound: RoundResult = {
  winner: "agent",
  eliminatedPlayers: ["Eli"],
  votes: { Alice: "Eli", Bob: "Eli", Charlie: "Dana", Dana: "Eli", Eli: "Dana" },
  roundNumber: 3,
}

const completedState: GameState = {
  phase: GamePhase.COMPLETED,
  results: [
    { username: "Alice", team: "agent", operation: "confession", win_status: "win" },
    { username: "Bob", team: "agent", operation: "secret intel", win_status: "win" },
    { username: "Charlie", team: "impostor", operation: "defector", win_status: "lose" },
    { username: "Dana", team: "agent", operation: "grudge", win_status: "win" },
    { username: "Eli", team: "impostor", operation: "sleeper agent", win_status: "lose" },
  ],
}

const buildRoomDecorator = ({
  username,
  gameState,
  players = basePlayers,
  operation,
  roundResult,
}: {
  username: string
  gameState: GameState
  players?: Player[]
  operation?: { name: string; info: Record<string, any>; used?: boolean }
  roundResult?: RoundResult
}) =>
  function RoomDecorator(Story: React.ComponentType) {
    const socket = createMockSocket({
      events: {
        connect: undefined,
        "game-state": gameState,
        "player-list": players,
        ...(operation
          ? {
              "operation-prepared": {
                operation: operation.name,
                info: operation.info,
              },
              "your-team": { team: 'agent' },
            }
          : {}),
        ...(roundResult
          ? {
              "game-end": {
                players: players.map((p) => ({
                  username: p.username,
                  team: p.team,
                  operation: p.operation,
                  winStatus: p.username === "Charlie" || p.username === "Eli" ? "lose" : "win",
                })),
                overallWinner: "agent",
                roundResults: [roundResult],
              },
            }
          : {}),
      },
      emitResponses: {
        "get-game-state": gameState,
        "rejoin-game": { success: true },
        "submit-vote": { success: true },
      },
    })

    useEffect(() => {
      sessionStorage.setItem("username", username)
      sessionStorage.setItem("isHost", username === "Alice" ? "true" : "false")
      sessionStorage.setItem("lobbyCode", lobbyCode)
      sessionStorage.setItem("myTeam", "agent")
      sessionStorage.setItem("players", JSON.stringify(players))
      sessionStorage.setItem("gameData", JSON.stringify(gameState))
      if (operation) {
        sessionStorage.setItem("myOperation", JSON.stringify(operation))
      } else {
        sessionStorage.removeItem("myOperation")
      }
      return () => {
        sessionStorage.clear()
      }
    }, [username, players, gameState, operation])

    return (
      <SocketContext.Provider value={{ socket, isConnected: true, connect: () => {}, disconnect: () => {} }}>
        <Story />
      </SocketContext.Provider>
    )
  }

const meta: Meta<typeof GameRoom> = {
  title: "Screens/GameRoom",
  component: GameRoom,
  parameters: { layout: "fullscreen" },
}

export default meta

type Story = StoryObj<typeof GameRoom>

export const WaitingRoom: Story = {
  args: {
    lobbyCode,
    onExitGame: () => console.log("Exit game"),
  },
  decorators: [buildRoomDecorator({ username: "Alice", gameState: waitingState })],
}

export const OperationTurn: Story = {
  args: {
    lobbyCode,
    onExitGame: () => console.log("Exit game"),
  },
  decorators: [
    buildRoomDecorator({
      username: "Alice",
      gameState: operationState,
      players: basePlayers.map((p) => (p.username === "Alice" ? { ...p, isCurrentTurn: true } : p)),
      operation: {
        name: "confession",
        info: {
          availablePlayers: basePlayers.filter((p) => p.username !== "Alice").map((p) => p.username),
          message: "Wähle einen Spieler, dem du dein Team beichtest.",
          hint: "Die Beichte ist nur für den gewählten Spieler sichtbar.",
          myTeam: "agent",
        },
        used: false,
      },
    }),
  ],
}

const makeOperationStory = (
  name: string,
  info: Record<string, any>,
  username = "Alice"
): Story => ({
  args: {
    lobbyCode,
    onExitGame: () => console.log("Exit game"),
  },
  decorators: [
    buildRoomDecorator({
      username,
      gameState: operationState,
      players: basePlayers.map((p) => (p.username === username ? { ...p, isCurrentTurn: true } : p)),
      operation: { name, info, used: false },
    }),
  ],
})

export const OperationConfession = makeOperationStory("confession", {
  availablePlayers: basePlayers.filter((p) => p.username !== "Alice").map((p) => p.username),
  message: "Beichte dein Team an eine Person deiner Wahl.",
  hint: "Nur diese Person sieht deine Zugehörigkeit.",
  myTeam: "agent",
})

export const OperationDefector = makeOperationStory("defector", {
  availablePlayers: basePlayers.filter((p) => p.username !== "Bob").map((p) => p.username),
  message: "Wähle einen Spieler, dessen Team du umkehren möchtest.",
  hint: "Wirkt nur, wenn die Runde erfolgreich ist.",
  myTeam: "impostor",
}, "Bob")

export const OperationDanishIntel = makeOperationStory("danish intelligence", {
  availablePlayers: basePlayers.filter((p) => p.username !== "Dana").map((p) => p.username),
  message: "Wähle zwei Spieler zum Abgleich ihrer Zugehörigkeit.",
  hint: "Du erfährst, ob sie im selben Team sind.",
}, "Dana")

export const OperationSecretIntel = makeOperationStory("secret intel", {
  message: "Fordere einen Hinweis an, ob mindestens einer der beiden Verdächtigen Hochstapler ist.",
  hint: "Ergebnis erscheint nach Bestätigung automatisch.",
  revealed: { message: "Ergebnis: Genau einer der Verdächtigen ist Hochstapler." },
})

export const OperationGrudge = makeOperationStory("grudge", {
  message: "Dein Sieg hängt daran, dass dein Ziel eliminiert wird.",
  hint: "Du gewinnst, wenn das Ziel herausgewählt wird.",
  grudgeTarget: "Charlie",
})

export const VotingPhase: Story = {
  args: {
    lobbyCode,
    onExitGame: () => console.log("Exit game"),
  },
  decorators: [
    buildRoomDecorator({
      username: "Dana",
      gameState: votingState,
      players: basePlayers,
    }),
  ],
}

export const CompletedGame: Story = {
  args: {
    lobbyCode,
    onExitGame: () => console.log("Exit game"),
  },
  decorators: [
    buildRoomDecorator({
      username: "Alice",
      gameState: completedState,
      players: completedState.results?.map((r) => ({ username: r.username, team: r.team as Player["team"], operation: r.operation })) || basePlayers,
      roundResult: finalRound,
    }),
  ],
}
