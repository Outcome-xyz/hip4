import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIP4Client } from "../../src/adapter/hyperliquid/client";

// ---------------------------------------------------------------------------
// Mock WebSocket that starts CONNECTING and only opens when the test says so,
// so subscribe/unsubscribe calls can land in the pre-open window.
// ---------------------------------------------------------------------------

let wsInstances: ConnectingWebSocket[] = [];

class ConnectingWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = ConnectingWebSocket.CONNECTING;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  sent: string[] = [];

  constructor(_url: string) {
    wsInstances.push(this);
  }

  send(data: string) {
    if (this.readyState !== ConnectingWebSocket.OPEN) {
      throw new Error("send() while not OPEN");
    }
    this.sent.push(data);
  }

  close() {
    this.readyState = ConnectingWebSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    if (this.readyState !== ConnectingWebSocket.CONNECTING) return;
    this.readyState = ConnectingWebSocket.OPEN;
    this.onopen?.();
  }

  emit(channel: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ channel, data }) });
  }
}

beforeEach(() => {
  wsInstances = [];
  vi.stubGlobal("WebSocket", ConnectingWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function openAll() {
  for (const ws of wsInstances) ws.open();
}

function allSent(): { method: string; subscription: Record<string, unknown> }[] {
  return wsInstances.flatMap((ws) => ws.sent.map((m) => JSON.parse(m)));
}

function subscribesSent() {
  return allSent().filter((m) => m.method === "subscribe");
}

const COARSE_BOOK = { type: "l2Book", coin: "#100", nSigFigs: 2 };
const FULL_BOOK = { type: "l2Book", coin: "#100" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebSocket subscriptions cancelled before the socket opens", () => {
  it("never sends a subscribe that was cancelled before open", () => {
    const client = new HIP4Client({ testnet: true });
    const coarse = vi.fn();
    const full = vi.fn();

    const unsubCoarse = client.subscribe(COARSE_BOOK, coarse);
    unsubCoarse();
    client.subscribe(FULL_BOOK, full);
    openAll();

    const subs = subscribesSent();
    expect(subs).toHaveLength(1);
    expect(subs[0]?.subscription).toEqual(FULL_BOOK);

    // A frame on the shared l2Book channel reaches only the live listener.
    wsInstances.at(-1)?.emit("l2Book", { coin: "#100", levels: [[], []] });
    expect(coarse).not.toHaveBeenCalled();
    expect(full).toHaveBeenCalledOnce();
  });

  it("drops the cancelled subscribe while another subscription keeps the socket alive", () => {
    const client = new HIP4Client({ testnet: true });
    client.subscribe({ type: "allMids" }, vi.fn());

    const unsubCoarse = client.subscribe(COARSE_BOOK, vi.fn());
    unsubCoarse();
    client.subscribe(FULL_BOOK, vi.fn());
    openAll();

    expect(wsInstances).toHaveLength(1);
    expect(subscribesSent().map((m) => m.subscription)).toEqual([{ type: "allMids" }, FULL_BOOK]);
    expect(allSent().filter((m) => m.method === "unsubscribe")).toHaveLength(0);
  });

  it("keeps the pending subscribe while another listener on the same payload remains", () => {
    const client = new HIP4Client({ testnet: true });
    const first = vi.fn();
    const second = vi.fn();

    const unsubFirst = client.subscribe(FULL_BOOK, first);
    client.subscribe(FULL_BOOK, second);
    unsubFirst();
    openAll();

    expect(subscribesSent().map((m) => m.subscription)).toEqual([FULL_BOOK]);

    wsInstances[0]?.emit("l2Book", { coin: "#100", levels: [[], []] });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("sends a single subscribe when a payload is cancelled and re-subscribed before open", () => {
    const client = new HIP4Client({ testnet: true });
    client.subscribe({ type: "allMids" }, vi.fn());

    const unsub = client.subscribe(FULL_BOOK, vi.fn());
    unsub();
    client.subscribe(FULL_BOOK, vi.fn());
    openAll();

    expect(subscribesSent().map((m) => m.subscription)).toEqual([{ type: "allMids" }, FULL_BOOK]);
  });

  it("does not queue a duplicate subscribe when the socket drops before open and reconnects", () => {
    vi.useFakeTimers();
    const client = new HIP4Client({ testnet: true });
    client.subscribe(FULL_BOOK, vi.fn());

    // First socket fails while still CONNECTING; the reconnect re-queues the
    // active subscriptions on top of the never-sent pending one.
    wsInstances[0]?.close();
    vi.advanceTimersByTime(2000);
    expect(wsInstances).toHaveLength(2);
    wsInstances[1]?.open();

    expect(subscribesSent().map((m) => m.subscription)).toEqual([FULL_BOOK]);
  });
});
