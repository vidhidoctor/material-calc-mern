import type { IdName, UserDto } from '@app/shared';
import { Types } from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import { hashPassword } from '../../lib/crypto.js';
import { missingPermissions } from '../../lib/permissions.js';
import { endAllSessions, type AuthContext } from '../auth/auth.service.js';
import { PasswordResetModel } from '../auth/password-reset.model.js';
import { DepartmentModel } from '../departments/department.model.js';
import { RoleModel, type RoleDocument } from '../roles/role.model.js';
import { UserModel, type UserDocument } from './user.model.js';
import type { CreateUserInput, UpdateUserInput } from './users.validation.js';

export const USER_MESSAGES = {
  NOT_FOUND: 'User not found.',
  EMAIL_TAKEN: 'An account with this email already exists.',
  ROLE_NOT_FOUND: 'Role not found.',
  DEPARTMENT_NOT_FOUND: 'Department not found.',
  NO_ESCALATION: 'You cannot assign a role with permissions you do not have yourself.',
  OUTRANKED: 'You cannot change a user who has permissions you do not have yourself.',
  ACTIVATION_NEEDS_ROLE: 'Assign a department and a role before activating this account.',
  SELF_DEACTIVATE: 'You cannot deactivate your own account.',
  SELF_ROLE: 'You cannot change your own role.',
  SELF_DELETE: 'You cannot delete your own account.',
} as const;

type Lookup = Map<string, IdName>;

async function loadLookups(): Promise<{ roles: Lookup; departments: Lookup }> {
  const [roles, departments] = await Promise.all([RoleModel.find(), DepartmentModel.find()]);
  return {
    roles: new Map(roles.map((r) => [r.id as string, { id: r.id as string, name: r.name }])),
    departments: new Map(departments.map((d) => [d.id as string, { id: d.id as string, name: d.name }])),
  };
}

function toUserDto(user: UserDocument, roles: Lookup, departments: Lookup): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    pending: !user.isActive && !user.roleId,
    role: user.roleId ? (roles.get(String(user.roleId)) ?? null) : null,
    department: user.departmentId ? (departments.get(String(user.departmentId)) ?? null) : null,
    createdAt: user.createdAt.toISOString(),
  };
}

async function toSingleUserDto(user: UserDocument): Promise<UserDto> {
  const { roles, departments } = await loadLookups();
  return toUserDto(user, roles, departments);
}

/** Accounts waiting for activation first, then newest first. */
export async function listUsers(): Promise<UserDto[]> {
  const [users, { roles, departments }] = await Promise.all([UserModel.find().sort({ createdAt: -1 }), loadLookups()]);
  const dtos = users.map((user) => toUserDto(user, roles, departments));
  return [...dtos.filter((u) => u.pending), ...dtos.filter((u) => !u.pending)];
}

/** No privilege escalation: the role's permissions must all be held by the actor. */
async function assertCanAssignRole(actor: AuthContext, roleId: string): Promise<RoleDocument> {
  const role = await RoleModel.findById(roleId);
  if (!role) throw new AppError(400, USER_MESSAGES.ROLE_NOT_FOUND);
  if (missingPermissions(role.permissions, actor.permissions).length > 0) {
    throw new AppError(403, USER_MESSAGES.NO_ESCALATION);
  }
  return role;
}

/** A user may only manage users whose permissions they hold themselves. */
async function assertCanManage(actor: AuthContext, target: UserDocument): Promise<void> {
  if (!target.roleId) return;
  const role = await RoleModel.findById(target.roleId);
  if (role && missingPermissions(role.permissions, actor.permissions).length > 0) {
    throw new AppError(403, USER_MESSAGES.OUTRANKED);
  }
}

async function assertDepartmentExists(departmentId: string): Promise<void> {
  if (!(await DepartmentModel.exists({ _id: departmentId }))) throw new AppError(400, USER_MESSAGES.DEPARTMENT_NOT_FOUND);
}

async function findUser(id: string): Promise<UserDocument> {
  const user = await UserModel.findById(id);
  if (!user) throw new AppError(404, USER_MESSAGES.NOT_FOUND);
  return user;
}

export async function createUser(actor: AuthContext, input: CreateUserInput): Promise<UserDto> {
  if (await UserModel.exists({ email: input.email })) throw new AppError(409, USER_MESSAGES.EMAIL_TAKEN);
  if (input.roleId) await assertCanAssignRole(actor, input.roleId);
  if (input.departmentId) await assertDepartmentExists(input.departmentId);
  if (input.isActive && (!input.roleId || !input.departmentId)) {
    throw new AppError(400, USER_MESSAGES.ACTIVATION_NEEDS_ROLE);
  }

  const user = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    isActive: input.isActive,
    roleId: input.roleId ?? null,
    departmentId: input.departmentId ?? null,
  });
  return toSingleUserDto(user);
}

export async function updateUser(actor: AuthContext, id: string, input: UpdateUserInput): Promise<UserDto> {
  const user = await findUser(id);
  const isSelf = user.id === actor.user.id;

  if (isSelf) {
    if (input.isActive === false) throw new AppError(400, USER_MESSAGES.SELF_DEACTIVATE);
    if (input.roleId !== undefined && input.roleId !== (user.roleId ? String(user.roleId) : null)) {
      throw new AppError(400, USER_MESSAGES.SELF_ROLE);
    }
  } else {
    await assertCanManage(actor, user);
  }
  if (input.roleId) await assertCanAssignRole(actor, input.roleId);
  if (input.departmentId) await assertDepartmentExists(input.departmentId);

  const wasActive = user.isActive;
  if (input.name !== undefined) user.name = input.name;
  if (input.roleId !== undefined) user.roleId = input.roleId ? new Types.ObjectId(input.roleId) : null;
  if (input.departmentId !== undefined) {
    user.departmentId = input.departmentId ? new Types.ObjectId(input.departmentId) : null;
  }
  if (input.isActive !== undefined) user.isActive = input.isActive;
  if (input.password !== undefined) user.passwordHash = await hashPassword(input.password);

  if (user.isActive && (!user.roleId || !user.departmentId)) {
    throw new AppError(400, USER_MESSAGES.ACTIVATION_NEEDS_ROLE);
  }
  await user.save();

  // Deactivation or a new password ends every session of that user immediately.
  if ((wasActive && !user.isActive) || input.password !== undefined) await endAllSessions(user._id);
  return toSingleUserDto(user);
}

export async function deleteUser(actor: AuthContext, id: string): Promise<void> {
  const user = await findUser(id);
  if (user.id === actor.user.id) throw new AppError(400, USER_MESSAGES.SELF_DELETE);
  await assertCanManage(actor, user);

  await user.deleteOne();
  await Promise.all([endAllSessions(user._id), PasswordResetModel.deleteMany({ userId: user._id })]);
}
