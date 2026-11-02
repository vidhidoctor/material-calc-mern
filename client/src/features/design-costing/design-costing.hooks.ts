import type { DesignCostingInputDto } from '@app/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { getDesignCosting, listDesignCostings, previewDesignCosting, saveDesignCosting } from './design-costing.api';

export const useDesignCostings = (q: string) =>
  useQuery({ queryKey: queryKeys.designCostingList(q), queryFn: () => listDesignCostings(q), placeholderData: keepPreviousData });

export const useDesignCosting = (designNo: string) => useQuery({ queryKey: queryKeys.designCosting(designNo), queryFn: () => getDesignCosting(designNo) });

/** Figures for the unsaved entries; the previous figures stay until the new ones arrive. */
export const useDesignCostingPreview = (designNo: string, body: DesignCostingInputDto, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.designCostingPreview(designNo, body),
    queryFn: () => previewDesignCosting(designNo, body),
    placeholderData: keepPreviousData,
    enabled,
    retry: false,
  });

export function useSaveDesignCosting(designNo: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DesignCostingInputDto) => saveDesignCosting(designNo, body),
    onSuccess: async (saved) => {
      queryClient.setQueryData(queryKeys.designCosting(designNo), saved);
      await queryClient.invalidateQueries({ queryKey: queryKeys.designCostingPrefix, refetchType: 'none' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.audit, refetchType: 'active' });
      // Job work costs read the sequence types and cord values chosen here.
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobWorkPrefix, refetchType: 'active' });
    },
  });
}
