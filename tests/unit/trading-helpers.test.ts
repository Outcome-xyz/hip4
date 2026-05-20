// ---------------------------------------------------------------------------
// Unit tests for HIP4TradingAdapter
//
// The helper functions (formatPrice, resolveAssetId, mapTif, interpretStatus)
// are private, so we test them through the public placeOrder API with a mock
// client and mock signer.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { HIP4Auth } from "../../src/adapter/hyperliquid/auth";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4TradingAdapter } from "../../src/adapter/hyperliquid/trading";
import type {
  HIP4Signer,
  HLExchangeResponse,
  HLOrderStatus,
} from "../../src/adapter/hyperliquid/types";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockSigner(): HIP4Signer {
  return {
    getAddress: vi.fn().mockResolvedValue("0xMOCK_ADDRESS"),
    signTypedData: vi.fn().mockResolvedValue({
      r: "0x" + "ab".repeat(32),
      s: "0x" + "cd".repeat(32),
      v: 27,
    }),
  };
}

function createMockClient(overrides: Partial<HIP4Client> = {}): HIP4Client {
  return {
    testnet: true,
    infoUrl: "https://test",
    exchangeUrl: "https://test",
    wsUrl: "wss://test",
    fetchAllMids: vi.fn().mockResolvedValue({}),
    fetchOutcomeMeta: vi.fn(),
    fetchL2Book: vi
      .fn()
      .mockResolvedValue({ levels: [[], []], time: Date.now() }),
    fetchRecentTrades: vi.fn(),
    fetchCandleSnapshot: vi.fn(),
    fetchClearinghouseState: vi.fn(),
    fetchUserFills: vi.fn(),
    fetchSpotClearinghouseState: vi.fn(),
    fetchUserFillsByTime: vi.fn(),
    fetchFrontendOpenOrders: vi.fn(),
    placeOrder: vi.fn().mockResolvedValue({
      status: "ok",
      response: {
        type: "order",
        data: {
          statuses: [{ filled: { totalSz: "10", avgPx: "0.6", oid: 999 } }],
        },
      },
    } satisfies HLExchangeResponse),
    cancelOrder: vi.fn(),
    log: vi.fn(),
    ...overrides,
  } as unknown as HIP4Client;
}

async function setupAuth(auth: HIP4Auth): Promise<HIP4Signer> {
  const signer = createMockSigner();
  await auth.initAuth("0xUSER", signer);
  return signer;
}

// ---------------------------------------------------------------------------
// formatPrice - tested via limit orders (price passthrough)
// ---------------------------------------------------------------------------

describe("formatPrice (via limit orders)", () => {
  let client: HIP4Client;
  let auth: HIP4Auth;
  let adapter: HIP4TradingAdapter;

  beforeEach(async () => {
    client = createMockClient();
    auth = new HIP4Auth();
    adapter = new HIP4TradingAdapter(client, auth);
    await setupAuth(auth);
  });

  /**
   * Helper to extract the formatted price from the order wire passed to client.placeOrder.
   * Uses a large amount to ensure notional check passes for all prices.
   */
  async function getOrderPrice(rawPrice: string, amount = "200"): Promise<string> {
    (client.placeOrder as ReturnType<typeof vi.fn>).mockClear();
    await adapter.placeOrder({
      marketId: "1758",
      outcome: "Yes",
      side: "buy",
      type: "limit",
      price: rawPrice,
      amount,
    });
    const call = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    );
    const action = call![0];
    return action.orders[0].p;
  }

  it("formats 0 as '0' (rejected by notional check before reaching exchange)", async () => {
    const result = await adapter.placeOrder({
      marketId: "1758",
      outcome: "Yes",
      side: "buy",
      type: "limit",
      price: "0",
      amount: "200",
    });
    // price=0, notional=0 → rejected before reaching exchange
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/notional/i);
  });

  it("formats 0.648 as '0.648'", async () => {
    expect(await getOrderPrice("0.648")).toBe("0.648");
  });

  it("formats 0.5 as '0.5'", async () => {
    expect(await getOrderPrice("0.5")).toBe("0.5");
  });

  it("formats 0.0001 as '0.0001' (rejected by notional check)", async () => {
    // 0.0001 * 200 = 0.02 < 10 → rejected
    const result = await adapter.placeOrder({
      marketId: "1758",
      outcome: "Yes",
      side: "buy",
      type: "limit",
      price: "0.0001",
      amount: "200",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/notional/i);
  });

  it("formats 0.10 as '0.1' (trailing zero removed)", async () => {
    expect(await getOrderPrice("0.10")).toBe("0.1");
  });

  it("formats 1234 as '1234'", async () => {
    expect(await getOrderPrice("1234")).toBe("1234");
  });

  it("formats 45.67 as '45.67' (5-sig-fig tick alignment)", async () => {
    expect(await getOrderPrice("45.67")).toBe("45.67");
  });

  it("formats 5.123 as '5.123' (5-sig-fig tick alignment)", async () => {
    expect(await getOrderPrice("5.123")).toBe("5.123");
  });

  it("formats 999.99 as '999.99' (5-sig-fig tick, no rounding needed)", async () => {
    expect(await getOrderPrice("999.99")).toBe("999.99");
  });
});

// ---------------------------------------------------------------------------
// resolveAssetId - tested via order wire's `a` field
// ---------------------------------------------------------------------------

describe("resolveAssetId (via order wire)", () => {
  let client: HIP4Client;
  let auth: HIP4Auth;
  let adapter: HIP4TradingAdapter;

  beforeEach(async () => {
    client = createMockClient();
    auth = new HIP4Auth();
    adapter = new HIP4TradingAdapter(client, auth);
    await setupAuth(auth);
  });

  async function getAssetId(
    marketId: string,
    outcome: string,
  ): Promise<number> {
    (client.placeOrder as ReturnType<typeof vi.fn>).mockClear();
    await adapter.placeOrder({
      marketId,
      outcome,
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "20",
    });
    const call = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    );
    return call![0].orders[0].a;
  }

  it("resolves #17580 → sideAssetId using parsed side index", async () => {
    // outcome="#17580" → starts with # → slice(1)="17580" → last digit=0 → sideIndex=0
    // marketId="1758" → outcomeId=1758
    // sideAssetId(1758, 0) = 100_000_000 + 1758 * 10 + 0 = 100017580
    expect(await getAssetId("1758", "#17580")).toBe(100017580);
  });

  it("resolves 'Side 0' using marketId + parsed side index", async () => {
    // "Side 0" → matches /(\d)$/ → sideIndex=0
    // sideAssetId(1758, 0) = 100017580
    expect(await getAssetId("1758", "Side 0")).toBe(100017580);
  });

  it("resolves 'Yes' → defaults to side 0", async () => {
    // "Yes" → no # prefix, no trailing digit → defaults to sideIndex=0
    // sideAssetId(1758, 0) = 100017580
    expect(await getAssetId("1758", "Yes")).toBe(100017580);
  });

  it("resolves side 1 from 'Side 1'", async () => {
    // sideAssetId(1758, 1) = 100017581
    expect(await getAssetId("1758", "Side 1")).toBe(100017581);
  });
});

// ---------------------------------------------------------------------------
// mapTif - tested via order wire's `t` field
// ---------------------------------------------------------------------------

describe("mapTif (via order wire)", () => {
  let client: HIP4Client;
  let auth: HIP4Auth;
  let adapter: HIP4TradingAdapter;

  beforeEach(async () => {
    client = createMockClient({
      fetchAllMids: vi.fn().mockResolvedValue({ "#17580": "0.5" }),
    });
    auth = new HIP4Auth();
    adapter = new HIP4TradingAdapter(client, auth);
    await setupAuth(auth);
  });

  async function getOrderType(
    type: "market" | "limit",
    timeInForce?: "GTC" | "GTD" | "FOK" | "FAK",
  ) {
    (client.placeOrder as ReturnType<typeof vi.fn>).mockClear();
    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type,
      price: type === "limit" ? "0.5" : undefined,
      amount: "20",
      timeInForce,
    });
    const call = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    );
    return call![0].orders[0].t;
  }

  it("market → FrontendMarket", async () => {
    const t = await getOrderType("market");
    expect(t).toEqual({ limit: { tif: "FrontendMarket" } });
  });

  it("limit with no TIF → Gtc", async () => {
    const t = await getOrderType("limit");
    expect(t).toEqual({ limit: { tif: "Gtc" } });
  });

  it("limit FOK is rejected (HL has no Fill-or-Kill)", async () => {
    // HL's "Ioc" = Fill-and-Kill (allows partial fills), not Fill-or-Kill.
    // The SDK rejects FOK explicitly so callers don't silently get
    // partial-fill behavior they didn't ask for. Use FAK or GTC instead.
    await expect(getOrderType("limit", "FOK")).rejects.toThrow(/FOK/i);
  });

  it("limit FAK → Ioc", async () => {
    const t = await getOrderType("limit", "FAK");
    expect(t).toEqual({ limit: { tif: "Ioc" } });
  });
});

// ---------------------------------------------------------------------------
// Market order slippage
// ---------------------------------------------------------------------------

describe("market order pricing", () => {
  it("buy uses extreme high price for FrontendMarket best-execution", async () => {
    const client = createMockClient({});
    const auth = new HIP4Auth();
    const adapter = new HIP4TradingAdapter(client, auth);
    await setupAuth(auth);

    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "market",
      amount: "10",
    });

    const call = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0];
    const price = call[0].orders[0].p;
    expect(price).toBe("0.99999");
  });

  it("sell uses extreme low price for FrontendMarket best-execution", async () => {
    const client = createMockClient({});
    const auth = new HIP4Auth();
    const adapter = new HIP4TradingAdapter(client, auth);
    await setupAuth(auth);

    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "sell",
      type: "market",
      amount: "10",
    });

    const call = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0];
    const price = call[0].orders[0].p;
    expect(price).toBe("0.00001");
  });
});

// ---------------------------------------------------------------------------
// Clamping to [0.0001, 0.9999]
// ---------------------------------------------------------------------------

describe("market order uses fixed extreme prices", () => {
  it("buy always uses 0.99999 regardless of mid", async () => {
    const client = createMockClient({});
    const auth = new HIP4Auth();
    const adapter = new HIP4TradingAdapter(client, auth);
    await setupAuth(auth);

    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "market",
      amount: "10",
    });

    const call = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0].orders[0].p).toBe("0.99999");
  });
});

// ---------------------------------------------------------------------------
// interpretStatus - tested via placeOrder return values
// ---------------------------------------------------------------------------

describe("interpretStatus (via placeOrder result)", () => {
  async function placeWithStatus(status: HLOrderStatus) {
    const client = createMockClient({
      placeOrder: vi.fn().mockResolvedValue({
        status: "ok",
        response: { type: "order", data: { statuses: [status] } },
      } satisfies HLExchangeResponse),
    });
    const auth = new HIP4Auth();
    const adapter = new HIP4TradingAdapter(client, auth);
    await setupAuth(auth);

    return adapter.placeOrder({
      marketId: "1758",
      outcome: "Yes",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "20",
    });
  }

  it("filled → returns orderId + shares", async () => {
    const result = await placeWithStatus({
      filled: { totalSz: "10", avgPx: "0.5", oid: 42 },
    });
    expect(result.success).toBe(true);
    expect(result.orderId).toBe("42");
    expect(result.shares).toBe("10");
    expect(result.status).toBe("filled");
  });

  it("resting → returns orderId", async () => {
    const result = await placeWithStatus({
      resting: { oid: 99 },
    });
    expect(result.success).toBe(true);
    expect(result.orderId).toBe("99");
    expect(result.status).toBe("resting");
    expect(result.shares).toBeUndefined();
  });

  it("error → returns error string", async () => {
    const result = await placeWithStatus({
      error: "Insufficient margin",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient margin");
    expect(result.status).toBe("error");
  });

  it("unknown status shape → status 'unknown'", async () => {
    // Cast to HLOrderStatus to test the fallback branch
    const result = await placeWithStatus({} as HLOrderStatus);
    expect(result.success).toBe(true); // no error field → success
    expect(result.status).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Edge case: not authenticated
// ---------------------------------------------------------------------------

describe("placeOrder without auth", () => {
  it("returns error when no signer", async () => {
    const client = createMockClient();
    const auth = new HIP4Auth();
    const adapter = new HIP4TradingAdapter(client, auth);

    const result = await adapter.placeOrder({
      marketId: "1758",
      outcome: "Yes",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "10",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not authenticated");
  });
});
