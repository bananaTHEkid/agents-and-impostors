import React from 'react';
import { GamePhase } from '@/types'; // Assuming Player type is used and mapped in GameRoom

// This type should align with what GameRoom provides for lobby players
interface LobbyPlayerStatus {
  id: string;
  name: string;
  operation?: string;
  voted: boolean;
  isCurrentPlayer?: boolean;
  // team?: string; // Potentially for future use, but generally not shown for all players
  // role?: string; // Potentially for future use
}

interface LobbyWindowProps {
  players: LobbyPlayerStatus[];
  currentPhase: GamePhase;
  username: string; // Already used for isCurrentPlayer, but good to have if needed directly
}

const LobbyWindow: React.FC<LobbyWindowProps> = ({ players, currentPhase, username }) => {
  return (
    <div className="lobby-window p-4 border rounded-lg shadow-lg bg-white min-h-[200px] max-h-[400px] flex flex-col">
      <h3 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2 flex-shrink-0">Players in Lobby</h3>
      {players.length === 0 ? (
        <p className="text-gray-500 italic text-center my-auto">No players in the lobby currently.</p>
      ) : (
        <div className="space-y-2 overflow-y-auto flex-grow pr-2">
          {players.map((player) => (
            <div
              key={player.id}
              className={`p-3 rounded-md shadow-sm border flex justify-between items-center transition-all duration-150
                          ${player.isCurrentPlayer ? 'bg-sky-50 border-sky-300 ring-1 ring-sky-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}
                        `}
            >
              <div>
                <span className={`font-medium ${player.isCurrentPlayer ? 'text-sky-700' : 'text-slate-800'}`}>
                  {player.name}
                  {player.isCurrentPlayer && <span className="text-xs italic ml-1 text-sky-600">(You)</span>}
                </span>
                {/* Show current player's operation if they have one and it's past team assignment */}
                {player.isCurrentPlayer && player.operation &&
                 currentPhase !== GamePhase.WAITING &&
                 currentPhase !== GamePhase.TEAM_ASSIGNMENT &&
                 currentPhase !== GamePhase.INTRODUCTION && (
                  <span className="block text-xs text-indigo-500 mt-0.5">Op: {player.operation}</span>
                )}
              </div>
              {/* Display voting status only during the VOTING phase */}
              {currentPhase === GamePhase.VOTING && (
                <span
                  className={`px-2.5 py-1 text-xs font-semibold rounded-full
                              ${player.voted
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700 animate-pulse' // Pulsing for "Voting..."
                              }
                            `}
                >
                  {player.voted ? 'Voted' : 'Voting...'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LobbyWindow;
