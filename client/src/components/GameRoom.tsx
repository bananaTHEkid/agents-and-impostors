import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
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
  RoundResult,
} from "@/types";
import GameInfo from "./GameInfo";
import OperationPanel from '@/components/operations/OperationPanel';
import VotingPanel from '@/components/VotingPanel';
import GameRulesModal from '@/components/GameRulesModal';
interface PlayerOperation {
  name: string;
  info: {
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
import { FiLogOut, FiUsers, FiClock } from "react-icons/fi";

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
  // Voting UI is handled in VotingPanel during VOTING phase
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [currentPhase, setCurrentPhase] = useState<GamePhase>(GamePhase.WAITING);
   const [myOperation, setMyOperation] = useState<PlayerOperation | null>(() => {
    const saved = sessionStorage.getItem('myOperation');
    return saved ? JSON.parse(saved) as PlayerOperation : null;
  });
  const [finalRound, setFinalRound] = useState<RoundResult | null>(null);
  // operationTargetPlayer is now handled inside OperationPanel renderers
  const [currentTurnPlayer, setCurrentTurnPlayer] = useState<string | null>(null);
  // Track publicly announced operation names (or hidden markers) per player
  const [publicOperations, setPublicOperations] = useState<Record<string, string>>({});
  const username: string = sessionStorage.getItem("username") ?? "";
  const [showRules, setShowRules] = useState(false);

  // Compute voted counts from finalRound unconditionally to keep hook order stable
  const votedCounts = useMemo(() => {
    if (!finalRound?.votes) return { counts: {} as Record<string, number>, max: 0 };
    const counts: Record<string, number> = {};
    Object.values(finalRound.votes).forEach(target => {
      counts[target] = (counts[target] || 0) + 1;
    });
    const max = Object.values(counts).length ? Math.max(...Object.values(counts)) : 0;
    return { counts, max };
  }, [finalRound]);

  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    if (gameData) sessionStorage.setItem('gameData', JSON.stringify(gameData));
  }, [gameData]);

  useEffect(() => {
    if (players.length) sessionStorage.setItem('players', JSON.stringify(players));
    else sessionStorage.removeItem('players');
  }, [players]);

  // Spielnachrichten removed: no message persistence

  useEffect(() => {
    if (myOperation) sessionStorage.setItem('myOperation', JSON.stringify(myOperation));
    else sessionStorage.removeItem('myOperation'); // Clear if null
  }, [myOperation]);

  // Handle socket connection and reconnection
  useEffect(() => {
    if (!socket) return;

    // Reconnect to the game if we have a lobby code (include accessToken when available)
    if (lobbyCode && username) {
      const accessToken = sessionStorage.getItem("accessToken") || undefined;
      socket.emit("rejoin-game", { lobbyCode, username, accessToken });
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

    // Listen for new messages/prompts (authoritative logs from server only)
    // Spielnachrichten removed: no game-message log handling
    // Track public operation assignment announcements for sidebar display
    socket.on('operation-assigned-public', (data: { player: string; operation: string }) => {
      setPublicOperations(prev => ({ ...prev, [data.player]: data.operation }));
    });

    // Listen for errors
    socket.on("game-error", (error: ErrorData) => {
      setErrorMessage(error.message || "Ein Fehler ist aufgetreten.");
    });

    // Listen for game start
    socket.on("game-started", (data: { phase: GamePhase; message: string }) => {
      setCurrentPhase(data.phase);
    });

    // Listen for phase changes
    socket.on("phase-change", (data: { phase: GamePhase; message: string }) => {
      setCurrentPhase(data.phase);
    });

    // Listen for team and operation events
    socket.on("team-assignment", (data: { phase: GamePhase }) => {
      if (data.phase) {
        setCurrentPhase(data.phase);
      }
    });

    socket.on("operation-assigned", (data: OperationAssignedData) => {
      console.log(`Operation assigned: ${data.operation}`);
    });

    socket.on("operation-prepared", (data: { operation: string; info: PlayerOperation['info'] }) => {
      console.log(`Operation details received for ${data.operation}:`, data.info);
      // Preserve used flag if same operation gets updated info
      setMyOperation(prev => {
        const used = prev && prev.name === data.operation ? !!prev.used : false;
        return { name: data.operation, info: data.info, used } as PlayerOperation;
      });
      // Do NOT log any operation messages here to avoid revealing content before acceptance.
    });

    // Receive structured operation info updates; do not echo messages into logs
    socket.on('operation-info', (data: { operation: string; info: Partial<PlayerOperation['info']>; message?: string }) => {
      setMyOperation(prev => {
        if (!prev || prev.name !== data.operation) return prev;
        return { ...prev, info: { ...prev.info, ...(data.info as any) } } as PlayerOperation;
      });
    });
    socket.on("operation-used", (data: { operation?: string; success: boolean; message?: string }) => {
      if (data.success) {
        setMyOperation(prevOp => {
          if (!prevOp) return null;
          if (data.operation && data.operation !== prevOp.name) return prevOp;
          return { ...prevOp, used: true };
        });
      } else {
        setErrorMessage(data.message || "Operation konnte nicht ausgeführt werden.");
      }
    });
    // Explicit acknowledgement for assignment acceptance; mark operation as used
    socket.on('assignment-accepted', (_ack: { success: boolean }) => {
      setMyOperation(prevOp => {
        if (!prevOp) return prevOp;
        return { ...prevOp, used: true } as PlayerOperation;
      });
    });
    // Receive confession reveal from another player
    socket.on('confession-received', (_data: { type?: string; fromPlayer: string; theirTeam: 'agent' | 'impostor' | string }) => {
      // Spielnachrichten removed: no logging
    });
    // Receive unfortunate encounter reveal to the target player
    socket.on('encounter-received', (_data: { from: string; with: string; revealed: { message: string } }) => {
      // Spielnachrichten removed: no logging
    });
    // Listen for turn lifecycle
    socket.on('turn-start', (data: { currentTurnPlayer: string; turnIndex: number }) => {
      console.log('socket:on turn-start', { socketId: socket.id, lobbyCode, data });
      setCurrentTurnPlayer(data.currentTurnPlayer);
      // Mark players with current turn for UI highlighting
      setPlayers(prev => prev.map(p => ({ ...p, isCurrentTurn: p.username === data.currentTurnPlayer })));
    });

    socket.on('turn-change', (data: { currentTurnPlayer: string; turnIndex: number }) => {
      console.log('socket:on turn-change', { socketId: socket.id, lobbyCode, data });
      setCurrentTurnPlayer(data.currentTurnPlayer);
      // Update players list to reflect the new current turn player
      setPlayers(prev => prev.map(p => ({ ...p, isCurrentTurn: p.username === data.currentTurnPlayer })));
    });

    // Spielnachrichten removed: no player-voted log

    // Spielnachrichten removed: no vote-submitted log

    // Legacy: some servers may emit 'game-results'; keep handling if present
    socket.on("game-results", (data: GameResultsData) => {
      console.log(`Game results: ${JSON.stringify(data.results)}`);
      setCurrentPhase(GamePhase.COMPLETED);
      setGameData((prev: GameState | null) => ({ ...(prev || {}), results: data.results, phase: GamePhase.COMPLETED }));
    });

    // New: handle server 'voting-complete' and 'game-end'
    socket.on("voting-complete", (_roundResult: any) => {
      // Spielnachrichten removed: no logging
    });

    socket.on("game-end", (finalResults: any) => {
      // Map server shape to client GameState results array
      try {
        const mapped = Array.isArray(finalResults?.players) ? finalResults.players.map((p: any) => ({
          username: p.username,
          team: p.team,
          operation: p.operation,
          win_status: p.winStatus || p.win_status || (p.team === finalResults.overallWinner ? 'win' : 'lose')
        })) : [];
        const round: RoundResult | null = Array.isArray(finalResults?.roundResults) && finalResults.roundResults.length
          ? finalResults.roundResults[0]
          : null;
        setCurrentPhase(GamePhase.COMPLETED);
        setGameData((prev: GameState | null) => ({ ...(prev || {}), results: mapped, phase: GamePhase.COMPLETED }));
        setFinalRound(round);
      } catch (e) {
        console.error('Failed to handle game-end payload', e);
      }
    });

    socket.on("player-joined", (data: PlayerJoinedData) => {
      console.log(`${data.username} joined the game.`);
    });

    socket.on("join-success", (data: JoinSuccessData) => {
      console.log(`Successfully joined lobby: ${data.lobbyCode}`);
    });

    socket.on("error", (error: ErrorData) => {
      const msg = error.message || "Ein Fehler ist aufgetreten.";
      console.error(`Error: ${msg}`);
      setErrorMessage(msg);
      // If token is missing or invalid on rejoin, return to lobby for a fresh join
      if (/Zugriffstoken erforderlich|Ungültiges oder abgelaufenes Zugriffstoken/i.test(msg)) {
        setTimeout(() => {
          onExitGame();
        }, 1200);
      }
    });

    return () => {
      socket.off("game-state");
      socket.off("player-list");
      // Spielnachrichten removed: no game-message handler
      socket.off('operation-assigned-public');
      socket.off("game-error");
      socket.off("game-started");
      socket.off("phase-change");
      socket.off("team-assignment");
      socket.off("operation-assigned");
      socket.off("operation-prepared");
      socket.off('operation-info');
      socket.off("operation-used");
      socket.off('confession-received');
      socket.off('encounter-received');
      socket.off('turn-start');
      socket.off('turn-change');
      // Removed message-related handlers
      socket.off("game-results");
      socket.off("voting-complete");
      socket.off("game-end");
      socket.off("player-joined");
      socket.off("join-success");
      socket.off("error");
      socket.off('assignment-accepted');
    };
  }, [socket, lobbyCode, username]);

  // General text input submission is not used during voting

  // Confession/Defector handling moved to OperationPanel and renderers

  // Voting handled by VotingPanel

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
            <h4>Warte auf Spielstart...</h4>
          </div>
        );
        
      case GamePhase.TEAM_ASSIGNMENT:
        return (
          <div className="text-center p-4">
            <h4 className="mb-3">Team Zuweisung...</h4>
            <div className="d-flex flex-column align-items-center">
                <p className="small text-muted">Wartende Spieler: {players.map(p => p.username).join(', ')}</p>
            </div>
          </div>
        );
        
      case GamePhase.OPERATION_ASSIGNMENT:
        return (
          <div className="text-center p-4">
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
            <p>Stimme für den Spieler, den du für einen Hochstapler hältst:</p>
            {/* Reusable voting panel */}
            <VotingPanel players={players} currentUsername={username} lobbyCode={lobbyCode} />
          </div>
        );
        
      case GamePhase.COMPLETED: {
        const norm = (s?: string) => (s || '').toLowerCase();
        const winners = (gameData?.results || []).filter(r => ['win', 'won', 'victory'].includes(norm(r.win_status)));
        const losers = (gameData?.results || []).filter(r => ['lose', 'lost', 'defeat'].includes(norm(r.win_status)));
        return (
          <div className="text-center p-4">
            <h4>Spiel beendet</h4>
            {gameData?.results && (
              <div className="results mt-3 text-left">
                {finalRound && (
                  <div className="mb-4 bg-amber-50 text-amber-800 border border-amber-100 rounded-xl overflow-hidden">
                    <div className="bg-amber-100/60 p-3 border-b border-amber-100">
                      <h5 className="m-0 font-semibold">Abstimmungsergebnis</h5>
                    </div>
                    <div className="p-4">
                      {finalRound.eliminatedPlayers && finalRound.eliminatedPlayers.length === 1 && (
                        <div>
                          <span className="font-medium">Abgewählt:</span> {finalRound.eliminatedPlayers[0]} {votedCounts.max > 0 && <span className="text-sm text-amber-700">({votedCounts.max} Stimmen)</span>}
                        </div>
                      )}
                      {finalRound.eliminatedPlayers && finalRound.eliminatedPlayers.length > 1 && finalRound.eliminatedPlayers.length < (gameData?.results?.length || Infinity) && (
                        <div>
                          <span className="font-medium">Gleichstand zwischen:</span> {finalRound.eliminatedPlayers.join(', ')} {votedCounts.max > 0 && <span className="text-sm text-amber-700">({votedCounts.max} Stimmen jeweils)</span>}
                        </div>
                      )}
                      {finalRound.eliminatedPlayers && (finalRound.eliminatedPlayers.length === 0 || finalRound.eliminatedPlayers.length === (gameData?.results?.length || 0)) && (
                        <div className="text-sm">Keine eindeutige Eliminierung in dieser Runde.</div>
                      )}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-green-50 p-3 border-b border-green-100">
                      <h5 className="text-green-800 font-semibold m-0">Gewinner</h5>
                    </div>
                    <div className="p-4">
                      {winners.length ? (
                        <ul className="space-y-2">
                          {winners.map((r) => (
                            <li key={`win-${r.username}`} className="flex items-center justify-between p-3 rounded-lg border border-green-100 bg-green-50">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-medium">
                                  {r.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-gray-800">{r.username}</div>
                                  <div className="text-xs text-gray-600">Operation: {r.operation || '—'}</div>
                                </div>
                              </div>
                              <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-800 border border-green-200">
                                {r.team}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-gray-500">Keine Gewinner verzeichnet.</div>
                      )}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-red-50 p-3 border-b border-red-100">
                      <h5 className="text-red-800 font-semibold m-0">Verlierer</h5>
                    </div>
                    <div className="p-4">
                      {losers.length ? (
                        <ul className="space-y-2">
                          {losers.map((r) => (
                            <li key={`lose-${r.username}`} className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white font-medium">
                                  {r.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-gray-800">{r.username}</div>
                                  <div className="text-xs text-gray-600">Operation: {r.operation || '—'}</div>
                                </div>
                              </div>
                              <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
                                {r.team}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-gray-500">Keine Verlierer verzeichnet.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <Button 
              type="button"
              variant="default" 
              className="mt-3"
              onClick={handleLeaveGame}
              data-testid="exit-game-button"
            >
              Spiel verlassen
            </Button>
          </div>
        );
      }
        
      default:
        return null;
    }
  };

  return (
    <div className="min-h-dvh w-full box-border overflow-x-hidden flex flex-col bg-gradient-to-br from-indigo-50 to-indigo-200 px-4 md:px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-8 md:pb-10 border-t border-transparent" data-testid="game-room">
      <div className="max-w-5xl w-full mx-auto mt-6 md:mt-8 bg-white rounded-2xl shadow-xl overflow-hidden">
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
                type="button"
                variant="ghost"
                className="flex items-center gap-2 bg-white/20 text-white hover:bg-white/30"
                onClick={() => setShowRules(true)}
                data-testid="game-rules-button"
              >
                ℹ️
                Spielregeln
              </Button>
              <Button 
                type="button"
                variant="ghost"
                className="flex items-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50"
                onClick={handleLeaveGame}
                data-testid="exit-game-button"
              >
                <FiLogOut />
                Spiel verlassen
              </Button>
            </div>
          </div>
        </div>
        
        <div className="p-4 md:p-6">
          <GameRulesModal open={showRules} onClose={() => setShowRules(false)} />
          {errorMessage && (
            <Alert
              variant="destructive"
              onClose={() => setErrorMessage("")}
              dismissible
              className="mb-6 rounded-lg"
            >
              {errorMessage}
            </Alert>
          )}
          {/* Operation UI is rendered inside the phase content via OperationPanel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Players list */}
            <div className="min-h-0 order-2 lg:order-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-h-[60vh] md:max-h-[70vh] overflow-y-auto">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100">
                  <div className="flex items-center gap-2">
                    <FiUsers className="text-indigo-600 text-xl" />
                    <h3 className="text-xl font-semibold text-gray-800">Spieler</h3>
                  </div>
                </div>
                <div className="divide-y divide-gray-100" role="list">
                  {players.map((player) => {
                    const isCurrent = player.username === currentTurnPlayer;
                    const operationLabel = (() => {
                      const pub = publicOperations[player.username];
                      let label = 'ausstehend...';
                      if (player.username === username) {
                        label = myOperation?.name || (pub ? (/hidden/i.test(pub) ? 'versteckt' : pub) : 'ausstehend...');
                      } else {
                        label = pub ? (/hidden/i.test(pub) ? 'versteckt' : pub) : 'ausstehend...';
                      }
                      return label;
                    })();

                    return (
                      <div
                        key={player.username}
                        role="listitem"
                        className={`flex flex-wrap items-center justify-between gap-3 py-3 px-4 transition-colors ${isCurrent ? 'bg-amber-50' : 'bg-white'}`}
                      >
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium">
                            {player.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-800">
                              {player.username}
                              {player.username === username && " (Du)"}
                            </span>
                            <span className="text-xs text-gray-600">Operation: {operationLabel}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-auto">
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1 border border-amber-200">
                              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true"></span>
                              Aktueller Zug
                            </span>
                          )}
                          {currentPhase === GamePhase.TEAM_ASSIGNMENT && (
                            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1 border border-gray-200">
                              <span className="h-2 w-2 rounded-full bg-gray-500 animate-pulse" aria-hidden="true"></span>
                              Zuweisung
                            </span>
                          )}
                          {currentPhase !== GamePhase.WAITING &&
                            currentPhase !== GamePhase.TEAM_ASSIGNMENT &&
                            player.team &&
                            player.username === username && (
                              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
                                player.team === 'impostor'
                                  ? 'bg-red-100 text-red-800 border-red-200'
                                  : 'bg-green-100 text-green-800 border-green-200'
                              }`}>
                                {player.team === 'impostor' ? 'Hochstapler' : 'Agent'}
                              </span>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Center: Combined status + operation info and phase content */}
            <div className="order-1 lg:order-2">
              <GameInfo className="mb-6" />
              <div className="phase-content bg-white rounded-xl p-4 border border-gray-100 shadow-sm" data-testid="phase-content">
                {renderPhaseContent()}
              </div>
            </div>
            {/* Right column removed: Spielnachrichten functionality deleted */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameRoom;
