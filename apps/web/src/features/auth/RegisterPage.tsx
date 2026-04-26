import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { registerSchema, type RegisterInput } from '@remitano/shared';
import { useAuth } from './AuthContext';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { AuthShell } from './AuthShell';

export function RegisterPage() {
  const { register: signup } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await signup(values.email, values.password, values.name);
      navigate('/', { replace: true });
    } catch (err) {
      setServerError((err as Error).message);
    }
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Takes 30 seconds. No credit card, no spam."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" error={errors.name?.message}>
          <input
            className="input"
            autoComplete="name"
            placeholder="Jane Doe"
            {...register('name')}
          />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register('email')}
          />
        </Field>
        <Field label="Password" hint="At least 8 characters." error={errors.password?.message}>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
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
          leadingIcon={!isSubmitting && <UserPlus className="h-4 w-4" strokeWidth={2.25} />}
          className="w-full"
        >
          {isSubmitting ? 'Creating account' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
