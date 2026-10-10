import { Decimal as DecimalBase } from 'decimal.js';

/** High precision, never exponent notation in strings; ROUND_HALF_UP. */
export const Decimal = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 });
export type Decimal = InstanceType<typeof Decimal>;
