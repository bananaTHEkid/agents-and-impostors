import React, { useState } from 'react';
import { Container, Card, Button, Form, Alert } from 'react-bootstrap';
import axios from 'axios';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

const LandingPage = ({ onJoinGame }) => {
  const [username, setUsername] = useState('');
  const [lobbyCode, setLobbyCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleJoinLobby = async () => {
    if (!username) {
      setErrorMessage('Please enter your name');
      return;
    }
    if (!lobbyCode) {
      setErrorMessage('Please enter lobby code');
      return;
    }

    socket.emit('join-lobby', { username, lobbyCode });

    socket.on('player-joined', ({ username, team }) => {
      sessionStorage.setItem('lobbyCode', lobbyCode);
      sessionStorage.setItem('username', username);
      sessionStorage.setItem('isHost', 'false');
      onJoinGame(lobbyCode);
    });

    socket.on('error', (message) => {
      setErrorMessage(message);
    });
  };

  const handleCreateLobby = async () => {
    if (!username) {
      setErrorMessage('Please enter your name');
      return;
    }

    try {
      const response = await axios.post('http://localhost:5000/create-lobby', { username });
      if (response.data.lobbyCode) {
        sessionStorage.setItem('lobbyCode', response.data.lobbyCode);
        sessionStorage.setItem('username', username);
        sessionStorage.setItem('isHost', 'true');
        onJoinGame(response.data.lobbyCode);
      } else {
        setErrorMessage('Failed to create lobby');
      }
    } catch (error) {
      setErrorMessage('Error creating lobby');
    }
  };

  return (
    <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
      <Card className="landing-card" style={{ width: '500px' }}>
        <Card.Header className="text-center bg-primary text-white">
          <h2>Text Party Game</h2>
        </Card.Header>
        <Card.Body>
          {errorMessage && (
            <Alert variant="danger" onClose={() => setErrorMessage('')} dismissible>
              {errorMessage}
            </Alert>
          )}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Enter your name</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Enter lobby code</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter lobby code"
                value={lobbyCode}
                onChange={(e) => setLobbyCode(e.target.value)}
              />
            </Form.Group>
            <Button variant="primary" onClick={handleJoinLobby}>
              Join Lobby
            </Button>
            <Button variant="secondary" onClick={handleCreateLobby} className="ml-2">
              Create Lobby
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default LandingPage;