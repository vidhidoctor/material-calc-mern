import type {
  OrderDto,
  MaterialBreakdownDto,
  OrderCostDto,
  OrderListItemDto,
  OrderStatus,
  OrderSummaryDto,
  PurchaseOrderDto,
  ProductionDesignDetailDto,
  ProductionDesignListItemDto,
} from '@app/shared';
import { api } from '../../api/client';

export interface OrderLineBody {
  component: string;
  size: string;
  quantity: number;
}

/** Either one quantity for every row, or a quantity per row; plus the type of each typed column. */
export type OrderBody = { party: string; orderDate: string; types: Record<string, string> } & (
  | { quantity: number; lines?: undefined }
  | { quantity?: undefined; lines: OrderLineBody[] }
);

export type CreateOrderBody = { designNo: string; party: string; orderDate: string; types?: Record<string, string> } & (
  | { quantity: number; lines?: undefined }
  | { quantity?: undefined; lines: OrderLineBody[] }
);

export const listProductionDesigns = (q: string) => api<ProductionDesignListItemDto[]>('/production/designs', { query: { q } });
export const getProductionDesign = (designNo: string) =>
  api<ProductionDesignDetailDto>(`/production/designs/${encodeURIComponent(designNo)}`);

/** Material detail of an order (e.g. cording sheet); rate and amount only for Admin. */
export const getOrderBreakdown = (orderNo: number) => api<MaterialBreakdownDto>(`/orders/${orderNo}/breakdown`);

/** Admin: re-price an order with today's rates (explicit; orders otherwise keep their saved rates). */
export const refreshOrderRates = (orderNo: number) => api<OrderCostDto>(`/costing/orders/${orderNo}/refresh-rates`, { method: 'POST' });

/** ₹ material cost of an order, with the rates saved when it was created (Admin only). */
export const getOrderCost = (orderNo: number) => api<OrderCostDto>(`/costing/orders/${orderNo}`);

export const listOrders = () => api<OrderListItemDto[]>('/orders');
export const getOrder = (orderNo: number) => api<OrderDto>(`/orders/${orderNo}`);
export const getOrderSummary = (orderNo: number) => api<OrderSummaryDto>(`/orders/${orderNo}/summary`);
/** The purchase order print slip (quantities from the order calculation, names entered by hand). */
export const getPurchaseOrder = (orderNo: number) => api<PurchaseOrderDto>(`/orders/${orderNo}/purchase-order`);
/** Saves slip names (row id → name; blank removes). */
export const savePurchaseOrderNames = (orderNo: number, names: Record<string, string>) =>
  api<PurchaseOrderDto>(`/orders/${orderNo}/purchase-order/names`, { method: 'PUT', body: { names } });
export const createOrder = (body: CreateOrderBody) => api<OrderDto>('/orders', { method: 'POST', body });
export const updateOrder = (orderNo: number, body: OrderBody) => api<OrderDto>(`/orders/${orderNo}`, { method: 'PUT', body });
export const deleteOrder = (orderNo: number) => api<void>(`/orders/${orderNo}`, { method: 'DELETE' });
export const updateOrderStatus = (orderNo: number, status: OrderStatus) =>
  api<OrderDto>(`/orders/${orderNo}/status`, { method: 'PATCH', body: { status } });
