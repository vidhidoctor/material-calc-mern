import type { MaterialCategoryDto, MaterialDto } from '@app/shared';
import { api } from '../../api/client';

export interface MaterialBody {
  category: string;
  /** Values for the category's fields; blank = null. */
  rules: Record<string, number | null>;
}

export interface CategoryBody {
  name: string;
  unit: string;
  fields: { key: string; label: string; required: boolean; missingMessage?: string | null }[];
  steps: { key: string; label: string; formula: string }[];
  purchaseStep: string;
  /** Step shown in the order details; null = the purchase step. */
  orderStep: string | null;
  /** Round the order total up to whole units. */
  wholeUnits: boolean;
  /** Types chosen per order in Production (e.g. MATT, METAL). */
  types: string[];
}

export const listMaterials = () => api<MaterialDto[]>('/materials');
export const createMaterial = (body: MaterialBody & { code: string }) => api<MaterialDto>('/materials', { method: 'POST', body });
export const updateMaterial = (code: string, body: MaterialBody) =>
  api<MaterialDto>(`/materials/${encodeURIComponent(code)}`, { method: 'PUT', body });
export const deleteMaterial = (code: string) => api<void>(`/materials/${encodeURIComponent(code)}`, { method: 'DELETE' });

export const listCategories = () => api<MaterialCategoryDto[]>('/material-categories');
export const createCategory = (body: CategoryBody & { code: string }) =>
  api<MaterialCategoryDto>('/material-categories', { method: 'POST', body });
export const updateCategory = (code: string, body: CategoryBody) =>
  api<MaterialCategoryDto>(`/material-categories/${encodeURIComponent(code)}`, { method: 'PUT', body });
export const deleteCategory = (code: string) => api<void>(`/material-categories/${encodeURIComponent(code)}`, { method: 'DELETE' });
