import clsx from 'clsx';

type Variant = 'brand' | 'accent' | 'neutral' | 'success' | 'warning';

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

const variants: Record<Variant, string> = {
  brand: 'bg-brand-100 text-brand-700',
  accent: 'bg-accent-500 text-white',
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
};

export function Badge({ variant = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
