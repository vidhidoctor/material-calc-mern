import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ErrorAlert, Field } from '../../components/ui';
import { resetPassword } from './auth.api';
import { AuthCard } from './components/AuthCard';

export function ResetPasswordPage() {
  const token = useSearchParams()[0].get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const mutation = useMutation({ mutationFn: (pw: string) => resetPassword(token, pw) });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    mutation.mutate(password);
  };

  if (!token) {
    return (
      <AuthCard title="Reset password" footer={<Link to="/forgot-password">Request a new link</Link>}>
        <div className="alert alert-error">This reset link is missing its token.</div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" footer={<Link to="/login">Back to log in</Link>}>
      {mutation.isSuccess ? (
        <div className="stack">
          <div className="alert alert-success">{mutation.data.message}</div>
          <Link className="btn btn-primary" to="/login">
            Log in
          </Link>
        </div>
      ) : (
        <form className="stack" onSubmit={onSubmit}>
          <ErrorAlert error={mutation.error} />
          {mismatch && <div className="alert alert-error">The two passwords do not match.</div>}
          <Field label="New password" hint="At least 8 characters.">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm password">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Reset password'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
