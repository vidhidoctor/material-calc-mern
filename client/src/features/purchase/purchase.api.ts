import type { OrderDto, OrderListItemDto, ProductionDesignDetailDto, PurchaseRequirementDto } from '@app/shared';
import { api } from '../../api/client';

export const getPurchaseRequirements = (orderNo: number | null, components: string[]) =>
  api<PurchaseRequirementDto>('/purchase/requirements', {
    query: { orderNo: orderNo ?? undefined, components: components.join(',') },
  });

// For the order picker and the "Punched details" panel (same endpoints/keys as Production).
export const listOrders = () => api<OrderListItemDto[]>('/orders');
export const getOrder = (orderNo: number) => api<OrderDto>(`/orders/${orderNo}`);
export const getDesign = (designNo: string) => api<ProductionDesignDetailDto>(`/production/designs/${encodeURIComponent(designNo)}`);
