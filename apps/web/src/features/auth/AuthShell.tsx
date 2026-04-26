import { Link } from 'react-router-dom';
import { Sparkles, Zap, Bell } from 'lucide-react';
import { Logo } from '@/ui/Logo';

interface AuthShellProps {
  title: string;
  subtitle: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}

export function AuthShell({ title, subtitle, footer, children }: AuthShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand-gradient text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.14), transparent 50%)',
          }}
        />
        <Link to="/" className="relative inline-flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 backdrop-blur">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M9 6.5c0-.8.87-1.3 1.56-.9l8.25 4.85c.68.4.68 1.39 0 1.79l-8.25 4.85c-.69.4-1.56-.1-1.56-.9V6.5z" />
            </svg>
          </span>
          <span className="text-base font-semibold tracking-tight">Funny Movies</span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Share what makes you laugh.
          </h2>
          <p className="mt-3 text-white/80">
            Drop a YouTube link, and your team gets a real-time toast. No tabs, no forwarded chats —
            just instant fun.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              { icon: Zap, label: 'Realtime delivery via WebSockets' },
              { icon: Bell, label: 'Inbox keeps a backlog you can revisit' },
              { icon: Sparkles, label: 'Built for tiny teams that need a laugh' },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
                  <Icon className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <span className="text-white/90">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} Funny Movies</p>
      </aside>

      <section className="relative flex min-h-screen flex-col bg-canvas px-5 py-8 sm:px-10 lg:px-16 lg:py-16">
        <Link to="/" className="lg:hidden">
          <Logo />
        </Link>

        <div className="my-auto w-full max-w-md self-center">
          <div className="animate-fade-in">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
            <div className="mt-8">{children}</div>
            <div className="mt-6 text-sm text-slate-600">{footer}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
