// ---------------------------------------------------------------------------
// Decimal arithmetic core. Re-exports the inline `Decimal` class from
// `_decimal-impl.ts` and provides the lib's functional helpers.
//
// Intentionally zero runtime dependencies - see _decimal-impl.ts for the
// implementation and tests/unit/decimal-parity.test.ts for parity coverage
// against decimal.js.
// ---------------------------------------------------------------------------

import { Decimal } from "./_decimal-impl";
import type { DecimalInput } from "./types";

function toDecimal(value: DecimalInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric input: ${value}`);
    }
    return new Decimal(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      throw new Error("Empty string is not a valid decimal input");
    }
    return new Decimal(trimmed);
  }
  throw new Error(`Unsupported input type: ${typeof value}`);
}

function toNum(value: DecimalInput): number {
  return toDecimal(value).toNumber();
}

function add(a: DecimalInput, b: DecimalInput): string {
  return toDecimal(a).plus(toDecimal(b)).toString();
}

function sub(a: DecimalInput, b: DecimalInput): string {
  return toDecimal(a).minus(toDecimal(b)).toString();
}

function mul(a: DecimalInput, b: DecimalInput): string {
  return toDecimal(a).times(toDecimal(b)).toString();
}

function div(a: DecimalInput, b: DecimalInput, dp?: number): string {
  const divisor = toDecimal(b);
  if (divisor.isZero()) throw new Error("Division by zero");
  const result = toDecimal(a).dividedBy(divisor);
  return dp !== undefined ? result.toFixed(dp) : result.toString();
}

function abs(value: DecimalInput): string {
  return toDecimal(value).abs().toString();
}

function neg(value: DecimalInput): string {
  return toDecimal(value).negated().toString();
}

function pow(base: DecimalInput, exp: DecimalInput): string {
  return toDecimal(base).pow(toDecimal(exp)).toString();
}

export { abs, add, Decimal, div, mul, neg, pow, sub, toDecimal, toNum };
