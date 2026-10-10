import type { PermissionCode, PermissionDto, RoleDto } from '@app/shared';
import { api } from '../../api/client';

export const listRoles = () => api<RoleDto[]>('/admin/roles');
export const listPermissions = () => api<PermissionDto[]>('/admin/permissions');
export const createRole = (name: string) => api<RoleDto>('/admin/roles', { method: 'POST', body: { name, permissions: [] } });
export const setRolePermissions = (id: string, permissions: PermissionCode[]) =>
  api<RoleDto>(`/admin/roles/${id}/permissions`, { method: 'PUT', body: { permissions } });
