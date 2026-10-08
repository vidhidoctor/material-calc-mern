import { z } from 'zod';
import { requiredName } from '../../lib/zod.js';

export const createDepartmentBody = z.object({
  name: requiredName('Department name'),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentBody>;
