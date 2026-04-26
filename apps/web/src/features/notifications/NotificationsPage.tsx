import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, ExternalLink, RefreshCw, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { NotificationList } from '@remitano/shared';
import { buildEmbedUrl } from '@remitano/shared';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Avatar } from '@/ui/Avatar';
import { Badge } from '@/ui/Badge';
import { EmptyState } from '@/ui/EmptyState';
import { relativeTime, youtubeThumbnail } from '@/lib/relativeTime';
import { notificationsKey, unreadCountKey } from './queryKeys';

export function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: notificationsKey,
    queryFn: async () => {
      const { data } = await api.get<NotificationList>('/api/notifications');
      return data;
    },
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      await api.post('/api/notifications/read', { ids });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationsKey });
      void qc.invalidateQueries({ queryKey: unreadCountKey });
    },
  });

  useEffect(() => {
    if (!data) return;
    const unreadIds = data.items.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length > 0) markRead.mutate(unreadIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.items.map((i) => i.id).join(',')]);

  const items = data?.items ?? [];
  const unreadCount = items.filter((i) => !i.readAt).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Inbox</h1>
          <p className="text-sm text-slate-500">
            {unreadCount > 0
              ? `${unreadCount} new ${unreadCount === 1 ? 'video' : 'videos'} for you.`
              : 'You’re all caught up.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refetch()}
            leadingIcon={
              <RefreshCw
                className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`}
                strokeWidth={2}
              />
            }
          >
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => markRead.mutate(items.filter((i) => !i.readAt).map((i) => i.id))}
              leadingIcon={<CheckCheck className="h-4 w-4" strokeWidth={2} />}
            >
              Mark all read
            </Button>
          )}
        </div>
      </header>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} padded>
              <div className="flex gap-4">
                <div className="h-20 w-32 flex-none animate-pulse rounded-xl bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-1/4 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={<BellOff className="h-6 w-6" strokeWidth={2} />}
          title="No notifications yet"
          description="When other folks share videos, you’ll see them here."
        />
      )}

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((n) => {
            const unread = !n.readAt;
            return (
              <li key={n.id}>
                <Card
                  className={`relative overflow-hidden transition-colors ${
                    unread ? 'bg-brand-50/40' : ''
                  }`}
                >
                  {unread && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1 bg-brand-gradient"
                    />
                  )}
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                    <a
                      href={buildEmbedUrl(n.payload.youtubeId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-slate-100 sm:h-20 sm:w-32 sm:flex-none"
                    >
                      <img
                        src={youtubeThumbnail(n.payload.youtubeId, n.payload.thumbnailUrl)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </a>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Avatar name={n.payload.sharerName} size={24} />
                        <p className="text-sm text-slate-600">
                          <span className="font-medium text-slate-900">{n.payload.sharerName}</span>{' '}
                          shared a video
                        </p>
                        {unread && <Badge variant="brand">New</Badge>}
                      </div>
                      <p className="mt-1.5 truncate font-semibold text-slate-900">
                        {n.payload.title}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                        <time dateTime={n.createdAt}>{relativeTime(n.createdAt)}</time>
                        <a
                          href={buildEmbedUrl(n.payload.youtubeId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700"
                        >
                          Watch
                          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                        </a>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
