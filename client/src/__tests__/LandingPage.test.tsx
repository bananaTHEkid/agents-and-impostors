import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LandingPage from '../components/LandingPage';
import axios from 'axios';
import { mockSocket } from './setup';
import './setup';

describe('LandingPage', () => {
  const mockOnJoinGame = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('should create a lobby successfully', async () => {
    // Mock successful lobby creation response
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        lobbyId: '123',
        lobbyCode: 'ABC123',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });

    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Fill in username
    const usernameInput = screen.getByLabelText(/username/i);
    await userEvent.type(usernameInput, 'TestUser');

    // Click create lobby button
    const createButton = screen.getByRole('button', { name: /create new game/i });
    await userEvent.click(createButton);

    // Verify loading state
    expect(createButton).toHaveTextContent('Creating...');

    // Wait for the API call to complete
    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:5000/api/lobbies/create'
      );
    });

    // Verify session storage was updated
    expect(sessionStorage.setItem).toHaveBeenCalledWith('lobbyCode', 'ABC123');
    expect(sessionStorage.setItem).toHaveBeenCalledWith('username', 'TestUser');
    expect(sessionStorage.setItem).toHaveBeenCalledWith('isHost', 'true');

    // Verify socket emit was called
    expect(mockSocket.emit).toHaveBeenCalledWith('join-lobby', {
      username: 'TestUser',
      lobbyCode: 'ABC123',
    });
  });

  it('should show error message when username is empty', async () => {
    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Click create lobby button without entering username
    const createButton = screen.getByRole('button', { name: /create new game/i });
    await userEvent.click(createButton);

    // Verify error message
    expect(screen.getByText(/please enter a username/i)).toBeInTheDocument();
  });

  it('should handle API error when creating lobby', async () => {
    // Mock API error
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('Failed to create lobby'));

    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Fill in username
    const usernameInput = screen.getByLabelText(/username/i);
    await userEvent.type(usernameInput, 'TestUser');

    // Click create lobby button
    const createButton = screen.getByRole('button', { name: /create new game/i });
    await userEvent.click(createButton);

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText(/failed to create lobby/i)).toBeInTheDocument();
    });

    // Verify onJoinGame was not called
    expect(mockOnJoinGame).not.toHaveBeenCalled();
  });

  it('should join an existing lobby successfully', async () => {
    // Set up socket event handler before rendering
    let joinSuccessCallback: ((data: { lobbyCode: string }) => void) | undefined;
    mockSocket.on.mockImplementation((event: string, callback: any) => {
      if (event === 'join-success') {
        joinSuccessCallback = callback;
      }
    });

    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Fill in username and lobby code
    const usernameInput = screen.getByLabelText(/username/i);
    const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
    await userEvent.type(usernameInput, 'TestUser');
    await userEvent.type(lobbyCodeInput, 'ABC123');

    // Click join lobby button
    const joinButton = screen.getByRole('button', { name: /join game/i });
    await userEvent.click(joinButton);

    // Verify socket emit was called
    expect(mockSocket.emit).toHaveBeenCalledWith('join-lobby', {
      username: 'TestUser',
      lobbyCode: 'ABC123',
    });

    // Simulate successful join using the captured callback
    await act(async () => {
      if (joinSuccessCallback) {
        joinSuccessCallback({ lobbyCode: 'ABC123' });
      }
    });

    // Wait for all state updates to complete
    await waitFor(() => {
      // Verify session storage was updated in the correct order
      expect(sessionStorage.setItem).toHaveBeenCalledWith('lobbyCode', 'ABC123');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('username', 'TestUser');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('isHost', 'false');
    });

    // Verify onJoinGame was called with the lobby code
    expect(mockOnJoinGame).toHaveBeenCalledWith('ABC123');
  });

  it('should handle socket error when joining lobby', async () => {
    // Set up socket event handler before rendering
    let errorCallback: ((data: { message: string }) => void) | undefined;
    mockSocket.on.mockImplementation((event: string, callback: any) => {
      if (event === 'error') {
        errorCallback = callback;
      }
    });

    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Fill in username and lobby code
    const usernameInput = screen.getByLabelText(/username/i);
    const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
    await userEvent.type(usernameInput, 'TestUser');
    await userEvent.type(lobbyCodeInput, 'ABC123');

    // Click join lobby button
    const joinButton = screen.getByRole('button', { name: /join game/i });
    await userEvent.click(joinButton);

    // Verify socket emit was called
    expect(mockSocket.emit).toHaveBeenCalledWith('join-lobby', {
      username: 'TestUser',
      lobbyCode: 'ABC123',
    });

    // Simulate error response
    await act(async () => {
      if (errorCallback) {
        errorCallback({ message: 'Lobby not found' });
      }
    });

    // Verify error message is displayed
    expect(screen.getByText('Lobby not found')).toBeInTheDocument();
    
    // Verify loading state is cleared
    expect(joinButton).not.toHaveTextContent('Joining...');
    
    // Verify onJoinGame was not called
    expect(mockOnJoinGame).not.toHaveBeenCalled();
  });

  it('should disable inputs and buttons while loading', async () => {
    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Get form elements
    const usernameInput = screen.getByLabelText(/username/i);
    const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
    const joinButton = screen.getByRole('button', { name: /join game/i });
    const createButton = screen.getByRole('button', { name: /create new game/i });

    // Fill in username and lobby code
    await userEvent.type(usernameInput, 'TestUser');
    await userEvent.type(lobbyCodeInput, 'ABC123');

    // Click join lobby button
    await userEvent.click(joinButton);

    // Verify all inputs and buttons are disabled during loading
    expect(usernameInput).toBeDisabled();
    expect(lobbyCodeInput).toBeDisabled();
    expect(joinButton).toBeDisabled();
    expect(createButton).toBeDisabled();

    // Verify loading text is shown
    expect(joinButton).toHaveTextContent('Joining...');
  });

  it('should handle missing lobby code when joining', async () => {
    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Fill in only username
    const usernameInput = screen.getByLabelText(/username/i);
    await userEvent.type(usernameInput, 'TestUser');

    // Click join lobby button
    const joinButton = screen.getByRole('button', { name: /join game/i });
    await userEvent.click(joinButton);

    // Verify error message
    expect(screen.getByText(/please fill in all fields/i)).toBeInTheDocument();
    
    // Verify socket emit was not called
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('should clear error message when starting new action', async () => {
    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Click create lobby button without username to trigger error
    const createButton = screen.getByRole('button', { name: /create new game/i });
    await userEvent.click(createButton);

    // Verify error message is shown
    expect(screen.getByText(/please enter a username/i)).toBeInTheDocument();

    // Fill in username
    const usernameInput = screen.getByLabelText(/username/i);
    await userEvent.type(usernameInput, 'TestUser');

    // Click create lobby button again
    await userEvent.click(createButton);

    // Verify error message is cleared
    expect(screen.queryByText(/please enter a username/i)).not.toBeInTheDocument();
  });

  it('should cleanup socket connection on unmount', async () => {
    const { unmount } = render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Unmount the component
    unmount();

    // Verify socket cleanup
    expect(mockSocket.off).toHaveBeenCalledWith('join-success');
    expect(mockSocket.off).toHaveBeenCalledWith('error');
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('should handle special characters in username and lobby code', async () => {
    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Fill in username and lobby code with special characters
    const usernameInput = screen.getByLabelText(/username/i);
    const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
    await userEvent.type(usernameInput, 'Test@User#123');
    await userEvent.type(lobbyCodeInput, '!ABC-123');

    // Click join lobby button
    const joinButton = screen.getByRole('button', { name: /join game/i });
    await userEvent.click(joinButton);

    // Verify socket emit was called with the exact input values
    expect(mockSocket.emit).toHaveBeenCalledWith('join-lobby', {
      username: 'Test@User#123',
      lobbyCode: '!ABC-123',
    });
  });

  describe('Joining an existing lobby', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      sessionStorage.clear();
    });

    it('should join successfully with valid lobby code', async () => {
      // Set up socket event handler
      let joinSuccessCallback: ((data: { lobbyCode: string }) => void) | undefined;
      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'join-success') {
          joinSuccessCallback = callback;
        }
      });

      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      // Fill in username and lobby code
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await userEvent.type(usernameInput, 'TestUser');
      await userEvent.type(lobbyCodeInput, 'ABC123');

      // Click join lobby button
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await userEvent.click(joinButton);

      // Verify initial state
      expect(joinButton).toHaveTextContent('Joining...');
      expect(joinButton).toBeDisabled();

      // Verify socket emit
      expect(mockSocket.emit).toHaveBeenCalledWith('join-lobby', {
        username: 'TestUser',
        lobbyCode: 'ABC123',
      });

      // Simulate successful join
      await act(async () => {
        if (joinSuccessCallback) {
          joinSuccessCallback({ lobbyCode: 'ABC123' });
        }
      });

      // Verify final state
      expect(sessionStorage.setItem).toHaveBeenCalledWith('lobbyCode', 'ABC123');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('username', 'TestUser');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('isHost', 'false');
      expect(mockOnJoinGame).toHaveBeenCalledWith('ABC123');
    });

    it('should handle non-existent lobby code', async () => {
      // Set up socket error handler
      let errorCallback: ((data: { message: string }) => void) | undefined;
      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          errorCallback = callback;
        }
      });

      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      // Fill in details
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await userEvent.type(usernameInput, 'TestUser');
      await userEvent.type(lobbyCodeInput, 'INVALID');

      // Try to join
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await userEvent.click(joinButton);

      // Simulate error response
      await act(async () => {
        if (errorCallback) {
          errorCallback({ message: 'Lobby not found' });
        }
      });

      // Verify error handling
      expect(screen.getByText('Lobby not found')).toBeInTheDocument();
      expect(joinButton).not.toBeDisabled();
      expect(joinButton).toHaveTextContent('Join Game');
      expect(mockOnJoinGame).not.toHaveBeenCalled();
    });

    it('should handle lobby that is already full', async () => {
      // Set up socket error handler
      let errorCallback: ((data: { message: string }) => void) | undefined;
      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          errorCallback = callback;
        }
      });

      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      // Fill in details
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await userEvent.type(usernameInput, 'TestUser');
      await userEvent.type(lobbyCodeInput, 'FULL');

      // Try to join
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await userEvent.click(joinButton);

      // Simulate error response
      await act(async () => {
        if (errorCallback) {
          errorCallback({ message: 'Lobby is full' });
        }
      });

      // Verify error handling
      expect(screen.getByText('Lobby is full')).toBeInTheDocument();
      expect(joinButton).not.toBeDisabled();
      expect(mockOnJoinGame).not.toHaveBeenCalled();
    });

    it('should handle duplicate username in lobby', async () => {
      // Set up socket error handler
      let errorCallback: ((data: { message: string }) => void) | undefined;
      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          errorCallback = callback;
        }
      });

      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      // Fill in details with duplicate username
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await userEvent.type(usernameInput, 'ExistingUser');
      await userEvent.type(lobbyCodeInput, 'ABC123');

      // Try to join
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await userEvent.click(joinButton);

      // Simulate error response
      await act(async () => {
        if (errorCallback) {
          errorCallback({ message: 'Username already taken in this lobby' });
        }
      });

      // Verify error handling
      expect(screen.getByText('Username already taken in this lobby')).toBeInTheDocument();
      expect(joinButton).not.toBeDisabled();
      expect(mockOnJoinGame).not.toHaveBeenCalled();
    });

    it('should handle network disconnection while joining', async () => {
      // Set up socket error handler
      let errorCallback: ((data: { message: string }) => void) | undefined;
      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          errorCallback = callback;
        }
      });

      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      // Fill in details
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await userEvent.type(usernameInput, 'TestUser');
      await userEvent.type(lobbyCodeInput, 'ABC123');

      // Try to join
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await userEvent.click(joinButton);

      // Simulate network error
      await act(async () => {
        if (errorCallback) {
          errorCallback({ message: 'Connection lost' });
        }
      });

      // Verify error handling
      expect(screen.getByText('Connection lost')).toBeInTheDocument();
      expect(joinButton).not.toBeDisabled();
      expect(mockOnJoinGame).not.toHaveBeenCalled();
    });

    it('should trim whitespace from username and lobby code', async () => {
      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      // Fill in details with extra whitespace
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await userEvent.type(usernameInput, '  TestUser  ');
      await userEvent.type(lobbyCodeInput, '  ABC123  ');

      // Try to join
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await userEvent.click(joinButton);

      // Verify socket emit was called with trimmed values
      expect(mockSocket.emit).toHaveBeenCalledWith('join-lobby', {
        username: 'TestUser',
        lobbyCode: 'ABC123',
      });
    });
  });
}); 