import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LandingPage from '../components/LandingPage';
import { SocketContext } from '../contexts/SocketContext';

// Mock sessionStorage
const mockSessionStorage = (() => {
  let store = {};
  return {
    getItem: jest.fn(key => store[key]),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn(key => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();
Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage });

// Mock the socket
const mockSocket = {
  emit: jest.fn(),
  on: jest.fn(),
  once: jest.fn((event, callback) => {
    if (event === 'lobby_created') {
      // Store the callback to trigger it in tests
      mockSocket.lobbyCreatedCallback = callback;
    }
  }),
  off: jest.fn()
};

const mockSocketContext = {
  socket: mockSocket,
  connected: true
};

describe('LandingPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders landing page with form inputs', () => {
    render(
      <SocketContext.Provider value={mockSocketContext}>
        <LandingPage onJoinGame={() => {}} />
      </SocketContext.Provider>
    );
    
    expect(screen.getByText(/Text Party Game/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter your name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter lobby name/i)).toBeInTheDocument();
    expect(screen.getByText(/Create Lobby/i)).toBeInTheDocument();
  });

  test('shows error when creating lobby without username', () => {
    render(
      <SocketContext.Provider value={mockSocketContext}>
        <LandingPage onJoinGame={() => {}} />
      </SocketContext.Provider>
    );
    
    // Try to create lobby without entering username
    fireEvent.click(screen.getByText(/Create Lobby/i));
    
    expect(screen.getByText(/Please enter your name/i)).toBeInTheDocument();
  });

  test('shows error when creating lobby without lobby name', () => {
    render(
      <SocketContext.Provider value={mockSocketContext}>
        <LandingPage onJoinGame={() => {}} />
      </SocketContext.Provider>
    );
    
    // Enter username but not lobby name
    fireEvent.change(screen.getByPlaceholderText(/Enter your name/i), {
      target: { value: 'TestPlayer' }
    });
    
    // Try to create lobby
    fireEvent.click(screen.getByText(/Create Lobby/i));
    
    expect(screen.getByText(/Please enter a lobby name/i)).toBeInTheDocument();
  });

  test('emits create_lobby event with correct data', () => {
    render(
      <SocketContext.Provider value={mockSocketContext}>
        <LandingPage onJoinGame={() => {}} />
      </SocketContext.Provider>
    );
    
    // Fill the form
    fireEvent.change(screen.getByPlaceholderText(/Enter your name/i), {
      target: { value: 'TestPlayer' }
    });
    
    fireEvent.change(screen.getByPlaceholderText(/Enter lobby name/i), {
      target: { value: 'Fun Game' }
    });
    
    // Create lobby
    fireEvent.click(screen.getByText(/Create Lobby/i));
    
    // Check if socket.emit was called with correct data
    expect(mockSocket.emit).toHaveBeenCalledWith('create_lobby', {
      username: 'TestPlayer',
      lobbyName: 'Fun Game'
    });
  });

  test('handles successful lobby creation', async () => {
    const mockJoinGame = jest.fn();
    
    render(
      <SocketContext.Provider value={mockSocketContext}>
        <LandingPage onJoinGame={mockJoinGame} />
      </SocketContext.Provider>
    );
    
    // Fill the form and create lobby
    fireEvent.change(screen.getByPlaceholderText(/Enter your name/i), {
      target: { value: 'TestPlayer' }
    });
    
    fireEvent.change(screen.getByPlaceholderText(/Enter lobby name/i), {
      target: { value: 'Fun Game' }
    });
    
    fireEvent.click(screen.getByText(/Create Lobby/i));
    
    // Simulate server response
    mockSocket.lobbyCreatedCallback({ code: 'ABC123' });
    
    // Check if session storage was updated
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('lobbyCode', 'ABC123');
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('username', 'TestPlayer');
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('isHost', 'true');
    
    // Check if onJoinGame was called with the lobby code
    expect(mockJoinGame).toHaveBeenCalledWith('ABC123');
  });
});