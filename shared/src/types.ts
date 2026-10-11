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
  /** Types chosen per order in Production (e.g. MATT, METAL, PURE GLASS); empty = no types. */
  types: string[];
  materialCount: number;
}

// ---- Materials ----

export interface MaterialColumnDto {
  code: string;
  name: string;
  /** Category code. */
  category: string;
  unit: string;
  /**
   * The category has types chosen per order in Production (e.g. sequence finish). Punching must then
   * enter a colour for every column of this material.
   */
  typed: boolean;
}

export interface MaterialDto extends MaterialColumnDto {
  categoryName: string;
  sortOrder: number;
  /** Values of the category's fields, e.g. { seqPerCd: 31600, cdPerRoll: 210 }. */
  rules: Record<string, number>;
}

// ---- Designs (Punching) ----

/** Variant key (material code, or "CODE|COLOR") → quantity per piece (zeros omitted). */
export type Consumption = Record<string, number>;

/** A consumption column: a material, optionally in a colour (key "SEQ-3MM|WHITE", see variants.ts). */
export interface VariantColumnDto {
  key: string;
  code: string;
  color: string | null;
  unit: string;
}

export interface DesignSizeDto {
  size: string;
  stitch: number;
  laser: number | null;
  consumption: Consumption;
}

export interface DesignComponentDto {
  name: string;
  /** Columns chosen for this component (shared by its sizes): variant keys such as "SEQ-3MM|WHITE". */
  columns: string[];
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
  /** Types to choose from per order, for each typed category the design uses (e.g. Sequence finish). */
  typeOptions: { category: string; name: string; types: string[] }[];
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
  /** Type chosen for each typed column of this order (column key "SEQ-3MM|PINK" → "MATT"). */
  types: Record<string, string>;
}

export interface OrderSummaryRowDto {
  component: string;
  size: string;
  quantity: number;
  requirements: Record<string, DecimalString>;
}

export interface OrderSummaryDto {
  orderNo: number;
  /** Material + colour columns that this order requires. */
  columns: VariantColumnDto[];
  rows: OrderSummaryRowDto[];
  totals: Record<string, DecimalString>;
  errors: string[];
}

// ---- Purchase requirements ----

export interface PurchaseTotalDto extends MaterialColumnDto {
  /** Purchase key: material code, "CODE|COLOR", or with the order type "CODE|COLOR^TYPE". */
  key: string;
  color: string | null;
  /** Type chosen in the order(s), e.g. MATT; null = no type (or not chosen yet). */
  type: string | null;
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

// ---- Costing (₹, Admin only: COST_VIEW) ----

export interface MaterialRateDto {
  /** Variant key: material code, or "CODE|COLOUR" for a colour-specific rate. */
  key: string;
  code: string;
  color: string | null;
  /** Category code (its fields are the conversion values, e.g. Pieces per KG). */
  category: string;
  /** The material conversion values used in the cost (e.g. Pieces per KG 80,000). */
  fields: { key: string; label: string; required: boolean; value: number | null }[];
  /** Consumption unit (PCS, MTR …). */
  unit: string;
  /** What the rate is per, from the category purchase step (e.g. "KG", "Rolls"). */
  purchaseUnit: string;
  /** Rate entered for this key; null when not set. */
  basicRate: number | null;
  gstPercent: number | null;
  /** True when a colour has no rate of its own and uses its material rate. */
  inherited: boolean;
  rateInclGst: DecimalString | null;
  /** Cost of one consumption unit (one piece, one metre …). */
  costPerUnit: DecimalString | null;
  error?: string;
}

export interface DesignCostSizeDto {
  size: string;
  /** Column key → cost per piece (quantity × cost per unit). */
  costs: Record<string, DecimalString>;
  /** Total material cost of one piece of this size. */
  total: DecimalString;
}

export interface DesignCostDto {
  designNo: string;
  /** Column key → current cost per unit (null = no rate). */
  unitCosts: Record<string, DecimalString | null>;
  components: { name: string; sizes: DesignCostSizeDto[] }[];
  errors: string[];
}

export interface OrderCostDto {
  orderNo: number;
  /** Total material cost of the order. */
  total: DecimalString;
  /** Average material cost per piece (total ÷ pieces). */
  perPiece: DecimalString;
  components: { component: string; quantity: number; cost: DecimalString }[];
  rows: { component: string; size: string; quantity: number; cost: DecimalString }[];
  /** True when some rates were not saved with the order (older orders): current rates were used. */
  usesCurrentRates: boolean;
  errors: string[];
}

/** Rate of one type of a category (e.g. Sequence · PURE GLASS ₹8,000 per roll + 5%), Admin only. */
export interface TypeRateDto {
  category: string;
  categoryName: string;
  type: string;
  /** What the rate is per (category purchase step, e.g. "Rolls"). */
  purchaseUnit: string;
  /** Consumption unit (e.g. PCS). */
  unit: string;
  basicRate: number | null;
  gstPercent: number | null;
  rateInclGst: DecimalString | null;
  /** Cost of one consumption unit of each material of the category with this type (like the rate sheet). */
  perMaterial: { code: string; costPerUnit: DecimalString | null }[];
}
