import type { HLSpotClearinghouseState } from "../../src/adapter/hyperliquid/types";

/**
 * Fixture: spotClearinghouseState with outcome coins, non-outcome coins,
 * and a zero-balance entry.
 */
export const SPOT_CLEARINGHOUSE: HLSpotClearinghouseState = {
  balances: [
    // Outcome coin with position (side coin #17580)
    {
      coin: "#17580",
      token: 100017580,
      hold: "0",
      total: "100",
      entryNtl: "60",
    },
    // Another outcome coin (side coin #51601)
    {
      coin: "#51601",
      token: 100051601,
      hold: "0",
      total: "50",
      entryNtl: "20",
    },
    // Zero-balance outcome coin - should be excluded
    {
      coin: "#17590",
      token: 100017590,
      hold: "0",
      total: "0",
      entryNtl: "0",
    },
    // Non-outcome coin (USDC) - should be excluded
    {
      coin: "USDC",
      token: 1,
      hold: "0",
      total: "5000",
      entryNtl: "5000",
    },
    // Non-outcome coin (USDH) - should be excluded
    {
      coin: "USDH",
      token: 2,
      hold: "0",
      total: "250",
      entryNtl: "250",
    },
    // Outcome-level coin (@1400)
    {
      coin: "@1400",
      token: 999,
      hold: "0",
      total: "30",
      entryNtl: "15",
    },
  ],
};
