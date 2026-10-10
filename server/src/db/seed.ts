import { ADMIN_ROLE, DEPARTMENTS, ROLES } from '@app/shared';
import { hashPassword } from '../lib/crypto.js';
import { DepartmentModel } from '../modules/departments/department.model.js';
import { RoleModel } from '../modules/roles/role.model.js';
import { ensurePrimaryAdminEmail } from '../modules/settings/settings.service.js';
import { UserModel } from '../modules/users/user.model.js';

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
