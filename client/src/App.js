import React, { useState, useEffect } from 'react';
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

  const handleJoinGame = (code) => {
    setLobbyCode(code);
    setGameState('lobby');
  };

  const handleStartGame = () => {
    setGameState('game');
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