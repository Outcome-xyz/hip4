// settledOutcome endpoint integration test (live Hyperliquid testnet)

import { describe, expect, it } from "vitest";
import { HIP4Client } from "../../src/adapter/hyperliquid/client";

const client = new HIP4Client({ testnet: true });

describe("fetchSettledOutcome (live testnet)", () => {
  it("returns settled outcome data for a known settled ID", async () => {
    const result = await client.fetchSettledOutcome(3);

    expect(result).not.toBeNull();
    expect(result!.spec).toMatchObject({
      outcome: 3,
      name: expect.any(String),
      sideSpecs: expect.any(Array),
    });
    expect(result!.settleFraction).toEqual(expect.any(String));
    expect(result!.details).toEqual(expect.any(String));
  });

  it("returns null for an unknown outcome ID", async () => {
    const result = await client.fetchSettledOutcome(1);
    expect(result).toBeNull();
  });
});
