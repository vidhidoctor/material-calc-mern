import { ORDER_STATUSES, type OrderStatus } from '@app/shared';
import { model, Schema, type HydratedDocument } from 'mongoose';

/** Orders follow the design (§8): lines hold no consumption copy. */
export interface OrderLine {
  component: string;
  size: string;
  quantity: number;
}

export interface Order {
  /** Internal, unique across all orders (used in links). */
  orderNo: number;
  /** Shown to users: 1, 2, 3 … per design + party (label "ABC-1"). */
  partyOrderNo: number;
  designNo: string;
  item: string;
  party: string;
  /** Date only, stored as UTC midnight. */
  orderDate: Date;
  /** null = quantities differ per row. */
  quantity: number | null;
  status: OrderStatus;
  createdAt: Date;
  lines: OrderLine[];
}

const lineSchema = new Schema<OrderLine>(
  {
    component: { type: String, required: true },
    size: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const orderSchema = new Schema<Order>(
  {
    orderNo: { type: Number, required: true, unique: true },
    partyOrderNo: { type: Number, required: true },
    designNo: { type: String, required: true, index: true },
    item: { type: String, required: true },
    party: { type: String, required: true },
    orderDate: { type: Date, required: true },
    quantity: { type: Number, default: null },
    status: { type: String, enum: ORDER_STATUSES, default: 'PENDING' },
    createdAt: { type: Date, default: () => new Date() },
    lines: { type: [lineSchema], default: [] },
  },
  { versionKey: false },
);

// One series per design + party. Partial so the index also builds on older orders that are
// numbered by backfillPartyOrderNos() right after connecting.
orderSchema.index(
  { designNo: 1, party: 1, partyOrderNo: 1 },
  { unique: true, partialFilterExpression: { partyOrderNo: { $exists: true } } },
);

export const OrderModel = model<Order>('Order', orderSchema, 'orders');
export type OrderDocument = HydratedDocument<Order>;

interface Counter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<Counter>({ _id: { type: String, required: true }, seq: { type: Number, required: true } }, { versionKey: false });

export const CounterModel = model<Counter>('Counter', counterSchema, 'counters');

/** Next sequential order number (atomic). */
export async function nextOrderNo(): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate({ _id: 'orderNo' }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return counter.seq;
}

const partyCounterId = (designNo: string, party: string) => `party:${designNo}:${party}`;

/** Next number in the design + party series (atomic): 1, 2, 3 … */
export async function nextPartyOrderNo(designNo: string, party: string): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: partyCounterId(designNo, party) },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return counter.seq;
}

/**
 * One-time migration for orders created before per-party numbering: numbers them per design +
 * party in creation order and moves each series counter past its highest number. Safe to re-run.
 */
export async function backfillPartyOrderNos(): Promise<number> {
  const missing = await OrderModel.collection.find({ partyOrderNo: { $exists: false } }).sort({ orderNo: 1 }).toArray();
  for (const order of missing) {
    const designNo = order.designNo as string;
    const party = order.party as string;
    const highest = await OrderModel.findOne({ designNo, party, partyOrderNo: { $exists: true } }).sort({ partyOrderNo: -1 });
    const partyOrderNo = (highest?.partyOrderNo ?? 0) + 1;
    await OrderModel.collection.updateOne({ _id: order._id }, { $set: { partyOrderNo } });
    await CounterModel.updateOne({ _id: partyCounterId(designNo, party) }, { $max: { seq: partyOrderNo } }, { upsert: true });
  }
  return missing.length;
}

/** What users see for an order: "ABC-1" (party + its number for this design). */
export function orderLabel(order: { party: string; partyOrderNo: number }): string {
  return `${order.party}-${order.partyOrderNo}`;
}
