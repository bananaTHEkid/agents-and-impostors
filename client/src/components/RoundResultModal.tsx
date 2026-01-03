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
        <Modal.Title>Ergebnisse Runde {roundNumber}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="mb-4">
          <h4>Rundensieger: 
            <Badge bg={winner === 'agents' ? 'primary' : 'danger'} className="ms-2">
              {winner === 'agents' ? 'Agenten' : 'Hochstapler'}
            </Badge>
          </h4>
        </div>

        <div className="mb-4">
          <h5>Ausgeschiedene Spieler:</h5>
          {eliminatedPlayers.length > 0 ? (
            <ul className="list-group">
              {eliminatedPlayers.map(player => (
                <li key={player} className="list-group-item list-group-item-danger">
                  {player}
                </li>
              ))}
            </ul>
          ) : (
            <p>In dieser Runde ist kein Spieler ausgeschieden.</p>
          )}
        </div>

        <h5>Alle Stimmen:</h5>
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>Stimmender</th>
              <th>Gewählt</th>
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
            Spiel beendet – Zurück zur Lobby
          </Button>
        ) : (
          <Button variant="primary" onClick={onNextRound}>
            Weiter zur nächsten Runde
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default RoundResultModal;
