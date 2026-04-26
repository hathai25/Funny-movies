import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Send, Sparkles, Film } from 'lucide-react';
import {
  shareVideoSchema,
  type ShareVideoInput,
  type Video,
  type VideoList,
} from '@remitano/shared';
import { api, extractErrorMessage } from '@/lib/api';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { useSocketStatus } from '@/features/notifications/SocketProvider';
import { videosKey } from '@/features/notifications/queryKeys';
import { VideoCard } from './VideoCard';

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
      <section aria-label="Share a video">
        <Card className="overflow-hidden">
          <div className="bg-brand-gradient-soft px-5 pt-5 pb-4 sm:px-6">
            <div className="flex items-center gap-2 text-brand-700">
              <Sparkles className="h-4 w-4" strokeWidth={2.25} />
              <span className="label-eyebrow text-brand-700">Share something fun</span>
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              Drop a YouTube link
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Everyone online gets a real-time toast — and it lands in their inbox.
            </p>
          </div>
          <form onSubmit={onSubmit} className="border-t border-slate-200/70 p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <input
                className="input flex-1"
                placeholder="https://www.youtube.com/watch?v=…"
                aria-invalid={!!errors.url}
                aria-label="YouTube URL"
                {...register('url')}
              />
              <Button
                type="submit"
                size="lg"
                variant="gradient"
                loading={isSubmitting}
                leadingIcon={!isSubmitting && <Send className="h-4 w-4" strokeWidth={2.25} />}
              >
                {isSubmitting ? 'Sharing' : 'Share'}
              </Button>
            </div>
            {errors.url?.message && (
              <p role="alert" className="mt-2 text-sm text-rose-600">
                {errors.url.message}
              </p>
            )}
            {serverError && (
              <p role="alert" className="mt-2 text-sm text-rose-600">
                {serverError}
              </p>
            )}
          </form>
        </Card>
      </section>

      <section aria-label="Latest videos">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Latest videos</h2>
            <p className="text-sm text-slate-500">Fresh picks from the team.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium" aria-live="polite">
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                connected ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              {connected && (
                <span className="absolute inset-0 animate-pulse-dot rounded-full bg-emerald-500/60" />
              )}
            </span>
            <span className={connected ? 'text-emerald-700' : 'text-slate-500'}>
              {connected ? 'Live' : 'Reconnecting'}
            </span>
          </span>
        </div>

        {list.isLoading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <div className="aspect-video animate-pulse bg-slate-100" />
                <div className="space-y-2 p-4">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {list.isError && (
          <Card padded className="border-rose-200 bg-rose-50/50 text-sm text-rose-700">
            Failed to load videos. Try refreshing the page.
          </Card>
        )}

        {list.data && list.data.items.length === 0 && (
          <EmptyState
            icon={<Film className="h-6 w-6" strokeWidth={2} />}
            title="No videos yet"
            description="Be the first to share something funny — paste a YouTube link above."
          />
        )}

        {list.data && list.data.items.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.data.items.map((v) => (
              <li key={v.id}>
                <VideoCard video={v} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
