// ---------------------------------------------------------------------------
// Tests for fetchMarkets on the events adapter
//
// Verifies: type filtering, groupBy, sorting, cache, and integration with
// the classification system.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import { HIP4EventAdapter } from "../../src/adapter/hyperliquid/events";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import type { HLOutcomeMeta } from "../../src/adapter/hyperliquid/types";
import type { HIP4Market, MarketType } from "../../src/types/hip4-market";

// ---------------------------------------------------------------------------
// Mock data  - covers all 3 types
// ---------------------------------------------------------------------------

const mockMeta: HLOutcomeMeta = {
  outcomes: [
    {
      outcome: 100,
      name: "Recurring",
      description: "class:priceBinary|underlying:BTC|expiry:20270101-0000|targetPrice:100000|period:1d",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    {
      outcome: 200,
      name: "Recurring",
      description: "class:priceBinary|underlying:ETH|expiry:20270101-0000|targetPrice:5000|period:1h",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    {
      outcome: 300,
      name: "Will Mars be colonised by 2030?",
      description: "SpaceX prediction.",
      sideSpecs: [{ name: "Elon wins" }, { name: "Elon loses" }],
    },
    {
      outcome: 400,
      name: "Option A",
      description: "First option",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    {
      outcome: 401,
      name: "Option B",
      description: "Second option",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    {
      outcome: 402,
      name: "Other",
      description: "Fallback",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
  ],
  questions: [
    {
      question: 1,
      name: "Which option wins?",
      description: "A multi-outcome question.",
      fallbackOutcome: 402,
      namedOutcomes: [400, 401],
      settledNamedOutcomes: [],
    },
  ],
};

const mockMids: Record<string, string> = {
  BTC: "95000",
  ETH: "3500",
};

// ---------------------------------------------------------------------------
// Mock client
// ---------------------------------------------------------------------------

function createMockClient(): HIP4Client {
  return {
    testnet: true,
    infoUrl: "https://test",
    exchangeUrl: "https://test",
    wsUrl: "wss://test",
    log: vi.fn(),
    fetchOutcomeMeta: vi.fn().mockResolvedValue(mockMeta),
    fetchAllMids: vi.fn().mockResolvedValue(mockMids),
    fetchL2Book: vi.fn(),
    fetchRecentTrades: vi.fn(),
    fetchCandleSnapshot: vi.fn(),
    fetchClearinghouseState: vi.fn(),
    fetchUserFills: vi.fn(),
    fetchSpotClearinghouseState: vi.fn(),
    fetchUserFillsByTime: vi.fn(),
    fetchFrontendOpenOrders: vi.fn(),
    placeOrder: vi.fn(),
    cancelOrder: vi.fn(),
  } as unknown as HIP4Client;
}

// ---------------------------------------------------------------------------
// fetchMarkets  - unfiltered
// ---------------------------------------------------------------------------

describe("fetchMarkets", () => {
  let client: HIP4Client;
  let adapter: HIP4EventAdapter;

  beforeEach(() => {
    client = createMockClient();
    adapter = new HIP4EventAdapter(client);
  });

  it("returns all markets when no params", async () => {
    const markets = await adapter.fetchMarkets();
    expect(markets).toHaveLength(6);
  });

  it("every market has a valid type discriminant", async () => {
    const markets = await adapter.fetchMarkets();
    const validTypes: MarketType[] = ["defaultBinary", "labelledBinary", "multiOutcome"];
    for (const m of markets) {
      expect(validTypes).toContain(m.type);
    }
  });

  it("classifies the correct count of each type", async () => {
    const markets = await adapter.fetchMarkets();
    const byType = (t: MarketType) => markets.filter(m => m.type === t);
    expect(byType("defaultBinary")).toHaveLength(2);
    expect(byType("labelledBinary")).toHaveLength(1);
    expect(byType("multiOutcome")).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// fetchMarkets  - type filter
// ---------------------------------------------------------------------------

describe("fetchMarkets with type filter", () => {
  let adapter: HIP4EventAdapter;

  beforeEach(() => {
    adapter = new HIP4EventAdapter(createMockClient());
  });

  it("filters to defaultBinary only", async () => {
    const markets = await adapter.fetchMarkets({ type: "defaultBinary" });
    expect(markets).toHaveLength(2);
    expect(markets.every(m => m.type === "defaultBinary")).toBe(true);
  });

  it("filters to labelledBinary only", async () => {
    const markets = await adapter.fetchMarkets({ type: "labelledBinary" });
    expect(markets).toHaveLength(1);
    expect(markets[0].type).toBe("labelledBinary");
    expect(markets[0].name).toBe("Will Mars be colonised by 2030?");
  });

  it("filters to multiOutcome only", async () => {
    const markets = await adapter.fetchMarkets({ type: "multiOutcome" });
    expect(markets).toHaveLength(3);
    expect(markets.every(m => m.type === "multiOutcome")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchMarkets  - groupBy
// ---------------------------------------------------------------------------

describe("fetchMarkets with groupBy", () => {
  let adapter: HIP4EventAdapter;

  beforeEach(() => {
    adapter = new HIP4EventAdapter(createMockClient());
  });

  it("groupBy 'type' returns Record<MarketType, HIP4Market[]>", async () => {
    const grouped = await adapter.fetchMarkets({ groupBy: "type" });
    expect(grouped).toHaveProperty("defaultBinary");
    expect(grouped).toHaveProperty("labelledBinary");
    expect(grouped).toHaveProperty("multiOutcome");
    expect((grouped as Record<string, HIP4Market[]>).defaultBinary).toHaveLength(2);
    expect((grouped as Record<string, HIP4Market[]>).labelledBinary).toHaveLength(1);
    expect((grouped as Record<string, HIP4Market[]>).multiOutcome).toHaveLength(3);
  });

  it("groupBy 'question' groups multiOutcome by questionId, standalone as 'standalone'", async () => {
    const grouped = await adapter.fetchMarkets({ groupBy: "question" });
    const result = grouped as Record<string, HIP4Market[]>;
    // multiOutcome outcomes 400, 401, 402 are under question 1
    expect(result["1"]).toHaveLength(3);
    // standalone markets (defaultBinary + labelledBinary)
    expect(result["standalone"]).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// fetchMarkets  - limit / offset
// ---------------------------------------------------------------------------

describe("fetchMarkets with limit/offset", () => {
  let adapter: HIP4EventAdapter;

  beforeEach(() => {
    adapter = new HIP4EventAdapter(createMockClient());
  });

  it("respects limit", async () => {
    const markets = await adapter.fetchMarkets({ limit: 2 });
    expect(markets).toHaveLength(2);
  });

  it("respects offset", async () => {
    const all = await adapter.fetchMarkets();
    const offset = await adapter.fetchMarkets({ offset: 2 });
    expect(offset).toHaveLength(4);
    expect(offset[0].outcomeId).toBe(all[2].outcomeId);
  });

  it("limit + offset together", async () => {
    const page = await adapter.fetchMarkets({ limit: 2, offset: 1 });
    expect(page).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// fetchMarkets  - cache
// ---------------------------------------------------------------------------

describe("fetchMarkets caching", () => {
  it("reuses cache on second call (single fetch)", async () => {
    const client = createMockClient();
    const adapter = new HIP4EventAdapter(client);

    await adapter.fetchMarkets();
    await adapter.fetchMarkets();

    // outcomeMeta should only be fetched once
    expect(client.fetchOutcomeMeta).toHaveBeenCalledTimes(1);
  });
});
