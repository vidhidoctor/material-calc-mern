import type { JobWorkCalculationDto, JobWorkCostingDto, JobWorkInputDto } from '@app/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryKeys } from '../../lib/query-keys';

const path = (designNo: string) => `/job-work-costing/${encodeURIComponent(designNo)}`;

export const useJobWorkCosting = (designNo: string) =>
  useQuery({ queryKey: queryKeys.jobWork(designNo), queryFn: () => api<JobWorkCostingDto>(path(designNo)) });

/** Figures for the unsaved entries; the previous figures stay until the new ones arrive. */
export const useJobWorkPreview = (designNo: string, body: JobWorkInputDto, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.jobWorkPreview(designNo, body),
    queryFn: () => api<JobWorkCalculationDto>(`${path(designNo)}/preview`, { method: 'POST', body }),
    placeholderData: keepPreviousData,
    enabled,
    retry: false,
  });

export function useSaveJobWorkCosting(designNo: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JobWorkInputDto) => api<JobWorkCostingDto>(path(designNo), { method: 'PUT', body }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(queryKeys.jobWork(designNo), saved);
      await queryClient.invalidateQueries({ queryKey: queryKeys.audit, refetchType: 'active' });
    },
  });
}
