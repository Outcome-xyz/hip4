// ---------------------------------------------------------------------------
// Extra coverage for HIP4AccountAdapter: fetchBalance, fetchOpenOrders,
// subscribePositions polling
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HIP4AccountAdapter } from "../../src/adapter/hyperliquid/account";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { SPOT_CLEARINGHOUSE } from "../fixtures/spot-clearinghouse";
import { FRONTEND_ORDERS } from "../fixtures/frontend-orders";
import { ALL_MIDS } from "../fixtures/all-mids";

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
    fetchUserFillsByTime: vi.fn().mockResolvedValue([]),
    fetchFrontendOpenOrders: vi.fn().mockResolvedValue(FRONTEND_ORDERS),
    placeOrder: vi.fn(),
    cancelOrder: vi.fn(),
    ...overrides,
  } as unknown as HIP4Client;
}

const ADDR = "0xTestUser";

// ---------------------------------------------------------------------------
// fetchBalance
// ---------------------------------------------------------------------------

describe("fetchBalance", () => {
  it("maps coin, total, hold from spotClearinghouseState", async () => {
    const client = createMockClient();
    const adapter = new HIP4AccountAdapter(client);

    const balances = await adapter.fetchBalance(ADDR);

    expect(client.fetchSpotClearinghouseState).toHaveBeenCalledWith(ADDR);
    expect(balances).toHaveLength(SPOT_CLEARINGHOUSE.balances.length);

    // Verify first entry maps correctly
    expect(balances[0]).toEqual({
      coin: "#17580",
      total: "100",
      hold: "0",
    });

    // Verify non-outcome coins are also included (fetchBalance returns all)
    const usdc = balances.find((b) => b.coin === "USDC");
    expect(usdc).toEqual({ coin: "USDC", total: "5000", hold: "0" });
  });
});

// ---------------------------------------------------------------------------
// fetchOpenOrders
// ---------------------------------------------------------------------------

describe("fetchOpenOrders", () => {
  it("maps coin, side, limitPx, sz, oid, timestamp from frontendOpenOrders", async () => {
    const client = createMockClient();
    const adapter = new HIP4AccountAdapter(client);

    const orders = await adapter.fetchOpenOrders(ADDR);

    expect(client.fetchFrontendOpenOrders).toHaveBeenCalledWith(ADDR);
    expect(orders).toHaveLength(FRONTEND_ORDERS.length);

    expect(orders[0]).toEqual({
      coin: "#17580",
      side: "B",
      limitPx: "0.520",
      sz: "100.0",
      oid: 60001,
      timestamp: 1711123200000,
    });

    // Verify sell side order
    expect(orders[1].side).toBe("A");
    expect(orders[1].oid).toBe(60002);
  });
});

// ---------------------------------------------------------------------------
// subscribePositions
// ---------------------------------------------------------------------------

describe("subscribePositions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls callback on initial poll and again after interval", async () => {
    const client = createMockClient();
    const adapter = new HIP4AccountAdapter(client);
    const callback = vi.fn();

    const unsub = adapter.subscribePositions(ADDR, callback);

    // Allow initial fetch to resolve
    await vi.advanceTimersByTimeAsync(0);
    // fetchPositions calls fetchSpotClearinghouseState + fetchAllMids
    expect(callback).toHaveBeenCalledTimes(1);

    // Advance past poll interval (10s)
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callback).toHaveBeenCalledTimes(2);

    // Unsubscribe and verify no more calls
    unsub();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("continues polling even if fetchPositions throws", async () => {
    let callCount = 0;
    const client = createMockClient({
      fetchSpotClearinghouseState: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("network error"));
        }
        return Promise.resolve(SPOT_CLEARINGHOUSE);
      }),
    });
    const adapter = new HIP4AccountAdapter(client);
    const callback = vi.fn();

    const unsub = adapter.subscribePositions(ADDR, callback);

    // First call throws - callback should not be called
    await vi.advanceTimersByTimeAsync(0);
    expect(callback).toHaveBeenCalledTimes(0);

    // Advance past poll interval - second call succeeds
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callback).toHaveBeenCalledTimes(1);

    unsub();
  });
});
