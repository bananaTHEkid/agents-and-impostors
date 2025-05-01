import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import React from 'react';

// Create a mock socket instance that can be accessed in tests
const eventHandlers: { [key: string]: Function[] } = {};

// Create the mock socket object
export const mockSocket: any = {
  on: vi.fn((event: string, callback: Function) => {
    console.log(`Registering handler for event: ${event}`);
    if (!eventHandlers[event]) {
      eventHandlers[event] = [];
    }
    eventHandlers[event].push(callback);
    return callback;
  }),
  off: vi.fn((event: string) => {
    console.log(`Removing handlers for event: ${event}`);
    eventHandlers[event] = [];
  }),
  emit: vi.fn((event: string, data: any, callback?: Function) => {
    console.log(`Emitting event: ${event}`, data);
    if (eventHandlers[event]) {
      eventHandlers[event].forEach(handler => handler(data));
    }
    
    // Handle callback with proper response format
    if (callback && typeof callback === 'function') {
      if (event === 'join-lobby') {
        if (data?.lobbyCode && data?.username) {
          callback({ success: true, lobbyCode: data.lobbyCode });
        } else {
          callback({ success: false, error: 'Invalid data' });
        }
      } else if (event === 'get-game-state') {
        callback({ success: true, phase: 'waiting' });
      } else {
        callback({ success: false, error: 'Unknown event' });
      }
    }
    
    return mockSocket;
  }),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
  id: 'mock-socket-id'
};

// Helper function to trigger socket events in tests
export const triggerSocketEvent = async (event: string, data: any): Promise<void> => {
  console.log(`Triggering event: ${event}`, data);
  const handlers = eventHandlers[event];
  if (!handlers || handlers.length === 0) {
    console.warn(`No handlers found for event: ${event}`);
    return;
  }
  for (const callback of handlers) {
    console.log(`Calling handler for event: ${event}`);
    await callback(data);
  }
};

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  AlertCircle: () => React.createElement('div', { 'data-testid': 'alert-circle-icon' }),
  Info: () => React.createElement('div', { 'data-testid': 'info-icon' }),
  Check: () => React.createElement('div', { 'data-testid': 'check-icon' }),
  X: () => React.createElement('div', { 'data-testid': 'x-icon' }),
  Copy: () => React.createElement('div', { 'data-testid': 'copy-icon' }),
  Users: () => React.createElement('div', { 'data-testid': 'users-icon' }),
  User: () => React.createElement('div', { 'data-testid': 'user-icon' }),
  LogOut: () => React.createElement('div', { 'data-testid': 'logout-icon' }),
  Play: () => React.createElement('div', { 'data-testid': 'play-icon' }),
  Clock: () => React.createElement('div', { 'data-testid': 'clock-icon' }),
  ChevronRight: () => React.createElement('div', { 'data-testid': 'chevron-right-icon' }),
  ChevronDown: () => React.createElement('div', { 'data-testid': 'chevron-down-icon' }),
  MessageSquare: () => React.createElement('div', { 'data-testid': 'message-square-icon' }),
  Send: () => React.createElement('div', { 'data-testid': 'send-icon' }),
  Loader: () => React.createElement('div', { 'data-testid': 'loader-icon' }),
  RefreshCw: () => React.createElement('div', { 'data-testid': 'refresh-cw-icon' }),
  Crown: () => React.createElement('div', { 'data-testid': 'crown-icon' }),
  Award: () => React.createElement('div', { 'data-testid': 'award-icon' }),
  Trophy: () => React.createElement('div', { 'data-testid': 'trophy-icon' }),
  Medal: () => React.createElement('div', { 'data-testid': 'medal-icon' }),
  Star: () => React.createElement('div', { 'data-testid': 'star-icon' }),
  Settings: () => React.createElement('div', { 'data-testid': 'settings-icon' }),
  HelpCircle: () => React.createElement('div', { 'data-testid': 'help-circle-icon' }),
  Menu: () => React.createElement('div', { 'data-testid': 'menu-icon' }),
  ArrowLeft: () => React.createElement('div', { 'data-testid': 'arrow-left-icon' }),
  ArrowRight: () => React.createElement('div', { 'data-testid': 'arrow-right-icon' }),
  Home: () => React.createElement('div', { 'data-testid': 'home-icon' }),
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
});

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  // Clear event handlers
  Object.keys(eventHandlers).forEach(key => {
    eventHandlers[key] = [];
  });
  mockSessionStorage.getItem.mockImplementation((key) => {
    if (key === 'username') return 'testUser';
    return null;
  });
  mockLocalStorage.getItem.mockImplementation((key) => {
    if (key === 'recentGames') return JSON.stringify([]);
    if (key === 'lastUsername') return 'testUser';
    return null;
  });
});

// Mock the socket context
vi.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({
    socket: mockSocket,
    isConnected: true,
  }),
  SocketProvider: ({ children }: { children: React.ReactNode }) => children,
}));