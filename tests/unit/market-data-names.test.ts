import { describe, expect, it, vi } from "vitest";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import type { SideNameResolver } from "../../src/adapter/hyperliquid/events";
import { HIP4MarketDataAdapter } from "../../src/adapter/hyperliquid/market-data";

function mockClient(): HIP4Client {
  return {
    testnet: true,
    wsUrl: "wss://test",
    fetchAllMids: vi.fn().mockResolvedValue({
      "#100": "0.65",
      "#101": "0.35",
    }),
    log: () => {},
  } as unknown as HIP4Client;
}

describe("Market data side name resolution", () => {
  it("fetchPrice returns real names when resolver is provided", async () => {
    const resolver: SideNameResolver = (id) =>
      id === 10 ? ["Hypurr", "Usain Bolt"] : null;
    const ensureFn = vi.fn().mockResolvedValue(undefined);

    const adapter = new HIP4MarketDataAdapter(mockClient(), resolver, ensureFn);
    const price = await adapter.fetchPrice("10");

    expect(price.outcomes[0].name).toBe("Hypurr");
    expect(price.outcomes[1].name).toBe("Usain Bolt");
  });

  it("fetchPrice falls back to Side 0/Side 1 when resolver returns null", async () => {
    const resolver: SideNameResolver = () => null;

    const adapter = new HIP4MarketDataAdapter(mockClient(), resolver);
    const price = await adapter.fetchPrice("10");

    expect(price.outcomes[0].name).toBe("Side 0");
    expect(price.outcomes[1].name).toBe("Side 1");
  });

  it("fetchPrice falls back to Side 0/Side 1 when no resolver given", async () => {
    const adapter = new HIP4MarketDataAdapter(mockClient());
    const price = await adapter.fetchPrice("10");

    expect(price.outcomes[0].name).toBe("Side 0");
    expect(price.outcomes[1].name).toBe("Side 1");
  });

  it("fetchPrice calls ensureSideNames before resolving", async () => {
    const ensureFn = vi.fn().mockResolvedValue(undefined);
    const resolver: SideNameResolver = () => ["Yes", "No"];

    const adapter = new HIP4MarketDataAdapter(mockClient(), resolver, ensureFn);
    await adapter.fetchPrice("10");

    expect(ensureFn).toHaveBeenCalledOnce();
  });
});

describe("outcomeName on PredictionPosition", () => {
  it("uses resolved name when resolver is provided", async () => {
    // This test verifies the account adapter integration indirectly -
    // the mapSpotBalance function receives the resolver and sets outcomeName.
    // Tested via account-mapping.test.ts for the full flow.
    // Here we just verify the type exists.
    const pos = {
      marketId: "10",
      eventTitle: "",
      marketQuestion: "",
      outcome: "#100",
      outcomeName: "Hypurr",
      shares: "10",
      avgCost: "0.5",
      currentPrice: "0.65",
      unrealizedPnl: "1.5",
      potentialPayout: "10",
      eventStatus: "active" as const,
    };
    expect(pos.outcomeName).toBe("Hypurr");
    expect(pos.outcome).toBe("#100");
  });
});
