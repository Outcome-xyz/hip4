import type { HLFill } from "../../src/adapter/hyperliquid/types";

/**
 * Fixture: userFillsByTime with outcome fills and non-outcome fills.
 */
export const USER_FILLS: HLFill[] = [
  // Outcome coin fill - buy
  {
    coin: "#17580",
    px: "0.6000",
    sz: "50",
    side: "B",
    time: 1710000000000,
    startPosition: "0",
    dir: "Open Long",
    closedPnl: "0",
    hash: "0xabc1",
    oid: 1001,
    crossed: true,
    fee: "0.01",
    tid: 5001,
    feeToken: "USDC",
  },
  // Outcome coin fill - sell
  {
    coin: "#51601",
    px: "0.4500",
    sz: "25",
    side: "A",
    time: 1710001000000,
    startPosition: "50",
    dir: "Close Long",
    closedPnl: "5.00",
    hash: "0xabc2",
    oid: 1002,
    crossed: false,
    fee: "0.005",
    tid: 5002,
    feeToken: "USDC",
  },
  // Non-outcome coin fill - should be excluded
  {
    coin: "ETH",
    px: "3500.00",
    sz: "1",
    side: "B",
    time: 1710002000000,
    startPosition: "0",
    dir: "Open Long",
    closedPnl: "0",
    hash: "0xabc3",
    oid: 1003,
    crossed: true,
    fee: "0.50",
    tid: 5003,
    feeToken: "USDC",
  },
  // Another non-outcome fill (USDC transfer)
  {
    coin: "USDC",
    px: "1.00",
    sz: "100",
    side: "B",
    time: 1710003000000,
    startPosition: "0",
    dir: "Open Long",
    closedPnl: "0",
    hash: "0xabc4",
    oid: 1004,
    crossed: false,
    fee: "0.001",
    tid: 5004,
    feeToken: "USDC",
  },
];
