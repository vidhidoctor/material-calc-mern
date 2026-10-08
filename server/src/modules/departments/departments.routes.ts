import { Router } from 'express';
import { guard, guardAny } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './departments.controller.js';
import { createDepartmentBody } from './departments.validation.js';

/** Mounted at /api/admin/departments. The Users screen also needs the list (USER_VIEW). */
export const departmentsRoutes = Router();

departmentsRoutes.get('/', guardAny('DEPARTMENT_MANAGE', 'USER_VIEW'), controller.list);
departmentsRoutes.post('/', guard('DEPARTMENT_MANAGE'), validate({ body: createDepartmentBody }), controller.create);
