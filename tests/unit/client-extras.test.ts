// ---------------------------------------------------------------------------
// Extra coverage for client.ts: exchange error paths, non-JSON handling,
// + prefix coin helpers
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HIP4Client,
  HLApiError,
  parseSideCoin,
  isOutcomeCoin,
  coinOutcomeId,
} from "../../src/adapter/hyperliquid/client";

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetchOk(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number, statusText: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve(null),
  });
}

function mockFetchNonJson() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => {
      throw new SyntaxError("Unexpected token");
    },
  });
}

// ---------------------------------------------------------------------------
// Exchange endpoint error paths
// ---------------------------------------------------------------------------

describe("exchangePost error paths", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws HLApiError on non-ok exchange response", async () => {
    vi.stubGlobal("fetch", mockFetchError(500, "Internal Server Error"));

    const client = new HIP4Client();

    await expect(
      client.placeOrder(
        { type: "order", orders: [], grouping: "na" },
        123,
        { r: "0x00", s: "0x00", v: 27 },
        null,
      ),
    ).rejects.toThrow(HLApiError);

    await expect(
      client.placeOrder(
        { type: "order", orders: [], grouping: "na" },
        123,
        { r: "0x00", s: "0x00", v: 27 },
        null,
      ),
    ).rejects.toThrow("HL exchange API responded with 500");
  });

  it("throws HLApiError on non-JSON exchange response", async () => {
    vi.stubGlobal("fetch", mockFetchNonJson());

    const client = new HIP4Client();

    await expect(
      client.placeOrder(
        { type: "order", orders: [], grouping: "na" },
        123,
        { r: "0x00", s: "0x00", v: 27 },
        null,
      ),
    ).rejects.toThrow("non-JSON response");
  });

  it("throws HLApiError on non-ok cancelOrder response", async () => {
    vi.stubGlobal("fetch", mockFetchError(400, "Bad Request"));

    const client = new HIP4Client();

    await expect(
      client.cancelOrder(
        { type: "cancel", cancels: [{ a: 1, o: 2 }] },
        123,
        { r: "0x00", s: "0x00", v: 27 },
        null,
      ),
    ).rejects.toThrow("HL exchange API responded with 400");
  });

  it("throws HLApiError on non-JSON cancelOrder response", async () => {
    vi.stubGlobal("fetch", mockFetchNonJson());

    const client = new HIP4Client();

    await expect(
      client.cancelOrder(
        { type: "cancel", cancels: [{ a: 1, o: 2 }] },
        123,
        { r: "0x00", s: "0x00", v: 27 },
        null,
      ),
    ).rejects.toThrow("non-JSON response");
  });

  it("HLApiError carries status code", async () => {
    vi.stubGlobal("fetch", mockFetchError(429, "Too Many Requests"));

    const client = new HIP4Client();

    try {
      await client.placeOrder(
        { type: "order", orders: [], grouping: "na" },
        123,
        { r: "0x00", s: "0x00", v: 27 },
        null,
      );
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HLApiError);
      expect((err as HLApiError).status).toBe(429);
      expect((err as HLApiError).name).toBe("HLApiError");
    }
  });
});

// ---------------------------------------------------------------------------
// Info endpoint retry behavior
// ---------------------------------------------------------------------------

describe("info endpoint retry", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("retries once on 5xx then succeeds", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: () => Promise.resolve(null),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ outcomes: [], questions: [] }),
      });
    }));

    const client = new HIP4Client();
    const result = await client.fetchOutcomeMeta();
    expect(result).toEqual({ outcomes: [], questions: [] });
    expect(callCount).toBe(2);
  });

  it("does not retry on 4xx errors", async () => {
    vi.stubGlobal("fetch", mockFetchError(400, "Bad Request"));

    const client = new HIP4Client();
    await expect(client.fetchOutcomeMeta()).rejects.toThrow("400");
  });
});

// ---------------------------------------------------------------------------
// Coin helper + prefix tests
// ---------------------------------------------------------------------------

describe("parseSideCoin with + prefix", () => {
  it("parses +17580 as outcomeId=1758, sideIndex=0", () => {
    expect(parseSideCoin("+17580")).toEqual({ outcomeId: 1758, sideIndex: 0 });
  });

  it("parses +17581 as outcomeId=1758, sideIndex=1", () => {
    expect(parseSideCoin("+17581")).toEqual({ outcomeId: 1758, sideIndex: 1 });
  });

  it("returns null for +17582 (sideIndex > 1)", () => {
    expect(parseSideCoin("+17582")).toBeNull();
  });

  it("returns null for +1 (too short)", () => {
    expect(parseSideCoin("+1")).toBeNull();
  });
});

describe("isOutcomeCoin with + prefix", () => {
  it("returns true for + prefixed coins", () => {
    expect(isOutcomeCoin("+17580")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchSettledOutcome
// ---------------------------------------------------------------------------

describe("fetchSettledOutcome", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns settled outcome data on success", async () => {
    const settled = {
      spec: { outcome: 516, name: "Test", description: "desc", sideSpecs: [] },
      settleFraction: "1.0",
      details: "settled yes",
    };
    vi.stubGlobal("fetch", mockFetchOk(settled));

    const client = new HIP4Client();
    const result = await client.fetchSettledOutcome(516);
    expect(result).toEqual(settled);
  });

  it("returns null when API returns null body", async () => {
    vi.stubGlobal("fetch", mockFetchOk(null));

    const client = new HIP4Client();
    const result = await client.fetchSettledOutcome(99999);
    expect(result).toBeNull();
  });
});

describe("coinOutcomeId with + prefix", () => {
  it("extracts outcome ID from + prefixed coin", () => {
    expect(coinOutcomeId("+17580")).toBe(1758);
  });

  it("extracts outcome ID from + prefixed side 1", () => {
    expect(coinOutcomeId("+51601")).toBe(5160);
  });

  it("returns null for invalid + coin", () => {
    expect(coinOutcomeId("+1")).toBeNull();
  });
});
