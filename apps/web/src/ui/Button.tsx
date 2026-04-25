import { forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary:
    'bg-brand-600 hover:bg-brand-700 text-white focus-visible:outline-brand-600 disabled:opacity-60',
  secondary:
    'bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 focus-visible:outline-slate-400',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
