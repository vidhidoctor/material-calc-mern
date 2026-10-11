import type { OrderStatus } from '@app/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import {
  createOrder,
  deleteOrder,
  getOrder,
  getOrderCost,
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
/** Only fetched for users who may see costs. */
export const useOrderCost = (orderNo: number, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.orderCost(orderNo), queryFn: () => getOrderCost(orderNo), enabled });

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
      queryClient.invalidateQueries({ queryKey: queryKeys.costing }),
    ]);
}

export function useCreateOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({ mutationFn: (body: CreateOrderBody) => createOrder(body), onSuccess: invalidate });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: deleteOrder,
    onSuccess: (_result, orderNo) => {
      queryClient.removeQueries({ queryKey: queryKeys.order(orderNo) });
      queryClient.removeQueries({ queryKey: queryKeys.orderSummary(orderNo) });
      return invalidate();
    },
  });
}

export function useUpdateOrderStatus(orderNo: number) {
  const invalidate = useInvalidateOrders();
  return useMutation({ mutationFn: (status: OrderStatus) => updateOrderStatus(orderNo, status), onSuccess: invalidate });
}
