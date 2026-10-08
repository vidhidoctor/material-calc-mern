import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export interface User {
  name: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  roleId: Types.ObjectId | null;
  departmentId: Types.ObjectId | null;
  createdAt: Date;
}

const userSchema = new Schema<User>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', default: null, index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

export const UserModel = model<User>('User', userSchema, 'users');
export type UserDocument = HydratedDocument<User>;
