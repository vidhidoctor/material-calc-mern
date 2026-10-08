import { z } from 'zod';

export const objectId = (label = 'id') =>
  z.string({ error: `Invalid ${label}.` }).regex(/^[a-f\d]{24}$/i, `Invalid ${label}.`);

export const idParams = z.object({ id: objectId() });

export const email = z
  .string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Please enter a valid email.'));

export const password = z
  .string({ error: 'Password is required.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(200, 'Password is too long.');

export const requiredName = (label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(100, `${label} is too long.`);
