import React, { useState, useEffect } from 'react';
import { Card, Badge, Alert } from 'react-bootstrap';
import { useSocket } from '@/Socket/useSocket';
import {
  OperationAssignedData,
  GameResultsData,
  PlayerJoinedData,
  ErrorData,
} from '../types';
import { GamePhase } from '../types';

interface OperationInfo {
  targetPlayer?: string;
  targetTeam?: string;
  information?: string;
  revealedPlayer?: string;
  team?: string;
  secretCode?: number;
}

interface GameInfoProps {
  className?: string;
}

const GameInfo: React.FC<GameInfoProps> = ({ className }: { className?: string }) => {
  const { socket } = useSocket();
  const [operation, setOperation] = useState<string | null>(null);
  const [operationInfo, setOperationInfo] = useState<OperationInfo | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [phase, setPhase] = useState<GamePhase>(GamePhase.WAITING);
  const [showTeamReveal, setShowTeamReveal] = useState<boolean>(false);
  const username: string | null = sessionStorage.getItem('username');

  useEffect(() => {
    if (socket) {
      socket.on('operation-prepared', (data: { operation: string; info: OperationInfo }) => {
        setOperation(data.operation);
        setOperationInfo(data.info);
      });

      socket.on('team-assignment', (data: { impostors: string[]; agents: string[]; phase: GamePhase }) => {
        // Start team reveal animation
        setShowTeamReveal(true);
        
        // Determine the player's team from the data after a short delay for animation
        setTimeout(() => {
          if (data.impostors && data.impostors.includes(username || '')) {
            setTeam('impostor');
          } else if (data.agents && data.agents.includes(username || '')) {
            setTeam('agent');
          }
          
          if (data.phase) {
            setPhase(data.phase);
          }
        }, 2000); // 2-second delay for dramatic effect
      });
      
      socket.on('phase-change', (data: { phase: GamePhase }) => {
        setPhase(data.phase);
        // If we're past team assignment, ensure team is visible
        if (data.phase !== GamePhase.TEAM_ASSIGNMENT) {
          setShowTeamReveal(false);
        }
      });

      socket.on('game-state', (data: { phase: GamePhase }) => {
        if (data.phase) {
          setPhase(data.phase);
        }
      });

      socket.on('operation-assigned', (data: OperationAssignedData) => {
        console.log(`Operation assigned: ${data.operation}`);
      });

      socket.on('game-results', (data: GameResultsData) => {
        console.log(`Game results: ${JSON.stringify(data.results)}`);
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
        socket.off('phase-change');
        socket.off('game-state');
        socket.off('operation-assigned');
        socket.off('game-results');
        socket.off('player-joined');
        socket.off('error');
      };
    }
  }, [socket, username]);

  const getTeamColor = (): string => {
    if (!team) return 'secondary';
    return team === 'impostor' ? 'danger' : 'success';
  };

  const getPhaseLabel = (): string => {
    switch (phase) {
      case GamePhase.WAITING:
        return 'Waiting for Game to Start';
      case GamePhase.TEAM_ASSIGNMENT:
        return 'Team Assignment Phase';
      case GamePhase.OPERATION_ASSIGNMENT:
        return 'Operation Assignment Phase';
      case GamePhase.VOTING:
        return 'Voting Phase';
      case GamePhase.COMPLETED:
        return 'Game Completed';
      default:
        return 'Unknown Phase';
    }
  };

  // Only show team and operation info after they're assigned
  const showTeamInfo: boolean = phase !== GamePhase.WAITING && team !== null && !showTeamReveal;
  const showOperationInfo: boolean = operation !== null && (phase === GamePhase.VOTING || phase === GamePhase.COMPLETED);

  // Team reveal component
  const renderTeamReveal = (): JSX.Element | null => {
    if (!showTeamReveal || phase !== GamePhase.TEAM_ASSIGNMENT) return null;
    
    return (
      <div className="team-reveal-animation">
        <div className="text-center mb-4">
          <div className="spinner-grow" role="status">
            <span className="visually-hidden">Assigning team...</span>
          </div>
          <h5 className="mt-3">Assigning your team...</h5>
          <div className="card-flip my-4">
            <div className="card-inner">
              <div className="card-front bg-secondary text-white p-4 rounded">
                <h3>?</h3>
                <p>Your Team</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className={`mb-4 ${className || ''}`}>
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h5>Your Role</h5>
        <Badge bg="info">{getPhaseLabel()}</Badge>
      </Card.Header>
      <Card.Body>
        {renderTeamReveal()}

        {showTeamInfo && (
          <div className="mb-3 team-info-container">
            <Alert variant={team === 'impostor' ? 'danger' : 'success'} className="text-center">
              <h4 className="alert-heading">You are an {team === 'impostor' ? 'IMPOSTOR' : 'AGENT'}!</h4>
              <hr />
              <h6>Team: <Badge bg={getTeamColor()}>{team}</Badge></h6>
              <p className="small mb-0">
                {team === 'impostor' 
                  ? 'Your goal is to remain undetected and make the agents vote incorrectly.' 
                  : 'Your goal is to identify and vote out the impostors.'}
              </p>
            </Alert>
          </div>
        )}

        {showOperationInfo && (
          <div>
            <h6>Operation: {operation}</h6>
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
              {operation === 'scapegoat' && (
                <p>You win if you are eliminated.</p>
              )}
            </div>
          </div>
        )}
        
        {!showTeamInfo && !showOperationInfo && !showTeamReveal && (
          <p>Waiting for role assignment...</p>
        )}
      </Card.Body>
    </Card>
  );
};

export default GameInfo;