// ---------------------------------------------------------------------------
// Unit tests for HIP4EventAdapter
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4EventAdapter } from "../../src/adapter/hyperliquid/events";
import { ALL_MIDS } from "../fixtures/all-mids";
import { OUTCOME_META } from "../fixtures/outcome-meta";

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
    fetchOutcomeMeta: vi.fn().mockResolvedValue(OUTCOME_META),
    fetchAllMids: vi.fn().mockResolvedValue(ALL_MIDS),
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
// fetchCategories
// ---------------------------------------------------------------------------

describe("fetchCategories", () => {
  it("returns custom and recurring categories", async () => {
    const client = createMockClient();
    const adapter = new HIP4EventAdapter(client);

    const categories = await adapter.fetchCategories();

    expect(categories).toHaveLength(2);
    expect(categories.map((c) => c.id)).toEqual(["custom", "recurring"]);
  });
});

// ---------------------------------------------------------------------------
// fetchEvents - question-based outcomes
// ---------------------------------------------------------------------------

describe("fetchEvents - question-based outcomes", () => {
  let client: HIP4Client;
  let adapter: HIP4EventAdapter;

  beforeEach(() => {
    client = createMockClient();
    adapter = new HIP4EventAdapter(client);
  });

  it("creates events from questions with correct structure", async () => {
    const events = await adapter.fetchEvents();

    // Q1: "Which party wins the 2026 midterms?" → event id "q100"
    const q1 = events.find((e) => e.id === "q100");
    expect(q1).toBeDefined();
    expect(q1!.title).toBe("Which party wins the 2026 midterms?");
    expect(q1!.category).toBe("custom");
    expect(q1!.status).toBe("active"); // no settled outcomes

    // Q1 should have 4 markets (3 named + 1 fallback)
    expect(q1!.markets).toHaveLength(4);
    expect(q1!.markets[0].id).toBe("1758"); // Republican
    expect(q1!.markets[1].id).toBe("5160"); // Democrat
    expect(q1!.markets[2].id).toBe("1759"); // Independent
    expect(q1!.markets[3].id).toBe("1760"); // Fallback

    // Each market should have 2 outcomes (Yes/No)
    for (const market of q1!.markets) {
      expect(market.outcomes).toHaveLength(2);
      expect(market.outcomes[0].name).toBe("Yes");
      expect(market.outcomes[1].name).toBe("No");
      expect(market.eventId).toBe("q100");
    }
  });

  it("populates outcome prices from allMids", async () => {
    const events = await adapter.fetchEvents();
    const q1 = events.find((e) => e.id === "q100")!;

    // Republican (outcome 1758) → side coins #17580, #17581
    const republican = q1.markets.find((m) => m.id === "1758")!;
    expect(republican.outcomes[0].tokenId).toBe("#17580");
    expect(republican.outcomes[0].price).toBe("0.6");
    expect(republican.outcomes[1].tokenId).toBe("#17581");
    expect(republican.outcomes[1].price).toBe("0.4");
  });

  it("Q2 binary question has 2 markets (named + fallback)", async () => {
    const events = await adapter.fetchEvents();
    const q2 = events.find((e) => e.id === "q200");
    expect(q2).toBeDefined();
    expect(q2!.title).toBe("Will BTC hit 100k by June?");
    // 1 named outcome + 1 fallback
    expect(q2!.markets).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// fetchEvents - standalone outcomes
// ---------------------------------------------------------------------------

describe("fetchEvents - standalone outcomes", () => {
  let client: HIP4Client;
  let adapter: HIP4EventAdapter;

  beforeEach(() => {
    client = createMockClient();
    adapter = new HIP4EventAdapter(client);
  });

  it("standalone non-recurring outcome becomes its own event", async () => {
    const events = await adapter.fetchEvents();

    // Outcome 1400 - "ETH merge smooth?"
    const eth = events.find((e) => e.id === "o1400");
    expect(eth).toBeDefined();
    expect(eth!.title).toBe("ETH merge smooth?");
    expect(eth!.category).toBe("custom");
    expect(eth!.markets).toHaveLength(1);
    expect(eth!.markets[0].id).toBe("1400");
    expect(eth!.status).toBe("active");
  });

  it("standalone outcome creates individual event with correct market", async () => {
    const events = await adapter.fetchEvents();
    const doge = events.find((e) => e.id === "o1500");
    expect(doge).toBeDefined();
    expect(doge!.title).toBe("DOGE to $1?");
    expect(doge!.markets[0].outcomes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// fetchEvents - recurring outcomes
// ---------------------------------------------------------------------------

describe("fetchEvents - recurring outcomes", () => {
  it("recurring outcome gets title like 'BTC > $69070 (1d)'", async () => {
    const client = createMockClient();
    const adapter = new HIP4EventAdapter(client);

    const events = await adapter.fetchEvents();
    const recurring = events.find((e) => e.id === "o1338");

    expect(recurring).toBeDefined();
    expect(recurring!.title).toBe("BTC > $69070 (1d)");
    expect(recurring!.category).toBe("recurring");
    expect(recurring!.endDate).toBe("20260311-0300");
  });

  it("recurring outcome has parsed description", async () => {
    const client = createMockClient();
    const adapter = new HIP4EventAdapter(client);

    const events = await adapter.fetchEvents();
    const recurring = events.find((e) => e.id === "o1338")!;

    expect(recurring.description).toBe(
      "Will BTC be above $69070 by 20260311-0300?",
    );
  });
});

// ---------------------------------------------------------------------------
// fetchEvents - filters
// ---------------------------------------------------------------------------

describe("fetchEvents - filters", () => {
  let client: HIP4Client;
  let adapter: HIP4EventAdapter;

  beforeEach(() => {
    client = createMockClient();
    adapter = new HIP4EventAdapter(client);
  });

  it("filters by category", async () => {
    const recurring = await adapter.fetchEvents({ category: "recurring" });
    expect(recurring.every((e) => e.category === "recurring")).toBe(true);
    expect(recurring.length).toBeGreaterThan(0);

    const custom = await adapter.fetchEvents({ category: "custom" });
    expect(custom.every((e) => e.category === "custom")).toBe(true);
  });

  it("filters active only", async () => {
    const active = await adapter.fetchEvents({ active: true });
    expect(active.every((e) => e.status === "active")).toBe(true);
  });

  it("filters by query string (case insensitive)", async () => {
    const results = await adapter.fetchEvents({ query: "btc" });
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every(
        (e) =>
          e.title.toLowerCase().includes("btc") ||
          e.description.toLowerCase().includes("btc"),
      ),
    ).toBe(true);
  });

  it("applies limit and offset", async () => {
    const all = await adapter.fetchEvents();
    const page1 = await adapter.fetchEvents({ limit: 2, offset: 0 });
    const page2 = await adapter.fetchEvents({ limit: 2, offset: 2 });

    expect(page1).toHaveLength(2);
    expect(page1[0].id).toBe(all[0].id);
    expect(page1[1].id).toBe(all[1].id);
    expect(page2[0].id).toBe(all[2].id);
  });
});

// ---------------------------------------------------------------------------
// fetchEvent by ID
// ---------------------------------------------------------------------------

describe("fetchEvent", () => {
  it("returns correct single event by ID", async () => {
    const client = createMockClient();
    const adapter = new HIP4EventAdapter(client);

    const event = await adapter.fetchEvent("q100");
    expect(event.id).toBe("q100");
    expect(event.title).toBe("Which party wins the 2026 midterms?");
  });

  it("throws for invalid ID", async () => {
    const client = createMockClient();
    const adapter = new HIP4EventAdapter(client);

    await expect(adapter.fetchEvent("nonexistent")).rejects.toThrow(
      "HIP-4 event not found: nonexistent",
    );
  });
});

// ---------------------------------------------------------------------------
// Cache behavior
// ---------------------------------------------------------------------------

describe("cache", () => {
  it("second call within 30s uses cache (mock called once)", async () => {
    const client = createMockClient();
    const adapter = new HIP4EventAdapter(client);

    await adapter.fetchEvents();
    await adapter.fetchEvents();

    // fetchOutcomeMeta should be called exactly once (cached on second call)
    expect(client.fetchOutcomeMeta).toHaveBeenCalledTimes(1);
    expect(client.fetchAllMids).toHaveBeenCalledTimes(1);
  });

  it("new adapter instance does not share cache", async () => {
    const client = createMockClient();
    const adapter1 = new HIP4EventAdapter(client);
    const adapter2 = new HIP4EventAdapter(client);

    await adapter1.fetchEvents();
    await adapter2.fetchEvents();

    // Each adapter loads independently
    expect(client.fetchOutcomeMeta).toHaveBeenCalledTimes(2);
  });
});
