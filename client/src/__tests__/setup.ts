import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import React from 'react';

// Interfaces & Typen
interface SocketEventData {
  username?: string;
  lobbyCode?: string;
  [key: string]: string | undefined;
}

type SocketEventCallback = (data: SocketEventData) => void;

type JoinLobbyResponse = { success: boolean; lobbyCode?: string; error?: string };
type GetGameStateResponse = { success: boolean; phase: string };
type GenericResponse = JoinLobbyResponse | GetGameStateResponse;

type EmitCallback = (response: GenericResponse) => void;

// Event-Handler registrieren
const eventHandlers: Record<string, SocketEventCallback[]> = {};

// Ausgelagerte onHandler-Funktion mit Typen
const onHandler = (event: string, callback: SocketEventCallback): SocketEventCallback => {
  if (!eventHandlers[event]) {
    eventHandlers[event] = [];
  }
  eventHandlers[event].push(callback);
  return callback;
};

// Mock-Socket-Objekt
interface MockSocket {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  connected: boolean;
  id: string;
}

export const mockSocket: MockSocket = {
  on: vi.fn((event: string, callback: SocketEventCallback) => onHandler(event, callback)),
  off: vi.fn(),
  emit: vi.fn((event: string, data: SocketEventData, callback?: EmitCallback) => {
    if (eventHandlers[event]) {
      eventHandlers[event].forEach(handler => handler(data));
    }
    if (callback && typeof callback === 'function') {
      callback({ success: true, lobbyCode: data.lobbyCode ?? undefined });
    }
    return mockSocket;
  }),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
  id: 'mock-socket-id',
};

// Hilfsfunktion zum Auslösen von Events in Tests
export const triggerSocketEvent = async (event: string, data: SocketEventData): Promise<void> => {
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

// Mocks für lucide-react Icons
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

// Mock für axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

// Mock für socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock für sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// Mock für localStorage
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

// Vor jedem Test alles zurücksetzen
beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(eventHandlers).forEach(key => {
    eventHandlers[key] = [];
  });
  mockSessionStorage.getItem.mockImplementation((key: string) => {
    if (key === 'username') return 'testUser';
    return null;
  });
  mockLocalStorage.getItem.mockImplementation((key: string) => {
    if (key === 'recentGames') return JSON.stringify([]);
    if (key === 'lastUsername') return 'testUser';
    return null;
  });
});

// Mock SocketContext
vi.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({
    socket: mockSocket,
    isConnected: true,
  }),
  SocketProvider: ({ children }: { children: React.ReactNode }) => children,
}));
