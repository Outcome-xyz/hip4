import type { HLAllMids } from "../../src/adapter/hyperliquid/types";

/**
 * Fixture: allMids with outcome coins and regular coins.
 */
export const ALL_MIDS: HLAllMids = {
  // Side coins (prediction market prices)
  "#17580": "0.6",
  "#17581": "0.4",
  "#51600": "0.55",
  "#51601": "0.45",
  "#17590": "0.5",
  "#17591": "0.5",
  "#13380": "0.7",
  "#13381": "0.3",
  "#14000": "0.8",
  "#14001": "0.2",
  "#15000": "0.15",
  "#15001": "0.85",
  "#20010": "0.65",
  "#20011": "0.35",
  "#20020": "0.35",
  "#20021": "0.65",
  // Outcome-level coins
  "@1400": "0.8",
  // Regular coins (not outcomes)
  ETH: "3500",
  BTC: "95000",
};
