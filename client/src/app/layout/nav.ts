import type { PermissionCode } from '@app/shared';

export interface NavItem {
  to: string;
  label: string;
  /** Visible when the user holds ANY of these — the same permission the API checks. */
  any: PermissionCode[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    title: 'Punching',
    items: [{ to: '/punching', label: 'Punching Master', any: ['PUNCHING_VIEW'] }],
  },
  {
    title: 'Production',
    items: [
      { to: '/production', label: 'Design search', any: ['PRODUCTION_VIEW'] },
      { to: '/orders', label: 'All orders', any: ['PRODUCTION_VIEW'] },
    ],
  },
  {
    title: 'Purchase',
    items: [{ to: '/purchase', label: 'Purchase Requirements', any: ['PURCHASE_REQUIREMENT_VIEW'] }],
  },
  {
    title: 'Admin',
    items: [
      { to: '/admin/users', label: 'Users', any: ['USER_VIEW'] },
      { to: '/admin/roles', label: 'Roles & permissions', any: ['ROLE_MANAGE', 'PERMISSION_MANAGE'] },
      { to: '/admin/departments', label: 'Departments', any: ['DEPARTMENT_MANAGE'] },
      { to: '/admin/materials', label: 'Material Master', any: ['MATERIAL_MASTER_VIEW'] },
      { to: '/admin/settings', label: 'Global config', any: ['SETTINGS_MANAGE'] },
    ],
  },
];

/** Permission for a nav path (also used to guard the route). */
export function navPermission(to: string): PermissionCode[] {
  for (const section of NAV) for (const item of section.items) if (item.to === to) return item.any;
  throw new Error(`No nav item for ${to}`);
}

/** Sections with only the items the user may open; empty sections are dropped. */
export function allowedNav(canAny: (...codes: PermissionCode[]) => boolean): NavSection[] {
  return NAV.map((section) => ({ ...section, items: section.items.filter((item) => canAny(...item.any)) })).filter(
    (section) => section.items.length > 0,
  );
}
