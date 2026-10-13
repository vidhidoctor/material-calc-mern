// The rate sheets supplied by the business (KHATLI 1 PC rate + SEQ 1 roll rate, 2026-10-12).
// Applied once (first API start, or `npm run seed:rates -- --force`); afterwards everything is
// edited in Material Master (materials, categories/types, Rates & costs) and never overwritten.
import { normalizeType } from '@app/shared';
import { MaterialRateModel } from '../modules/costing/material-rate.model.js';
import { MaterialCategoryModel } from '../modules/material-categories/material-category.model.js';
import { MaterialModel } from '../modules/materials/material.model.js';
import { SettingsModel, SETTINGS_ID } from '../modules/settings/settings.model.js';

interface SheetMaterial {
  /** Code used when the material does not exist yet. */
  code: string;
  /** Codes it may already have (e.g. from earlier data entry). */
  aliases: string[];
  name: string;
  category: 'BEAD' | 'SEQUENCE';
  rules: Record<string, number>;
  /** Rate per KG + GST (beads); sequences are priced by type. */
  rate?: { basicRate: number; gstPercent: number };
}

export const RATE_SHEET_MATERIALS: SheetMaterial[] = [
  // KHATLI ALL MATERIAL 1 PC RATE WITH GST — rate per KG, 12% GST, pieces per KG
  { code: '2-MM-BEAD', aliases: ['BEAD-2MM', 'BEAD-2MM-A', '2MM-BEAD'], name: '2 MM Bead', category: 'BEAD', rules: { pcsPerKg: 80000 }, rate: { basicRate: 900, gstPercent: 12 } },
  { code: '2.5-MM-BEAD', aliases: ['BEAD-2.5MM', '2.5MM-BEAD'], name: '2.5 MM Bead', category: 'BEAD', rules: { pcsPerKg: 70000 }, rate: { basicRate: 650, gstPercent: 12 } },
  { code: '3-MM-MOTI', aliases: ['MOTI-3MM', '3MM-MOTI'], name: '3 MM Moti', category: 'BEAD', rules: { pcsPerKg: 45000 }, rate: { basicRate: 1100, gstPercent: 12 } },
  { code: '4-MM-PIPE', aliases: ['PIPE-4MM', '4MM-PIPE'], name: '4 MM Pipe', category: 'BEAD', rules: { pcsPerKg: 35000 }, rate: { basicRate: 600, gstPercent: 12 } },
  { code: '7-MM-ZARDOSHI', aliases: ['ZARDOSHI-7MM', '7MM-ZARDOSHI'], name: '7 MM Zardoshi', category: 'BEAD', rules: { pcsPerKg: 45000 }, rate: { basicRate: 3500, gstPercent: 12 } },
  // SEQUENCE — TOTAL CD (per roll), CD/ROUND, SEQ/CD
  { code: 'SEQ-3MM', aliases: ['3-MM-SEQ', '3MM-SEQ'], name: '3 MM Sequence', category: 'SEQUENCE', rules: { seqPerCd: 31600, cdPerRoll: 210, cdPerRound: 42 } },
  { code: 'SEQ-4MM', aliases: ['4-MM-SEQ', '4MM-SEQ'], name: '4 MM Sequence', category: 'SEQUENCE', rules: { seqPerCd: 23725, cdPerRoll: 165, cdPerRound: 33 } },
  { code: 'SEQ-7MM', aliases: ['7-MM-SEQ', '7MM-SEQ'], name: '7 MM Sequence', category: 'SEQUENCE', rules: { seqPerCd: 13550, cdPerRoll: 100, cdPerRound: 20 } },
  { code: 'SEQ-9MM', aliases: ['9-MM-SEQ', '9MM-SEQ'], name: '9 MM Sequence', category: 'SEQUENCE', rules: { seqPerCd: 10500, cdPerRoll: 70, cdPerRound: 14 } },
];

/** ALL SEQ MATERIAL 1 ROLL RATE WITH GST — roll + job, 5% GST; one rate per type for every size. */
export const RATE_SHEET_SEQUENCE_TYPES: { type: string; basicRate: number; gstPercent: number }[] = [
  { type: 'PURE GLASS', basicRate: 8000, gstPercent: 5 },
  { type: 'COLOR GLASS', basicRate: 9500, gstPercent: 5 },
  { type: 'OPQ', basicRate: 2500, gstPercent: 5 },
  { type: 'METAL', basicRate: 2500, gstPercent: 5 },
  { type: 'MATT', basicRate: 2500, gstPercent: 5 },
  { type: 'SPARKLE', basicRate: 5000, gstPercent: 5 },
];

const BY = 'rate sheet';

/**
 * Applies the rate sheet. Without `force` it runs only once (remembered in settings). Requires the
 * default categories (run after runStartupMigrations). Returns a line per change.
 */
export async function applyRateSheet({ force = false }: { force?: boolean } = {}): Promise<string[]> {
  const settings = await SettingsModel.findOneAndUpdate({ _id: SETTINGS_ID }, { $setOnInsert: { adminEmails: [] } }, { upsert: true, new: true });
  if (settings.rateSheetAppliedAt && !force) return [];

  const log: string[] = [];
  const last = await MaterialModel.findOne().sort({ sortOrder: -1 });
  let sortOrder = last ? last.sortOrder + 1 : 0;

  for (const m of RATE_SHEET_MATERIALS) {
    const existing = await MaterialModel.findOne({ code: { $in: [m.code, ...m.aliases] } });
    let code = m.code;
    if (existing) {
      code = existing.code;
      existing.set({ category: m.category, rules: { ...m.rules } });
      existing.markModified('rules');
      await existing.save();
      log.push(`Material ${code}: updated from the rate sheet`);
    } else {
      await MaterialModel.create({ code: m.code, name: m.name, category: m.category, sortOrder: sortOrder++, rules: { ...m.rules } });
      log.push(`Material ${code}: created from the rate sheet`);
    }
    if (m.rate) {
      await MaterialRateModel.updateOne(
        { key: code },
        { $set: { ...m.rate, updatedAt: new Date(), updatedBy: BY } },
        { upsert: true },
      );
    }
  }

  // Sequence types: add the sheet's types (keeps any others) and set their rates.
  const sequence = await MaterialCategoryModel.findOne({ code: 'SEQUENCE' });
  if (sequence) {
    const types = [...(sequence.types ?? [])];
    for (const { type } of RATE_SHEET_SEQUENCE_TYPES) if (!types.includes(type)) types.push(type);
    sequence.types = types;
    await sequence.save();
    for (const t of RATE_SHEET_SEQUENCE_TYPES) {
      await MaterialRateModel.updateOne(
        { key: `@SEQUENCE^${normalizeType(t.type)}` },
        { $set: { basicRate: t.basicRate, gstPercent: t.gstPercent, updatedAt: new Date(), updatedBy: BY } },
        { upsert: true },
      );
    }
    log.push(`Sequence types: ${RATE_SHEET_SEQUENCE_TYPES.map((t) => t.type).join(', ')} with their roll rates`);
  }

  await SettingsModel.updateOne({ _id: SETTINGS_ID }, { $set: { rateSheetAppliedAt: new Date() } });
  return log;
}

/** CORDING DENIER-MTR-WEIGHT DETAIL: cord denier and rate per KG (no GST on the sheet). */
export const CORD_SHEET: { code: string; aliases: string[]; name: string; denier: number; ratePerKg: number }[] = [
  { code: 'PC-CORD', aliases: ['CORD-PC', 'PCCORD'], name: 'PC Cord', denier: 1250, ratePerKg: 550 },
  { code: 'MOTI-CORD', aliases: ['CORD-MOTI', 'MOTICORD'], name: 'Moti Cord', denier: 1850, ratePerKg: 550 },
];

/** Applies the cording sheet once (or again with force); later edits are kept. */
export async function applyCordSheet({ force = false }: { force?: boolean } = {}): Promise<string[]> {
  const settings = await SettingsModel.findOneAndUpdate({ _id: SETTINGS_ID }, { $setOnInsert: { adminEmails: [] } }, { upsert: true, new: true });
  if (settings.cordSheetAppliedAt && !force) return [];
  const log: string[] = [];
  const last = await MaterialModel.findOne().sort({ sortOrder: -1 });
  let sortOrder = last ? last.sortOrder + 1 : 0;
  for (const c of CORD_SHEET) {
    const existing = await MaterialModel.findOne({ code: { $in: [c.code, ...c.aliases] } });
    let code = c.code;
    if (existing) {
      code = existing.code;
      existing.set({ category: 'CORD', rules: { denier: c.denier } });
      existing.markModified('rules');
      await existing.save();
      log.push(`Material ${code}: updated from the cording sheet`);
    } else {
      await MaterialModel.create({ code: c.code, name: c.name, category: 'CORD', sortOrder: sortOrder++, rules: { denier: c.denier } });
      log.push(`Material ${code}: created from the cording sheet`);
    }
    await MaterialRateModel.updateOne(
      { key: code },
      { $set: { basicRate: c.ratePerKg, gstPercent: 0, updatedAt: new Date(), updatedBy: BY } },
      { upsert: true },
    );
  }
  await SettingsModel.updateOne({ _id: SETTINGS_ID }, { $set: { cordSheetAppliedAt: new Date() } });
  return log;
}
