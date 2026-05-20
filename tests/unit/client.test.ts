import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HIP4Client } from "../../src/adapter/hyperliquid/client";

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HIP4Client", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -- Constructor ----------------------------------------------------------

  describe("constructor", () => {
    it("defaults to testnet URLs", () => {
      const client = new HIP4Client();

      expect(client.testnet).toBe(true);
      expect(client.infoUrl).toBe(
        "https://api-ui.hyperliquid-testnet.xyz/info",
      );
      expect(client.exchangeUrl).toBe(
        "https://api-ui.hyperliquid-testnet.xyz/exchange",
      );
      expect(client.wsUrl).toBe("wss://api-ui.hyperliquid-testnet.xyz/ws");
    });

    it("uses mainnet URLs when testnet is false", () => {
      const client = new HIP4Client({ testnet: false });

      expect(client.testnet).toBe(false);
      expect(client.infoUrl).toBe("https://api.hyperliquid.xyz/info");
      expect(client.exchangeUrl).toBe("https://api.hyperliquid.xyz/exchange");
      expect(client.wsUrl).toBe("wss://api.hyperliquid.xyz/ws");
    });

    it("uses custom URLs when provided", () => {
      const client = new HIP4Client({
        infoUrl: "https://custom.example/info",
        exchangeUrl: "https://custom.example/exchange",
      });

      expect(client.infoUrl).toBe("https://custom.example/info");
      expect(client.exchangeUrl).toBe("https://custom.example/exchange");
    });
  });

  // -- Info endpoint request shapes -----------------------------------------

  describe("fetchOutcomeMeta", () => {
    it("sends correct POST body", async () => {
      const fetchMock = mockFetchOk({ outcomes: [], questions: [] });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HIP4Client();
      await client.fetchOutcomeMeta();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe(client.infoUrl);
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual({ type: "outcomeMeta" });
    });
  });

  describe("fetchL2Book", () => {
    it("sends correct POST body with coin param", async () => {
      const fetchMock = mockFetchOk({ coin: "ETH", time: 0, levels: [[], []] });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HIP4Client();
      await client.fetchL2Book("ETH");

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ type: "l2Book", coin: "ETH" });
    });
  });

  describe("fetchAllMids", () => {
    it("sends correct POST body", async () => {
      const fetchMock = mockFetchOk({});
      vi.stubGlobal("fetch", fetchMock);

      const client = new HIP4Client();
      await client.fetchAllMids();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ type: "allMids" });
    });
  });

  describe("fetchCandleSnapshot", () => {
    it("sends correct POST body with nested req", async () => {
      const fetchMock = mockFetchOk([]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new HIP4Client();
      await client.fetchCandleSnapshot("#17580", "1h", 1000, 2000);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({
        type: "candleSnapshot",
        req: {
          coin: "#17580",
          interval: "1h",
          startTime: 1000,
          endTime: 2000,
        },
      });
    });
  });

  describe("fetchSpotClearinghouseState", () => {
    it("sends correct POST body with user", async () => {
      const fetchMock = mockFetchOk({ balances: [] });
      vi.stubGlobal("fetch", fetchMock);

      const client = new HIP4Client();
      await client.fetchSpotClearinghouseState("0xabc");

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ type: "spotClearinghouseState", user: "0xabc" });
    });
  });

  describe("fetchUserFillsByTime", () => {
    it("sends correct POST body with time range params", async () => {
      const fetchMock = mockFetchOk([]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new HIP4Client();
      await client.fetchUserFillsByTime("0xabc", 1000, 2000);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({
        type: "userFillsByTime",
        user: "0xabc",
        startTime: 1000,
        endTime: 2000,
        aggregateByTime: true,
        reversed: true,
        dex: "ALL_DEXS",
      });
    });
  });

  describe("fetchFrontendOpenOrders", () => {
    it("sends correct POST body with user", async () => {
      const fetchMock = mockFetchOk([]);
      vi.stubGlobal("fetch", fetchMock);

      const client = new HIP4Client();
      await client.fetchFrontendOpenOrders("0xabc");

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({
        type: "frontendOpenOrders",
        user: "0xabc",
        dex: "ALL_DEXS",
      });
    });
  });

  // -- Error handling -------------------------------------------------------

  describe("error handling", () => {
    it("throws on HTTP 500 response", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Internal Server Error"));

      const client = new HIP4Client();
      await expect(client.fetchOutcomeMeta()).rejects.toThrow(
        "HL info API responded with 500: Internal Server Error",
      );
    });

    it("throws on HTTP 400 response", async () => {
      vi.stubGlobal("fetch", mockFetchError(400, "Bad Request"));

      const client = new HIP4Client();
      await expect(client.fetchAllMids()).rejects.toThrow(
        "HL info API responded with 400: Bad Request",
      );
    });

    it("throws HLApiError on non-JSON 200 response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => { throw new SyntaxError("Unexpected token"); },
      }));

      const client = new HIP4Client();
      await expect(client.fetchAllMids()).rejects.toThrow("non-JSON response");
    });
  });
});
