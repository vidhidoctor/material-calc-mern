import type { PermissionCode } from '@app/shared';
import { model, Schema, type HydratedDocument } from 'mongoose';

export interface Role {
  name: string;
  permissions: PermissionCode[];
}

const roleSchema = new Schema<Role>(
  {
    name: { type: String, required: true, trim: true },
    permissions: { type: [String], default: [] },
  },
  { versionKey: false },
);

// Role names are unique ignoring case.
roleSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const RoleModel = model<Role>('Role', roleSchema, 'roles');
export type RoleDocument = HydratedDocument<Role>;
