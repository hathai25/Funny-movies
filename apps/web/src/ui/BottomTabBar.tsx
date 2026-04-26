import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Home, Bell, type LucideIcon } from 'lucide-react';
import { useUnreadCount } from '@/features/notifications/useUnreadCount';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export function BottomTabBar() {
  const unread = useUnreadCount();
  const tabs: Tab[] = [
    { to: '/', label: 'Feed', icon: Home },
    { to: '/notifications', label: 'Inbox', icon: Bell, badge: unread },
  ];

  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-2">
        {tabs.map(({ to, label, icon: Icon, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800',
                )
              }
            >
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={2} />
                {badge ? (
                  <span className="absolute -right-2 -top-1 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-accent-500 px-1 text-[10px] font-semibold leading-none text-white">
                    {badge > 9 ? '9+' : badge}
                  </span>
                ) : null}
              </span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
