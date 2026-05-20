// ---------------------------------------------------------------------------
// Full trading flow tests: placeOrder, cancelOrder, resolveAssetId extras
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { HIP4Auth } from "../../src/adapter/hyperliquid/auth";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4TradingAdapter } from "../../src/adapter/hyperliquid/trading";
import type {
  HIP4Signer,
  HLExchangeResponse,
} from "../../src/adapter/hyperliquid/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockSigner(): HIP4Signer {
  return {
    getAddress: vi.fn().mockResolvedValue("0xMOCK"),
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
    log: vi.fn(),
    fetchOutcomeMeta: vi.fn(),
    fetchAllMids: vi.fn().mockResolvedValue({}),
    fetchL2Book: vi.fn(),
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
          statuses: [{ filled: { totalSz: "10", avgPx: "0.55", oid: 123 } }],
        },
      },
    } satisfies HLExchangeResponse),
    cancelOrder: vi.fn().mockResolvedValue({ status: "ok" }),
    ...overrides,
  } as unknown as HIP4Client;
}

// ---------------------------------------------------------------------------
// placeOrder full flow
// ---------------------------------------------------------------------------

describe("placeOrder full flow", () => {
  let client: HIP4Client;
  let auth: HIP4Auth;
  let adapter: HIP4TradingAdapter;
  let signer: HIP4Signer;

  beforeEach(async () => {
    client = createMockClient();
    auth = new HIP4Auth();
    adapter = new HIP4TradingAdapter(client, auth);
    signer = createMockSigner();
    await auth.initAuth("0xUSER", signer);
  });

  it("market buy builds correct orderWire and calls signL1Action + client.placeOrder", async () => {
    const result = await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "market",
      amount: "10",
    });

    expect(result.success).toBe(true);
    expect(result.orderId).toBe("123");
    expect(result.shares).toBe("10");

    // Verify signL1Action was called (signer.signTypedData)
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);

    // Verify client.placeOrder was called with sorted action
    const placeCall = (client.placeOrder as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const action = placeCall[0];
    expect(action.type).toBe("order");
    expect(action.orders[0].p).toBe("0.99999");
    expect(action.orders[0].b).toBe(true);
    expect(action.orders[0].a).toBe(100017580);
    expect(action.orders[0].t).toEqual({ limit: { tif: "FrontendMarket" } });

    // Verify nonce, signature, and vaultAddress args
    expect(typeof placeCall[1]).toBe("number"); // nonce
    expect(placeCall[2]).toEqual({
      r: "0x" + "ab".repeat(32),
      s: "0x" + "cd".repeat(32),
      v: 27,
    });
    expect(placeCall[3]).toBeNull(); // vaultAddress
  });

  it("limit order formats price correctly", async () => {
    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5500",
      amount: "20",
    });

    const action = (client.placeOrder as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(action.orders[0].p).toBe("0.55");
    // Size "20" has no trailing zeros to strip
    expect(action.orders[0].s).toBe("20");
    expect(action.orders[0].t).toEqual({ limit: { tif: "Gtc" } });
  });

  it("returns success: false when not authenticated", async () => {
    const freshAuth = new HIP4Auth();
    const freshAdapter = new HIP4TradingAdapter(client, freshAuth);

    const result = await freshAdapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "market",
      amount: "10",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not authenticated");
  });

  it("returns success: false on exchange error response", async () => {
    const errClient = createMockClient({
      placeOrder: vi.fn().mockResolvedValue({
        status: "err",
      } satisfies HLExchangeResponse),
    });
    const errAuth = new HIP4Auth();
    const errAdapter = new HIP4TradingAdapter(errClient, errAuth);
    const errSigner = createMockSigner();
    await errAuth.initAuth("0xUSER", errSigner);

    const result = await errAdapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "market",
      amount: "10",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("non-ok");
  });

  it("returns success: false when placeOrder throws", async () => {
    const throwClient = createMockClient({
      placeOrder: vi.fn().mockRejectedValue(new Error("Network timeout")),
    });
    const throwAuth = new HIP4Auth();
    const throwAdapter = new HIP4TradingAdapter(throwClient, throwAuth);
    await throwAuth.initAuth("0xUSER", createMockSigner());

    const result = await throwAdapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "market",
      amount: "10",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
  });

  it("returns success: false when no statuses returned", async () => {
    const noStatusClient = createMockClient({
      placeOrder: vi.fn().mockResolvedValue({
        status: "ok",
        response: { type: "order", data: { statuses: [] } },
      } satisfies HLExchangeResponse),
    });
    const nsAuth = new HIP4Auth();
    const nsAdapter = new HIP4TradingAdapter(noStatusClient, nsAuth);
    await nsAuth.initAuth("0xUSER", createMockSigner());

    const result = await nsAdapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "20",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No order status");
  });
});

// ---------------------------------------------------------------------------
// cancelOrder
// ---------------------------------------------------------------------------

describe("cancelOrder", () => {
  it("builds cancel action, signs, and calls client.cancelOrder", async () => {
    const client = createMockClient();
    const auth = new HIP4Auth();
    const adapter = new HIP4TradingAdapter(client, auth);
    const signer = createMockSigner();
    await auth.initAuth("0xUSER", signer);

    // v1.8 API: cancelOrder takes an array of params and returns
    // HLCancelResponse (was single param + void).
    await adapter.cancelOrder([
      {
        marketId: "1758",
        orderId: "99999",
        outcome: "#17580",
      },
    ]);

    expect(signer.signTypedData).toHaveBeenCalledTimes(1);

    const cancelCall = (client.cancelOrder as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const action = cancelCall[0];
    expect(action.type).toBe("cancel");
    expect(action.cancels).toEqual([{ a: 100017580, o: 99999 }]);
    expect(cancelCall[3]).toBeNull(); // vaultAddress
  });

  it("uses side 0 fallback when outcome not provided", async () => {
    const client = createMockClient();
    const auth = new HIP4Auth();
    const adapter = new HIP4TradingAdapter(client, auth);
    await auth.initAuth("0xUSER", createMockSigner());

    await adapter.cancelOrder([
      {
        marketId: "1758",
        orderId: "99999",
      },
    ]);

    const action = (client.cancelOrder as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(action.cancels[0].a).toBe(100017580); // sideAssetId(1758, 0)
  });

  it("throws when not authenticated", async () => {
    const client = createMockClient();
    const auth = new HIP4Auth();
    const adapter = new HIP4TradingAdapter(client, auth);

    await expect(
      adapter.cancelOrder([
        {
          marketId: "1758",
          orderId: "99999",
          outcome: "#17580",
        },
      ]),
    ).rejects.toThrow("Not authenticated");
  });
});

// ---------------------------------------------------------------------------
// resolveAssetId edge cases (via placeOrder)
// ---------------------------------------------------------------------------

describe("resolveAssetId edge cases", () => {
  let client: HIP4Client;
  let auth: HIP4Auth;
  let adapter: HIP4TradingAdapter;

  beforeEach(async () => {
    client = createMockClient();
    auth = new HIP4Auth();
    adapter = new HIP4TradingAdapter(client, auth);
    await auth.initAuth("0xUSER", createMockSigner());
  });

  async function getAssetId(outcome: string): Promise<number> {
    (client.placeOrder as ReturnType<typeof vi.fn>).mockClear();
    await adapter.placeOrder({
      marketId: "1758",
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

  it("resolves '+17580' (+ prefix) to correct asset ID", async () => {
    expect(await getAssetId("+17580")).toBe(100017580);
  });

  it("resolves '+17581' (+ prefix, side 1) to correct asset ID", async () => {
    expect(await getAssetId("+17581")).toBe(100017581);
  });

  it("resolves trailing digit '1' to side 1", async () => {
    expect(await getAssetId("No1")).toBe(100017581);
  });

  it("resolves bare string without digit to side 0", async () => {
    expect(await getAssetId("Yes")).toBe(100017580);
  });

  it("falls back to side 0 for trailing digit > 1", async () => {
    expect(await getAssetId("Side5")).toBe(100017580);
  });

  it("throws for sideIndex > 1 with # prefix", async () => {
    await expect(
      adapter.placeOrder({
        marketId: "1758",
        outcome: "#17582",
        side: "buy",
        type: "limit",
        price: "0.5",
        amount: "20",
      }),
    ).rejects.toThrow("Invalid sideIndex");
  });

  it("throws for sideIndex > 1 with + prefix", async () => {
    await expect(
      adapter.placeOrder({
        marketId: "1758",
        outcome: "+17582",
        side: "buy",
        type: "limit",
        price: "0.5",
        amount: "20",
      }),
    ).rejects.toThrow("Invalid sideIndex");
  });
});
