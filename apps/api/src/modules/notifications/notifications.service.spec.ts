import { NotificationsService } from './notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';

type NotifRow = {
  id: string;
  videoId: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
  userId: string;
};

const mkNotif = (overrides: Partial<NotifRow> = {}): NotifRow => ({
  id: 'n1',
  videoId: 'v1',
  userId: 'u1',
  payload: { title: 'X', sharerName: 'Alice', videoId: 'v1', youtubeId: 'abc', thumbnailUrl: null },
  readAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

function build() {
  const prisma = {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
      findFirst: jest.fn(),
    },
    user: { findMany: jest.fn() },
  };
  const service = new NotificationsService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('NotificationsService', () => {
  describe('list', () => {
    it('returns items with no nextCursor when results fit the page', async () => {
      const { service, prisma } = build();
      prisma.notification.findMany.mockResolvedValue([
        mkNotif({ id: 'n1' }),
        mkNotif({ id: 'n2' }),
      ]);
      prisma.notification.count.mockResolvedValue(2);

      const res = await service.list('u1', { limit: 5 });

      expect(res.items).toHaveLength(2);
      expect(res.nextCursor).toBeNull();
      expect(res.unreadCount).toBe(2);
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          take: 6, // limit + 1 sentinel
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('emits a nextCursor when results overflow the page', async () => {
      const { service, prisma } = build();
      prisma.notification.findMany.mockResolvedValue([
        mkNotif({ id: 'n1', createdAt: new Date('2025-02-01') }),
        mkNotif({ id: 'n2', createdAt: new Date('2025-01-15') }),
        mkNotif({ id: 'n3', createdAt: new Date('2025-01-01') }), // sentinel
      ]);
      prisma.notification.count.mockResolvedValue(3);

      const res = await service.list('u1', { limit: 2 });

      expect(res.items).toHaveLength(2);
      expect(res.items.map((i) => i.id)).toEqual(['n1', 'n2']);
      expect(res.nextCursor).toBeTruthy();
    });

    it('clamps limit to MAX_PAGE_SIZE', async () => {
      const { service, prisma } = build();
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.list('u1', { limit: 9999 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 }), // 50 + 1
      );
    });

    it('round-trips a cursor: list -> use nextCursor -> filtered query', async () => {
      const { service, prisma } = build();
      // First page: 3 items, nextCursor points at the 3rd
      prisma.notification.findMany.mockResolvedValueOnce([
        mkNotif({ id: 'n1', createdAt: new Date('2025-03-01') }),
        mkNotif({ id: 'n2', createdAt: new Date('2025-02-01') }),
        mkNotif({ id: 'n3', createdAt: new Date('2025-01-01') }),
      ]);
      prisma.notification.count.mockResolvedValue(3);

      const first = await service.list('u1', { limit: 2 });
      expect(first.nextCursor).toBeTruthy();

      prisma.notification.findMany.mockResolvedValueOnce([]);
      prisma.notification.count.mockResolvedValue(3);
      await service.list('u1', { cursor: first.nextCursor!, limit: 2 });

      const lastCall = prisma.notification.findMany.mock.calls.at(-1)![0];
      // The cursor filter must include both userId and the OR clause for stable ordering
      expect(lastCall.where).toEqual(
        expect.objectContaining({
          userId: 'u1',
          OR: expect.any(Array),
        }),
      );
    });

    it('ignores a malformed cursor by falling back to the first page', async () => {
      const { service, prisma } = build();
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.list('u1', { cursor: 'not-base64!!', limit: 5 });

      const lastCall = prisma.notification.findMany.mock.calls.at(-1)![0];
      expect(lastCall.where).toEqual({ userId: 'u1' });
    });

    it('returns ISO strings for createdAt and readAt', async () => {
      const { service, prisma } = build();
      const readAt = new Date('2025-02-01T10:00:00Z');
      prisma.notification.findMany.mockResolvedValue([mkNotif({ id: 'n1', readAt })]);
      prisma.notification.count.mockResolvedValue(0);

      const res = await service.list('u1', { limit: 5 });

      expect(res.items[0]!.createdAt).toBe('2025-01-01T00:00:00.000Z');
      expect(res.items[0]!.readAt).toBe(readAt.toISOString());
    });
  });

  describe('markRead', () => {
    it('updates only the caller’s unread notifications', async () => {
      const { service, prisma } = build();
      prisma.notification.updateMany.mockResolvedValue({ count: 2 });

      const res = await service.markRead('u1', ['n1', 'n2', 'n3']);

      expect(res.updated).toBe(2);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['n1', 'n2', 'n3'] }, userId: 'u1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('createMany', () => {
    it('skips the prisma call when there are no rows', async () => {
      const { service, prisma } = build();
      await service.createMany([]);
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('forwards rows to prisma when provided', async () => {
      const { service, prisma } = build();
      const rows = [
        { userId: 'u1', videoId: 'v1', payload: { a: 1 } as never },
        { userId: 'u2', videoId: 'v1', payload: { a: 1 } as never },
      ];
      await service.createMany(rows);
      expect(prisma.notification.createMany).toHaveBeenCalledWith({ data: rows });
    });
  });

  describe('listRecipientIds', () => {
    it('returns ids of all users except the sharer', async () => {
      const { service, prisma } = build();
      prisma.user.findMany.mockResolvedValue([{ id: 'u2' }, { id: 'u3' }]);

      const ids = await service.listRecipientIds('u1');

      expect(ids).toEqual(['u2', 'u3']);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { not: 'u1' } },
        select: { id: true },
      });
    });
  });
});
