import React, { useState, useEffect } from "react";
import {
  Container,
  Card,
  Button,
  Form,
  ListGroup,
  Alert,
} from "react-bootstrap";
import { GameRoomProps, GameState, Player } from "../types";
import GameInfo from "./GameInfo";
import { useSocket } from "../contexts/SocketContext";

const GameRoom: React.FC<GameRoomProps> = ({ lobbyCode, onExitGame }) => {
  const { socket } = useSocket();
  const [gameData, setGameData] = useState<GameState | null>(() => {
    const saved = sessionStorage.getItem('gameData');
    return saved ? JSON.parse(saved) : null;
  });
  const [players, setPlayers] = useState<Player[]>(() => {
    const saved = sessionStorage.getItem('players');
    return saved ? JSON.parse(saved) : [];
  });
  const [messages, setMessages] = useState<Array<{ type: string; text: string; from?: string }>>(() => {
    const saved = sessionStorage.getItem('messages');
    return saved ? JSON.parse(saved) : [];
  });
  const [userInput, setUserInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const username = sessionStorage.getItem("username");

  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    if (gameData) sessionStorage.setItem('gameData', JSON.stringify(gameData));
  }, [gameData]);

  useEffect(() => {
    if (players.length) sessionStorage.setItem('players', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    if (messages.length) sessionStorage.setItem('messages', JSON.stringify(messages));
  }, [messages]);

  // Handle socket connection and reconnection
  useEffect(() => {
    if (!socket) return;

    // Reconnect to the game if we have a lobby code
    if (lobbyCode && username) {
      socket.emit("rejoin-game", { lobbyCode, username });
    }

    // Get initial game state
    socket.emit("get-game-state", { lobbyCode });

    // Listen for game state updates
    socket.on("game-state", (data) => {
      setGameData(data);
    });

    // Listen for player updates
    socket.on("player-list", (data) => {
      setPlayers(data.players);
    });

    // Listen for new messages/prompts
    socket.on("game-message", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    // Listen for errors
    socket.on("game-error", (error) => {
      setErrorMessage(error.message);
    });

    // Listen for game end
    socket.on("game-ended", () => {
      // Show final scores or end game message before exiting
      setTimeout(() => {
        onExitGame();
      }, 5000);
    });

    // Listen for team and operation events
    socket.on("team-assignment", () => {
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: `Teams have been assigned!`,
        },
      ]);
    });

    socket.on("operation-assigned", (data) => {
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: `Operation assigned: ${data.operation}`,
        },
      ]);
    });

    socket.on("operation-phase-complete", () => {
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: "Operation phase completed. Voting phase begins!",
        },
      ]);
    });

    socket.on("vote-submitted", (data) => {
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: `${data.username} has submitted their vote.`,
        },
      ]);
    });

    socket.on("game-results", (data) => {
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: `Game results: ${data.winningTeam} team wins!`,
        },
      ]);
    });

    return () => {
      socket.off("game-state");
      socket.off("player-list");
      socket.off("game-message");
      socket.off("game-error");
      socket.off("game-ended");
      socket.off("team-assignment");
      socket.off("operation-assigned");
      socket.off("operation-phase-complete");
      socket.off("vote-submitted");
      socket.off("game-results");
    };
  }, [socket, lobbyCode, username, onExitGame]);

  const handleSubmitResponse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || !socket) return;

    // Determine if this is a vote or a regular response based on game state
    if (gameData?.currentState === "voting") {
      socket.emit("submit-vote", {
        lobbyCode,
        username,
        vote: userInput,
      });
    } else {
      socket.emit("submit-response", {
        lobbyCode,
        username,
        response: userInput,
      });
    }

    setUserInput("");
  };

  const handleVote = (targetPlayer: string) => {
    if (!socket) return;
    socket.emit("submit-vote", {
      lobbyCode,
      username,
      vote: targetPlayer,
    });
  };

  const handleLeaveGame = () => {
    if (!socket) return;
    socket.emit("leave-game", { lobbyCode, username });
    onExitGame();
  };

  // Function to determine if user can submit a response based on game state
  const canSubmitResponse = () => {
    if (!gameData) return false;

    if (gameData.currentState === "voting") {
      return !gameData.votedPlayers?.includes(username || "");
    }

    return (
      gameData.currentState === "playing" &&
      !gameData.submittedPlayers?.includes(username || "")
    );
  };

  return (
    <Container className="py-4">
      <Card>
        <Card.Header className="bg-primary text-white">
          <div className="d-flex justify-content-between align-items-center">
            <h2>Text Party Game</h2>
            <Button variant="light" size="sm" onClick={handleLeaveGame}>
              Leave Game
            </Button>
          </div>
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

          <div className="row">
            {/* Game content area */}
            <div className="col-md-8">
              <div
                className="game-messages p-3 border rounded"
                style={{ height: "400px", overflowY: "auto" }}
              >
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`message mb-3 ${
                      msg.type === "system" ? "text-muted" : ""
                    }`}
                  >
                    {msg.type === "system" ? (
                      <div className="system-message">{msg.text}</div>
                    ) : msg.type === "prompt" ? (
                      <div className="prompt-message bg-light p-2 rounded">
                        <strong>Prompt: </strong> {msg.text}
                      </div>
                    ) : (
                      <div className="player-message">
                        <strong>{msg.from}: </strong> {msg.text}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {gameData && gameData.currentState === "voting" ? (
                <div className="voting-area mt-3">
                  <h5>Vote for a player:</h5>
                  <div className="player-voting-buttons d-flex flex-wrap gap-2 mb-3">
                    {players.map((player, index) => (
                      <Button
                        key={index}
                        variant={
                          player.username === username
                            ? "secondary"
                            : "outline-danger"
                        }
                        disabled={
                          player.username === username || !canSubmitResponse()
                        }
                        onClick={() => handleVote(player.username)}
                      >
                        {player.username}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <Form onSubmit={handleSubmitResponse} className="mt-3">
                  <Form.Group className="d-flex">
                    <Form.Control
                      type="text"
                      placeholder={
                        canSubmitResponse()
                          ? "Type your response..."
                          : "Waiting..."
                      }
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      disabled={!canSubmitResponse()}
                    />
                    <Button
                      variant="primary"
                      type="submit"
                      className="ms-2"
                      disabled={!canSubmitResponse()}
                    >
                      Submit
                    </Button>
                  </Form.Group>
                </Form>
              )}
            </div>

            {/* Players sidebar */}
            <div className="col-md-4">
              <GameInfo />
              <h5>Players</h5>
              <ListGroup>
                {players.map((player, index) => (
                  <ListGroup.Item
                    key={index}
                    className={`d-flex justify-content-between align-items-center ${
                      gameData?.currentPlayer === player.username
                        ? "bg-light"
                        : ""
                    }`}
                  >
                    {player.username}
                    <span className="badge bg-secondary">
                      {player.score || 0} pts
                    </span>
                  </ListGroup.Item>
                ))}
              </ListGroup>

              {gameData && (
                <div className="game-info mt-4">
                  <h5>Game Info</h5>
                  <p>
                    Round: {gameData.round} / {gameData.totalRounds}
                  </p>
                  <p>
                    Status:{" "}
                    <span className="badge bg-info">
                      {gameData.currentState.replace("_", " ")}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default GameRoom;
