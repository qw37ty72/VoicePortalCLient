import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const API = import.meta.env.VITE_API_URL || localStorage.getItem('vp_api_url') || 'http://localhost:3001';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const s = io(API.replace(/^http/, 'ws'), {
      auth: { userId: user.id },
      transports: ['websocket', 'polling'],
    });
    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user?.id]);

  const value = { socket, connected };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside SocketProvider');
  return ctx;
}
