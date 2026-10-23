import type { ComponentNameDto } from '@app/shared';
import { AppError } from '../../lib/app-error.js';
import { DesignModel } from '../designs/design.model.js';
import { SettingsModel, SETTINGS_ID } from '../settings/settings.model.js';
import { ComponentNameModel } from './component-name.model.js';

export const COMPONENT_NAME_MESSAGES = {
  taken: (name: string) => `${name} is already in the list.`,
  notFound: (name: string) => `${name} is not in the list.`,
} as const;

/** The components Punching offers before an Admin has changed anything. */
export const DEFAULT_COMPONENT_NAMES = ['FROCK', 'KALI', 'BLOUSE', 'BELT', 'GALISH'] as const;

/** How many designs use each component name. */
async function designCounts(): Promise<Map<string, number>> {
  const rows = await DesignModel.aggregate<{ _id: string; count: number }>([
    { $unwind: '$components' },
    { $group: { _id: '$components.name', designs: { $addToSet: '$_id' } } },
    { $project: { count: { $size: '$designs' } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.count]));
}

/** The list in its order, with how many designs use each name. */
export async function listComponentNames(): Promise<ComponentNameDto[]> {
  const [names, counts] = await Promise.all([ComponentNameModel.find().sort({ sortOrder: 1, name: 1 }), designCounts()]);
  return names.map((n) => ({ name: n.name, designCount: counts.get(n.name) ?? 0 }));
}

async function nextSortOrder(): Promise<number> {
  const last = await ComponentNameModel.findOne().sort({ sortOrder: -1 });
  return last ? last.sortOrder + 1 : 0;
}

export async function addComponentName(name: string): Promise<ComponentNameDto[]> {
  if (await ComponentNameModel.exists({ name })) throw new AppError(409, COMPONENT_NAME_MESSAGES.taken(name));
  await ComponentNameModel.create({ name, sortOrder: await nextSortOrder() });
  return listComponentNames();
}

/** Removes a name from the dropdown only; designs that use it keep their component. */
export async function deleteComponentName(name: string): Promise<ComponentNameDto[]> {
  const result = await ComponentNameModel.deleteOne({ name });
  if (result.deletedCount === 0) throw new AppError(404, COMPONENT_NAME_MESSAGES.notFound(name));
  return listComponentNames();
}

/** A name typed under "Other…" in Punching joins the list, so it is offered next time. */
export async function rememberComponentName(name: string): Promise<void> {
  if (await ComponentNameModel.exists({ name })) return;
  await ComponentNameModel.updateOne({ name }, { $setOnInsert: { name, sortOrder: await nextSortOrder(), createdAt: new Date() } }, { upsert: true });
}

/**
 * First start with this feature: the default names plus every component already used in a design.
 * Runs once (marker in settings); afterwards the list is only changed by Admin or by Punching.
 */
export async function seedComponentNames(): Promise<number> {
  const settings = await SettingsModel.findOneAndUpdate({ _id: SETTINGS_ID }, { $setOnInsert: { adminEmails: [] } }, { upsert: true, new: true });
  if (settings.componentNamesSeededAt) return 0;
  const used = (await designCounts()).keys();
  let added = 0;
  for (const name of new Set([...DEFAULT_COMPONENT_NAMES, ...used])) {
    if (await ComponentNameModel.exists({ name })) continue;
    await ComponentNameModel.create({ name, sortOrder: await nextSortOrder() });
    added++;
  }
  await SettingsModel.updateOne({ _id: SETTINGS_ID }, { $set: { componentNamesSeededAt: new Date() } });
  return added;
}
