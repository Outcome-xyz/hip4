import { toDecimal, Decimal } from "../primitives/core";
import type { DecimalInput } from "../primitives/types";

function midToCents(midPriceStr: DecimalInput): string {
  return toDecimal(midPriceStr).times(100).round().toString();
}

function centsToDecimalStr(cents: number): string {
  return toDecimal(cents).dividedBy(100).toFixed(2);
}

function applySlippage(
  mid: DecimalInput,
  ratio: DecimalInput,
  side: "buy" | "sell",
): string {
  const m = toDecimal(mid);
  const r = toDecimal(ratio);
  return side === "buy"
    ? m.times(Decimal.sum(1, r)).toString()
    : m.times(new Decimal(1).minus(r)).toString();
}

function noPrice(yesCents: DecimalInput): string {
  const y = toDecimal(yesCents);
  if (y.lt(0) || y.gt(100)) {
    throw new RangeError(`noPrice: yesCents must be in [0, 100], got ${y}`);
  }
  return new Decimal(100).minus(y).toString();
}

export { midToCents, centsToDecimalStr, applySlippage, noPrice };
