import type { PurchaseConversion, PurchaseRequirementDto } from '@app/shared';
import { calculateRequirements, convertPurchase, toDecimalString, type CalcLine, type Conversion } from '../../calculation/engine.js';
import { consumptionLookup } from '../designs/designs.service.js';
import { DesignModel } from '../designs/design.model.js';
import { findAllMaterials, toMaterialColumn } from '../materials/materials.service.js';
import { OrderModel, orderLabel } from '../orders/order.model.js';
import { findOrder } from '../orders/orders.service.js';
import type { PurchaseQuery } from './purchase.validation.js';

function toPurchaseDto(conversion: Conversion | null): PurchaseConversion | null {
  if (!conversion) return null;
  switch (conversion.kind) {
    case 'SEQUENCE':
      return { kind: 'SEQUENCE', cds: toDecimalString(conversion.cds), rolls: toDecimalString(conversion.rolls) };
    case 'BEAD':
      return { kind: 'BEAD', kg: toDecimalString(conversion.kg) };
    case 'CORD':
      return { kind: 'CORD', grams: toDecimalString(conversion.grams), kg: toDecimalString(conversion.kg) };
  }
}

/**
 * One order (any status) when orderNo is given, otherwise every order except CANCELLED.
 * Consumption always comes from the design's current values (§8).
 */
export async function getPurchaseRequirements({ orderNo, components }: PurchaseQuery): Promise<PurchaseRequirementDto> {
  const orders = orderNo !== undefined
    ? [await findOrder(orderNo)]
    : await OrderModel.find({ status: { $ne: 'CANCELLED' } }).sort({ orderNo: 1 });

  const designNos = [...new Set(orders.map((o) => o.designNo))];
  const [designs, materials] = await Promise.all([DesignModel.find({ designNo: { $in: designNos } }), findAllMaterials()]);
  const lookups = new Map(designs.map((d) => [d.designNo, consumptionLookup(d)]));
  const missingDesign = consumptionLookup(null);

  const wanted = new Set(components);
  const lines: CalcLine[] = orders.flatMap((order) => {
    const lookup = lookups.get(order.designNo) ?? missingDesign;
    return order.lines
      .filter((line) => wanted.size === 0 || wanted.has(line.component))
      .map(({ component, size, quantity }) => ({
        component,
        size,
        quantity,
        consumption: lookup(component, size),
        label: `${orderLabel(order)} ${component} ${size}`,
      }));
  });

  const result = calculateRequirements(lines, materials.map((m) => m.code));
  const errors = [...result.errors];
  const totals = materials.map((material) => {
    const total = result.totals.get(material.code)!;
    const { purchase, error } = convertPurchase(material, total);
    if (error && !total.isZero()) errors.push(`${material.name}: ${error}`);
    return {
      ...toMaterialColumn(material),
      total: toDecimalString(total),
      purchase: toPurchaseDto(purchase),
      ...(error ? { error } : {}),
    };
  });

  return { orderNos: orders.map((o) => o.orderNo), components, totals, errors };
}
