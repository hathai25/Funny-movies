import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { useUnreadCount } from '@/features/notifications/useUnreadCount';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { BottomTabBar } from './BottomTabBar';

export function Layout() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const unread = useUnreadCount();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  if (isAuthPage) {
    return (
      <div className="min-h-screen">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass sticky top-0 z-30 border-b border-slate-200/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Funny Movies home" className="rounded-lg">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {isAuthenticated && (
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  clsx(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:text-slate-900',
                  )
                }
              >
                Feed
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <NavLink
                  to="/notifications"
                  aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                  className={({ isActive }) =>
                    clsx(
                      'relative grid h-10 w-10 place-items-center rounded-xl transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )
                  }
                >
                  <Bell className="h-5 w-5" strokeWidth={2} />
                  {unread > 0 && (
                    <span className="absolute right-1.5 top-1.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-500 px-1 text-[10px] font-semibold leading-none text-white animate-fade-in">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </NavLink>
                <div className="hidden items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white px-2.5 py-1 sm:flex">
                  <Avatar name={user?.name ?? 'You'} size={28} />
                  <span className="max-w-[10rem] truncate text-sm font-medium text-slate-700">
                    {user?.name}
                  </span>
                </div>
                <IconButton aria-label="Sign out" onClick={() => logout()}>
                  <LogOut className="h-5 w-5" strokeWidth={2} />
                </IconButton>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')}>
                  Sign in
                </Button>
                <Button variant="gradient" onClick={() => navigate('/register')}>
                  Get started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pb-10 animate-fade-in">
        <Outlet />
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 text-xs text-slate-400 sm:px-6 sm:pb-8">
        <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-200/70 pt-6 sm:flex-row">
          <span>Share what makes you laugh.</span>
          <span>© {new Date().getFullYear()} Funny Movies</span>
        </div>
      </footer>

      {isAuthenticated && <BottomTabBar />}
    </div>
  );
}
