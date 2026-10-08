import type { Consumption, DesignDetailDto, DesignDto, DesignListItemDto } from '@app/shared';
import { AppError } from '../../lib/app-error.js';
import { listMaterialColumns } from '../materials/materials.service.js';
import { MaterialModel } from '../materials/material.model.js';
import { OrderModel } from '../orders/order.model.js';
import { DesignModel, type ConsumptionItem, type Design, type DesignDocument, type DesignSize } from './design.model.js';
import type { CreateDesignInput, PutComponentInput } from './designs.validation.js';

export const DESIGN_MESSAGES = {
  notFound: (designNo: string) => `Design ${designNo} not found.`,
  exists: (designNo: string) => `Design ${designNo} already exists.`,
  componentNotFound: (name: string) => `Component ${name} not found in this design.`,
  unknownMaterial: (code: string) => `Unknown material ${code}.`,
  sizeInUse: (component: string, size: string, orderNo: number) =>
    `${component} size ${size} is used by order #${orderNo} and cannot be removed.`,
  componentInUse: (component: string, orderNo: number) =>
    `${component} is used by order #${orderNo} and cannot be removed.`,
} as const;

/** Upper-case, no spaces or dashes: "26 - 49" and "2649" both match "26-49". */
export function toSearchKey(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toConsumption(items: readonly ConsumptionItem[]): Consumption {
  return Object.fromEntries(items.map((item) => [item.material, item.qty]));
}

export function toDesignDto(design: Design): DesignDto {
  return {
    designNo: design.designNo,
    productName: design.productName,
    createdAt: design.createdAt.toISOString(),
    components: design.components.map((component) => ({
      name: component.name,
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

export async function updateProductName(designNo: string, productName: string): Promise<DesignDetailDto> {
  const design = await findDesign(designNo);
  design.productName = productName;
  await design.save();
  return getDesignDetail(designNo);
}

/** First order (lowest orderNo) that uses the component, optionally only one of its sizes. */
async function firstOrderUsing(designNo: string, component: string, sizes?: string[]): Promise<{ orderNo: number; size: string } | null> {
  const lineMatch = sizes ? { component, size: { $in: sizes } } : { component };
  const order = await OrderModel.findOne({ designNo, lines: { $elemMatch: lineMatch } }).sort({ orderNo: 1 });
  if (!order) return null;
  const line = order.lines.find((l) => l.component === component && (!sizes || sizes.includes(l.size)));
  return { orderNo: order.orderNo, size: line?.size ?? '' };
}

/**
 * Adds the component or replaces its sizes. Zero consumption is dropped; unknown material codes
 * are refused; sizes used by an order cannot be removed (orders follow the design, §8).
 */
export async function putComponent(designNo: string, name: string, input: PutComponentInput): Promise<DesignDetailDto> {
  const design = await findDesign(designNo);

  const knownCodes = new Set((await MaterialModel.find({}, { code: 1 })).map((m) => m.code));
  const sizes: DesignSize[] = input.sizes.map((row) => {
    const consumption: ConsumptionItem[] = [];
    for (const [rawCode, qty] of Object.entries(row.consumption)) {
      const code = rawCode.trim().toUpperCase();
      if (!knownCodes.has(code)) throw new AppError(400, DESIGN_MESSAGES.unknownMaterial(code));
      if (qty > 0) consumption.push({ material: code, qty });
    }
    return { size: row.size, stitch: row.stitch, laser: row.laser ?? null, consumption };
  });

  const existing = design.components.find((c) => c.name === name);
  if (existing) {
    const kept = new Set(sizes.map((s) => s.size));
    const removed = existing.sizes.map((s) => s.size).filter((size) => !kept.has(size));
    if (removed.length > 0) {
      const used = await firstOrderUsing(designNo, name, removed);
      if (used) throw new AppError(409, DESIGN_MESSAGES.sizeInUse(name, used.size, used.orderNo));
    }
    existing.sizes = sizes;
  } else {
    design.components.push({ name, sizes });
  }
  await design.save();
  return getDesignDetail(designNo);
}

export async function deleteComponent(designNo: string, name: string): Promise<DesignDetailDto> {
  const design = await findDesign(designNo);
  const index = design.components.findIndex((c) => c.name === name);
  if (index === -1) throw new AppError(404, DESIGN_MESSAGES.componentNotFound(name));
  const used = await firstOrderUsing(designNo, name);
  if (used) throw new AppError(409, DESIGN_MESSAGES.componentInUse(name, used.orderNo));

  design.components.splice(index, 1);
  await design.save();
  return getDesignDetail(designNo);
}
