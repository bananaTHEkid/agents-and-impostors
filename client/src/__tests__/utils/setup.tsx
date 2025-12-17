import React from 'react';
import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest'; // Extends Vitest's expect with jest-dom matchers

// Store for event handlers registered via mockSocket.on
const eventHandlers: Record<string, Array<(data: unknown) => void>> = {};

// Exported mockSocket instance for tests to import and control
export const mockSocket: {
  emit: (event: string, data?: unknown, callback?: (response: { success: boolean; [key: string]: unknown }) => void) => typeof mockSocket;
  on: (eventName: string, callback: (data: unknown) => void) => void;
  off: (eventName: string, callback?: (data: unknown) => void) => void;
  connect: () => void;
  disconnect: () => void;
  id: string;
} = {
  // Default emit behavior: can be overridden in tests.
  // Simulates a successful callback by default if one is provided.
  emit: vi.fn((_event: string, data?: unknown, callback?: (response: { success: boolean; [key: string]: unknown }) => void): typeof mockSocket => {
    if (typeof callback === 'function') {
      // Simulate a generic success response, tests can override this mock for specific scenarios
      callback({ success: true, ...(typeof data === 'object' && data !== null ? data : {}) });
    }
    return mockSocket; // Allow chaining if the actual client supports it
  }),
  on: vi.fn((eventName: string, callback: (data: unknown) => void) => {
    if (!eventHandlers[eventName]) {
      eventHandlers[eventName] = [];
    }
    eventHandlers[eventName].push(callback);
  }),
  off: vi.fn((eventName: string, callback?: (data: unknown) => void) => {
    if (eventHandlers[eventName]) {
      if (callback) {
        eventHandlers[eventName] = eventHandlers[eventName].filter(cb => cb !== callback);
      } else {
        // If no specific callback is provided, remove all listeners for the event
        delete eventHandlers[eventName];
      }
    }
  }),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
  id: 'mock-socket-id-from-setup',
};

// Helper to simulate an event coming from the socket
export const triggerSocketEvent = (eventName: string, data: unknown) => {
  if (eventHandlers[eventName]) {
    eventHandlers[eventName].forEach(callback => {
      // Wrap in act if the callback might cause state updates,
      // though individual tests using this might also use act.
      // For simplicity here, direct call. Tests should use `act` if needed.
      callback(data);
    });
  }
};

// Helper to reset the mock socket state between tests
export const resetMockSocket = () => {
  // Clear registered handlers
  for (const key of Object.keys(eventHandlers)) {
    delete eventHandlers[key];
  }

  // Restore default mocked implementations
  mockSocket.emit = vi.fn((_event: string, data?: unknown, callback?: (response: { success: boolean; [key: string]: unknown }) => void): typeof mockSocket => {
    if (typeof callback === 'function') {
      callback({ success: true, ...(typeof data === 'object' && data !== null ? data : {}) });
    }
    return mockSocket;
  });
  mockSocket.on = vi.fn((eventName: string, callback: (data: unknown) => void) => {
    if (!eventHandlers[eventName]) eventHandlers[eventName] = [];
    eventHandlers[eventName].push(callback);
  });
  mockSocket.off = vi.fn((eventName: string, callback?: (data: unknown) => void) => {
    if (eventHandlers[eventName]) {
      if (callback) {
        eventHandlers[eventName] = eventHandlers[eventName].filter(cb => cb !== callback);
      } else {
        delete eventHandlers[eventName];
      }
    }
  });
  mockSocket.connect = vi.fn();
  mockSocket.disconnect = vi.fn();
};

// Default value for the mocked SocketContext
export const mockSocketContextDefaultValue = {
  socket: mockSocket, // Crucially, use the exported mockSocket instance
  isConnected: true, // Default to connected for tests
  username: 'TestUserFromContext',
  setUsername: vi.fn(),
  lobbyCode: 'CTXTLOBBY',
  setLobbyCode: vi.fn(),
  players: [{ username: 'TestUserFromContext' }, { username: 'OtherPlayerCtx' }],
  setPlayers: vi.fn(),
  messages: [],
  setMessages: vi.fn(),
  gameState: { phase: 'waiting' }, // Adjust as per your actual gameState structure
  setGameState: vi.fn(),
  error: null,
  setError: vi.fn(),
  connect: vi.fn(() => {
    mockSocket.connect();
    mockSocket.connected = true;
  }),
  disconnect: vi.fn(() => {
    mockSocket.disconnect();
    mockSocket.connected = false;
  }),
  // If your actual context exposes emit, on, off directly (not just via socket.emit),
  // you can add them here:
  // emit: mockSocket.emit,
  // on: mockSocket.on,
  // off: mockSocket.off,
};

// Create the mock React Context object
const MockReactSocketContext = React.createContext(mockSocketContextDefaultValue);

// Mock the entire SocketContext module
vi.mock('@/contexts/SocketContext', () => ({
  SocketContext: MockReactSocketContext,
  SocketProvider: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value?: Partial<typeof mockSocketContextDefaultValue>; // Allow overriding context value in tests
  }) => (
    <MockReactSocketContext.Provider value={{ ...mockSocketContextDefaultValue, ...(value || {}) }}>
      {children}
    </MockReactSocketContext.Provider>
  ),
  useSocket: () => React.useContext(MockReactSocketContext),
}));

// Mock react-router-dom
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object), // Preserve other exports, ensure actual is treated as object
    useNavigate: () => vi.fn(),
    useParams: () => ({ lobbyCode: 'mockLobby123' }), // Example mock, adjust as needed
    Link: ({
      children,
      to,
      ...rest
    }: { children: React.ReactNode; to: string } & Partial<Omit<React.ComponentPropsWithoutRef<'a'>, 'href' | 'children'>>) => (
      <a href={to} {...rest}>{children}</a> // Basic mock for Link
    ),
  };
});