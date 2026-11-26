// ---------------------------------------------------------------------------
// WebSocket connection events (OUT-7).
//
// A real HIP4Client runs on a global MockWebSocket, so subscribe / reconnect /
// teardown all go through production code. The mock can drop with a code.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HIP4ConnectionEvent } from "../../src/adapter/hyperliquid/client";
import { createHIP4Adapter } from "../../src/adapter/factory";
import { HIP4Client } from "../../src/adapter/hyperliquid/client";

interface MockWs {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  open: () => void;
  drop: (code?: number) => void;
}

const sockets: MockWs[] = [];
const latest = () => sockets[sockets.length - 1];

function MockWebSocket(this: MockWs) {
  this.readyState = 0; // CONNECTING
  this.onopen = null;
  this.onmessage = null;
  this.onclose = null;
  this.send = vi.fn();
  this.close = vi.fn(() => {
    this.readyState = 3;
  });
  this.open = () => {
    this.readyState = 1;
    this.onopen?.();
  };
  this.drop = (code = 1006) => {
    this.readyState = 3;
    this.onclose?.({ code });
  };
  sockets.push(this);
}
Object.assign(MockWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });

describe("WS connection events (OUT-7)", () => {
  let events: HIP4ConnectionEvent[];

  const createClient = (
    onConnectionEvent: (e: HIP4ConnectionEvent) => void = (e) => events.push(e),
  ) => new HIP4Client({ testnet: true, onConnectionEvent });

  beforeEach(() => {
    sockets.length = 0;
    events = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("emits `closed` with the close code when the socket drops, and still reconnects", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());

    latest().drop(1006);

    expect(events).toEqual([{ reason: "closed", code: 1006, attempts: 0 }]);
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
  });

  it("counts attempts from the last healthy open", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());

    latest().drop(); // attempts 0
    vi.advanceTimersByTime(1000);
    latest().drop(); // attempts 1: never reopened
    vi.advanceTimersByTime(2000);
    latest().open(); // healthy again
    latest().drop(); // attempts 0: a new outage

    expect(events.map((e) => e.attempts)).toEqual([0, 1, 0]);
  });

  it("does not emit when the consumer tears the socket down with closeWs()", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());
    const ws = latest();

    client.closeWs();
    ws.drop(1000); // the browser's async close after our own close()

    expect(events).toEqual([]);
  });

  // Node's WebSocket (and possibly others) fires onclose synchronously inside
  // close() on a CONNECTING socket. Caught by a live run, not by the mock.
  it("does not emit or reconnect when close() fires onclose synchronously", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());
    const ws = latest();
    ws.close.mockImplementation(() => ws.drop(1006));

    client.closeWs();
    vi.advanceTimersByTime(60_000);

    expect(events).toEqual([]);
    expect(sockets).toHaveLength(1);
  });

  it("does not emit when the last subscriber leaves", () => {
    const client = createClient();
    const unsubscribe = client.subscribe({ type: "allMids" }, vi.fn());
    const ws = latest();

    unsubscribe();
    ws.drop(1000);

    expect(events).toEqual([]);
  });

  it("emits `max_reconnect` once when it gives up", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());

    for (let i = 0; i < 11; i++) {
      latest().drop();
      vi.advanceTimersByTime(30_000);
    }

    const gaveUp = events.filter((e) => e.reason === "max_reconnect");
    expect(gaveUp).toEqual([{ reason: "max_reconnect", attempts: 10 }]);
    expect(events.filter((e) => e.reason === "closed")).toHaveLength(11);
  });

  it("treats a subscribe after giving up as a new outage, not another give-up", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());
    for (let i = 0; i < 11; i++) {
      latest().drop();
      vi.advanceTimersByTime(30_000);
    }
    events = [];

    client.subscribe({ type: "l2Book", coin: "A" }, vi.fn());
    latest().drop();

    expect(events).toEqual([{ reason: "closed", code: 1006, attempts: 0 }]);
    const before = sockets.length;
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(before + 1); // retrying again, full budget
  });

  it("reports the first drop after everyone unsubscribed mid-backoff", () => {
    const client = createClient();
    const unsubscribe = client.subscribe({ type: "allMids" }, vi.fn());
    latest().drop();
    vi.advanceTimersByTime(1000);
    latest().drop(); // attempts 2, retry pending
    unsubscribe();
    vi.advanceTimersByTime(60_000);
    events = [];

    client.subscribe({ type: "allMids" }, vi.fn());
    latest().drop();

    expect(events).toEqual([{ reason: "closed", code: 1006, attempts: 0 }]);
  });

  it("keeps reconnecting when the consumer's callback throws", () => {
    const client = createClient(() => {
      throw new Error("consumer blew up");
    });
    client.subscribe({ type: "allMids" }, vi.fn());

    expect(() => latest().drop()).not.toThrow();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
  });

  it("ends a give-up with the last `closed` and then `max_reconnect`", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());
    for (let i = 0; i < 11; i++) {
      latest().drop();
      vi.advanceTimersByTime(30_000);
    }

    expect(events.slice(-2)).toEqual([
      { reason: "closed", code: 1006, attempts: 10 },
      { reason: "max_reconnect", attempts: 10 },
    ]);
  });

  it("reports `code: undefined` when onclose gets no event", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());

    (latest().onclose as unknown as () => void)();

    expect(events).toEqual([
      { reason: "closed", code: undefined, attempts: 0 },
    ]);
  });

  it("does not reconnect after closeWs() during a pending backoff", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());
    latest().drop();

    client.closeWs();
    vi.advanceTimersByTime(60_000);

    expect(sockets).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it("leaves no retry armed when the callback itself calls closeWs()", () => {
    const client: HIP4Client = createClient(() => client.closeWs());
    client.subscribe({ type: "allMids" }, vi.fn());

    latest().drop();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("swallows a rejected async callback and keeps reconnecting", async () => {
    const client = createClient(async () => {
      throw new Error("async consumer blew up");
    });
    client.subscribe({ type: "allMids" }, vi.fn());

    latest().drop();
    await Promise.resolve();
    vi.advanceTimersByTime(1000);

    expect(sockets).toHaveLength(2);
  });

  it("passes onConnectionEvent through createHIP4Adapter", () => {
    const adapter = createHIP4Adapter({
      testnet: true,
      onConnectionEvent: (e) => events.push(e),
    });
    adapter.client.subscribe({ type: "allMids" }, vi.fn());

    latest().drop(1006);

    expect(events).toEqual([{ reason: "closed", code: 1006, attempts: 0 }]);
  });
  it("clears the pending retry when the last subscriber leaves mid-backoff", () => {
    const client = createClient();
    const unsubscribe = client.subscribe({ type: "allMids" }, vi.fn());
    latest().drop();

    unsubscribe();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not duplicate subscribes when subscribing mid-backoff", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());
    latest().drop(); // retry pending

    client.subscribe({ type: "l2Book", coin: "A" }, vi.fn());
    const ws = latest();
    ws.open();
    vi.advanceTimersByTime(60_000);

    expect(sockets).toHaveLength(2); // the timer did not open a third
    const subs = ws.send.mock.calls.map(
      (c) => JSON.parse(c[0]).subscription.type,
    );
    expect(subs.sort()).toEqual(["allMids", "l2Book"]);
  });

  it("restores the old subscriptions on a subscribe after giving up", () => {
    const client = createClient();
    client.subscribe({ type: "allMids" }, vi.fn());
    for (let i = 0; i < 11; i++) {
      latest().drop();
      vi.advanceTimersByTime(30_000);
    }

    client.subscribe({ type: "l2Book", coin: "A" }, vi.fn());
    latest().open();

    const subs = latest().send.mock.calls.map(
      (c) => JSON.parse(c[0]).subscription.type,
    );
    expect(subs.sort()).toEqual(["allMids", "l2Book"]);
  });

  it("skips `max_reconnect` when the callback already reconnected", () => {
    const client: HIP4Client = createClient((e) => {
      events.push(e);
      if (e.reason === "closed" && e.attempts === 10) {
        client.subscribe({ type: "l2Book", coin: "A" }, vi.fn());
      }
    });
    client.subscribe({ type: "allMids" }, vi.fn());
    for (let i = 0; i < 11; i++) {
      latest().drop();
      vi.advanceTimersByTime(30_000);
    }

    expect(events.some((e) => e.reason === "max_reconnect")).toBe(false);
  });

  it("swallows a rejection from a non-Promise thenable", () => {
    const then = vi.fn();
    const client = createClient(() => ({ then }) as never);
    client.subscribe({ type: "allMids" }, vi.fn());

    latest().drop();

    expect(then).toHaveBeenCalledWith(undefined, expect.any(Function));
  });
});
