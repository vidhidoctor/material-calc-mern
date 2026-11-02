import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { shouldRetry } from '../api/client';
import { AuthProvider } from '../lib/auth';
import { queryKeys } from '../lib/query-keys';
import { router } from './router';

export function Providers() {
  const [queryClient] = useState(() => {
    const client: QueryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: shouldRetry, staleTime: 15_000 },
        mutations: { retry: false },
      },
      // Every saved change adds to the audit log: refresh history and "last changed by".
      mutationCache: new MutationCache({ onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.audit }) }),
    });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
