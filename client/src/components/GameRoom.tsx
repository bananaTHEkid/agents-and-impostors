import React, { useState, useEffect, useCallback } from "react";
import { Alert, Button } from "react-bootstrap"; // Keep for error & leave button for now
import { useSocket } from '@/Socket/useSocket';
import {
  GameRoomProps,
  GameState,
  Player,
  GamePhase,
  OperationAssignedData,
  GameResultsData,
  ErrorData,
  GameMessage,
  PlayerJoinedData, // Added to satisfy type usage
  JoinSuccessData,  // Added to satisfy type usage
} from "@/types";

import InteractionWindow from './InteractionWindow';
import NotificationWindow from './NotificationWindow';
import VoteWindow from './VoteWindow';
import StatusBar from './StatusBar';
import LobbyWindow from './LobbyWindow';

interface PlayerOperation {
  name: string;
  details: {
    message?: string;
    success?: boolean;
    availablePlayers?: string[];
    myTeam?: string;
    confessionMade?: boolean;
    targetPlayer?: string;
    teamChanged?: boolean;
    grudgeTarget?: string;
    revealedImpostor?: string;
    revealedAgent?: string;
    revealedPlayers?: string[];
    [key: string]: unknown;
  };
  used?: boolean;
}

const GameRoom: React.FC<GameRoomProps> = ({ lobbyCode, onExitGame }) => {
  const { socket } = useSocket();
  const username: string = sessionStorage.getItem("username") ?? "PlayerUnknown";

  const [gameData, setGameData] = useState<GameState | null>(() => JSON.parse(sessionStorage.getItem('gameData') || 'null'));
  const [players, setPlayers] = useState<Player[]>(() => JSON.parse(sessionStorage.getItem('players') || '[]'));
  const [messages, setMessages] = useState<GameMessage[]>(() => JSON.parse(sessionStorage.getItem('messages') || '[]'));
  const [currentPhase, setCurrentPhase] = useState<GamePhase>(GamePhase.WAITING);
  const [myOperation, setMyOperation] = useState<PlayerOperation | null>(() => JSON.parse(sessionStorage.getItem('myOperation') || 'null'));
  const [operationTargetPlayer, setOperationTargetPlayer] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => { if (gameData) sessionStorage.setItem('gameData', JSON.stringify(gameData)); else sessionStorage.removeItem('gameData'); }, [gameData]);
  useEffect(() => { sessionStorage.setItem('players', JSON.stringify(players)); }, [players]);
  useEffect(() => { sessionStorage.setItem('messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { if (myOperation) sessionStorage.setItem('myOperation', JSON.stringify(myOperation)); else sessionStorage.removeItem('myOperation'); }, [myOperation]);
  useEffect(() => { if (gameData?.phase) setCurrentPhase(gameData.phase); }, [gameData?.phase]);

  useEffect(() => {
    if (!socket) return;

    socket.emit("rejoin-game", { lobbyCode, username });
    socket.emit("get-game-state", { lobbyCode });

    const onGameState = (data: GameState) => {
      setGameData(data);
      if (data.phase) setCurrentPhase(data.phase);
    };
    const onPlayerList = (data: Player[] | { players: Player[] }) => {
      setPlayers(Array.isArray(data) ? data : data.players);
    };
    const onGameMessage = (message: GameMessage) => setMessages(prev => [...prev, message]);
    const onGameError = (error: ErrorData) => setErrorMessage(error.message || "An error occurred.");
    const onGameStarted = (data: { phase: GamePhase; message: string }) => {
      setCurrentPhase(data.phase);
      setMessages(prev => [...prev, { type: "system", text: data.message }]);
    };
    const onPhaseChange = (data: { phase: GamePhase; message: string }) => {
      setCurrentPhase(data.phase);
      setMessages(prev => [...prev, { type: "system", text: data.message }]);
      setOperationTargetPlayer(null);
    };
    const onTeamAssignment = (data: { phase: GamePhase }) => {
      if (data.phase) setCurrentPhase(data.phase);
      setMessages(prev => [...prev, { type: "system", text: "Teams have been assigned!" }]);
    };
    const onOperationAssigned = (data: OperationAssignedData) => {
      setMessages(prev => [...prev, { type: "system", text: `Operation assigned: ${data.operation}` }]);
    };
    const onOperationPrepared = (data: { operation: string; info: PlayerOperation['details'] }) => {
      setMyOperation({ name: data.operation, details: data.info, used: data.info.confessionMade || !!data.info.targetPlayer });
      setMessages(prev => [...prev, { type: "system", text: `Your operation "${data.operation}" is ready. ${data.info.message || ''}` }]);
    };
    const onOperationUsed = (data: { success: boolean; message?: string; updatedOperation?: PlayerOperation}) => {
      if (data.success) {
        setMessages(prev => [...prev, { type: "system", text: data.message || `Operation action successful.` }]);
        if (data.updatedOperation) {
            setMyOperation(data.updatedOperation);
        } else {
            setMyOperation(prevOp => prevOp ? { ...prevOp, used: true } : null);
        }
        setOperationTargetPlayer(null);
      } else {
        setErrorMessage(data.message || "Failed to use operation.");
      }
    };
    const onPlayerVoted = (data: { username: string }) => {
      setMessages(prev => [...prev, { type: "system", text: `${data.username} has submitted a vote.` }]);
      setPlayers(prevPlayers => prevPlayers.map(p => p.username === data.username ? {...p, hasVoted: true} : p));
    };
    const onVoteSubmitted = (data: { vote: string }) => {
      setMessages(prev => [...prev, { type: "system", text: `You voted for ${data.vote}.` }]);
       setPlayers(prevPlayers => prevPlayers.map(p => p.username === username ? {...p, hasVoted: true} : p));
    };
    const onGameResults = (data: GameResultsData) => {
      setCurrentPhase(GamePhase.COMPLETED);
      setGameData(prev => ({ ...(prev || {} as GameState), results: data.results, phase: GamePhase.COMPLETED }));
      setMessages(prev => [...prev, { type: "system", text: `Game has ended. Check results!` }]);
    };
    // Added to satisfy type usage from existing file, though not explicitly in original prompt for this step
    const onPlayerJoined = (data: PlayerJoinedData) => { console.log('Player joined:', data.username); };
    const onJoinSuccess = (data: JoinSuccessData) => { console.log('Join success for lobby:', data.lobbyCode); };


    socket.on("game-state", onGameState);
    socket.on("player-list", onPlayerList);
    socket.on("game-message", onGameMessage);
    socket.on("game-error", onGameError);
    socket.on("game-started", onGameStarted);
    socket.on("phase-change", onPhaseChange);
    socket.on("team-assignment", onTeamAssignment);
    socket.on("operation-assigned", onOperationAssigned);
    socket.on("operation-prepared", onOperationPrepared);
    socket.on("operation-used", onOperationUsed);
    socket.on("player-voted", onPlayerVoted);
    socket.on("vote-submitted", onVoteSubmitted);
    socket.on("game-results", onGameResults);
    socket.on("player-joined", onPlayerJoined);
    socket.on("join-success", onJoinSuccess);


    return () => {
      socket.off("game-state", onGameState);
      socket.off("player-list", onPlayerList);
      socket.off("game-message", onGameMessage);
      socket.off("game-error", onGameError);
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
    };
  }, [socket, lobbyCode, username]);

  const handleLeaveGame = useCallback(() => {
    if (socket) socket.emit("leave-game", { lobbyCode, username });
    onExitGame();
  }, [socket, lobbyCode, username, onExitGame]);

  const handleVote = useCallback((targetPlayer: string) => {
    if (!socket || currentPhase !== GamePhase.VOTING || !username) return;
    const playerMakingVote = players.find(p => p.username === username);
    if (playerMakingVote?.hasVoted) {
        setErrorMessage("You have already voted.");
        return;
    }
    socket.emit("submit-vote", { lobbyCode, username, vote: targetPlayer });
  }, [socket, lobbyCode, username, currentPhase, players]);

  const handleUseConfession = useCallback(() => {
    // Prevent event default if it were from a form, though here it's a direct call
    // e.preventDefault(); // Not needed if not an event handler from a form submit
    if (!socket || !myOperation || myOperation.name !== "confession" || !operationTargetPlayer || !lobbyCode) {
      setErrorMessage("Cannot use confession. Invalid conditions.");
      return;
    }
    if (myOperation.details.confessionMade || myOperation.used) {
      setErrorMessage("Confession already made or operation used.");
      return;
    }
    socket.emit("use-confession", { lobbyCode, targetPlayer: operationTargetPlayer });
  }, [socket, myOperation, operationTargetPlayer, lobbyCode]);

  const handleUseDefector = useCallback(() => {
    // e.preventDefault(); // Not needed
    if (!socket || !myOperation || myOperation.name !== "defector" || !operationTargetPlayer || !lobbyCode) {
      setErrorMessage("Cannot use defector. Invalid conditions.");
      return;
    }
    if (myOperation.details.targetPlayer || myOperation.used) {
      setErrorMessage("Defector target already chosen or operation used.");
      return;
    }
    socket.emit("use-defector", { lobbyCode, targetPlayer: operationTargetPlayer });
  }, [socket, myOperation, operationTargetPlayer, lobbyCode]);

  const notificationsForWindow = messages
    .filter(msg => msg.type === "system" || msg.type === "game-event" || msg.type === "prompt")
    .map(msg => msg.text);

  const playersForVoteWindow = players.map(p => ({ id: p.username, name: p.username, hasVoted: p.hasVoted || false }));
  const playersForLobbyWindow = players.map(p => ({
    id: p.username,
    name: p.username,
    operation: players.find(pl => pl.username === p.username)?.operation?.name || (p.username === username ? myOperation?.name : undefined),
    voted: p.hasVoted || false,
    isCurrentPlayer: p.username === username,
  }));

  const currentUserPlayer = players.find(p => p.username === username);
  const playerRoleForStatusBar = currentUserPlayer?.team || (myOperation?.details.myTeam) || "Unknown";

  return (
    <div className="game-room-container p-4 space-y-4 bg-gray-100 min-h-screen flex flex-col" data-testid="game-room">
      <StatusBar
        playerName={username}
        playerRole={playerRoleForStatusBar}
        currentPhase={currentPhase}
        remainingTime={gameData?.timer?.toString() ?? "N/A"}
      />

      {errorMessage && (
        <Alert variant="danger" onClose={() => setErrorMessage("")} dismissible className="my-2">
          {errorMessage}
        </Alert>
      )}

      <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4 flex flex-col">
          <InteractionWindow
            myOperation={myOperation}
            operationTargetPlayer={operationTargetPlayer}
            setOperationTargetPlayer={setOperationTargetPlayer}
            onUseConfession={handleUseConfession}
            onUseDefector={handleUseDefector}
            lobbyCode={lobbyCode}
            username={username}
            currentPhase={currentPhase}
            players={players} // Pass full player list for target selection
            gameResults={currentPhase === GamePhase.COMPLETED ? gameData?.results : undefined}
          />
          <NotificationWindow
            notifications={notificationsForWindow}
            currentPhase={currentPhase}
          />
        </div>

        <div className="space-y-4 flex flex-col">
          <VoteWindow
            players={playersForVoteWindow}
            onVote={handleVote}
            canVote={currentPhase === GamePhase.VOTING && !(currentUserPlayer?.hasVoted)}
            currentUsername={username} // Pass current username
          />
          <LobbyWindow
            players={playersForLobbyWindow}
            currentPhase={currentPhase}
            username={username} // Pass current username
          />
        </div>
      </div>

      <div className="mt-auto pt-4">
        <Button
          variant="danger"
          onClick={handleLeaveGame}
          className="w-full md:w-auto"
          data-testid="exit-game-button"
        >
          Leave Game
        </Button>
      </div>
    </div>
  );
};

export default GameRoom;
