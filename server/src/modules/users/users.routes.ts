import { Router } from 'express';
import { idParams } from '../../lib/zod.js';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';
import { createUserBody, updateUserBody } from './users.validation.js';
import { audited, param } from '../audit/audit.middleware.js';

/** Mounted at /api/admin/users. */
export const usersRoutes = Router();

usersRoutes.get('/', guard('USER_VIEW'), controller.list);
usersRoutes.post(
  '/',
  guard('USER_CREATE'),
  validate({ body: createUserBody }),
  audited({ action: 'USER_CREATED', entity: 'User', id: (_req, body) => (body as { id?: unknown } | undefined)?.id as string | undefined, extra: () => [{ field: 'password', from: null, to: '••• (set)' }] }),
  controller.create,
);
usersRoutes.patch(
  '/:id',
  guard('USER_UPDATE'),
  validate({ params: idParams, body: updateUserBody }),
  audited({
    action: 'USER_UPDATED',
    entity: 'User',
    id: param('id'),
    extra: (req) => ((req.body as { password?: string }).password ? [{ field: 'password', from: '•••', to: '••• (changed)' }] : []),
  }),
  controller.update,
);
usersRoutes.delete('/:id', guard('USER_DELETE'), validate({ params: idParams }), audited({ action: 'USER_DELETED', entity: 'User', id: param('id') }), controller.remove);
