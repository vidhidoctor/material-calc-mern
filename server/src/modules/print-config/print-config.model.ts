import type { PrintSheet } from '@app/shared';
import { model, Schema } from 'mongoose';

/** The columns one printed costing sheet shows, for everyone who prints it (one record per sheet, not per design). */
export interface PrintConfig {
  sheet: PrintSheet;
  columns: string[];
  totals: boolean;
  /** Material columns printed separately (keys such as "SEQ-3MM|WHITE"); missing on settings saved before it existed. */
  materials?: string[];
  updatedAt: Date;
  updatedBy: string;
}

const printConfigSchema = new Schema<PrintConfig>(
  {
    sheet: { type: String, required: true, unique: true },
    columns: { type: [String], required: true },
    totals: { type: Boolean, required: true },
    materials: { type: [String], default: undefined },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false },
);

export const PrintConfigModel = model<PrintConfig>('PrintConfig', printConfigSchema, 'printConfigs');
