import {
  COLOR_PATTERN,
  parseVariantKey,
  sortVariantKeys,
  variantKey,
  type Consumption,
  type DesignDetailDto,
  type DesignDto,
  type DesignListItemDto,
} from '@app/shared';
import { AppError } from '../../lib/app-error.js';
import { listMaterialColumns } from '../materials/materials.service.js';
import { MaterialModel } from '../materials/material.model.js';
import { OrderModel, orderLabel } from '../orders/order.model.js';
import {
  DesignModel,
  type ConsumptionItem,
  type Design,
  type DesignComponent,
  type DesignDocument,
  type DesignSize,
} from './design.model.js';
import type { CreateDesignInput, PutComponentInput, UpdateDesignInput } from './designs.validation.js';

export const DESIGN_MESSAGES = {
  notFound: (designNo: string) => `Design ${designNo} not found.`,
  exists: (designNo: string) => `Design ${designNo} already exists.`,
  componentNotFound: (name: string) => `Component ${name} not found in this design.`,
  unknownMaterial: (code: string) => `Unknown material ${code}.`,
  badColor: (color: string) => `Colour “${color}” may only contain letters, numbers, spaces, dots, dashes, & and /.`,
  sizeInUse: (component: string, size: string, order: string) =>
    `${component} size ${size} is used by order ${order} and cannot be removed.`,
  componentInUse: (component: string, order: string) =>
    `${component} is used by order ${order} and cannot be removed.`,
  designInUse: (designNo: string, order: string) =>
    `Design ${designNo} is used by order ${order} and cannot be deleted.`,
  renameInUse: (designNo: string, order: string) =>
    `Design ${designNo} is used by order ${order}, so its number cannot be changed.`,
} as const;

/** Upper-case, no spaces or dashes: "26 - 49" and "2649" both match "26-49". */
export function toSearchKey(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Consumption keyed by variant key ("SEQ-3MM" or "SEQ-3MM|WHITE"). */
export function toConsumption(items: readonly ConsumptionItem[]): Consumption {
  return Object.fromEntries(items.map((item) => [variantKey(item.material, item.color), item.qty]));
}

/** The component's chosen columns; older components fall back to the columns they use. */
export function selectedColumns(component: DesignComponent): string[] {
  if (component.materials) return [...component.materials];
  const used: string[] = [];
  for (const size of component.sizes) {
    for (const item of size.consumption) {
      const key = variantKey(item.material, item.color);
      if (!used.includes(key)) used.push(key);
    }
  }
  return used;
}

export function toDesignDto(design: Design): DesignDto {
  return {
    designNo: design.designNo,
    productName: design.productName,
    createdAt: design.createdAt.toISOString(),
    components: design.components.map((component) => ({
      name: component.name,
      columns: selectedColumns(component),
      sizes: component.sizes.map((size) => ({
        size: size.size,
        stitch: size.stitch,
        laser: size.laser ?? null,
        consumption: toConsumption(size.consumption),
      })),
    })),
  };
}

export function toDesignListItem(design: Design): DesignListItemDto {
  return {
    designNo: design.designNo,
    productName: design.productName,
    createdAt: design.createdAt.toISOString(),
    components: design.components.map((c) => ({ name: c.name, sizes: c.sizes.map((s) => s.size) })),
  };
}

/** (component, size) → current per-piece consumption, or null when the design has no such row. */
export function consumptionLookup(design: Design | null): (component: string, size: string) => Consumption | null {
  const index = new Map<string, Consumption>();
  for (const component of design?.components ?? []) {
    for (const size of component.sizes) index.set(`${component.name}\u0000${size.size}`, toConsumption(size.consumption));
  }
  return (component, size) => index.get(`${component}\u0000${size}`) ?? null;
}

export async function findDesign(designNo: string): Promise<DesignDocument> {
  const design = await DesignModel.findOne({ designNo });
  if (!design) throw new AppError(404, DESIGN_MESSAGES.notFound(designNo));
  return design;
}

/** Designs whose number contains the search (ignoring case, spaces and dashes), newest first. */
export async function searchDesigns(q: string | undefined, filter: Record<string, unknown> = {}): Promise<DesignDocument[]> {
  const key = q ? toSearchKey(q) : '';
  const query = key ? { ...filter, searchKey: { $regex: escapeRegex(key) } } : filter;
  return DesignModel.find(query).sort({ createdAt: -1 });
}

export async function listDesigns(q?: string): Promise<DesignListItemDto[]> {
  return (await searchDesigns(q)).map(toDesignListItem);
}

export async function createDesign(input: CreateDesignInput): Promise<DesignDetailDto> {
  if (await DesignModel.exists({ designNo: input.designNo })) throw new AppError(409, DESIGN_MESSAGES.exists(input.designNo));
  const design = await DesignModel.create({
    designNo: input.designNo,
    searchKey: toSearchKey(input.designNo),
    productName: input.productName,
  });
  return { ...toDesignDto(design), materials: await listMaterialColumns() };
}

export async function getDesignDetail(designNo: string): Promise<DesignDetailDto> {
  const [design, materials] = await Promise.all([findDesign(designNo), listMaterialColumns()]);
  return { ...toDesignDto(design), materials };
}

/** Label (e.g. "ABC-1") of the first order for the design, if any. */
async function firstOrderOf(designNo: string): Promise<string | null> {
  const order = await OrderModel.findOne({ designNo }).sort({ orderNo: 1 });
  return order ? orderLabel(order) : null;
}

/** Changes the product name and/or the design number (not while orders use the design). */
export async function updateDesign(designNo: string, input: UpdateDesignInput): Promise<DesignDetailDto> {
  const design = await findDesign(designNo);
  if (input.designNo !== undefined && input.designNo !== design.designNo) {
    const used = await firstOrderOf(design.designNo);
    if (used !== null) throw new AppError(409, DESIGN_MESSAGES.renameInUse(design.designNo, used));
    if (await DesignModel.exists({ designNo: input.designNo })) throw new AppError(409, DESIGN_MESSAGES.exists(input.designNo));
    design.designNo = input.designNo;
    design.searchKey = toSearchKey(input.designNo);
  }
  if (input.productName !== undefined) design.productName = input.productName;
  await design.save();
  return getDesignDetail(design.designNo);
}

/** Deletes the design and all its components (not while orders use it). */
export async function deleteDesign(designNo: string): Promise<void> {
  const design = await findDesign(designNo);
  const used = await firstOrderOf(design.designNo);
  if (used !== null) throw new AppError(409, DESIGN_MESSAGES.designInUse(design.designNo, used));
  await design.deleteOne();
}

/** First order (lowest orderNo) that uses the component, optionally only one of its sizes. */
async function firstOrderUsing(designNo: string, component: string, sizes?: string[]): Promise<{ order: string; size: string } | null> {
  const lineMatch = sizes ? { component, size: { $in: sizes } } : { component };
  const order = await OrderModel.findOne({ designNo, lines: { $elemMatch: lineMatch } }).sort({ orderNo: 1 });
  if (!order) return null;
  const line = order.lines.find((l) => l.component === component && (!sizes || sizes.includes(l.size)));
  return { order: orderLabel(order), size: line?.size ?? '' };
}

/**
 * Adds the component or replaces its sizes. Zero consumption is dropped; unknown material codes
 * are refused; sizes used by an order cannot be removed (orders follow the design, §8).
 */
export async function putComponent(designNo: string, name: string, input: PutComponentInput): Promise<DesignDetailDto> {
  const design = await findDesign(designNo);

  const ordered = (await MaterialModel.find({}, { code: 1 }).sort({ sortOrder: 1, code: 1 })).map((m) => m.code);
  const knownCodes = new Set(ordered);
  /** "seq-3mm|white" → { code: SEQ-3MM, color: WHITE, key }, checked against Material Master. */
  const checkKey = (raw: string) => {
    const { code, color } = parseVariantKey(raw);
    if (!knownCodes.has(code)) throw new AppError(400, DESIGN_MESSAGES.unknownMaterial(code));
    if (color !== null && (color.length > 30 || !COLOR_PATTERN.test(color))) throw new AppError(400, DESIGN_MESSAGES.badColor(color));
    return { code, color, key: variantKey(code, color) };
  };
  const chosenColumns = (input.columns ?? []).map((raw) => checkKey(raw).key);
  const sizes: DesignSize[] = input.sizes.map((row) => {
    const consumption: ConsumptionItem[] = [];
    for (const [rawKey, qty] of Object.entries(row.consumption)) {
      const { code, color } = checkKey(rawKey);
      if (qty > 0) consumption.push({ material: code, color, qty });
    }
    return { size: row.size, stitch: row.stitch, laser: row.laser ?? null, consumption };
  });

  // Chosen columns + every column that has a quantity; by material (Material Master order), then colour.
  const materials = sortVariantKeys(
    [...chosenColumns, ...sizes.flatMap((s) => s.consumption.map((c) => variantKey(c.material, c.color)))],
    ordered,
  );

  const existing = design.components.find((c) => c.name === name);
  if (existing) {
    const kept = new Set(sizes.map((s) => s.size));
    const removed = existing.sizes.map((s) => s.size).filter((size) => !kept.has(size));
    if (removed.length > 0) {
      const used = await firstOrderUsing(designNo, name, removed);
      if (used) throw new AppError(409, DESIGN_MESSAGES.sizeInUse(name, used.size, used.order));
    }
    existing.sizes = sizes;
    existing.materials = materials;
  } else {
    design.components.push({ name, materials, sizes });
  }
  await design.save();
  return getDesignDetail(designNo);
}

export async function deleteComponent(designNo: string, name: string): Promise<DesignDetailDto> {
  const design = await findDesign(designNo);
  const index = design.components.findIndex((c) => c.name === name);
  if (index === -1) throw new AppError(404, DESIGN_MESSAGES.componentNotFound(name));
  const used = await firstOrderUsing(designNo, name);
  if (used) throw new AppError(409, DESIGN_MESSAGES.componentInUse(name, used.order));

  design.components.splice(index, 1);
  await design.save();
  return getDesignDetail(designNo);
}
