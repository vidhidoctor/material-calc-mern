import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorAlert, Field } from '../../components/ui';
import { signup } from './auth.api';
import { AuthCard } from './components/AuthCard';

export function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({ mutationFn: signup });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({ name, email, password });
  };

  if (mutation.isSuccess) {
    return (
      <AuthCard title="Account created" footer={<Link to="/login">Back to log in</Link>}>
        <div className="alert alert-success">{mutation.data.message}</div>
        <p className="muted">
          An Admin will assign your department and role and activate your account. You can log in after that.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create an account"
      subtitle="After you sign up, an Admin must assign your department and role and activate your account before you can log in."
      footer={
        <span>
          Already have an account? <Link to="/login">Log in</Link>
        </span>
      }
    >
      <form className="stack" onSubmit={onSubmit}>
        <ErrorAlert error={mutation.error} />
        <Field label="Name" required>
          <input className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" required>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" required hint="At least 8 characters.">
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
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating…' : 'Sign up'}
        </button>
      </form>
    </AuthCard>
  );
}
