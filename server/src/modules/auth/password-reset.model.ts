import { model, Schema, type Types } from 'mongoose';

export interface PasswordReset {
  tokenHash: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  usedAt: Date | null;
}

const passwordResetSchema = new Schema<PasswordReset>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { versionKey: false },
);

export const PasswordResetModel = model<PasswordReset>('PasswordReset', passwordResetSchema, 'passwordResets');
