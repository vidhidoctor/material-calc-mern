import type { OrderStatus } from '@app/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import {
  createOrder,
  getOrder,
  getOrderSummary,
  getProductionDesign,
  listOrders,
  listProductionDesigns,
  updateOrderStatus,
  type CreateOrderBody,
} from './production.api';

export const useProductionDesigns = (q: string) =>
  useQuery({ queryKey: queryKeys.productionDesigns(q), queryFn: () => listProductionDesigns(q), placeholderData: keepPreviousData });

export const useProductionDesign = (designNo: string) =>
  useQuery({ queryKey: queryKeys.productionDesign(designNo), queryFn: () => getProductionDesign(designNo) });

export const useOrders = () => useQuery({ queryKey: queryKeys.orders, queryFn: listOrders });
export const useOrder = (orderNo: number) => useQuery({ queryKey: queryKeys.order(orderNo), queryFn: () => getOrder(orderNo) });
export const useOrderSummary = (orderNo: number) =>
  useQuery({ queryKey: queryKeys.orderSummary(orderNo), queryFn: () => getOrderSummary(orderNo) });

/** Orders change order lists, design order counts and purchase figures. */
function useInvalidateOrders() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.orders }),
      queryClient.invalidateQueries({ queryKey: queryKeys.production }),
      queryClient.invalidateQueries({ queryKey: queryKeys.purchase }),
    ]);
}

export function useCreateOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({ mutationFn: (body: CreateOrderBody) => createOrder(body), onSuccess: invalidate });
}

export function useUpdateOrderStatus(orderNo: number) {
  const invalidate = useInvalidateOrders();
  return useMutation({ mutationFn: (status: OrderStatus) => updateOrderStatus(orderNo, status), onSuccess: invalidate });
}
