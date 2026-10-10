import type { AuthUser, LoginResponse, PermissionCode } from '@app/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api, setUnauthorizedHandler } from '../api/client';
import { ErrorAlert, Forbidden, Loading } from '../components/ui';
import { queryKeys } from './query-keys';
import { tokenStore } from './storage';

/** Where to go after the next login (only set when the session expired or a deep link was opened). */
export interface LoginRedirect {
  from: string;
  /** The user whose session expired; another user logging in goes to their own home page. */
  userId: string | null;
  expired: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'anonymous' | 'error';
  error: unknown;
  /** True after "Log out" — then the previous page is NOT remembered. */
  explicitLogout: boolean;
  expiredUserId: string | null;
  /** Has ALL of the codes. */
  can: (...codes: PermissionCode[]) => boolean;
  /** Has AT LEAST ONE of the codes. */
  canAny: (...codes: PermissionCode[]) => boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => tokenStore.get());
  const [explicitLogout, setExplicitLogout] = useState(false);
  const [expiredUserId, setExpiredUserId] = useState<string | null>(null);

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api<AuthUser>('/auth/me'),
    enabled: token !== null,
    staleTime: 60_000,
  });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      const previous = queryClient.getQueryData<AuthUser>(queryKeys.me);
      setExpiredUserId(previous?.id ?? null);
      setToken(null);
      queryClient.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } });
      tokenStore.set(response.token);
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, response.user);
      setExplicitLogout(false);
      setToken(response.token);
      return response.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // The session may already be gone; log out locally anyway.
    }
    tokenStore.clear();
    setExplicitLogout(true);
    setExpiredUserId(null);
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    const user = token ? (me.data ?? null) : null;
    const held = new Set(user?.permissions ?? []);
    let status: AuthContextValue['status'] = 'anonymous';
    if (token && me.isPending) status = 'loading';
    else if (user) status = 'authenticated';
    else if (token && me.isError) status = 'error';
    return {
      user,
      status,
      error: me.error,
      explicitLogout,
      expiredUserId,
      can: (...codes) => codes.every((code) => held.has(code)),
      canAny: (...codes) => codes.some((code) => held.has(code)),
      login,
      logout,
    };
  }, [token, me.data, me.isPending, me.isError, me.error, explicitLogout, expiredUserId, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

/** Sends anonymous users to /login, remembering the page unless they explicitly logged out. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') return <Loading fullPage />;
  if (auth.status === 'error') {
    return (
      <div className="center-page">
        <ErrorAlert error={auth.error} />
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }
  if (!auth.user) {
    const state: LoginRedirect | undefined = auth.explicitLogout
      ? undefined
      : { from: location.pathname + location.search, userId: auth.expiredUserId, expired: auth.expiredUserId !== null };
    return <Navigate to="/login" replace state={state} />;
  }
  return children;
}

/** Shows "no access" unless the user holds the permissions (any of `any`, all of `all`). */
export function RequirePermission({
  any,
  all,
  children,
}: {
  any?: readonly PermissionCode[];
  all?: readonly PermissionCode[];
  children: ReactNode;
}) {
  const { can, canAny } = useAuth();
  const allowed = (!all || can(...all)) && (!any || any.length === 0 || canAny(...any));
  return allowed ? children : <Forbidden />;
}
