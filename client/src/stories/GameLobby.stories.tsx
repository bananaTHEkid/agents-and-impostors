import React, { useEffect } from "react"
import type { Meta, StoryObj } from "@storybook/react"
import { SocketContext } from "@/contexts/SocketContext"
import GameLobby from "../components/GameLobby"
import { createMockSocket } from "./mockSocket"
import type { Player } from "@/types"

const basePlayers: Player[] = [
  { username: "Alice", isHost: true },
  { username: "Bob" },
  { username: "Charlie" },
  { username: "Dana" },
  { username: "Eli" },
]

const buildLobbyDecorator = (
  { username, isHost, players }: { username: string; isHost: boolean; players: Player[] }
) =>
  function LobbyDecorator(Story: React.ComponentType) {
    const lobbyCode = "TRPL42"
    const socket = createMockSocket({
      events: {
        connect: undefined,
        "player-list": { players },
      },
      emitResponses: {
        "get-lobby-players": { players },
        "join-lobby": { success: true, lobbyCode },
        "leave-lobby": { success: true },
        "start-game": { success: true },
      },
    })

    useEffect(() => {
      sessionStorage.setItem("username", username)
      sessionStorage.setItem("isHost", isHost ? "true" : "false")
      sessionStorage.setItem("lobbyCode", lobbyCode)
      return () => {
        sessionStorage.clear()
      }
    }, [username, isHost])

    return (
      <SocketContext.Provider value={{ socket, isConnected: true, connect: () => {}, disconnect: () => {} }}>
        <Story />
      </SocketContext.Provider>
    )
  }

const meta: Meta<typeof GameLobby> = {
  title: "Screens/GameLobby",
  component: GameLobby,
  parameters: { layout: "fullscreen" },
}

export default meta

type Story = StoryObj<typeof GameLobby>

export const HostView: Story = {
  args: {
    lobbyCode: "TRPL42",
    onExitLobby: () => console.log("Exit lobby"),
  },
  decorators: [buildLobbyDecorator({ username: "Alice", isHost: true, players: basePlayers })],
}

export const GuestView: Story = {
  args: {
    lobbyCode: "TRPL42",
    onExitLobby: () => console.log("Exit lobby"),
  },
  decorators: [
    buildLobbyDecorator({
      username: "Dana",
      isHost: false,
      players: basePlayers.map((p) => (p.username === "Alice" ? { ...p, isHost: true } : p)),
    }),
  ],
}
