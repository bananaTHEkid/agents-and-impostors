import { API_BASE_URL } from '@/config';
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  connect: () => {},
  disconnect: () => {},
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimeouts = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  };

  const disconnect = () => {
    clearTimeouts();
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setIsConnected(false);
    setIsConnecting(false);
    reconnectAttemptsRef.current = 0;
  };

  const connectWithBackoff = () => {
    if (isConnecting || (socketRef.current?.connected)) return;

    setIsConnecting(true);
    const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);

    clearTimeouts();

    reconnectTimeoutRef.current = setTimeout(() => {
      if (socketRef.current && !socketRef.current.connected) {
        console.log(`Reconnecting... Attempt ${reconnectAttemptsRef.current + 1}`);
        reconnectAttemptsRef.current++;
        initializeSocket();
      }
    }, delay);
  };

  const initializeSocket = () => {
    try {
      if (socketRef.current) {
        socketRef.current.close();
      }

      socketRef.current = io(API_BASE_URL, {
        transports: ['websocket'],
        upgrade: false,
        forceNew: true,
        reconnection: false,
        timeout: 10000,
        auth: {
          clientId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        },
      });

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (!isConnected) {
          console.error('Connection timeout');
          disconnect();
          connectWithBackoff();
        }
      }, 10000);

      socketRef.current.on('connect', () => {
        console.log('Socket connected with ID:', socketRef.current?.id);
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
        clearTimeouts();
      });

      socketRef.current.on('disconnect', (reason: string) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
        setIsConnecting(false);
        if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
          connectWithBackoff();
        }
      });

      socketRef.current.on('connect_error', (error: Error) => {
        console.error('Socket connection error:', error);
        setIsConnecting(false);
        connectWithBackoff();
      });

      socketRef.current.connect();
    } catch (error) {
      console.error('Socket initialization error:', error);
      setIsConnecting(false);
      connectWithBackoff();
    }
  };

  useEffect(() => {
    if (!socketRef.current && !isConnecting) {
      initializeSocket();
    }

    return () => {
      disconnect();
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

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