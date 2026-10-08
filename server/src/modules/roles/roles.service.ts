import { PERMISSION_CODES, PERMISSIONS, permissionGroup, type PermissionDto, type RoleDto } from '@app/shared';
import { AppError } from '../../lib/app-error.js';
import { missingPermissions, sortPermissions } from '../../lib/permissions.js';
import type { AuthContext } from '../auth/auth.service.js';
import { UserModel } from '../users/user.model.js';
import { RoleModel, type RoleDocument } from './role.model.js';
import type { CreateRoleInput, SetPermissionsInput } from './roles.validation.js';

export const ROLE_MESSAGES = {
  NOT_FOUND: 'Role not found.',
  NAME_TAKEN: 'A role with this name already exists.',
  NO_ESCALATION: 'You cannot grant permissions you do not have yourself.',
  SELF_LOCKOUT: 'You cannot remove PERMISSION_MANAGE from your own role.',
} as const;

const CASE_INSENSITIVE = { locale: 'en', strength: 2 } as const;

function toRoleDto(role: RoleDocument, userCount: number): RoleDto {
  return { id: role.id, name: role.name, permissions: sortPermissions(role.permissions), userCount };
}

async function userCounts(): Promise<Map<string, number>> {
  const rows = await UserModel.aggregate<{ _id: unknown; count: number }>([
    { $match: { roleId: { $ne: null } } },
    { $group: { _id: '$roleId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

export async function listRoles(): Promise<RoleDto[]> {
  const [roles, counts] = await Promise.all([RoleModel.find().sort({ name: 1 }), userCounts()]);
  return roles.map((role) => toRoleDto(role, counts.get(role.id) ?? 0));
}

export function listPermissions(): PermissionDto[] {
  return PERMISSION_CODES.map((code) => ({ code, description: PERMISSIONS[code], group: permissionGroup(code) }));
}

export async function createRole(actor: AuthContext, input: CreateRoleInput): Promise<RoleDto> {
  if (missingPermissions(input.permissions, actor.permissions).length > 0) {
    throw new AppError(403, ROLE_MESSAGES.NO_ESCALATION);
  }
  if (await RoleModel.exists({ name: input.name }).collation(CASE_INSENSITIVE)) {
    throw new AppError(409, ROLE_MESSAGES.NAME_TAKEN);
  }
  const role = await RoleModel.create({ name: input.name, permissions: sortPermissions(input.permissions) });
  return toRoleDto(role, 0);
}

export async function setRolePermissions(actor: AuthContext, id: string, input: SetPermissionsInput): Promise<RoleDto> {
  const role = await RoleModel.findById(id);
  if (!role) throw new AppError(404, ROLE_MESSAGES.NOT_FOUND);

  const next = sortPermissions(input.permissions);
  const added = next.filter((code) => !role.permissions.includes(code));
  if (missingPermissions(added, actor.permissions).length > 0) throw new AppError(403, ROLE_MESSAGES.NO_ESCALATION);
  if (String(actor.user.roleId) === role.id && !next.includes('PERMISSION_MANAGE')) {
    throw new AppError(400, ROLE_MESSAGES.SELF_LOCKOUT);
  }

  role.permissions = next;
  await role.save();
  const counts = await userCounts();
  return toRoleDto(role, counts.get(role.id) ?? 0);
}
