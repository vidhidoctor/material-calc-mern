import {
  DEFAULT_COSTING_HEADS,
  DEFAULT_COSTING_MARKUP_PERCENT,
  sortVariantKeys,
  parseVariantKey,
  type DesignCostingAmountsDto,
  type DesignCostingCalculationDto,
  type DesignCostingDto,
  type DesignCostingInputDto,
  type DesignCostingListItemDto,
  type DesignCostingMaterialDto,
  type MaterialColumnDto,
} from '@app/shared';
import { costOfSize, sumCosts, type CostingAmounts } from '../../calculation/design-costing.js';
import { Decimal, toDecimalString } from '../../calculation/engine.js';
import { AppError } from '../../lib/app-error.js';
import { designColumnCoster, designCostColumns } from '../costing/costing.service.js';
import { listMaterialColumns } from '../materials/materials.service.js';
import { consumptionLookup, findDesign, getDesignDetail, searchDesigns, selectedColumns, toDesignListItem } from '../designs/designs.service.js';
import type { Design } from '../designs/design.model.js';
import { DesignCostingModel, type DesignCosting } from './design-costing.model.js';
import type { DesignCostingInput } from './design-costing.validation.js';

export const DESIGN_COSTING_MESSAGES = {
  unknownType: (category: string, type: string) => `${type} is not a ${category} type.`,
  missingRates: (count: number, rate: string) => `${count} size${count === 1 ? ' has' : 's have'} no ${rate} rate yet (counted as ₹0).`,
} as const;

const rowKey = (component: string, size: string) => `${component}\u0000${size}`;
const designColumns = (design: Design) => [...new Set(design.components.flatMap((c) => selectedColumns(c)))];

function toAmountsDto(amounts: CostingAmounts): DesignCostingAmountsDto {
  return {
    stitchCost: toDecimalString(amounts.stitchCost),
    laserCost: toDecimalString(amounts.laserCost),
    materialCost: toDecimalString(amounts.materialCost),
    base: toDecimalString(amounts.base),
    markup: toDecimalString(amounts.markup),
    finalPrice: toDecimalString(amounts.finalPrice),
  };
}

/** Material name and colour · type of a column, as Punching shows them (cords by their name). */
export function describeColumn(byCode: ReadonlyMap<string, MaterialColumnDto>, key: string, types: Record<string, string>): Pick<DesignCostingMaterialDto, 'label' | 'detail' | 'unit'> {
  const { code, color } = parseVariantKey(key);
  const material = byCode.get(code);
  return { label: (material?.cord && material.name) || code, detail: [color, types[key]].filter(Boolean).join(' · '), unit: material?.unit ?? '' };
}

/** Today's cost of one unit of a column, with the type and cord entries of a costing. */
export function costerFor(input: { types: Record<string, string>; cords: Record<string, { denier?: number | null; ratePerUnit?: number | null }> }) {
  const cords = new Map(Object.entries(input.cords).map(([key, c]) => [key, { denier: c.denier ?? null, ratePerUnit: c.ratePerUnit ?? null }]));
  return designColumnCoster(input.types, cords);
}

export function toInput(costing: DesignCosting | null): DesignCostingInputDto {
  return {
    markupPercent: costing?.markupPercent ?? DEFAULT_COSTING_MARKUP_PERCENT,
    rows: (costing?.rows ?? []).map(({ component, size, stitchRate, laserRate, stitchHeads, laserHeads, note }) => ({
      component,
      size,
      stitchRate: stitchRate ?? null,
      laserRate: laserRate ?? null,
      stitchHeads: stitchHeads ?? DEFAULT_COSTING_HEADS,
      laserHeads: laserHeads ?? DEFAULT_COSTING_HEADS,
      note: note ?? '',
    })),
    types: Object.fromEntries((costing?.types ?? []).map((t) => [t.key, t.type])),
    cords: Object.fromEntries((costing?.cords ?? []).map((c) => [c.key, { denier: c.denier ?? null, ratePerUnit: c.ratePerUnit ?? null }])),
  };
}

/** The design's current punching details with the entered rates; material costs use today's Material Master rates. */
async function calculate(design: Design, input: DesignCostingInput | DesignCostingInputDto): Promise<DesignCostingCalculationDto> {
  const rates = new Map(input.rows.map((r) => [rowKey(r.component, r.size), r]));
  const lookup = consumptionLookup(design);
  const coster = await costerFor(input);
  const columns = await listMaterialColumns();
  const materialTotals = new Map<string, { qty: Decimal; cost: Decimal | null }>();
  const errors = new Set<string>();
  let noStitchRate = 0;
  let noLaserRate = 0;

  const components = design.components.map((component) => {
    const sizes = component.sizes.map((s) => {
      const rate = rates.get(rowKey(component.name, s.size));
      if (s.stitch > 0 && rate?.stitchRate == null) noStitchRate += 1;
      if ((s.laser ?? 0) > 0 && rate?.laserRate == null) noLaserRate += 1;
      let materialCost = new Decimal(0);
      for (const [key, qty] of Object.entries(lookup(component.name, s.size) ?? {})) {
        const { perUnit, error } = coster(key);
        if (error) errors.add(error);
        const cost = perUnit ? perUnit.times(qty) : null;
        if (cost) materialCost = materialCost.plus(cost);
        const total = materialTotals.get(key);
        materialTotals.set(key, { qty: (total?.qty ?? new Decimal(0)).plus(qty), cost: cost ? (total?.cost ?? new Decimal(0)).plus(cost) : null });
      }
      const amounts = costOfSize(
        { stitch: s.stitch, laser: s.laser ?? null, stitchRate: rate?.stitchRate ?? null, laserRate: rate?.laserRate ?? null, stitchHeads: rate?.stitchHeads ?? DEFAULT_COSTING_HEADS, laserHeads: rate?.laserHeads ?? DEFAULT_COSTING_HEADS, materialCost },
        input.markupPercent,
      );
      return { size: s.size, stitch: s.stitch, laser: s.laser ?? null, amounts };
    });
    return { name: component.name, sizes, total: sumCosts(sizes.map((s) => s.amounts)) };
  });

  if (noStitchRate > 0) errors.add(DESIGN_COSTING_MESSAGES.missingRates(noStitchRate, 'stitch'));
  if (noLaserRate > 0) errors.add(DESIGN_COSTING_MESSAGES.missingRates(noLaserRate, 'laser'));
  const byCode = new Map(columns.map((m) => [m.code, m]));
  const materials = sortVariantKeys([...materialTotals.keys()], columns.map((m) => m.code)).map((key) => {
    const { qty, cost } = materialTotals.get(key)!;
    return {
      key,
      ...describeColumn(byCode, key, input.types),
      qty: toDecimalString(qty),
      cost: cost ? toDecimalString(cost) : null,
    };
  });
  return {
    materials,
    components: components.map((c) => ({
      name: c.name,
      sizes: c.sizes.map((s) => ({ size: s.size, stitch: s.stitch, laser: s.laser, ...toAmountsDto(s.amounts) })),
      total: toAmountsDto(c.total),
    })),
    total: toAmountsDto(sumCosts(components.map((c) => c.total))),
    errors: [...errors],
  };
}

export async function listDesignCostings(q?: string): Promise<DesignCostingListItemDto[]> {
  const designs = await searchDesigns(q);
  const costings = new Map((await DesignCostingModel.find({ designNo: { $in: designs.map((d) => d.designNo) } })).map((c) => [c.designNo, c]));
  return designs.map((design) => {
    const costing = costings.get(design.designNo);
    return { ...toDesignListItem(design), savedAt: costing?.updatedAt.toISOString() ?? null, savedBy: costing?.updatedBy ?? null };
  });
}

export async function getDesignCosting(designNo: string): Promise<DesignCostingDto> {
  const [design, detail, costing] = await Promise.all([findDesign(designNo), getDesignDetail(designNo), DesignCostingModel.findOne({ designNo })]);
  const saved = toInput(costing);
  return {
    design: detail,
    saved,
    savedAt: costing?.updatedAt.toISOString() ?? null,
    savedBy: costing?.updatedBy ?? null,
    ...(await designCostColumns(designColumns(design))),
    calculation: await calculate(design, saved),
  };
}

/** Calculates what is on screen without saving it. */
export async function previewDesignCosting(designNo: string, input: DesignCostingInput): Promise<DesignCostingCalculationDto> {
  return calculate(await findDesign(designNo), input);
}

/** Saves the Manager's entries; rows of sizes the design no longer has, and empty entries, are dropped. */
export async function saveDesignCosting(designNo: string, input: DesignCostingInput, actorEmail: string): Promise<DesignCostingDto> {
  const design = await findDesign(designNo);
  const { typed, cords: cordColumns } = await designCostColumns(designColumns(design));

  const types = typed.flatMap((column) => {
    const type = input.types[column.key];
    if (!type) return [];
    if (!column.types.includes(type)) throw new AppError(400, DESIGN_COSTING_MESSAGES.unknownType(column.categoryName, type));
    return [{ key: column.key, type }];
  });
  const cords = cordColumns.flatMap(({ key }) => {
    const cord = input.cords[key];
    return cord?.denier != null || cord?.ratePerUnit != null ? [{ key, denier: cord.denier ?? null, ratePerUnit: cord.ratePerUnit ?? null }] : [];
  });
  const known = new Set(design.components.flatMap((c) => c.sizes.map((s) => rowKey(c.name, s.size))));
  const rows = input.rows.filter((r) => known.has(rowKey(r.component, r.size)) && (r.stitchRate !== null || r.laserRate !== null || r.stitchHeads !== DEFAULT_COSTING_HEADS || r.laserHeads !== DEFAULT_COSTING_HEADS || r.note !== ''));

  await DesignCostingModel.updateOne(
    { designNo: design.designNo },
    // Costings saved while a discount existed lose it on their next save (it no longer affects any figure).
    { $set: { markupPercent: input.markupPercent, rows, types, cords, updatedAt: new Date(), updatedBy: actorEmail }, $unset: { discountPercent: 1 } },
    // strict: false, or Mongoose drops the $unset of a field no longer in the schema.
    { upsert: true, strict: false },
  );
  return getDesignCosting(design.designNo);
}
