import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { createUser, deleteUser, listDepartments, listRoles, listUsers, updateUser, type CreateUserBody, type UpdateUserBody } from './users.api';

export const useUsers = () => useQuery({ queryKey: queryKeys.users, queryFn: listUsers });
export const useRoleOptions = () => useQuery({ queryKey: queryKeys.roles, queryFn: listRoles });
export const useDepartmentOptions = () => useQuery({ queryKey: queryKeys.departments, queryFn: listDepartments });

/** User changes also affect role/department user counts and possibly the current user. */
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.users }),
      queryClient.invalidateQueries({ queryKey: queryKeys.roles }),
      queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
      queryClient.invalidateQueries({ queryKey: queryKeys.me }),
    ]);
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: (body: CreateUserBody) => createUser(body), onSuccess: invalidate });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: UpdateUserBody }) => updateUser(id, body), onSuccess: invalidate });
}

export function useDeleteUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: (id: string) => deleteUser(id), onSuccess: invalidate });
}
