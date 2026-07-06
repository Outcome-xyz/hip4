import { beforeEach, describe, expect, it, vi } from "vitest";
import { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4MarketDataAdapter } from "../../src/adapter/hyperliquid/market-data";

// ---------------------------------------------------------------------------
// Mock WebSocket (class-based, same pattern as ws-dispatch.test.ts)
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
  return new HIP4Client({ testnet: true });
}

function simulateAllMids(mids: Record<string, string>) {
  const ws = wsInstances[0];
  ws?.onmessage?.({ data: JSON.stringify({ channel: "allMids", data: { mids } }) });
}

function sentOfMethod(method: "subscribe" | "unsubscribe"): string[] {
  return (wsInstances[0]?.sent ?? []).filter((m) => JSON.parse(m).method === method);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebSocket shared-subscription refcounting", () => {
  it("sends the wire subscribe once for N identical subscriptions", () => {
    const adapter = new HIP4MarketDataAdapter(realClient());

    // Four price feeds all subscribe {type: "allMids"} under the hood —
    // the multi-outcome chart's exact usage pattern.
    adapter.subscribePrice("10", vi.fn());
    adapter.subscribePrice("20", vi.fn());
    adapter.subscribePrice("30", vi.fn());
    adapter.subscribePrice("40", vi.fn());

    expect(sentOfMethod("subscribe")).toHaveLength(1);
  });

  it("keeps delivering to remaining subscribers after one unsubscribes", () => {
    const adapter = new HIP4MarketDataAdapter(realClient());

    const cbA = vi.fn();
    const cbB = vi.fn();
    const unsubA = adapter.subscribePrice("10", cbA);
    adapter.subscribePrice("20", cbB);

    // First consumer leaves — previously this sent a wire unsubscribe and
    // silently killed the stream for every remaining subscriber.
    unsubA();
    expect(sentOfMethod("unsubscribe")).toHaveLength(0);

    simulateAllMids({ "#100": "0.55", "#200": "0.45" });
    expect(cbA).not.toHaveBeenCalled();
    expect(cbB).toHaveBeenCalledOnce();
  });

  it("sends the wire unsubscribe only when the last subscriber leaves", () => {
    const adapter = new HIP4MarketDataAdapter(realClient());

    const unsubA = adapter.subscribePrice("10", vi.fn());
    const unsubB = adapter.subscribePrice("20", vi.fn());

    unsubA();
    expect(sentOfMethod("unsubscribe")).toHaveLength(0);

    unsubB();
    expect(sentOfMethod("unsubscribe")).toHaveLength(1);
  });

  it("keeps the subscription in the reconnect set until the last subscriber leaves", () => {
    const client = realClient();
    const adapter = new HIP4MarketDataAdapter(client);

    const cbB = vi.fn();
    const unsubA = adapter.subscribePrice("10", vi.fn());
    adapter.subscribePrice("20", cbB);
    unsubA();

    // Drop the connection: the surviving subscriber must be resubscribed on
    // reconnect (previously unsubA() deleted the only wsActiveSubs entry).
    vi.useFakeTimers();
    wsInstances[0]?.onclose?.();
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();

    const reconnected = wsInstances[1];
    expect(reconnected).toBeDefined();
    const resubs = (reconnected?.sent ?? []).filter(
      (m) => JSON.parse(m).method === "subscribe",
    );
    expect(resubs).toHaveLength(1);
  });

  it("unsubscribe functions are idempotent (double-invoke safe)", () => {
    const adapter = new HIP4MarketDataAdapter(realClient());

    const cbB = vi.fn();
    const unsubA = adapter.subscribePrice("10", vi.fn());
    adapter.subscribePrice("20", cbB);

    // React Strict Mode invokes effect cleanups twice — a double-run must
    // not decrement another consumer's refcount.
    unsubA();
    unsubA();
    expect(sentOfMethod("unsubscribe")).toHaveLength(0);

    simulateAllMids({ "#200": "0.45" });
    expect(cbB).toHaveBeenCalledOnce();
  });

  it("distinct subscriptions still subscribe and unsubscribe independently", () => {
    const adapter = new HIP4MarketDataAdapter(realClient());

    const unsubBook = adapter.subscribeOrderBook("10", vi.fn());
    adapter.subscribePrice("10", vi.fn());

    // Different payloads → two wire subscribes
    expect(sentOfMethod("subscribe")).toHaveLength(2);

    // Unsubscribing the book (sole subscriber) sends its wire unsubscribe
    unsubBook();
    const unsubs = sentOfMethod("unsubscribe");
    expect(unsubs).toHaveLength(1);
    expect(JSON.parse(unsubs[0] as string).subscription.type).toBe("l2Book");
  });
});
