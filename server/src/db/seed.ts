import { ADMIN_ROLE, DEPARTMENTS, ROLES } from '@app/shared';
import { hashPassword } from '../lib/crypto.js';
import { DepartmentModel } from '../modules/departments/department.model.js';
import { MaterialModel } from '../modules/materials/material.model.js';
import { legacyRules } from './default-categories.js';
import { RoleModel } from '../modules/roles/role.model.js';
import { ensurePrimaryAdminEmail } from '../modules/settings/settings.service.js';
import { UserModel } from '../modules/users/user.model.js';

export interface StandardMaterial {
  code: string;
  name: string;
  /** Category code, e.g. SEQUENCE, BEAD, CORD. */
  category: string;
  seqPerCd?: number;
  cdPerRoll?: number;
  cdPerRound?: number;
  pcsPerKg?: number;
  denier?: number;
}

/**
 * Optional (npm run seed:materials): adds the standard materials that are missing, after the
 * existing ones. Existing materials — matched by code — are never changed.
 */
export async function seedMaterials(materials: readonly StandardMaterial[]): Promise<string[]> {
  const log: string[] = [];
  const last = await MaterialModel.findOne().sort({ sortOrder: -1 });
  let sortOrder = last ? last.sortOrder + 1 : 0;
  for (const m of materials) {
    if (await MaterialModel.exists({ code: m.code })) {
      log.push(`Material ${m.code}: exists (left unchanged)`);
      continue;
    }
    await MaterialModel.create({
      code: m.code,
      name: m.name,
      category: m.category,
      sortOrder: sortOrder++,
      rules: legacyRules(m),
    });
    log.push(`Material ${m.code}: created`);
  }
  return log;
}

export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
}

/**
 * Re-runnable. Departments and roles are created if missing; Admin is always re-granted every
 * permission; the first Admin user is created once and its password is never overwritten.
 * Returns a line per action for the console.
 */
export async function seedFoundation({ adminEmail, adminPassword }: SeedOptions): Promise<string[]> {
  const log: string[] = [];

  for (const name of DEPARTMENTS) {
    const result = await DepartmentModel.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
    log.push(`Department ${name}: ${result.upsertedCount ? 'created' : 'exists'}`);
  }

  for (const [name, permissions] of Object.entries(ROLES)) {
    if (name === ADMIN_ROLE) {
      const result = await RoleModel.updateOne({ name }, { $set: { permissions: [...permissions] } }, { upsert: true });
      log.push(`Role ${name}: ${result.upsertedCount ? 'created' : 'exists'}, all ${permissions.length} permissions granted`);
    } else {
      const result = await RoleModel.updateOne({ name }, { $setOnInsert: { name, permissions: [...permissions] } }, { upsert: true });
      log.push(`Role ${name}: ${result.upsertedCount ? 'created' : 'exists (left unchanged)'}`);
    }
  }

  const email = adminEmail.trim().toLowerCase();
  if (await UserModel.exists({ email })) {
    log.push(`Admin user ${email}: exists (password not changed)`);
  } else {
    const [role, department] = await Promise.all([
      RoleModel.findOne({ name: ADMIN_ROLE }),
      DepartmentModel.findOne({ name: 'Administration' }),
    ]);
    await UserModel.create({
      name: 'Admin',
      email,
      passwordHash: await hashPassword(adminPassword),
      isActive: true,
      roleId: role?._id ?? null,
      departmentId: department?._id ?? null,
    });
    log.push(`Admin user ${email}: created`);
  }

  const added = await ensurePrimaryAdminEmail(email, 'Admin');
  log.push(`Global config: ${email} ${added ? 'added as primary admin email' : 'already the primary admin email'}`);

  return log;
}
