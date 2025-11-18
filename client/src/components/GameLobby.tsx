import React, { useState, useEffect, useCallback } from "react";
import { Button, Alert } from "react-bootstrap";
import { useSocket } from '@/Socket/useSocket';
import { GameLobbyProps, Player } from "@/types";
import { FiCopy, FiLogOut, FiPlay, FiUsers } from "react-icons/fi";

const validatePlayerData = (player: unknown): player is Player => {
  return (
      typeof player === 'object' &&
      player !== null &&
      'username' in player &&
      typeof (player as { username: unknown }).username === 'string'
  );
};



const GameLobby: React.FC<GameLobbyProps> = ({ lobbyCode, onExitLobby }) => {
  const { socket } = useSocket();
  const [players, setPlayers] = useState<Player[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [copySuccess, setCopySuccess] = useState("");
  const [notification, setNotification] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Aktualisieren Sie die currentUsername-Deklaration am Anfang der Komponente:
  const currentUsername = sessionStorage.getItem("username") || ""; // Fallback zu leerem String
  
  // Und aktualisieren Sie die isHost-Funktion:
  const isHost = useCallback((username: string) => {
    if (!username) return false; // Frühe Rückgabe, wenn kein Benutzername vorhanden
    
    // First check if this user is in the players list and marked as host
    const isMarkedAsHost = players.some(player => 
      player.username === username && player.isHost
    );
    
    // Only fall back to sessionStorage if we can't determine from the player list
    // AND this is the current user
    const isHostInSession = username === currentUsername && sessionStorage.getItem("isHost") === "true";
    
    return isMarkedAsHost || isHostInSession;
  }, [players, currentUsername]);


  // Atomare Zustandsaktualisierung für die Spielerliste
  const updatePlayers = useCallback((newPlayers: Player[] | { players: Player[] }) => {
    console.log('[GameLobby] updatePlayers called with:', newPlayers);
    setPlayers(prev => {
      // Handle different response formats
      const playerList = Array.isArray(newPlayers) 
        ? newPlayers 
        : (newPlayers && typeof newPlayers === 'object' && 'players' in newPlayers && Array.isArray(newPlayers.players))
          ? newPlayers.players
          : null;
  
      if (!playerList || !playerList.length) {
        console.warn("Keine gültigen Spielerliste empfangen:", newPlayers);
        return prev;
      }
  
      // Einfache Validierung
      const validPlayers = playerList.filter(validatePlayerData);
  
      if (validPlayers.length === 0) {
        console.warn("Keine gültigen Spielerdaten empfangen");
        return prev;
      }
  
      console.log("Spielerliste aktualisiert:", validPlayers);
      return validPlayers;
    });
  }, []);
// Verbesserte Socket-Event-Behandlung
  useEffect(() => {
    console.log('[GameLobby] useEffect: socket:', socket, 'connected:', socket?.connected);
    if (!socket) return;

    // Typ für die Socket-Antwort
    type PlayerListResponse = Player[] | { players: Player[] } | null | undefined;
    
    // Funktion zum Abrufen der Spielerliste
    const fetchPlayerList = () => {
      console.log("Fordere Spielerliste an...");
      socket.emit("get-lobby-players", { lobbyCode }, (response: PlayerListResponse) => {
        console.log("Antwort auf get-lobby-players:", response);
        if (response) {
          if (Array.isArray(response)) {
            updatePlayers(response);
          } else if ('players' in response && Array.isArray(response.players)) {
            updatePlayers(response);
          } else {
            console.warn("Ungültiges Format der Spielerliste erhalten:", response);
          }
        } else {
          console.warn("Keine Antwort erhalten oder Antwort ist null/undefined");
        }
      });
    };

    // Initiale Spielerliste abrufen
    fetchPlayerList();

    const handlePlayerList = (data: Player[] | { players: Player[] }) => {
      console.log('[GameLobby] Received player-list:', data); // Debug-Log
      updatePlayers(data);
    };

    const handleLobbyState = (data: any) => {
      console.log('[GameLobby] Received lobby-state:', data);
      // Update players from the lobby state
      if (data && data.players) {
        updatePlayers({ players: data.players });
      }
    };

    const handlePlayerJoined = (data: { username: string }) => {
      console.log("Spieler beigetreten:", data);
      
      // Sofort temporär den Spieler zur Liste hinzufügen
      setPlayers(prev => {
        // Überprüfen, ob der Spieler bereits existiert
        if (!prev.some(p => p.username === data.username)) {
          return [...prev, { username: data.username }];
        }
        return prev;
      });
      
      setNotification(`${data.username} ist der Lobby beigetreten`);
      setTimeout(() => setNotification(""), 500);
      
      // Vollständige Spielerliste nach Beitritt anfordern
      // Kurze Verzögerung, um dem Server Zeit zum Aktualisieren zu geben
      setTimeout(() => {
        fetchPlayerList();
      }, 500);
    };

    const handlePlayerLeft = (data: { username: string }) => {
      console.log("Spieler hat verlassen:", data);
      setPlayers(prev => prev.filter(player => player.username !== data.username));
      setNotification(`${data.username} hat die Lobby verlassen`);
      setTimeout(() => setNotification(""), 500);
      
      // Aktualisierte Spielerliste anfordern
      setTimeout(() => {
        fetchPlayerList();
      }, 500);
    };

    // Event Listener registrieren
    socket.on("player-list", handlePlayerList);
    socket.on("lobby-state", handleLobbyState);
    socket.on("player-joined", handlePlayerJoined);
    socket.on("player-left", handlePlayerLeft);

    // Debug-Event für Socket-Verbindungsstatus
    socket.on("connect", () => {
      console.log("Socket verbunden - Fordere Spielerliste an");
      fetchPlayerList();
    });

    // Bei Fehlern die Fehlermeldung anzeigen
    socket.on("error", (error: { message: string }) => {
      console.error("Socket-Fehler:", error);
      setErrorMessage(error.message || "Ein Fehler ist aufgetreten");
    });

    // Bei Wiederverbindung Spielerliste aktualisieren
    socket.on("reconnect", () => {
      console.log("Socket wiederverbunden - Fordere Spielerliste an");
      fetchPlayerList();
    });

    return () => {
      socket.off("player-list", handlePlayerList);
      socket.off("lobby-state", handleLobbyState);
      socket.off("player-joined", handlePlayerJoined);
      socket.off("player-left", handlePlayerLeft);
      socket.off("error");
      socket.off("connect");
      socket.off("reconnect");
    };
  }, [socket, lobbyCode, updatePlayers]);



  const handleStartGame = useCallback(() => {
    if (!socket) {
        setErrorMessage("Keine Verbindung zum Server. Bitte lade die Seite neu.");
        return;
    }

    if (players.length < 2) {
        setErrorMessage("Mindestens 2 Spieler werden benötigt, um das Spiel zu starten.");
        return;
    }

    if (!isHost(currentUsername)) {
        setErrorMessage("Nur der Host kann das Spiel starten.");
        return;
    }

    setIsLoading(true);
    const timeoutId = setTimeout(() => {
        setIsLoading(false);
        setErrorMessage("Server antwortet nicht. Bitte versuche es später erneut.");
    }, 5000);

    socket.emit("start-game", { lobbyCode }, (response: { success: boolean, error?: string } | undefined) => {
        clearTimeout(timeoutId);
        setIsLoading(false);

        if (!response) {
            setErrorMessage("Ungültige Antwort vom Server. Bitte versuche es später erneut.");
            return;
        }

        if (!response.success) {
            setErrorMessage(response.error || "Fehler beim Starten des Spiels.");
            return;
        }

        // Don't call onStartGame here anymore
        // The App component will handle the view change when it receives the game-started event
    });
}, [socket, lobbyCode, players.length, currentUsername, isHost]);
  // In der handleLeaveLobby-Funktion:
  const handleLeaveLobby = useCallback(() => {
    setIsLoading(true);

    // Set a timeout to force UI exit if server doesn't respond
    const timeoutId = setTimeout(() => {
      console.warn("Server response timeout when leaving lobby");
      setIsLoading(false);
      sessionStorage.removeItem("lobbyCode");
      onExitLobby();
    }, 500); // 0,5 second timeout
  
    if (socket && currentUsername) {
      try {
        socket.emit("leave-lobby", {
          lobbyCode,
          username: currentUsername,
        }, (response: { success: boolean, error?: string } | undefined) => {
          clearTimeout(timeoutId); // Clear timeout since we got a response
          setIsLoading(false);
  
          // Handle case where server doesn't respond properly
          if (!response) {
            console.error("No response from server when leaving lobby");
          } else if (!response.success) {
            console.error("Error leaving lobby:", response.error);
          }
  
          // Clear local session data
          sessionStorage.removeItem("lobbyCode");
          
          // Always exit the lobby in the UI, regardless of server response
          onExitLobby();
        });
      } catch (err) {
        clearTimeout(timeoutId);
        console.error("Exception when leaving lobby:", err);
        setIsLoading(false);
        sessionStorage.removeItem("lobbyCode");
        onExitLobby();
      }
    } else {
      // If there's no socket or username, just exit
      clearTimeout(timeoutId);
      setIsLoading(false);
      sessionStorage.removeItem("lobbyCode");
      onExitLobby();
    }
  }, [socket, lobbyCode, currentUsername, onExitLobby]);

  // Funktion zum Kopieren des Lobby-Codes
  const copyLobbyCode = useCallback(() => {
    navigator.clipboard
      .writeText(lobbyCode)
      .then(() => {
        setCopySuccess("In die Zwischenablage kopiert!");
        setTimeout(() => setCopySuccess(""), 2000);
      })
      .catch(() => {
        setCopySuccess("Kopieren fehlgeschlagen");
        setTimeout(() => setCopySuccess(""), 2000);
      });
  }, [lobbyCode]);

  // Add debug log before rendering
  console.log('Rendering GameLobby with players:', players);
  return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50 to-indigo-200 p-4 md:p-6" data-testid="game-lobby">
        <div className="w-full h-full bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header mit Hintergrund */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 py-6 px-8">
            <h2 className="text-3xl font-bold text-white text-center">Spiel-Lobby</h2>
          </div>

          <div className="p-4 md:p-8">
            {/* Fehlermeldung */}
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

            {/* Benachrichtigung */}
            {notification && (
                <Alert
                    variant="info"
                    onClose={() => setNotification("")}
                    dismissible
                    className="mb-6 rounded-lg border-0 shadow-sm"
                >
                  {notification}
                </Alert>
            )}

            {/* Lobby-Info-Bereich */}
            <div className="bg-indigo-50 rounded-xl p-4 md:p-6 mb-6 md:mb-8 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-1">Lobby-Code</h3>
                  <div className="font-mono text-2xl tracking-wider bg-white px-4 py-2 rounded-lg shadow-inner border border-indigo-100" data-testid="code-viewer">
                    {lobbyCode}
                  </div>
                </div>

                <Button
                    variant="outline-primary"
                    onClick={copyLobbyCode}
                    className="flex items-center gap-2 py-2 px-4 hover:bg-indigo-100 transition-colors duration-200 w-full sm:w-auto"
                >
                  <span>{FiCopy({ className: "text-indigo-600" })}</span>
                  <span>Code kopieren</span>
                </Button>
              </div>

              {copySuccess && (
                  <div className="text-green-600 text-sm mt-2 text-center font-medium">{copySuccess}</div>
              )}
            </div>

            {/* Spieler-Bereich */}
            <div className="mb-6 md:mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-indigo-600 text-xl">{FiUsers({})}</span>
                <h3 className="text-xl font-semibold text-gray-800">Spieler</h3>
                <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full ml-2">
                  {players.length} {players.length === 1 ? 'Spieler' : 'Spieler'}
                </span>
              </div>

              {players.length === 0 && (
                <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg mb-4">
                  <p className="text-center">Keine Spieler gefunden. Warte auf die Verbindung...</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="player-list">
                {players.map((player) => (
                    <div
                        key={player.username}
                        className={`flex items-center justify-between bg-white border rounded-lg px-5 py-4 shadow-sm hover:shadow-md transition-shadow duration-200 ${
                          player.username === currentUsername ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium">
                          {player.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-800">
                          {player.username}
                          {player.username === currentUsername && " (Du)"}
                        </span>
                      </div>
                      {(player.isHost || (player.username === currentUsername && sessionStorage.getItem("isHost") === "true")) && (
                          <span className="bg-indigo-600 text-white text-xs font-bold rounded-full px-3 py-1">
                            Host
                          </span>
                      )}
                    </div>
                ))}
              </div>

              {/* Debug-Informationen (während der Entwicklung) */}
              {import.meta.env.DEV && (
                <div className="mt-6 p-4 bg-gray-100 rounded-lg text-xs font-mono overflow-x-auto">
                  <p className="mb-2 font-semibold">Debug-Info:</p>
                  <p>Socket verbunden: {socket ? 'Ja' : 'Nein'}</p>
                  <p>Lobby-Code: {lobbyCode}</p>
                  <p>Spielerzahl: {players.length}</p>
                  <p>Aktueller Spieler: {currentUsername}</p>
                  <p>Host: {isHost(currentUsername) ? 'Ja' : 'Nein'}</p>
                </div>
              )}
            </div>

            {players.length < 2 && (
                <Alert variant="info" className="mb-6 rounded-lg border-0 shadow-sm bg-blue-50 text-blue-800">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                    </svg>
                    <span>Warte auf weitere Spieler...</span>
                  </div>
                </Alert>
            )}

            {/* Aktions-Buttons */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-6 md:mt-8">
              <Button
                  variant="outline-danger"
                  onClick={handleLeaveLobby}
                  disabled={isLoading}
                  data-testid="exit-game-button"
                  className="flex items-center justify-center gap-2 py-3 px-6 text-base font-medium hover:bg-red-50 transition-colors duration-200"
                  // Force navigation to landing if button is clicked multiple times
                  onDoubleClick={() => {
                    sessionStorage.removeItem("lobbyCode");
                    onExitLobby();
                  }}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verlasse...
                  </>
                ) : (
                  <>
                    {FiLogOut({})} Lobby verlassen
                  </>
                )}
              </Button>

              {isHost(currentUsername) && (
                  <Button
                      variant="success"
                      onClick={handleStartGame}
                      disabled={players.length < 2 || isLoading}
                      data-testid="start-game-button"
                      className="flex items-center justify-center gap-2 py-3 px-8 text-base font-medium bg-gradient-to-r from-green-500 to-emerald-500 border-0 shadow-md hover:shadow-lg transition-shadow duration-200 disabled:opacity-60 disabled:shadow-none"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Starte Spiel...
                      </>
                    ) : (
                      <>
                        {FiPlay({})} Spiel starten
                      </>
                    )}
                  </Button>
              )}

            </div>
          </div>
        </div>
      </div>
  );
};

export default GameLobby;