import React from 'react';
import { Modal, Button, Table, Badge } from 'react-bootstrap';

interface RoundResultModalProps {
  show: boolean;
  onHide: () => void;
  result: {
    winner: 'agents' | 'impostors';
    eliminatedPlayers: string[];
    votes: Record<string, string>;
    roundNumber: number;
  } | null;
  isGameOver: boolean;
  onNextRound: () => void;
}

const RoundResultModal: React.FC<RoundResultModalProps> = ({
  show,
  onHide,
  result,
  isGameOver,
  onNextRound
}) => {
  if (!result) return null;

  const { winner, eliminatedPlayers, votes, roundNumber } = result;

  // Convert votes object to array for easier rendering
  const voteEntries = Object.entries(votes).map(([voter, target]) => ({ voter, target }));

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Round {roundNumber} Results</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="mb-4">
          <h4>Round Winner: 
            <Badge bg={winner === 'agents' ? 'primary' : 'danger'} className="ms-2">
              {winner === 'agents' ? 'Agents' : 'Impostors'}
            </Badge>
          </h4>
        </div>

        <div className="mb-4">
          <h5>Eliminated Players:</h5>
          {eliminatedPlayers.length > 0 ? (
            <ul className="list-group">
              {eliminatedPlayers.map(player => (
                <li key={player} className="list-group-item list-group-item-danger">
                  {player}
                </li>
              ))}
            </ul>
          ) : (
            <p>No players were eliminated this round.</p>
          )}
        </div>

        <h5>All Votes:</h5>
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>Voter</th>
              <th>Voted For</th>
            </tr>
          </thead>
          <tbody>
            {voteEntries.map(({ voter, target }, index) => (
              <tr key={index}>
                <td>{voter}</td>
                <td>{target}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Modal.Body>
      <Modal.Footer>
        {isGameOver ? (
          <Button variant="primary" onClick={onHide}>
            Game Over - Return to Lobby
          </Button>
        ) : (
          <Button variant="primary" onClick={onNextRound}>
            Continue to Next Round
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default RoundResultModal;
