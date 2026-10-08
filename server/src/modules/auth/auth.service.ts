import type {
  AuthUser,
  ForgotPasswordResponse,
  LoginResponse,
  MessageResponse,
  PermissionCode,
} from '@app/shared';
import type { Types } from 'mongoose';
import { getEnv } from '../../config/env.js';
import { AppError } from '../../lib/app-error.js';
import { generateToken, hashPassword, hashToken, verifyPassword } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { sortPermissions } from '../../lib/permissions.js';
import { DepartmentModel } from '../departments/department.model.js';
import { RoleModel, type RoleDocument } from '../roles/role.model.js';
import { UserModel, type UserDocument } from '../users/user.model.js';
import type { LoginInput, ResetPasswordInput, SignupInput } from './auth.validation.js';
import { PasswordResetModel } from './password-reset.model.js';
import { SessionModel } from './session.model.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

export const AUTH_MESSAGES = {
  LOGIN_REQUIRED: 'Please log in.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  AWAITING_ACTIVATION: 'Account is waiting for Admin activation.',
  ACCOUNT_INACTIVE: 'Your account is inactive.',
  FORBIDDEN: 'You do not have permission to do this.',
  EMAIL_TAKEN: 'An account with this email already exists.',
  SIGNUP_DONE: 'Account created. It is waiting for Admin activation.',
  FORGOT_DONE: 'If an account exists for this email, a password reset link has been sent.',
  RESET_INVALID: 'This reset link is invalid or has expired.',
  RESET_DONE: 'Your password has been reset. Please log in.',
} as const;

export interface AuthContext {
  user: UserDocument;
  role: RoleDocument | null;
  permissions: Set<PermissionCode>;
  tokenHash: string;
}

export async function endAllSessions(userId: Types.ObjectId | string): Promise<void> {
  await SessionModel.deleteMany({ userId });
}

export async function toAuthUser(user: UserDocument, role?: RoleDocument | null): Promise<AuthUser> {
  const [resolvedRole, department] = await Promise.all([
    role !== undefined ? role : user.roleId ? RoleModel.findById(user.roleId) : null,
    user.departmentId ? DepartmentModel.findById(user.departmentId) : null,
  ]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: resolvedRole ? { id: resolvedRole.id, name: resolvedRole.name } : null,
    department: department ? { id: department.id, name: department.name } : null,
    permissions: sortPermissions(resolvedRole?.permissions ?? []),
  };
}

export async function signup(input: SignupInput): Promise<MessageResponse> {
  if (await UserModel.exists({ email: input.email })) throw new AppError(409, AUTH_MESSAGES.EMAIL_TAKEN);
  await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    isActive: false,
  });
  return { message: AUTH_MESSAGES.SIGNUP_DONE };
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  const user = await UserModel.findOne({ email: input.email });
  if (!user) {
    await hashPassword(input.password); // similar timing for unknown emails
    throw new AppError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
  }
  if (!user.isActive || !user.roleId) throw new AppError(403, AUTH_MESSAGES.AWAITING_ACTIVATION);

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await SessionModel.create({ tokenHash: hashToken(token), userId: user._id, expiresAt });
  return { token, expiresAt: expiresAt.toISOString(), user: await toAuthUser(user) };
}

export async function logout(tokenHash: string): Promise<void> {
  await SessionModel.deleteOne({ tokenHash });
}

/** Loads the session's user, role and permissions fresh from the database. */
export async function resolveSession(token: string): Promise<AuthContext> {
  const tokenHash = hashToken(token);
  const session = await SessionModel.findOne({ tokenHash, expiresAt: { $gt: new Date() } });
  if (!session) throw new AppError(401, AUTH_MESSAGES.SESSION_EXPIRED);

  const user = await UserModel.findById(session.userId);
  if (!user) throw new AppError(401, AUTH_MESSAGES.SESSION_EXPIRED);
  if (!user.isActive) throw new AppError(403, AUTH_MESSAGES.ACCOUNT_INACTIVE);

  const role = user.roleId ? await RoleModel.findById(user.roleId) : null;
  return { user, role, permissions: new Set(sortPermissions(role?.permissions ?? [])), tokenHash };
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  const response: ForgotPasswordResponse = { message: AUTH_MESSAGES.FORGOT_DONE };
  const user = await UserModel.findOne({ email });
  if (!user) return response;

  const token = generateToken();
  await PasswordResetModel.create({
    tokenHash: hashToken(token),
    userId: user._id,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  // No email service yet: the token is logged, and returned outside production.
  logger.info(`[auth] Password reset token for ${user.email}: ${token}`);
  if (getEnv().NODE_ENV !== 'production') response.devResetToken = token;
  return response;
}

export async function resetPassword(input: ResetPasswordInput): Promise<MessageResponse> {
  const now = new Date();
  // Atomically claim the token so it can only be used once.
  const reset = await PasswordResetModel.findOneAndUpdate(
    { tokenHash: hashToken(input.token), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  );
  if (!reset) throw new AppError(400, AUTH_MESSAGES.RESET_INVALID);

  const user = await UserModel.findById(reset.userId);
  if (!user) throw new AppError(400, AUTH_MESSAGES.RESET_INVALID);

  user.passwordHash = await hashPassword(input.password);
  await user.save();
  await PasswordResetModel.updateMany({ userId: user._id, usedAt: null }, { $set: { usedAt: now } });
  await endAllSessions(user._id);
  return { message: AUTH_MESSAGES.RESET_DONE };
}
