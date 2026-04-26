import clsx from 'clsx';
import { forwardRef } from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padded?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive, padded, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={clsx(
        'rounded-2xl border border-slate-200/70 bg-white shadow-soft',
        interactive &&
          'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-slate-300',
        padded && 'p-5',
        className,
      )}
      {...rest}
    />
  );
});
