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
  AUDIT_VIEW: 'View the audit log (every change, who made it and when)',
  DESIGN_COSTING_VIEW: 'See Design Costing: punching details, costs and prices (₹) of every design',
  DESIGN_COSTING_MANAGE: 'Edit punching details, rates and markup in Design Costing, job work rates, and print settings',
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
  'Design Costing': ['DESIGN_COSTING_VIEW', 'DESIGN_COSTING_MANAGE'],
  Audit: ['AUDIT_VIEW'],
};

/** What is recorded in the audit log, with the label shown. */
export const AUDIT_ACTIONS = {
  LOGIN: 'Logged in',
  LOGIN_FAILED: 'Login failed',
  LOGOUT: 'Logged out',
  SIGNUP: 'Signed up',
  PASSWORD_RESET_REQUESTED: 'Password reset requested',
  PASSWORD_RESET: 'Password reset',
  ACCESS_DENIED: 'Access denied',
  USER_CREATED: 'User created',
  USER_UPDATED: 'User updated',
  USER_DELETED: 'User deleted',
  ROLE_CREATED: 'Role created',
  ROLE_PERMISSIONS_CHANGED: 'Role permissions changed',
  DEPARTMENT_CREATED: 'Department created',
  ADMIN_EMAIL_ADDED: 'Admin email added',
  ADMIN_EMAIL_REMOVED: 'Admin email removed',
  MATERIAL_CREATED: 'Material created',
  MATERIAL_UPDATED: 'Material updated',
  MATERIAL_DELETED: 'Material deleted',
  CATEGORY_CREATED: 'Category created',
  CATEGORY_UPDATED: 'Category updated',
  CATEGORY_DELETED: 'Category deleted',
  COMPONENT_NAME_ADDED: 'Component added to list',
  COMPONENT_NAME_REMOVED: 'Component removed from list',
  RATE_SET: 'Rate set',
  RATE_REMOVED: 'Rate removed',
  TYPE_RATE_SET: 'Type rate set',
  DESIGN_CREATED: 'Design created',
  DESIGN_UPDATED: 'Design updated',
  DESIGN_DELETED: 'Design deleted',
  COMPONENT_SAVED: 'Component saved',
  COMPONENT_REMOVED: 'Component removed',
  ORDER_CREATED: 'Order created',
  ORDER_UPDATED: 'Order updated',
  ORDER_DELETED: 'Order deleted',
  ORDER_STATUS_CHANGED: 'Order status changed',
  ORDER_REPRICED: "Order re-priced with today's rates",
  ORDER_CORDS_SAVED: 'Cord denier / rate saved',
  PO_NAMES_SAVED: 'Purchase order names saved',
  DESIGN_COSTING_SAVED: 'Design costing saved',
  JOB_WORK_COSTING_SAVED: 'Job work costing saved',
  PRINT_CONFIG_SAVED: 'Print settings saved',
} as const;
export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** Kinds of records the audit log refers to (their History is shown on that record). */
export const AUDIT_ENTITY_TYPES = ['Order', 'Design', 'Material', 'Category', 'ComponentName', 'Rate', 'DesignCosting', 'JobWorkCosting', 'PrintConfig', 'User', 'Role', 'Department', 'Settings'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** Areas of the app, for filtering the audit log. */
export const AUDIT_MODULES = ['Auth', 'Users', 'Roles & departments', 'Global config', 'Material Master', 'Costing', 'Punching', 'Orders'] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

export function permissionGroup(code: PermissionCode): string {
  return Object.keys(PERMISSION_GROUPS).find((group) => PERMISSION_GROUPS[group]?.includes(code)) ?? 'Other';
}

/**
 * Material fields entered on each order instead of in Material Master (cord denier): a category with
 * such a field is a "cord" — its denier and rate per KG are entered per order, never in Material Master.
 */
export const isOrderEnteredField = (key: string): boolean => key.trim().toUpperCase() === 'DENIER';

/** Name of the app (header, login, browser tab). */
export const APP_NAME = 'Creative Embroidery ERP';

/** Markup a design starts with until its costing is saved (the Manager can change it per design). */
export const DEFAULT_COSTING_MARKUP_PERCENT = 7;

/** Stitch and laser heads of a size until the Manager enters others. */
export const DEFAULT_COSTING_HEADS = 1;

const RATE_COSTING_COLUMNS: readonly string[] = ['size', 'stitch', 'stitchRate', 'stitchHeads', 'stitchCost', 'laser', 'laserRate', 'laserHeads', 'laserCost', 'materialCost', 'base'];
const JOB_WORK_COLUMNS: readonly string[] = ['size', 'stitch', 'stitchRate', 'stitchHeads', 'stitchCost', 'laser', 'laserRate', 'laserHeads', 'laserCost', 'rate', 'included', 'excluded', 'final'];

/** Printed costing sheets: their columns in table order, and what they print until a Manager saves other settings. */
export const PRINT_SHEETS = {
  'rate-costing': { columns: RATE_COSTING_COLUMNS, defaults: { columns: RATE_COSTING_COLUMNS, totals: true } },
  'job-work': { columns: JOB_WORK_COLUMNS, defaults: { columns: ['size', 'final'] as readonly string[], totals: false } },
} as const;
export type PrintSheet = keyof typeof PRINT_SHEETS;

/** Copies printed of every purchase order, one per page, each headed with its department (in this order). */
export const PURCHASE_ORDER_COPIES = ['ACCOUNTS DEPARTMENT', 'PURCHASE DEPARTMENT', 'PRODUCTION DEPARTMENT', 'JOB DEPARTMENT'] as const;

/** Business name printed on the purchase order slip. */
export const COMPANY_NAME = 'CREATIVE EMBROIDERY';

export const ADMIN_ROLE = 'Admin';

/** Default roles created by the seed. Admin is always re-granted every permission. */
export const ROLES: Record<string, readonly PermissionCode[]> = {
  [ADMIN_ROLE]: PERMISSION_CODES,
  'Punching Employee': ['PUNCHING_VIEW', 'PUNCHING_CREATE', 'PUNCHING_UPDATE'],
  'Production Employee': ['PRODUCTION_VIEW', 'PRODUCTION_CREATE', 'PRODUCTION_UPDATE', 'PURCHASE_REQUIREMENT_VIEW'],
  'Production head': ['DESIGN_COSTING_VIEW', 'DESIGN_COSTING_MANAGE'],
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
