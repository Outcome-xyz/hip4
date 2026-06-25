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
// fetchOutcomeMeta
// ---------------------------------------------------------------------------

describe("fetchOutcomeMeta", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("defaults missing quoteToken on each outcome to USDH (mainnet shape)", async () => {
    const raw = {
      outcomes: [
        { outcome: 1, name: "A", description: "", sideSpecs: [{ name: "Y" }, { name: "N" }] },
        { outcome: 2, name: "B", description: "", sideSpecs: [{ name: "Y" }, { name: "N" }] },
      ],
      questions: [],
    };
    vi.stubGlobal("fetch", mockFetchOk(raw));

    const client = new HIP4Client();
    const result = await client.fetchOutcomeMeta();
    expect(result.outcomes.map((o) => o.quoteToken)).toEqual(["USDH", "USDH"]);
  });

  it("preserves explicit quoteToken values from the API (testnet shape)", async () => {
    const raw = {
      outcomes: [
        { outcome: 1, name: "A", description: "", sideSpecs: [{ name: "Y" }, { name: "N" }], quoteToken: "USDH" },
        { outcome: 2, name: "B", description: "", sideSpecs: [{ name: "Y" }, { name: "N" }], quoteToken: "USDC" },
      ],
      questions: [],
    };
    vi.stubGlobal("fetch", mockFetchOk(raw));

    const client = new HIP4Client();
    const result = await client.fetchOutcomeMeta();
    expect(result.outcomes.map((o) => o.quoteToken)).toEqual(["USDH", "USDC"]);
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
    expect(result).toEqual({
      ...settled,
      spec: { ...settled.spec, quoteToken: "USDH" },
    });
  });

  it("preserves an explicit quoteToken returned by the API", async () => {
    const settled = {
      spec: {
        outcome: 516,
        name: "Test",
        description: "desc",
        sideSpecs: [],
        quoteToken: "USDC",
      },
      settleFraction: "1.0",
      details: "settled yes",
    };
    vi.stubGlobal("fetch", mockFetchOk(settled));

    const client = new HIP4Client();
    const result = await client.fetchSettledOutcome(516);
    expect(result?.spec.quoteToken).toBe("USDC");
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

// ---------------------------------------------------------------------------
// fetchUserNonFundingLedgerUpdates
// ---------------------------------------------------------------------------

describe("fetchUserNonFundingLedgerUpdates", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs the userNonFundingLedgerUpdates info action with the user address", async () => {
    const fetchMock = mockFetchOk([]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new HIP4Client();
    await client.fetchUserNonFundingLedgerUpdates("0xabc");

    const init = fetchMock.mock.calls[0][1];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ type: "userNonFundingLedgerUpdates", user: "0xabc" });
  });

  it("returns the ledger update array unchanged", async () => {
    const updates = [
      {
        time: 1700000000000,
        hash: "0x" + "ab".repeat(32),
        delta: { type: "deposit", usdc: "100" },
      },
      {
        time: 1700000001000,
        hash: "0x" + "cd".repeat(32),
        delta: { type: "withdraw", usdc: "25", fee: "0.5" },
      },
    ];
    vi.stubGlobal("fetch", mockFetchOk(updates));

    const client = new HIP4Client();
    const result = await client.fetchUserNonFundingLedgerUpdates("0xabc");
    expect(result).toEqual(updates);
  });

  it("returns an empty array when the user has no updates", async () => {
    vi.stubGlobal("fetch", mockFetchOk([]));

    const client = new HIP4Client();
    const result = await client.fetchUserNonFundingLedgerUpdates("0xabc");
    expect(result).toEqual([]);
  });
});
