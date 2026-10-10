import type { DepartmentDto } from '@app/shared';
import { api } from '../../api/client';

export const listDepartments = () => api<DepartmentDto[]>('/admin/departments');
export const createDepartment = (name: string) => api<DepartmentDto>('/admin/departments', { method: 'POST', body: { name } });
