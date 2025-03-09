import React, { useState, useEffect } from 'react';
import { Container, Card, Button, Form, ListGroup, Alert } from 'react-bootstrap';
import { useSocket } from '../contexts/SocketContext';

const GameRoom = ({ lobbyCode, onExitGame }) => {
  const { socket } = useSocket();
  const [gameData, setGameData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const username = sessionStorage.getItem('username');

  useEffect(() => {
    if (!socket) return;

    // Get initial game state
    socket.emit('get_game_state', { lobbyCode });

    // Listen for game state updates
    socket.on('game_state', (data) => {
      setGameData(data);
    });

    // Listen for player updates
    socket.on('player_list', (data) => {
      setPlayers(data.players);
    });

    // Listen for new messages/prompts
    socket.on('game_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    // Listen for errors
    socket.on('game_error', (error) => {
      setErrorMessage(error.message);
    });

    // Listen for game end
    socket.on('game_ended', () => {
      // Show final scores or end game message before exiting
      setTimeout(() => {
        onExitGame();
      }, 5000);
    });

    return () => {
      socket.off('game_state');
      socket.off('player_list');
      socket.off('game_message');
      socket.off('game_error');
      socket.off('game_ended');
    };
  }, [socket, lobbyCode, onExitGame]);

  const handleSubmitResponse = (e) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    socket.emit('submit_response', {
      lobbyCode,
      username,
      response: userInput
    });
    
    setUserInput('');
  };

  const handleLeaveGame = () => {
    socket.emit('leave_game', { lobbyCode, username });
    onExitGame();
  };

  // Function to determine if user can submit a response based on game state
  const canSubmitResponse = () => {
    if (!gameData) return false;
    return gameData.currentState === 'awaiting_responses' && 
           !gameData.submittedPlayers.includes(username);
  };

  return (
    <Container className="py-4">
      <Card>
        <Card.Header className="bg-primary text-white">
          <div className="d-flex justify-content-between align-items-center">
            <h2>Text Party Game</h2>
            <Button variant="light" size="sm" onClick={handleLeaveGame}>
              Leave Game
            </Button>
          </div>
        </Card.Header>
        <Card.Body>
          {errorMessage && (
            <Alert variant="danger" onClose={() => setErrorMessage('')} dismissible>
              {errorMessage}
            </Alert>
          )}
          
          <div className="row">
            {/* Game content area */}
            <div className="col-md-8">
              <div className="game-messages p-3 border rounded" style={{ height: '400px', overflowY: 'auto' }}>
                {messages.map((msg, index) => (
                  <div key={index} className={`message mb-3 ${msg.type === 'system' ? 'text-muted' : ''}`}>
                    {msg.type === 'system' ? (
                      <div className="system-message">{msg.text}</div>
                    ) : msg.type === 'prompt' ? (
                      <div className="prompt-message bg-light p-2 rounded">
                        <strong>Prompt: </strong> {msg.text}
                      </div>
                    ) : (
                      <div className="player-message">
                        <strong>{msg.from}: </strong> {msg.text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              <Form onSubmit={handleSubmitResponse} className="mt-3">
                <Form.Group className="d-flex">
                  <Form.Control
                    type="text"
                    placeholder={canSubmitResponse() ? "Type your response..." : "Waiting..."}
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    disabled={!canSubmitResponse()}
                  />
                  <Button 
                    variant="primary" 
                    type="submit" 
                    className="ms-2"
                    disabled={!canSubmitResponse()}
                  >
                    Submit
                  </Button>
                </Form.Group>
              </Form>
            </div>
            
            {/* Players sidebar */}
            <div className="col-md-4">
              <h5>Players</h5>
              <ListGroup>
                {players.map((player, index) => (
                  <ListGroup.Item 
                    key={index}
                    className={`d-flex justify-content-between align-items-center ${
                      gameData?.currentPlayer === player.username ? 'bg-light' : ''
                    }`}
                  >
                    {player.username}
                    <span className="badge bg-secondary">{player.score || 0} pts</span>
                  </ListGroup.Item>
                ))}
              </ListGroup>
              
              {gameData && (
                <div className="game-info mt-4">
                  <h5>Game Info</h5>
                  <p>Round: {gameData.round} / {gameData.totalRounds}</p>
                  <p>
                    Status: {' '}
                    <span className="badge bg-info">
                      {gameData.currentState.replace('_', ' ')}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default GameRoom;