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

export const MIN_NOTIONAL = 10;

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

export function stripZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// Minimum order size
// ---------------------------------------------------------------------------

export function getMinShares(markPx: number): number {
  const effective = toNum(clamp(
    toDecimal(Math.min(markPx, 1 - markPx)).toString(),
    "0.01",
    "1",
  ));
  return Math.ceil(MIN_NOTIONAL / effective);
}
