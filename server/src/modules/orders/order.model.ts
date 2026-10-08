import { ORDER_STATUSES, type OrderStatus } from '@app/shared';
import { model, Schema, type HydratedDocument } from 'mongoose';

/** Orders follow the design (§8): lines hold no consumption copy. */
export interface OrderLine {
  component: string;
  size: string;
  quantity: number;
}

export interface Order {
  orderNo: number;
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
