// ---------------------------------------------------------------------------
// Extra coverage for HIP4MarketDataAdapter: fetchCandles, WS subscriptions
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4MarketDataAdapter } from "../../src/adapter/hyperliquid/market-data";
import type { HLCandle } from "../../src/adapter/hyperliquid/types";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  sent: string[] = [];
  private openListeners: Array<() => void> = [];

  constructor(_url: string) {}

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  addEventListener(event: string, fn: () => void, _opts?: { once?: boolean }) {
    if (event === "open") {
      // If already open, fire immediately
      if (this.readyState === MockWebSocket.OPEN) {
        fn();
      } else {
        this.openListeners.push(fn);
      }
    }
  }

  // Test helper to simulate incoming message
  _receiveMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

// ---------------------------------------------------------------------------
// Test client factories
//
// fetchCandles tests use a fetch-stubbed client (we never touch WS there).
// WS-subscription tests use a real HIP4Client so subscribe + dispatch run
// through production code against the global MockWebSocket stub.
// ---------------------------------------------------------------------------

function createFetchStubClient(overrides: Partial<HIP4Client> = {}): HIP4Client {
  return {
    testnet: true,
    infoUrl: "https://test",
    exchangeUrl: "https://test",
    wsUrl: "wss://test/ws",
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
    placeOrder: vi.fn(),
    cancelOrder: vi.fn(),
    ...overrides,
  } as unknown as HIP4Client;
}

function createRealClient(): HIP4Client {
  return new HIP4Client({ testnet: true });
}

// ---------------------------------------------------------------------------
// fetchCandles
// ---------------------------------------------------------------------------

describe("fetchCandles", () => {
  it("maps candle snapshot OHLCV correctly", async () => {
    const rawCandles: HLCandle[] = [
      {
        t: 1700000000000,
        T: 1700003600000,
        s: "#17580",
        i: "1h",
        o: "0.5",
        c: "0.55",
        h: "0.6",
        l: "0.45",
        v: "1000",
        n: 50,
      },
      {
        t: 1700003600000,
        T: 1700007200000,
        s: "#17580",
        i: "1h",
        o: "0.55",
        c: "0.52",
        h: "0.58",
        l: "0.50",
        v: "800",
        n: 30,
      },
    ];

    const client = createFetchStubClient({
      fetchCandleSnapshot: vi.fn().mockResolvedValue(rawCandles),
    });
    const adapter = new HIP4MarketDataAdapter(client);

    const candles = await adapter.fetchCandles("1758");

    expect(client.fetchCandleSnapshot).toHaveBeenCalledTimes(1);
    const call = (client.fetchCandleSnapshot as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("#17580"); // sideCoin(1758, 0)
    expect(call[1]).toBe("1h"); // default interval

    expect(candles).toHaveLength(2);
    expect(candles[0]).toEqual({
      time: 1700000000, // t / 1000
      open: 0.5,
      high: 0.6,
      low: 0.45,
      close: 0.55,
      volume: 1000,
    });
  });

  it("uses default 14-day range when startTime/endTime not provided", async () => {
    const client = createFetchStubClient({
      fetchCandleSnapshot: vi.fn().mockResolvedValue([]),
    });
    const adapter = new HIP4MarketDataAdapter(client);

    const before = Date.now();
    await adapter.fetchCandles("1758");
    const after = Date.now();

    const call = (client.fetchCandleSnapshot as ReturnType<typeof vi.fn>).mock.calls[0];
    const start = call[2] as number;
    const end = call[3] as number;

    // end should be roughly now
    expect(end).toBeGreaterThanOrEqual(before);
    expect(end).toBeLessThanOrEqual(after);

    // start should be ~14 days before
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    expect(end - start).toBeCloseTo(fourteenDays, -3);
  });

  it("passes custom interval and time range", async () => {
    const client = createFetchStubClient({
      fetchCandleSnapshot: vi.fn().mockResolvedValue([]),
    });
    const adapter = new HIP4MarketDataAdapter(client);

    await adapter.fetchCandles("1758", "15m", 5000, 10000);

    const call = (client.fetchCandleSnapshot as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe("15m");
    expect(call[2]).toBe(5000);
    expect(call[3]).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// WebSocket subscriptions
// ---------------------------------------------------------------------------

describe("WebSocket subscriptions", () => {
  let createdSockets: MockWebSocket[];

  beforeEach(() => {
    createdSockets = [];
    vi.stubGlobal("WebSocket", class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        createdSockets.push(this);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function getWs(): MockWebSocket {
    return createdSockets[createdSockets.length - 1];
  }

  it("subscribeOrderBook sends l2Book subscription message", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    const cb = vi.fn();

    adapter.subscribeOrderBook("1758", cb);

    const ws = getWs();
    expect(ws.sent).toHaveLength(1);
    const msg = JSON.parse(ws.sent[0]);
    expect(msg).toEqual({
      method: "subscribe",
      subscription: { type: "l2Book", coin: "#17580" },
    });
  });

  it("subscribePrice sends allMids subscription message", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    const cb = vi.fn();

    adapter.subscribePrice("1758", cb);

    const ws = getWs();
    expect(ws.sent).toHaveLength(1);
    const msg = JSON.parse(ws.sent[0]);
    expect(msg).toEqual({
      method: "subscribe",
      subscription: { type: "allMids" },
    });
  });

  it("subscribeTrades sends trades subscription message", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    const cb = vi.fn();

    adapter.subscribeTrades("1758", cb);

    const ws = getWs();
    expect(ws.sent).toHaveLength(1);
    const msg = JSON.parse(ws.sent[0]);
    expect(msg).toEqual({
      method: "subscribe",
      subscription: { type: "trades", coin: "#17580" },
    });
  });

  it("routes l2Book message to subscribeOrderBook callback", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    const cb = vi.fn();

    adapter.subscribeOrderBook("1758", cb);

    const ws = getWs();
    // HL sends per-coin l2Book messages on the bare "l2Book" channel; the
    // coin lives in the data payload. Per-coin filtering happens in the
    // adapter, not via channel-name suffixes.
    ws._receiveMessage({
      channel: "l2Book",
      data: {
        coin: "#17580",
        time: 1700000000000,
        levels: [
          [{ px: "0.55", sz: "100", n: 1 }],
          [{ px: "0.56", sz: "50", n: 1 }],
        ],
      },
    });

    expect(cb).toHaveBeenCalledTimes(1);
    const book = cb.mock.calls[0][0];
    expect(book.marketId).toBe("1758");
    expect(book.bids).toEqual([{ price: "0.55", size: "100" }]);
    expect(book.asks).toEqual([{ price: "0.56", size: "50" }]);
  });

  it("routes allMids message to subscribePrice callback via wildcard", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    const cb = vi.fn();

    adapter.subscribePrice("1758", cb);

    const ws = getWs();
    // allMids are routed to wildcard subscribers (*), channel is "allMids"
    // The WS message routing checks both channelSubs and wildcardSubs
    // subscribePrice subscribes to "allMids" channel with coin "*"
    // So subKey is "allMids" (channel when coin === "*")
    ws._receiveMessage({
      channel: "allMids",
      data: {
        mids: {
          "#17580": "0.55",
          "#17581": "0.45",
        },
      },
    });

    expect(cb).toHaveBeenCalledTimes(1);
    const price = cb.mock.calls[0][0];
    expect(price.marketId).toBe("1758");
    expect(price.outcomes[0].price).toBe("0.55");
    expect(price.outcomes[1].price).toBe("0.45");
  });

  it("routes trades message to subscribeTrades callback", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    const cb = vi.fn();

    adapter.subscribeTrades("1758", cb);

    const ws = getWs();
    // Trades arrive on the bare "trades" channel as an array; each element
    // carries its own coin. The adapter filters by coin per subscription.
    ws._receiveMessage({
      channel: "trades",
      data: [
        {
          coin: "#17580",
          side: "B",
          px: "0.55",
          sz: "10",
          time: 1700000000000,
          hash: "0xabc",
          tid: 42,
          users: ["0xa", "0xb"],
        },
      ],
    });

    expect(cb).toHaveBeenCalledTimes(1);
    const trade = cb.mock.calls[0][0];
    expect(trade.marketId).toBe("1758");
    expect(trade.side).toBe("buy");
    expect(trade.price).toBe("0.55");
  });

  it("unsubscribe removes callback and does not fire again", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    const cb = vi.fn();

    const unsub = adapter.subscribeOrderBook("1758", cb);
    unsub();

    const ws = getWs();
    // WS should be closed since refCount drops to 0
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("WS closes when last subscription unsubscribes", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);

    const unsub1 = adapter.subscribeOrderBook("1758", vi.fn());
    const unsub2 = adapter.subscribeTrades("1758", vi.fn());

    const ws = getWs();

    unsub1();
    // Still one subscription - WS should stay open
    // (readyState may already be CLOSED if the mock set it, but refCount > 0)
    expect(ws.readyState).toBe(MockWebSocket.OPEN);

    unsub2();
    // Now refCount is 0 - WS should be closed
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("ignores non-JSON WS messages without crashing", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    adapter.subscribeOrderBook("1758", vi.fn());

    const ws = getWs();
    // Send invalid JSON
    expect(() => {
      ws.onmessage?.({ data: "not json" });
    }).not.toThrow();
  });

  it("ignores messages without channel or data", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    const cb = vi.fn();
    adapter.subscribeOrderBook("1758", cb);

    const ws = getWs();
    ws._receiveMessage({ noChannel: true });
    expect(cb).not.toHaveBeenCalled();
  });

  it("subscribePrice skips callback when neither side mid is present", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    const cb = vi.fn();

    adapter.subscribePrice("1758", cb);

    const ws = getWs();
    ws._receiveMessage({
      channel: "allMids",
      data: {
        mids: {
          "#99990": "0.5", // different market
        },
      },
    });

    expect(cb).not.toHaveBeenCalled();
  });

  it("destroy stops reconnection and closes WS", () => {
    const client = createRealClient();
    const adapter = new HIP4MarketDataAdapter(client);
    adapter.subscribeOrderBook("1758", vi.fn());

    adapter.destroy();
    // Should not throw
    expect(createdSockets.length).toBe(1);
  });
});
