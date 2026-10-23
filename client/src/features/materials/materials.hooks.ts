import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import {
  addComponentName,
  createCategory,
  deleteComponentName,
  listComponentNames,
  createMaterial,
  deleteCategory,
  deleteMaterial,
  listCategories,
  listMaterials,
  updateCategory,
  updateMaterial,
  type CategoryBody,
  type MaterialBody,
} from './materials.api';

export const useMaterials = () => useQuery({ queryKey: queryKeys.materials, queryFn: listMaterials });
export const useCategories = () => useQuery({ queryKey: queryKeys.materialCategories, queryFn: listCategories });

/** Materials and categories feed every consumption column and every purchase figure. */
function useInvalidateMaterials() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [queryKeys.materials, queryKeys.materialCategories, queryKeys.purchase, queryKeys.designs, queryKeys.production, queryKeys.orders, queryKeys.costing].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
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

export function useSaveCategory() {
  const invalidate = useInvalidateMaterials();
  return useMutation({
    mutationFn: ({ code, body, isNew }: { code: string; body: CategoryBody; isNew: boolean }) =>
      isNew ? createCategory({ ...body, code }) : updateCategory(code, body),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateMaterials();
  return useMutation({ mutationFn: deleteCategory, onSuccess: invalidate });
}

/** Punching's component list; also used by the component editor's dropdown. */
export const useComponentNames = (enabled = true) => useQuery({ queryKey: queryKeys.componentNames, queryFn: listComponentNames, enabled });

function useSetComponentNames() {
  const queryClient = useQueryClient();
  return (list: Awaited<ReturnType<typeof listComponentNames>>) => queryClient.setQueryData(queryKeys.componentNames, list);
}

export function useAddComponentName() {
  const set = useSetComponentNames();
  return useMutation({ mutationFn: addComponentName, onSuccess: set });
}

export function useDeleteComponentName() {
  const set = useSetComponentNames();
  return useMutation({ mutationFn: deleteComponentName, onSuccess: set });
}
