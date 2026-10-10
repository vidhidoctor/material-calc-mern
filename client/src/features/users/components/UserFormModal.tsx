import type { DepartmentDto, RoleDto, UserDto } from '@app/shared';
import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { useCreateUser, useUpdateUser } from '../users.hooks';
import type { UpdateUserBody } from '../users.api';

interface Props {
  /** null = create a new user. */
  user: UserDto | null;
  roles: RoleDto[];
  departments: DepartmentDto[];
  onClose: () => void;
}

export function UserFormModal({ user, roles, departments, onClose }: Props) {
  const auth = useAuth();
  const isSelf = user !== null && user.id === auth.user?.id;
  const create = useCreateUser();
  const update = useUpdateUser();
  const mutation = user ? update : create;

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [departmentId, setDepartmentId] = useState(user?.department?.id ?? '');
  const [roleId, setRoleId] = useState(user?.role?.id ?? '');
  const [isActive, setIsActive] = useState(user ? user.isActive || user.pending : true);

  // You can only assign roles whose permissions you hold (the API enforces this too).
  const assignable = roles.filter((role) => role.id === user?.role?.id || auth.can(...role.permissions));
  const missingForActive = isActive && (!roleId || !departmentId);

  const onSubmit = () => {
    if (!user) {
      create.mutate(
        { name, email, password, roleId: roleId || null, departmentId: departmentId || null, isActive },
        { onSuccess: onClose },
      );
      return;
    }
    const body: UpdateUserBody = {};
    if (name !== user.name) body.name = name;
    if ((departmentId || null) !== (user.department?.id ?? null)) body.departmentId = departmentId || null;
    if (!isSelf && (roleId || null) !== (user.role?.id ?? null)) body.roleId = roleId || null;
    if (!isSelf && isActive !== user.isActive) body.isActive = isActive;
    if (password) body.password = password;
    update.mutate({ id: user.id, body }, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      title={user ? (user.pending ? `Review ${user.name}` : `Edit ${user.name}`) : 'New user'}
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending || missingForActive}>
            {mutation.isPending ? 'Saving…' : user?.pending ? 'Save & activate' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={mutation.error} />
        {user?.pending && (
          <div className="alert alert-info">This person signed up and is waiting for activation. Assign a department and a role, then save.</div>
        )}
        <Field label="Name" required>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" required={!user} hint={user ? 'Email cannot be changed.' : undefined}>
          <input className="input" type="email" required disabled={!!user} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field
          label={user ? 'New password' : 'Password'}
          required={!user}
          hint={user ? 'Leave blank to keep the current password. Changing it logs the user out everywhere.' : 'At least 8 characters.'}
        >
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required={!user}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="grid-2">
          <Field label="Department">
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">— None —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role" hint={isSelf ? 'You cannot change your own role.' : undefined}>
            <select className="input" value={roleId} disabled={isSelf} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">— None —</option>
              {assignable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={isActive} disabled={isSelf} onChange={(e) => setIsActive(e.target.checked)} />
          <span>Active (can log in){isSelf ? ' — you cannot deactivate yourself' : ''}</span>
        </label>
        {missingForActive && <p className="field-hint">Choose a department and a role to activate this account.</p>}
      </div>
    </Modal>
  );
}
