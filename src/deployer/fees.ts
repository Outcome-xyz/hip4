// ---------------------------------------------------------------------------
// Deployer fee scale
//
// @experimental A deployer sets a fee scale between 0 and 10 on the markets it
// creates. The trader pays `(scale + protocol) x` the base spot taker rate,
// where the protocol's own share is `max(scale, 1)`. Opens are free; the fee
// falls on the closing trade.
// ---------------------------------------------------------------------------

export const FEE_SCALE_MIN = 0;
export const FEE_SCALE_MAX = 10;

/**
 * Default spot taker rate at the standard tier, 7 basis points. Read the
 * account's real rate from `userFees.userSpotCrossRate` where it matters.
 */
export const BASE_TAKER_RATE = 0.0007;

/** How a closing trade's fee divides. Values are multiples of the base rate. */
export interface FeeSplit {
  total: number;
  deployer: number;
  protocol: number;
}

/** The split at a given scale. The protocol never takes less than 1x. */
export function feeSplit(scale: number): FeeSplit {
  const s = Math.min(Math.max(scale, FEE_SCALE_MIN), FEE_SCALE_MAX);
  const protocol = Math.max(s, 1);
  return { total: s + protocol, deployer: s, protocol };
}

/** What a closing trade of `notional` costs and pays, in quote units. */
export function feeAmounts(
  scale: number,
  notional: number,
  baseRate: number = BASE_TAKER_RATE,
): { base: number; trader: number; deployer: number; protocol: number } {
  const base = notional * baseRate;
  const split = feeSplit(scale);
  return {
    base,
    trader: base * split.total,
    deployer: base * split.deployer,
    protocol: base * split.protocol,
  };
}
