import { vi } from "vitest";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { OUTCOME_META } from "../fixtures/outcome-meta";
import { L2_BOOK } from "../fixtures/l2-book";
import { TRADES } from "../fixtures/trades";
import { ALL_MIDS } from "../fixtures/all-mids";
import { SPOT_CLEARINGHOUSE_STATE } from "../fixtures/spot-clearinghouse";
import { FILLS } from "../fixtures/fills";
import { FILLED_RESPONSE } from "../fixtures/exchange-responses";
import { FRONTEND_ORDERS } from "../fixtures/frontend-orders";

type MockedClient = {
  [K in keyof HIP4Client]: HIP4Client[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : HIP4Client[K];
};

/**
 * Create a mock HIP4Client with all methods stubbed via vi.fn().
 * Each method returns the corresponding fixture data by default.
 * Override individual methods in your test as needed.
 */
export function createMockClient(): MockedClient {
  return {
    // Readonly properties
    infoUrl: "https://mock.hyperliquid.xyz/info",
    exchangeUrl: "https://mock.hyperliquid.xyz/exchange",
    wsUrl: "wss://mock.hyperliquid.xyz/ws",
    testnet: true,

    // Info endpoints
    fetchOutcomeMeta: vi.fn().mockResolvedValue(OUTCOME_META),
    fetchL2Book: vi.fn().mockResolvedValue(L2_BOOK),
    fetchRecentTrades: vi.fn().mockResolvedValue(TRADES),
    fetchAllMids: vi.fn().mockResolvedValue(ALL_MIDS),
    fetchCandleSnapshot: vi.fn().mockResolvedValue([]),
    fetchClearinghouseState: vi.fn().mockResolvedValue({
      marginSummary: {
        accountValue: "10000.0",
        totalNtlPos: "0.0",
        totalRawUsd: "10000.0",
        totalMarginUsed: "0.0",
      },
      crossMarginSummary: {
        accountValue: "10000.0",
        totalNtlPos: "0.0",
        totalRawUsd: "10000.0",
        totalMarginUsed: "0.0",
      },
      crossMaintenanceMarginUsed: "0.0",
      withdrawable: "10000.0",
      assetPositions: [],
      time: 1711123200000,
    }),
    fetchUserFills: vi.fn().mockResolvedValue(FILLS),
    fetchSpotClearinghouseState: vi
      .fn()
      .mockResolvedValue(SPOT_CLEARINGHOUSE_STATE),
    fetchUserFillsByTime: vi.fn().mockResolvedValue(FILLS),
    fetchFrontendOpenOrders: vi.fn().mockResolvedValue(FRONTEND_ORDERS),

    // Exchange endpoints
    placeOrder: vi.fn().mockResolvedValue(FILLED_RESPONSE),
    cancelOrder: vi.fn().mockResolvedValue({ status: "ok" as const }),

    // Logger (no-op)
    log: vi.fn(),
  } as unknown as MockedClient;
}
