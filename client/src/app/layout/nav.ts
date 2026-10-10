import type { PermissionCode } from '@app/shared';
import type { IconName } from '../../components/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
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
    items: [{ to: '/punching', label: 'Punching Master', icon: 'layers', any: ['PUNCHING_VIEW'] }],
  },
  {
    title: 'Production',
    items: [
      { to: '/production', label: 'Design & Order Lookup', icon: 'search', any: ['PRODUCTION_VIEW'] },
      { to: '/orders', label: 'Order Master', icon: 'clipboard', any: ['PRODUCTION_VIEW'] },
      { to: '/purchase', label: 'Procurement Planning', icon: 'cart', any: ['PURCHASE_REQUIREMENT_VIEW'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/users', label: 'User Management', icon: 'users', any: ['USER_VIEW'] },
      { to: '/admin/roles', label: 'Roles & permissions', icon: 'shield', any: ['ROLE_MANAGE', 'PERMISSION_MANAGE'] },
      { to: '/admin/departments', label: 'Departments', icon: 'building', any: ['DEPARTMENT_MANAGE'] },
      { to: '/admin/materials', label: 'Material Master', icon: 'package', any: ['MATERIAL_MASTER_VIEW'] },
      { to: '/admin/settings', label: 'Global config', icon: 'sliders', any: ['SETTINGS_MANAGE'] },
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
