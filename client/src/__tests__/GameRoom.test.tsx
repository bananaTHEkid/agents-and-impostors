import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameRoom from '../components/GameRoom';
import { mockSocket, triggerSocketEvent } from './setup';

describe('GameRoom Component', () => {
  const mockProps = {
    lobbyCode: 'TEST123',
    onExitGame: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders game room with lobby code', () => {
    render(<GameRoom {...mockProps} />);
    expect(screen.getByText('Triple Game')).toBeInTheDocument();
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

    // Wait for the message to appear in game messages
    await waitFor(() => {
      const gameMessages = screen.getByTestId('game-messages');
      expect(gameMessages).toHaveTextContent('Teams have been assigned!');
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

    // Wait for the message to appear in game messages
    await waitFor(() => {
      const gameMessages = screen.getByTestId('game-messages');
      expect(gameMessages).toHaveTextContent('Voting phase has begun');
    });
  });

  it('handles operation assignment', async () => {
    render(<GameRoom {...mockProps} />);

    // Wait for socket event registration
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('operation-assigned', expect.any(Function));
    });

    // Trigger operation assignment event
    await act(async () => {
      await triggerSocketEvent('operation-assigned', { operation: 'secret_agent' });
    });

    await waitFor(() => {
      const gameMessages = screen.getByTestId('game-messages');
      expect(gameMessages).toHaveTextContent('Operation assigned: secret_agent');
    });
  });

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
      const gameMessages = screen.getByTestId('game-messages');
      expect(gameMessages).toHaveTextContent('Game has ended. Check results!');
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
      'game-message': { type: 'system', text: 'Test message' },
      'game-error': { message: 'Test error' },
      'game-started': { phase: 'team_assignment', message: 'Game started' },
      'phase-change': { phase: 'team_assignment', message: 'Teams are being assigned' },
      'team-assignment': { team: 'agent' },
      'operation-assigned': { operation: 'secret_agent' },
      'player-voted': { username: 'player1' },
      'vote-submitted': { username: 'player1' },
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
  
  it('allows submitting votes through the form in voting phase', async () => {
    render(<GameRoom {...mockProps} />);
  
    // Set up the voting phase
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'voting' });
    });
  
    // Wait for the form to appear
    const inputField = await screen.findByPlaceholderText('Enter your vote or message...');
    expect(inputField).toBeInTheDocument();
  
    // Type into the input field
    fireEvent.change(inputField, { target: { value: 'player1' } });
    
    // Submit the form
    const submitButton = screen.getByText('Submit');
    fireEvent.click(submitButton);
  
    // Check the socket emit call was made
    expect(mockSocket.emit).toHaveBeenCalledWith('submit-vote', {
      lobbyCode: 'TEST123',
      username: 'testUser',
      vote: 'player1',
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
    expect(screen.getByText('testUser (You)')).toBeInTheDocument();
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
    expect(badge).toHaveClass('badge');
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
      expect(phaseContent).toHaveTextContent('Waiting for game to start...');
    });
  
    // Test voting phase - move to this first to avoid the team assignment conflict
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'voting' });
    });
    await waitFor(() => {
      const phaseContent = screen.getByTestId('phase-content');
      expect(phaseContent).toHaveTextContent('Voting Phase');
      expect(phaseContent).toHaveTextContent('Vote for a player you suspect is an impostor:');
    });
  
    // Test team assignment phase
    await act(async () => {
      await triggerSocketEvent('game-state', { phase: 'team_assignment' });
    });
    await waitFor(() => {
      const phaseContent = screen.getByTestId('phase-content');
      // Look for text combinations that are unique to this phase
      expect(phaseContent).toHaveTextContent('Team Assignment Phase');
      expect(phaseContent).toHaveTextContent('The game master is assigning teams...');
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
      expect(phaseContent).toHaveTextContent('Game Completed');
      expect(phaseContent).toHaveTextContent('Results:');
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
    await waitFor(() => screen.getByText('Vote for a player you suspect is an impostor:'));
    
    // Get all the action buttons/list items and find the one for player1
    const playerOptions = screen.getAllByRole('button');
    const player1Option = playerOptions.find(option => 
      option.textContent?.trim() === 'player1'
    );
    
    expect(player1Option).toBeTruthy();
    if (player1Option) {
      fireEvent.click(player1Option);
    }
  
    // Check the socket emit call was made
    expect(mockSocket.emit).toHaveBeenCalledWith('submit-vote', {
      lobbyCode: 'TEST123',
      username: 'testUser',
      vote: 'player1',
    });
  });
}); 