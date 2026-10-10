import type { PermissionCode, PermissionDto, RoleDto } from '@app/shared';
import { Fragment, useState, type FormEvent } from 'react';
import { ErrorAlert, Loading, PageHeader } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useCreateRole, usePermissions, useRoles, useSetRolePermissions } from './roles.hooks';

function sameSet(a: ReadonlySet<string>, b: readonly string[]): boolean {
  return a.size === b.length && b.every((code) => a.has(code));
}

function groupPermissions(permissions: PermissionDto[]): [string, PermissionDto[]][] {
  const groups = new Map<string, PermissionDto[]>();
  for (const p of permissions) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  return [...groups];
}

export function RolesPage() {
  const auth = useAuth();
  const roles = useRoles();
  const permissions = usePermissions();
  const save = useSetRolePermissions();
  const create = useCreateRole();
  const [drafts, setDrafts] = useState<Record<string, Set<PermissionCode>>>({});
  const [newRole, setNewRole] = useState('');

  const canEdit = auth.can('PERMISSION_MANAGE');

  const current = (role: RoleDto) => drafts[role.id] ?? new Set(role.permissions);
  const isDirty = (role: RoleDto) => drafts[role.id] !== undefined && !sameSet(drafts[role.id]!, role.permissions);

  const toggle = (role: RoleDto, code: PermissionCode) => {
    const next = new Set(current(role));
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setDrafts((d) => ({ ...d, [role.id]: next }));
  };

  const onSave = (role: RoleDto) => {
    const draft = drafts[role.id];
    if (!draft) return;
    const ordered = (permissions.data ?? []).map((p) => p.code).filter((code) => draft.has(code));
    save.mutate(
      { id: role.id, permissions: ordered },
      {
        onSuccess: () =>
          setDrafts((d) => {
            const { [role.id]: _saved, ...rest } = d;
            return rest;
          }),
      },
    );
  };

  const onAddRole = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(newRole, { onSuccess: () => setNewRole('') });
  };

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        subtitle="Tick permissions per role, then Save that role. You can only grant permissions you hold yourself."
      />
      <ErrorAlert error={save.error ?? create.error} />

      {auth.can('ROLE_MANAGE') && (
        <form className="card inline-form" onSubmit={onAddRole}>
          <input className="input" placeholder="New role name" required value={newRole} onChange={(e) => setNewRole(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            + Add role
          </button>
        </form>
      )}

      {roles.isPending || permissions.isPending ? (
        <Loading />
      ) : roles.isError || permissions.isError ? (
        <ErrorAlert error={roles.error ?? permissions.error} />
      ) : (
        <section className="card">
          <div className="table-wrap">
            <table className="table matrix">
              <thead>
                <tr>
                  <th>Permission</th>
                  {roles.data.map((role) => (
                    <th key={role.id} className="align-center">
                      <div className="matrix-role">{role.name}</div>
                      <div className="muted small">
                        {role.userCount} user{role.userCount === 1 ? '' : 's'}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={!isDirty(role) || save.isPending}
                          onClick={() => onSave(role)}
                        >
                          Save
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupPermissions(permissions.data).map(([group, items]) => (
                  <Fragment key={group}>
                    <tr className="group-row">
                      <td colSpan={roles.data.length + 1}>{group}</td>
                    </tr>
                    {items.map((permission) => (
                      <tr key={permission.code}>
                        <td>
                          <div className="mono small">{permission.code}</div>
                          <div className="muted small">{permission.description}</div>
                        </td>
                        {roles.data.map((role) => {
                          const checked = current(role).has(permission.code);
                          // Can't grant what you don't hold; unticking is allowed.
                          const disabled = !canEdit || (!checked && !auth.can(permission.code));
                          return (
                            <td key={role.id} className={`align-center ${drafts[role.id] ? 'cell-draft' : ''}`}>
                              <input
                                type="checkbox"
                                aria-label={`${role.name}: ${permission.code}`}
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggle(role, permission.code)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
