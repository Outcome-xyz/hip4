import { describe, expect, it, vi } from "vitest";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4EventAdapter } from "../../src/adapter/hyperliquid/events";
import type { HLOutcomeMeta } from "../../src/adapter/hyperliquid/types";

const MOCK_META: HLOutcomeMeta = {
  outcomes: [
    {
      outcome: 9,
      name: "Who will win the HL 100 meter dash?",
      description: "",
      sideSpecs: [{ name: "Hypurr" }, { name: "Usain Bolt" }],
    },
    {
      outcome: 10,
      name: "Akami",
      description: "",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    {
      outcome: 99,
      name: "Single side",
      description: "",
      sideSpecs: [{ name: "Only" }], // < 2 sides - should be skipped
    },
  ],
  questions: [],
};

function mockClient(): HIP4Client {
  return {
    testnet: true,
    fetchOutcomeMeta: vi.fn().mockResolvedValue(MOCK_META),
    fetchAllMids: vi.fn().mockResolvedValue({}),
    log: () => {},
  } as unknown as HIP4Client;
}

describe("SideNameResolver", () => {
  it("returns null before ensureSideNames is called", () => {
    const client = mockClient();
    const adapter = new HIP4EventAdapter(client);
    const resolver = adapter.getSideNameResolver();
    expect(resolver(9)).toBeNull();
    expect(resolver(10)).toBeNull();
  });

  it("returns correct names after ensureSideNames", async () => {
    const client = mockClient();
    const adapter = new HIP4EventAdapter(client);
    const resolver = adapter.getSideNameResolver();

    await adapter.ensureSideNames();

    expect(resolver(9)).toEqual(["Hypurr", "Usain Bolt"]);
    expect(resolver(10)).toEqual(["Yes", "No"]);
  });

  it("returns null for unknown outcome IDs", async () => {
    const client = mockClient();
    const adapter = new HIP4EventAdapter(client);
    await adapter.ensureSideNames();

    const resolver = adapter.getSideNameResolver();
    expect(resolver(999)).toBeNull();
  });

  it("skips outcomes with fewer than 2 sideSpecs", async () => {
    const client = mockClient();
    const adapter = new HIP4EventAdapter(client);
    await adapter.ensureSideNames();

    const resolver = adapter.getSideNameResolver();
    expect(resolver(99)).toBeNull();
  });

  it("only fetches outcomeMeta once (cached)", async () => {
    const client = mockClient();
    const adapter = new HIP4EventAdapter(client);

    await adapter.ensureSideNames();
    await adapter.ensureSideNames();
    await adapter.ensureSideNames();

    expect(client.fetchOutcomeMeta).toHaveBeenCalledTimes(1);
  });

  it("is also populated by fetchEvents (loadEvents path)", async () => {
    const client = mockClient();
    const adapter = new HIP4EventAdapter(client);
    const resolver = adapter.getSideNameResolver();

    await adapter.fetchEvents();

    expect(resolver(9)).toEqual(["Hypurr", "Usain Bolt"]);
    expect(resolver(10)).toEqual(["Yes", "No"]);
  });
});
