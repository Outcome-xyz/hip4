import type { HLL2Book } from "../../src/adapter/hyperliquid/types";

/**
 * Fixture: realistic L2 order book for a prediction market side coin.
 * Prices in the 0.3 - 0.7 range (probability), sizes in small lots.
 */
export const L2_BOOK: HLL2Book = {
  coin: "#17580",
  time: 1711123200000,
  levels: [
    // bids (descending price)
    [
      { px: "0.550", sz: "120.0", n: 3 },
      { px: "0.540", sz: "250.0", n: 5 },
      { px: "0.520", sz: "80.0", n: 2 },
      { px: "0.500", sz: "400.0", n: 8 },
      { px: "0.480", sz: "150.0", n: 4 },
    ],
    // asks (ascending price)
    [
      { px: "0.560", sz: "100.0", n: 2 },
      { px: "0.580", sz: "200.0", n: 4 },
      { px: "0.600", sz: "350.0", n: 6 },
      { px: "0.650", sz: "90.0", n: 1 },
      { px: "0.700", sz: "500.0", n: 10 },
    ],
  ],
};
