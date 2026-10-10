import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { createMaterial, deleteMaterial, listMaterials, updateMaterial, type MaterialBody } from './materials.api';

export const useMaterials = () => useQuery({ queryKey: queryKeys.materials, queryFn: listMaterials });

function useInvalidateMaterials() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.materials });
}

export function useSaveMaterial() {
  const invalidate = useInvalidateMaterials();
  return useMutation({
    mutationFn: ({ code, body, isNew }: { code: string; body: MaterialBody; isNew: boolean }) =>
      isNew ? createMaterial({ ...body, code }) : updateMaterial(code, body),
    onSuccess: invalidate,
  });
}

export function useDeleteMaterial() {
  const invalidate = useInvalidateMaterials();
  return useMutation({ mutationFn: deleteMaterial, onSuccess: invalidate });
}
