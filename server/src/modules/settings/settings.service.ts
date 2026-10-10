import { ADMIN_ROLE, type AdminEmailDto, type SettingsDto } from '@app/shared';
import { AppError } from '../../lib/app-error.js';
import { hashPassword } from '../../lib/crypto.js';
import { missingPermissions } from '../../lib/permissions.js';
import { endAllSessions, type AuthContext } from '../auth/auth.service.js';
import { DepartmentModel } from '../departments/department.model.js';
import { RoleModel, type RoleDocument } from '../roles/role.model.js';
import { UserModel } from '../users/user.model.js';
import { loadSettings, SETTINGS_ID, SettingsModel, type AdminEmailEntry } from './settings.model.js';
import type { AddAdminEmailInput } from './settings.validation.js';

export const SETTINGS_MESSAGES = {
  ALREADY_LISTED: 'This email is already in the admin list.',
  NOT_LISTED: 'This email is not in the admin list.',
  PASSWORD_REQUIRED: 'Enter a temporary password: there is no account for this email yet.',
  NO_ESCALATION: 'Only someone with every Admin permission can add admins.',
  PRIMARY: 'The primary Admin (from server/.env) cannot be removed here.',
  SELF: 'You cannot remove yourself from the admin list.',
  NO_ADMIN_ROLE: 'The Admin role does not exist. Run the seed first.',
} as const;

const ADMIN_DEPARTMENT = 'Administration';

async function adminRole(): Promise<RoleDocument> {
  const role = await RoleModel.findOne({ name: ADMIN_ROLE });
  if (!role) throw new AppError(500, SETTINGS_MESSAGES.NO_ADMIN_ROLE);
  return role;
}

async function toAdminEmailDtos(entries: readonly AdminEmailEntry[]): Promise<AdminEmailDto[]> {
  const [users, role] = await Promise.all([
    UserModel.find({ email: { $in: entries.map((e) => e.email) } }),
    RoleModel.findOne({ name: ADMIN_ROLE }),
  ]);
  const byEmail = new Map(users.map((u) => [u.email, u]));
  return entries.map((entry) => {
    const user = byEmail.get(entry.email);
    return {
      email: entry.email,
      name: entry.name,
      primary: entry.primary,
      account: user
        ? { id: user.id as string, isActive: user.isActive, isAdmin: !!role && String(user.roleId) === role.id }
        : null,
      addedAt: entry.addedAt.toISOString(),
      addedBy: entry.addedBy,
    };
  });
}

export async function getSettings(): Promise<SettingsDto> {
  const settings = await loadSettings();
  return { adminEmails: await toAdminEmailDtos(settings.adminEmails) };
}

/**
 * Adds an admin email: creates an active Admin account with the temporary password, or promotes
 * the existing account (its password is only replaced when one is given).
 */
export async function addAdminEmail(actor: AuthContext, input: AddAdminEmailInput): Promise<SettingsDto> {
  const role = await adminRole();
  if (missingPermissions(role.permissions, actor.permissions).length > 0) throw new AppError(403, SETTINGS_MESSAGES.NO_ESCALATION);

  const settings = await loadSettings();
  if (settings.adminEmails.some((e) => e.email === input.email)) throw new AppError(409, SETTINGS_MESSAGES.ALREADY_LISTED);

  const department = await DepartmentModel.findOne({ name: ADMIN_DEPARTMENT });
  const existing = await UserModel.findOne({ email: input.email });
  if (existing) {
    existing.roleId = role._id;
    existing.departmentId ??= department?._id ?? null;
    existing.isActive = true;
    if (input.password) existing.passwordHash = await hashPassword(input.password);
    await existing.save();
    if (input.password) await endAllSessions(existing._id);
  } else {
    if (!input.password) throw new AppError(400, SETTINGS_MESSAGES.PASSWORD_REQUIRED);
    await UserModel.create({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      isActive: true,
      roleId: role._id,
      departmentId: department?._id ?? null,
    });
  }

  await SettingsModel.updateOne(
    { _id: SETTINGS_ID },
    { $push: { adminEmails: { email: input.email, name: input.name, primary: false, addedAt: new Date(), addedBy: actor.user.email } } },
  );
  return getSettings();
}

/** Removes an admin email: that account loses the Admin role, is deactivated and logged out. */
export async function removeAdminEmail(actor: AuthContext, email: string): Promise<SettingsDto> {
  const settings = await loadSettings();
  const entry = settings.adminEmails.find((e) => e.email === email);
  if (!entry) throw new AppError(404, SETTINGS_MESSAGES.NOT_LISTED);
  if (entry.primary) throw new AppError(400, SETTINGS_MESSAGES.PRIMARY);
  if (email === actor.user.email) throw new AppError(400, SETTINGS_MESSAGES.SELF);

  const [role, user] = await Promise.all([adminRole(), UserModel.findOne({ email })]);
  if (user && String(user.roleId) === role.id) {
    user.roleId = null;
    user.isActive = false;
    await user.save();
    await endAllSessions(user._id);
  }
  await SettingsModel.updateOne({ _id: SETTINGS_ID }, { $pull: { adminEmails: { email } } });
  return getSettings();
}

/** Seed helper: records the primary Admin email (from server/.env) in the list. */
export async function ensurePrimaryAdminEmail(email: string, name: string): Promise<boolean> {
  const settings = await loadSettings();
  const existing = settings.adminEmails.find((e) => e.email === email);
  if (existing?.primary) return false;
  if (existing) {
    await SettingsModel.updateOne({ _id: SETTINGS_ID, 'adminEmails.email': email }, { $set: { 'adminEmails.$.primary': true } });
  } else {
    await SettingsModel.updateOne(
      { _id: SETTINGS_ID },
      { $push: { adminEmails: { email, name, primary: true, addedAt: new Date(), addedBy: null } } },
    );
  }
  return true;
}
