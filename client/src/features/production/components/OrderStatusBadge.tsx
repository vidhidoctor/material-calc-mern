import { ORDER_STATUS_LABELS, type OrderStatus } from '@app/shared';
import { StatusBadge } from '../../../components/ui';

const TONES = { PENDING: 'amber', IN_PROGRESS: 'blue', COMPLETED: 'green', CANCELLED: 'red' } as const;

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <StatusBadge tone={TONES[status]}>{ORDER_STATUS_LABELS[status]}</StatusBadge>;
}

/** "Per row" when quantities differ per row. */
export function orderQuantityText(quantity: number | null): string {
  return quantity === null ? 'Per row' : quantity.toLocaleString('en-IN');
}
