import { useId } from 'react';
import clsx from 'clsx';

interface FieldProps {
  label: string;
  error?: string | undefined;
  children: React.ReactElement;
  hint?: string;
}

export function Field({ label, error, children, hint }: FieldProps) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <span className="block text-sm font-medium mb-1 text-slate-700">{label}</span>
      {/* clone child to inject id */}
      {Object.assign({}, children, {
        props: { ...children.props, id, 'aria-invalid': !!error },
      })}
      {hint && !error && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
      {error && (
        <span className={clsx('block text-xs mt-1 text-red-600')} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
