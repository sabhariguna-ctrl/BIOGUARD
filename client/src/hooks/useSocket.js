import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../store/auth.js';

/** Subscribe to realtime events: useSocket({ 'auth:event': fn }) */
export function useSocket(handlers = {}) {
  const token = useAuth((s) => s.token);
  const [connected, setConnected] = useState(false);
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!token) return;
    const s = io(import.meta.env.VITE_API_URL || undefined, { auth: { token }, transports: ['websocket', 'polling'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    Object.keys(ref.current).forEach((evt) => s.on(evt, (p) => ref.current[evt]?.(p)));
    return () => s.disconnect();
  }, [token]);
  return { connected };
}
