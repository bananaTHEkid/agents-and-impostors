import React, { useState, useEffect } from "react";
import {
  Button,
  Form,
  ListGroup,
  Alert,
  Badge,
} from "react-bootstrap";
import {
  GameRoomProps,
  GameState,
  Player,
  GamePhase,
  OperationAssignedData,
  GameResultsData,
  PlayerJoinedData,
  ErrorData,
  JoinSuccessData,
  GameMessage,
} from "@/types";
import GameInfo from "./GameInfo";
interface PlayerOperation {
  name: string;
    details: {
    message?: string;
    success?: boolean;
    availablePlayers?: string[]; // For confession, defector
    // Confession specific
    myTeam?: string;
    confessionMade?: boolean; // Server sets this in operation_info
    // Defector specific
    targetPlayer?: string; // Server sets this in operation_info after choice
    teamChanged?: boolean; // Server sets this after win condition modification
    // Grudge specific
    grudgeTarget?: string;
    // Danish Intelligence specific
    revealedImpostor?: string;
    revealedAgent?: string;
    // Old Photographs specific
    revealedPlayers?: string[];
    [key: string]: unknown; // Allow other dynamic properties
  };
  used?: boolean; // Client-side flag to indicate if an action has been taken
}

import { useSocket } from '@/Socket/useSocket';
import { FiLogOut, FiMessageCircle, FiUsers, FiClock, FiCheckCircle } from "react-icons/fi";

const GameRoom: React.FC<GameRoomProps> = ({ lobbyCode, onExitGame }) => {
  const { socket } = useSocket();
  const [gameData, setGameData] = useState<GameState | null>(() => {
    const saved = sessionStorage.getItem('gameData');
    return saved ? JSON.parse(saved) as GameState : null;
  });
  const [players, setPlayers] = useState<Player[]>(() => {
    const saved = sessionStorage.getItem('players');
    return saved ? JSON.parse(saved) as Player[] : [];
  });
  const [messages, setMessages] = useState<GameMessage[]>(() => {
    const saved = sessionStorage.getItem('messages');
    return saved ? JSON.parse(saved) as GameMessage[] : [];
  });
  const [userInput, setUserInput] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [currentPhase, setCurrentPhase] = useState<GamePhase>(GamePhase.WAITING);
   const [myOperation, setMyOperation] = useState<PlayerOperation | null>(() => {
    const saved = sessionStorage.getItem('myOperation');
    return saved ? JSON.parse(saved) as PlayerOperation : null;
  });
  const [operationTargetPlayer, setOperationTargetPlayer] = useState<string | null>(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const username: string = sessionStorage.getItem("username") ?? "";

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

  useEffect(() => {
    if (myOperation) sessionStorage.setItem('myOperation', JSON.stringify(myOperation));
    else sessionStorage.removeItem('myOperation'); // Clear if null
  }, [myOperation]);

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
    socket.on("game-state", (data: GameState) => {
      setGameData(data);
      if (data.phase) {
        setCurrentPhase(data.phase);
      }
    });

    // Listen for player updates
    socket.on("player-list", (data: Player[] | { players: Player[] }) => {
      if (Array.isArray(data)) {
        setPlayers(data);
      } else if (data.players) {
        setPlayers(data.players);
      }
    });

    // Listen for new messages/prompts
    socket.on("game-message", (message: GameMessage) => {
      setMessages((prev) => [...prev, message]);
    });

    // Listen for errors
    socket.on("game-error", (error: ErrorData) => {
      setErrorMessage(error.message || "An error occurred.");
    });

    // Listen for game start
    socket.on("game-started", (data: { phase: GamePhase; message: string }) => {
      setCurrentPhase(data.phase);
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: data.message,
        },
      ]);
    });

    // Listen for phase changes
    socket.on("phase-change", (data: { phase: GamePhase; message: string }) => {
      setCurrentPhase(data.phase);
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: data.message,
        },
      ]);
    });

    // Listen for team and operation events
    socket.on("team-assignment", (data: { phase: GamePhase }) => {
      if (data.phase) {
        setCurrentPhase(data.phase);
      }
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: `Teams have been assigned!`,
        },
      ]);
    });

    socket.on("operation-assigned", (data: OperationAssignedData) => {
      console.log(`Operation assigned: ${data.operation}`);
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: `Operation assigned: ${data.operation}`,
        },
      ]);
    });

    socket.on("operation-prepared", (data: { operation: string; info: PlayerOperation['details'] }) => {
          console.log(`Operation details received for ${data.operation}:`, data.info);
          setMyOperation({ name: data.operation, details: data.info, used: data.info.confessionMade || !!data.info.targetPlayer });
    
          // Add a user-friendly message about their prepared operation
          setMessages((prev) => [
            ...prev,
            {
              type: "system",
              // Customize this message based on the operation and its info for better UX
              text: `Your operation "${data.operation}" is ready. ${data.info.message || 'Check the operation panel for details.'}`,
            },
          ]);
        });
    socket.on("operation-used", (data: { success: boolean; message?: string }) => {
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            type: "system",
            text: data.message || `Your operation action was successful.`,
          },
        ]);
        setMyOperation(prevOp => {
          if (!prevOp) return null;
          // The server might send an updated 'operation-prepared' if info changes.
          // This client-side 'used: true' ensures immediate UI update.
          // Specific details like 'confessionMade' or 'targetPlayer' would ideally come from a fresh 'operation-prepared'.
          return { ...prevOp, used: true };
        });
        setOperationTargetPlayer(null); // Clear selection
      } else {
        setErrorMessage(data.message || "Failed to use operation.");
      }
    });

    socket.on("player-voted", (data: { username: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: `${data.username} has submitted a vote.`,
        },
      ]);
    });

    socket.on("vote-submitted", (data: { vote: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: `You voted for ${data.vote}.`,
        },
      ]);
    });

    socket.on("game-results", (data: GameResultsData) => {
      console.log(`Game results: ${JSON.stringify(data.results)}`);
      setCurrentPhase(GamePhase.COMPLETED);
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: `Game has ended. Check results!`,
        },
      ]);
      setGameData((prev: GameState | null) => ({
        ...(prev || {}),
        results: data.results,
        phase: GamePhase.COMPLETED
      }));
    });

    socket.on("player-joined", (data: PlayerJoinedData) => {
      console.log(`${data.username} joined the game.`);
    });

    socket.on("join-success", (data: JoinSuccessData) => {
      console.log(`Successfully joined lobby: ${data.lobbyCode}`);
    });

    socket.on("error", (error: ErrorData) => {
      console.error(`Error: ${error.message}`);
    });

    return () => {
      socket.off("game-state");
      socket.off("player-list");
      socket.off("game-message");
      socket.off("game-error");
      socket.off("game-started");
      socket.off("phase-change");
      socket.off("team-assignment");
      socket.off("operation-assigned");
      socket.off("operation-prepared");
      socket.off("operation-used");
      socket.off("player-voted");
      socket.off("vote-submitted");
      socket.off("game-results");
      socket.off("player-joined");
      socket.off("join-success");
      socket.off("error");
    };
  }, [socket, lobbyCode, username]);

  const handleSubmitResponse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || !socket) return;

    // Only allow voting in the voting phase
    if (currentPhase === GamePhase.VOTING) {
      socket.emit("submit-vote", {
        lobbyCode,
        username,
        vote: userInput,
      });
    } else {
      // For other interactions that might be phase-specific
      socket.emit("submit-response", {
        lobbyCode,
        username,
        response: userInput,
        phase: currentPhase
      });
    }

    setUserInput("");
  };

   const handleUseConfession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !myOperation || myOperation.name !== "confession" || !operationTargetPlayer || !lobbyCode) {
      setErrorMessage("Cannot use confession. Lobby code or target missing.");
      return;
    }
    if (myOperation.details.confessionMade || myOperation.used) {
      setErrorMessage("Confession already made.");
      return;
    }
    socket.emit("use-confession", {
      lobbyCode,
      targetPlayer: operationTargetPlayer,
    });
  };

  const handleUseDefector = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !myOperation || myOperation.name !== "defector" || !operationTargetPlayer || !lobbyCode) {
      setErrorMessage("Cannot use defector. Lobby code or target missing.");
      return;
    }
    if (myOperation.details.targetPlayer || myOperation.used) {
      setErrorMessage("Defector target already chosen.");
      return;
    }
    socket.emit("use-defector", {
      lobbyCode,
      targetPlayer: operationTargetPlayer,
    });
  };

  const handleVote = (targetPlayer: string) => {
    if (!socket || currentPhase !== GamePhase.VOTING) return;
    
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

  // Render phase-specific content
  const renderPhaseContent = () => {
    switch (currentPhase) {
      case GamePhase.WAITING:
        return (
          <div className="text-center p-4">
            <h4>Waiting for game to start...</h4>
          </div>
        );
        
      case GamePhase.TEAM_ASSIGNMENT:
        return (
          <div className="text-center p-4">
            <h4 className="mb-3">Team Assignment Phase</h4>
            <div className="d-flex flex-column align-items-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Assigning teams...</span>
              </div>
              <p className="lead">The game master is assigning teams...</p>
              <div className="team-assignment-progress my-3">
                <div className="progress mb-2" style={{ height: "20px" }}>
                  <div 
                    className="progress-bar progress-bar-striped progress-bar-animated" 
                    role="progressbar" 
                    style={{ width: "100%" }}
                    aria-valuenow={100} 
                    aria-valuemin={0} 
                    aria-valuemax={100}
                  ></div>
                </div>
              </div>
              <div className="alert alert-info">
                <i className="bi bi-info-circle me-2"></i> 
                You will soon discover whether you are an <strong>Agent</strong> or an <strong>Impostor</strong>.
              </div>
              <div className="mt-3">
                <h5>Game Objective:</h5>
                <ul className="list-group text-start mb-3">
                  <li className="list-group-item list-group-item-success">
                    <strong>Agents:</strong> Identify and vote out the impostors.
                  </li>
                  <li className="list-group-item list-group-item-danger">
                    <strong>Impostors:</strong> Remain undetected and mislead the agents.
                  </li>
                </ul>
                <p className="small text-muted">Players are waiting: {players.map(p => p.username).join(', ')}</p>
              </div>
            </div>
          </div>
        );
        
      case GamePhase.OPERATION_ASSIGNMENT:
        return (
          <div className="text-center p-4">
            <h4>Operation Assignment Phase</h4>
            <p>Special operations are being assigned to players...</p>
            {myOperation && (
              <Alert variant="info" className="mt-3">
                <h5 className="mb-2">Your Operation: {myOperation.name}</h5>
                {myOperation.details.message && <p className="mb-3">{myOperation.details.message}</p>}

                {/* Informational details for specific operations */}
                {myOperation.name === "grudge" && myOperation.details.grudgeTarget && (
                  <p><strong>Grudge Target:</strong> {myOperation.details.grudgeTarget}</p>
                )}
                {myOperation.name === "danish intelligence" && myOperation.details.revealedAgent && myOperation.details.revealedImpostor && (
                  <p><strong>Intel:</strong> {myOperation.details.revealedAgent} (Agent), {myOperation.details.revealedImpostor} (Impostor).</p>
                )}
                {myOperation.name === "old photographs" && myOperation.details.revealedPlayers && myOperation.details.revealedPlayers.length > 0 && (
                  <p><strong>Photographs show:</strong> {myOperation.details.revealedPlayers.join(' and ')} are on the same team.</p>
                )}

                {/* Actionable UI for Confession */}
                {myOperation.name === "confession" && !myOperation.details.confessionMade && !myOperation.used && myOperation.details.availablePlayers && myOperation.details.availablePlayers.length > 0 && (
                  <Form className="mt-3" onSubmit={handleUseConfession}>
                    <Form.Group className="mb-2">
                      <Form.Label>Choose player to confess your team to:</Form.Label>
                      <Form.Select
                        value={operationTargetPlayer || ""}
                        onChange={(e) => setOperationTargetPlayer(e.target.value)}
                        required
                      >
                        <option value="" disabled>Select a player</option>
                        {myOperation.details.availablePlayers
                            .filter(p => p !== username)
                            .map(p => <option key={p} value={p}>{p}</option>)}
                      </Form.Select>
                    </Form.Group>
                    <Button type="submit" variant="primary" size="sm">Confess Team</Button>
                  </Form>
                )}
                {myOperation.name === "confession" && (myOperation.details.confessionMade || myOperation.used) && (
                    <p className="text-success mt-2"><FiCheckCircle className="me-1"/>You have made your confession.</p>
                )}

                {/* Actionable UI for Defector */}
                {myOperation.name === "defector" && !myOperation.details.targetPlayer && !myOperation.used && myOperation.details.availablePlayers && myOperation.details.availablePlayers.length > 0 && (
                  <Form className="mt-3" onSubmit={handleUseDefector}>
                    <Form.Group className="mb-2">
                      <Form.Label>Choose player to target for defection:</Form.Label>
                      <Form.Select
                        value={operationTargetPlayer || ""}
                        onChange={(e) => setOperationTargetPlayer(e.target.value)}
                        required
                      >
                        <option value="" disabled>Select a player</option>
                        {myOperation.details.availablePlayers
                            .filter(p => p !== username)
                            .map(p => <option key={p} value={p}>{p}</option>)}
                      </Form.Select>
                    </Form.Group>
                    <Button type="submit" variant="warning" size="sm">Choose Defection Target</Button>
                  </Form>
                )}
                {myOperation.name === "defector" && (myOperation.details.targetPlayer || myOperation.used) && (
                    <p className="text-info mt-2"><FiCheckCircle className="me-1"/>Your defector choice ({myOperation.details.targetPlayer || 'target'}) has been registered.</p>
                )}
              </Alert>
            )}
          </div>
        );
        
      case GamePhase.VOTING:
        return (
          <div>
            <h4>Voting Phase</h4>
            <p>Vote for a player you suspect is an impostor:</p>
            <ListGroup className="mb-3">
              {players.map((player) => (
                <ListGroup.Item
                  key={player.username}
                  action
                  onClick={() => handleVote(player.username)}
                  disabled={player.username === username}
                  className={player.username === username ? "text-muted" : ""}
                >
                  {player.username} {player.username === username && "(You)"}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </div>
        );
        
      case GamePhase.COMPLETED:
        return (
          <div className="text-center p-4">
            <h4>Game Completed</h4>
            {gameData?.results && (
              <div className="results mt-3">
                <h5>Results:</h5>
                <ListGroup>
                  {gameData.results.map((result) => (
                    <ListGroup.Item
                      key={result.username}
                      variant={result.win_status === "won" ? "success" : "danger"}
                    >
                      {result.username}: {result.team} - {result.operation} ({result.win_status})
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </div>
            )}
            <Button 
              variant="primary" 
              className="mt-3" 
              onClick={handleLeaveGame}
              data-testid="exit-game-button"
            >
              Leave Game
            </Button>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50 to-indigo-200 p-4 md:p-6" data-testid="game-room">
      <div className="w-full h-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header with background */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 py-4 px-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <h2 className="text-2xl font-bold text-white">Triple Game</h2>
            <div className="flex items-center gap-4">
              <div className="bg-white/20 text-white rounded-full px-4 py-1 flex items-center gap-2">
                {FiClock({ className: "text-white/80" })}
                <span>Phase: {currentPhase}</span>
              </div>
              <Button 
                variant="light" 
                className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors duration-200" 
                onClick={handleLeaveGame}
                data-testid="exit-game-button"
              >
                {FiLogOut({})}
                Leave Game
              </Button>
            </div>
          </div>
        </div>
        
        <div className="p-4 md:p-6">
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
          {showAssignmentModal && myOperation && (
            <Alert variant="info" className="mt-4 text-center">
              <h5 className="mb-3">Your Operation: {myOperation.name}</h5>
              <Button
                variant="primary"
                onClick={() => {
                  if (socket) {
                    socket.emit("accept-assignment", { lobbyId: lobbyCode, username });
                  }
                  setShowAssignmentModal(false);
                  setMyOperation(null);
                }}
                data-testid="accept-assignment-btn"
              >
                Accept Assignment
              </Button>
            </Alert>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Game content area */}
            <div className="lg:col-span-2">
              <div
                className="game-messages p-4 bg-gray-50 rounded-xl mb-6 shadow-sm"
                style={{ height: "350px", overflowY: "auto" }}
                data-testid="game-messages"
              >
                <div className="flex items-center gap-2 mb-4">
                  {FiMessageCircle({ className: "text-indigo-600 text-xl" })}
                  <h3 className="text-xl font-semibold text-gray-800">Game Messages</h3>
                </div>
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className="message mb-3"
                    data-testid={`message-${index}`}
                  >
                    {msg.type === "system" ? (
                      <div 
                        className="system-message bg-indigo-50 text-indigo-700 p-3 rounded-lg border border-indigo-100" 
                        data-testid={`system-message-${index}`}
                      >
                        {msg.text}
                      </div>
                    ) : msg.type === "prompt" ? (
                      <div className="prompt-message bg-amber-50 p-3 rounded-lg border border-amber-100 text-amber-800">
                        <strong className="font-semibold">Prompt: </strong> {msg.text}
                      </div>
                    ) : (
                      <div className="player-message bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                        <strong className="font-semibold text-indigo-700">{msg.from}: </strong> {msg.text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Phase-specific content */}
              <div className="phase-content bg-white rounded-xl p-4 border border-gray-100 shadow-sm" data-testid="phase-content">
                {renderPhaseContent()}
              </div>

              {/* Interaction form - only shown during voting phase */}
              {currentPhase === GamePhase.VOTING && (
                <Form onSubmit={handleSubmitResponse} className="mt-6">
                  <Form.Group className="mb-3">
                    <Form.Control
                      type="text"
                      placeholder="Enter your vote or message..."
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      className="p-3 rounded-lg border-gray-200 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                    />
                  </Form.Group>
                  <Button 
                    type="submit" 
                    variant="primary"
                    className="flex items-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 border-0 rounded-lg transition-colors duration-200"
                  >
                    {FiCheckCircle({})} Submit
                  </Button>
                </Form>
              )}
            </div>

            {/* Player info sidebar */}
            <div>
              <GameInfo className="mb-6" />
              <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100">
                  <div className="flex items-center gap-2">
                    {FiUsers({ className: "text-indigo-600 text-xl" })}
                    <h3 className="text-xl font-semibold text-gray-800">Players</h3>
                  </div>
                </div>
                <ListGroup variant="flush" className="rounded-none">
                  {players.map((player) => (
                    <ListGroup.Item 
                      key={player.username}
                      className="flex justify-between items-center py-3 px-4 border-gray-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium">
                          {player.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">
                          {player.username}
                          {player.username === username && " (You)"}
                        </span>
                      </div>
                      {currentPhase === GamePhase.TEAM_ASSIGNMENT && (
                        <Badge bg="secondary" pill className="flex items-center gap-1 py-2 px-3">
                          <span className="spinner-grow spinner-grow-sm" role="status" aria-hidden="true"></span>
                          Assigning
                        </Badge>
                      )}
                      {currentPhase !== GamePhase.WAITING && 
                       currentPhase !== GamePhase.TEAM_ASSIGNMENT && 
                       player.team && 
                       player.username === username && (
                        <Badge 
                          bg={player.team === 'impostor' ? 'danger' : 'success'} 
                          pill
                          className="py-2 px-3"
                        >
                          {player.team === 'impostor' ? 'Impostor' : 'Agent'}
                        </Badge>
                      )}
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameRoom;
