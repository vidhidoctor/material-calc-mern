// API response DTOs shared by client and server.
// Calculated quantities are decimal strings (decimal.js on the server); display rounds to 2 decimals.
import type { OrderStatus, PermissionCode } from './constants.js';

export type DecimalString = string;

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface MessageResponse {
  message: string;
}

export interface IdName {
  id: string;
  name: string;
}

// ---- Auth ----

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: IdName | null;
  department: IdName | null;
  permissions: PermissionCode[];
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export interface ForgotPasswordResponse extends MessageResponse {
  /** Only outside production, until an email service exists. */
  devResetToken?: string;
}

// ---- Admin ----

export interface UserDto {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  /** Signed up and waiting for Admin activation (inactive, no role yet). */
  pending: boolean;
  role: IdName | null;
  department: IdName | null;
  createdAt: string;
}

export interface RoleDto {
  id: string;
  name: string;
  permissions: PermissionCode[];
  userCount: number;
}

export interface PermissionDto {
  code: PermissionCode;
  description: string;
  group: string;
}

export interface DepartmentDto {
  id: string;
  name: string;
  userCount: number;
}

// ---- Global config ----

export interface AdminEmailDto {
  email: string;
  name: string;
  /** The Admin created by the seed from server/.env; cannot be removed here. */
  primary: boolean;
  /** Account status for this email (null = no account). */
  account: { id: string; isActive: boolean; isAdmin: boolean } | null;
  addedAt: string;
  addedBy: string | null;
}

export interface SettingsDto {
  adminEmails: AdminEmailDto[];
}

// ---- Material categories (admin-configurable formulas) ----

export interface CategoryFieldDto {
  /** Name used in formulas, e.g. "seqPerCd". */
  key: string;
  label: string;
  required: boolean;
  missingMessage: string | null;
}

export interface CategoryStepDto {
  /** Name of the result, usable in later steps, e.g. "CD". */
  key: string;
  label: string;
  /** e.g. "TOTAL / seqPerCd" (TOTAL = the material's required quantity). */
  formula: string;
}

export interface MaterialCategoryDto {
  code: string;
  name: string;
  /** Unit of consumption and required quantity, e.g. PCS or MTR. */
  unit: string;
  sortOrder: number;
  fields: CategoryFieldDto[];
  steps: CategoryStepDto[];
  /** Key of the step that is the quantity to purchase. */
  purchaseStep: string;
  materialCount: number;
}

// ---- Materials ----

export interface MaterialColumnDto {
  code: string;
  name: string;
  /** Category code. */
  category: string;
  unit: string;
}

export interface MaterialDto extends MaterialColumnDto {
  categoryName: string;
  sortOrder: number;
  /** Values of the category's fields, e.g. { seqPerCd: 31600, cdPerRoll: 210 }. */
  rules: Record<string, number>;
}

// ---- Designs (Punching) ----

/** materialCode → quantity per piece (zeros omitted). */
export type Consumption = Record<string, number>;

export interface DesignSizeDto {
  size: string;
  stitch: number;
  laser: number | null;
  consumption: Consumption;
}

export interface DesignComponentDto {
  name: string;
  /** Material columns chosen for this component (shared by its sizes), in Material Master order. */
  materials: string[];
  sizes: DesignSizeDto[];
}

export interface DesignDto {
  designNo: string;
  productName: string;
  createdAt: string;
  components: DesignComponentDto[];
}

export interface DesignDetailDto extends DesignDto {
  materials: MaterialColumnDto[];
}

export interface DesignListItemDto {
  designNo: string;
  productName: string;
  createdAt: string;
  components: { name: string; sizes: string[] }[];
}

// ---- Production ----

export interface ProductionDesignListItemDto extends DesignListItemDto {
  entries: number;
  orders: number;
}

export interface PreviousOrderDto {
  /** Internal id (links). */
  orderNo: number;
  /** Per design + party: 1, 2, 3 … (shown as "ABC-1"). */
  partyOrderNo: number;
  party: string;
  quantity: number | null;
  totalPieces: number;
  status: OrderStatus;
  orderDate: string;
}

export interface ProductionDesignDetailDto extends DesignDetailDto {
  previousOrders: PreviousOrderDto[];
}

/** Orders follow the design: consumption is always read from the design's current values. */
export interface OrderLineDto {
  component: string;
  size: string;
  quantity: number;
}

export interface OrderListItemDto {
  /** Internal id (links). */
  orderNo: number;
  /** Per design + party: 1, 2, 3 … (shown as "ABC-1"). */
  partyOrderNo: number;
  designNo: string;
  item: string;
  party: string;
  orderDate: string;
  /** null = quantities differ per row. */
  quantity: number | null;
  totalPieces: number;
  status: OrderStatus;
  createdAt: string;
}

export interface OrderDto extends OrderListItemDto {
  lines: OrderLineDto[];
}

export interface OrderSummaryRowDto {
  component: string;
  size: string;
  quantity: number;
  requirements: Record<string, DecimalString>;
}

export interface OrderSummaryDto {
  orderNo: number;
  materials: MaterialColumnDto[];
  rows: OrderSummaryRowDto[];
  totals: Record<string, DecimalString>;
  errors: string[];
}

// ---- Purchase requirements ----

export interface PurchaseTotalDto extends MaterialColumnDto {
  /** Required quantity in the category unit. */
  total: DecimalString;
  rules: Record<string, number>;
  /** Every formula step's value (step key → value); null when it could not be calculated. */
  values: Record<string, DecimalString> | null;
  /** The purchase step's value. */
  purchase: DecimalString | null;
  error?: string;
}

export interface PurchaseCategoryDto {
  code: string;
  name: string;
  unit: string;
  fields: { key: string; label: string }[];
  steps: CategoryStepDto[];
  purchaseStep: string;
}

export interface PurchaseRequirementDto {
  orderNos: number[];
  components: string[];
  /** Categories in display order (one section each). */
  categories: PurchaseCategoryDto[];
  totals: PurchaseTotalDto[];
  errors: string[];
}
