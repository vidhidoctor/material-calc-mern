import type { MaterialCategory, MaterialDto, MaterialRuleField } from '@app/shared';
import { api } from '../../api/client';

export type MaterialBody = { category: MaterialCategory } & Partial<Record<MaterialRuleField, number | null>>;

export const listMaterials = () => api<MaterialDto[]>('/materials');
export const createMaterial = (body: MaterialBody & { code: string }) => api<MaterialDto>('/materials', { method: 'POST', body });
export const updateMaterial = (code: string, body: MaterialBody) =>
  api<MaterialDto>(`/materials/${encodeURIComponent(code)}`, { method: 'PUT', body });
export const deleteMaterial = (code: string) => api<void>(`/materials/${encodeURIComponent(code)}`, { method: 'DELETE' });
