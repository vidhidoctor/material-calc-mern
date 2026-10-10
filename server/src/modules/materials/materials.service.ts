import { MATERIAL_RULE_FIELDS, MATERIAL_UNITS, RULE_FIELDS, type MaterialColumnDto, type MaterialDto } from '@app/shared';
import { AppError } from '../../lib/app-error.js';
import { DesignModel } from '../designs/design.model.js';
import { MaterialModel, type Material, type MaterialDocument } from './material.model.js';
import type { CreateMaterialInput, UpdateMaterialInput } from './materials.validation.js';

export const MATERIAL_MESSAGES = {
  NOT_FOUND: 'Material not found.',
  CODE_TAKEN: 'A material with this code already exists.',
  IN_USE: 'This material is used by a design and cannot be removed.',
} as const;

export function toMaterialColumn(material: Material): MaterialColumnDto {
  return { code: material.code, name: material.name, category: material.category, unit: MATERIAL_UNITS[material.category] };
}

function toMaterialDto(material: Material): MaterialDto {
  return {
    ...toMaterialColumn(material),
    sortOrder: material.sortOrder,
    seqPerCd: material.seqPerCd ?? null,
    cdPerRoll: material.cdPerRoll ?? null,
    cdPerRound: material.cdPerRound ?? null,
    pcsPerKg: material.pcsPerKg ?? null,
    denier: material.denier ?? null,
  };
}

/** Keeps only the rule fields of the material's category; the others are cleared. */
function categoryRules(input: UpdateMaterialInput): Pick<Material, (typeof MATERIAL_RULE_FIELDS)[number]> {
  const { required, optional } = RULE_FIELDS[input.category];
  const allowed = new Set([...required, ...optional]);
  return {
    seqPerCd: allowed.has('seqPerCd') ? (input.seqPerCd ?? null) : null,
    cdPerRoll: allowed.has('cdPerRoll') ? (input.cdPerRoll ?? null) : null,
    cdPerRound: allowed.has('cdPerRound') ? (input.cdPerRound ?? null) : null,
    pcsPerKg: allowed.has('pcsPerKg') ? (input.pcsPerKg ?? null) : null,
    denier: allowed.has('denier') ? (input.denier ?? null) : null,
  };
}

/** All materials in display order — the material list IS the set of consumption columns. */
export async function findAllMaterials(): Promise<MaterialDocument[]> {
  return MaterialModel.find().sort({ sortOrder: 1, code: 1 });
}

export async function listMaterials(): Promise<MaterialDto[]> {
  return (await findAllMaterials()).map(toMaterialDto);
}

export async function listMaterialColumns(): Promise<MaterialColumnDto[]> {
  return (await findAllMaterials()).map(toMaterialColumn);
}

export async function createMaterial(input: CreateMaterialInput): Promise<MaterialDto> {
  if (await MaterialModel.exists({ code: input.code })) throw new AppError(409, MATERIAL_MESSAGES.CODE_TAKEN);
  const last = await MaterialModel.findOne().sort({ sortOrder: -1 });
  const material = await MaterialModel.create({
    code: input.code,
    name: input.name || input.code,
    category: input.category,
    sortOrder: last ? last.sortOrder + 1 : 0,
    ...categoryRules(input),
  });
  return toMaterialDto(material);
}

export async function updateMaterial(code: string, input: UpdateMaterialInput): Promise<MaterialDto> {
  const material = await MaterialModel.findOne({ code });
  if (!material) throw new AppError(404, MATERIAL_MESSAGES.NOT_FOUND);
  // The name is optional; without one the material is shown by its code.
  material.set({ name: input.name || material.code, category: input.category, ...categoryRules(input) });
  await material.save();
  return toMaterialDto(material);
}

/** Refused while any design uses the material (orders read consumption from designs). */
export async function deleteMaterial(code: string): Promise<void> {
  const material = await MaterialModel.findOne({ code });
  if (!material) throw new AppError(404, MATERIAL_MESSAGES.NOT_FOUND);
  const usedBy = await DesignModel.findOne({ 'components.sizes.consumption.material': code }, { designNo: 1 });
  if (usedBy) throw new AppError(409, MATERIAL_MESSAGES.IN_USE, { designNo: usedBy.designNo });
  await material.deleteOne();
}
