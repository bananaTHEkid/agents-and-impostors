import React, { useState, useEffect } from 'react';
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
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 ${className || ''}`}>
      <div className="bg-indigo-50 p-4 border-b border-indigo-100">
        <h3 className="text-xl font-semibold text-gray-800">Dein Status</h3>
      </div>
      <div className="p-4">
        {team && (
          <div className="mb-3">
            <div className={`${team === 'impostor' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-green-50 text-green-700 border-green-100'} p-3 rounded-lg border text-center`}>
              <span className="font-medium">Du bist ein {team === 'impostor' ? 'Hochstapler' : 'Agent'}.</span>
            </div>
          </div>
        )}

        {showOperationInfo && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-lg font-semibold text-gray-800">Operation: {operation}</h4>
            </div>
            {opShortDesc(operation) && <p className="text-gray-500 text-sm mb-3">{opShortDesc(operation)}</p>}
            <div className="operation-details text-gray-800">
              {opAccepted && operationInfo && operationInfo.revealed?.message && (
                <p className="mb-2">{operationInfo.revealed.message}</p>
              )}
              {opAccepted && operationInfo && !operationInfo.revealed?.message && (operationInfo as any).message && (
                <p className="mb-2">{(operationInfo as any).message}</p>
              )}

              {operationInfo && (operationInfo as any).targetPlayer && (
                <p className="text-sm text-gray-600">Du hast {(operationInfo as any).targetPlayer} ausgewählt.</p>
              )}
              {operationInfo && (operationInfo as any).targetPlayer1 && (operationInfo as any).targetPlayer2 && (
                <p className="text-sm text-gray-600">Du hast {(operationInfo as any).targetPlayer1} und {(operationInfo as any).targetPlayer2} ausgewählt.</p>
              )}
            </div>
          </div>
        )}
        {!team && !showOperationInfo && (
          <p className="text-gray-500 text-sm">Warte auf Zuweisung...</p>
        )}
      </div>
    </div>
  );
};

export default GameInfo;