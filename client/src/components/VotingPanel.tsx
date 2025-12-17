import React, { useState, useEffect, useMemo } from 'react';
import { ListGroup, Button, Alert, Badge } from 'react-bootstrap';
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

  const handleVote = () => {
    if (!selectedPlayer || !socket) return;
    
    socket.emit('submit-vote', {
      lobbyCode,
      username: currentUsername,
      vote: selectedPlayer
    });
  };

  // Filter out eliminated players (would come from the game state)
  const activePlayers = players.filter(player => !player.eliminated);

  const progress = useMemo(() => {
    const activeCount = activePlayers.length || 1;
    const votedCount = votedPlayers.size;
    const pct = Math.round((votedCount / activeCount) * 100);
    return { votedCount, activeCount, pct };
  }, [activePlayers.length, votedPlayers]);

  return (
    <div className="voting-panel">
      <h2 className="mb-4">Vote for a player</h2>
      
      {error && <Alert variant="danger">{error}</Alert>}
      
      {hasVoted ? (
        <Alert variant="success">
          Your vote for <strong>{selectedPlayer}</strong> has been recorded.
        </Alert>
      ) : (
        <>
          <ListGroup className="mb-4">
            {activePlayers.map((player) => (
              <ListGroup.Item
                key={player.username}
                active={selectedPlayer === player.username}
                disabled={player.username === currentUsername || hasVoted}
                onClick={() => !hasVoted && player.username !== currentUsername && setSelectedPlayer(player.username)}
                className="d-flex justify-content-between align-items-center"
                style={{ cursor: player.username !== currentUsername && !hasVoted ? 'pointer' : 'not-allowed' }}
              >
                <div>
                  <span>{player.username}</span>
                  {player.username === currentUsername && <span className="text-muted ms-2">(You)</span>}
                </div>
                <div>
                  {votedPlayers.has(player.username) && (
                    <Badge bg="info" className="me-2">Voted</Badge>
                  )}
                  {player.team && <Badge bg={player.team === 'agent' ? 'primary' : 'danger'}>{player.team}</Badge>}
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
          
          <Button
            variant="primary"
            disabled={!selectedPlayer || hasVoted}
            onClick={handleVote}
            className="w-100"
          >
            Submit Vote
          </Button>
        </>
      )}
      
      <div className="mt-4">
        <h5>Voting Progress</h5>
        <div className="d-flex justify-content-between">
          <span>{progress.votedCount} of {progress.activeCount} players have voted</span>
          <span>{progress.pct}%</span>
        </div>
        <div className="progress">
          <div
            className="progress-bar"
            role="progressbar"
            style={{ width: `${progress.pct}%` }}
            aria-valuenow={progress.pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>
    </div>
  );
};

export default VotingPanel;
