import type { PrintConfigDto, PrintSheet } from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryKeys } from '../../lib/query-keys';

const path = (sheet: PrintSheet) => `/print-config/${sheet}`;

export const usePrintConfig = (sheet: PrintSheet) => useQuery({ queryKey: queryKeys.printConfig(sheet), queryFn: () => api<PrintConfigDto>(path(sheet)) });

export function useSavePrintConfig(sheet: PrintSheet) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { columns: string[]; totals: boolean; materials: string[] }) => api<PrintConfigDto>(path(sheet), { method: 'PUT', body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.printConfig(sheet), saved);
      return queryClient.invalidateQueries({ queryKey: queryKeys.audit, refetchType: 'active' });
    },
  });
}
