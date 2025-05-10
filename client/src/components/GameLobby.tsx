import React, { useState, useEffect, useCallback } from "react";
import { Button, Alert } from "react-bootstrap";
import { useSocket } from "@/contexts/SocketContext";
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

  // Aktualisieren Sie die currentUsername-Deklaration am Anfang der Komponente:
  const currentUsername = sessionStorage.getItem("username") || ""; // Fallback zu leerem String
  
  // Und aktualisieren Sie die isHost-Funktion:
  const isHost = useCallback((username: string) => {
    if (!username) return false; // Frühe Rückgabe, wenn kein Benutzername vorhanden
    
    // Check if the username matches and either:
    // 1. The player is marked as host in the player list
    // 2. The sessionStorage has isHost set to "true" (fallback)
    const isMarkedAsHost = players.some(player => 
      player.username === username && player.isHost
    );
    
    const isHostInSession = sessionStorage.getItem("isHost") === "true";
    
    return isMarkedAsHost || (username === currentUsername && isHostInSession);
  }, [players, currentUsername]);


  // Atomare Zustandsaktualisierung für die Spielerliste
  const updatePlayers = useCallback((newPlayers: Player[] | { players: Player[] }) => {
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

    // Periodisches Aktualisieren der Spielerliste alle 10 Sekunden
    const refreshInterval = setInterval(() => {
      if (socket && socket.connected) {
        fetchPlayerList();
      }
    }, 10000);

    const handlePlayerList = (data: Player[] | { players: Player[] }) => {
      console.log("Empfangene Spielerdaten:", data); // Debug-Log
      updatePlayers(data);
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
      setTimeout(() => setNotification(""), 3000);
      
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
      setTimeout(() => setNotification(""), 3000);
      
      // Aktualisierte Spielerliste anfordern
      setTimeout(() => {
        fetchPlayerList();
      }, 500);
    };

    // Event Listener registrieren
    socket.on("player-list", handlePlayerList);
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
      clearInterval(refreshInterval);
      socket.off("player-list", handlePlayerList);
      socket.off("player-joined", handlePlayerJoined);
      socket.off("player-left", handlePlayerLeft);
      socket.off("error");
      socket.off("connect");
      socket.off("reconnect");
    };
  }, [socket, lobbyCode, updatePlayers]);



  const handleStartGame = useCallback(() => {
    if (socket && players.length >= 2) {
      socket.emit("start-game", { lobbyCode });
    }
  }, [socket, lobbyCode, players.length]);

  // In der handleLeaveLobby-Funktion:
  const handleLeaveLobby = useCallback(() => {
    if (socket && currentUsername) { // Zusätzliche Prüfung
      socket.emit("leave-lobby", {
        lobbyCode,
        username: currentUsername,
      });
    }
    onExitLobby();
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
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                  data-testid="exit-game-button"
                  className="flex items-center justify-center gap-2 py-3 px-6 text-base font-medium hover:bg-red-50 transition-colors duration-200"
              >
                {FiLogOut({})} Lobby verlassen
              </Button>

              {isHost(currentUsername) && (
                  <Button
                      variant="success"
                      onClick={handleStartGame}
                      disabled={players.length < 2}
                      data-testid="start-game-button"
                      className="flex items-center justify-center gap-2 py-3 px-8 text-base font-medium bg-gradient-to-r from-green-500 to-emerald-500 border-0 shadow-md hover:shadow-lg transition-shadow duration-200 disabled:opacity-60 disabled:shadow-none"
                  >
                    {FiPlay({})} Spiel starten
                  </Button>
              )}

            </div>
          </div>
        </div>
      </div>
  );
};

export default GameLobby;