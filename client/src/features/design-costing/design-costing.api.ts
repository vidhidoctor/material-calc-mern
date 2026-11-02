import type { DesignCostingCalculationDto, DesignCostingDto, DesignCostingInputDto, DesignCostingListItemDto } from '@app/shared';
import { api } from '../../api/client';

const path = (designNo: string) => `/design-costing/${encodeURIComponent(designNo)}`;

export const listDesignCostings = (q: string) => api<DesignCostingListItemDto[]>('/design-costing', { query: { q } });
export const getDesignCosting = (designNo: string) => api<DesignCostingDto>(path(designNo));
/** Calculates the entries on screen without saving them. */
export const previewDesignCosting = (designNo: string, body: DesignCostingInputDto) =>
  api<DesignCostingCalculationDto>(`${path(designNo)}/preview`, { method: 'POST', body });
export const saveDesignCosting = (designNo: string, body: DesignCostingInputDto) => api<DesignCostingDto>(path(designNo), { method: 'PUT', body });
