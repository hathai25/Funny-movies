import { useId } from 'react';
import clsx from 'clsx';
import { AlertCircle } from 'lucide-react';

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
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {Object.assign({}, children, {
        props: { ...children.props, id, 'aria-invalid': !!error },
      })}
      {hint && !error && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}
      {error && (
        <span className={clsx('mt-1.5 flex items-center gap-1 text-xs text-rose-600')} role="alert">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {error}
        </span>
      )}
    </label>
  );
}
