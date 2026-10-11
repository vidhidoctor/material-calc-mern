import type {
  OrderDto,
  OrderCostDto,
  OrderListItemDto,
  OrderStatus,
  OrderSummaryDto,
  ProductionDesignDetailDto,
  ProductionDesignListItemDto,
} from '@app/shared';
import { api } from '../../api/client';

export interface OrderLineBody {
  component: string;
  size: string;
  quantity: number;
}

/** Either one quantity for every row, or a quantity per row. */
export type CreateOrderBody = { designNo: string; party: string; orderDate: string } & (
  | { quantity: number; lines?: undefined }
  | { quantity?: undefined; lines: OrderLineBody[] }
);

export const listProductionDesigns = (q: string) => api<ProductionDesignListItemDto[]>('/production/designs', { query: { q } });
export const getProductionDesign = (designNo: string) =>
  api<ProductionDesignDetailDto>(`/production/designs/${encodeURIComponent(designNo)}`);

/** ₹ material cost of an order, with the rates saved when it was created (Admin only). */
export const getOrderCost = (orderNo: number) => api<OrderCostDto>(`/costing/orders/${orderNo}`);

export const listOrders = () => api<OrderListItemDto[]>('/orders');
export const getOrder = (orderNo: number) => api<OrderDto>(`/orders/${orderNo}`);
export const getOrderSummary = (orderNo: number) => api<OrderSummaryDto>(`/orders/${orderNo}/summary`);
export const createOrder = (body: CreateOrderBody) => api<OrderDto>('/orders', { method: 'POST', body });
export const deleteOrder = (orderNo: number) => api<void>(`/orders/${orderNo}`, { method: 'DELETE' });
export const updateOrderStatus = (orderNo: number, status: OrderStatus) =>
  api<OrderDto>(`/orders/${orderNo}/status`, { method: 'PATCH', body: { status } });
