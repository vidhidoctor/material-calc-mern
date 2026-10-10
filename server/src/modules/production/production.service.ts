import type { ProductionDesignDetailDto, ProductionDesignListItemDto } from '@app/shared';
import { getDesignDetail, searchDesigns, toDesignListItem } from '../designs/designs.service.js';
import { OrderModel } from '../orders/order.model.js';
import { toDateOnly, totalPieces } from '../orders/orders.service.js';

/** Designs with at least one component, with their row count and previous order count. */
export async function listProductionDesigns(q?: string): Promise<ProductionDesignListItemDto[]> {
  const designs = await searchDesigns(q, { 'components.0': { $exists: true } });
  const counts = await OrderModel.aggregate<{ _id: string; count: number }>([
    { $match: { designNo: { $in: designs.map((d) => d.designNo) } } },
    { $group: { _id: '$designNo', count: { $sum: 1 } } },
  ]);
  const orders = new Map(counts.map((row) => [row._id, row.count]));
  return designs.map((design) => ({
    ...toDesignListItem(design),
    entries: design.components.reduce((sum, c) => sum + c.sizes.length, 0),
    orders: orders.get(design.designNo) ?? 0,
  }));
}

/** Read-only design (Punching details) + previous orders, newest first. */
export async function getProductionDesign(designNo: string): Promise<ProductionDesignDetailDto> {
  const [detail, orders] = await Promise.all([
    getDesignDetail(designNo),
    OrderModel.find({ designNo }).sort({ orderNo: -1 }),
  ]);
  return {
    ...detail,
    previousOrders: orders.map((order) => ({
      orderNo: order.orderNo,
      partyOrderNo: order.partyOrderNo,
      party: order.party,
      quantity: order.quantity ?? null,
      totalPieces: totalPieces(order.lines),
      status: order.status,
      orderDate: toDateOnly(order.orderDate),
    })),
  };
}
