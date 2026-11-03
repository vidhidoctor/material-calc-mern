import { PRINT_SHEETS, type PrintSheet } from '@app/shared';
import { z } from 'zod';

const SHEETS = Object.keys(PRINT_SHEETS) as [PrintSheet, ...PrintSheet[]];

export const printConfigParams = z.object({ sheet: z.enum(SHEETS, { error: 'Unknown print sheet.' }) });

export const printConfigBody = z.object({
  columns: z
    .array(z.string({ error: 'Column must be text.' }).max(50, 'Column is too long.'), { error: 'Columns must be a list.' })
    .min(1, 'Choose at least one column to print.')
    .max(50, 'Too many columns.'),
  totals: z.boolean({ error: 'Totals must be yes or no.' }),
});

export type PrintConfigInput = z.infer<typeof printConfigBody>;
