import type { AuditEntityType } from '@app/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { getEntityHistory, listAuditLog, type AuditFilters } from './audit.api';

export const useAuditLog = (filters: AuditFilters) =>
  useQuery({ queryKey: queryKeys.auditLog(filters), queryFn: () => listAuditLog(filters), placeholderData: keepPreviousData });

/** Always fresh when opened: the record may have just changed. */
export const useEntityHistory = (type: AuditEntityType, id: string, enabled = true) =>
  useQuery({ queryKey: queryKeys.entityHistory(type, id), queryFn: () => getEntityHistory(type, id), enabled, refetchOnMount: 'always' });
