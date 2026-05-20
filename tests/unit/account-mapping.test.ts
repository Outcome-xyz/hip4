// ---------------------------------------------------------------------------
// Unit tests for HIP4AccountAdapter
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import { HIP4AccountAdapter } from "../../src/adapter/hyperliquid/account";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { SPOT_CLEARINGHOUSE } from "../fixtures/spot-clearinghouse";
import { ALL_MIDS } from "../fixtures/all-mids";
import { USER_FILLS } from "../fixtures/fills";

// ---------------------------------------------------------------------------
// Mock client
// ---------------------------------------------------------------------------

function createMockClient(
  overrides: Partial<HIP4Client> = {},
): HIP4Client {
  return {
    testnet: true,
    infoUrl: "https://test",
    exchangeUrl: "https://test",
    wsUrl: "wss://test",
    log: vi.fn(),
    fetchOutcomeMeta: vi.fn(),
    fetchAllMids: vi.fn().mockResolvedValue(ALL_MIDS),
    fetchL2Book: vi.fn(),
    fetchRecentTrades: vi.fn(),
    fetchCandleSnapshot: vi.fn(),
    fetchClearinghouseState: vi.fn(),
    fetchUserFills: vi.fn(),
    fetchSpotClearinghouseState: vi.fn().mockResolvedValue(SPOT_CLEARINGHOUSE),
    fetchUserFillsByTime: vi.fn().mockResolvedValue(USER_FILLS),
    fetchFrontendOpenOrders: vi.fn(),
    placeOrder: vi.fn(),
    cancelOrder: vi.fn(),
    ...overrides,
  } as unknown as HIP4Client;
}

const TEST_ADDRESS = "0xTestUser";

// ---------------------------------------------------------------------------
// fetchPositions
// ---------------------------------------------------------------------------

describe("fetchPositions", () => {
  let client: HIP4Client;
  let adapter: HIP4AccountAdapter;

  beforeEach(() => {
    client = createMockClient();
    adapter = new HIP4AccountAdapter(client);
  });

  it("filters to outcome coins only (@ and # prefixed)", async () => {
    const positions = await adapter.fetchPositions(TEST_ADDRESS);

    // Should include: #17580, #51601, @1400
    // Should exclude: #17590 (zero balance), USDC, USDH
    expect(positions).toHaveLength(3);

    const coins = positions.map((p) => p.outcome);
    // outcome is now the raw coin identifier
    expect(coins).toContain("#17580");
    expect(coins).toContain("#51601");
    expect(coins).toContain("@1400");
  });

  it("excludes zero-balance entries", async () => {
    const positions = await adapter.fetchPositions(TEST_ADDRESS);

    // #17590 has total: "0" → excluded
    const marketIds = positions.map((p) => p.marketId);
    expect(marketIds).not.toContain("1759");
  });

  it("excludes non-outcome coins (USDC, USDH)", async () => {
    const positions = await adapter.fetchPositions(TEST_ADDRESS);

    const outcomes = positions.map((p) => p.outcome);
    expect(outcomes).not.toContain("USDC");
    expect(outcomes).not.toContain("USDH");
  });

  it("computes correct avgCost (entryNtl / total)", async () => {
    const positions = await adapter.fetchPositions(TEST_ADDRESS);

    // #17580: entryNtl=60, total=100 → avgCost = 0.6
    const pos1 = positions.find((p) => p.marketId === "1758");
    expect(pos1).toBeDefined();
    expect(parseFloat(pos1!.avgCost)).toBeCloseTo(0.6, 4);

    // #51601: entryNtl=20, total=50 → avgCost = 0.4
    const pos2 = positions.find((p) => p.marketId === "5160");
    expect(pos2).toBeDefined();
    expect(parseFloat(pos2!.avgCost)).toBeCloseTo(0.4, 4);
  });

  it("computes correct pnl based on mid price", async () => {
    const positions = await adapter.fetchPositions(TEST_ADDRESS);

    // #17580: mid=0.6, avgCost=0.6, total=100 → pnl = (0.6 - 0.6) * 100 = 0
    const pos1 = positions.find((p) => p.marketId === "1758");
    expect(parseFloat(pos1!.unrealizedPnl)).toBeCloseTo(0, 4);

    // #51601: mid=0.45, avgCost=0.4, total=50 → pnl = (0.45 - 0.4) * 50 = 2.5
    const pos2 = positions.find((p) => p.marketId === "5160");
    expect(parseFloat(pos2!.unrealizedPnl)).toBeCloseTo(2.5, 4);
  });

  it("sets potentialPayout to total shares", async () => {
    const positions = await adapter.fetchPositions(TEST_ADDRESS);
    const pos1 = positions.find((p) => p.marketId === "1758");
    expect(parseFloat(pos1!.potentialPayout)).toBeCloseTo(100, 4);
  });
});

// ---------------------------------------------------------------------------
// fetchActivity
// ---------------------------------------------------------------------------

describe("fetchActivity", () => {
  let client: HIP4Client;
  let adapter: HIP4AccountAdapter;

  beforeEach(() => {
    client = createMockClient();
    adapter = new HIP4AccountAdapter(client);
  });

  it("calls fetchUserFillsByTime with ~30-day range", async () => {
    const before = Date.now();
    await adapter.fetchActivity(TEST_ADDRESS);
    const after = Date.now();

    const call = (client.fetchUserFillsByTime as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe(TEST_ADDRESS);

    const startTime = call[1] as number;
    const endTime = call[2] as number;

    // endTime should be roughly "now"
    expect(endTime).toBeGreaterThanOrEqual(before);
    expect(endTime).toBeLessThanOrEqual(after);

    // startTime should be ~30 days before endTime
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const diff = endTime - startTime;
    expect(diff).toBeCloseTo(thirtyDaysMs, -3); // within a second
  });

  it("maps buy fill correctly", async () => {
    const activities = await adapter.fetchActivity(TEST_ADDRESS);

    // First fill: #17580, side B → buy
    const buyFill = activities.find((a) => a.id === "5001");
    expect(buyFill).toBeDefined();
    expect(buyFill!.side).toBe("buy");
    expect(buyFill!.marketId).toBe("1758"); // coinOutcomeId("#17580") → 1758
    expect(buyFill!.outcome).toBe("#17580");
    expect(buyFill!.price).toBe("0.6000");
    expect(buyFill!.size).toBe("50");
    expect(buyFill!.type).toBe("trade");
  });

  it("maps sell fill correctly", async () => {
    const activities = await adapter.fetchActivity(TEST_ADDRESS);

    // Second fill: #51601, side A → sell
    const sellFill = activities.find((a) => a.id === "5002");
    expect(sellFill).toBeDefined();
    expect(sellFill!.side).toBe("sell");
    expect(sellFill!.marketId).toBe("5160"); // coinOutcomeId("#51601") → 5160
  });

  it("filters out non-outcome fills", async () => {
    const activities = await adapter.fetchActivity(TEST_ADDRESS);

    // Should only have 2 activities (the two outcome fills)
    // ETH and USDC fills should be excluded
    expect(activities).toHaveLength(2);

    const coins = activities.map((a) => a.outcome);
    expect(coins).not.toContain("ETH");
    expect(coins).not.toContain("USDC");
  });

  it("uses tid as activity id", async () => {
    const activities = await adapter.fetchActivity(TEST_ADDRESS);
    const ids = activities.map((a) => a.id);
    expect(ids).toContain("5001");
    expect(ids).toContain("5002");
  });
});
