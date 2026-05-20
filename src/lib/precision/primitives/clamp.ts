import { Decimal, toDecimal } from "./core";
import type { DecimalInput } from "./types";

function clamp(
  value: DecimalInput,
  lo: DecimalInput,
  hi: DecimalInput,
): string {
  const dLo = toDecimal(lo);
  const dHi = toDecimal(hi);
  if (dLo.gt(dHi))
    throw new RangeError(`clamp: lo (${dLo}) must be <= hi (${dHi})`);
  return Decimal.max(dLo, Decimal.min(dHi, toDecimal(value))).toString();
}

function roundToStep(value: DecimalInput, step: DecimalInput): string {
  const s = toDecimal(step);
  if (s.isZero()) return toDecimal(value).toString();
  return toDecimal(value).dividedBy(s).round().times(s).toString();
}

function floorToStep(value: DecimalInput, step: DecimalInput): string {
  const s = toDecimal(step);
  if (s.isZero()) return toDecimal(value).toString();
  return toDecimal(value).dividedBy(s).floor().times(s).toString();
}

function ceilToStep(value: DecimalInput, step: DecimalInput): string {
  const s = toDecimal(step);
  if (s.isZero()) return toDecimal(value).toString();
  return toDecimal(value).dividedBy(s).ceil().times(s).toString();
}

function floor(value: DecimalInput, dp: number): string {
  if (!Number.isInteger(dp) || dp < 0) {
    throw new RangeError(`floor: dp must be a non-negative integer, got ${dp}`);
  }
  return toDecimal(value).toFixed(dp, Decimal.ROUND_DOWN);
}

export { clamp, roundToStep, floorToStep, ceilToStep, floor };
