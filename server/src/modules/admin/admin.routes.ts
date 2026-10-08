import { Router } from 'express';
import { departmentsRoutes } from '../departments/departments.routes.js';
import { permissionsRoutes, rolesRoutes } from '../roles/roles.routes.js';
import { usersRoutes } from '../users/users.routes.js';

/** Mounted at /api/admin. Each sub-router guards its own routes by permission. */
export const adminRoutes = Router();

adminRoutes.use('/users', usersRoutes);
adminRoutes.use('/roles', rolesRoutes);
adminRoutes.use('/permissions', permissionsRoutes);
adminRoutes.use('/departments', departmentsRoutes);
