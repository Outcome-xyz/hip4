// ---------------------------------------------------------------------------
// HIP-4 Pricing Utilities
//
// Tick size computation (5 significant figures), price formatting with
// trailing-zero stripping, and minimum order size calculation.
//
// The exchange strips trailing zeros before msgpack hashing.
// Sending "0.650" when the server hashes "0.65" produces a different hash,
// causing wrong signer recovery. Always use formatPrice() or stripZeros()
// for any value in a signed payload.
// ---------------------------------------------------------------------------

import { toDecimal, toNum, div, mul, pow, abs } from "../../lib/precision/primitives";
import { clamp, ceilToStep } from "../../lib/precision/primitives";
import { formatSigFig, fixed } from "../../lib/precision/io";

// Minimum order notional in USD, enforced by the exchange on HIP-4 outcome
// orders. Reduced from $10 to $1 by the Hyperliquid network upgrade; consumers
// derive their own floors from this rather than restating it, so a version bump
// is what moves them.
export const MIN_NOTIONAL = 1;

// ---------------------------------------------------------------------------
// Tick size
// ---------------------------------------------------------------------------

export function computeTickSize(price: number): number {
  if (price <= 0) return 0.00001;
  const d = toDecimal(price);
  const magnitude = d.floorLog10();
  return toNum(pow("10", magnitude.minus(4).toString()));
}

export function roundToTick(price: number): number {
  const tick = computeTickSize(price);
  const d = toDecimal(price);
  const t = toDecimal(tick);
  return toNum(d.dividedBy(t).round().times(t).toString());
}

// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------

export function formatPrice(price: number): string {
  if (price <= 0) return "0";
  const rounded = roundToTick(price);
  const tick = computeTickSize(rounded);
  const decimals = Math.max(0, -toNum(toDecimal(tick).floorLog10().toString()));
  let s = fixed(rounded, decimals);
  if (s.includes(".")) {
    s = s.replace(/\.?0+$/, "");
  }
  return s;
}

const OUTCOME_PRICE_DECIMALS = 5;

/**
 * Format a HIP-4 outcome price for the order wire. The exchange accepts at
 * most 5 significant figures and at most 5 decimals. For prices below 1 that
 * means rounding to 5 decimals; `formatPrice` alone can produce more below 0.1.
 */
export function formatOutcomePrice(price: number | string): string {
  const d = toDecimal(price);
  if (d.isZero() || !d.isPositive()) return "0";
  const rounded = d.lt(1)
    ? d.toFixed(OUTCOME_PRICE_DECIMALS)
    : d.toSignificantDigits(5).toString();
  return stripZeros(rounded);
}

export function stripZeros(s: string): string {
  if (!s.includes(".")) return s;
  // A loop, not /\.?0+$/, which takes quadratic time on long runs of zeros.
  let end = s.length;
  while (end > 0 && s[end - 1] === "0") end--;
  if (end === s.length) return s;
  if (s[end - 1] === ".") end--;
  return s.slice(0, end);
}

// ---------------------------------------------------------------------------
// Minimum order size
// ---------------------------------------------------------------------------

export function getMinShares(markPx: number, minNotional: number = MIN_NOTIONAL): number {
  const effective = toNum(clamp(
    toDecimal(Math.min(markPx, 1 - markPx)).toString(),
    "0.01",
    "1",
  ));
  return Math.ceil(minNotional / effective);
}
