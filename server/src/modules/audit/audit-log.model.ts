import { model, Schema, type HydratedDocument } from 'mongoose';

export interface AuditChange {
  field: string;
  from: string | null;
  to: string | null;
}

/** One recorded event. Append-only: entries are never changed or deleted (see the hooks below). */
export interface AuditLog {
  at: Date;
  actor: { id: string | null; name: string; email: string; role: string | null } | null;
  action: string;
  module: string;
  entity: { type: string; id: string; label: string } | null;
  detail: string | null;
  changes: AuditChange[];
  ip: string | null;
  userAgent: string | null;
}

const changeSchema = new Schema<AuditChange>({ field: String, from: { type: String, default: null }, to: { type: String, default: null } }, { _id: false });

const auditLogSchema = new Schema<AuditLog>(
  {
    at: { type: Date, required: true, default: () => new Date() },
    actor: {
      type: new Schema({ id: { type: String, default: null }, name: String, email: String, role: { type: String, default: null } }, { _id: false }),
      default: null,
    },
    action: { type: String, required: true },
    module: { type: String, required: true },
    entity: { type: new Schema({ type: String, id: String, label: String }, { _id: false }), default: null },
    detail: { type: String, default: null },
    changes: { type: [changeSchema], default: [] },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { versionKey: false },
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ 'entity.type': 1, 'entity.id': 1, at: -1 });
auditLogSchema.index({ 'actor.email': 1, at: -1 });
auditLogSchema.index({ module: 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });

// Append-only: nothing may change or remove an entry once written.
const APPEND_ONLY = 'Audit log entries cannot be changed or deleted.';
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  auditLogSchema.pre(op, { document: false, query: true }, () => {
    throw new Error(APPEND_ONLY);
  });
}
auditLogSchema.pre('deleteOne', { document: true, query: false }, () => {
  throw new Error(APPEND_ONLY);
});
auditLogSchema.pre('save', function () {
  if (!this.isNew) throw new Error(APPEND_ONLY);
});

export const AuditLogModel = model<AuditLog>('AuditLog', auditLogSchema, 'auditLogs');
export type AuditLogDocument = HydratedDocument<AuditLog>;
