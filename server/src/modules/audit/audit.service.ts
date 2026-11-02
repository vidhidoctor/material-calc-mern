import { AUDIT_ACTIONS, type AuditEntityType, type AuditEventDto, type AuditPageDto, type PermissionCode } from '@app/shared';
import type { Request } from 'express';
import type { FilterQuery } from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';
import { AUDIT_ENTITIES } from './audit.entities.js';
import { AuditLogModel, type AuditChange, type AuditLog } from './audit-log.model.js';
import type { AuditQuery } from './audit.validation.js';

export type Actor = AuditLog['actor'];

/** Who is making this request (from the session), or null. */
export function actorOf(req: Request): Actor {
  const auth = req.auth;
  if (!auth) return null;
  return { id: String(auth.user._id), name: auth.user.name, email: auth.user.email, role: auth.role?.name ?? null };
}

export interface RecordInput {
  req?: Request;
  /** Defaults to the request's user. */
  actor?: Actor;
  action: keyof typeof AUDIT_ACTIONS;
  module: string;
  entity?: { type: AuditEntityType; id: string; label: string } | null;
  detail?: string | null;
  changes?: AuditChange[];
}

/** Writes one audit event. Never fails the request: a write error is logged instead. */
export async function recordAudit(input: RecordInput): Promise<void> {
  try {
    await AuditLogModel.create({
      at: new Date(),
      actor: input.actor !== undefined ? input.actor : input.req ? actorOf(input.req) : null,
      action: input.action,
      module: input.module,
      entity: input.entity ?? null,
      detail: input.detail ?? null,
      changes: input.changes ?? [],
      ip: input.req?.ip ?? null,
      userAgent: input.req?.get('user-agent')?.slice(0, 300) ?? null,
    });
  } catch (error) {
    logger.error('Audit log write failed', error);
  }
}

function toDto(doc: AuditLog & { _id: unknown }): AuditEventDto {
  return {
    id: String(doc._id),
    at: doc.at.toISOString(),
    actor: doc.actor ? { id: doc.actor.id ?? null, name: doc.actor.name, email: doc.actor.email, role: doc.actor.role ?? null } : null,
    action: doc.action,
    actionLabel: AUDIT_ACTIONS[doc.action as keyof typeof AUDIT_ACTIONS] ?? doc.action,
    module: doc.module,
    entity: doc.entity ? { type: doc.entity.type, id: doc.entity.id, label: doc.entity.label } : null,
    detail: doc.detail ?? null,
    changes: (doc.changes ?? []).map((c) => ({ field: c.field, from: c.from ?? null, to: c.to ?? null })),
    ip: doc.ip ?? null,
  };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Audit log page (newest first) with filters; for the Admin → Audit Log screen. */
export async function listAudit(query: AuditQuery): Promise<AuditPageDto> {
  const filter: FilterQuery<AuditLog> = {};
  // from / to are exact instants (the browser's local midnights), "to" exclusive.
  if (query.from || query.to) {
    filter.at = {};
    if (query.from) filter.at.$gte = new Date(query.from);
    if (query.to) filter.at.$lt = new Date(query.to);
  }
  if (query.module) filter.module = query.module;
  if (query.action) filter.action = query.action;
  if (query.entityType) filter['entity.type'] = query.entityType;
  if (query.entityId) filter['entity.id'] = query.entityId;
  if (query.user) {
    const user = new RegExp(escape(query.user), 'i');
    filter.$or = [{ 'actor.email': user }, { 'actor.name': user }];
  }
  if (query.q) {
    const q = new RegExp(escape(query.q), 'i');
    filter.$and = [{ $or: [{ 'entity.label': q }, { 'entity.id': q }, { detail: q }] }];
  }
  const [docs, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ at: -1, _id: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);
  return { items: docs.map(toDto), total, page: query.page, pageSize: query.pageSize };
}

const MASK = '•••';

/**
 * History of one record, newest first. Allowed with AUDIT_VIEW or the permission that shows that record;
 * cost fields are hidden from users without COST_VIEW.
 */
export async function entityHistory(type: AuditEntityType, id: string, permissions: Set<PermissionCode>): Promise<AuditEventDto[]> {
  const def = AUDIT_ENTITIES[type];
  if (!permissions.has('AUDIT_VIEW') && !def.viewers.some((p) => permissions.has(p))) throw new AppError(403, 'You do not have permission to view this history.');
  const docs = await AuditLogModel.find({ 'entity.type': type, 'entity.id': id }).sort({ at: -1, _id: -1 }).limit(200).lean();
  const hideCosts = !permissions.has('COST_VIEW') && def.costFields;
  return docs.map(toDto).map((event) =>
    hideCosts
      ? {
          ...event,
          changes: event.changes.map((c) =>
            def.costFields!.test(c.field) || def.costFields!.test(c.field.split(' › ').at(-1) ?? '')
              ? { ...c, from: c.from === null ? null : MASK, to: c.to === null ? null : MASK }
              : c,
          ),
        }
      : event,
  );
}
