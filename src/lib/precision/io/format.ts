import { Decimal, toDecimal } from "../primitives/core";
import type { DecimalInput, FormatUsdOpts, FormatBalanceOpts } from "../primitives/types";

const ONE_K = new Decimal(1_000);
const ONE_M = new Decimal(1_000_000);
const ONE_B = new Decimal(1_000_000_000);

function addCommas(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function withCommas(raw: string): string {
  const neg = raw.startsWith("-");
  const abs = neg ? raw.slice(1) : raw;
  const [int, dec] = abs.split(".");
  const formatted = addCommas(int!) + (dec !== undefined ? `.${dec}` : "");
  return neg ? `-${formatted}` : formatted;
}

function fixed(value: DecimalInput, dp: number): string {
  return toDecimal(value).toFixed(dp);
}

function formatUsd(value: DecimalInput, opts?: FormatUsdOpts): string {
  const d = toDecimal(value);
  const dp = opts?.dp ?? 2;
  const compact = opts?.compact ?? false;
  const truncate = opts?.truncate ?? false;
  const sign = opts?.sign ?? false;
  const rounding = truncate ? Decimal.ROUND_DOWN : Decimal.ROUND_HALF_UP;

  const a = d.abs();
  let formatted: string;

  if (compact && a.gte(ONE_B)) {
    formatted = a.dividedBy(ONE_B).toFixed(dp, rounding) + "B";
  } else if (compact && a.gte(ONE_M)) {
    formatted = a.dividedBy(ONE_M).toFixed(dp, rounding) + "M";
  } else if (compact && a.gte(ONE_K)) {
    formatted = a.dividedBy(ONE_K).toFixed(dp, rounding) + "K";
  } else {
    const raw = a.toFixed(dp, rounding);
    formatted = withCommas(raw);
  }

  const prefix = d.isNeg()
    ? "-$"
    : sign && d.isPos() && !d.isZero()
      ? "+$"
      : "$";

  return prefix + formatted;
}

function formatCents(cents: DecimalInput): string {
  return toDecimal(cents).round().toString() + "\u00A2";
}

function formatPct(value: DecimalInput, dp = 2): string {
  const d = toDecimal(value);
  const raw = d.toFixed(dp);
  const prefix = d.isPos() && !d.isZero() ? "+" : "";
  return prefix + raw + "%";
}

function formatCompact(value: DecimalInput, dp = 1): string {
  const d = toDecimal(value);
  const a = d.abs();
  const neg = d.isNeg();

  let body: string;
  if (a.gte(ONE_B)) {
    body = a.dividedBy(ONE_B).toFixed(dp) + "B";
  } else if (a.gte(ONE_M)) {
    body = a.dividedBy(ONE_M).toFixed(dp) + "M";
  } else if (a.gte(ONE_K)) {
    body = a.dividedBy(ONE_K).toFixed(dp) + "K";
  } else {
    body = a.toFixed(dp);
  }

  return neg ? `-${body}` : body;
}

function formatNumber(value: DecimalInput, dp?: number): string {
  const d = toDecimal(value);
  const raw = dp !== undefined ? d.toFixed(dp) : d.toString();
  return withCommas(raw);
}

function formatBalance(value: DecimalInput, opts?: FormatBalanceOpts): string {
  const d = toDecimal(value);
  const maxDp = opts?.maxDp ?? 6;
  const minDp = opts?.minDp ?? 2;
  const compact = opts?.compact ?? true;
  const a = d.abs();

  if (compact && a.gte(ONE_M)) {
    return formatCompact(d);
  }

  let dp: number;
  if (a.gte(ONE_K)) {
    dp = minDp;
  } else if (a.gte(1)) {
    dp = Math.max(minDp, Math.min(4, maxDp));
  } else if (a.gt(0)) {
    dp = maxDp;
  } else {
    return minDp === 0 ? "0" : "0." + "0".repeat(minDp);
  }

  const raw = d.toFixed(dp);

  const [int, dec] = raw.split(".");
  if (dec === undefined) return withCommas(raw);

  const minKeep = dec.slice(0, minDp);
  const rest = dec.slice(minDp).replace(/0+$/, "");
  const trimmed = minKeep + rest;

  if (trimmed === "") return withCommas(int!);
  const result = int + "." + trimmed;
  return withCommas(result);
}

function formatSigFig(value: DecimalInput, sigFigs = 5): string {
  const d = toDecimal(value);
  if (d.isZero()) return "0";

  const a = d.abs();
  const rounded = a.toSignificantDigits(sigFigs);
  const magnitude = rounded.floorLog10().toNumber();
  const dp = Math.max(0, sigFigs - 1 - magnitude);
  const raw = rounded.toFixed(dp);

  const result = d.isNeg() ? `-${withCommas(raw)}` : withCommas(raw);
  return result;
}

const displayUsd = formatUsd;
const displayPct = formatPct;
const displayCents = formatCents;
const displayBalance = formatBalance;
const displayCompact = formatCompact;

export {
  fixed,
  formatUsd,
  formatCents,
  formatPct,
  formatCompact,
  formatNumber,
  formatBalance,
  formatSigFig,
  displayUsd,
  displayPct,
  displayCents,
  displayBalance,
  displayCompact,
};
