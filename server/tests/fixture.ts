import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Decimal } from '../src/calculation/engine.js';
import { legacyRules } from '../src/db/default-categories.js';
import { bearer, type Api } from './helpers.js';

export interface Fixture {
  materials: {
    code: string;
    name: string;
    category: string;
    sortOrder: number;
    seqPerCd?: number;
    cdPerRoll?: number;
    cdPerRound?: number;
    pcsPerKg?: number;
    denier?: number;
  }[];
  design: {
    designNo: string;
    productName: string;
    components: { name: string; sizes: { size: string; consumption: Record<string, number> }[] }[];
  };
  order: { designNo: string; party: string; orderDate: string; lines: { component: string; size: string; quantity: number }[] };
  expected: {
    totals: Record<string, number>;
    purchase: Record<string, { cds?: number; rolls?: number; kg?: number; grams?: number }>;
  };
}

export const fixture = JSON.parse(
  readFileSync(new URL('../../docs/fixture-26-49.json', import.meta.url), 'utf8'),
) as Fixture;

/** Loads the 11 materials and design 26-49 through the API (in-memory DB only; stitch 0 — not in the fixture). */
export async function loadFixture(api: Api, token: string): Promise<void> {
  for (const m of fixture.materials) {
    const res = await api
      .post('/api/materials')
      .set(bearer(token))
      .send({ code: m.code, name: m.name, category: m.category, rules: legacyRules(m) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  }
  const { designNo, productName, components } = fixture.design;
  assert.equal((await api.post('/api/designs').set(bearer(token)).send({ designNo, productName })).status, 201);
  for (const component of components) {
    const sizes = component.sizes.map((s) => ({ size: s.size, stitch: 0, consumption: s.consumption }));
    const res = await api.put(`/api/designs/${designNo}/components/${component.name}`).set(bearer(token)).send({ sizes });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
}

/** Creates the 37-line MATRIAL.xlsx order and returns its number. */
export async function createFixtureOrder(api: Api, token: string): Promise<number> {
  const res = await api.post('/api/orders').set(bearer(token)).send(fixture.order);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.orderNo as number;
}

/** Rounds a decimal string to 2 places, ROUND_HALF_UP (as the UI will display it). */
export const round2 = (value: string): number => new Decimal(value).toDecimalPlaces(2).toNumber();
