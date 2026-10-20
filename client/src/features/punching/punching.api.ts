import type { Consumption, DesignDetailDto, DesignListItemDto, MaterialBreakdownDto } from '@app/shared';
import { api } from '../../api/client';

export interface SizeRowBody {
  size: string;
  stitch: number;
  laser: number | null;
  consumption: Consumption;
}

const designPath = (designNo: string) => `/designs/${encodeURIComponent(designNo)}`;

export const listDesigns = (q: string) => api<DesignListItemDto[]>('/designs', { query: { q } });
export const getDesign = (designNo: string) => api<DesignDetailDto>(designPath(designNo));
export const createDesign = (body: { designNo: string; productName: string }) =>
  api<DesignDetailDto>('/designs', { method: 'POST', body });
export const updateDesign = (designNo: string, body: { designNo?: string; productName?: string }) =>
  api<DesignDetailDto>(designPath(designNo), { method: 'PATCH', body });
export const deleteDesign = (designNo: string) => api<void>(designPath(designNo), { method: 'DELETE' });
export const putComponent = (designNo: string, name: string, columns: string[], sizes: SizeRowBody[]) =>
  api<DesignDetailDto>(`${designPath(designNo)}/components/${encodeURIComponent(name)}`, { method: 'PUT', body: { columns, sizes } });
export const deleteComponent = (designNo: string, name: string) =>
  api<DesignDetailDto>(`${designPath(designNo)}/components/${encodeURIComponent(name)}`, { method: 'DELETE' });

/** ₹ cost per piece by component and size (Admin only). */

/** Per-piece conversions (e.g. cord grams/KG per piece) for every component, size and column. */
export const getDesignBreakdown = (designNo: string) => api<MaterialBreakdownDto>(`${designPath(designNo)}/breakdown`);
