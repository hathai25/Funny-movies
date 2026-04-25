import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as IOServer } from 'socket.io';
import { SocketProvider } from '@/features/notifications/SocketProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { WS_EVENTS } from '@remitano/shared';

let httpServer: HttpServer;
let ioServer: IOServer;
let port: number;

beforeAll(async () => {
  httpServer = createServer();
  ioServer = new IOServer(httpServer, {
    path: '/ws/socket.io',
    cors: { origin: '*' },
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  port = (httpServer.address() as AddressInfo).port;

  // pre-seed an authenticated user in localStorage for AuthProvider
  localStorage.setItem(
    'remitano.auth',
    JSON.stringify({
      accessToken: 'fake-token',
      user: {
        id: 'u1',
        email: 'a@b.com',
        name: 'Alice',
        createdAt: new Date().toISOString(),
      },
    }),
  );
  vi.stubEnv('VITE_API_BASE_URL', `http://127.0.0.1:${port}`);
});

afterAll(async () => {
  ioServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('SocketProvider integration', () => {
  it('shows a toast when notification:new arrives', async () => {
    let serverGotConnection = false;
    ioServer.of('/ws').on('connection', (socket) => {
      serverGotConnection = true;
      setTimeout(() => {
        socket.emit(WS_EVENTS.NOTIFICATION_NEW, {
          id: 'n1',
          videoId: 'v1',
          title: 'Funny Cat Video',
          sharerName: 'Bob',
          youtubeId: 'dQw4w9WgXcQ',
          thumbnailUrl: null,
          createdAt: new Date().toISOString(),
        });
      }, 50);
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <SocketProvider>
              <Toaster />
              <div>app loaded</div>
            </SocketProvider>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('app loaded')).toBeInTheDocument();
    await waitFor(
      () => {
        expect(serverGotConnection).toBe(true);
      },
      { timeout: 5000 },
    );
    await waitFor(
      () => {
        expect(screen.getByText(/New video shared by Bob/i)).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByText('Funny Cat Video')).toBeInTheDocument();
  }, 15_000);
});
