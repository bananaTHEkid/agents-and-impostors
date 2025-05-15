import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
    sessionStorage.clear(); // Clear sessionStorage before each test
  });

  it('renders lobby code correctly', () => {
    sessionStorage.setItem('username', 'testUser'); // Assume a user is logged in
    render(<GameLobby {...mockProps} />);
    expect(screen.getByText('TEST123')).toBeInTheDocument();
  });

  it('displays player list when players join', async () => {
    sessionStorage.setItem('username', 'testUser');
    render(<GameLobby {...mockProps} />);
    
    await act(async () => {
      await triggerSocketEvent('player-joined', { username: 'player1', id: 'player-1', isHost: false });
    });

    // Wait for player list to update
    await waitFor(() => {
      expect(screen.getByText('player1')).toBeInTheDocument();
    });
  });

  it('calls onStartGame when start button is clicked and server responds successfully', async () => {
    sessionStorage.setItem('username', 'testUser'); // Set current user as 'testUser'
    render(<GameLobby {...mockProps} />);
    
    // Add at least 2 players so the button isn't disabled
    await act(async () => {
      await triggerSocketEvent('player-list', { 
        players: [
          { username: 'testUser', isHost: true, id: 'host-1' },
          { username: 'otherPlayer', isHost: false, id: 'player-2' }
        ] 
      });
    });
    
    // Wait for the start button to be enabled
    let startButton: HTMLButtonElement;
    await waitFor(() => {
      startButton = screen.getByTestId('start-game-button');
      expect(startButton).not.toBeDisabled();
    });
    
    // Spy on socket.emit to control the callback for 'start-game'
    const startGameEmitSpy = vi.spyOn(mockSocket, 'emit');
    startGameEmitSpy.mockImplementation((event, ...args) => {
      if (event === 'start-game') {
        const callback = args[args.length - 1]; // Assuming callback is the last argument
        if (typeof callback === 'function') {
          act(() => { // Wrap in act because it will update state (isLoading, potentially onStartGame)
            callback({ success: true }); // Simulate a successful response
          });
        }
      }
      return mockSocket; // Return mockSocket for chaining or other mock behaviors
    });

    // Click the start button
    startButton = screen.getByTestId('start-game-button'); // Re-fetch if necessary
    await act(async () => {
      fireEvent.click(startButton);
    });
    
    // Assert that socket.emit was called for "start-game"
    expect(startGameEmitSpy).toHaveBeenCalledWith(
      'start-game',
      { lobbyCode: mockProps.lobbyCode },
      expect.any(Function) // The callback
    );

    // The mockImplementation above should have called onStartGame
    await waitFor(() => {
      expect(mockProps.onStartGame).toHaveBeenCalled();
    });

    startGameEmitSpy.mockRestore(); // Clean up the spy
  });

  it('calls onExitLobby when exit button is clicked and server responds', async () => {
    sessionStorage.setItem('username', 'testUser');
    render(<GameLobby {...mockProps} />);
    
    // Use the correct test ID that matches the component
    const exitButton = screen.getByTestId('exit-game-button');

    const leaveLobbyEmitSpy = vi.spyOn(mockSocket, 'emit');
    leaveLobbyEmitSpy.mockImplementation((event, ...args) => {
      if (event === 'leave-lobby') {
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
          act(() => {
            callback({ success: true }); // Simulate successful server response
          });
        }
      }
      return mockSocket;
    });

    await act(async () => {
      fireEvent.click(exitButton);
    });

    expect(leaveLobbyEmitSpy).toHaveBeenCalledWith(
      'leave-lobby',
      { lobbyCode: mockProps.lobbyCode, username: 'testUser' },
      expect.any(Function)
    );

    await waitFor(() => {
      expect(mockProps.onExitLobby).toHaveBeenCalled();
    });

    leaveLobbyEmitSpy.mockRestore();
  });

  it('handles player left event', async () => {
    sessionStorage.setItem('username', 'testUser');
    render(<GameLobby {...mockProps} />);
    
    // First add a player
    await act(async () => {
      await triggerSocketEvent('player-joined', { username: 'player1', id: 'player-1', isHost: false });
    });
    
    // Wait for player to appear
    await waitFor(() => {
      expect(screen.getByText('player1')).toBeInTheDocument();
    });
    
    // Now remove the player
    await act(async () => {
      await triggerSocketEvent('player-left', { username: 'player1', id: 'player-1' });
    });

    // Wait for player to be removed from list
    await waitFor(() => {
      expect(screen.queryByText('player1')).not.toBeInTheDocument();
    });
  });

  it('displays error messages', async () => {
    sessionStorage.setItem('username', 'testUser');
    render(<GameLobby {...mockProps} />);

    // Use triggerSocketEvent to properly trigger the error event
    await act(async () => {
      await triggerSocketEvent('error', { message: 'Test error message' });
    });

    // Wait for error message to appear
    await waitFor(() => {
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });
  });

  it('updates player list when receiving player-list event', async () => {
    sessionStorage.setItem('username', 'testUser');
    render(<GameLobby {...mockProps} />);

    // Use triggerSocketEvent with correct player format including IDs and isHost
    await act(async () => {
      await triggerSocketEvent('player-list', { 
        players: [
          { username: 'player1', id: 'player-1', isHost: false }, 
          { username: 'player2', id: 'player-2', isHost: false }, 
          { username: 'player3', id: 'player-3', isHost: false }
        ] 
      });
    });

    // Wait for all players to appear in the list
    await waitFor(() => {
      expect(screen.getByText('player1')).toBeInTheDocument();
      expect(screen.getByText('player2')).toBeInTheDocument();
      expect(screen.getByText('player3')).toBeInTheDocument();
    });
  });

  it('cleans up socket listeners on unmount', async () => {
    sessionStorage.setItem('username', 'testUser');
    const { unmount } = render(<GameLobby {...mockProps} />);
    
    // Wait for socket event registration
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalled();
    });
    
    unmount();
  
    // Verify that off has been called correctly
    expect(mockSocket.off).toHaveBeenCalled();
    
    // Verify the total number of cleanup calls (6 events should be cleaned up)
    expect(mockSocket.off).toHaveBeenCalledTimes(6);
    
    // Since we can't easily check just the first argument with Vitest,
    // we'll verify the specific event names were passed to socket.off using a different method
    expect(vi.mocked(mockSocket.off).mock.calls.some(call => call[0] === 'player-list')).toBe(true);
    expect(vi.mocked(mockSocket.off).mock.calls.some(call => call[0] === 'player-joined')).toBe(true);
    expect(vi.mocked(mockSocket.off).mock.calls.some(call => call[0] === 'player-left')).toBe(true);
    expect(vi.mocked(mockSocket.off).mock.calls.some(call => call[0] === 'error')).toBe(true);
  });

  it('disables start button when there are fewer than 2 players', async () => {
    sessionStorage.setItem('username', 'testUser'); // 'testUser' is the host
    render(<GameLobby {...mockProps} />);

    // Trigger player-list event with only one player
    await act(async () => {
      await triggerSocketEvent('player-list', { 
        players: [
          { username: 'testUser', isHost: true, id: 'host-1' }
        ] 
      });
    });

    // Wait for the start button to be disabled
    await waitFor(() => {
      const startButton = screen.getByTestId('start-game-button');
      expect(startButton).toBeDisabled();
    });
  });

  it('enables start button when there are at least 2 players and user is host', async () => {
    sessionStorage.setItem('username', 'testUser'); // 'testUser' is the host
    render(<GameLobby {...mockProps} />);

    // Trigger player-list event with two players, including the host
    await act(async () => {
      await triggerSocketEvent('player-list', { 
        players: [
          { username: 'testUser', isHost: true, id: 'host-1' },
          { username: 'otherPlayer', isHost: false, id: 'player-2' }
        ] 
      });
    });

    // Wait for the start button to be enabled
    await waitFor(() => {
      const startButton = screen.getByTestId('start-game-button');
      expect(startButton).not.toBeDisabled();
    });
  });

  it('does not render start button when user is not the host', async () => {
    sessionStorage.setItem('username', 'nonHostUser'); // Current user is 'nonHostUser'
    render(<GameLobby {...mockProps} />);

    // Trigger player-list event with two players, but the user is not the host
    await act(async () => {
      await triggerSocketEvent('player-list', { 
        players: [
          { username: 'nonHostUser', isHost: false, id: 'player-1' }, // Current user, not host
          { username: 'hostUser', isHost: true, id: 'host-2' }
        ] 
      });
    });

    // Wait for the start button to not be rendered
    await waitFor(() => {
      expect(screen.queryByTestId('start-game-button')).not.toBeInTheDocument();
    });
  });
  
  it('starts the game when start button is clicked with 5 players in the lobby and server responds successfully', async () => {
    sessionStorage.setItem('username', 'testUser'); // Set 'testUser' as the current user (and host)
    render(<GameLobby {...mockProps} />);
    
    // Add 5 players to the lobby, with the first player being the host
    await act(async () => {
      await triggerSocketEvent('player-list', { 
        players: [
          { username: 'testUser', isHost: true, id: 'host-1' },
          { username: 'player2', isHost: false, id: 'player-2' },
          { username: 'player3', isHost: false, id: 'player-3' },
          { username: 'player4', isHost: false, id: 'player-4' },
          { username: 'player5', isHost: false, id: 'player-5' }
        ] 
      });
    });
    
    // Wait for the start button to be enabled
    let startButton : HTMLButtonElement;
    await waitFor(() => {
      startButton = screen.getByTestId('start-game-button');
      expect(startButton).not.toBeDisabled();
    });
    
    // Spy on socket.emit to control the callback for 'start-game'
    const startGameEmitSpy = vi.spyOn(mockSocket, 'emit');
    startGameEmitSpy.mockImplementation((event, ...args) => {
      if (event === 'start-game') {
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
          act(() => {
            callback({ success: true });
          });
        }
      }
      return mockSocket;
    });

    // Click the start button
    startButton = screen.getByTestId('start-game-button'); // Re-fetch
    await act(async () => {
      fireEvent.click(startButton);
    });
    
    expect(startGameEmitSpy).toHaveBeenCalledWith(
      'start-game',
      { lobbyCode: mockProps.lobbyCode },
      expect.any(Function)
    );

    await waitFor(() => {
      expect(mockProps.onStartGame).toHaveBeenCalled();
    });

    startGameEmitSpy.mockRestore();
  });
});