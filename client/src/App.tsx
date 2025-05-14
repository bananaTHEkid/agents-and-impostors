import { useEffect, useState } from "react";
import { useSocket } from "@/Socket/useSocket";
import LandingPage from "./components/LandingPage";
import GameLobby from "./components/GameLobby";
import GameRoom from "./components/GameRoom";
import {
  OperationAssignedData,
  GameResultsData,
  PlayerJoinedData,
  JoinSuccessData,
  GamePhase,
  PlayerRemovedData,
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

    // Socket listeners for various events
    socket.on("team-assignment", (data: TeamAssignmentData) => {
      addMessage(`Team assigned: ${data.team}`);
    });

    socket.on("operation-assigned", (data: OperationAssignedData) => {
      addMessage(`Operation assigned: ${data.operation}`);
    });

    socket.on("operation-phase-complete", (data: MessageData) => {
      addMessage(data.message || "Operation phase completed.");
    });

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

    // Cleanup the listeners on component unmount
    return () => {
      socket.off("team-assignment");
      socket.off("operation-assigned");
      socket.off("operation-phase-complete");
      socket.off("player-removed");
      socket.off("vote-submitted");
      socket.off("game-results");
      socket.off("player-joined");
      socket.off("join-success");
    };
  }, [socket]);

  const addMessage = (msg: string) => {
    console.log(msg); // Simply log the messages received
  };

  const handleJoinGame = (code: string) => {
    setLobbyCode(code);
    setView(View.Lobby);
  };

  const handleStartGame = () => {
    if (!socket) return;
    // Only set the view here, as `start-game` logic happens in the GameLobby
    setView(View.Game);
  };

  const handleExitGame = () => {
    // Reset all state and session storage when leaving the game
    setView(View.Landing);
    setLobbyCode("");

    sessionStorage.removeItem("lobbyCode");
    sessionStorage.removeItem("gameData");
    sessionStorage.removeItem("players");
    sessionStorage.removeItem("messages");

    console.log("Exited to landing page");
  };

  return (
      // Full-height, centered layout using Tailwind CSS
      <div className="w-full h-screen bg-gradient-to-br from-gray-100 to-gray-300 flex items-center justify-center">
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
        <AppContent />
  );
};

export default App;