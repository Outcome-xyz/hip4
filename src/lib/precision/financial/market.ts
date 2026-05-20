import { toDecimal, Decimal, div } from "../primitives/core";
import type { DecimalInput, FeeResult } from "../primitives/types";

function shareCost(shares: DecimalInput, price: DecimalInput): string {
  return toDecimal(shares).times(toDecimal(price)).toString();
}

function sharesForSpend(spend: DecimalInput, price: DecimalInput): string {
  return div(spend, price);
}

function payout(
  shares: DecimalInput,
  payoutPerShare: DecimalInput = "1",
): string {
  return toDecimal(shares).times(toDecimal(payoutPerShare)).toString();
}

function profit(payoutAmount: DecimalInput, cost: DecimalInput): string {
  return toDecimal(payoutAmount).minus(toDecimal(cost)).toString();
}

function roi(payoutAmount: DecimalInput, cost: DecimalInput): string {
  const c = toDecimal(cost);
  if (c.isZero()) return "0";
  return toDecimal(payoutAmount)
    .minus(c)
    .dividedBy(c)
    .times(100)
    .toString();
}

function applyFee(amount: DecimalInput, feeRate: DecimalInput): FeeResult {
  const a = toDecimal(amount);
  const r = toDecimal(feeRate);
  if (r.isNegative() || r.gt(1)) {
    throw new RangeError(`applyFee: feeRate must be in [0, 1], got ${r}`);
  }
  const fee = a.times(r);
  return { fee: fee.toString(), net: a.minus(fee).toString() };
}

function normalizeProbabilities(probs: DecimalInput[]): string[] {
  if (probs.length === 0) return [];
  const decimals = probs.map(toDecimal);
  for (const d of decimals) {
    if (d.isNegative()) throw new RangeError(`normalizeProbabilities: negative probability ${d}`);
  }
  const sum = decimals.reduce((acc, d) => acc.plus(d), new Decimal(0));
  if (sum.isZero()) {
    const uniform = new Decimal(1).dividedBy(probs.length);
    return decimals.map(() => uniform.toString());
  }
  return decimals.map((d) => d.dividedBy(sum).toString());
}

function impliedProbability(decimalOdds: DecimalInput): string {
  return div("1", decimalOdds);
}

function oddsFromProbability(probability: DecimalInput): string {
  return div("1", probability);
}

export {
  shareCost,
  sharesForSpend,
  payout,
  profit,
  roi,
  applyFee,
  normalizeProbabilities,
  impliedProbability,
  oddsFromProbability,
};
