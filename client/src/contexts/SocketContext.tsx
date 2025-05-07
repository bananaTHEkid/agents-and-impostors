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
let reconnectAttempts = 0; // Track reconnection attempts

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!socketInstance) {
      socketInstance = io(API_BASE_URL, {
        transports: ['websocket'],
        upgrade: false,
        forceNew: false,
        reconnection: false, // Disable default reconnection
        timeout: 10000,
        auth: {
          clientId: Date.now().toString(),
        },
      });
    }

    socketRef.current = socketInstance;

    const connectWithBackoff = () => {
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000); // Exponential backoff with max delay of 30 seconds
      setTimeout(() => {
        if (!socketInstance?.connected) {
          console.log(`Reconnecting... Attempt ${reconnectAttempts + 1}`);
          reconnectAttempts++;
          socketInstance?.connect();
        }
      }, delay);
    };

    socketInstance.on('connect', () => {
      console.log('Socket connected with ID:', socketInstance?.id);
      setIsConnected(true);
      reconnectAttempts = 0; // Reset attempts on successful connection
    });

    socketInstance.on('disconnect', (reason: string) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      if (reason !== 'io client disconnect') {
        connectWithBackoff();
      }
    });

    socketInstance.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error);
      connectWithBackoff();
    });

    if (!socketInstance.connected) {
      socketInstance.connect();
    }

    return () => {
      if (socketInstance) {
        socketInstance.off('connect');
        socketInstance.off('disconnect');
        socketInstance.off('connect_error');
      }
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};