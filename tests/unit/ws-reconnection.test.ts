// ---------------------------------------------------------------------------
// Unit tests for WebSocket reconnection state logic
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4MarketDataAdapter } from "../../src/adapter/hyperliquid/market-data";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type WsEventHandler = ((event: { data: string }) => void) | (() => void) | null;

const wsInstances: Array<{
  readyState: number;
  onmessage: WsEventHandler;
  onopen: WsEventHandler;
  onclose: WsEventHandler;
  onerror: WsEventHandler;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  simulateClose: () => void;
}> = [];

function resetWsInstances() {
  wsInstances.length = 0;
}

function createMockWebSocketClass() {
  // Use a named function so `new` works
  function MockWebSocket(this: any, _url: string) {
    this.readyState = 1; // OPEN
    this.onmessage = null;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.send = vi.fn();
    this.close = vi.fn(() => {
      this.readyState = 3; // CLOSED
    });
    this.addEventListener = vi.fn((event: string, handler: () => void) => {
      if (event === "open" && this.readyState === 1) {
        // Fire immediately since our mock starts OPEN
        handler();
      }
    });
    this.removeEventListener = vi.fn();
    this.simulateClose = () => {
      if (this.onclose) {
        (this.onclose as () => void)();
      }
    };
    wsInstances.push(this);
  }
  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;
  MockWebSocket.prototype.CONNECTING = 0;
  MockWebSocket.prototype.OPEN = 1;
  MockWebSocket.prototype.CLOSING = 2;
  MockWebSocket.prototype.CLOSED = 3;

  return MockWebSocket;
}

// ---------------------------------------------------------------------------
// Real HIP4Client backed by the global MockWebSocket stub.
//
// We use a real client (not a stub) so subscribe/reconnect/dispatch logic
// runs through production code. The logger spy lets tests assert on what
// the client logged. No HTTP calls are made by these tests.
// ---------------------------------------------------------------------------

function createTestClient(): {
  client: HIP4Client;
  log: ReturnType<typeof vi.fn>;
} {
  const log = vi.fn();
  const client = new HIP4Client({ testnet: true, logger: log });
  return { client, log };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WS reconnection state logic", () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    resetWsInstances();
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it("increments reconnectAttempts after WS close", () => {
    vi.stubGlobal("WebSocket", createMockWebSocketClass());

    const { client } = createTestClient();
    const adapter = new HIP4MarketDataAdapter(client);

    // Subscribe to trigger WS creation
    const unsub = adapter.subscribeOrderBook("1758", vi.fn());

    expect(wsInstances).toHaveLength(1);

    // Simulate close - triggers reconnect timer
    wsInstances[0].simulateClose();

    // Advance past first reconnect delay (1000ms * 2^0 = 1000ms)
    vi.advanceTimersByTime(1000);

    // A new WS should have been created (reconnect attempt 1)
    expect(wsInstances).toHaveLength(2);

    // Close again
    wsInstances[1].simulateClose();

    // Advance past second reconnect delay (1000ms * 2^1 = 2000ms)
    vi.advanceTimersByTime(2000);

    // Third WS created (reconnect attempt 2)
    expect(wsInstances).toHaveLength(3);

    unsub();
    adapter.destroy();
  });

  it("stops reconnecting after MAX_RECONNECT_ATTEMPTS closes", () => {
    vi.stubGlobal("WebSocket", createMockWebSocketClass());

    const { client, log } = createTestClient();
    const adapter = new HIP4MarketDataAdapter(client);

    // Subscribe to trigger WS creation
    adapter.subscribeOrderBook("1758", vi.fn());
    expect(wsInstances).toHaveLength(1);

    // Simulate MAX_RECONNECT_ATTEMPTS (10) closes
    for (let i = 0; i < 10; i++) {
      const currentIdx = wsInstances.length - 1;
      wsInstances[currentIdx].simulateClose();

      // Advance past the reconnect delay (capped at 30s)
      const delay = Math.min(1000 * Math.pow(2, i), 30_000);
      vi.advanceTimersByTime(delay);
    }

    // After 10 reconnect attempts, we have 11 WS instances (1 original + 10 reconnects)
    const countAfterMax = wsInstances.length;

    // Now close the last one - should NOT create another WS
    wsInstances[wsInstances.length - 1].simulateClose();
    vi.advanceTimersByTime(60_000);

    expect(wsInstances).toHaveLength(countAfterMax);

    // Verify the warning was logged. Production logs at "warn" level
    // (see HIP4Client.scheduleReconnect "max reconnect attempts reached").
    expect(log).toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("max reconnect attempts"),
    );

    adapter.destroy();
  });

  it("unsubscribing during pending reconnect prevents the reconnect", () => {
    // Contract: HIP4MarketDataAdapter.destroy() is now a no-op - WS lifecycle
    // is managed by per-subscription unsub. After unsub, wsActiveSubs is
    // empty so the pending reconnect timer fires but exits early without
    // creating a new socket.
    vi.stubGlobal("WebSocket", createMockWebSocketClass());

    const { client } = createTestClient();
    const adapter = new HIP4MarketDataAdapter(client);

    const unsub = adapter.subscribeOrderBook("1758", vi.fn());
    expect(wsInstances).toHaveLength(1);

    // Simulate close - reconnect timer is scheduled because wsActiveSubs
    // still has this subscription.
    wsInstances[0].simulateClose();

    // Unsubscribe before the timer fires. This clears wsActiveSubs.
    unsub();

    // Advance past what would have been the reconnect delay.
    vi.advanceTimersByTime(5000);

    // Reconnect timer fires but skips ensureWs because wsActiveSubs is empty.
    expect(wsInstances).toHaveLength(1);
  });

  it("unsubscribing before WS close prevents reconnection", () => {
    vi.stubGlobal("WebSocket", createMockWebSocketClass());

    const { client } = createTestClient();
    const adapter = new HIP4MarketDataAdapter(client);

    const unsub = adapter.subscribeOrderBook("1758", vi.fn());
    expect(wsInstances).toHaveLength(1);

    // Unsubscribe first - this closes the WS and clears wsActiveSubs.
    unsub();
    // Then a stale close event arrives.
    wsInstances[0].simulateClose();

    vi.advanceTimersByTime(5000);

    // onclose sees wsActiveSubs.size === 0 and skips scheduleReconnect.
    expect(wsInstances).toHaveLength(1);
  });
});
