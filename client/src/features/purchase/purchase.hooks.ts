import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth';
import { queryKeys } from '../../lib/query-keys';
import { getDesign, getOrder, getPurchaseRequirements, listOrders } from './purchase.api';

/** Previous figures stay on screen (dimmed) while new ones load. */
export const usePurchaseRequirements = (orderNo: number | null, components: string[]) =>
  useQuery({
    queryKey: [...queryKeys.purchase, orderNo ?? 'all', components.join(',')],
    queryFn: () => getPurchaseRequirements(orderNo, components),
    placeholderData: keepPreviousData,
  });

/** Order list for the picker — only for users who can see orders. */
export function usePickerOrders() {
  const canView = useAuth().can('PRODUCTION_VIEW');
  return useQuery({ queryKey: queryKeys.orders, queryFn: listOrders, enabled: canView });
}

export function useSelectedOrderDetail(orderNo: number | null) {
  const canView = useAuth().can('PRODUCTION_VIEW');
  return useQuery({
    queryKey: queryKeys.order(orderNo ?? 0),
    queryFn: () => getOrder(orderNo!),
    enabled: canView && orderNo !== null,
  });
}

export function useOrderDesign(designNo: string | null) {
  const canView = useAuth().can('PRODUCTION_VIEW');
  return useQuery({
    queryKey: queryKeys.productionDesign(designNo ?? ''),
    queryFn: () => getDesign(designNo!),
    enabled: canView && designNo !== null,
  });
}
