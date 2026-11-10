import { PRINT_SHEETS, type PrintConfigDto, type PrintSheet } from '@app/shared';
import { AppError } from '../../lib/app-error.js';
import { PrintConfigModel } from './print-config.model.js';
import type { PrintConfigInput } from './print-config.validation.js';

export const PRINT_CONFIG_MESSAGES = {
  unknownColumn: (column: string) => `Unknown column ${column}.`,
} as const;

/** The sheet's saved columns, in table order; its defaults until a Manager saves some. */
export async function getPrintConfig(sheet: PrintSheet): Promise<PrintConfigDto> {
  const saved = await PrintConfigModel.findOne({ sheet });
  const { columns: known, defaults } = PRINT_SHEETS[sheet];
  const columns = known.filter((id) => saved?.columns.includes(id));
  if (!saved || columns.length === 0) return { sheet, columns: [...defaults.columns], totals: defaults.totals, materials: [...defaults.materials], savedAt: null, savedBy: null };
  return { sheet, columns, totals: saved.totals, materials: [...(saved.materials ?? [])], savedAt: saved.updatedAt.toISOString(), savedBy: saved.updatedBy };
}

export async function savePrintConfig(sheet: PrintSheet, input: PrintConfigInput, actorEmail: string): Promise<PrintConfigDto> {
  const { columns: known } = PRINT_SHEETS[sheet];
  const unknown = input.columns.find((id) => !known.includes(id));
  if (unknown !== undefined) throw new AppError(400, PRINT_CONFIG_MESSAGES.unknownColumn(unknown));
  await PrintConfigModel.updateOne(
    { sheet },
    { $set: { columns: known.filter((id) => input.columns.includes(id)), totals: input.totals, materials: [...new Set(input.materials)], updatedAt: new Date(), updatedBy: actorEmail } },
    { upsert: true },
  );
  return getPrintConfig(sheet);
}
