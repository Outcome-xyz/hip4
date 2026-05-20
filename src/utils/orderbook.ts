import {
  toDecimal,
  toNum,
} from "../lib/precision/primitives";

export interface TradeCostResult {
  readonly estimatedCost: number;
  readonly potentialReturn: number;
  readonly displayShares: number;
}

export function computeEstimatedCost(
  tokenAmount: number,
  orderType: "market" | "limit",
  limitPriceCents: number | null,
  marketPriceCents?: number,
): number {
  if (tokenAmount <= 0) return 0;
  if (orderType === "market") {
    if (marketPriceCents !== undefined && marketPriceCents > 0) {
      return toNum(
        toDecimal(tokenAmount)
          .times(toDecimal(marketPriceCents))
          .dividedBy(100)
          .toString(),
      );
    }
    return tokenAmount;
  }
  if (!limitPriceCents || limitPriceCents <= 0) return 0;
  return toNum(
    toDecimal(tokenAmount)
      .times(toDecimal(limitPriceCents))
      .dividedBy(100)
      .toString(),
  );
}

export function computeTradeCost(params: {
  tokenAmount: number;
  orderType: "market" | "limit";
  limitPriceCents: number | null;
  marketPriceCents?: number;
}): TradeCostResult {
  const { tokenAmount, orderType, limitPriceCents, marketPriceCents } = params;

  const estimatedCost =
    orderType === "limit"
      ? computeEstimatedCost(tokenAmount, "limit", limitPriceCents)
      : computeEstimatedCost(tokenAmount, "market", null, marketPriceCents);

  const potentialReturn = computePotentialReturn(tokenAmount);

  return {
    estimatedCost,
    potentialReturn,
    displayShares: tokenAmount,
  };
}

export function computePotentialReturn(tokenAmount: number): number {
  return Math.max(0, tokenAmount);
}
