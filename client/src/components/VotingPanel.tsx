import React, { useState, useEffect, useMemo } from 'react';
import { useSocket } from '@/Socket/useSocket';
import { Player } from '@/types';

interface VotingPanelProps {
  players: Player[];
  currentUsername: string;
  lobbyCode: string;
}

const VotingPanel: React.FC<VotingPanelProps> = ({
  players,
  currentUsername,
  lobbyCode,
  
}) => {
  const { socket } = useSocket();
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [votedPlayers, setVotedPlayers] = useState<Set<string>>(new Set());
  // Removed manual text vote to streamline UX

  // Listen for vote confirmation
  useEffect(() => {
    if (!socket) return;

    const handleVoteSubmitted = (data: { username?: string; vote?: string }) => {
      setHasVoted(true);
      if (data?.username) {
        setVotedPlayers(prev => new Set(prev).add(data.username as string));
      }
    };

    const handlePlayerVoted = (data: { username: string }) => {
      if (data?.username) {
        setVotedPlayers(prev => new Set(prev).add(data.username));
      }
    };

    const handleGameError = (data: { message: string }) => {
      setError(data.message);
      // Clear error after 5 seconds
      setTimeout(() => setError(null), 5000);
    };

    socket.on('vote-submitted', handleVoteSubmitted);
    socket.on('player-voted', handlePlayerVoted);
    socket.on('game-error', handleGameError);

    return () => {
      socket.off('vote-submitted', handleVoteSubmitted);
      socket.off('player-voted', handlePlayerVoted);
      socket.off('game-error', handleGameError);
    };
  }, [socket]);

  const submitVote = (voteTarget: string) => {
    if (!voteTarget || !socket) return;
    socket.emit('submit-vote', {
      lobbyCode,
      username: currentUsername,
      vote: voteTarget
    });
  };

  // No manual vote via textbox; votes are cast by clicking player buttons

  // Filter out eliminated players (would come from the game state)
  const activePlayers = players.filter(player => !player.eliminated);

  const progress = useMemo(() => {
    const activeCount = activePlayers.length || 1;
    const votedCount = votedPlayers.size;
    const pct = Math.round((votedCount / activeCount) * 100);
    return { votedCount, activeCount, pct };
  }, [activePlayers.length, votedPlayers]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="bg-indigo-50 p-3 border-b border-indigo-100 flex items-center justify-between">
        <h4 className="text-base font-semibold text-gray-800 m-0">Abstimmung</h4>
        <div className="text-sm text-gray-600">
          {progress.votedCount} / {progress.activeCount} abgestimmt
        </div>
      </div>
      <div className="p-4">
        {error && (
          <div className="mb-3 bg-red-50 text-red-700 border border-red-100 p-3 rounded-lg">
            {error}
          </div>
        )}

        {hasVoted ? (
          <div className="mb-4 bg-green-50 text-green-700 border border-green-100 p-3 rounded-lg">
            Deine Stimme für <strong>{selectedPlayer}</strong> wurde gezählt.
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {activePlayers.map((player) => {
                const disabled = player.username === currentUsername || hasVoted;
                const selected = selectedPlayer === player.username;
                return (
                  <button
                    key={player.username}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      setSelectedPlayer(player.username);
                      // Emit immediately on direct click (test expects this behavior)
                      submitVote(player.username);
                    }}
                    aria-label={player.username}
                    className={
                      "w-full text-left flex items-center justify-between px-4 py-3 rounded-lg border " +
                      (selected ? "border-indigo-500 ring-2 ring-indigo-200 " : "border-gray-200 ") +
                      (disabled ? "bg-gray-50 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer")
                    }
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium">
                        {player.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800">
                        {player.username}
                        {player.username === currentUsername && <span className="text-gray-500 ml-1">(Du)</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {votedPlayers.has(player.username) && (
                        <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">Abgestimmt</span>
                      )}
                      {/* Team badges removed to avoid revealing associations on voting buttons */}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Manual text voting removed; use player buttons above to submit a vote */}
          </>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>{progress.votedCount} von {progress.activeCount} Spielern haben abgestimmt</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600"
              style={{ width: `${progress.pct}%` }}
              aria-valuenow={progress.pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VotingPanel;
