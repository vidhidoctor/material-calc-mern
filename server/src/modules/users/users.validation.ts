import { z } from 'zod';
import { email, objectId, password, requiredName } from '../../lib/zod.js';

export const createUserBody = z.object({
  name: requiredName('Name'),
  email,
  password,
  roleId: objectId('role').nullable().optional(),
  departmentId: objectId('department').nullable().optional(),
  isActive: z.boolean({ error: 'Active must be true or false.' }).default(false),
});

export const updateUserBody = z.object({
  name: requiredName('Name').optional(),
  roleId: objectId('role').nullable().optional(),
  departmentId: objectId('department').nullable().optional(),
  isActive: z.boolean({ error: 'Active must be true or false.' }).optional(),
  password: password.optional(),
});

export type CreateUserInput = z.infer<typeof createUserBody>;
export type UpdateUserInput = z.infer<typeof updateUserBody>;
