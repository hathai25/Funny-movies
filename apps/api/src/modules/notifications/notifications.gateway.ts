import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { WS_EVENTS, type WsNotificationEvent } from '@remitano/shared';
import { AppConfigService } from '../../config/config.service';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../jobs/redis.service';

const userRoom = (userId: string) => `user:${userId}`;

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly redis: RedisService,
    private readonly cfg: AppConfigService,
  ) {}

  async onModuleInit() {
    // Adapter is wired in afterInit when the server is available.
  }

  async onModuleDestroy() {
    // Server lifecycle managed by Nest.
  }

  async afterInit(server: Server) {
    try {
      const pub = this.redis.pub.duplicate();
      const sub = this.redis.sub.duplicate();
      await Promise.all([pub.connect?.(), sub.connect?.()]);
      server.adapter(createAdapter(pub, sub));
      this.logger.log('Socket.IO Redis adapter attached');
    } catch (e) {
      this.logger.warn(`Redis adapter not attached (${(e as Error).message}); fan-out limited to this instance`);
    }
  }

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.debug('socket rejected: missing token');
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.auth.verifyToken(token);
      client.data.userId = payload.sub;
      void client.join(userRoom(payload.sub));
      this.logger.debug(`socket connected user=${payload.sub} sid=${client.id}`);
    } catch (e) {
      this.logger.debug(`socket rejected: ${(e as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`socket disconnected sid=${client.id}`);
  }

  emitNotification(userId: string, event: WsNotificationEvent) {
    this.server.to(userRoom(userId)).emit(WS_EVENTS.NOTIFICATION_NEW, event);
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = (client.handshake.auth as Record<string, unknown> | undefined)?.['token'];
    if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;
    const header = client.handshake.headers['authorization'];
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    const fromQuery = client.handshake.query['token'];
    if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
    return null;
  }
}
