import React, { useState, useEffect } from 'react';
import { Container, Card, Button, ListGroup, Alert } from 'react-bootstrap';
import { useSocket } from '../contexts/SocketContext';

const GameLobby = ({ lobbyCode, onStartGame, onExitLobby }) => {
  const { socket } = useSocket();
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copySuccess, setCopySuccess] = useState('');

  useEffect(() => {
    if (!socket) return;

    // Check if user is host
    const userIsHost = sessionStorage.getItem('isHost') === 'true';
    setIsHost(userIsHost);

    // Get initial player list
    socket.emit('get_lobby_players', { lobbyCode });

    // Listen for player updates
    socket.on('lobby_players', (data) => {
      setPlayers(data.players);
    });

    // Listen for game start
    socket.on('game_started', () => {
      onStartGame();
    });

    // Listen for errors
    socket.on('lobby_error', (error) => {
      setErrorMessage(error.message);
    });

    // Listen for lobby closed (by host)
    socket.on('lobby_closed', () => {
      onExitLobby();
    });

    return () => {
      socket.off('lobby_players');
      socket.off('game_started');
      socket.off('lobby_error');
      socket.off('lobby_closed');
    };
  }, [socket, lobbyCode, onStartGame, onExitLobby]);

  const handleStartGame = () => {
    socket.emit('start_game', { lobbyCode });
  };

  const handleLeaveLobby = () => {
    socket.emit('leave_lobby', { 
      lobbyCode, 
      username: sessionStorage.getItem('username') 
    });
    onExitLobby();
  };

  const copyLobbyCode = () => {
    navigator.clipboard.writeText(lobbyCode)
      .then(() => {
        setCopySuccess('Copied to clipboard!');
        setTimeout(() => setCopySuccess(''), 2000);
      })
      .catch(() => {
        setCopySuccess('Failed to copy');
      });
  };

  return (
    <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
      <Card className="lobby-card" style={{ width: '500px' }}>
        <Card.Header className="text-center bg-primary text-white">
          <h2>Game Lobby</h2>
        </Card.Header>
        <Card.Body>
          {errorMessage && (
            <Alert variant="danger" onClose={() => setErrorMessage('')} dismissible>
              {errorMessage}
            </Alert>
          )}
          
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5>Lobby Code: <span className="badge bg-secondary">{lobbyCode}</span></h5>
            <Button 
              variant="outline-secondary" 
              size="sm" 
              onClick={copyLobbyCode}
            >
              Copy Code
            </Button>
          </div>
          
          {copySuccess && (
            <Alert variant="success" className="py-1">
              {copySuccess}
            </Alert>
          )}
          
          <h5 className="mt-4 mb-2">Players:</h5>
          <ListGroup>
            {players.map((player, index) => (
              <ListGroup.Item 
                key={index}
                className="d-flex justify-content-between align-items-center"
              >
                {player.username}
                {player.isHost && <span className="badge bg-primary">Host</span>}
              </ListGroup.Item>
            ))}
          </ListGroup>
          
          {players.length < 2 && (
            <Alert variant="info" className="mt-3">
              Waiting for more players to join...
            </Alert>
          )}

          <div className="d-flex justify-content-between mt-4">
            <Button 
              variant="outline-danger" 
              onClick={handleLeaveLobby}
            >
              Leave Lobby
            </Button>
            
            {isHost && (
              <Button 
                variant="success" 
                onClick={handleStartGame}
                disabled={players.length < 2}
              >
                Start Game
              </Button>
            )}
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default GameLobby;