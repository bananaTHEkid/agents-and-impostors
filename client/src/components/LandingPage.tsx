import React, { useState, useEffect, useCallback, useRef, useContext } from "react";
import axios from "axios";
import { LandingPageProps } from "@/types";
import { Button } from "@/components/ui/button"; // Shadcn button
import { CardContent } from "@/components/ui/card"; // Shadcn card
import { Input } from "@/components/ui/input"; // Shadcn input
import { Label } from "@/components/ui/label"; // Shadcn label
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Shadcn alert
import { API_BASE_URL } from "@/config";
import { SocketContext } from "@/contexts/SocketContext";

interface JoinSuccessData {
  lobbyCode: string;
}

interface ErrorData {
  message: string;
}

interface CreateLobbyResponse {
  lobbyId: string;
  lobbyCode: string;
  accessToken: string;
}

interface JoinLobbyResponse {
  success: boolean;
  lobbyCode?: string;
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
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [, setShowGameRules] = useState(false);

  const usernameRef = useRef(username);

  // Use socket from context
  const { socket, connect } = useContext(SocketContext);

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

  // Listen for socket events only if socket is available
  useEffect(() => {
    if (!socket) {
      connect(); // Ensure connection is established
      return;
    }

    const handleJoinSuccess = (data: JoinSuccessData) => {
      const currentUsername = usernameRef.current; // Use ref to get the current username
      sessionStorage.setItem("lobbyCode", data.lobbyCode);
      sessionStorage.setItem("username", currentUsername);
      sessionStorage.setItem("isHost", "false");
      setIsLoading(false);
      onJoinGame(data.lobbyCode);
      saveToRecentGames(data.lobbyCode);
    };

    const handleError = (error: ErrorData) => {
      setErrorMessage(error.message || "Ein Fehler ist aufgetreten");
      setIsLoading(false);
    };

    socket.on("join-success", handleJoinSuccess);
    socket.on("error", handleError);

    return () => {
      socket.off("join-success", handleJoinSuccess);
      socket.off("error", handleError);
    };
  }, [socket, onJoinGame, saveToRecentGames, connect]);

  useEffect(() => {
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
  }, []);

  const handleJoinLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedLobbyCode = lobbyCode.trim().toUpperCase(); // Ensure uppercase

    if (!trimmedUsername || !trimmedLobbyCode) {
      setErrorMessage("Bitte fülle alle Felder aus");
      return;
    }

    // Validate lobby code format (should be 6 characters)
    if (trimmedLobbyCode.length !== 6) {
      setErrorMessage("Ungültiges Format des Lobby-Codes");
      return;
    }

    // Check if socket is available and connected
    if (!socket || !socket.connected) {
      setErrorMessage("Verbindung zum Server wird hergestellt...");
      connect();
      // Wait a bit for connection, then try to join
      setTimeout(() => {
        if (socket?.connected) {
          performJoin(trimmedUsername, trimmedLobbyCode);
        } else {
          setErrorMessage("Verbindung zum Server fehlgeschlagen. Bitte warte einen Moment und versuche es erneut.");
          setIsLoading(false);
        }
      }, 2000);
      return;
    }
    
    performJoin(trimmedUsername, trimmedLobbyCode);
  };
  
  const performJoin = (trimmedUsername: string, trimmedLobbyCode: string) => {
    if (!socket || !socket.connected) {
      setErrorMessage("Socket nicht verbunden. Bitte versuche es erneut.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    // Store timeout ID so we can clear it when callback is received
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Set a timeout in case the callback is never called (increased to 15 seconds for concurrent joins)
      timeoutId = setTimeout(() => {
        // Only show error if still loading (callback hasn't been called)
        setIsLoading((currentLoading) => {
          if (currentLoading) {
            setErrorMessage("Server hat nicht geantwortet. Bitte versuche es erneut.");
            return false;
          }
          return currentLoading;
        });
      }, 15000); // Increased from 10 to 15 seconds for concurrent joins

      // Emit join-lobby event and wait for acknowledgment
      socket.emit(
        "join-lobby",
        {
          username: trimmedUsername,
          lobbyCode: trimmedLobbyCode,
        },
        (response: JoinLobbyResponse) => {
          // Clear the timeout since we got a response
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          console.log("Received join-lobby response:", response);
          if (response && response.success && response.lobbyCode) {
            sessionStorage.setItem("lobbyCode", response.lobbyCode);
            sessionStorage.setItem("username", trimmedUsername);
            sessionStorage.setItem("isHost", "false");
            setIsLoading(false);
            onJoinGame(response.lobbyCode);
            saveToRecentGames(response.lobbyCode);
          } else {
            setErrorMessage(response?.error || "Beitritt zur Lobby fehlgeschlagen");
            setIsLoading(false);
          }
        }
      );
    } catch (error) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      console.error("Fehler in handleJoinLobby:", error);
      setErrorMessage("Beitritt zur Lobby fehlgeschlagen");
      setIsLoading(false);
    }
  };

  const handleCreateLobby = async () => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setErrorMessage("Bitte gib einen Benutzernamen ein");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await axios.post<CreateLobbyResponse>(`${API_BASE_URL}/create-lobby`, {
        username: trimmedUsername,
      });
      const { lobbyCode, accessToken } = response.data;

      sessionStorage.setItem("lobbyCode", lobbyCode);
      sessionStorage.setItem("username", trimmedUsername);
      sessionStorage.setItem("isHost", "true");
      sessionStorage.setItem("accessToken", accessToken);
      setIsLoading(false);
      onJoinGame(lobbyCode);
      saveToRecentGames(lobbyCode);
    } catch (error) {
      console.error("Fehler beim Erstellen der Lobby:", error);
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        setErrorMessage(error.response.data.error);
      } else {
        setErrorMessage("Erstellen der Lobby fehlgeschlagen");
      }
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

  const handleQuickJoin = (code: string) => {
    setLobbyCode(code);
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setErrorMessage("Bitte gib einen Benutzernamen ein");
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
          lobbyCode: code,
        },
        (response: JoinLobbyResponse) => {
          if (response.success && response.lobbyCode) {
            sessionStorage.setItem("lobbyCode", response.lobbyCode);
            sessionStorage.setItem("username", trimmedUsername);
            sessionStorage.setItem("isHost", "false");
            setIsLoading(false);
            onJoinGame(response.lobbyCode);
            saveToRecentGames(response.lobbyCode);
          } else {
            setErrorMessage(response.error || "Beitritt zur Lobby fehlgeschlagen");
            setIsLoading(false);
          }
        }
      );
    } catch (error) {
      console.error("Fehler in handleQuickJoin:", error);
      setErrorMessage("Beitritt zur Lobby fehlgeschlagen");
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-screen overflow-x-hidden flex flex-col bg-gradient-to-br from-indigo-50 to-indigo-200 p-4 md:p-6"
      data-testid="landing-page"
    >
      <div className="max-w-xl w-full mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header with background */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 py-6 px-8">
          <h2 className="text-3xl font-bold text-white text-center">Triple Game</h2>
        </div>

        <div className="p-4 md:p-8">
          <CardContent className="space-y-6">
            <div className="space-y-2 text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-800">Willkommen bei Triple</h3>
              <p className="text-gray-500">Finde oder Starte ein Spiel</p>
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
                <AlertTitle>Fehler</AlertTitle>
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
                    Spielername
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="Benutzername eingeben"
                    aria-label="Username"
                    disabled={isLoading}
                    className="bg-white px-4 py-2 rounded-lg shadow-sm border border-indigo-100"
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="lobbyCode"
                    className="text-sm font-semibold text-indigo-600 uppercase tracking-wider"
                  >
                    Lobby-Code
                  </Label>
                  <Input
                    id="lobbyCode"
                    type="text"
                    value={lobbyCode}
                    onChange={handleLobbyCodeChange}
                    placeholder="Lobby-Code eingeben"
                    aria-label="Lobby Code"
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
                  aria-label="Join Game with Code"
                >
                  {isLoading ? "Beitreten..." : "Beitreten"}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-3 py-1 text-gray-500 font-semibold">Oder</span>
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
                  {isLoading ? "Erstelle..." : "Erstelle neues Spiel"}
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
                    <h3 className="text-xl font-semibold text-gray-800">zuvor gespielt</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {recentGames.map(({ code }) => (
                      <li key={code} className="flex items-center justify-between">
                        <span className="font-mono">{code}</span>

                        <Button
                          variant="default"
                          onClick={() => handleQuickJoin(code)}
                          aria-label={`Quick access to lobby ${code}`}
                          data-testid={`quick-join-${code}`}
                        >
                          Schnellstart
                        </Button>
                      </li>
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
                  Spielregeln & Hilfe
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