import React, { useState, useEffect } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import { SocketProvider } from './contexts/SocketContext';
import LandingPage from './components/LandingPage';
import GameLobby from './components/GameLobby';
import GameRoom from './components/GameRoom';
import './App.css';

function App() {
  const [gameState, setGameState] = useState('landing'); // 'landing', 'lobby', or 'game'
  const [lobbyCode, setLobbyCode] = useState(null);

  // Check for existing session
  useEffect(() => {
    const savedLobbyCode = sessionStorage.getItem('lobbyCode');
    const savedUsername = sessionStorage.getItem('username');
    
    if (savedLobbyCode && savedUsername) {
      setLobbyCode(savedLobbyCode);
      setGameState('lobby');
    }
  }, []);

  const handleJoinGame = async (code) => {
    try {
      const response = await axios.post('http://localhost:5000/join-lobby', { code });
      if (response.data.success) {
        setLobbyCode(code);
        setGameState('lobby');
        sessionStorage.setItem('lobbyCode', code);
        sessionStorage.setItem('username', response.data.username);
      } else {
        console.error('Failed to join game:', response.data.message);
      }
    } catch (error) {
      console.error('Error joining game:', error);
    }
  };

  const handleStartGame = async () => {
    try {
      const response = await axios.post('http://localhost:5000/start-game', { lobbyCode });
      if (response.data.success) {
        setGameState('game');
      } else {
        console.error('Failed to start game:', response.data.message);
      }
    } catch (error) {
      console.error('Error starting game:', error);
    }
  };

  const handleExitGame = () => {
    // Clear session data
    sessionStorage.removeItem('lobbyCode');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('isHost');
    setLobbyCode(null);
    setGameState('landing');
  };

  return (
    <SocketProvider>
      {gameState === 'landing' && (
        <LandingPage onJoinGame={handleJoinGame} />
      )}
      
      {gameState === 'lobby' && (
        <GameLobby 
          lobbyCode={lobbyCode} 
          onStartGame={handleStartGame} 
          onExitLobby={handleExitGame} 
        />
      )}
      
      {gameState === 'game' && (
        <GameRoom 
          lobbyCode={lobbyCode} 
          onExitGame={handleExitGame} 
        />
      )}
    </SocketProvider>
  );
}

export default App;