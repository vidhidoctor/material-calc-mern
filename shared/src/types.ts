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
  /** Step shown in the order details (e.g. CD for sequences); null = the purchase step. */
  orderStep: string | null;
  /** The order total in that step is rounded up to whole units (e.g. whole CDs). */
  wholeUnits: boolean;
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
  /** Consumption (category unit, e.g. PCS) per column. */
  requirements: Record<string, DecimalString>;
  /** The same in the column's order unit (e.g. CD, KG), not rounded. */
  purchase: Record<string, DecimalString>;
}

export interface OrderSummaryColumnDto extends VariantColumnDto {
  /** Category code. */
  category: string;
  /** Label of the unit the order shows (e.g. CD, KG); null when the conversion is not configured. */
  orderUnit: string | null;
  /** The order total is rounded up to whole units. */
  wholeUnits: boolean;
  /** Why the conversion could not be made (e.g. a missing rule), if so. */
  error?: string;
}

export interface OrderSummaryComponentDto {
  component: string;
  quantity: number;
  /** Consumption (category unit) per column for this component. */
  requirements: Record<string, DecimalString>;
  /** Order unit per column for this component, not rounded. */
  purchase: Record<string, DecimalString>;
}

export interface OrderSummaryDto {
  orderNo: number;
  /** Material + colour columns that this order requires. */
  columns: OrderSummaryColumnDto[];
  rows: OrderSummaryRowDto[];
  components: OrderSummaryComponentDto[];
  /** Consumption totals (category unit). */
  totals: Record<string, DecimalString>;
  /** Order-unit totals, worked out from the total consumption (no rounding of rows). */
  purchaseTotals: Record<string, DecimalString>;
  /** What to buy: the order-unit total, rounded up for whole-unit columns. */
  buy: Record<string, DecimalString>;
  errors: string[];
}

// ---- Purchase order (print slip) ----

export interface PurchaseOrderRowDto {
  /** Stable id of the row, used to save its Name ("C:KALI::SEQ-3MM|WHITE"). */
  id: string;
  /** Material name (or code), e.g. "3 MM" or "SEQ-3MM". */
  label: string;
  /** Colour · type, e.g. "WHITE · PURE GLASS"; empty when none. */
  detail: string;
  /** Quantity to buy in the purchase unit (CD rounded up to whole units, KG); null when not convertible. */
  qty: DecimalString | null;
  /** Purchase unit, e.g. CD or KG; null when not convertible. */
  unit: string | null;
  /** Total consumption for the order (pieces, metres). */
  totalQty: DecimalString;
  /** Consumption unit, e.g. PCS or MTR. */
  totalUnit: string;
  /** Entered on the website; printed exactly as entered. */
  name: string;
}

export interface PurchaseOrderSectionDto {
  /** "C:<component>" (per component, e.g. sequences) or "K:<category>" (whole order, e.g. beads). */
  id: string;
  title: string;
  /** First column heading, e.g. "Sequence" or "Material". */
  itemHeader: string;
  /** Purchase unit of every row when they share one (e.g. CD), else null. */
  unit: string | null;
  rows: PurchaseOrderRowDto[];
}

export interface PurchaseOrderDto {
  orderNo: number;
  partyOrderNo: number;
  designNo: string;
  item: string;
  party: string;
  orderDate: string;
  sections: PurchaseOrderSectionDto[];
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

/**
 * Rate table of a typed category, like the sequence rate sheet: rows = materials (sizes) with their
 * editable conversion values, columns = types (roll price editable), cells = calculated costs.
 */
export interface TypeRateTableDto {
  category: string;
  categoryName: string;
  /** Consumption unit (e.g. PCS = one sequence). */
  unit: string;
  /** What a type rate is per (e.g. "Rolls"). */
  purchaseUnit: string;
  fields: { key: string; label: string; required: boolean }[];
  /** Formula steps except the purchase step (e.g. CD): costs can also be shown per one of these. */
  steps: { key: string; label: string }[];
  types: { type: string; basicRate: number | null; gstPercent: number | null; rateInclGst: DecimalString | null }[];
  materials: {
    code: string;
    rules: Record<string, number>;
    /** type → cost per consumption unit and per step unit (e.g. per CD); null = no rate / not computable. */
    costs: Record<string, { perUnit: DecimalString | null; perStep: Record<string, DecimalString> }>;
  }[];
}

/**
 * Material detail per component + size + column (e.g. the cording sheet: metres per piece, denier,
 * grams/KG per piece, target pieces, total KG, rate per KG, amount).
 */
export interface MaterialBreakdownDto {
  categories: {
    code: string;
    name: string;
    unit: string;
    purchaseStep: string;
    steps: { key: string; label: string; formula: string }[];
    fields: { key: string; label: string }[];
  }[];
  rows: {
    category: string;
    component: string;
    size: string;
    key: string;
    code: string;
    color: string | null;
    /** Order only: the type chosen for this column (e.g. MATT). */
    type: string | null;
    /** The material's field values (e.g. denier). */
    fields: Record<string, number>;
    /** Quantity per piece in the category unit (e.g. metres). */
    perPiece: DecimalString;
    /** Every formula step for one piece (e.g. GRAMS, KG). */
    perPieceSteps: Record<string, DecimalString>;
    /** Order only: pieces ordered of this component + size. */
    pieces: number | null;
    total: DecimalString | null;
    totalSteps: Record<string, DecimalString> | null;
    /** Admin only: rate per purchase unit (e.g. per KG) and amount. */
    ratePerPurchaseUnit: DecimalString | null;
    amount: DecimalString | null;
    error?: string;
  }[];
}
