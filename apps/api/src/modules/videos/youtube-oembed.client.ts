import { Injectable, Logger } from '@nestjs/common';
import { request } from 'undici';
import { buildWatchUrl } from '@remitano/shared';

export interface YouTubeMetadata {
  title: string;
  author: string | null;
  thumbnailUrl: string | null;
}

@Injectable()
export class YoutubeOembedClient {
  private readonly logger = new Logger(YoutubeOembedClient.name);

  async fetch(youtubeId: string): Promise<YouTubeMetadata> {
    const target = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      buildWatchUrl(youtubeId),
    )}&format=json`;
    try {
      const res = await request(target, {
        method: 'GET',
        headersTimeout: 5_000,
        bodyTimeout: 5_000,
      });

      if (res.statusCode !== 200) {
        this.logger.warn(`oembed status=${res.statusCode} for ${youtubeId}`);
        return { title: `YouTube video ${youtubeId}`, author: null, thumbnailUrl: null };
      }

      const json = (await res.body.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };

      return {
        title: json.title?.slice(0, 500) ?? `YouTube video ${youtubeId}`,
        author: json.author_name?.slice(0, 200) ?? null,
        thumbnailUrl: json.thumbnail_url ?? null,
      };
    } catch (err) {
      this.logger.warn(`oembed failed for ${youtubeId}: ${(err as Error).message}`);
      return { title: `YouTube video ${youtubeId}`, author: null, thumbnailUrl: null };
    }
  }
}
