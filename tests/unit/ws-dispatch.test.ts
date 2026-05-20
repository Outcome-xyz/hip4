import { beforeEach, describe, expect, it, vi } from "vitest";
import { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4MarketDataAdapter } from "../../src/adapter/hyperliquid/market-data";

// ---------------------------------------------------------------------------
// Mock WebSocket (class-based, same pattern as market-data-extras.test.ts)
// ---------------------------------------------------------------------------

let wsInstances: MockWebSocket[] = [];

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  sent: string[] = [];

  constructor(_url: string) {
    wsInstances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  addEventListener(event: string, fn: () => void, _opts?: { once?: boolean }) {
    if (event === "open") {
      if (this.readyState === MockWebSocket.OPEN) fn();
    }
  }
}

beforeEach(() => {
  wsInstances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});

function realClient(): HIP4Client {
  // Use a real HIP4Client so subscribe/dispatch logic runs through production
  // code. The global WebSocket stub above intercepts all socket creation.
  return new HIP4Client({ testnet: true });
}

function simulateMessage(channel: string, data: Record<string, unknown>) {
  const ws = wsInstances[0];
  ws?.onmessage?.({ data: JSON.stringify({ channel, data }) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebSocket per-coin dispatch", () => {
  it("dispatches l2Book messages to the correct per-coin subscriber", () => {
    const adapter = new HIP4MarketDataAdapter(realClient());

    const cb = vi.fn();
    adapter.subscribeOrderBook("10", cb);

    simulateMessage("l2Book", {
      coin: "#100",
      time: 123,
      levels: [[{ px: "0.5", sz: "10", n: 1 }], [{ px: "0.6", sz: "5", n: 1 }]],
    });

    expect(cb).toHaveBeenCalledOnce();
  });

  it("does not dispatch l2Book to wrong coin subscriber", () => {
    const adapter = new HIP4MarketDataAdapter(realClient());

    const cb10 = vi.fn();
    const cb20 = vi.fn();
    adapter.subscribeOrderBook("10", cb10);
    adapter.subscribeOrderBook("20", cb20);

    simulateMessage("l2Book", {
      coin: "#100",
      time: 123,
      levels: [[{ px: "0.5", sz: "10", n: 1 }], [{ px: "0.6", sz: "5", n: 1 }]],
    });

    expect(cb10).toHaveBeenCalledOnce();
    expect(cb20).not.toHaveBeenCalled();
  });

  it("dispatches allMids to channel-only subscriber", () => {
    const adapter = new HIP4MarketDataAdapter(realClient());

    const cb = vi.fn();
    adapter.subscribePrice("10", cb);

    simulateMessage("allMids", {
      mids: { "#100": "0.55", "#101": "0.45" },
    });

    expect(cb).toHaveBeenCalledOnce();
  });

  it("dispatches trades to per-coin subscriber", () => {
    const adapter = new HIP4MarketDataAdapter(realClient());

    const cb = vi.fn();
    adapter.subscribeTrades("10", cb);

    // HL sends trades as an array with coin on each element
    const ws = wsInstances[0];
    ws?.onmessage?.({
      data: JSON.stringify({
        channel: "trades",
        data: [
          {
            coin: "#100",
            side: "B",
            px: "0.5",
            sz: "10",
            time: 123,
            hash: "0xabc",
            tid: 1,
            users: ["0x1", "0x2"],
          },
        ],
      }),
    });

    expect(cb).toHaveBeenCalledOnce();
  });

  it("does not dispatch to per-coin subscribers when data has no coin field", () => {
    const adapter = new HIP4MarketDataAdapter(realClient());

    const bookCb = vi.fn();
    adapter.subscribeOrderBook("10", bookCb);

    // Message without coin in data - should not match per-coin sub
    simulateMessage("l2Book", { time: 123 });

    expect(bookCb).not.toHaveBeenCalled();
  });
});
