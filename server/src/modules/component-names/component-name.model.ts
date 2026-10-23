import { model, Schema, type HydratedDocument } from 'mongoose';

/** A component offered in Punching's "Component" dropdown (KALI, BLOUSE …), managed in Material Master. */
export interface ComponentName {
  /** Upper-case, trimmed, unique. */
  name: string;
  sortOrder: number;
  createdAt: Date;
}

const componentNameSchema = new Schema<ComponentName>(
  {
    name: { type: String, required: true, unique: true },
    sortOrder: { type: Number, default: 0 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

export const ComponentNameModel = model<ComponentName>('ComponentName', componentNameSchema, 'componentNames');
export type ComponentNameDocument = HydratedDocument<ComponentName>;
