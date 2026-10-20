// Shared constants used by client and server. See docs/context.md §3 and §5.

export const PERMISSIONS = {
  PUNCHING_VIEW: 'View the Punching Master (designs, components, sizes, consumption)',
  PUNCHING_CREATE: 'Create designs and components in the Punching Master',
  PUNCHING_UPDATE: 'Edit designs, components, sizes and consumption',
  PRODUCTION_VIEW: 'Search designs and view production orders',
  PRODUCTION_CREATE: 'Create production orders',
  PRODUCTION_UPDATE: 'Change the status of production orders',
  PURCHASE_REQUIREMENT_VIEW: 'View purchase requirements',
  MATERIAL_MASTER_VIEW: 'View the material list and conversion rules',
  MATERIAL_MASTER_MANAGE: 'Add, edit and remove materials and conversion rules',
  USER_VIEW: 'View users',
  USER_CREATE: 'Create users',
  USER_UPDATE: 'Edit users, activate or deactivate them, set passwords',
  USER_DELETE: 'Delete users',
  ROLE_MANAGE: 'Create roles',
  PERMISSION_MANAGE: 'Change the permissions of a role',
  DEPARTMENT_MANAGE: 'Create departments',
  SETTINGS_MANAGE: 'Manage global config (admin emails)',
  COST_VIEW: 'See and set material rates and costs (₹)',
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

export const PERMISSION_CODES = Object.keys(PERMISSIONS) as [PermissionCode, ...PermissionCode[]];

export const PERMISSION_GROUPS: Record<string, readonly PermissionCode[]> = {
  Punching: ['PUNCHING_VIEW', 'PUNCHING_CREATE', 'PUNCHING_UPDATE'],
  Production: ['PRODUCTION_VIEW', 'PRODUCTION_CREATE', 'PRODUCTION_UPDATE'],
  Purchase: ['PURCHASE_REQUIREMENT_VIEW'],
  'Material Master': ['MATERIAL_MASTER_VIEW', 'MATERIAL_MASTER_MANAGE'],
  Users: ['USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE'],
  'Roles & departments': ['ROLE_MANAGE', 'PERMISSION_MANAGE', 'DEPARTMENT_MANAGE'],
  Settings: ['SETTINGS_MANAGE'],
  Costing: ['COST_VIEW'],
};

export function permissionGroup(code: PermissionCode): string {
  return Object.keys(PERMISSION_GROUPS).find((group) => PERMISSION_GROUPS[group]?.includes(code)) ?? 'Other';
}

/**
 * Material fields entered on each order instead of in Material Master (cord denier): a category with
 * such a field is a "cord" — its denier and rate per KG are entered per order, never in Material Master.
 */
export const isOrderEnteredField = (key: string): boolean => key.trim().toUpperCase() === 'DENIER';

/** Business name printed on the purchase order slip. */
export const COMPANY_NAME = 'CREATIVE EMBROIDERY';

export const ADMIN_ROLE = 'Admin';

/** Default roles created by the seed. Admin is always re-granted every permission. */
export const ROLES: Record<string, readonly PermissionCode[]> = {
  [ADMIN_ROLE]: PERMISSION_CODES,
  'Punching Employee': ['PUNCHING_VIEW', 'PUNCHING_CREATE', 'PUNCHING_UPDATE'],
  'Production Employee': ['PRODUCTION_VIEW', 'PRODUCTION_CREATE', 'PRODUCTION_UPDATE', 'PURCHASE_REQUIREMENT_VIEW'],
};

export const DEPARTMENTS = ['Administration', 'Punching', 'Production'] as const;

/** The four FRD validation messages — use exactly as written. */
export const MESSAGES = {
  CONSUMPTION_MISSING: 'Consumption master not available for this Design + Component + Size.',
  INVALID_ORDER_QUANTITY: 'Please enter a valid Order Quantity.',
  CONVERSION_RULE_MISSING: 'Material conversion rule is not configured.',
  CORD_DENIER_FOR_ORDER: 'Enter the cord denier for this order.',
  CORD_DENIER_MISSING: 'Please configure Cord Denier before calculating Cord KG.',
} as const;

export const ORDER_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
