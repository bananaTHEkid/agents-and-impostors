import React from 'react';
import { Badge } from 'react-bootstrap';

interface VotingStatusProps {
  username: string;
  votedPlayers: Set<string>;
  eliminated: boolean;
  isCurrentPlayer: boolean;
}

const VotingStatus: React.FC<VotingStatusProps> = ({
  username,
  votedPlayers,
  eliminated,
  isCurrentPlayer
}) => {
  if (eliminated) {
    return (
      <Badge bg="danger" pill>
        Ausgeschieden
      </Badge>
    );
  }

  if (votedPlayers.has(username)) {
    return (
      <Badge bg="success" pill>
        Abgestimmt ✓
      </Badge>
    );
  }

  return (
    <Badge bg="secondary" pill>
      {isCurrentPlayer ? 'Du bist dran' : 'Wartet'}
    </Badge>
  );
};

export default VotingStatus;
