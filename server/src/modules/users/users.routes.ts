import { Router } from 'express';
import { idParams } from '../../lib/zod.js';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';
import { createUserBody, updateUserBody } from './users.validation.js';

/** Mounted at /api/admin/users. */
export const usersRoutes = Router();

usersRoutes.get('/', guard('USER_VIEW'), controller.list);
usersRoutes.post('/', guard('USER_CREATE'), validate({ body: createUserBody }), controller.create);
usersRoutes.patch('/:id', guard('USER_UPDATE'), validate({ params: idParams, body: updateUserBody }), controller.update);
usersRoutes.delete('/:id', guard('USER_DELETE'), validate({ params: idParams }), controller.remove);
