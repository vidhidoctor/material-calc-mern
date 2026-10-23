import type { Order, OrderLine } from './order.model.js';

/**
 * Orders follow the design (docs/context.md §8). A component added to the design in Punching after an
 * order was made joins that order automatically — nothing saved on the order is changed; the extra lines
 * are worked out each time from the order's own quantities:
 * - "same for all rows" order → that quantity for every size of the new component;
 * - otherwise each size gets the quantity already ordered for that size (the most common one when
 *   components differ, the larger on a tie);
 * - a one-size component with a size that is not a number (ALL, FREE …) gets one per set: the pieces of
 *   all sizes.
 * Sizes that cannot be matched are not ordered; a component with no matched size is "pending" (its
 * quantities are entered with Edit order).
 *
 * Which components are new: orders remember the design's components when created or edited
 * (\`order.components\`), so one left out on purpose stays out. Older orders have no such list: every
 * design component missing from them is treated as added later.
 */

export interface EffectiveLine extends OrderLine {
  /** Worked out from the design (component added after the order); not saved on the order. */
  fromDesign: boolean;
}

export interface EffectiveLines {
  lines: EffectiveLine[];
  /** Components added to the design after the order, included automatically. */
  added: string[];
  /** Components added after the order whose sizes match nothing ordered: enter them with Edit order. */
  pending: string[];
}

/** Quantity per size from the saved lines: the most common one, the larger on a tie. */
function quantityBySize(lines: readonly OrderLine[]): Map<string, number> {
  const counts = new Map<string, Map<number, number>>();
  for (const line of lines) {
    const bySize = counts.get(line.size) ?? new Map<number, number>();
    bySize.set(line.quantity, (bySize.get(line.quantity) ?? 0) + 1);
    counts.set(line.size, bySize);
  }
  return new Map(
    [...counts].map(([size, byQty]) => {
      const [best] = [...byQty].sort(([qa, ca], [qb, cb]) => cb - ca || qb - qa);
      return [size, best![0]] as const;
    }),
  );
}

/** Just what is needed from a design (a design document or its API shape). */
export interface DesignComponents {
  components: readonly { name: string; sizes: readonly { size: string }[] }[];
}

export function effectiveLines(order: Pick<Order, 'lines' | 'quantity' | 'components'>, design: DesignComponents | null): EffectiveLines {
  const saved: EffectiveLine[] = order.lines.map(({ component, size, quantity }) => ({ component, size, quantity, fromDesign: false }));
  if (!design) return { lines: saved, added: [], pending: [] };

  const ordered = new Set(order.lines.map((l) => l.component));
  const considered = order.components ? new Set(order.components) : null;
  const newComponents = design.components.filter((c) => !ordered.has(c.name) && !(considered?.has(c.name) ?? false));
  if (newComponents.length === 0) return { lines: saved, added: [], pending: [] };

  const perSize = quantityBySize(order.lines);
  // One per set: the pieces of each ordered size, counted once per size.
  const sets = [...perSize.values()].reduce((sum, q) => sum + q, 0);
  const lines = [...saved];
  const added: string[] = [];
  const pending: string[] = [];
  for (const component of newComponents) {
    const derived = component.sizes.flatMap(({ size }) => {
      // One size that is not a number (ALL, FREE …) fits every set; a lone number is just that size.
      const freeSize = component.sizes.length === 1 && !/^\d+(\.\d+)?$/.test(size);
      const quantity = order.quantity ?? perSize.get(size) ?? (freeSize ? sets : 0);
      return quantity > 0 ? [{ component: component.name, size, quantity, fromDesign: true }] : [];
    });
    if (derived.length === 0) {
      pending.push(component.name);
      continue;
    }
    lines.push(...derived);
    added.push(component.name);
  }
  return { lines, added, pending };
}
