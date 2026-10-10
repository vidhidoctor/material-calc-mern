import type { AdminEmailDto } from '@app/shared';
import { useState, type FormEvent } from 'react';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, ErrorAlert, Field, PageHeader, QueryState, StatusBadge } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { useAddAdminEmail, useRemoveAdminEmail, useSettings } from './settings.hooks';

function accountStatus(entry: AdminEmailDto) {
  if (!entry.account) return <StatusBadge tone="grey">No account</StatusBadge>;
  if (!entry.account.isActive) return <StatusBadge tone="grey">Inactive</StatusBadge>;
  if (!entry.account.isAdmin) return <StatusBadge tone="amber">Not Admin role</StatusBadge>;
  return <StatusBadge tone="green">Active Admin</StatusBadge>;
}

export function SettingsPage() {
  const auth = useAuth();
  const settings = useSettings();
  const add = useAddAdminEmail();
  const remove = useRemoveAdminEmail();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    add.mutate(
      { email, name, password: password || undefined },
      {
        onSuccess: () => {
          setEmail('');
          setName('');
          setPassword('');
        },
      },
    );
  };

  const onRemove = (entry: AdminEmailDto) => {
    if (window.confirm(`Remove ${entry.email} from the admin list? Their account loses the Admin role, is deactivated and logged out.`)) {
      remove.mutate(entry.email);
    }
  };

  const columns: Column<AdminEmailDto>[] = [
    {
      key: 'email',
      header: 'Email',
      render: (e) => (
        <div>
          <strong>{e.email}</strong>
          {e.primary && (
            <>
              {' '}
              <StatusBadge tone="blue">Primary</StatusBadge>
            </>
          )}
        </div>
      ),
    },
    { key: 'name', header: 'Name', render: (e) => e.name },
    { key: 'status', header: 'Account', render: accountStatus },
    { key: 'added', header: 'Added', render: (e) => `${formatDate(e.addedAt)}${e.addedBy ? ` by ${e.addedBy}` : ' (seed)'}` },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) =>
        e.primary || e.email === auth.user?.email ? (
          <span className="muted small">{e.primary ? 'From server/.env' : 'You'}</span>
        ) : (
          <button type="button" className="btn btn-sm btn-danger-ghost" disabled={remove.isPending} onClick={() => onRemove(e)}>
            Remove
          </button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Global config" subtitle="Settings that apply to the whole system." />

      <section className="card section">
        <div className="section-head">
          <h2>Admin emails</h2>
          <p className="muted">
            Every email in this list has full Admin access. Adding an email creates an active Admin account with the temporary password
            you set (or promotes an existing account). Share the password privately; they can change it with “Forgot password”.
          </p>
        </div>

        <form className="admin-email-form" onSubmit={onAdd}>
          <Field label="Email" required>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Name" required>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Temporary password" hint="Required for a new account. Leave blank to keep an existing account's password.">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={add.isPending}>
            {add.isPending ? 'Adding…' : '+ Add admin'}
          </button>
        </form>
        <ErrorAlert error={add.error ?? remove.error} />

        <QueryState query={settings}>
          {(data) => (
            <DataGrid
              columns={columns}
              rows={data.adminEmails}
              rowKey={(e) => e.email}
              empty={<EmptyState title="No admin emails yet.">Run the seed to add the primary Admin from server/.env.</EmptyState>}
            />
          )}
        </QueryState>
      </section>
    </>
  );
}
