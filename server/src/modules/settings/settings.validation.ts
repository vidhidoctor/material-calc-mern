import { z } from 'zod';
import { email, password, requiredName } from '../../lib/zod.js';

export const addAdminEmailBody = z.object({
  email,
  name: requiredName('Name'),
  /** Required when no account exists yet for this email; ignored-if-empty otherwise. */
  password: z.preprocess((value) => (value === '' || value === null ? undefined : value), password.optional()),
});

export const adminEmailParams = z.object({ email });

export type AddAdminEmailInput = z.infer<typeof addAdminEmailBody>;
