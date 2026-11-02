import type { AUDIT_ACTIONS, AuditEntityType } from '@app/shared';
import type { Request, RequestHandler, Response } from 'express';
import { logger } from '../../lib/logger.js';
import type { AuditChange } from './audit-log.model.js';
import { diffSnapshots } from './audit.diff.js';
import { AUDIT_ENTITIES, loadEntity } from './audit.entities.js';
import { recordAudit } from './audit.service.js';

interface AuditSpec {
  action: keyof typeof AUDIT_ACTIONS;
  entity: AuditEntityType;
  /** The record's id: from the request (update, delete) or, after a create, from the response body. */
  id: (req: Request, body?: unknown) => string | undefined;
  /** Extra context, e.g. the component saved. */
  detail?: (req: Request) => string | undefined;
  /** Changes not visible in the record itself, e.g. "password: changed". */
  extra?: (req: Request) => AuditChange[];
}

/**
 * Route-level audit: takes the record's snapshot before the request and again after a successful
 * response, and records who changed what (before → after). Failed requests (4xx/5xx) record nothing;
 * edits that changed nothing are not recorded. Business code stays untouched.
 */
export function audited(spec: AuditSpec): RequestHandler {
  return async (req, res, next) => {
    const idBefore = spec.id(req);
    const before = idBefore ? await loadEntity(spec.entity, idBefore) : null;

    let recorded = false;
    const record = async (body: unknown) => {
      if (recorded) return;
      recorded = true;
      if (res.statusCode >= 400) return;
      const id = spec.id(req, body) ?? idBefore;
      if (!id) return;
      const after = await loadEntity(spec.entity, id);
      const changes = [...diffSnapshots(before?.snapshot ?? null, after?.snapshot ?? null), ...(spec.extra?.(req) ?? [])];
      if (changes.length === 0) return;
      await recordAudit({
        req,
        action: spec.action,
        module: AUDIT_ENTITIES[spec.entity].module,
        entity: { type: spec.entity, id, label: after?.label ?? before?.label ?? id },
        detail: spec.detail?.(req) ?? null,
        changes,
      });
    };

    // Record just before the response leaves (the change is saved by then), then send it.
    const json = res.json.bind(res) as Response['json'];
    const end = res.end.bind(res) as (...args: unknown[]) => Response;
    res.json = ((body: unknown) => {
      void record(body)
        .catch((error) => logger.error('Audit failed', error))
        .finally(() => json(body));
      return res;
    }) as Response['json'];
    res.end = ((...args: unknown[]) => {
      void record(undefined)
        .catch((error) => logger.error('Audit failed', error))
        .finally(() => end(...args));
      return res;
    }) as Response['end'];
    next();
  };
}

/** A route parameter as a string, for audit ids and details. */
export const param = (name: string) => (req: Request) => String(req.params[name]);
