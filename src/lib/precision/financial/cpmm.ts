import { toDecimal, Decimal } from "../primitives/core";
import type { DecimalInput, CpmmQuoteResult } from "../primitives/types";

function assertNonNegativeReserves(y: InstanceType<typeof Decimal>, n: InstanceType<typeof Decimal>): void {
  if (y.isNegative() || n.isNegative()) {
    throw new RangeError("CPMM reserves must be non-negative");
  }
}

function cpmmPrices(
  yesReserve: DecimalInput,
  noReserve: DecimalInput,
): { yes: string; no: string } {
  const y = toDecimal(yesReserve);
  const n = toDecimal(noReserve);
  assertNonNegativeReserves(y, n);
  const total = y.plus(n);
  if (total.isZero()) return { yes: "0.5", no: "0.5" };
  return {
    yes: n.dividedBy(total).toString(),
    no: y.dividedBy(total).toString(),
  };
}

function cpmmBuyShares(
  yesReserve: DecimalInput,
  noReserve: DecimalInput,
  spend: DecimalInput,
  outcome: "yes" | "no",
): string {
  const y = toDecimal(yesReserve);
  const n = toDecimal(noReserve);
  assertNonNegativeReserves(y, n);
  const s = toDecimal(spend);
  if (s.isNegative()) throw new Error("spend must be non-negative");
  const k = y.times(n);
  if (k.isZero()) throw new RangeError("CPMM pool has zero liquidity (k = 0)");

  if (outcome === "yes") {
    const newNo = n.plus(s);
    const newYes = k.dividedBy(newNo);
    return y.minus(newYes).toString();
  }

  const newYes = y.plus(s);
  const newNo = k.dividedBy(newYes);
  return n.minus(newNo).toString();
}

function cpmmQuote(
  yesReserve: DecimalInput,
  noReserve: DecimalInput,
  spend: DecimalInput,
  outcome: "yes" | "no",
): CpmmQuoteResult {
  const prices = cpmmPrices(yesReserve, noReserve);
  const spotPrice = toDecimal(outcome === "yes" ? prices.yes : prices.no);
  const sharesOut = toDecimal(cpmmBuyShares(yesReserve, noReserve, spend, outcome));

  const effectivePrice = sharesOut.isZero()
    ? spotPrice
    : toDecimal(spend).dividedBy(sharesOut);

  const slippagePct = spotPrice.isZero()
    ? new Decimal(0)
    : effectivePrice.minus(spotPrice).dividedBy(spotPrice).times(100);

  return {
    sharesOut: sharesOut.toString(),
    effectivePrice: effectivePrice.toString(),
    slippagePct: slippagePct.toString(),
  };
}

export { cpmmPrices, cpmmBuyShares, cpmmQuote };
