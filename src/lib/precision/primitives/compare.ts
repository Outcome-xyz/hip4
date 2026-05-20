import { Decimal, toDecimal } from "./core";
import type { DecimalInput } from "./types";

function compare(a: DecimalInput, b: DecimalInput): -1 | 0 | 1 {
  const r = toDecimal(a).comparedTo(toDecimal(b));
  if (r < 0) return -1;
  if (r > 0) return 1;
  return 0;
}

function eq(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).equals(toDecimal(b));
}

function gt(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).greaterThan(toDecimal(b));
}

function gte(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).greaterThanOrEqualTo(toDecimal(b));
}

function lt(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).lessThan(toDecimal(b));
}

function lte(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).lessThanOrEqualTo(toDecimal(b));
}

function isZero(value: DecimalInput): boolean {
  return toDecimal(value).isZero();
}

function isNeg(value: DecimalInput): boolean {
  return toDecimal(value).isNegative();
}

function isPos(value: DecimalInput): boolean {
  const d = toDecimal(value);
  return d.isPositive() && !d.isZero();
}

function min(...values: DecimalInput[]): string {
  if (values.length === 0) throw new Error("min requires at least one argument");
  return Decimal.min(...values.map(toDecimal)).toString();
}

function max(...values: DecimalInput[]): string {
  if (values.length === 0) throw new Error("max requires at least one argument");
  return Decimal.max(...values.map(toDecimal)).toString();
}

export { compare, eq, gt, gte, lt, lte, isZero, isNeg, isPos, min, max };
