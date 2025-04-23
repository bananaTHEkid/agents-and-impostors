import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { motion } from "framer-motion";
import LandingPage from "./components/LandingPage.tsx";
import GameLobby from "./components/GameLobby.tsx";
import GameRoom from "./components/GameRoom.tsx";

const socket: Socket = io("http://localhost:5000");

enum View {
  Landing,
  Lobby,
  Game,
}

const App = () => {
  const [view, setView] = useState<View>(View.Landing);
  const [lobbyCode, setLobbyCode] = useState("");
  const [username, setUsername] = useState("");
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    socket.on("team-assignment", (data) => addMessage(`Team assigned: ${data.team}`));
    socket.on("operation-assigned", (data) => addMessage(`Operation assigned: ${data.operation}`));
    socket.on("operation-phase-complete", () => addMessage("Operation phase completed."));
    socket.on("vote-submitted", () => addMessage("A vote was submitted."));
    socket.on("game-results", (data) => addMessage(`Game results: ${JSON.stringify(data)}`));
    socket.on("error", (err) => addMessage(`Error: ${err.message || err}`));
    
    socket.on("player-joined", (data) => {
      addMessage(`${data.username} joined lobby.`);
    });
    
    socket.on("join-success", (data) => {
      setLobbyId(data.lobbyId);
      setLobbyCode(data.lobbyCode);
      addMessage(`Successfully joined lobby: ${data.lobbyCode}`);
      setView(View.Lobby);
    });

    return () => {
      socket.disconnect();
      socket.off("team-assignment");
      socket.off("operation-assigned");
      socket.off("operation-phase-complete");
      socket.off("vote-submitted");
      socket.off("game-results");
      socket.off("error");
      socket.off("player-joined");
      socket.off("join-success");
    };
  }, []);

  const addMessage = (msg: string) => {
    setMessages((prev) => [...prev, msg]);
  };

  const handleJoinGame = (code: string) => {
    setLobbyCode(code);
    setView(View.Lobby);
  };

  const handleStartGame = () => {
    socket.emit("start-game", { lobbyCode });
    setView(View.Game);
  };

  const handleExitGame = () => {
    setView(View.Landing);
    setLobbyCode("");
    setLobbyId(null);
    setMessages([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 flex items-center justify-center">
      {view === View.Landing && (
        <LandingPage onJoinGame={handleJoinGame} />
      )}
      {view === View.Lobby && (
        <GameLobby 
          lobbyCode={lobbyCode}
          onStartGame={handleStartGame}
          onExitLobby={handleExitGame}
        />
      )}
      {view === View.Game && (
        <GameRoom 
          lobbyCode={lobbyCode}
          onExitGame={handleExitGame}
        />
      )}
    </div>
  );
};

export default App;
