import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { mockSocket } from './setup';
import { SocketProvider } from '../contexts/SocketContext';

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock sessionStorage
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation((key) => {
      if (key === 'username') return 'testUser';
      if (key === 'lobbyCode') return 'TEST123';
      return null;
    });
  });

  it('renders landing page initially', () => {
    render(
      <SocketProvider>
        <App />
      </SocketProvider>
    );
    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
  });

  it('transitions to lobby view when joining a game', async () => {
    render(
      <SocketProvider>
        <App />
      </SocketProvider>
    );

    // Fill in the form
    const usernameInput = screen.getByLabelText(/username/i);
    const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
    
    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: 'testUser' } });
      fireEvent.change(lobbyCodeInput, { target: { value: 'TEST123' } });
    });

    // Submit the form
    const joinButton = screen.getByTestId('join-game-button');
    await act(async () => {
      fireEvent.click(joinButton);
    });

    // Mock successful join response
    await act(async () => {
      mockSocket.emit('join-success', { lobbyCode: 'TEST123' });
      // Wait a tick for state to update
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Wait for lobby view to appear
    await waitFor(() => {
      expect(screen.getByTestId('game-lobby')).toBeInTheDocument();
    });
  });

  it('transitions to game view when starting a game', async () => {
    render(
      <SocketProvider>
        <App />
      </SocketProvider>
    );

    // Fill in the form
    const usernameInput = screen.getByLabelText(/username/i);
    const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
    
    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: 'testUser' } });
      fireEvent.change(lobbyCodeInput, { target: { value: 'TEST123' } });
    });

    // Submit the form
    const joinButton = screen.getByTestId('join-game-button');
    await act(async () => {
      fireEvent.click(joinButton);
    });

    // Mock successful join response
    await act(async () => {
      mockSocket.emit('join-success', { lobbyCode: 'TEST123' });
      // Wait a tick for state to update
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Wait for lobby view
    await waitFor(() => {
      expect(screen.getByTestId('game-lobby')).toBeInTheDocument();
    });

    // Mock player list with host status
    await act(async () => {
      mockSocket.emit('player-list', {
        players: [{ username: 'testUser', isHost: true }]
      });
      // Wait a tick for state to update
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Start game
    const startButton = screen.getByTestId('start-game-button');
    await act(async () => {
      fireEvent.click(startButton);
    });

    // Mock game start response
    await act(async () => {
      mockSocket.emit('game-started', { phase: 'team_assignment' });
      // Wait a tick for state to update
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Verify game view
    await waitFor(() => {
      expect(screen.getByTestId('game-room')).toBeInTheDocument();
    });
  });

  it('handles socket events correctly', async () => {
    render(
      <SocketProvider>
        <App />
      </SocketProvider>
    );

    // Mock socket events
    const mockEvents = {
      'team-assignment': { team: 'agent' },
      'operation-assigned': { operation: 'secret_agent' },
      'operation-phase-complete': {},
      'vote-submitted': { username: 'player1' },
      'game-results': { results: [] },
      'error': { message: 'Test error' },
      'player-joined': { username: 'newPlayer' }
    };

    // Simulate socket events
    for (const [event, data] of Object.entries(mockEvents)) {
      await act(async () => {
        mockSocket.emit(event, data);
        // Wait a tick for state to update
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    }

    // Verify socket event handlers were called
    expect(mockSocket.on).toHaveBeenCalledWith('team-assignment', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('operation-assigned', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('operation-phase-complete', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('vote-submitted', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('game-results', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('player-joined', expect.any(Function));
  });

  it('handles exit game correctly', async () => {
    render(
      <SocketProvider>
        <App />
      </SocketProvider>
    );

    // Fill in the form
    const usernameInput = screen.getByLabelText(/username/i);
    const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
    
    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: 'testUser' } });
      fireEvent.change(lobbyCodeInput, { target: { value: 'TEST123' } });
    });

    // Submit the form
    const joinButton = screen.getByTestId('join-game-button');
    await act(async () => {
      fireEvent.click(joinButton);
    });

    // Mock successful join response
    await act(async () => {
      mockSocket.emit('join-success', { lobbyCode: 'TEST123' });
      // Wait a tick for state to update
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Wait for lobby view
    await waitFor(() => {
      expect(screen.getByTestId('game-lobby')).toBeInTheDocument();
    });

    // Exit game
    const exitButton = screen.getByTestId('exit-game-button');
    await act(async () => {
      fireEvent.click(exitButton);
    });

    // Verify return to landing page
    await waitFor(() => {
      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    });
  });
}); 