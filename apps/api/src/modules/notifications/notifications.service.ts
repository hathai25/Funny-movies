import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { NotificationPayload } from '@remitano/shared';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, opts: { cursor?: string; limit?: number }) {
    const limit = Math.min(opts.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const cursor = opts.cursor ? this.decodeCursor(opts.cursor) : null;

    const items = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const next = items[limit];
      if (next) nextCursor = this.encodeCursor(next.createdAt, next.id);
      items.pop();
    }

    const unreadCount = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });

    return {
      items: items.map((n) => this.toDto(n)),
      nextCursor,
      unreadCount,
    };
  }

  async markRead(userId: string, ids: string[]) {
    const result = await this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async createMany(rows: Prisma.NotificationCreateManyInput[]) {
    if (rows.length === 0) return;
    await this.prisma.notification.createMany({ data: rows });
  }

  async listRecipientIds(excludeUserId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { not: excludeUserId } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async findByUserAndVideo(userId: string, videoId: string) {
    return this.prisma.notification.findFirst({
      where: { userId, videoId },
    });
  }

  private toDto(n: {
    id: string;
    videoId: string;
    payload: Prisma.JsonValue;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: n.id,
      videoId: n.videoId,
      payload: n.payload as unknown as NotificationPayload,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    };
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ t: createdAt.toISOString(), i: id })).toString('base64url');
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
    try {
      const json = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        t: string;
        i: string;
      };
      return { createdAt: new Date(json.t), id: json.i };
    } catch {
      return null;
    }
  }
}
