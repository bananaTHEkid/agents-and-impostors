import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest'; // Import the matchers
import GameRoom from '../../components/GameRoom';
import { mockSocket, triggerSocketEvent } from '../utils/setup';

describe('GameRoom Component', () => {
  const mockProps = {
    lobbyCode: 'TEST123',
    onExitGame: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a fresh, isolated mock for sessionStorage for GameRoom tests
    const gameRoomSessionStorageMock = {
      getItem: vi.fn((key: string): string | null => {
        if (key === 'username') return 'testUser';
        if (key === 'gameData') return null;
        if (key === 'players') return null;
        if (key === 'messages') return null;
        return null; // Default for any other key
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn((): string | null => null), // Mock for key method
    };

    Object.defineProperty(window, 'sessionStorage', {
      value: gameRoomSessionStorageMock,
      writable: true,
      configurable: true, // Allows redefinition by other test suites if necessary
    });
  });

  it('renders game room header', () => {
    render(<GameRoom {...mockProps} />);
    expect(screen.getByText(/Triple Game/i)).toBeInTheDocument();
  });

  it('handles team assignment', async () => {
    render(<GameRoom {...mockProps} />);

    // Wait for socket event registration and initial state
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('team-assignment', expect.any(Function));
    });

    // Trigger initial game state
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'team_assignment' });
    });

    // Trigger the team assignment event
    await act(async () => {
      await triggerSocketEvent('team-assignment', { team: 'agent' });
    });

    // Check that phase indicates team assignment
    await waitFor(() => {
      expect(screen.getByText(/Phase:\s*team_assignment/i)).toBeInTheDocument();
    });
  });

  it('handles voting phase', async () => {
    render(<GameRoom {...mockProps} />);

    // Wait for socket event registration and initial state
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('phase-change', expect.any(Function));
    });

    // Trigger initial game state
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'waiting' });
    });

    // Trigger the phase change event
    await act(async () => {
      await triggerSocketEvent('phase-change', { phase: 'voting', message: 'Voting phase has begun' });
    });

    // Check that phase indicates voting
    await waitFor(() => {
      expect(screen.getByText(/Phase:\s*voting/i)).toBeInTheDocument();
      expect(screen.getByTestId('phase-content')).toHaveTextContent(/stimme/i);
    });
  });

  // Removed: Spielnachrichten logging has been deleted; operation assignment no longer logs to UI

  it('displays game results', async () => {
    render(<GameRoom {...mockProps} />);

    // Wait for socket event registration
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('game-results', expect.any(Function));
    });

    // Trigger game results event
    await act(async () => {
      await triggerSocketEvent('game-results', {
        results: [
          { username: 'player1', team: 'impostor', win_status: 'won' },
          { username: 'player2', team: 'agent', win_status: 'lost' }
        ]
      });
    });

    await waitFor(() => {
      // Phase set to completed and results section renders
      expect(screen.getByText(/Phase:\s*completed/i)).toBeInTheDocument();
      expect(screen.getByText(/ergebnisse/i)).toBeInTheDocument();
    });
  });

  it('handles error messages', async () => {
    render(<GameRoom {...mockProps} />);

    // Wait for socket event registration
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('game-error', expect.any(Function));
    });

    // Trigger error event
    await act(async () => {
      await triggerSocketEvent('game-error', { message: 'Game error occurred' });
    });

    await waitFor(() => {
      expect(screen.getByText('Game error occurred')).toBeInTheDocument();
    });
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

    // Simulate successful leave using triggerSocketEvent
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'waiting' });
    });

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
      'player-list': { 
        players: [
          { username: 'player1', id: 'player-1' }, 
          { username: 'player2', id: 'player-2' }
        ] 
      },
      'game-error': { message: 'Test error' },
      'game-started': { phase: 'team_assignment', message: 'Game started' },
      'phase-change': { phase: 'team_assignment', message: 'Teams are being assigned' },
      'team-assignment': { team: 'agent' },
      'operation-assigned': { operation: 'secret_agent' },
      'game-results': { 
        results: [
          { username: 'player1', team: 'agent', win_status: 'won' },
          { username: 'player2', team: 'impostor', win_status: 'lost' }
        ] 
      }
    };

    // Trigger each event
    for (const [event, data] of Object.entries(events)) {
      await act(async () => {
        await triggerSocketEvent(event, data);
      });
    }

    unmount();

    // Verify socket cleanup
    expect(mockSocket.off).toHaveBeenCalledWith('game-state');
    expect(mockSocket.off).toHaveBeenCalledWith('player-list');
    expect(mockSocket.off).toHaveBeenCalledWith('game-error');
    expect(mockSocket.off).toHaveBeenCalledWith('game-started');
    expect(mockSocket.off).toHaveBeenCalledWith('phase-change');
    expect(mockSocket.off).toHaveBeenCalledWith('team-assignment');
    expect(mockSocket.off).toHaveBeenCalledWith('operation-assigned');
    expect(mockSocket.off).toHaveBeenCalledWith('game-results');
    expect(mockSocket.off).toHaveBeenCalledWith('player-joined');
    expect(mockSocket.off).toHaveBeenCalledWith('join-success');
    expect(mockSocket.off).toHaveBeenCalledWith('error');
  });
  
  it('allows submitting votes by clicking a player in voting phase', async () => {
    render(<GameRoom {...mockProps} />);
  
    // Set up the voting phase
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'voting' });
    });
  
    // Provide players list so a clickable target exists
    await act(async () => {
      await triggerSocketEvent('player-list', { 
        players: [
          { username: 'player1', id: 'player-1' },
          { username: 'testUser', id: 'player-3' }
        ] 
      });
    });

    // Click on a player's button to submit vote immediately
    const user = userEvent.setup();
    const playerBtn = screen.getByRole('button', { name: 'player1' });
    await act(async () => {
      await user.click(playerBtn);
    });
  
    // Check the socket emit call was made
    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('submit-vote', {
        lobbyCode: 'TEST123',
        username: 'testUser',
        vote: 'player1',
      });
    });
  });
  
  it('renders player list and updates when socket event occurs', async () => {
    render(<GameRoom {...mockProps} />);
  
    // Trigger player list update
    await act(async () => {
      await triggerSocketEvent('player-list', { 
        players: [
          { username: 'player1', id: 'player-1', team: 'agent' }, 
          { username: 'player2', id: 'player-2', team: 'impostor' },
          { username: 'testUser', id: 'player-3', team: 'agent' }
        ] 
      });
    });
  
    // Check if players are rendered
    expect(screen.getByText('player1')).toBeInTheDocument();
    expect(screen.getByText('player2')).toBeInTheDocument();
    expect(screen.getByText(/testUser/i)).toBeInTheDocument();
  });
  
  it('renders team badges for current player after team assignment', async () => {
    render(<GameRoom {...mockProps} />);
  
    // First set the phase to team_assignment
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'team_assignment' });
    });
  
    // Then trigger player list with team information during a non-team_assignment phase
    await act(async () => {
      await triggerSocketEvent('phase-change', { phase: 'operation_assignment', message: 'Operations are being assigned' });
      await triggerSocketEvent('player-list', { 
        players: [
          { username: 'player1', id: 'player-1', team: 'agent' }, 
          { username: 'testUser', id: 'player-3', team: 'agent' }
        ] 
      });
    });
  
    // Check if the team badge is shown for the current player
    const badge = screen.getByText('Agent');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/bg-green-100/);
  });
  
  it('renders phase-specific content for different game phases', async () => {
    render(<GameRoom {...mockProps} />);
  
    // Use a separate test for each phase to avoid conflicts
    // Test waiting phase
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'waiting' });
    });
    await waitFor(() => {
      // Check for the specific text inside phase-content
      const phaseContent = screen.getByTestId('phase-content');
      expect(phaseContent).toHaveTextContent(/warte auf spielstart/i);
    });
  
    // Test voting phase - move to this first to avoid the team assignment conflict
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'voting' });
    });
    await waitFor(() => {
      const phaseContent = screen.getByTestId('phase-content');
      expect(phaseContent).toHaveTextContent(/stimme/i);
    });
  
    // Test team assignment phase
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'team_assignment' });
    });
    await waitFor(() => {
      const phaseContent = screen.getByTestId('phase-content');
      // Look for text combinations that are unique to this phase
      expect(phaseContent).toHaveTextContent(/team zuweisung/i);
    });
  
    // Test operation assignment phase
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'operation_assignment' });
    });
    await waitFor(() => {
      const phaseContent = screen.getByTestId('phase-content');
      expect(phaseContent).toBeInTheDocument();
    });

    // Test completed phase with results
    await act(async () => {
      await triggerSocketEvent('game-results', { 
        results: [
          { username: 'player1', team: 'agent', win_status: 'won' },
          { username: 'player2', team: 'impostor', win_status: 'lost' }
        ] 
      });
    });
    await waitFor(() => {
      const phaseContent = screen.getByTestId('phase-content');
      expect(phaseContent).toHaveTextContent(/spiel beendet/i);
      expect(phaseContent).toHaveTextContent(/ergebnisse/i);
    });
    
    // Look for specific result text
    await waitFor(() => {
      expect(screen.getByText(/player1: agent.*won/)).toBeInTheDocument();
    });
  });
  
  it('handles direct player voting clicks', async () => {
    render(<GameRoom {...mockProps} />);
  
    // Set up voting phase and players
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'voting' });
      await triggerSocketEvent('player-list', { 
        players: [
          { username: 'player1', id: 'player-1' }, 
          { username: 'player2', id: 'player-2' }
        ] 
      });
    });
  
    // Find player options in the voting phase UI (within the ListGroup.Item)
    // Using a more specific query to get the ListGroup.Item in the voting phase section
    await waitFor(() => expect(screen.getByText(/Hochstapler/i)).toBeInTheDocument());
    
    // Find the specific player button by its accessible name
    const player1Option = screen.getByRole('button', { name: 'player1' });
    
    expect(player1Option).toBeInTheDocument();
    
    // Use userEvent for better user interaction simulation
    const user = userEvent.setup();
    await act(async () => {
      await user.click(player1Option);
    });
  
    // Check the socket emit call was made
    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('submit-vote', {
        lobbyCode: 'TEST123',
        username: 'testUser',
        vote: 'player1',
      });
    });
  });
}); 