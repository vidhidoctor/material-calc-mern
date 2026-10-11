import { z } from 'zod';

export const rateKeyParams = z.object({
  key: z.string({ error: 'Invalid material.' }).trim().min(1, 'Invalid material.').max(80, 'Invalid material.'),
});

export const setRateBody = z.object({
  basicRate: z
    .number({ error: 'Basic rate must be a number.' })
    .min(0, 'Basic rate cannot be negative.')
    .max(10_000_000, 'Basic rate is too large.'),
  gstPercent: z.number({ error: 'GST % must be a number.' }).min(0, 'GST % cannot be negative.').max(100, 'GST % cannot be more than 100.'),
});

export type SetRateInput = z.infer<typeof setRateBody>;
