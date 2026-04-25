import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { NotificationList } from '@remitano/shared';
import { buildEmbedUrl } from '@remitano/shared';
import { Button } from '@/ui/Button';
import { notificationsKey, unreadCountKey } from './queryKeys';

export function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
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

  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (!data || data.items.length === 0) {
    return (
      <div className="text-center text-slate-500 py-12">
        <p>No notifications yet. They will appear here when other users share videos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <ul className="space-y-3">
        {data.items.map((n) => (
          <li
            key={n.id}
            className={`rounded-md border bg-white p-4 ${
              n.readAt ? 'border-slate-200' : 'border-brand-500'
            }`}
          >
            <div className="flex gap-4">
              {n.payload.thumbnailUrl ? (
                <img
                  src={n.payload.thumbnailUrl}
                  alt=""
                  className="w-32 h-20 rounded object-cover flex-none"
                />
              ) : (
                <div className="w-32 h-20 rounded bg-slate-100 flex-none" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-500">
                  {n.payload.sharerName} shared
                </p>
                <p className="font-medium truncate">{n.payload.title}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
                <a
                  href={buildEmbedUrl(n.payload.youtubeId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:underline mt-2 inline-block"
                >
                  Open video
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {data.nextCursor && (
        <Button variant="secondary" onClick={() => void qc.invalidateQueries({ queryKey: notificationsKey })}>
          Refresh
        </Button>
      )}
    </div>
  );
}
