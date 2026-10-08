import { PERMISSION_CODES } from '@app/shared';
import { z } from 'zod';
import { requiredName } from '../../lib/zod.js';

const permissionList = z.array(z.enum(PERMISSION_CODES, { error: 'Unknown permission.' }), {
  error: 'Permissions must be a list.',
});

export const createRoleBody = z.object({
  name: requiredName('Role name'),
  permissions: permissionList.default([]),
});

export const setPermissionsBody = z.object({
  permissions: permissionList,
});

export type CreateRoleInput = z.infer<typeof createRoleBody>;
export type SetPermissionsInput = z.infer<typeof setPermissionsBody>;
