import React, { useState, useEffect } from "react";
import { Button, Alert } from "react-bootstrap";
import { useSocket } from "../contexts/SocketContext";
import { GameLobbyProps, Player } from "../types";
import { FiCopy, FiLogOut, FiPlay, FiUsers } from "react-icons/fi";

const GameLobby: React.FC<GameLobbyProps> = ({ lobbyCode, onStartGame, onExitLobby }) => {
  const { socket } = useSocket();
  const [players, setPlayers] = useState<Player[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [copySuccess, setCopySuccess] = useState("");
  const isHost =
    players.find(
      (player) => player.username === sessionStorage.getItem("username")
    )?.isHost || false;

  useEffect(() => {
    if (!socket) return;

    // Get initial player list
    socket.emit("get-lobby-players", { lobbyCode }, (response: { success: boolean; players?: Player[]; error?: string }) => {
      if (response.success && response.players) {
        setPlayers(response.players);
      }
    });

    // Listen for player updates
    socket.on("player-list", (data: Player[] | { players: Player[] }) => {
      if (Array.isArray(data)) {
        setPlayers(data as Player[]);
      } else if (data.players) {
        setPlayers(data.players as Player[]);
      }
    });

    // Listen for game start
    socket.on("game-started", () => {
      onStartGame();
    });

    // Listen for errors
    socket.on("lobby-error", (error: { message?: string }) => {
      setErrorMessage(error.message || "An error occurred");
    });

    socket.on("error", (error: { message?: string }) => {
      setErrorMessage(error.message || "An error occurred");
    });

    // Listen for lobby closed (by host)
    socket.on("lobby-closed", () => {
      onExitLobby();
    });

    // Listen for a new player joining
    socket.on("player-joined", (data: { username: string }) => {
      setPlayers((prevPlayers) => {
        const existingPlayer = prevPlayers.find(
          (p) => p.username === data.username
        );
        if (existingPlayer) return prevPlayers;
        return [...prevPlayers, { username: data.username }];
      });
    });

    // Listen for a player leaving
    socket.on("player-left", (data: { username: string }) => {
      setPlayers((prevPlayers) =>
        prevPlayers.filter((player) => player.username !== data.username)
      );
    });

    return () => {
      socket.off("player-list");
      socket.off("game-started");
      socket.off("lobby-error");
      socket.off("error");
      socket.off("lobby-closed");
      socket.off("player-joined");
      socket.off("player-left");
    };
  }, [socket, lobbyCode, onStartGame, onExitLobby]);

  const handleStartGame = () => {
    if (socket) {
      socket.emit("start-game", { lobbyCode });
    }
  };

  const handleLeaveLobby = () => {
    if (socket) {
      socket.emit("leave-lobby", {
        lobbyCode,
        username: sessionStorage.getItem("username"),
      });
    }
    onExitLobby();
  };

  const copyLobbyCode = () => {
    navigator.clipboard
      .writeText(lobbyCode)
      .then(() => {
        setCopySuccess("Copied to clipboard!");
        setTimeout(() => setCopySuccess(""), 2000);
      })
      .catch(() => {
        setCopySuccess("Failed to copy");
      });
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50 to-indigo-200 p-4 md:p-6" data-testid="game-lobby">
      <div className="w-full h-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header with background */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 py-6 px-8">
          <h2 className="text-3xl font-bold text-white text-center">Game Lobby</h2>
        </div>
        
        <div className="p-4 md:p-8">
          {/* Error message */}
          {errorMessage && (
            <Alert
              variant="danger"
              onClose={() => setErrorMessage("")}
              dismissible
              className="mb-6 rounded-lg border-0 shadow-sm"
            >
              {errorMessage}
            </Alert>
          )}

          {/* Lobby info section */}
          <div className="bg-indigo-50 rounded-xl p-4 md:p-6 mb-6 md:mb-8 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-1">Lobby Code</h3>
                <div className="font-mono text-2xl tracking-wider bg-white px-4 py-2 rounded-lg shadow-inner border border-indigo-100">
                  {lobbyCode}
                </div>
              </div>
              
              <Button
                variant="outline-primary"
                onClick={copyLobbyCode}
                className="flex items-center gap-2 py-2 px-4 hover:bg-indigo-100 transition-colors duration-200 w-full sm:w-auto"
              >
                <span>{FiCopy({ className: "text-indigo-600" })}</span> 
                <span>Copy Code</span>
              </Button>
            </div>
            
            {copySuccess && (
              <div className="text-green-600 text-sm mt-2 text-center font-medium">{copySuccess}</div>
            )}
          </div>

          {/* Players section */}
          <div className="mb-6 md:mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-indigo-600 text-xl">{FiUsers({})}</span>
              <h3 className="text-xl font-semibold text-gray-800">Players</h3>
              <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full ml-2">
                {players.length} {players.length === 1 ? 'player' : 'players'}
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {players.map((player) => (
                <div 
                  key={player.username} 
                  className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-5 py-4 shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium">
                      {player.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-800">{player.username}</span>
                  </div>
                  {player.isHost && (
                    <span className="bg-indigo-600 text-white text-xs font-bold rounded-full px-3 py-1">
                      Host
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {players.length < 2 && (
            <Alert variant="info" className="mb-6 rounded-lg border-0 shadow-sm bg-blue-50 text-blue-800">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                </svg>
                <span>Waiting for more players to join...</span>
              </div>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 mt-6 md:mt-8">
            <Button
              variant="outline-danger"
              onClick={handleLeaveLobby}
              data-testid="exit-game-button"
              className="flex items-center justify-center gap-2 py-3 px-6 text-base font-medium hover:bg-red-50 transition-colors duration-200"
            >
              {FiLogOut({})} Leave Lobby
            </Button>

            {isHost && (
              <Button
                variant="success"
                onClick={handleStartGame}
                disabled={players.length < 2}
                data-testid="start-game-button"
                className="flex items-center justify-center gap-2 py-3 px-8 text-base font-medium bg-gradient-to-r from-green-500 to-emerald-500 border-0 shadow-md hover:shadow-lg transition-shadow duration-200 disabled:opacity-60 disabled:shadow-none"
              >
                {FiPlay({})} Start Game
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameLobby;
