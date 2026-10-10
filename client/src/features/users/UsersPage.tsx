import type { UserDto } from '@app/shared';
import { useState } from 'react';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, ErrorAlert, PageHeader, QueryState, StatusBadge } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { UserFormModal } from './components/UserFormModal';
import { useDeleteUser, useDepartmentOptions, useRoleOptions, useUsers } from './users.hooks';

function statusOf(user: UserDto) {
  if (user.pending) return <StatusBadge tone="amber">Waiting for activation</StatusBadge>;
  return user.isActive ? <StatusBadge tone="green">Active</StatusBadge> : <StatusBadge tone="grey">Inactive</StatusBadge>;
}

export function UsersPage() {
  const auth = useAuth();
  const users = useUsers();
  const roles = useRoleOptions();
  const departments = useDepartmentOptions();
  const remove = useDeleteUser();
  const [editing, setEditing] = useState<UserDto | 'new' | null>(null);

  const canEdit = auth.can('USER_UPDATE');

  const onDelete = (user: UserDto) => {
    if (window.confirm(`Delete ${user.name} (${user.email})? This cannot be undone.`)) remove.mutate(user.id);
  };

  const columns: Column<UserDto>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <div>
          <strong>{u.name}</strong>
          <div className="muted small">{u.email}</div>
        </div>
      ),
    },
    { key: 'department', header: 'Department', render: (u) => u.department?.name ?? '—' },
    { key: 'role', header: 'Role', render: (u) => u.role?.name ?? '—' },
    { key: 'status', header: 'Status', render: statusOf },
    { key: 'created', header: 'Joined', render: (u) => formatDate(u.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div className="row-actions">
          {canEdit && (
            <button type="button" className={`btn btn-sm ${u.pending ? 'btn-primary' : ''}`} onClick={() => setEditing(u)}>
              {u.pending ? 'Review' : 'Edit'}
            </button>
          )}
          {auth.can('USER_DELETE') && u.id !== auth.user?.id && (
            <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => onDelete(u)}>
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Accounts waiting for activation are listed first."
        actions={
          auth.can('USER_CREATE') && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              + New user
            </button>
          )
        }
      />
      <ErrorAlert error={remove.error} />
      <QueryState query={users}>
        {(list) => {
          const pending = list.filter((u) => u.pending).length;
          return (
            <section className="card">
              {pending > 0 && (
                <div className="card-banner">
                  {pending} account{pending > 1 ? 's' : ''} waiting for activation.
                </div>
              )}
              <DataGrid
                columns={columns}
                rows={list}
                rowKey={(u) => u.id}
                rowClassName={(u) => (u.pending ? 'row-highlight' : undefined)}
                empty={<EmptyState title="No users yet." />}
              />
            </section>
          );
        }}
      </QueryState>

      {editing !== null && (
        <UserFormModal
          user={editing === 'new' ? null : editing}
          roles={roles.data ?? []}
          departments={departments.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
