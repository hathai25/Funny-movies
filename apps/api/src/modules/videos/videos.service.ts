import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseYouTubeId, type ShareVideoInput } from '@remitano/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { YoutubeOembedClient } from './youtube-oembed.client';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oembed: YoutubeOembedClient,
    private readonly jobs: JobsService,
  ) {}

  async share(userId: string, input: ShareVideoInput) {
    const youtubeId = parseYouTubeId(input.url);
    if (!youtubeId) {
      throw new UnprocessableEntityException({
        code: 'INVALID_YOUTUBE_URL',
        message: 'The provided URL does not look like a YouTube video.',
      });
    }

    const existing = await this.prisma.video.findUnique({
      where: { youtubeId },
      include: this.includeSharer(),
    });
    if (existing) {
      throw new ConflictException({
        code: 'VIDEO_ALREADY_SHARED',
        message: 'This video has already been shared.',
        video: this.toDto(existing),
      });
    }

    const meta = await this.oembed.fetch(youtubeId);

    let video;
    try {
      video = await this.prisma.video.create({
        data: {
          youtubeId,
          url: input.url,
          title: meta.title,
          author: meta.author,
          thumbnailUrl: meta.thumbnailUrl,
          sharedById: userId,
        },
        include: this.includeSharer(),
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const dup = await this.prisma.video.findUnique({
          where: { youtubeId },
          include: this.includeSharer(),
        });
        throw new ConflictException({
          code: 'VIDEO_ALREADY_SHARED',
          message: 'This video has already been shared.',
          video: dup ? this.toDto(dup) : undefined,
        });
      }
      throw err;
    }

    await this.jobs.enqueueVideoShared({ videoId: video.id, sharedById: userId });
    return this.toDto(video);
  }

  async list(opts: { cursor?: string; limit?: number }) {
    const limit = Math.min(opts.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const cursor = opts.cursor ? this.decodeCursor(opts.cursor) : null;

    const items = await this.prisma.video.findMany({
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : undefined,
      include: this.includeSharer(),
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const next = items[limit];
      if (next) nextCursor = this.encodeCursor(next.createdAt, next.id);
      items.pop();
    }

    return {
      items: items.map((v) => this.toDto(v)),
      nextCursor,
    };
  }

  private includeSharer() {
    return {
      sharedBy: { select: { id: true, name: true, email: true } },
    } as const;
  }

  private toDto(v: {
    id: string;
    youtubeId: string;
    url: string;
    title: string;
    author: string | null;
    thumbnailUrl: string | null;
    sharedById: string;
    createdAt: Date;
    sharedBy: { id: string; name: string; email: string };
  }) {
    return {
      id: v.id,
      youtubeId: v.youtubeId,
      url: v.url,
      title: v.title,
      author: v.author,
      thumbnailUrl: v.thumbnailUrl,
      sharedById: v.sharedById,
      sharedBy: v.sharedBy,
      createdAt: v.createdAt.toISOString(),
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
