// ---------------------------------------------------------------------------
// Tests for fetchMarkets on the events adapter
//
// Verifies: type filtering, groupBy, sorting, cache, and integration with
// the classification system.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import { HIP4EventAdapter } from "../../src/adapter/hyperliquid/events";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import type {
  HLOutcomeMeta,
  HLOutcomeTemplate,
  HLWsSpotAssetCtxItem,
} from "../../src/adapter/hyperliquid/types";
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

// ---------------------------------------------------------------------------
// fetchMarkets  - template names and sortBy
// ---------------------------------------------------------------------------

const templateMeta: HLOutcomeMeta = {
  outcomes: [
    {
      outcome: 10,
      name: "template:priceTouch",
      description: "perp:BTC|target:90000|time:20261101-0000",
      sideSpecs: [{ name: "template:Yes" }, { name: "template:No" }],
    },
    {
      outcome: 11,
      name: "template:priceTouch",
      description: "perp:ETH|target:5000|time:20261015-1200",
      sideSpecs: [{ name: "template:Yes" }, { name: "template:No" }],
    },
    {
      outcome: 12,
      name: "Plain market",
      description: "No event time.",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
  ],
  questions: [],
};

const templates: HLOutcomeTemplate[] = [
  {
    id: "priceTouch",
    role: { standaloneOutcome: { sideNames: ["Yes", "No"] } },
    name: "{perp} touches {target} by {time}",
    description: "Resolves Yes if {perp} touches {target}.",
    keywords: [
      ["perp", "hlPerp"],
      ["target", "uDecimal"],
      ["time", "dateTime"],
    ],
  },
];

function ctx(coin: string, dayNtlVlm: string): HLWsSpotAssetCtxItem {
  return {
    coin,
    dayNtlVlm,
    markPx: "0.5",
    midPx: "0.5",
    prevDayPx: "0.5",
    circulatingSupply: "0",
    totalSupply: "0",
    dayBaseVlm: "0",
  };
}

function createTemplateClient(): HIP4Client {
  return {
    ...createMockClient(),
    fetchOutcomeMeta: vi.fn().mockResolvedValue(templateMeta),
    fetchOutcomeTemplates: vi.fn().mockResolvedValue(templates),
    fetchSpotAssetCtxs: vi
      .fn()
      .mockResolvedValue([
        ctx("#100", "50"),
        ctx("#101", "10"),
        ctx("#110", "5"),
        ctx("#120", "100"),
      ]),
  } as unknown as HIP4Client;
}

describe("fetchMarkets template names", () => {
  it("renders template markets into the parsed fields", async () => {
    const adapter = new HIP4EventAdapter(createTemplateClient());
    const markets = await adapter.fetchMarkets();
    const btc = markets.find((m) => m.outcomeId === 10)!;
    expect(btc.parsedName).toBe("BTC touches 90000 by Nov 1, 00:00 UTC");
    expect(btc.sides.map((s) => s.parsedName)).toEqual(["Yes", "No"]);
    expect(markets.find((m) => m.outcomeId === 12)!.parsedName).toBe("Plain market");
  });

  it("keeps the wire names in name and sides[].name", async () => {
    const adapter = new HIP4EventAdapter(createTemplateClient());
    const markets = await adapter.fetchMarkets();
    const btc = markets.find((m) => m.outcomeId === 10)!;
    expect(btc.name).toBe("template:priceTouch");
    expect(btc.sides.map((s) => s.name)).toEqual(["template:Yes", "template:No"]);
    expect(markets.find((m) => m.outcomeId === 12)!.name).toBe("Plain market");
  });

  it("keeps wire names when the registry request fails", async () => {
    const client = createTemplateClient();
    (client.fetchOutcomeTemplates as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom"),
    );
    const adapter = new HIP4EventAdapter(client);
    const markets = await adapter.fetchMarkets();
    const btc = markets.find((m) => m.outcomeId === 10)!;
    expect(btc.name).toBe("template:priceTouch");
    expect(btc.parsedName).toBe("template:priceTouch");
  });
});

describe("fetchMarkets with sortBy", () => {
  let client: HIP4Client;
  let adapter: HIP4EventAdapter;

  beforeEach(() => {
    client = createTemplateClient();
    adapter = new HIP4EventAdapter(client);
  });

  const ids = (markets: HIP4Market[]) => markets.map((m) => m.outcomeId);

  it("keeps catalog order without sortBy", async () => {
    expect(ids(await adapter.fetchMarkets())).toEqual([10, 11, 12]);
  });

  it("newest puts the highest outcome id first", async () => {
    expect(ids(await adapter.fetchMarkets({ sortBy: "newest" }))).toEqual([
      12, 11, 10,
    ]);
  });

  it("expiry puts the soonest event first and markets without one last", async () => {
    expect(ids(await adapter.fetchMarkets({ sortBy: "expiry" }))).toEqual([
      11, 10, 12,
    ]);
  });

  it("volume sums both sides and puts the highest first", async () => {
    expect(ids(await adapter.fetchMarkets({ sortBy: "volume" }))).toEqual([
      12, 10, 11,
    ]);
    expect(client.fetchSpotAssetCtxs).toHaveBeenCalledTimes(1);
  });

  it("applies limit after sorting", async () => {
    expect(
      ids(await adapter.fetchMarkets({ sortBy: "newest", limit: 1 })),
    ).toEqual([12]);
  });
});

describe("fetchMarkets sortBy expiry with metadata tags", () => {
  it("reads event times through a glued metadata tag", async () => {
    const meta: HLOutcomeMeta = {
      outcomes: [
        {
          outcome: 30,
          name: "template:priceTouch",
          description:
            "perp:BTC|target:90000 metadata=category:economics|time:20261101-0000",
          sideSpecs: [{ name: "template:Yes" }, { name: "template:No" }],
        },
        {
          outcome: 31,
          name: "template:priceTouch",
          description:
            "perp:ETH|target:5000|time:20261015-1200 metadata=category:price|subCategory:N/A",
          sideSpecs: [{ name: "template:Yes" }, { name: "template:No" }],
        },
        {
          outcome: 32,
          name: "Plain market",
          description: "No event time.",
          sideSpecs: [{ name: "Yes" }, { name: "No" }],
        },
      ],
      questions: [],
    };
    const client = {
      ...createTemplateClient(),
      fetchOutcomeMeta: vi.fn().mockResolvedValue(meta),
    } as unknown as HIP4Client;
    const adapter = new HIP4EventAdapter(client);
    const sorted = await adapter.fetchMarkets({ sortBy: "expiry" });
    expect((sorted as HIP4Market[]).map((m) => m.outcomeId)).toEqual([
      31, 30, 32,
    ]);
  });
});
