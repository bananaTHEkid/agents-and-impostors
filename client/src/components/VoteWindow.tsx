import React, { useState } from 'react';

interface VotePlayer {
  id: string;
  name: string;
  hasVoted?: boolean; // To potentially show who has already voted, if desired in future
}

interface VoteWindowProps {
  players: VotePlayer[];
  onVote: (playerId: string) => void;
  canVote: boolean;
  currentUsername: string;
}

const VoteWindow: React.FC<VoteWindowProps> = ({ players, onVote, canVote, currentUsername }) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null); // For visual feedback, if desired

  return (
    <div className="vote-window p-4 border rounded-lg shadow-lg bg-white min-h-[200px]">
      <h3 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Vote For Player</h3>
      {canVote ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {players.map((player) => {
            const isSelf = player.name === currentUsername;
            return (
              <button
                key={player.id}
                onClick={() => {
                  if (isSelf || !canVote) return;
                  // setSelectedPlayerId(player.id); // Optional: for visual feedback before action completes
                  onVote(player.id); // Directly call onVote
                }}
                onMouseEnter={() => !isSelf && canVote && setSelectedPlayerId(player.id)}
                onMouseLeave={() => setSelectedPlayerId(null)}
                disabled={isSelf || !canVote}
                className={`p-3 rounded-lg shadow-md text-center font-medium transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2
                            ${isSelf
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-sky-500 hover:bg-sky-600 text-white focus:ring-sky-500'
                            }
                            ${selectedPlayerId === player.id && !isSelf ? 'ring-2 ring-sky-700 ring-offset-2 scale-105' : ''}
                          `}
              >
                {player.name}
                {isSelf && <span className="block text-xs italic">(You)</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-500 italic text-center mt-4 py-5">
          {/* This message is generic because currentPhase is not a prop here.
              GameRoom sets canVote based on phase AND if user has voted. */}
          You have already voted, or voting is not currently active.
        </p>
      )}
    </div>
  );
};

export default VoteWindow;
