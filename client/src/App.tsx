import { useEffect, useState } from "react";
import { SocketProvider, useSocket } from "./contexts/SocketContext";
import LandingPage from "./components/LandingPage.tsx";
import GameLobby from "./components/GameLobby.tsx";
import GameRoom from "./components/GameRoom.tsx";

enum View {
  Landing,
  Lobby,
  Game,
}

const AppContent = () => {
  const { socket } = useSocket();
  const [view, setView] = useState<View>(View.Landing);
  const [lobbyCode, setLobbyCode] = useState("");

  useEffect(() => {
    if (!socket) return;

    socket.on("team-assignment", () => addMessage(`Team assigned`));
    socket.on("operation-assigned", (data) => addMessage(`Operation assigned: ${data.operation}`));
    socket.on("operation-phase-complete", () => addMessage("Operation phase completed."));
    socket.on("vote-submitted", () => addMessage("A vote was submitted."));
    socket.on("game-results", (data) => addMessage(`Game results: ${JSON.stringify(data)}`));
    socket.on("error", (err) => addMessage(`Error: ${err.message || err}`));
    
    socket.on("player-joined", (data) => {
      addMessage(`${data.username} joined lobby.`);
    });
    
    socket.on("join-success", (data) => {
      setLobbyCode(data.lobbyCode);
      addMessage(`Successfully joined lobby: ${data.lobbyCode}`);
      setView(View.Lobby);
    });

    return () => {
      socket.off("team-assignment");
      socket.off("operation-assigned");
      socket.off("operation-phase-complete");
      socket.off("vote-submitted");
      socket.off("game-results");
      socket.off("error");
      socket.off("player-joined");
      socket.off("join-success");
    };
  }, [socket]);

  const addMessage = (msg: string) => {
    console.log(msg); // Log messages instead of storing them
  };

  const handleJoinGame = (code: string) => {
    setLobbyCode(code);
    setView(View.Lobby);
  };

  const handleStartGame = () => {
    if (!socket) return;
    socket.emit("start-game", { lobbyCode });
    setView(View.Game);
  };

  const handleExitGame = () => {
    setView(View.Landing);
    setLobbyCode("");
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

const App = () => {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
};

export default App;
