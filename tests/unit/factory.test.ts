import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHIP4Adapter } from "../../src/adapter/factory";

// ---------------------------------------------------------------------------
// Mock all sub-adapter modules so construction doesn't hit network
// ---------------------------------------------------------------------------

vi.mock("../../src/adapter/hyperliquid/events", () => ({
  HIP4EventAdapter: class {
    fetchEvents = vi.fn().mockResolvedValue([]);
    fetchEvent = vi.fn().mockResolvedValue({});
    fetchCategories = vi.fn().mockResolvedValue([]);
    getSideNameResolver = vi.fn().mockReturnValue(() => null);
    ensureSideNames = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("../../src/adapter/hyperliquid/market-data", () => ({
  HIP4MarketDataAdapter: class {
    fetchOrderBook = vi.fn().mockResolvedValue({ bids: [], asks: [] });
    fetchPrice = vi.fn().mockResolvedValue({ outcomes: [] });
    fetchTrades = vi.fn().mockResolvedValue([]);
    subscribeOrderBook = vi.fn().mockReturnValue(() => {});
    subscribePrice = vi.fn().mockReturnValue(() => {});
    subscribeTrades = vi.fn().mockReturnValue(() => {});
    destroy = vi.fn();
  },
}));

vi.mock("../../src/adapter/hyperliquid/account", () => ({
  HIP4AccountAdapter: class {
    fetchPositions = vi.fn().mockResolvedValue([]);
    fetchActivity = vi.fn().mockResolvedValue([]);
    subscribePositions = vi.fn().mockReturnValue(() => {});
  },
}));

vi.mock("../../src/adapter/hyperliquid/trading", () => ({
  HIP4TradingAdapter: class {
    placeOrder = vi.fn().mockResolvedValue({ success: true });
    cancelOrder = vi.fn().mockResolvedValue(undefined);
    cancelAllOrders = vi.fn().mockRejectedValue(new Error("Not supported"));
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createHIP4Adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns adapter with all 5 sub-adapters", () => {
    const adapter = createHIP4Adapter({ testnet: true });

    expect(adapter.events).toBeDefined();
    expect(adapter.marketData).toBeDefined();
    expect(adapter.account).toBeDefined();
    expect(adapter.trading).toBeDefined();
    expect(adapter.auth).toBeDefined();
  });

  it("id is 'hyperliquid'", () => {
    const adapter = createHIP4Adapter();

    expect(adapter.id).toBe("hyperliquid");
  });

  it("name includes 'Testnet' when testnet is true", () => {
    const adapter = createHIP4Adapter({ testnet: true });

    expect(adapter.name).toContain("Testnet");
  });

  it("name does not include 'Testnet' when testnet is false", () => {
    const adapter = createHIP4Adapter({ testnet: false });

    expect(adapter.name).not.toContain("Testnet");
    expect(adapter.name).toContain("HIP-4");
  });

  it("initialize() does not throw", async () => {
    const adapter = createHIP4Adapter({ testnet: true });

    await expect(adapter.initialize()).resolves.toBeUndefined();
  });

  it("destroy() calls auth.clearAuth", () => {
    const adapter = createHIP4Adapter({ testnet: true });

    const clearAuthSpy = vi.spyOn(adapter.auth, "clearAuth");

    adapter.destroy();

    expect(clearAuthSpy).toHaveBeenCalledTimes(1);
  });
});
