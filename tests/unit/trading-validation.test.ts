// ---------------------------------------------------------------------------
// Tests for order validation and builder fee support in trading adapter
//
// These test pre-submission validation (min shares, notional) and builder
// fee wiring  - features ported from @purrdict/hip4.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
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
// Minimum shares validation
// ---------------------------------------------------------------------------

describe("minimum shares validation", () => {
  let client: HIP4Client;
  let auth: HIP4Auth;
  let adapter: HIP4TradingAdapter;

  beforeEach(async () => {
    client = createMockClient();
    auth = new HIP4Auth();
    adapter = new HIP4TradingAdapter(client, auth);
    await auth.initAuth("0xUSER", createMockSigner());
  });

  it("rejects order when size < getMinShares(markPx)", async () => {
    // markPx=0.9, min(0.9, 0.1)=0.1, minShares=ceil(10/0.1)=100
    const result = await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.9",
      amount: "50",
      markPx: 0.9,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/minimum|min.*shares/i);
  });

  it("accepts order when size >= getMinShares(markPx)", async () => {
    // markPx=0.5, minShares=ceil(10/0.5)=20
    const result = await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "20",
      markPx: 0.5,
    });

    expect(result.success).toBe(true);
  });

  it("skips min-shares check when markPx not provided", async () => {
    // Without markPx, should not validate min shares (but must pass notional check)
    // 0.5 * 25 = 12.5 >= 10 USDH ✓
    const result = await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "25",
    });

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Notional validation
// ---------------------------------------------------------------------------

describe("notional validation", () => {
  let client: HIP4Client;
  let auth: HIP4Auth;
  let adapter: HIP4TradingAdapter;

  beforeEach(async () => {
    client = createMockClient();
    auth = new HIP4Auth();
    adapter = new HIP4TradingAdapter(client, auth);
    await auth.initAuth("0xUSER", createMockSigner());
  });

  it("rejects order when price * size < 10 USDH", async () => {
    // 0.1 * 5 = 0.5 < 10
    const result = await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.1",
      amount: "5",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/notional|minimum/i);
  });

  it("accepts order when price * size >= 10 USDH", async () => {
    // 0.5 * 20 = 10 >= 10
    const result = await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "20",
    });

    expect(result.success).toBe(true);
  });

  it("skips notional check for market orders (extreme prices)", async () => {
    // Market orders use extreme prices so notional is always met
    const result = await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "market",
      amount: "10",
    });

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Builder fee support
// ---------------------------------------------------------------------------

describe("builder fee support", () => {
  let client: HIP4Client;
  let auth: HIP4Auth;
  let adapter: HIP4TradingAdapter;

  beforeEach(async () => {
    client = createMockClient();
    auth = new HIP4Auth();
    adapter = new HIP4TradingAdapter(client, auth);
    await auth.initAuth("0xUSER", createMockSigner());
  });

  it("includes builder in order action when builderAddress and builderFee provided", async () => {
    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "20",
      builderAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
      builderFee: 100,
    });

    const action = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.builder).toBeDefined();
    expect(action.builder.b).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
    expect(action.builder.f).toBe(100);
  });

  it("lowercases the builder address", async () => {
    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "20",
      builderAddress: "0xABCDEF",
      builderFee: 50,
    });

    const action = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.builder.b).toBe("0xabcdef");
  });

  it("omits builder when no builderAddress provided", async () => {
    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "20",
    });

    const action = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.builder).toBeUndefined();
  });

  it("attaches builder with fee 0 when address is provided and fee is 0", async () => {
    // Contract: providing builderAddress always attaches a `builder` field,
    // even when the fee is 0 (lets a caller tag an order with a builder for
    // tracking without charging a fee). To omit the builder entirely, omit
    // builderAddress.
    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "20",
      builderAddress: "0xABC",
      builderFee: 0,
    });

    const action = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.builder).toEqual({ b: "0xabc", f: 0 });
  });
});

// ---------------------------------------------------------------------------
// Tick-aligned pricing in orders
// ---------------------------------------------------------------------------

describe("tick-aligned pricing in orders", () => {
  let client: HIP4Client;
  let auth: HIP4Auth;
  let adapter: HIP4TradingAdapter;

  beforeEach(async () => {
    client = createMockClient();
    auth = new HIP4Auth();
    adapter = new HIP4TradingAdapter(client, auth);
    await auth.initAuth("0xUSER", createMockSigner());
  });

  it("formats price using 5-sig-fig tick alignment", async () => {
    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5500",
      amount: "20",
    });

    const action = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.orders[0].p).toBe("0.55");
  });

  it("strips trailing zeros from size string", async () => {
    await adapter.placeOrder({
      marketId: "1758",
      outcome: "#17580",
      side: "buy",
      type: "limit",
      price: "0.5",
      amount: "20.0",
    });

    const action = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.orders[0].s).toBe("20");
  });
});
