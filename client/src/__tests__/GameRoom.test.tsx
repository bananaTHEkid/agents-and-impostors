import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameRoom from '../components/GameRoom';
import { mockSocket, triggerSocketEvent } from './setup';
import { SocketProvider } from '../contexts/SocketContext';

describe('GameRoom Component', () => {
  const mockProps = {
    lobbyCode: 'TEST123',
    onExitGame: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithSocket = (component: React.ReactElement) => {
    return render(
      <SocketProvider>
        {component}
      </SocketProvider>
    );
  };

  it('renders game room with lobby code', () => {
    render(<GameRoom {...mockProps} />);
    expect(screen.getByText('Triple Game')).toBeInTheDocument();
  });

  it('handles team assignment', async () => {
    const { debug } = renderWithSocket(<GameRoom {...mockProps} />);

    // Wait for socket event registration and initial state
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('team-assignment', expect.any(Function));
    });

    // Trigger initial game state
    await act(async () => {
      triggerSocketEvent('game-state', { phase: 'waiting' });
      // Wait a tick for state to update
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Trigger the team assignment event
    await act(async () => {
      triggerSocketEvent('team-assignment', { team: 'agent', phase: 'team_assignment' });
      // Wait a tick for state to update
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Debug the current state
    debug();
    console.log('Socket on calls:', mockSocket.on.mock.calls);

    // Wait for the message to appear in game messages
    await waitFor(() => {
      const gameMessages = screen.getByTestId('game-messages');
      const content = gameMessages.textContent;
      console.log('Game messages content:', content);
      expect(gameMessages).toHaveTextContent('Teams have been assigned!');
    }, { timeout: 3000 });
  });

  it('handles voting phase', async () => {
    const { debug } = renderWithSocket(<GameRoom {...mockProps} />);

    // Wait for socket event registration and initial state
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('phase-change', expect.any(Function));
    });

    // Trigger initial game state
    await act(async () => {
      triggerSocketEvent('game-state', { phase: 'waiting' });
      // Wait a tick for state to update
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Trigger the phase change event
    await act(async () => {
      triggerSocketEvent('phase-change', { phase: 'voting', message: 'Voting phase has begun' });
      // Wait a tick for state to update
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Debug the current state
    debug();
    console.log('Socket on calls:', mockSocket.on.mock.calls);

    // Wait for the message to appear in game messages
    await waitFor(() => {
      const gameMessages = screen.getByTestId('game-messages');
      const content = gameMessages.textContent;
      console.log('Game messages content:', content);
      expect(gameMessages).toHaveTextContent('Voting phase has begun');
    }, { timeout: 3000 });
  });

  it('handles operation assignment', async () => {
    render(<GameRoom {...mockProps} />);

    // Wait for socket event registration
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('operation-assigned', expect.any(Function));
    });

    // Mock operation assignment event
    const operationCallback = mockSocket.on.mock.calls.find(
      call => call[0] === 'operation-assigned'
    )?.[1];

    if (operationCallback) {
      await act(async () => {
        operationCallback({ operation: 'secret_agent' });
      });
    }

    await waitFor(() => {
      const gameMessages = screen.getByTestId('game-messages');
      expect(gameMessages).toHaveTextContent('Operation assigned: secret_agent');
    }, { timeout: 2000 });
  });

  it('displays game results', async () => {
    render(<GameRoom {...mockProps} />);

    // Wait for socket event registration
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('game-results', expect.any(Function));
    });

    // Mock game results event
    const resultsCallback = mockSocket.on.mock.calls.find(
      call => call[0] === 'game-results'
    )?.[1];

    if (resultsCallback) {
      await act(async () => {
        resultsCallback({
          results: [
            { username: 'player1', team: 'impostor', win_status: 'won' },
            { username: 'player2', team: 'agent', win_status: 'lost' }
          ]
        });
      });
    }

    await waitFor(() => {
      const gameMessages = screen.getByTestId('game-messages');
      expect(gameMessages).toHaveTextContent('Game has ended. Check results!');
    }, { timeout: 2000 });
  });

  it('handles error messages', async () => {
    render(<GameRoom {...mockProps} />);

    // Wait for socket event registration
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('game-error', expect.any(Function));
    });

    // Mock error event
    const errorCallback = mockSocket.on.mock.calls.find(
      call => call[0] === 'game-error'
    )?.[1];

    if (errorCallback) {
      await act(async () => {
        errorCallback({ message: 'Game error occurred' });
      });
    }

    await waitFor(() => {
      expect(screen.getByText('Game error occurred')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('calls onExitGame when exit button is clicked', async () => {
    render(<GameRoom {...mockProps} />);
    
    const exitButton = screen.getByTestId('exit-game-button');
    await act(async () => {
      fireEvent.click(exitButton);
    });
    
    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('leave-game', {
        lobbyCode: 'TEST123',
        username: 'testUser'
      });
    });

    // Simulate successful leave
    const gameStateCallback = mockSocket.on.mock.calls.find(
      call => call[0] === 'game-state'
    )?.[1];

    if (gameStateCallback) {
      await act(async () => {
        gameStateCallback({ phase: 'waiting' });
      });
    }

    expect(mockProps.onExitGame).toHaveBeenCalled();
  });

  it('cleans up socket listeners on unmount', async () => {
    const { unmount } = render(<GameRoom {...mockProps} />);
    
    // Wait for initial socket setup
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('game-state', expect.any(Function));
    });

    // Trigger all socket events to ensure handlers are registered
    const events = {
      'game-state': { phase: 'team_assignment' },
      'player-list': { players: ['player1', 'player2'] },
      'game-message': { type: 'system', text: 'Test message' },
      'game-error': { message: 'Test error' },
      'game-started': { phase: 'team_assignment', message: 'Game started' },
      'phase-change': { phase: 'team_assignment', message: 'Teams are being assigned' },
      'team-assignment': { team: 'agent' },
      'operation-assigned': { operation: 'secret_agent' },
      'player-voted': { username: 'player1' },
      'vote-submitted': { username: 'player1' },
      'game-results': { results: [] }
    };

    // Trigger each event
    for (const [event, data] of Object.entries(events)) {
      const callback = mockSocket.on.mock.calls.find(call => call[0] === event)?.[1];
      if (callback) {
        await act(async () => {
          callback(data);
        });
      }
    }

    unmount();

    // Verify socket cleanup
    expect(mockSocket.off).toHaveBeenCalledWith('game-state');
    expect(mockSocket.off).toHaveBeenCalledWith('player-list');
    expect(mockSocket.off).toHaveBeenCalledWith('game-message');
    expect(mockSocket.off).toHaveBeenCalledWith('game-error');
    expect(mockSocket.off).toHaveBeenCalledWith('game-started');
    expect(mockSocket.off).toHaveBeenCalledWith('phase-change');
    expect(mockSocket.off).toHaveBeenCalledWith('team-assignment');
    expect(mockSocket.off).toHaveBeenCalledWith('operation-assigned');
    expect(mockSocket.off).toHaveBeenCalledWith('player-voted');
    expect(mockSocket.off).toHaveBeenCalledWith('vote-submitted');
    expect(mockSocket.off).toHaveBeenCalledWith('game-results');
  });
}); 