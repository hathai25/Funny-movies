import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { NotificationList } from '@remitano/shared';
import { useAuth } from '@/features/auth/AuthContext';
import { unreadCountKey } from './queryKeys';

export function useUnreadCount(): number {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: unreadCountKey,
    enabled: isAuthenticated,
    queryFn: async () => {
      const { data } = await api.get<NotificationList>('/api/notifications', {
        params: { limit: 1 },
      });
      return data.unreadCount;
    },
  });
  return data ?? 0;
}
