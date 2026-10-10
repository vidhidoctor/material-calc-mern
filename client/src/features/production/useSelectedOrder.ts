import { useSearchParams } from 'react-router';

/** The order shown in the drawer, kept in the URL (?order=12) so it survives refresh and can be shared. */
export function useSelectedOrder(): [number | null, (orderNo: number | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('order');
  const selected = raw && /^\d+$/.test(raw) ? Number(raw) : null;

  const select = (orderNo: number | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (orderNo === null) next.delete('order');
        else next.set('order', String(orderNo));
        return next;
      },
      { replace: orderNo === null },
    );

  return [selected, select];
}
