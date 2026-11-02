import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AUDIT_MODULES } from '@app/shared';
import { z } from 'zod';

const instant = z.iso.datetime({ offset: true, error: 'Use a valid date and time.' });
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

export const auditQuery = z.object({
  from: instant.optional(),
  to: instant.optional(),
  user: text(100),
  module: z.enum(AUDIT_MODULES, { error: 'Unknown module.' }).optional(),
  action: z.enum(Object.keys(AUDIT_ACTIONS) as [string, ...string[]], { error: 'Unknown action.' }).optional(),
  entityType: z.enum(AUDIT_ENTITY_TYPES, { error: 'Unknown record type.' }).optional(),
  entityId: text(200),
  q: text(100),
  page: z.coerce.number().int().min(1).default(1),
  /** Up to 5,000 for an export. */
  pageSize: z.coerce.number().int().min(1).max(5000).default(50),
});
export type AuditQuery = z.infer<typeof auditQuery>;

export const entityHistoryParams = z.object({
  type: z.enum(AUDIT_ENTITY_TYPES, { error: 'Unknown record type.' }),
  id: z.string().trim().min(1).max(200),
});
