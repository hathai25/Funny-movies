import clsx from 'clsx';

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

export function Logo({ size = 28, withWordmark = true, className }: LogoProps) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="grid place-items-center rounded-xl bg-brand-gradient text-white shadow-glow"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor">
          <path d="M9 6.5c0-.8.87-1.3 1.56-.9l8.25 4.85c.68.4.68 1.39 0 1.79l-8.25 4.85c-.69.4-1.56-.1-1.56-.9V6.5z" />
        </svg>
      </span>
      {withWordmark && (
        <span className="text-base font-semibold tracking-tight text-slate-900">Funny Movies</span>
      )}
    </span>
  );
}
