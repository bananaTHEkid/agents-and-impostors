import React, { useState } from 'react';
import { Container, Card, Button, Form, Alert } from 'react-bootstrap';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';

const LandingPage = ({ onJoinGame }) => {
  const [username, setUsername] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const { socket } = useSocket();

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
            <Button variant="primary" onClick={handleCreateLobby}>
              Create Lobby
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default LandingPage;