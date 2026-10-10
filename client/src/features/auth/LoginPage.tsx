import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ErrorAlert, Field } from '../../components/ui';
import { useAuth, type LoginRedirect } from '../../lib/auth';
import { AuthCard } from './components/AuthCard';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const redirect = useLocation().state as LoginRedirect | null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const loggedIn = await login(email, password);
      // Return to the previous page only for the same user (session expiry) or a deep link.
      const sameUser = !redirect?.userId || redirect.userId === loggedIn.id;
      navigate(redirect?.from && sameUser ? redirect.from : '/', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          <Link to="/forgot-password">Forgot password?</Link>
          <span>
            New here? <Link to="/signup">Create an account</Link>
          </span>
        </>
      }
    >
      {redirect?.expired && <div className="alert alert-info">Your session has expired. Please log in again.</div>}
      <form className="stack" onSubmit={onSubmit}>
        <ErrorAlert error={error} />
        <Field label="Email">
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthCard>
  );
}
