import React, { createContext} from 'react';
import { Socket } from 'socket.io-client';

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
    // your provider logic remains the same...
    // (no changes are required here)

    return (
        <SocketContext.Provider value={{
            socket: null,
            isConnected: false,
            connect: () => {},
            disconnect: () => {}
        }}>
            {children}
        </SocketContext.Provider>
    );
};