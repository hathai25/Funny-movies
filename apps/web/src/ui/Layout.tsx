import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '@/features/auth/AuthContext';
import { useUnreadCount } from '@/features/notifications/useUnreadCount';
import { Button } from './Button';

export function Layout() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const unread = useUnreadCount();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-bold text-brand-600">
            Funny Movies
          </Link>
          <nav className="flex items-center gap-4">
            {isAuthenticated && (
              <NavLink
                to="/notifications"
                className={({ isActive }) =>
                  clsx(
                    'relative text-sm font-medium hover:text-brand-600',
                    isActive ? 'text-brand-600' : 'text-slate-700',
                  )
                }
              >
                Notifications
                {unread > 0 && (
                  <span
                    aria-label={`${unread} unread`}
                    className="ml-1 inline-flex items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] leading-none text-white"
                  >
                    {unread}
                  </span>
                )}
              </NavLink>
            )}
            {isAuthenticated ? (
              <>
                <span className="text-sm text-slate-500 hidden sm:inline">
                  Hi, {user?.name}
                </span>
                <Button variant="ghost" onClick={() => logout()}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')}>
                  Sign in
                </Button>
                <Button onClick={() => navigate('/register')}>Register</Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 w-full flex-1">
        <Outlet />
      </main>
      <footer className="text-center text-xs text-slate-500 py-4">
        Remitano take-home · share YouTube videos with your team
      </footer>
    </div>
  );
}
