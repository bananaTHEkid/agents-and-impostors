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
import OperationPanel from '@/components/operations/OperationPanel';
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
  const [voteChoice, setVoteChoice] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [currentPhase, setCurrentPhase] = useState<GamePhase>(GamePhase.WAITING);
   const [myOperation, setMyOperation] = useState<PlayerOperation | null>(() => {
    const saved = sessionStorage.getItem('myOperation');
    return saved ? JSON.parse(saved) as PlayerOperation : null;
  });
  // operationTargetPlayer is now handled inside OperationPanel renderers
  const [currentTurnPlayer, setCurrentTurnPlayer] = useState<string | null>(null);
  const username: string = sessionStorage.getItem("username") ?? "";

  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    if (gameData) sessionStorage.setItem('gameData', JSON.stringify(gameData));
  }, [gameData]);

  useEffect(() => {
    if (players.length) sessionStorage.setItem('players', JSON.stringify(players));
    else sessionStorage.removeItem('players');
  }, [players]);

  useEffect(() => {
    if (messages.length) sessionStorage.setItem('messages', JSON.stringify(messages));
    else sessionStorage.removeItem('messages');
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
        // Restore turn from game-state if present
        if ((data as any).currentTurnPlayer) setCurrentTurnPlayer((data as any).currentTurnPlayer as string);
        
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
      // Preserve used flag if same operation gets updated info
      setMyOperation(prev => {
        const used = prev && prev.name === data.operation ? !!prev.used : false;
        return { name: data.operation, info: data.info, used } as PlayerOperation;
      });

      // Add a user-friendly message about their prepared operation
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          text: `Your operation "${data.operation}" is ready. ${data.info.message || 'Check the operation panel for details.'}`,
        },
      ]);
    });

    // Receive structured operation info updates (e.g., danish intelligence reveal)
    socket.on('operation-info', (data: { operation: string; info: Partial<PlayerOperation['details']>; message?: string }) => {
      setMyOperation(prev => {
        if (!prev || prev.name !== data.operation) return prev;
        return { ...prev, info: { ...prev.info, ...(data.info as any) } } as PlayerOperation;
      });
      if (data.message) {
        setMessages(prev => ([...prev, { type: 'system', text: data.message } ]));
      }
    });
    socket.on("operation-used", (data: { operation?: string; success: boolean; message?: string }) => {
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
          // Only mark used if server indicates this operation (or no operation name provided)
          if (data.operation && data.operation !== prevOp.name) return prevOp;
          return { ...prevOp, used: true };
        });
      } else {
        setErrorMessage(data.message || "Failed to use operation.");
      }
    });
    // Receive confession reveal from another player
    socket.on('confession-received', (data: { type?: string; fromPlayer: string; theirTeam: 'agent' | 'impostor' | string }) => {
      const readableTeam = data.theirTeam === 'impostor' ? 'impostor' : (data.theirTeam === 'agent' ? 'agent' : String(data.theirTeam));
      setMessages(prev => ([
        ...prev,
        { type: 'system', text: `${data.fromPlayer} confesses: they are a ${readableTeam}.` }
      ]));
    });
    // Listen for turn lifecycle
    socket.on('turn-start', (data: { currentTurnPlayer: string; turnIndex: number }) => {
      console.log('socket:on turn-start', { socketId: socket.id, lobbyCode, data });
      setCurrentTurnPlayer(data.currentTurnPlayer);
      // Mark players with current turn for UI highlighting
      setPlayers(prev => prev.map(p => ({ ...p, isCurrentTurn: p.username === data.currentTurnPlayer })));
      setMessages((prev) => [
        ...prev,
        {
          type: 'system',
          text: `Turn started: ${data.currentTurnPlayer}`,
        },
      ]);
    });

    socket.on('turn-change', (data: { currentTurnPlayer: string; turnIndex: number }) => {
      console.log('socket:on turn-change', { socketId: socket.id, lobbyCode, data });
      setCurrentTurnPlayer(data.currentTurnPlayer);
      // Update players list to reflect the new current turn player
      setPlayers(prev => prev.map(p => ({ ...p, isCurrentTurn: p.username === data.currentTurnPlayer })));
      setMessages((prev) => [
        ...prev,
        {
          type: 'system',
          text: `Turn changed: ${data.currentTurnPlayer}`,
        },
      ]);
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
      socket.off('operation-info');
      socket.off("operation-used");
      socket.off('confession-received');
      socket.off('turn-start');
      socket.off('turn-change');
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

  // Confession/Defector handling moved to OperationPanel and renderers

  const handleVote = (targetPlayer: string) => {
    if (!socket || currentPhase !== GamePhase.VOTING) return;
    
    socket.emit("submit-vote", {
      lobbyCode,
      username,
      vote: targetPlayer,
    });
    setVoteChoice("");
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
            <p className="small text-muted">The game master is assigning teams...</p>
            <div className="d-flex flex-column align-items-center">
                <p className="small text-muted">Players are waiting: {players.map(p => p.username).join(', ')}</p>
            </div>
          </div>
        );
        
      case GamePhase.OPERATION_ASSIGNMENT:
        return (
          <div className="text-center p-4">
            <h4>Operation Assignment Phase</h4>
            <p>Special operations are being assigned to players...</p>
            <div className="mt-3">
              <OperationPanel
                operation={myOperation ? { name: myOperation.name, info: myOperation.info, used: myOperation.used } : null}
                lobbyCode={lobbyCode}
                username={username}
                socket={socket}
                isMyTurn={currentTurnPlayer ? (currentTurnPlayer === username) : undefined}
                myTeam={players.find(p => p.username === username)?.team}
              />
            </div>
          </div>
        );
        
      case GamePhase.VOTING:
        return (
          <div>
            <h4>Voting Phase</h4>
            <p>Vote for a player you suspect is an impostor:</p>
            <Form onSubmit={(e) => { e.preventDefault(); if (voteChoice) handleVote(voteChoice); }} className="mb-3">
              <Form.Group>
                <Form.Label>Select player to vote for</Form.Label>
                <Form.Select value={voteChoice} onChange={(e) => setVoteChoice(e.target.value)}>
                  <option value="">Select a player</option>
                  {players.filter(p => p.username !== username).map(p => (
                    <option key={p.username} value={p.username}>{p.username}</option>
                  ))}
                </Form.Select>
              </Form.Group>
              <div className="mt-2">
                <Button type="submit" variant="primary" disabled={!voteChoice}>Submit Vote</Button>
              </div>
            </Form>
            <ListGroup>
              {players.map((player) => (
                <ListGroup.Item key={player.username} className={player.username === currentTurnPlayer ? 'bg-yellow-50' : ''}>
                  {player.username} {player.username === username && "(You)"} {player.isCurrentTurn && <Badge bg="warning" pill className="text-dark ms-2">Current Turn</Badge>}
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
                <FiClock className="text-white/80" />
                <span>Phase: {currentPhase}</span>
              </div>
              <Button 
                variant="light" 
                className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors duration-200" 
                onClick={handleLeaveGame}
                data-testid="exit-game-button"
              >
                <FiLogOut />
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
          {currentTurnPlayer && (
            <Alert variant="info" className="mb-4">
              <strong>Current turn:</strong> {currentTurnPlayer} {currentTurnPlayer === username && '(You)'}
            </Alert>
          )}
          {/* Operation UI is rendered inside the phase content via OperationPanel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Game content area */}
            <div className="lg:col-span-2">
              <div
                className="game-messages p-4 bg-gray-50 rounded-xl mb-6 shadow-sm"
                style={{ height: "350px", overflowY: "auto" }}
                data-testid="game-messages"
              >
                <div className="flex items-center gap-2 mb-4">
                  <FiMessageCircle className="text-indigo-600 text-xl" />
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

              {/* Voting input moved into phase content (dropdown) to simplify layout */}
            </div>

            {/* Player info sidebar */}
            <div>
              <GameInfo className="mb-6" />
              <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100">
                  <div className="flex items-center gap-2">
                    <FiUsers className="text-indigo-600 text-xl" />
                    <h3 className="text-xl font-semibold text-gray-800">Players</h3>
                  </div>
                </div>
                <ListGroup variant="flush" className="rounded-none">
                  {players.map((player) => (
                    <ListGroup.Item 
                      key={player.username}
                      className={"flex justify-between items-center py-3 px-4 border-gray-100" + (player.username === currentTurnPlayer ? ' bg-yellow-50' : '')}
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
                      {player.username === currentTurnPlayer && (
                        <Badge bg="warning" pill className="text-dark py-2 px-3">Current Turn</Badge>
                      )}
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
