import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { createDepartment, listDepartments } from './departments.api';

export const useDepartments = () => useQuery({ queryKey: queryKeys.departments, queryFn: listDepartments });

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDepartment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
  });
}
