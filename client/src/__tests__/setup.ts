import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import React from 'react';

// Create a mock socket instance that can be accessed in tests
const eventHandlers: { [key: string]: Function[] } = {};

export const mockSocket = {
  on: vi.fn((event, callback) => {
    console.log(`Registering handler for event: ${event}`);
    if (!eventHandlers[event]) {
      eventHandlers[event] = [];
    }
    eventHandlers[event].push(callback);
    return callback;
  }),
  off: vi.fn((event) => {
    console.log(`Removing handlers for event: ${event}`);
    eventHandlers[event] = [];
  }),
  emit: vi.fn((event, data) => {
    console.log(`Emitting event: ${event}`, data);
    if (eventHandlers[event]) {
      eventHandlers[event].forEach(handler => handler(data));
    }
    
    if (event === 'get-game-state') {
      eventHandlers['game-state']?.forEach(cb => cb({ phase: 'waiting' }));
    }
  }),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
  id: 'mock-socket-id'
};

// Helper function to trigger socket events in tests
export const triggerSocketEvent = async (event: string, data: any) => {
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

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
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
});

// Mock the socket context
vi.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({
    socket: mockSocket,
    isConnected: true,
  }),
  SocketProvider: ({ children }: { children: React.ReactNode }) => children,
})); 