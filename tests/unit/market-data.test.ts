import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4MarketDataAdapter } from "../../src/adapter/hyperliquid/market-data";
import type { HLL2Book, HLTrade } from "../../src/adapter/hyperliquid/types";

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function createMockClient(overrides: Partial<HIP4Client> = {}) {
  return {
    infoUrl: "https://mock/info",
    exchangeUrl: "https://mock/exchange",
    wsUrl: "wss://mock/ws",
    testnet: true,
    log: vi.fn(),
    fetchOutcomeMeta: vi.fn(),
    fetchL2Book: vi.fn(),
    fetchRecentTrades: vi.fn(),
    fetchAllMids: vi.fn(),
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_L2_BOOK: HLL2Book = {
  coin: "#17580",
  time: 1700000000000,
  levels: [
    [
      { px: "0.65", sz: "100", n: 2 },
      { px: "0.64", sz: "200", n: 3 },
    ],
    [
      { px: "0.66", sz: "150", n: 1 },
      { px: "0.67", sz: "50", n: 1 },
    ],
  ],
};

function makeTrade(tid: number): HLTrade {
  return {
    coin: "#17580",
    side: "B",
    px: "0.65",
    sz: "10",
    time: 1700000000000 + tid,
    hash: `0x${tid}`,
    tid,
    users: ["0xaaa", "0xbbb"],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HIP4MarketDataAdapter", () => {
  let client: ReturnType<typeof createMockClient>;
  let adapter: HIP4MarketDataAdapter;

  beforeEach(() => {
    client = createMockClient();
    adapter = new HIP4MarketDataAdapter(client as unknown as HIP4Client);
    vi.restoreAllMocks();
  });

  // -- fetchOrderBook -------------------------------------------------------

  describe("fetchOrderBook", () => {
    it("calls client.fetchL2Book with sideCoin(1758, 0) and maps bids/asks", async () => {
      (client.fetchL2Book as ReturnType<typeof vi.fn>).mockResolvedValue(
        MOCK_L2_BOOK,
      );

      const book = await adapter.fetchOrderBook("1758");

      // Should call with "#17580" (sideCoin(1758, 0))
      expect(client.fetchL2Book).toHaveBeenCalledWith("#17580");
      expect(client.fetchL2Book).toHaveBeenCalledTimes(1);

      expect(book.marketId).toBe("1758");
      expect(book.timestamp).toBe(1700000000000);

      // Bids mapped from levels[0]
      expect(book.bids).toEqual([
        { price: "0.65", size: "100" },
        { price: "0.64", size: "200" },
      ]);

      // Asks mapped from levels[1]
      expect(book.asks).toEqual([
        { price: "0.66", size: "150" },
        { price: "0.67", size: "50" },
      ]);
    });

    it("uses sideIndex=1 when passed", async () => {
      (client.fetchL2Book as ReturnType<typeof vi.fn>).mockResolvedValue(
        MOCK_L2_BOOK,
      );
      await adapter.fetchOrderBook("1758", 1);
      expect(client.fetchL2Book).toHaveBeenCalledWith("#17581");
    });
  });

  // -- fetchPrice -----------------------------------------------------------

  describe("fetchPrice", () => {
    it("calls fetchAllMids and returns both side0 and side1 mids", async () => {
      (client.fetchAllMids as ReturnType<typeof vi.fn>).mockResolvedValue({
        "#17580": "0.65",
        "#17581": "0.35",
        "#9990": "0.50",
      });

      const price = await adapter.fetchPrice("1758");

      expect(client.fetchAllMids).toHaveBeenCalledTimes(1);
      expect(price.marketId).toBe("1758");
      expect(price.outcomes).toHaveLength(2);
      expect(price.outcomes[0]).toEqual({
        name: "Side 0",
        price: "0.65",
        midpoint: "0.65",
      });
      expect(price.outcomes[1]).toEqual({
        name: "Side 1",
        price: "0.35",
        midpoint: "0.35",
      });
      expect(price.timestamp).toBeGreaterThan(0);
    });

    it("uses 5s cache - second call does not hit client again", async () => {
      (client.fetchAllMids as ReturnType<typeof vi.fn>).mockResolvedValue({
        "#17580": "0.65",
        "#17581": "0.35",
      });

      await adapter.fetchPrice("1758");
      await adapter.fetchPrice("1758");

      expect(client.fetchAllMids).toHaveBeenCalledTimes(1);
    });

    it("returns '0' for missing side mids", async () => {
      (client.fetchAllMids as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const price = await adapter.fetchPrice("1758");

      expect(price.outcomes[0].price).toBe("0");
      expect(price.outcomes[1].price).toBe("0");
    });
  });

  // -- fetchTrades ----------------------------------------------------------

  describe("fetchTrades", () => {
    it("calls fetchRecentTrades with sideCoin and slices to limit", async () => {
      const trades = Array.from({ length: 30 }, (_, i) => makeTrade(i));
      (client.fetchRecentTrades as ReturnType<typeof vi.fn>).mockResolvedValue(
        trades,
      );

      const result = await adapter.fetchTrades("1758", 20);

      expect(client.fetchRecentTrades).toHaveBeenCalledWith("#17580");
      expect(result).toHaveLength(20);

      // Verify mapping of first trade
      expect(result[0]).toEqual({
        id: "0",
        marketId: "1758",
        outcome: "#17580",
        side: "buy",
        price: "0.65",
        size: "10",
        timestamp: 1700000000000,
      });
    });

    it("defaults limit to 50", async () => {
      const trades = Array.from({ length: 80 }, (_, i) => makeTrade(i));
      (client.fetchRecentTrades as ReturnType<typeof vi.fn>).mockResolvedValue(
        trades,
      );

      const result = await adapter.fetchTrades("1758");

      expect(result).toHaveLength(50);
    });

    it("maps sell side correctly", async () => {
      const sellTrade: HLTrade = {
        ...makeTrade(1),
        side: "A",
      };
      (client.fetchRecentTrades as ReturnType<typeof vi.fn>).mockResolvedValue([
        sellTrade,
      ]);

      const result = await adapter.fetchTrades("1758", 10);

      expect(result[0].side).toBe("sell");
    });

    it("uses sideIndex=1 when passed", async () => {
      (client.fetchRecentTrades as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeTrade(1),
      ]);
      await adapter.fetchTrades("1758", 10, 1);
      expect(client.fetchRecentTrades).toHaveBeenCalledWith("#17581");
    });
  });
});
