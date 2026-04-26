import { forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'ghost' | 'subtle' | 'solid';
type Size = 'sm' | 'md';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  solid: 'bg-brand-600 text-white hover:bg-brand-700 shadow-soft',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={clsx(
        'inline-grid place-items-center transition-colors duration-150 disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  );
});
