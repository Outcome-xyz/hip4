import { toDecimal } from "../primitives/core";
import type { DecimalInput } from "../primitives/types";

function dollarsToShares(dollars: DecimalInput, priceCents: DecimalInput): string {
  const pc = toDecimal(priceCents);
  if (pc.isNeg()) throw new RangeError(`priceCents must be non-negative, got ${pc}`);
  if (pc.isZero()) return "0";
  return toDecimal(dollars).times(100).dividedBy(pc).floor().toString();
}

function sharesToDollars(shares: DecimalInput, priceCents: DecimalInput): string {
  const pc = toDecimal(priceCents);
  if (pc.isNeg()) throw new RangeError(`priceCents must be non-negative, got ${pc}`);
  if (pc.isZero()) return "0";
  return toDecimal(shares).times(pc).dividedBy(100).toString();
}

function isFilledSufficiently(
  filled: DecimalInput,
  requested: DecimalInput,
): boolean {
  return toDecimal(filled).gte(toDecimal(requested));
}

export { dollarsToShares, sharesToDollars, isFilledSufficiently };
