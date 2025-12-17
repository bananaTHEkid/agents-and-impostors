import React, { useState, useEffect } from 'react';
import { Card, Alert } from 'react-bootstrap';
import { useSocket } from '@/Socket/useSocket';
import {
  OperationAssignedData,
  GameResultsData,
  PlayerJoinedData,
  ErrorData,
} from '../types';
// no GamePhase import needed here

interface OperationInfo {
  targetPlayer?: string;
  targetTeam?: string;
  information?: string;
  revealedPlayer?: string;
  team?: string;
  secretCode?: number;
  revealed?: {
    target1Name?: string;
    target1Team?: 'agent' | 'impostor' | string;
    target2Name?: string;
    target2Team?: 'agent' | 'impostor' | string;
    message?: string;
  };
}

interface GameInfoProps {
  className?: string;
}

const GameInfo: React.FC<GameInfoProps> = ({ className }: { className?: string }) => {
  const { socket } = useSocket();
  const [operation, setOperation] = useState<string | null>(null);
  const [operationInfo, setOperationInfo] = useState<OperationInfo | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [opAccepted, setOpAccepted] = useState<boolean>(false);
  const username: string | null = sessionStorage.getItem('username');

  useEffect(() => {
    if (socket) {
      socket.on('operation-prepared', (data: { operation: string; info: OperationInfo }) => {
        setOperation(data.operation);
        setOperationInfo(data.info);
        setOpAccepted(false);
      });

      socket.on('team-assignment', (data: { impostors: string[]; agents: string[]; phase: any }) => {
        // Record association for the player (no phase display here)
        if (data.impostors && data.impostors.includes(username || '')) {
          setTeam('impostor');
        } else if (data.agents && data.agents.includes(username || '')) {
          setTeam('agent');
        }
      });

      socket.on('operation-assigned', (data: OperationAssignedData) => {
        console.log(`Operation assigned: ${data.operation}`);
      });

      socket.on('game-results', (data: GameResultsData) => {
        console.log(`Game results: ${JSON.stringify(data.results)}`);
      });

      // Live updates to operation info (e.g., reveals, selections)
      socket.on('operation-info', (data: { operation: string; info: Partial<OperationInfo>; message?: string }) => {
        // Only merge if this component is showing that operation
        setOperationInfo((prev) => ({ ...(prev || {}), ...(data.info || {}) }));
      });

      // Mark operation accepted/used to allow showing messages
      socket.on('operation-used', (data: { success: boolean }) => {
        if (data && data.success) setOpAccepted(true);
      });

      // Mark accepted when server broadcasts acceptance message for this user
      socket.on('game-message', (msg: { type: string; text: string }) => {
        try {
          if (msg && msg.type === 'system' && typeof msg.text === 'string') {
            if (username && msg.text.trim() === `${username} accepted their assignment.`) {
              setOpAccepted(true);
            }
          }
        } catch (_) {
          // ignore
        }
      });

      // Explicit acknowledgement for assignment acceptance (show messages only afterwards)
      socket.on('assignment-accepted', (data: { success: boolean }) => {
        if (data && data.success) setOpAccepted(true);
      });

      socket.on('player-joined', (data: PlayerJoinedData) => {
        console.log(`${data.username} joined the game.`);
      });

      socket.on('error', (data: ErrorData) => {
        console.error(`Error: ${data.message}`);
      });

      return () => {
        socket.off('operation-prepared');
        socket.off('team-assignment');
        socket.off('operation-assigned');
        socket.off('game-results');
        socket.off('player-joined');
        socket.off('error');
        socket.off('operation-info');
        socket.off('operation-used');
        socket.off('game-message');
        socket.off('assignment-accepted');
      };
    }
  }, [socket, username]);

  // Minimal association text only (no phase display here)

  // Short operation explanations
  const opShortDesc = (op?: string | null) => {
    const name = (op || '').toLowerCase();
    const map: Record<string, string> = {
      'confession': 'Reveal your team to a selected player.',
      'defector': 'Convert a selected player to the opposite team.',
      'danish intelligence': 'Investigate two players for matching affiliations.',
      'secret intel': 'Receive intel indicating if both or one are impostors.',
      'old photographs': 'Reveal whether two players are on the same team.',
      'grudge': 'You win if your grudge target is eliminated.',
      'infatuation': 'You win if your chosen player wins.',
      'sleeper agent': 'Your true team changes at resolution.',
      'scapegoat': 'You only win if you are voted out.',
      'anonymous tip': 'Get a tip about a player’s team.',
      'secret tip': 'Learn a single player’s affiliation.'
    };
    return map[name] || '';
  };

  const showOperationInfo: boolean = operation !== null;

  return (
    <Card className={`mb-4 ${className || ''}`}>
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h5>Your Status</h5>
      </Card.Header>
      <Card.Body>
        {team && (
          <div className="mb-3">
            <Alert variant={team === 'impostor' ? 'danger' : 'success'} className="text-center">
              <h5 className="mb-0">You are an {team === 'impostor' ? 'impostor' : 'agent'}.</h5>
            </Alert>
          </div>
        )}

        {showOperationInfo && (
          <div>
            <h6>Operation: {operation}</h6>
            {opShortDesc(operation) && <p className="text-muted mb-2">{opShortDesc(operation)}</p>}
            <div className="operation-details">
              {/* Relevant operation message (only after acceptance/usage) */}
              {opAccepted && operationInfo && operationInfo.revealed?.message && (
                <p>{operationInfo.revealed.message}</p>
              )}
              {opAccepted && operationInfo && !operationInfo.revealed?.message && (operationInfo as any).message && (
                <p>{(operationInfo as any).message}</p>
              )}

              {/* Selected input summary */}
              {operationInfo && (operationInfo as any).targetPlayer && (
                <p>You selected {(operationInfo as any).targetPlayer}.</p>
              )}
              {operationInfo && (operationInfo as any).targetPlayer1 && (operationInfo as any).targetPlayer2 && (
                <p>You selected {(operationInfo as any).targetPlayer1} and {(operationInfo as any).targetPlayer2}.</p>
              )}
              {/* Keep panel concise; input guidance stays in OperationPanel */}
            </div>
          </div>
        )}
        {!team && !showOperationInfo && (
          <p>Waiting for assignment...</p>
        )}
      </Card.Body>
    </Card>
  );
};

export default GameInfo;