import React, { useState, useEffect } from "react";
import { Container, Card, Button, ListGroup, Alert } from "react-bootstrap";
import { useSocket } from "../contexts/SocketContext";
import { GameLobbyProps, Player } from "../types";

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
    socket.emit("get-lobby-players", { lobbyCode });

    // Listen for player updates
    socket.on("lobby-players", (data) => {
      setPlayers(data.players);
    });

    // Listen for game start
    socket.on("game-started", () => {
      onStartGame();
    });

    // Listen for errors
    socket.on("lobby-error", (error) => {
      setErrorMessage(error.message || error);
    });

    socket.on("error", (error) => {
      setErrorMessage(error.message || error);
    });

    // Listen for lobby closed (by host)
    socket.on("lobby-closed", () => {
      onExitLobby();
    });

    // Listen for a new player joining
    socket.on("player-joined", (data) => {
      // Check if the player is already in the list to avoid duplicates
      setPlayers((prevPlayers) => {
        const existingPlayer = prevPlayers.find(
          (p) => p.username === data.username
        );
        if (existingPlayer) return prevPlayers;
        return [...prevPlayers, { username: data.username }];
      });
    });

    // Listen for a player leaving
    socket.on("player-left", (data) => {
      setPlayers((prevPlayers) =>
        prevPlayers.filter((player) => player.username !== data.username)
      );
    });

    return () => {
      socket.off("lobby-players");
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
    <Container
      className="d-flex justify-content-center align-items-center"
      style={{ minHeight: "100vh" }}
    >
      <Card className="lobby-card" style={{ width: "500px" }}>
        <Card.Header className="text-center bg-primary text-white">
          <h2>Game Lobby</h2>
        </Card.Header>
        <Card.Body>
          {errorMessage && (
            <Alert
              variant="danger"
              onClose={() => setErrorMessage("")}
              dismissible
            >
              {errorMessage}
            </Alert>
          )}

          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5>
              Lobby Code:{" "}
              <span className="badge bg-secondary">{lobbyCode}</span>
            </h5>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={copyLobbyCode}
            >
              Copy Code
            </Button>
          </div>

          {copySuccess && (
            <Alert variant="success" className="py-1">
              {copySuccess}
            </Alert>
          )}

          <h5 className="mt-4 mb-2">Players:</h5>
          <ListGroup>
            {players.map((player) => (
              <ListGroup.Item
                key={player.username}
                className="d-flex justify-content-between align-items-center"
              >
                {player.username}
                {player.isHost && (
                  <span className="badge bg-primary">Host</span>
                )}
              </ListGroup.Item>
            ))}
          </ListGroup>

          {players.length < 2 && (
            <Alert variant="info" className="mt-3">
              Waiting for more players to join...
            </Alert>
          )}

          <div className="d-flex justify-content-between mt-4">
            <Button variant="outline-danger" onClick={handleLeaveLobby}>
              Leave Lobby
            </Button>

            {isHost && (
              <Button
                variant="success"
                onClick={handleStartGame}
                disabled={players.length < 2}
              >
                Start Game
              </Button>
            )}
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default GameLobby;
