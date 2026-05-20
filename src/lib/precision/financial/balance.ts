import { Decimal, toDecimal } from "../primitives/core";
import type { DecimalInput } from "../primitives/types";

function availableBalance(total: DecimalInput, hold: DecimalInput): string {
  return toDecimal(total).minus(toDecimal(hold)).toString();
}

function isPositiveBalance(total: DecimalInput): boolean {
  const d = toDecimal(total);
  return d.isPositive() && !d.isZero();
}

function fromUnits(raw: DecimalInput, decimals: number): string {
  return toDecimal(raw).dividedBy(new Decimal(10).pow(decimals)).toString();
}

function toUnits(amount: DecimalInput, decimals: number): string {
  return toDecimal(amount)
    .times(new Decimal(10).pow(decimals))
    .toFixed(0, Decimal.ROUND_DOWN);
}

export { availableBalance, isPositiveBalance, fromUnits, toUnits };
