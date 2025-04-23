import React, { useState, useEffect } from 'react';
import { Card, Badge } from 'react-bootstrap';
import { useSocket } from '../contexts/SocketContext';

interface OperationInfo {
  targetPlayer?: string;
  targetTeam?: string;
  information?: string;
  revealedPlayer?: string;
  team?: string;
  secretCode?: number;
}

const GameInfo: React.FC = () => {
  const { socket } = useSocket();
  const [operation, setOperation] = useState<string | null>(null);
  const [operationInfo, setOperationInfo] = useState<OperationInfo | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const username = sessionStorage.getItem('username');

  useEffect(() => {
    if (socket) {
      socket.on('operation-prepared', (data) => {
        setOperation(data.operation);
        setOperationInfo(data.info);
      });

      socket.on('team-assignment', (data) => {
        // Determine the player's team from the data
        if (data.impostors && data.impostors.includes(username)) {
          setTeam('impostor');
        } else if (data.agents && data.agents.includes(username)) {
          setTeam('agent');
        }
      });

      return () => {
        socket.off('operation-prepared');
        socket.off('team-assignment');
      };
    }
  }, [socket, username]);

  const getTeamColor = () => {
    if (!team) return 'secondary';
    return team === 'impostor' ? 'danger' : 'success';
  };

  return (
    <Card className="mb-4">
      <Card.Header>
        <h5>Your Role</h5>
      </Card.Header>
      <Card.Body>
        {team && (
          <div className="mb-3">
            <h6>Team: <Badge bg={getTeamColor()}>{team}</Badge></h6>
            <p className="small">
              {team === 'impostor' 
                ? 'Your goal is to remain undetected and make the agents vote incorrectly.' 
                : 'Your goal is to identify and vote out the impostors.'}
            </p>
          </div>
        )}

        <div>
          <h6>Operation: {operation || 'Waiting for assignment...'}</h6>
          {operation && (
            <div className="operation-details">
              {/* Special operation details */}
              {operation === 'grudge' && (
                <p>You have a grudge. You win if your target is eliminated.</p>
              )}
              {operation === 'infatuation' && (
                <p>You have an infatuation. You win if your target's team wins.</p>
              )}
              {operation === 'sleeper agent' && operationInfo && (
                <p>You are a sleeper agent. Your true team is the opposite of what's shown above.</p>
              )}
              {operation === 'secret agent' && operationInfo && (
                <p>Secret information: {operationInfo.information}</p>
              )}
              {operation === 'anonymous tip' && operationInfo && (
                <p>Anonymous tip about {operationInfo.revealedPlayer}: Team {operationInfo.team}.</p>
              )}
              {operation === 'danish intelligence' && operationInfo && (
                <p>Your secret code: {operationInfo.secretCode}</p>
              )}
              {operation === 'confession' && (
                <p>Your role is visible to others.</p>
              )}
              {operation === 'secret intel' && (
                <p>You have secret intelligence about other players.</p>
              )}
              {operation === 'old photographs' && (
                <p>You possess old photographs that reveal information.</p>
              )}
            </div>
          )}
        </div>
      </Card.Body>
    </Card>
  );
};

export default GameInfo; 