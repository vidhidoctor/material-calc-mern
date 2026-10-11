import type { OrderStatus } from '@app/shared';
import type { Request, Response } from 'express';
import * as ordersService from './orders.service.js';
import type { CreateOrderInput, UpdateOrderInput } from './orders.validation.js';

/** After validate(), orderNo is a number. */
const orderNoOf = (req: Request): number => (req.params as unknown as { orderNo: number }).orderNo;

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await ordersService.listOrders());
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await ordersService.createOrder(req.body as CreateOrderInput));
}

export async function get(req: Request, res: Response): Promise<void> {
  res.json(await ordersService.getOrder(orderNoOf(req)));
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  res.json(await ordersService.updateStatus(orderNoOf(req), (req.body as { status: OrderStatus }).status));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await ordersService.updateOrder(orderNoOf(req), req.body as UpdateOrderInput));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await ordersService.deleteOrder(orderNoOf(req));
  res.status(204).end();
}

export async function summary(req: Request, res: Response): Promise<void> {
  res.json(await ordersService.getOrderSummary(orderNoOf(req)));
}
