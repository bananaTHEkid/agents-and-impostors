import React, { useState, useEffect } from "react";
// import { Container, Card, Button, Form, Alert } from "react-bootstrap"; // Remove Bootstrap import
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { LandingPageProps } from "../types";
import { Button } from "../components/ui/button"; // Shadcn button
import { CardContent } from "../components/ui/card"; // Shadcn card
import { Input } from "../components/ui/input"; // Shadcn input
import { Label } from "../components/ui/label"; // Shadcn label
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"; // Shadcn alert
import { AlertCircle, Info, RefreshCw } from "lucide-react"; // Icons

interface JoinSuccessData {
  lobbyCode: string;
}

interface ErrorData {
  message: string;
}

interface CreateLobbyResponse {
  lobbyId: string;
  lobbyCode: string;
}

const LandingPage: React.FC<LandingPageProps> = ({ onJoinGame }) => {
  const [username, setUsername] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [recentGames, setRecentGames] = useState<{code: string, timestamp: number}[]>([]);
  const [showGameRules, setShowGameRules] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io("http://localhost:5001");
    console.log("Socket connecting...");
    
    newSocket.on("connect", () => {
      console.log("Socket connected successfully");
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      setErrorMessage("Failed to connect to server");
      setIsLoading(false);
    });

    setSocket(newSocket);

    // Set up socket event listeners
    newSocket.on("join-success", (data: JoinSuccessData) => {
      console.log("Received join-success event:", data);
      const currentUsername = username; // Capture the current username
      sessionStorage.setItem("lobbyCode", data.lobbyCode);
      sessionStorage.setItem("username", currentUsername);
      sessionStorage.setItem("isHost", "false");
      setIsLoading(false);
      onJoinGame(data.lobbyCode);
      saveToRecentGames(data.lobbyCode);
    });

    newSocket.on("error", (error: ErrorData) => {
      console.error("Socket error event:", error);
      setErrorMessage(error.message || "An error occurred");
      setIsLoading(false);
    });

    newSocket.on("player-list", (data: { players: string[] }) => {
      console.log("Received player list update:", data);
      // You can handle the player list update here if needed
    });

    // Request initial player list when joining a lobby
    const lobbyCode = sessionStorage.getItem("lobbyCode");
    if (lobbyCode) {
      newSocket.emit("get-lobby-players", { lobbyCode }, (response: { success: boolean; players?: { username: string }[]; error?: string }) => {
        if (response.success && response.players) {
          console.log("Received initial player list:", response.players);
          // Handle the initial player list here
        } else {
          console.error("Failed to get initial player list:", response.error);
        }
      });
    }

    // Load recent games from localStorage
    const savedGames = localStorage.getItem('recentGames');
    if (savedGames) {
      try {
        setRecentGames(JSON.parse(savedGames));
      } catch (e) {
        console.error("Failed to load recent games", e);
      }
    }
    
    // Load last used username if available
    const savedUsername = localStorage.getItem('lastUsername');
    if (savedUsername) {
      setUsername(savedUsername);
    }

    // Cleanup on unmount
    return () => {
      newSocket.off("join-success");
      newSocket.off("error");
      newSocket.off("connect");
      newSocket.off("connect_error");
      newSocket.off("player-list");
      newSocket.disconnect();
    };
  }, [onJoinGame]);

  const handleJoinLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedLobbyCode = lobbyCode.trim();

    if (!trimmedUsername || !trimmedLobbyCode) {
      setErrorMessage("Please fill in all fields");
      return;
    }

    // Validate lobby code format (should be 6 characters)
    if (trimmedLobbyCode.length !== 6) {
      setErrorMessage("Invalid lobby code format");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      // Emit join-lobby event and wait for acknowledgment
      socket?.emit("join-lobby", { 
        username: trimmedUsername, 
        lobbyCode: trimmedLobbyCode 
      }, (response: { success: boolean; lobbyCode?: string; error?: string }) => {
        console.log("Received join-lobby response:", response);
        if (response.success && response.lobbyCode) {
          sessionStorage.setItem("lobbyCode", response.lobbyCode);
          sessionStorage.setItem("username", trimmedUsername);
          sessionStorage.setItem("isHost", "false");
          setIsLoading(false);
          onJoinGame(response.lobbyCode);
          saveToRecentGames(response.lobbyCode);
        } else {
          setErrorMessage(response.error || "Failed to join lobby");
          setIsLoading(false);
        }
      });
    } catch (error) {
      console.error("Error in handleJoinLobby:", error);
      setErrorMessage("Failed to join lobby");
      setIsLoading(false);
    }
  };

  const handleCreateLobby = async () => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setErrorMessage("Please enter a username");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await axios.post<CreateLobbyResponse>("http://localhost:5001/create-lobby", { username: trimmedUsername });
      const { lobbyCode } = response.data;
      
      sessionStorage.setItem("lobbyCode", lobbyCode);
      sessionStorage.setItem("username", trimmedUsername);
      sessionStorage.setItem("isHost", "true");
      
      socket?.emit("join-lobby", { 
        username: trimmedUsername, 
        lobbyCode 
      });

      // Call onJoinGame immediately after successful lobby creation
      onJoinGame(lobbyCode);
    } catch (error) {
      setErrorMessage("Failed to create lobby");
      setIsLoading(false);
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    setErrorMessage(""); // Clear error message when user starts typing
  };

  const handleLobbyCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLobbyCode(e.target.value);
    setErrorMessage(""); // Clear error message when user starts typing
  };

  const saveToRecentGames = (code: string) => {
    const updatedGames = [
      { code, timestamp: Date.now() },
      ...recentGames.filter(game => game.code !== code)
    ].slice(0, 5); // Keep only 5 most recent
    
    setRecentGames(updatedGames);
    localStorage.setItem('recentGames', JSON.stringify(updatedGames));
    localStorage.setItem('lastUsername', username); // Save username for convenience
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50 to-indigo-200 p-4 md:p-6" data-testid="landing-page">
      <div className="w-full h-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header with background */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 py-6 px-8">
          <h2 className="text-3xl font-bold text-white text-center">Triple Game</h2>
        </div>
        
        <div className="p-4 md:p-8 max-w-3xl mx-auto">
          <CardContent className="space-y-6">
          <div className="space-y-2 text-center mb-8">
            <h3 className="text-2xl font-bold text-gray-800">Welcome to Triple</h3>
            <p className="text-gray-500">Join or create a game to get started</p>
          </div>

          {errorMessage && (
            <Alert variant="destructive" className="mb-6 rounded-lg border-0 shadow-sm">
              <AlertCircle className="h-5 w-5 mr-2" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleJoinLobby} className="space-y-6">
            <div className="bg-indigo-50 rounded-xl p-4 md:p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-semibold text-indigo-600 uppercase tracking-wider">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder="Enter your username"
                  disabled={isLoading}
                  className="bg-white px-4 py-2 rounded-lg shadow-sm border border-indigo-100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lobbyCode" className="text-sm font-semibold text-indigo-600 uppercase tracking-wider">Lobby Code</Label>
                <Input
                  id="lobbyCode"
                  type="text"
                  value={lobbyCode}
                  onChange={handleLobbyCodeChange}
                  placeholder="Enter lobby code"
                  disabled={isLoading}
                  className="bg-white px-4 py-2 rounded-lg shadow-sm border border-indigo-100"
                />
              </div>
            </div>

            <div className="space-y-6">
              <Button
                type="submit"
                className="w-full bg-indigo-600 text-white hover:bg-indigo-700 py-3 px-6 text-base font-medium shadow-md hover:shadow-lg transition-shadow duration-200 rounded-lg"
                disabled={isLoading}
                data-testid="join-game-button"
              >
                {isLoading ? "Joining..." : "Join Game"}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-3 py-1 text-gray-500 font-semibold">Or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full py-3 px-6 text-base font-medium hover:bg-indigo-50 transition-colors duration-200 rounded-lg border-indigo-300"
                onClick={handleCreateLobby}
                disabled={isLoading}
                data-testid="create-game-button"
              >
                {isLoading ? "Creating..." : "Create New Game"}
              </Button>
            </div>
          </form>

          <div className="mt-8 space-y-6">
            {/* Game Rules Modal/Dialog */}
            {showGameRules && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl">
                  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 -m-6 mb-6 p-6 rounded-t-2xl">
                    <h2 className="text-2xl font-bold text-white">How to Play Triple</h2>
                  </div>
                  <p className="mb-4 text-gray-700">Triple is a social deduction game where players are divided into Agents and Impostors.</p>
                  <h3 className="text-xl font-semibold mb-3 text-indigo-700">Game Objectives:</h3>
                  <ul className="space-y-3 mb-6">
                    <li className="flex items-start bg-green-50 p-3 rounded-lg border border-green-100">
                      <div className="bg-green-500 text-white rounded-full p-1 mr-3 mt-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                      </div>
                      <div>
                        <strong className="text-green-700">Agents:</strong>
                        <p className="text-green-800">Identify and vote out all impostors</p>
                      </div>
                    </li>
                    <li className="flex items-start bg-red-50 p-3 rounded-lg border border-red-100">
                      <div className="bg-red-500 text-white rounded-full p-1 mr-3 mt-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 11l3 3L22 4"></path>
                          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                        </svg>
                      </div>
                      <div>
                        <strong className="text-red-700">Impostors:</strong>
                        <p className="text-red-800">Remain undetected while sabotaging the agents' mission</p>
                      </div>
                    </li>
                  </ul>
                  <button 
                    onClick={() => setShowGameRules(false)}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-lg hover:shadow-lg transition-shadow duration-200 font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
            
            {/* Recent Games */}
            {recentGames.length > 0 && (
              <div className="bg-indigo-50 rounded-xl p-4 md:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <RefreshCw className="text-indigo-600 text-xl" />
                  <h3 className="text-xl font-semibold text-gray-800">Recent Games</h3>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {recentGames.map(game => (
                    <div key={game.code} className="flex justify-between items-center bg-white border border-gray-100 rounded-lg px-4 py-3 shadow-sm hover:shadow-md transition-shadow duration-200">
                      <div className="flex flex-col">
                        <span className="font-mono font-medium text-indigo-700">{game.code}</span>
                        <span className="text-xs text-gray-500">{new Date(game.timestamp).toLocaleString()}</span>
                      </div>
                      <Button 
                        onClick={() => {
                          setLobbyCode(game.code);
                          handleJoinLobby(new Event('click') as any);
                        }}
                        variant="outline"
                        className="text-sm px-4 py-2 hover:bg-indigo-50 transition-colors duration-200 rounded-lg border-indigo-300"
                      >
                        Rejoin
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Help and Rules Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowGameRules(true)}
                className="flex items-center gap-2 py-2 px-4 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors duration-200 font-medium"
                data-testid="game-rules-button"
              >
                <Info className="h-5 w-5" />
                Game Rules & Help
              </button>
            </div>
          </div>
          </CardContent>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
