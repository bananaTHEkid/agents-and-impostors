import { API_BASE_URL } from '@/config';
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

// Create a singleton socket instance outside of React's lifecycle
let socketInstance: Socket | null = null;

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Only create a new socket if one doesn't exist
    if (!socketInstance) {
      socketInstance = io(API_BASE_URL, {
        transports: ['websocket'],
        upgrade: false,
        forceNew: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
        auth: {
          clientId: Date.now().toString(),  // Add a unique client identifier
        },
      });
    }

    socketRef.current = socketInstance;

    // Set up event listeners
    socketInstance.on('connect', () => {
      console.log('Socket connected with ID:', socketInstance?.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', (reason: string) => {
      handleDisconnect(reason);
    });

    socketInstance.on('connect_error', (error: Error) => {
      handleSocketError(error);
    });

    // Force connect if not already connected
    if (!socketInstance.connected) {
      socketInstance.connect();
    }

    // Cleanup function
    return () => {
      if (socketInstance) {
        socketInstance.off('connect');
        socketInstance.off('disconnect');
        socketInstance.off('connect_error');
      }
    };
  }, []); // Empty dependency array means this effect runs once on mount

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

// Explicitly typing parameters
function handleSocketError(error: Error) {
  console.error('Socket connection error:', error);
}

function handleDisconnect(reason: string) {
  console.log('Socket disconnected:', reason);
}