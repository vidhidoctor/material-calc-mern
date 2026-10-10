import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { DepartmentsPage } from '../features/departments/DepartmentsPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SignupPage } from '../features/auth/SignupPage';
import { MaterialsPage } from '../features/materials/MaterialsPage';
import { DesignPage } from '../features/punching/DesignPage';
import { DesignsPage } from '../features/punching/DesignsPage';
import { RolesPage } from '../features/roles/RolesPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { UsersPage } from '../features/users/UsersPage';
import { RequireAuth, RequirePermission } from '../lib/auth';
import { AppLayout, ComingSoon, HomeRedirect, NotFound } from './layout/AppLayout';
import { navPermission } from './layout/nav';

/** Guards a page with the same permission its nav item (and the API) uses. */
const guarded = (path: string, element: ReactNode) => <RequirePermission any={navPermission(path)}>{element}</RequirePermission>;

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'punching', element: guarded('/punching', <DesignsPage />) },
      { path: 'punching/:designNo', element: guarded('/punching', <DesignPage />) },
      { path: 'production/*', element: guarded('/production', <ComingSoon title="Design search" />) },
      { path: 'orders/*', element: guarded('/orders', <ComingSoon title="All orders" />) },
      { path: 'purchase', element: guarded('/purchase', <ComingSoon title="Purchase Requirements" />) },
      { path: 'admin/users', element: guarded('/admin/users', <UsersPage />) },
      { path: 'admin/roles', element: guarded('/admin/roles', <RolesPage />) },
      { path: 'admin/departments', element: guarded('/admin/departments', <DepartmentsPage />) },
      { path: 'admin/materials', element: guarded('/admin/materials', <MaterialsPage />) },
      { path: 'admin/settings', element: guarded('/admin/settings', <SettingsPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
