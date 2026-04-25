import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { WS_EVENTS, type WsNotificationEvent } from '@remitano/shared';
import { useAuth } from '@/features/auth/AuthContext';
import { notificationsKey, unreadCountKey, videosKey } from './queryKeys';

interface SocketCtx {
  connected: boolean;
}

const Ctx = createContext<SocketCtx>({ connected: false });

function getWsBase(): string {
  return import.meta.env['VITE_API_BASE_URL'] || '';
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket: Socket = io(`${getWsBase()}/ws`, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token: accessToken },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
    });

    socket.on('connect', () => {
      setConnected(true);
      void qc.invalidateQueries({ queryKey: notificationsKey });
      void qc.invalidateQueries({ queryKey: unreadCountKey });
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      console.warn('socket connect_error:', err.message, (err as Error & { description?: unknown }).description);
    });

    socket.on(WS_EVENTS.NOTIFICATION_NEW, (event: WsNotificationEvent) => {
      if (seenIds.current.has(event.id)) return;
      seenIds.current.add(event.id);
      toast.message(`New video shared by ${event.sharerName}`, {
        description: event.title,
        id: event.id,
      });
      void qc.invalidateQueries({ queryKey: notificationsKey });
      void qc.invalidateQueries({ queryKey: unreadCountKey });
      void qc.invalidateQueries({ queryKey: videosKey });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [accessToken, isAuthenticated, qc]);

  const value = useMemo(() => ({ connected }), [connected]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSocketStatus() {
  return useContext(Ctx);
}
