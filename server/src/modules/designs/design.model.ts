import { model, Schema, type HydratedDocument } from 'mongoose';

/**
 * Consumption is stored as a list because material codes may contain dots ("BEAD-2.5MM"),
 * which MongoDB does not allow in field names. The API exposes it as { [code]: qty }.
 */
export interface ConsumptionItem {
  material: string;
  /** Colour variant entered in Punching (e.g. WHITE); null = the plain material. */
  color: string | null;
  qty: number;
}

export interface DesignSize {
  size: string;
  stitch: number;
  laser: number | null;
  consumption: ConsumptionItem[];
}

export interface DesignComponent {
  name: string;
  /**
   * Columns chosen for this component (shared by all its sizes): variant keys such as "SEQ-3MM" or
   * "SEQ-3MM|WHITE", in Material Master order. Undefined on components saved before columns were
   * selectable: then the used materials apply.
   */
  materials?: string[];
  sizes: DesignSize[];
}

export interface Design {
  designNo: string;
  /** designNo without spaces and dashes, for search ("2649" finds "26-49"). */
  searchKey: string;
  productName: string;
  createdAt: Date;
  components: DesignComponent[];
}

const consumptionSchema = new Schema<ConsumptionItem>(
  {
    material: { type: String, required: true },
    color: { type: String, default: null },
    qty: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const sizeSchema = new Schema<DesignSize>(
  {
    size: { type: String, required: true },
    stitch: { type: Number, required: true, min: 0 },
    laser: { type: Number, default: null, min: 0 },
    consumption: { type: [consumptionSchema], default: [] },
  },
  { _id: false },
);

const componentSchema = new Schema<DesignComponent>(
  {
    name: { type: String, required: true },
    materials: { type: [String], default: undefined },
    sizes: { type: [sizeSchema], default: [] },
  },
  { _id: false },
);

const designSchema = new Schema<Design>(
  {
    designNo: { type: String, required: true, unique: true },
    searchKey: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
    components: { type: [componentSchema], default: [] },
  },
  { versionKey: false },
);

export const DesignModel = model<Design>('Design', designSchema, 'designs');
export type DesignDocument = HydratedDocument<Design>;
