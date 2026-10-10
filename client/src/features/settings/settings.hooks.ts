import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { addAdminEmail, getSettings, removeAdminEmail } from './settings.api';

export const useSettings = () => useQuery({ queryKey: queryKeys.settings, queryFn: getSettings });

/** Admin list changes create, promote or deactivate accounts, so users and role counts change too. */
function useInvalidateSettings() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
      queryClient.invalidateQueries({ queryKey: queryKeys.users }),
      queryClient.invalidateQueries({ queryKey: queryKeys.roles }),
      queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
    ]);
}

export function useAddAdminEmail() {
  const invalidate = useInvalidateSettings();
  return useMutation({ mutationFn: addAdminEmail, onSuccess: invalidate });
}

export function useRemoveAdminEmail() {
  const invalidate = useInvalidateSettings();
  return useMutation({ mutationFn: removeAdminEmail, onSuccess: invalidate });
}
