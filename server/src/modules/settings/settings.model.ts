import { model, Schema, type HydratedDocument } from 'mongoose';

export interface AdminEmailEntry {
  email: string;
  name: string;
  primary: boolean;
  addedAt: Date;
  /** Email of the admin who added it (null for the seed). */
  addedBy: string | null;
}

/** Single document (_id "global") holding the global config. */
export interface Settings {
  _id: string;
  adminEmails: AdminEmailEntry[];
  /** When the business rate sheet was applied (db/rate-sheet.ts); null = not yet. */
  rateSheetAppliedAt?: Date | null;
  /** When the cording sheet (PC / Moti cord) was applied. */
  cordSheetAppliedAt?: Date | null;
  /** When Punching's component list was first filled (defaults + components already used). */
  componentNamesSeededAt?: Date | null;
}

const adminEmailSchema = new Schema<AdminEmailEntry>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    primary: { type: Boolean, default: false },
    addedAt: { type: Date, default: () => new Date() },
    addedBy: { type: String, default: null },
  },
  { _id: false },
);

const settingsSchema = new Schema<Settings>(
  {
    _id: { type: String, required: true },
    adminEmails: { type: [adminEmailSchema], default: [] },
    rateSheetAppliedAt: { type: Date, default: null },
    cordSheetAppliedAt: { type: Date, default: null },
    componentNamesSeededAt: { type: Date, default: null },
  },
  { versionKey: false },
);

export const SETTINGS_ID = 'global';
export const SettingsModel = model<Settings>('Settings', settingsSchema, 'settings');
export type SettingsDocument = HydratedDocument<Settings>;

/** The global settings document, created on first use. */
export async function loadSettings(): Promise<SettingsDocument> {
  return SettingsModel.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $setOnInsert: { adminEmails: [] } },
    { upsert: true, new: true },
  ) as Promise<SettingsDocument>;
}
