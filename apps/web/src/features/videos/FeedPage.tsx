import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  buildEmbedUrl,
  shareVideoSchema,
  type ShareVideoInput,
  type Video,
  type VideoList,
} from '@remitano/shared';
import { api, extractErrorMessage } from '@/lib/api';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { useSocketStatus } from '@/features/notifications/SocketProvider';
import { videosKey } from '@/features/notifications/queryKeys';

export function FeedPage() {
  const qc = useQueryClient();
  const { connected } = useSocketStatus();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ShareVideoInput>({ resolver: zodResolver(shareVideoSchema) });

  const list = useQuery({
    queryKey: videosKey,
    queryFn: async () => {
      const { data } = await api.get<VideoList>('/api/videos', { params: { limit: 20 } });
      return data;
    },
  });

  const share = useMutation({
    mutationFn: async (input: ShareVideoInput) => {
      const { data } = await api.post<Video>('/api/videos', input);
      return data;
    },
    onSuccess: (video) => {
      reset();
      toast.success(`Shared “${video.title}”`);
      void qc.invalidateQueries({ queryKey: videosKey });
    },
    onError: (err) => {
      setServerError(extractErrorMessage(err));
    },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    share.mutate(values);
  });

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold mb-3">Share a YouTube video</h2>
        <form onSubmit={onSubmit} className="flex gap-2 items-start">
          <div className="flex-1">
            <Field label="" error={errors.url?.message}>
              <input
                className="input"
                placeholder="https://www.youtube.com/watch?v=…"
                {...register('url')}
              />
            </Field>
            {serverError && (
              <p role="alert" className="text-sm text-red-600 mt-1">
                {serverError}
              </p>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sharing…' : 'Share'}
          </Button>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Latest videos</h2>
          <span
            className={`text-xs ${connected ? 'text-emerald-600' : 'text-slate-400'}`}
            aria-live="polite"
          >
            {connected ? '● live' : '○ reconnecting'}
          </span>
        </div>
        {list.isLoading && <p className="text-slate-500">Loading…</p>}
        {list.isError && <p className="text-red-600">Failed to load videos.</p>}
        {list.data && list.data.items.length === 0 && (
          <p className="text-slate-500">
            No videos yet. Be the first to share one!
          </p>
        )}
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.data?.items.map((v) => (
            <li
              key={v.id}
              className="rounded-lg border border-slate-200 bg-white overflow-hidden"
            >
              <div className="aspect-video bg-slate-100">
                <iframe
                  loading="lazy"
                  src={buildEmbedUrl(v.youtubeId)}
                  title={v.title}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="p-3 space-y-1">
                <p className="font-medium truncate" title={v.title}>
                  {v.title}
                </p>
                <p className="text-xs text-slate-500">
                  Shared by {v.sharedBy.name} · {new Date(v.createdAt).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
