import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { loginSchema, type LoginInput } from '@remitano/shared';
import { useAuth } from './AuthContext';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { AuthShell } from './AuthShell';

const DEMO_ACCOUNTS = [
  { email: 'alice@example.com', password: 'password123', name: 'Alice' },
  { email: 'bob@example.com', password: 'password123', name: 'Bob' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      const dest = location.state?.from?.pathname ?? '/';
      navigate(dest, { replace: true });
    } catch (err) {
      setServerError((err as Error).message);
    }
  });

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to share videos and catch up on your inbox."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" error={errors.email?.message}>
          <input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="input"
            {...register('email')}
          />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="input"
            {...register('password')}
          />
        </Field>
        {serverError && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {serverError}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          variant="gradient"
          loading={isSubmitting}
          leadingIcon={!isSubmitting && <LogIn className="h-4 w-4" strokeWidth={2.25} />}
          className="w-full"
        >
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-8 rounded-2xl border border-slate-200/70 bg-white/70 p-4">
        <p className="label-eyebrow">Try a demo account</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => {
                setValue('email', acc.email, { shouldValidate: true });
                setValue('password', acc.password, { shouldValidate: true });
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-gradient text-[10px] font-bold text-white">
                {acc.name[0]}
              </span>
              {acc.email}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
