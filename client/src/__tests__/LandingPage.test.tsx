import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest'; // Import the matchers
import LandingPage from '../components/LandingPage';
import axios from 'axios';
import { mockSocket, triggerSocketEvent } from './setup';
import './setup';

// Define types for socket mock implementations

describe('LandingPage', () => {
  const mockOnJoinGame = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    // Mock storage setup
    const storageMock = {
      getItem: vi.fn() as (key: string) => string | null,
      setItem: vi.fn() as (key: string, value: string) => void,
      clear: vi.fn() as () => void,
      removeItem: vi.fn() as (key: string) => void,
      key: vi.fn() as (index: number) => string | null,
      length: 0
    };
    Object.defineProperty(window, 'sessionStorage', { value: storageMock });
    Object.defineProperty(window, 'localStorage', { value: storageMock });

    // Ensure getItem is a mock before using .mockImplementation
    window.localStorage.getItem = vi.fn((key: string) => {
      if (key === 'lastUsername') return null;
      if (key === 'recentGames') return null;
      return null;
    });

    // Ensure mockSocket.emit is a mock before using .mockImplementation
    mockSocket.emit = vi.fn().mockImplementation((
      _event: string,
      data: unknown,
      callback?: (result: unknown) => void
    ) => {
      if (callback) {
        const typedData = data as { lobbyCode: string };
        callback({ success: true, lobbyCode: typedData.lobbyCode });
      }
      return mockSocket;
    });
  });

  it('should create a lobby successfully', async () => {
    // Mock successful lobby creation response
    const axiosPostSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: {
        lobbyId: '123',
        lobbyCode: 'ABC123',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {}
    });

    const user = userEvent.setup();

    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    await act(async () => {
      await user.type(screen.getByLabelText(/username/i), 'testuser');
      await user.click(screen.getByTestId('create-game-button'));
    });

    await waitFor(() => {
      expect(mockOnJoinGame).toHaveBeenCalledWith('ABC123');
    });
    axiosPostSpy.mockRestore();
  });

  it('should show error message when username is empty', async () => {
    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    const user = userEvent.setup();

    await act(async () => {
      // Click create lobby button without entering username
      const createButton = screen.getByRole('button', { name: /create new game/i });
      await user.click(createButton);
    });

    await waitFor(() => {
      // Verify error message
      expect(screen.getByText(/please enter a username/i)).toBeInTheDocument();
    });
  });

  it('should handle API error when creating lobby', async () => {
    // Mock API error
    const axiosPostSpy = vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('Failed to create lobby'));

    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    const user = userEvent.setup();

    // Fill in username
    const usernameInput = screen.getByLabelText(/username/i);
    await act(async () => {
      await user.type(usernameInput, 'TestUser');
    });

    // Click create lobby button
    const createButton = screen.getByRole('button', { name: /create new game/i });
    await act(async () => {
      await user.click(createButton);
    });

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText(/failed to create lobby/i)).toBeInTheDocument();
    });

    // Verify onJoinGame was not called
    expect(mockOnJoinGame).not.toHaveBeenCalled();
    axiosPostSpy.mockRestore();
  });

  it('should join an existing lobby successfully', async () => {
    render(<LandingPage onJoinGame={mockOnJoinGame} />);
    const user = userEvent.setup();

    await act(async () => {
      await user.type(screen.getByLabelText(/username/i), 'testuser');
      await user.type(screen.getByLabelText(/lobby code/i), 'ABC123');
      await user.click(screen.getByTestId('join-game-button'));
    });

    await waitFor(() => {
      expect(mockOnJoinGame).toHaveBeenCalledWith('ABC123');
    });
  });

  it('should handle socket error when joining lobby', async () => {
    mockSocket.emit = vi.fn();
    render(<LandingPage onJoinGame={mockOnJoinGame} />);


    (mockSocket.emit as ReturnType<typeof vi.fn>).mockImplementation((_event, _data, callback) => {
      if (typeof event === 'string' && event === 'join-lobby' && callback) {
        callback({ success: false, error: 'Lobby not found' });
      }
      return mockSocket;
    });

    const user = userEvent.setup();

    // Fill in username and lobby code
    const usernameInput = screen.getByLabelText(/username/i);
    const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
    await act(async () => {
      await user.type(usernameInput, 'TestUser');
      await user.type(lobbyCodeInput, 'ABC123');
    });

    // Click join lobby button
    const joinButton = screen.getByRole('button', { name: /join game/i });
    await act(async () => {
      await user.click(joinButton);
    });

    // Verify socket emit was called with the correct data
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'join-lobby',
      {
        username: 'TestUser',
        lobbyCode: 'ABC123',
      },
      expect.any(Function) // This expect.any(Function) is fine in expectations
    );

    // Simulate error response
    await act(async () => {
      await triggerSocketEvent('error', { message: 'Lobby not found' });
    });

    // Verify error message is displayed
    expect(screen.getByText('Lobby not found')).toBeInTheDocument();

    // Verify loading state is cleared
    expect(joinButton).not.toHaveTextContent('Joining...');

    // Verify onJoinGame was not called
    expect(mockOnJoinGame).not.toHaveBeenCalled();
  });

  it('should disable inputs and buttons while loading', async () => {
    mockSocket.emit = vi.fn();
    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    const user = userEvent.setup();

    // Get form elements
    const usernameInput = screen.getByLabelText(/username/i);
    const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
    const joinButton = screen.getByRole('button', { name: /join game/i });
    const createButton = screen.getByRole('button', { name: /create new game/i });

    // Mock socket emit with a delayed callback to simulate async behavior
    (mockSocket.emit as ReturnType<typeof vi.fn>).mockImplementation((_event, _data, callback) => {
      if (callback) {
        setTimeout(() => {
          callback({ success: true, lobbyCode: 'ABC123' });
        }, 100);
      }
      return mockSocket;
    });

    // Fill in username and lobby code
    await act(async () => {
      await user.type(usernameInput, 'TestUser');
      await user.type(lobbyCodeInput, 'ABC123');
    });

    // Click join button
    await act(async () => {
      await user.click(joinButton);
    });

    // Wait for loading state
    await waitFor(() => {
      expect(screen.getByTestId('join-game-button')).toHaveTextContent('Joining...');
    }, { timeout: 1000, interval: 50 });

    // Verify inputs and buttons are disabled
    expect(usernameInput).toBeDisabled();
    expect(lobbyCodeInput).toBeDisabled();
    expect(screen.getByTestId('join-game-button')).toBeDisabled();
    expect(createButton).toBeDisabled();

    // Wait for the join-success event to complete
    await waitFor(() => {
      expect(mockOnJoinGame).toHaveBeenCalledWith('ABC123');
    });
  });

  it('should clear error message when starting new action', async () => {
    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    const user = userEvent.setup();

    // Click join button without filling anything
    const joinButton = screen.getByTestId('join-game-button');
    await act(async () => {
      await user.click(joinButton);
    });

    // Verify error message appears
    expect(screen.getByText(/please fill in all fields/i)).toBeInTheDocument();

    // Fill in username
    const usernameInput = screen.getByLabelText(/username/i);
    await act(async () => {
      await user.type(usernameInput, 'TestUser');
    });

    // Error message should be cleared
    expect(screen.queryByText(/please fill in all fields/i)).not.toBeInTheDocument();
  });

  it('should cleanup socket connection on unmount', async () => {
    const { unmount } = render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Unmount component
    unmount();

    // Verify socket cleanup
expect(mockSocket.off).toHaveBeenCalledWith('join-success', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should handle special characters in username and lobby code', async () => {
    mockSocket.emit = vi.fn();
    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    const user = userEvent.setup();

    // Fill in username and lobby code with special characters
    const usernameInput = screen.getByLabelText(/username/i);
    const lobbyCodeInput = screen.getByLabelText(/lobby code/i);

    await act(async () => {
      await user.type(usernameInput, 'Test@User#123');
      await user.type(lobbyCodeInput, 'ABC123');
    });

    // Click join button using data-testid
    const joinButton = screen.getByTestId('join-game-button');
    await act(async () => {
      await user.click(joinButton);
    });

    // Verify socket emit was called with the correct data
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'join-lobby',
      {
        username: 'Test@User#123',
        lobbyCode: 'ABC123',
      },
      expect.any(Function)
    );

    // Explicitly trigger the join-success event to simulate server response
    await act(async () => {
      await triggerSocketEvent('join-success', { lobbyCode: 'ABC123' });
    });

    // Verify session storage was updated with the special character username
    expect(sessionStorage.setItem).toHaveBeenCalledWith('username', 'Test@User#123');
    expect(sessionStorage.setItem).toHaveBeenCalledWith('lobbyCode', 'ABC123');
    expect(sessionStorage.setItem).toHaveBeenCalledWith('isHost', 'false');

    // Verify onJoinGame was called
    expect(mockOnJoinGame).toHaveBeenCalledWith('ABC123');
  });

  describe('Joining an existing lobby', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      sessionStorage.clear();
    });

    it('should join successfully with valid lobby code', async () => {
      mockSocket.emit = vi.fn();
      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      const user = userEvent.setup();

      // Fill in username and lobby code
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await act(async () => {
        await user.clear(usernameInput);
        await user.clear(lobbyCodeInput);
        await user.type(usernameInput, 'TestUser');
        await user.type(lobbyCodeInput, 'ABC123');
      });

      // Setup mock emit specific for this test
      (mockSocket.emit as ReturnType<typeof vi.fn>).mockImplementation((_event, _data, callback) => {
        if (callback) {
          callback({ success: true, lobbyCode: 'ABC123' });
        }
        return mockSocket;
      });

      // Click join button
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await act(async () => {
        await user.click(joinButton);
      });

      // Verify socket emit was called
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'join-lobby',
        {
          username: 'TestUser',
          lobbyCode: 'ABC123'
        },
        expect.any(Function) // This expect.any(Function) is fine in expectations
      );

      // Verify successful join
      expect(mockOnJoinGame).toHaveBeenCalledWith('ABC123');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('lobbyCode', 'ABC123');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('username', 'TestUser');
    });

    it('should handle network error when joining lobby', async () => {
      mockSocket.emit = vi.fn();
      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      const user = userEvent.setup();

      // Fill in username and lobby code
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await act(async () => {
        await user.clear(usernameInput);
        await user.type(usernameInput, 'TestUser');
        await user.type(lobbyCodeInput, 'ABC123');
      });

      // Setup mock emit to simulate network error

      (mockSocket.emit as ReturnType<typeof vi.fn>).mockImplementation((_event, _data, callback) => {
        if (callback) {
          callback({ success: false, error: 'Failed to connect to server' });
        }
        return mockSocket;
      });

      // Click join button
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await act(async () => {
        await user.click(joinButton);
      });

      // Verify error message is displayed
      await waitFor(() => {
        expect(screen.getByText('Failed to connect to server')).toBeInTheDocument();
      });

      // Verify onJoinGame was not called
      expect(mockOnJoinGame).not.toHaveBeenCalled();
    });

    it('should handle non-existent lobby code', async () => {
      mockSocket.emit = vi.fn();
      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      const user = userEvent.setup();

      // Fill in username and lobby code
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await act(async () => {
        await user.clear(usernameInput);
        await user.type(usernameInput, 'TestUser');
        await user.type(lobbyCodeInput, 'ZZZ999');
      });

      // Setup mock emit specific for this test

      (mockSocket.emit as ReturnType<typeof vi.fn>).mockImplementation((_event, _data, callback) => {
        if (callback) {
          callback({ success: false, error: 'Lobby does not exist' });
        }
        return mockSocket;
      });

      // Click join button
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await act(async () => {
        await user.click(joinButton);
      });

      // Verify error message is displayed
      await waitFor(() => {
        expect(screen.getByText('Lobby does not exist')).toBeInTheDocument();
      });

      // Verify onJoinGame was not called
      expect(mockOnJoinGame).not.toHaveBeenCalled();
    });

    it('should handle lobby already started', async () => {
      mockSocket.emit = vi.fn();
      const user = userEvent.setup();
      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      // Fill in username and lobby code
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await act(async () => {
        await user.clear(usernameInput);
        await user.clear(lobbyCodeInput);
        await user.type(usernameInput, 'TestUser');
        await user.type(lobbyCodeInput, 'START1');
      });

      // Setup mock emit specific for this test
      (mockSocket.emit as ReturnType<typeof vi.fn>).mockImplementationOnce((_event, _data, callback) => {
        if (callback) {
          callback({ success: false, error: 'Game has already started' });
        }
        return mockSocket;
      });

      // Click join button
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await act(async () => {
        await user.click(joinButton);
      });

      // Wait for error message to be displayed
      await waitFor(() => {
        expect(screen.getByText('Game has already started')).toBeInTheDocument();
      });

      // Verify socket emit was called with correct data
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'join-lobby',
        {
          username: 'TestUser',
          lobbyCode: 'START1'
        },
        expect.any(Function) // This expect.any(Function) is fine in expectations
      );

      // Verify onJoinGame was not called
      expect(mockOnJoinGame).not.toHaveBeenCalled();
    });

    it('should handle lobby being full', async () => {
      mockSocket.emit = vi.fn();
      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      const user = userEvent.setup();

      // Fill in username and lobby code
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await act(async () => {
        await user.type(usernameInput, 'TestUser');
        await user.type(lobbyCodeInput, 'FULL456');
      });

      // Simulate error response (Assuming this test specifically triggers an error event,
      // not a callback from an emit) - the original code uses triggerSocketEvent which is correct here.
      await act(async () => {
        await triggerSocketEvent('error', { message: 'Lobby is full' });
      });

      // Verify error message is displayed
      expect(screen.getByText('Lobby is full')).toBeInTheDocument();
    });

    it('should handle network error when joining lobby (duplicate)', async () => {
      mockSocket.emit = vi.fn();
      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      const user = userEvent.setup();

      // Fill in username and lobby code
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await act(async () => {
        await user.type(usernameInput, 'TestUser');
        await user.type(lobbyCodeInput, 'ABC123');
      });

      // Mock socket emit to simulate network error

      (mockSocket.emit as ReturnType<typeof vi.fn>).mockImplementation((_event, _data, callback) => {
        if (callback) {
          callback({ success: false, error: 'Failed to connect to server' });
        }
        return mockSocket;
      });

      // Click join button
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await act(async () => {
        await user.click(joinButton);
      });

      // Verify error message is displayed
      await waitFor(() => {
        expect(screen.getByText(/failed to connect/i)).toBeInTheDocument();
      });

      // Verify button is no longer in loading state
      expect(joinButton).not.toHaveTextContent('Joining...');

      // Verify onJoinGame was not called
      expect(mockOnJoinGame).not.toHaveBeenCalled();
    });

    it('should handle invalid lobby code format', async () => {
      render(<LandingPage onJoinGame={mockOnJoinGame} />);

      const user = userEvent.setup();

      // Fill in username and invalid lobby code
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);
      await act(async () => {
        await user.type(usernameInput, 'TestUser');
        await user.type(lobbyCodeInput, 'A1'); // Too short
      });

      // Click join button
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await act(async () => {
        await user.click(joinButton);
      });

      // Verify error message is displayed
      expect(screen.getByText('Invalid lobby code format')).toBeInTheDocument();

      // Verify socket emit was not called since validation failed
      expect(mockSocket.emit).not.toHaveBeenCalled();

      // Verify onJoinGame was not called
      expect(mockOnJoinGame).not.toHaveBeenCalled();
    });

    it('should handle special characters in username', async () => {
      // Clear any previous mocks
      // vi.clearAllMocks(); // Already handled by the inner beforeEach

      // Setup mockSocket.emit for this specific test, as inner beforeEach clears it.
      // This implementation ensures the callback is called for 'join-lobby'.
      mockSocket.emit = vi.fn().mockImplementation((
        event: string,
        data: unknown,
        callback?: (result: { success: boolean; lobbyCode?: string; error?: string }) => void
      ) => {
        if (event === 'join-lobby' && callback) {
          const typedData = data as { lobbyCode: string };
          callback({ success: true, lobbyCode: typedData.lobbyCode });
        }
        return mockSocket;
      });
      const { unmount } = render(<LandingPage onJoinGame={mockOnJoinGame} />); // Single render

      const user = userEvent.setup();

      // Fill in username with special characters and lobby code
      const usernameInput = screen.getByLabelText(/username/i);
      const lobbyCodeInput = screen.getByLabelText(/lobby code/i);

      // Clear the inputs first to ensure no residual values
      await act(async () => {
        await user.clear(usernameInput);
        await user.clear(lobbyCodeInput);
      });

      await act(async () => {
        await user.type(usernameInput, 'Test@User#123');
        await user.type(lobbyCodeInput, 'ABC123');
      });

      // Click join button
      const joinButton = screen.getByRole('button', { name: /join game/i });
      await act(async () => {
        await user.click(joinButton);
      });

      // Verify socket emit was called with the special character username
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'join-lobby',
        expect.objectContaining({
          username: 'Test@User#123',
          lobbyCode: 'ABC123',
        }),
        expect.any(Function) // This expect.any(Function) is fine in expectations
      );

      // Simulate successful join (assuming this is triggered separately from the emit mock)
      await act(async () => {
        await triggerSocketEvent('join-success', { lobbyCode: 'ABC123' });
      });

      // Verify session storage was updated with the special character username
      expect(sessionStorage.setItem).toHaveBeenCalledWith('username', 'Test@User#123');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('lobbyCode', 'ABC123');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('isHost', 'false');

      // Verify onJoinGame was called
      expect(mockOnJoinGame).toHaveBeenCalledWith('ABC123');
      unmount();
    });
  });

  it('should display recent games', async () => {
    // Clear any previous mocks
    vi.clearAllMocks();

    // Mock localStorage to return recent games
    const mockRecentGames = [
      { code: 'RECENT123', timestamp: Date.now() }
    ];
    window.localStorage.getItem = vi.fn((key: string) => {
      if (key === 'recentGames') return JSON.stringify(mockRecentGames);
      if (key === 'lastUsername') return 'PreviousUser';
      return null;
    });

    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Verify that the recent games section is displayed
    expect(screen.getByText('Recent Games')).toBeInTheDocument();

    // Verify that the rejoin button is displayed with exact text
    const rejoinButton = screen.getByRole('button', { name: /quick access to lobby RECENT123/i });
    expect(rejoinButton).toBeInTheDocument();

    // Verify the lobby code is displayed
    expect(screen.getByText('RECENT123')).toBeInTheDocument();
  });

  it('should handle setting username from localStorage', async () => {
    // Clear any previous mocks
    vi.clearAllMocks();

    // Mock localStorage to return a username
    window.localStorage.getItem = vi.fn((key: string) => {
      if (key === 'lastUsername') return 'SavedUsername';
      return null;
    });

    render(<LandingPage onJoinGame={mockOnJoinGame} />);

    // Verify that the username input has the value from localStorage
    const usernameInput = screen.getByLabelText(/username/i) as HTMLInputElement;
    expect(usernameInput.value).toBe('SavedUsername');
  });
});