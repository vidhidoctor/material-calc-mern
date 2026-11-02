import type { AuditEntityType, AuditEventDto, AuditPageDto } from '@app/shared';
import { api } from '../../api/client';

export interface AuditFilters {
  /** ISO instants (local midnights); "to" exclusive. */
  from?: string;
  to?: string;
  user?: string;
  module?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export const listAuditLog = (filters: AuditFilters) => api<AuditPageDto>('/audit-logs', { query: { ...filters } });

/** One record's history, newest first (costs hidden without COST_VIEW). */
export const getEntityHistory = (type: AuditEntityType, id: string) =>
  api<AuditEventDto[]>(`/audit-logs/entity/${type}/${encodeURIComponent(id)}`);
