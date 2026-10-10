import type { DesignDetailDto } from '@app/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import {
  createDesign,
  deleteComponent,
  deleteDesign,
  getDesign,
  listDesigns,
  putComponent,
  updateDesign,
  type SizeRowBody,
} from './punching.api';

export const useDesigns = (q: string) =>
  useQuery({ queryKey: queryKeys.designList(q), queryFn: () => listDesigns(q), placeholderData: keepPreviousData });

export const useDesign = (designNo: string) => useQuery({ queryKey: queryKeys.design(designNo), queryFn: () => getDesign(designNo) });

/** Orders follow the design, so design changes also refresh Production, order figures and Purchase. */
function invalidateDesignDependents(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all(
    [queryKeys.designs, queryKeys.production, queryKeys.orders, queryKeys.purchase].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, refetchType: 'active' }),
    ),
  );
}

/** Store the fresh design returned by a mutation and refresh everything that depends on it. */
function useDesignSaved() {
  const queryClient = useQueryClient();
  return (design: DesignDetailDto) => {
    queryClient.setQueryData(queryKeys.design(design.designNo), design);
    return invalidateDesignDependents(queryClient);
  };
}

export function useCreateDesign() {
  const saved = useDesignSaved();
  return useMutation({ mutationFn: createDesign, onSuccess: saved });
}

export function useUpdateDesign(designNo: string) {
  const queryClient = useQueryClient();
  const saved = useDesignSaved();
  return useMutation({
    mutationFn: (body: { designNo?: string; productName?: string }) => updateDesign(designNo, body),
    onSuccess: (design) => {
      // A new number means a new URL; drop the old cache entry.
      if (design.designNo !== designNo) queryClient.removeQueries({ queryKey: queryKeys.design(designNo) });
      return saved(design);
    },
  });
}

export function useDeleteDesign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDesign,
    onSuccess: (_result, designNo) => {
      queryClient.removeQueries({ queryKey: queryKeys.design(designNo) });
      return invalidateDesignDependents(queryClient);
    },
  });
}

export function usePutComponent(designNo: string) {
  const saved = useDesignSaved();
  return useMutation({
    mutationFn: ({ name, sizes }: { name: string; sizes: SizeRowBody[] }) => putComponent(designNo, name, sizes),
    onSuccess: saved,
  });
}

export function useDeleteComponent(designNo: string) {
  const saved = useDesignSaved();
  return useMutation({ mutationFn: (name: string) => deleteComponent(designNo, name), onSuccess: saved });
}
