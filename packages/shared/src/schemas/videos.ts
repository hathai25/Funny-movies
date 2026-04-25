import { z } from 'zod';

export const shareVideoSchema = z.object({
  url: z.string().trim().url().max(2048),
});

export const videoSchema = z.object({
  id: z.string(),
  youtubeId: z.string(),
  url: z.string(),
  title: z.string(),
  author: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  sharedById: z.string(),
  sharedBy: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  createdAt: z.string(),
});

export const videoListSchema = z.object({
  items: z.array(videoSchema),
  nextCursor: z.string().nullable(),
});

export type ShareVideoInput = z.infer<typeof shareVideoSchema>;
export type Video = z.infer<typeof videoSchema>;
export type VideoList = z.infer<typeof videoListSchema>;
