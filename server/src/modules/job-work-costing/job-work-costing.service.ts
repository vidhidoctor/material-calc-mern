import { DEFAULT_COSTING_HEADS, sortVariantKeys, type JobWorkAmountsDto, type JobWorkCalculationDto, type JobWorkCostingDto, type JobWorkInputDto } from '@app/shared';
import { Decimal, toDecimalString } from '../../calculation/engine.js';
import { jobWorkCost, sumJobWork, type JobWorkAmounts } from '../../calculation/job-work.js';
import { DesignCostingModel } from '../design-costing/design-costing.model.js';
import { costerFor, describeColumn, toInput } from '../design-costing/design-costing.service.js';
import { consumptionLookup, findDesign } from '../designs/designs.service.js';
import type { Design } from '../designs/design.model.js';
import { listMaterialColumns } from '../materials/materials.service.js';
import { JobWorkCostingModel, type JobWorkCosting } from './job-work-costing.model.js';
import type { JobWorkCostingInput } from './job-work-costing.validation.js';

export const JOB_WORK_MESSAGES = {
  missingRates: (count: number) => `${count} size${count === 1 ? ' has' : 's have'} no job worker, stitch or laser rate yet (counted as ₹0).`,
} as const;

const rowKey = (component: string, size: string) => `${component}\u0000${size}`;

function toAmountsDto(amounts: JobWorkAmounts): JobWorkAmountsDto {
  return {
    rate: toDecimalString(amounts.rate),
    stitchCost: toDecimalString(amounts.stitchCost),
    laserCost: toDecimalString(amounts.laserCost),
    includedMaterials: toDecimalString(amounts.includedMaterials),
    excludedMaterials: toDecimalString(amounts.excludedMaterials),
    finalCost: toDecimalString(amounts.finalCost),
  };
}

function toJobWorkInput(costing: JobWorkCosting | null): JobWorkInputDto {
  return {
    rows: (costing?.rows ?? []).map((r) => ({
      component: r.component,
      size: r.size,
      rate: r.rate ?? null,
      stitch: r.stitch ?? null,
      laser: r.laser ?? null,
      stitchRate: r.stitchRate ?? null,
      laserRate: r.laserRate ?? null,
      stitchHeads: r.stitchHeads ?? DEFAULT_COSTING_HEADS,
      laserHeads: r.laserHeads ?? DEFAULT_COSTING_HEADS,
    })),
    excluded: [...(costing?.excluded ?? [])],
  };
}

/**
 * The design's current punching details with the entered rates and quantities. Material costs come from today's
 * Material Master rates, with the sequence types and cord values chosen in the design costing (read only).
 */
async function calculate(design: Design, input: JobWorkInputDto): Promise<JobWorkCalculationDto> {
  const [columns, designCosting] = await Promise.all([listMaterialColumns(), DesignCostingModel.findOne({ designNo: design.designNo })]);
  const choices = toInput(designCosting);
  const coster = await costerFor(choices);
  const entries = new Map(input.rows.map((r) => [rowKey(r.component, r.size), r]));
  const excluded = new Set(input.excluded);
  const lookup = consumptionLookup(design);
  const totals = new Map<string, { qty: Decimal; cost: Decimal | null }>();
  const errors = new Set<string>();
  let noRate = 0;

  const components = design.components.map((component) => {
    const sizes = component.sizes.map((s) => {
      const entry = entries.get(rowKey(component.name, s.size));
      if (entry?.rate == null && entry?.stitchRate == null && entry?.laserRate == null) noRate += 1;
      const stitch = entry?.stitch ?? s.stitch;
      const laser = entry?.laser ?? s.laser ?? null;
      let included = new Decimal(0);
      let left = new Decimal(0);
      for (const [key, qty] of Object.entries(lookup(component.name, s.size) ?? {})) {
        const { perUnit, error } = coster(key);
        if (error) errors.add(error);
        const cost = perUnit ? perUnit.times(qty) : null;
        if (cost && excluded.has(key)) left = left.plus(cost);
        else if (cost) included = included.plus(cost);
        const total = totals.get(key);
        totals.set(key, { qty: (total?.qty ?? new Decimal(0)).plus(qty), cost: cost ? (total?.cost ?? new Decimal(0)).plus(cost) : null });
      }
      const amounts = jobWorkCost({
        rate: entry?.rate ?? null,
        stitch,
        laser,
        stitchRate: entry?.stitchRate ?? null,
        laserRate: entry?.laserRate ?? null,
        stitchHeads: entry?.stitchHeads ?? DEFAULT_COSTING_HEADS,
        laserHeads: entry?.laserHeads ?? DEFAULT_COSTING_HEADS,
        includedMaterials: included,
        excludedMaterials: left,
      });
      return { size: s.size, stitch, laser, punchingStitch: s.stitch, punchingLaser: s.laser ?? null, amounts };
    });
    return { name: component.name, sizes, total: sumJobWork(sizes.map((s) => s.amounts)) };
  });

  if (noRate > 0) errors.add(JOB_WORK_MESSAGES.missingRates(noRate));
  const byCode = new Map(columns.map((m) => [m.code, m]));
  return {
    materials: sortVariantKeys([...totals.keys()], columns.map((m) => m.code)).map((key) => {
      const { qty, cost } = totals.get(key)!;
      return { key, ...describeColumn(byCode, key, choices.types), qty: toDecimalString(qty), cost: cost ? toDecimalString(cost) : null, included: !excluded.has(key) };
    }),
    components: components.map((c) => ({
      name: c.name,
      sizes: c.sizes.map(({ amounts, ...s }) => ({ ...s, ...toAmountsDto(amounts) })),
      total: toAmountsDto(c.total),
    })),
    total: toAmountsDto(sumJobWork(components.map((c) => c.total))),
    errors: [...errors],
  };
}

export async function getJobWorkCosting(designNo: string): Promise<JobWorkCostingDto> {
  const [design, costing] = await Promise.all([findDesign(designNo), JobWorkCostingModel.findOne({ designNo })]);
  const saved = toJobWorkInput(costing);
  return {
    designNo: design.designNo,
    saved,
    savedAt: costing?.updatedAt.toISOString() ?? null,
    savedBy: costing?.updatedBy ?? null,
    calculation: await calculate(design, saved),
  };
}

/** Calculates what is on screen without saving it. */
export async function previewJobWorkCosting(designNo: string, input: JobWorkCostingInput): Promise<JobWorkCalculationDto> {
  return calculate(await findDesign(designNo), input);
}

/** Saves the entries and material choices; rows of sizes the design no longer has, and rows left blank, are dropped. Never writes to the design. */
export async function saveJobWorkCosting(designNo: string, input: JobWorkCostingInput, actorEmail: string): Promise<JobWorkCostingDto> {
  const design = await findDesign(designNo);
  const known = new Set(design.components.flatMap((c) => c.sizes.map((s) => rowKey(c.name, s.size))));
  const rows = input.rows.filter(
    (r) =>
      known.has(rowKey(r.component, r.size)) &&
      (r.rate !== null || r.stitch !== null || r.laser !== null || r.stitchRate !== null || r.laserRate !== null || r.stitchHeads !== DEFAULT_COSTING_HEADS || r.laserHeads !== DEFAULT_COSTING_HEADS),
  );
  await JobWorkCostingModel.updateOne(
    { designNo: design.designNo },
    { $set: { rows, excluded: [...new Set(input.excluded)], updatedAt: new Date(), updatedBy: actorEmail } },
    { upsert: true },
  );
  return getJobWorkCosting(design.designNo);
}
