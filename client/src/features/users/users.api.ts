import type { DepartmentDto, RoleDto, UserDto } from '@app/shared';
import { api } from '../../api/client';

export interface CreateUserBody {
  name: string;
  email: string;
  password: string;
  roleId: string | null;
  departmentId: string | null;
  isActive: boolean;
}

export type UpdateUserBody = Partial<Omit<CreateUserBody, 'email'>>;

export const listUsers = () => api<UserDto[]>('/admin/users');
export const createUser = (body: CreateUserBody) => api<UserDto>('/admin/users', { method: 'POST', body });
export const updateUser = (id: string, body: UpdateUserBody) => api<UserDto>(`/admin/users/${id}`, { method: 'PATCH', body });
export const deleteUser = (id: string) => api<void>(`/admin/users/${id}`, { method: 'DELETE' });

// Lookups for the user form (same endpoints/keys as the Roles and Departments pages).
export const listRoles = () => api<RoleDto[]>('/admin/roles');
export const listDepartments = () => api<DepartmentDto[]>('/admin/departments');
