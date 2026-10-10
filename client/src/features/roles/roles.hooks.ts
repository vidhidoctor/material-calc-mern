import type { PermissionCode } from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { createRole, listPermissions, listRoles, setRolePermissions } from './roles.api';

export const useRoles = () => useQuery({ queryKey: queryKeys.roles, queryFn: listRoles });
export const usePermissions = () => useQuery({ queryKey: queryKeys.permissions, queryFn: listPermissions, staleTime: Infinity });

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.roles }),
  });
}

export function useSetRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: PermissionCode[] }) => setRolePermissions(id, permissions),
    // Editing your own role changes what you can see.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.roles }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      ]),
  });
}
