import { UnauthorizedException } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import type { AuthService } from '../auth/auth.service';
import type { RedisService } from '../jobs/redis.service';
import type { AppConfigService } from '../../config/config.service';
import type { Socket } from 'socket.io';

function build() {
  const auth = { verifyToken: jest.fn() } as unknown as AuthService & {
    verifyToken: jest.Mock;
  };
  const redis = {} as RedisService;
  const cfg = {} as AppConfigService;
  const gateway = new NotificationsGateway(auth, redis, cfg);
  return { gateway, auth };
}

const mkSocket = (
  overrides: {
    authToken?: string;
    authHeader?: string;
    queryToken?: string | string[];
  } = {},
): Socket => {
  const auth: Record<string, string> = {};
  if (overrides.authToken !== undefined) auth['token'] = overrides.authToken;
  const headers: Record<string, string> = {};
  if (overrides.authHeader !== undefined) headers['authorization'] = overrides.authHeader;
  const query: Record<string, string | string[]> = {};
  if (overrides.queryToken !== undefined) query['token'] = overrides.queryToken;
  return {
    id: 'sid-1',
    data: {},
    handshake: { auth, headers, query },
    join: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as Socket;
};

describe('NotificationsGateway.handleConnection', () => {
  it('disconnects sockets with no token (no auth, header, or query)', () => {
    const { gateway, auth } = build();
    const sock = mkSocket();

    gateway.handleConnection(sock);

    expect(sock.disconnect).toHaveBeenCalledWith(true);
    expect(auth.verifyToken).not.toHaveBeenCalled();
  });

  it('accepts a token from handshake.auth.token (preferred path)', () => {
    const { gateway, auth } = build();
    auth.verifyToken.mockReturnValue({ sub: 'u1' });
    const sock = mkSocket({ authToken: 'tok-from-auth' });

    gateway.handleConnection(sock);

    expect(auth.verifyToken).toHaveBeenCalledWith('tok-from-auth');
    expect(sock.join).toHaveBeenCalledWith('user:u1');
    expect(sock.data.userId).toBe('u1');
    expect(sock.disconnect).not.toHaveBeenCalled();
  });

  it('falls back to the Authorization Bearer header', () => {
    const { gateway, auth } = build();
    auth.verifyToken.mockReturnValue({ sub: 'u2' });
    const sock = mkSocket({ authHeader: 'Bearer header-tok' });

    gateway.handleConnection(sock);

    expect(auth.verifyToken).toHaveBeenCalledWith('header-tok');
    expect(sock.join).toHaveBeenCalledWith('user:u2');
  });

  it('ignores a non-Bearer Authorization header and disconnects', () => {
    const { gateway, auth } = build();
    const sock = mkSocket({ authHeader: 'Basic abc123' });

    gateway.handleConnection(sock);

    expect(auth.verifyToken).not.toHaveBeenCalled();
    expect(sock.disconnect).toHaveBeenCalledWith(true);
  });

  it('falls back to the query string token', () => {
    const { gateway, auth } = build();
    auth.verifyToken.mockReturnValue({ sub: 'u3' });
    const sock = mkSocket({ queryToken: 'query-tok' });

    gateway.handleConnection(sock);

    expect(auth.verifyToken).toHaveBeenCalledWith('query-tok');
    expect(sock.join).toHaveBeenCalledWith('user:u3');
  });

  it('prefers handshake.auth over header and query when multiple are set', () => {
    const { gateway, auth } = build();
    auth.verifyToken.mockReturnValue({ sub: 'u4' });
    const sock = mkSocket({
      authToken: 'preferred',
      authHeader: 'Bearer ignored',
      queryToken: 'ignored',
    });

    gateway.handleConnection(sock);

    expect(auth.verifyToken).toHaveBeenCalledWith('preferred');
  });

  it('disconnects when verifyToken throws (bad/expired JWT)', () => {
    const { gateway, auth } = build();
    auth.verifyToken.mockImplementation(() => {
      throw new UnauthorizedException('bad token');
    });
    const sock = mkSocket({ authToken: 'bad-tok' });

    gateway.handleConnection(sock);

    expect(sock.disconnect).toHaveBeenCalledWith(true);
    expect(sock.join).not.toHaveBeenCalled();
  });
});

describe('NotificationsGateway.emitNotification', () => {
  it('emits to the per-user room with the WS_EVENTS.NOTIFICATION_NEW event name', () => {
    const { gateway } = build();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    // Inject a minimal Server stub.
    (gateway as unknown as { server: { to: typeof to } }).server = { to };

    gateway.emitNotification('u9', {
      id: 'n1',
      videoId: 'v1',
      title: 'T',
      sharerName: 'S',
      youtubeId: 'y',
      thumbnailUrl: null,
      createdAt: '2025-01-01T00:00:00.000Z',
    });

    expect(to).toHaveBeenCalledWith('user:u9');
    expect(emit).toHaveBeenCalledWith(
      'notification:new',
      expect.objectContaining({ id: 'n1', videoId: 'v1' }),
    );
  });
});
