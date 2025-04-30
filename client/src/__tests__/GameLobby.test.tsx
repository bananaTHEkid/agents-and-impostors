import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameLobby from '../components/GameLobby';
import { mockSocket, triggerSocketEvent } from './setup';

describe('GameLobby Component', () => {
  const mockProps = {
    lobbyCode: 'TEST123',
    onStartGame: vi.fn(),
    onExitLobby: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders lobby code correctly', () => {
    render(<GameLobby {...mockProps} />);
    expect(screen.getByText('TEST123')).toBeInTheDocument();
  });

  it('displays player list when players join', async () => {
    render(<GameLobby {...mockProps} />);
    
    // Use triggerSocketEvent instead of mocking on
    await triggerSocketEvent('player-joined', { username: 'player1' });

    // Wait for player list to update
    await waitFor(() => {
      expect(screen.getByText('player1')).toBeInTheDocument();
    });
  });

  it('calls onStartGame when start button is clicked', async () => {
    render(<GameLobby {...mockProps} />);
    
    // Add at least 2 players so the button isn't disabled
    await triggerSocketEvent('player-list', { 
      players: [
        { username: 'testUser', isHost: true },
        { username: 'otherPlayer' }
      ] 
    });
    
    // Wait for the start button to be enabled
    await waitFor(() => {
      const startButton = screen.getByTestId('start-game-button');
      expect(startButton).not.toBeDisabled();
    });
    
    // Click the start button
    const startButton = screen.getByTestId('start-game-button');
    fireEvent.click(startButton);
    
    // Manually trigger the game-started event since our mock doesn't do this automatically
    await triggerSocketEvent('game-started', {});
    
    // Now check if onStartGame was called
    expect(mockProps.onStartGame).toHaveBeenCalled();
  });

  it('calls onExitLobby when exit button is clicked', () => {
    render(<GameLobby {...mockProps} />);
    
    // Use the correct test ID that matches the component
    const exitButton = screen.getByTestId('exit-game-button');
    fireEvent.click(exitButton);
    
    expect(mockProps.onExitLobby).toHaveBeenCalled();
  });

  it('handles player left event', async () => {
    render(<GameLobby {...mockProps} />);
    
    // First add a player
    await triggerSocketEvent('player-joined', { username: 'player1' });
    
    // Wait for player to appear
    await waitFor(() => {
      expect(screen.getByText('player1')).toBeInTheDocument();
    });
    
    // Now remove the player
    await triggerSocketEvent('player-left', { username: 'player1' });

    // Wait for player to be removed from list
    await waitFor(() => {
      expect(screen.queryByText('player1')).not.toBeInTheDocument();
    });
  });

  it('displays error messages', async () => {
    render(<GameLobby {...mockProps} />);

    // Use triggerSocketEvent to properly trigger the error event
    await triggerSocketEvent('error', { message: 'Test error message' });

    // Wait for error message to appear
    await waitFor(() => {
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });
  });

  it('updates player list when receiving player-list event', async () => {
    render(<GameLobby {...mockProps} />);

    // Use triggerSocketEvent with correct player format
    await triggerSocketEvent('player-list', { 
      players: [
        { username: 'player1' }, 
        { username: 'player2' }, 
        { username: 'player3' }
      ] 
    });

    // Wait for all players to appear in the list
    await waitFor(() => {
      expect(screen.getByText('player1')).toBeInTheDocument();
      expect(screen.getByText('player2')).toBeInTheDocument();
      expect(screen.getByText('player3')).toBeInTheDocument();
    });
  });

  it('cleans up socket listeners on unmount', () => {
    const { unmount } = render(<GameLobby {...mockProps} />);
    
    unmount();

    // Verify socket cleanup
    expect(mockSocket.off).toHaveBeenCalledWith('player-joined');
    expect(mockSocket.off).toHaveBeenCalledWith('player-left');
    expect(mockSocket.off).toHaveBeenCalledWith('error');
    expect(mockSocket.off).toHaveBeenCalledWith('player-list');
  });
}); 