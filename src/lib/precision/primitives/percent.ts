import { toDecimal } from "./core";
import type { DecimalInput } from "./types";

function pctChange(from: DecimalInput, to: DecimalInput): string | null {
  const f = toDecimal(from);
  if (f.isZero()) return null;
  return toDecimal(to).minus(f).dividedBy(f).times(100).toString();
}

function pctOf(value: DecimalInput, pct: DecimalInput): string {
  return toDecimal(value).times(toDecimal(pct)).dividedBy(100).toString();
}

function pctRatio(part: DecimalInput, whole: DecimalInput): string {
  const w = toDecimal(whole);
  if (w.isZero()) return "0";
  return toDecimal(part).dividedBy(w).times(100).toString();
}

export { pctChange, pctOf, pctRatio };
