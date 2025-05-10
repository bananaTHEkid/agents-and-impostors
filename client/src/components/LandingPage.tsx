import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { LandingPageProps } from "@/types";
import { Button } from "@/components/ui/button"; // Shadcn button
import { CardContent } from "@/components/ui/card"; // Shadcn card
import { Input } from "@/components/ui/input"; // Shadcn input
import { Label } from "@/components/ui/label"; // Shadcn label
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Shadcn alert
import { API_BASE_URL } from "@/config";

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

interface JoinLobbyResponse {
  success: boolean;
  lobbyCode?: string;
  error?: string;
}

interface GetLobbyPlayersResponse {
  success: boolean;
  players?: { username: string }[];
  error?: string;
}

interface RecentGame {
  code: string;
  timestamp: number;
}

const LandingPage: React.FC<LandingPageProps> = ({ onJoinGame }) => {
  const [username, setUsername] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [, setShowGameRules] = useState(false);

  const usernameRef = useRef(username);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  const saveToRecentGames = useCallback(
    (code: string) => {
      setRecentGames((prevGames) => {
        const updatedGames = [
          { code, timestamp: Date.now() },
          ...prevGames.filter((game) => game.code !== code),
        ].slice(0, 5); // Keep only 5 most recent

        localStorage.setItem("recentGames", JSON.stringify(updatedGames));
        localStorage.setItem("lastUsername", usernameRef.current); // Save username for convenience
        return updatedGames;
      });
    },
    [] // Removed dependency on username
  );

  useEffect(() => {
    // Initialize socket connection with reconnection strategy
    const newSocket = io(API_BASE_URL, {
      reconnection: true, // Enable reconnection
      reconnectionAttempts: 5, // Limit to 5 attempts
      reconnectionDelay: 2000, // 2 seconds delay between attempts
    });

    console.log("Socket connecting...");

    newSocket.on("connect", () => {
      console.log("Socket connected successfully");
    });

    newSocket.on("connect_error", (error: Error) => {
      console.error("Socket connection error:", error);
      setErrorMessage("Failed to connect to server");
      setIsLoading(false);
    });

    newSocket.on("reconnect_attempt", (attempt) => {
      console.log(`Reconnect attempt #${attempt}`);
    });

    newSocket.on("reconnect_failed", () => {
      console.error("Reconnection failed after maximum attempts");
      setErrorMessage("Unable to reconnect to the server");
    });

    setSocket(newSocket);

    // Set up socket event listeners
    newSocket.on("join-success", (data: JoinSuccessData) => {
      console.log("Received join-success event:", data);
      const currentUsername = usernameRef.current; // Use ref to get the current username
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

    // Request initial player list only if a valid lobby code exists
    const lobbyCode = sessionStorage.getItem("lobbyCode");
    if (lobbyCode) {
      newSocket.emit(
        "get-lobby-players",
        { lobbyCode },
        (response: GetLobbyPlayersResponse) => {
          if (response.success && response.players) {
            console.log("Received initial player list:", response.players);
            // Handle the initial player list here
          } else {
            console.error("Failed to get initial player list:", response.error);
          }
        }
      );
    } else {
      console.warn("No valid lobby code found. Skipping player list request.");
    }

    // Load recent games from localStorage
    const savedGames = localStorage.getItem("recentGames");
    if (savedGames) {
      try {
        setRecentGames(JSON.parse(savedGames));
      } catch (e) {
        console.error("Failed to load recent games", e);
      }
    }

    // Load last used username if available
    const savedUsername = localStorage.getItem("lastUsername");
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
      newSocket.off("reconnect_attempt");
      newSocket.off("reconnect_failed");
      newSocket.disconnect();
    };
  }, [onJoinGame, saveToRecentGames]); // Removed dependency on username

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
      socket?.emit(
        "join-lobby",
        {
          username: trimmedUsername,
          lobbyCode: trimmedLobbyCode,
        },
        (response: JoinLobbyResponse) => {
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
        }
      );
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
      const response = await axios.post<CreateLobbyResponse>(`${API_BASE_URL}/create-lobby`, {
        username: trimmedUsername,
      });
      const { lobbyCode } = response.data;

      sessionStorage.setItem("lobbyCode", lobbyCode);
      sessionStorage.setItem("username", trimmedUsername);
      sessionStorage.setItem("isHost", "true");

      socket?.emit("join-lobby", {
        username: trimmedUsername,
        lobbyCode,
      });

      // Call onJoinGame immediately after successful lobby creation
      onJoinGame(lobbyCode);
    } catch {
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

  return (
    <div
      className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50 to-indigo-200 p-4 md:p-6"
      data-testid="landing-page"
    >
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.054 0 1.918-.816 1.994-1.85L21 12c0-5.523-4.477-10-10-10S1 6.477 1 12c0 5.523 4.477 10 10 10z"
                  />
                </svg>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleJoinLobby} className="space-y-6">
              <div className="bg-indigo-50 rounded-xl p-4 md:p-6 space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="username"
                    className="text-sm font-semibold text-indigo-600 uppercase tracking-wider"
                  >
                    Username
                  </Label>
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
                  <Label
                    htmlFor="lobbyCode"
                    className="text-sm font-semibold text-indigo-600 uppercase tracking-wider"
                  >
                    Lobby Code
                  </Label>
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
              {/* Recent Games */}
              {recentGames.length > 0 && (
                <div className="bg-indigo-50 rounded-xl p-4 md:p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-indigo-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v16h16M4 4l16 16"
                      />
                    </svg>
                    <h3 className="text-xl font-semibold text-gray-800">Recent Games</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {recentGames.map((game) => (
                      <div
                        key={game.code}
                        className="flex justify-between items-center bg-white border border-gray-100 rounded-lg px-4 py-3 shadow-sm hover:shadow-md transition-shadow duration-200"
                      >
                        <div className="flex flex-col">
                          <span className="font-mono font-medium text-indigo-700">{game.code}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(game.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <Button
                          onClick={() => {
                            setLobbyCode(game.code);
                            handleJoinLobby({
                              preventDefault: () => {},
                            } as React.FormEvent<HTMLFormElement>);
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                    />
                  </svg>
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