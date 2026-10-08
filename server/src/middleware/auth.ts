import type { PermissionCode } from '@app/shared';
import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/app-error.js';
import { AUTH_MESSAGES, resolveSession, type AuthContext } from '../modules/auth/auth.service.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/** Bearer token → session → fresh user, role and permissions on every request. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
  if (!match?.[1]) throw new AppError(401, AUTH_MESSAGES.LOGIN_REQUIRED);
  req.auth = await resolveSession(match[1]);
  next();
};

export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw new AppError(401, AUTH_MESSAGES.LOGIN_REQUIRED);
  return req.auth;
}

/** Requires ALL of the given permissions. */
export function requirePermission(...codes: PermissionCode[]): RequestHandler {
  return (req, _res, next) => {
    const { permissions } = getAuth(req);
    if (!codes.every((code) => permissions.has(code))) throw new AppError(403, AUTH_MESSAGES.FORBIDDEN);
    next();
  };
}

/** Requires AT LEAST ONE of the given permissions. */
export function requireAnyPermission(...codes: PermissionCode[]): RequestHandler {
  return (req, _res, next) => {
    const { permissions } = getAuth(req);
    if (!codes.some((code) => permissions.has(code))) throw new AppError(403, AUTH_MESSAGES.FORBIDDEN);
    next();
  };
}

/** authenticate + requirePermission(...codes). */
export function guard(...codes: PermissionCode[]): RequestHandler[] {
  return [authenticate, requirePermission(...codes)];
}

/** authenticate + requireAnyPermission(...codes). */
export function guardAny(...codes: PermissionCode[]): RequestHandler[] {
  return [authenticate, requireAnyPermission(...codes)];
}
