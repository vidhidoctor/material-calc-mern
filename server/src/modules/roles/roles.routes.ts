import { Router } from 'express';
import { idParams } from '../../lib/zod.js';
import { guard, guardAny } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './roles.controller.js';
import { createRoleBody, setPermissionsBody } from './roles.validation.js';

/** Mounted at /api/admin/roles. The Users screen also needs the role list (USER_VIEW). */
export const rolesRoutes = Router();

rolesRoutes.get('/', guardAny('ROLE_MANAGE', 'PERMISSION_MANAGE', 'USER_VIEW'), controller.list);
rolesRoutes.post('/', guard('ROLE_MANAGE'), validate({ body: createRoleBody }), controller.create);
rolesRoutes.put(
  '/:id/permissions',
  guard('PERMISSION_MANAGE'),
  validate({ params: idParams, body: setPermissionsBody }),
  controller.setPermissions,
);

/** Mounted at /api/admin/permissions. */
export const permissionsRoutes = Router();

permissionsRoutes.get('/', guardAny('ROLE_MANAGE', 'PERMISSION_MANAGE'), controller.listPermissions);
