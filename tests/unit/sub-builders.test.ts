// ---------------------------------------------------------------------------
// Sub-builder support: validation, wire conversion, canonical ordering, and
// how the trading adapter attaches `builder.s` to order actions.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { HIP4Auth } from "../../src/adapter/hyperliquid/auth";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { sortOrderAction } from "../../src/adapter/hyperliquid/signing";
import {
  MAX_SUB_BUILDERS,
  SUB_BUILDER_SHARE_TOTAL,
  toWireSubBuilders,
} from "../../src/adapter/hyperliquid/sub-builders";
import { HIP4TradingAdapter } from "../../src/adapter/hyperliquid/trading";
import type {
  HIP4Signer,
  HLExchangeResponse,
} from "../../src/adapter/hyperliquid/types";

const TOP = "0xAB5DBC057628bc18523c4CdFc0e1E2eBDbEcB704";
const SUB_A = "0xBD31F5972F189E37E6003B5EE175296B3D79EB6E";
const SUB_B = "0x0fdd000000000000000000000000000000000c18";

function createMockSigner(): HIP4Signer {
  return {
    getAddress: vi.fn().mockResolvedValue("0xMOCK"),
    signTypedData: vi.fn().mockResolvedValue({
      r: "0x" + "ab".repeat(32),
      s: "0x" + "cd".repeat(32),
      v: 27,
    }),
  };
}

function createMockClient(): HIP4Client {
  return {
    testnet: true,
    log: vi.fn(),
    placeOrder: vi.fn().mockResolvedValue({
      status: "ok",
      response: {
        type: "order",
        data: {
          statuses: [
            { filled: { totalSz: "20", avgPx: "0.5", oid: 1 } },
            { filled: { totalSz: "20", avgPx: "0.5", oid: 2 } },
          ],
        },
      },
    } satisfies HLExchangeResponse),
  } as unknown as HIP4Client;
}

const ORDER = {
  marketId: "1758",
  outcome: "#17580",
  side: "buy" as const,
  type: "limit" as const,
  price: "0.5",
  amount: "20",
};

// ---------------------------------------------------------------------------
// toWireSubBuilders
// ---------------------------------------------------------------------------

describe("toWireSubBuilders", () => {
  it("returns undefined for undefined or empty input", () => {
    expect(toWireSubBuilders(undefined)).toBeUndefined();
    expect(toWireSubBuilders([])).toBeUndefined();
  });

  it("passes raw share through and lowercases the address", () => {
    expect(toWireSubBuilders([{ address: SUB_A, share: 25000 }])).toEqual([
      { b: SUB_A.toLowerCase(), s: 25000 },
    ]);
  });

  it("converts sharePercent to raw units (1 = 0.001%)", () => {
    expect(
      toWireSubBuilders([
        { address: SUB_A, sharePercent: 25 },
        { address: SUB_B, sharePercent: 12.5 },
      ]),
    ).toEqual([
      { b: SUB_A.toLowerCase(), s: 25000 },
      { b: SUB_B.toLowerCase(), s: 12500 },
    ]);
  });

  it("accepts a total of exactly 100%", () => {
    expect(
      toWireSubBuilders([{ address: SUB_A, share: SUB_BUILDER_SHARE_TOTAL }]),
    ).toEqual([{ b: SUB_A.toLowerCase(), s: 100000 }]);
  });

  it("throws when both share and sharePercent are given", () => {
    expect(() =>
      toWireSubBuilders([{ address: SUB_A, share: 25000, sharePercent: 25 }]),
    ).toThrow(/exactly one of share or sharePercent/);
  });

  it("throws when neither share nor sharePercent is given", () => {
    expect(() => toWireSubBuilders([{ address: SUB_A }])).toThrow(
      /exactly one of share or sharePercent/,
    );
  });

  it(`throws when more than ${MAX_SUB_BUILDERS} sub-builders are given`, () => {
    const many = Array.from({ length: MAX_SUB_BUILDERS + 1 }, () => ({
      address: SUB_A,
      share: 1000,
    }));
    expect(() => toWireSubBuilders(many)).toThrow(/At most 5/);
  });

  it.each(["0xABC", "BD31F5972F189E37E6003B5EE175296B3D79EB6E", "0x" + "z".repeat(40)])(
    "throws on invalid address %s",
    (address) => {
      expect(() => toWireSubBuilders([{ address, share: 1000 }])).toThrow(
        /invalid address/,
      );
    },
  );

  it.each([0, -1, 1.5, Number.NaN])("throws on non-positive or non-integer share %s", (share) => {
    expect(() => toWireSubBuilders([{ address: SUB_A, share }])).toThrow(
      /positive integer/,
    );
  });

  it("throws when sharePercent is finer than 0.001%", () => {
    expect(() =>
      toWireSubBuilders([{ address: SUB_A, sharePercent: 0.0001 }]),
    ).toThrow(/positive integer/);
  });

  it("throws when shares sum above 100%", () => {
    expect(() =>
      toWireSubBuilders([
        { address: SUB_A, sharePercent: 60 },
        { address: SUB_B, share: 40001 },
      ]),
    ).toThrow(/must not exceed 100000/);
  });
});

// ---------------------------------------------------------------------------
// sortOrderAction with sub-builders
// ---------------------------------------------------------------------------

describe("sortOrderAction with sub-builders", () => {
  const baseAction = {
    type: "order" as const,
    orders: [
      { a: 1, b: true, p: "0.5", s: "10", r: false, t: { limit: { tif: "Gtc" as const } } },
    ],
    grouping: "na" as const,
  };

  it("emits builder keys in b, f, s order with sub-builder keys b, s", () => {
    const sorted = sortOrderAction({
      ...baseAction,
      builder: { s: [{ s: 25000, b: SUB_A }], f: 0, b: TOP },
    }) as unknown as { builder: Record<string, unknown> & { s: Record<string, unknown>[] } };

    expect(Object.keys(sorted.builder)).toEqual(["b", "f", "s"]);
    expect(Object.keys(sorted.builder.s[0])).toEqual(["b", "s"]);
    expect(sorted.builder).toEqual({
      b: TOP.toLowerCase(),
      f: 0,
      s: [{ b: SUB_A.toLowerCase(), s: 25000 }],
    });
  });

  it("omits s when no sub-builders are present", () => {
    const sorted = sortOrderAction({
      ...baseAction,
      builder: { b: TOP, f: 10 },
    }) as unknown as { builder: Record<string, unknown> };

    expect(Object.keys(sorted.builder)).toEqual(["b", "f"]);
  });
});

// ---------------------------------------------------------------------------
// HIP4TradingAdapter
// ---------------------------------------------------------------------------

describe("HIP4TradingAdapter sub-builders", () => {
  let client: HIP4Client;
  let auth: HIP4Auth;

  const lastAction = () =>
    (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];

  beforeEach(async () => {
    client = createMockClient();
    auth = new HIP4Auth();
    await auth.initAuth("0xUSER", createMockSigner());
  });

  it("has no sub-builders by default", async () => {
    const adapter = new HIP4TradingAdapter(client, auth, { builderAddress: TOP, builderFee: 0 });
    await adapter.placeOrder(ORDER);
    expect(lastAction().builder).toEqual({ b: TOP.toLowerCase(), f: 0 });
  });

  it("throws at construction on invalid config sub-builders", () => {
    expect(
      () =>
        new HIP4TradingAdapter(client, auth, {
          builderAddress: TOP,
          subBuilders: [{ address: SUB_A, share: 25000, sharePercent: 25 }],
        }),
    ).toThrow(/exactly one of share or sharePercent/);
  });

  it("throws at construction when sub-builders are set without builderAddress", () => {
    expect(
      () => new HIP4TradingAdapter(client, auth, { subBuilders: [{ address: SUB_A, share: 1 }] }),
    ).toThrow(/requires builderAddress/);
  });

  it("attaches config sub-builders to placeOrder", async () => {
    const adapter = new HIP4TradingAdapter(client, auth, {
      builderAddress: TOP,
      builderFee: 10,
      subBuilders: [{ address: SUB_A, sharePercent: 25 }],
    });
    await adapter.placeOrder(ORDER);
    expect(lastAction().builder).toEqual({
      b: TOP.toLowerCase(),
      f: 10,
      s: [{ b: SUB_A.toLowerCase(), s: 25000 }],
    });
  });

  it("per-order sub-builders override config sub-builders", async () => {
    const adapter = new HIP4TradingAdapter(client, auth, {
      builderAddress: TOP,
      subBuilders: [{ address: SUB_A, share: 25000 }],
    });
    await adapter.placeOrder({ ...ORDER, subBuilders: [{ address: SUB_B, share: 50000 }] });
    expect(lastAction().builder.s).toEqual([{ b: SUB_B.toLowerCase(), s: 50000 }]);
  });

  it("does not inherit config sub-builders when the order overrides builderAddress", async () => {
    const adapter = new HIP4TradingAdapter(client, auth, {
      builderAddress: TOP,
      subBuilders: [{ address: SUB_A, share: 25000 }],
    });
    await adapter.placeOrder({ ...ORDER, builderAddress: SUB_B, builderFee: 0 });
    expect(lastAction().builder).toEqual({ b: SUB_B.toLowerCase(), f: 0 });
  });

  it("returns an error instead of throwing on invalid per-order sub-builders", async () => {
    const adapter = new HIP4TradingAdapter(client, auth, { builderAddress: TOP });
    const res = await adapter.placeOrder({
      ...ORDER,
      subBuilders: [{ address: SUB_A }],
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/exactly one of share or sharePercent/);
    expect(client.placeOrder).not.toHaveBeenCalled();
  });

  it("returns an error when per-order sub-builders have no builder", async () => {
    const adapter = new HIP4TradingAdapter(client, auth);
    const res = await adapter.placeOrder({
      ...ORDER,
      subBuilders: [{ address: SUB_A, share: 1000 }],
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/requires builderAddress/);
    expect(client.placeOrder).not.toHaveBeenCalled();
  });

  it("attaches config sub-builders to placeOrders", async () => {
    const adapter = new HIP4TradingAdapter(client, auth, {
      builderAddress: TOP,
      subBuilders: [{ address: SUB_A, share: 25000 }],
    });
    await adapter.placeOrders([ORDER, ORDER]);
    expect(lastAction().builder).toEqual({
      b: TOP.toLowerCase(),
      f: 0,
      s: [{ b: SUB_A.toLowerCase(), s: 25000 }],
    });
  });
});
