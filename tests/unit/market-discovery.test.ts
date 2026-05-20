// ---------------------------------------------------------------------------
// Tests for priceBinary market discovery, time utilities, and label formatting
//
// Ported from @purrdict/hip4 market discovery concepts into the perps SDK.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseDescription,
  discoverPriceBinaryMarkets,
  timeToExpiry,
  periodMinutes,
  formatMarketLabel,
} from "../../src/adapter/hyperliquid/market-discovery";
import type { PriceBinaryMarket } from "../../src/adapter/hyperliquid/market-discovery";

// ---------------------------------------------------------------------------
// parseDescription
// ---------------------------------------------------------------------------

describe("parseDescription", () => {
  it("parses a valid priceBinary description", () => {
    const desc = "class:priceBinary|underlying:BTC|expiry:20260310-0300|targetPrice:66200|period:15m";
    const result = parseDescription(desc);

    expect(result).not.toBeNull();
    expect(result!.class).toBe("priceBinary");
    expect(result!.underlying).toBe("BTC");
    expect(result!.targetPrice).toBe(66200);
    expect(result!.period).toBe("15m");
    expect(result!.expiry).toBeInstanceOf(Date);
    expect(result!.expiry.getUTCFullYear()).toBe(2026);
    expect(result!.expiry.getUTCMonth()).toBe(2); // March = 2
    expect(result!.expiry.getUTCDate()).toBe(10);
    expect(result!.expiry.getUTCHours()).toBe(3);
  });

  it("returns null for non-priceBinary class", () => {
    const desc = "class:other|underlying:BTC|expiry:20260310-0300|targetPrice:66200|period:15m";
    expect(parseDescription(desc)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDescription("")).toBeNull();
  });

  it("returns null for string without pipes", () => {
    expect(parseDescription("just a name")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(parseDescription("class:priceBinary|underlying:BTC")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// discoverPriceBinaryMarkets
// ---------------------------------------------------------------------------

describe("discoverPriceBinaryMarkets", () => {
  // Use a future date so tests don't expire
  const futureExpiry = new Date(Date.now() + 3600_000);
  const expiryStr = [
    futureExpiry.getUTCFullYear().toString(),
    String(futureExpiry.getUTCMonth() + 1).padStart(2, "0"),
    String(futureExpiry.getUTCDate()).padStart(2, "0"),
    "-",
    String(futureExpiry.getUTCHours()).padStart(2, "0"),
    String(futureExpiry.getUTCMinutes()).padStart(2, "0"),
  ].join("");

  const meta = {
    outcomes: [
      {
        outcome: 152,
        name: "Recurring",
        description: `class:priceBinary|underlying:BTC|expiry:${expiryStr}|targetPrice:66200|period:15m`,
        sideSpecs: [{ name: "Yes" }, { name: "No" }],
      },
      {
        outcome: 200,
        name: "Recurring",
        description: `class:priceBinary|underlying:ETH|expiry:${expiryStr}|targetPrice:3500|period:1h`,
        sideSpecs: [{ name: "Yes" }, { name: "No" }],
      },
      {
        outcome: 300,
        name: "Custom event",
        description: "Will X happen?",
        sideSpecs: [{ name: "Yes" }, { name: "No" }],
      },
    ],
    questions: [],
  };

  const mids: Record<string, string> = {
    BTC: "66000",
    ETH: "3400",
  };

  it("discovers active priceBinary markets", () => {
    const markets = discoverPriceBinaryMarkets(meta, mids);
    expect(markets).toHaveLength(2);
  });

  it("returns correct Market shape", () => {
    const markets = discoverPriceBinaryMarkets(meta, mids);
    const btc = markets.find(m => m.underlying === "BTC")!;

    expect(btc.outcomeId).toBe(152);
    expect(btc.underlying).toBe("BTC");
    expect(btc.targetPrice).toBe(66200);
    expect(btc.period).toBe("15m");
    expect(btc.yesCoinNum).toBe(1520);
    expect(btc.noCoinNum).toBe(1521);
    expect(btc.yesCoin).toBe("#1520");
    expect(btc.noCoin).toBe("#1521");
    expect(btc.yesAsset).toBe(100001520);
    expect(btc.noAsset).toBe(100001521);
  });

  it("filters out non-priceBinary outcomes", () => {
    const markets = discoverPriceBinaryMarkets(meta, mids);
    expect(markets.every(m => m.underlying !== undefined)).toBe(true);
    expect(markets.find(m => m.outcomeId === 300)).toBeUndefined();
  });

  it("filters out expired markets", () => {
    const pastExpiry = "20200101-0000";
    const expiredMeta = {
      outcomes: [
        {
          outcome: 999,
          name: "Recurring",
          description: `class:priceBinary|underlying:BTC|expiry:${pastExpiry}|targetPrice:50000|period:1d`,
          sideSpecs: [{ name: "Yes" }, { name: "No" }],
        },
      ],
      questions: [],
    };
    const markets = discoverPriceBinaryMarkets(expiredMeta, mids);
    expect(markets).toHaveLength(0);
  });

  it("filters out markets with no underlying price in mids", () => {
    const markets = discoverPriceBinaryMarkets(meta, { BTC: "66000" }); // no ETH
    expect(markets).toHaveLength(1);
    expect(markets[0].underlying).toBe("BTC");
  });
});

// ---------------------------------------------------------------------------
// timeToExpiry
// ---------------------------------------------------------------------------

describe("timeToExpiry", () => {
  it("returns positive minutes for future market", () => {
    const market: PriceBinaryMarket = {
      outcomeId: 1,
      underlying: "BTC",
      targetPrice: 66000,
      expiry: new Date(Date.now() + 60 * 60_000), // 60 min from now
      period: "1h",
      yesCoinNum: 10,
      noCoinNum: 11,
      yesCoin: "#10",
      noCoin: "#11",
      yesAsset: 100000010,
      noAsset: 100000011,
    };
    const minutes = timeToExpiry(market);
    expect(minutes).toBeGreaterThan(58);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it("returns negative minutes for expired market", () => {
    const market: PriceBinaryMarket = {
      outcomeId: 1,
      underlying: "BTC",
      targetPrice: 66000,
      expiry: new Date(Date.now() - 10 * 60_000), // 10 min ago
      period: "1h",
      yesCoinNum: 10,
      noCoinNum: 11,
      yesCoin: "#10",
      noCoin: "#11",
      yesAsset: 100000010,
      noAsset: 100000011,
    };
    expect(timeToExpiry(market)).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// periodMinutes
// ---------------------------------------------------------------------------

describe("periodMinutes", () => {
  it("parses '1m' → 1", () => {
    expect(periodMinutes("1m")).toBe(1);
  });

  it("parses '5m' → 5", () => {
    expect(periodMinutes("5m")).toBe(5);
  });

  it("parses '15m' → 15", () => {
    expect(periodMinutes("15m")).toBe(15);
  });

  it("parses '1h' → 60", () => {
    expect(periodMinutes("1h")).toBe(60);
  });

  it("parses '4h' → 240", () => {
    expect(periodMinutes("4h")).toBe(240);
  });

  it("parses '1d' → 1440", () => {
    expect(periodMinutes("1d")).toBe(1440);
  });

  it("returns 15 for unrecognised formats", () => {
    expect(periodMinutes("abc")).toBe(15);
    expect(periodMinutes("")).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// formatMarketLabel
// ---------------------------------------------------------------------------

describe("formatMarketLabel", () => {
  it("formats as 'UNDERLYING-PERIOD'", () => {
    const market: PriceBinaryMarket = {
      outcomeId: 1,
      underlying: "BTC",
      targetPrice: 66000,
      expiry: new Date(),
      period: "1d",
      yesCoinNum: 10,
      noCoinNum: 11,
      yesCoin: "#10",
      noCoin: "#11",
      yesAsset: 100000010,
      noAsset: 100000011,
    };
    expect(formatMarketLabel(market)).toBe("BTC-1d");
  });

  it("formats HYPE-15m", () => {
    const market: PriceBinaryMarket = {
      outcomeId: 1,
      underlying: "HYPE",
      targetPrice: 20,
      expiry: new Date(),
      period: "15m",
      yesCoinNum: 10,
      noCoinNum: 11,
      yesCoin: "#10",
      noCoin: "#11",
      yesAsset: 100000010,
      noAsset: 100000011,
    };
    expect(formatMarketLabel(market)).toBe("HYPE-15m");
  });
});
