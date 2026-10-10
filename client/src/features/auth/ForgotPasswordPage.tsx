import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorAlert, Field } from '../../components/ui';
import { forgotPassword } from './auth.api';
import { AuthCard } from './components/AuthCard';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const mutation = useMutation({ mutationFn: forgotPassword });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(email);
  };

  return (
    <AuthCard title="Forgot password" subtitle="Enter your email and we'll send you a reset link." footer={<Link to="/login">Back to log in</Link>}>
      {mutation.isSuccess ? (
        <div className="stack">
          <div className="alert alert-success">{mutation.data.message}</div>
          {mutation.data.devResetToken && (
            <div className="alert alert-info">
              Development mode (no email service yet):{' '}
              <Link to={`/reset-password?token=${encodeURIComponent(mutation.data.devResetToken)}`}>Reset now</Link>
            </div>
          )}
        </div>
      ) : (
        <form className="stack" onSubmit={onSubmit}>
          <ErrorAlert error={mutation.error} />
          <Field label="Email">
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
