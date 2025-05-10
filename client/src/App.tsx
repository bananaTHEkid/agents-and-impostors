import { useEffect, useState } from "react";
import { SocketProvider, useSocket } from "./contexts/SocketContext";
import LandingPage from "./components/LandingPage";
import GameLobby from "./components/GameLobby";
import GameRoom from "./components/GameRoom";
import {
  OperationAssignedData,
  GameResultsData,
  PlayerJoinedData,
  JoinSuccessData,
  ErrorData,
  GamePhase,
  PlayerRemovedData
} from "./types";

enum View {
  Landing,
  Lobby,
  Game,
}

interface TeamAssignmentData {
  team: string;
  phase?: GamePhase;
}

interface MessageData {
  message: string;
}

interface VoteData {
  username: string;
}

const AppContent = () => {
  const { socket } = useSocket();
  const [view, setView] = useState<View>(View.Landing);
  const [lobbyCode, setLobbyCode] = useState("");

  useEffect(() => {
    if (!socket) return;

    socket.on("team-assignment", (data: TeamAssignmentData) => {
      addMessage(`Team assigned: ${data.team}`);
    });

    socket.on("operation-assigned", (data: OperationAssignedData) => {
      addMessage(`Operation assigned: ${data.operation}`);
    });

    socket.on("operation-phase-complete", (data: MessageData) => {
      addMessage(data.message || "Operation phase completed.");
    });
    
    // Add handler for player kicked/removed events
          socket.on("player-removed", (data: PlayerRemovedData) => {
      addMessage(`${data.username} was removed from the game.`);
      if (data.username === sessionStorage.getItem("username")) {
        handleExitGame();
      }
    });

    socket.on("vote-submitted", (data: VoteData) => {
      addMessage(`Vote submitted by ${data.username}`);
    });

    socket.on("game-results", (data: GameResultsData) => {
      addMessage(`Game results: ${JSON.stringify(data.results)}`);
    });

    socket.on("player-joined", (data: PlayerJoinedData) => {
      addMessage(`${data.username} joined lobby.`);
    });

    socket.on("join-success", (data: JoinSuccessData) => {
      addMessage(`Successfully joined lobby: ${data.lobbyCode}`);
      setLobbyCode(data.lobbyCode);
      setView(View.Lobby);
    });

    return () => {
      socket.off("team-assignment");
      socket.off("operation-assigned");
      socket.off("operation-phase-complete");
      socket.off("vote-submitted");
      socket.off("game-results");
      socket.off("game-started");
      socket.off("error");
      socket.off("player-joined");
      socket.off("join-success");
      socket.off("player-removed");
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
    // Don't send socket.emit here - it's now handled in the GameLobby component
    setView(View.Game);
  };
  
  const handleExitGame = () => {
    // Clear all game-related data
    setView(View.Landing);
    setLobbyCode("");
    
    // Clear all relevant session storage
    sessionStorage.removeItem("lobbyCode");
    sessionStorage.removeItem("gameData");
    sessionStorage.removeItem("players");
    sessionStorage.removeItem("messages");
    
    console.log("Exited to landing page");
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
        <GameRoom lobbyCode={lobbyCode} onExitGame={handleExitGame} />
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
