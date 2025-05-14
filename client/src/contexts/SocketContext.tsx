import { API_BASE_URL } from '@/config';
import React, { createContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

export const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  connect: () => {},
  disconnect: () => {},
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const initializeSocket = useCallback(() => {
    if (socketRef.current?.connected) return;
    try {
      if (socketRef.current) {
        socketRef.current.close();
      }
      socketRef.current = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        upgrade: true,
        forceNew: false,
        reconnection: true, // Use built-in reconnection
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        timeout: 10000,
        auth: {
          clientId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        },
      });

      socketRef.current.on('connect', () => {
        console.log('Socket connected with ID:', socketRef.current?.id);
        setIsConnected(true);
        setIsConnecting(false);
      });

      socketRef.current.on('disconnect', (reason: string) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
        setIsConnecting(false);
      });

      socketRef.current.on('connect_error', (error: Error) => {
        console.error('Socket connection error:', error);
        setIsConnecting(false);
      });

      socketRef.current.on('reconnect_attempt', (attempt) => {
        console.warn(`Socket reconnect attempt #${attempt}`);
      });

      socketRef.current.on('reconnect_failed', () => {
        console.error('Socket failed to reconnect after maximum attempts');
      });

      socketRef.current.on('error', (error: unknown) => {
        console.error('Socket general error:', error);
      });

      socketRef.current.connect();
    } catch (error) {
      console.error('Socket initialization error:', error);
      setIsConnecting(false);
    }
  }, []);

  useEffect(() => {
    initializeSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [initializeSocket]);

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setIsConnected(false);
    setIsConnecting(false);
  };

  const contextValue = {
    socket: socketRef.current,
    isConnected,
    connect: () => {
      if (!isConnected && !isConnecting) {
        initializeSocket();
      }
    },
    disconnect,
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};