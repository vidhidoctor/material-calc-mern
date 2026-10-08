import { model, Schema, type Types } from 'mongoose';

export interface Session {
  tokenHash: string;
  userId: Types.ObjectId;
  expiresAt: Date;
}

const sessionSchema = new Schema<Session>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // TTL index: MongoDB removes the session once expiresAt has passed.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);

export const SessionModel = model<Session>('Session', sessionSchema, 'sessions');
