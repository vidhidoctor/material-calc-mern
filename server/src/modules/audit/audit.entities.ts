import { typedLabel, type AuditEntityType, type AuditModule, type PermissionCode } from '@app/shared';
import { isValidObjectId } from 'mongoose';
import { ComponentNameModel } from '../component-names/component-name.model.js';
import { MaterialRateModel } from '../costing/material-rate.model.js';
import { DepartmentModel } from '../departments/department.model.js';
import { DesignCostingModel } from '../design-costing/design-costing.model.js';
import { DesignModel } from '../designs/design.model.js';
import { JobWorkCostingModel } from '../job-work-costing/job-work-costing.model.js';
import { MaterialCategoryModel } from '../material-categories/material-category.model.js';
import { MaterialModel } from '../materials/material.model.js';
import { OrderModel } from '../orders/order.model.js';
import { PrintConfigModel } from '../print-config/print-config.model.js';
import { RoleModel } from '../roles/role.model.js';
import { SettingsModel, SETTINGS_ID } from '../settings/settings.model.js';
import { UserModel } from '../users/user.model.js';

/**
 * What a record looks like for the audit log (its "before" and "after"), its label, its module, who may
 * see its History, and which of its fields are costs (hidden from users without COST_VIEW).
 */

export interface EntitySnapshot {
  label: string;
  snapshot: Record<string, unknown>;
}

interface EntityDef {
  module: AuditModule;
  load: (id: string) => Promise<EntitySnapshot | null>;
  /** Any of these may see this record's History (AUDIT_VIEW always may). */
  viewers: PermissionCode[];
  /** Field paths with costs, e.g. "unitRates" or "… › ratePerUnit". */
  costFields?: RegExp;
}

/** The document without _id and the given fields. */
function strip<T extends Record<string, unknown>>(doc: T | null, ...omit: string[]): Record<string, unknown> | null {
  if (!doc) return null;
  const copy: Record<string, unknown> = { ...doc };
  for (const key of ['_id', ...omit]) delete copy[key];
  return copy;
}

export const AUDIT_ENTITIES: Record<AuditEntityType, EntityDef> = {
  Order: {
    module: 'Orders',
    viewers: ['PRODUCTION_VIEW'],
    costFields: /^(unitRates|unitCosts)\b|ratePerUnit$/,
    load: async (id) => {
      const order = await OrderModel.findOne({ orderNo: Number(id) }).lean();
      return order ? { label: `Order ${order.party}-${order.partyOrderNo} · ${order.designNo}`, snapshot: strip(order)! } : null;
    },
  },
  Design: {
    module: 'Punching',
    viewers: ['PUNCHING_VIEW', 'PRODUCTION_VIEW'],
    load: async (id) => {
      const design = await DesignModel.findOne({ designNo: id }).lean();
      return design ? { label: `Design ${design.designNo}`, snapshot: strip(design, 'searchKey')! } : null;
    },
  },
  Material: {
    module: 'Material Master',
    viewers: ['MATERIAL_MASTER_VIEW'],
    load: async (id) => {
      const material = await MaterialModel.findOne({ code: id }).lean();
      return material ? { label: `Material ${material.code}`, snapshot: strip(material)! } : null;
    },
  },
  Category: {
    module: 'Material Master',
    viewers: ['MATERIAL_MASTER_VIEW'],
    load: async (id) => {
      const category = await MaterialCategoryModel.findOne({ code: id }).lean();
      return category ? { label: `Category ${category.name}`, snapshot: strip(category)! } : null;
    },
  },
  ComponentName: {
    module: 'Material Master',
    viewers: ['MATERIAL_MASTER_VIEW', 'PUNCHING_VIEW'],
    load: async (id) => {
      const entry = await ComponentNameModel.findOne({ name: id }).lean();
      return entry ? { label: `Component ${entry.name}`, snapshot: strip(entry, 'createdAt')! } : null;
    },
  },
  Rate: {
    module: 'Costing',
    viewers: ['COST_VIEW'],
    costFields: /.*/,
    load: async (id) => {
      const rate = await MaterialRateModel.findOne({ key: id }).lean();
      if (!rate) return null;
      const [, category, type] = /^@([^^]+)\^(.+)$/.exec(id) ?? [];
      const label = category ? `Type rate ${category} · ${type}` : `Rate ${typedLabel(id)}`;
      return { label, snapshot: strip(rate, 'updatedAt', 'updatedBy')! };
    },
  },
  DesignCosting: {
    module: 'Costing',
    viewers: ['DESIGN_COSTING_VIEW'],
    costFields: /.*/,
    load: async (id) => {
      const costing = await DesignCostingModel.findOne({ designNo: id }).lean();
      return costing ? { label: `Design costing ${costing.designNo}`, snapshot: strip(costing, 'updatedAt', 'updatedBy')! } : null;
    },
  },
  JobWorkCosting: {
    module: 'Costing',
    viewers: ['DESIGN_COSTING_VIEW'],
    costFields: /.*/,
    load: async (id) => {
      const costing = await JobWorkCostingModel.findOne({ designNo: id }).lean();
      return costing ? { label: `Job work costing ${costing.designNo}`, snapshot: strip(costing, 'updatedAt', 'updatedBy')! } : null;
    },
  },
  PrintConfig: {
    module: 'Costing',
    viewers: ['DESIGN_COSTING_VIEW'],
    load: async (id) => {
      const config = await PrintConfigModel.findOne({ sheet: id }).lean();
      return config ? { label: `Print settings ${config.sheet}`, snapshot: strip(config, 'updatedAt', 'updatedBy')! } : null;
    },
  },
  User: {
    module: 'Users',
    viewers: ['USER_VIEW'],
    load: async (id) => {
      if (!isValidObjectId(id)) return null;
      const user = await UserModel.findById(id).lean();
      if (!user) return null;
      const [role, department] = await Promise.all([
        user.roleId ? RoleModel.findById(user.roleId).lean() : null,
        user.departmentId ? DepartmentModel.findById(user.departmentId).lean() : null,
      ]);
      const snapshot = strip(user, 'passwordHash', 'roleId', 'departmentId')!;
      return { label: `User ${user.email}`, snapshot: { ...snapshot, role: role?.name ?? null, department: department?.name ?? null } };
    },
  },
  Role: {
    module: 'Roles & departments',
    viewers: ['ROLE_MANAGE', 'PERMISSION_MANAGE'],
    load: async (id) => {
      if (!isValidObjectId(id)) return null;
      const role = await RoleModel.findById(id).lean();
      return role ? { label: `Role ${role.name}`, snapshot: { name: role.name, permissions: [...role.permissions].sort() } } : null;
    },
  },
  Department: {
    module: 'Roles & departments',
    viewers: ['DEPARTMENT_MANAGE', 'USER_VIEW'],
    load: async (id) => {
      if (!isValidObjectId(id)) return null;
      const department = await DepartmentModel.findById(id).lean();
      return department ? { label: `Department ${department.name}`, snapshot: { name: department.name } } : null;
    },
  },
  Settings: {
    module: 'Global config',
    viewers: ['SETTINGS_MANAGE'],
    load: async () => {
      const settings = await SettingsModel.findById(SETTINGS_ID).lean();
      const adminEmails = (settings?.adminEmails ?? []).map((e) => ({ email: e.email, name: e.name, primary: e.primary }));
      return { label: 'Global config', snapshot: { adminEmails } };
    },
  },
};

export async function loadEntity(type: AuditEntityType, id: string): Promise<EntitySnapshot | null> {
  return AUDIT_ENTITIES[type].load(id);
}
