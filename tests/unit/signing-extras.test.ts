// ---------------------------------------------------------------------------
// Extra coverage for signing.ts: msgpack edge cases, L1 action hash with
// vault, sortOrderAction with builder/trigger, formatDecimal
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  encodeMsgpack,
  createL1ActionHash,
  sortOrderAction,
} from "../../src/adapter/hyperliquid/signing";
import type { HLOrderAction } from "../../src/adapter/hyperliquid/types";

function toHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// ---------------------------------------------------------------------------
// encodeMsgpack - additional type coverage
// ---------------------------------------------------------------------------

describe("encodeMsgpack extras", () => {
  it("encodes float (non-integer) with 0xcb prefix", () => {
    const result = encodeMsgpack(3.14);
    expect(result[0]).toBe(0xcb);
    expect(result.length).toBe(9); // 1 byte prefix + 8 bytes float64
  });

  it("encodes -1 as 0xff (negative fixint)", () => {
    const result = encodeMsgpack(-1);
    expect(Array.from(result)).toEqual([0xff]);
  });

  it("encodes -32 as 0xe0 (negative fixint boundary)", () => {
    const result = encodeMsgpack(-32);
    expect(Array.from(result)).toEqual([0xe0]);
  });

  it("encodes -33 with 0xd0 prefix (int8)", () => {
    const result = encodeMsgpack(-33);
    expect(result[0]).toBe(0xd0);
    expect(result.length).toBe(2);
    // -33 as signed byte: 0x100 + (-33) = 0xdf
    expect(result[1]).toBe(0xdf);
  });

  it("encodes -128 with 0xd0 prefix (int8 boundary)", () => {
    const result = encodeMsgpack(-128);
    expect(result[0]).toBe(0xd0);
    expect(result[1]).toBe(0x80);
  });

  it("encodes -129 with 0xd1 prefix (int16)", () => {
    const result = encodeMsgpack(-129);
    expect(result[0]).toBe(0xd1);
    expect(result.length).toBe(3);
  });

  it("encodes 256 with 0xcd prefix (uint16)", () => {
    const result = encodeMsgpack(256);
    expect(result[0]).toBe(0xcd);
    expect(result.length).toBe(3);
    expect(result[1]).toBe(0x01);
    expect(result[2]).toBe(0x00);
  });

  it("encodes 65535 with 0xcd prefix (uint16 max)", () => {
    const result = encodeMsgpack(65535);
    expect(result[0]).toBe(0xcd);
    expect(result[1]).toBe(0xff);
    expect(result[2]).toBe(0xff);
  });

  it("encodes 65536 with 0xce prefix (uint32)", () => {
    const result = encodeMsgpack(65536);
    expect(result[0]).toBe(0xce);
  });

  it("encodes large array (>15 elements) with 0xdc prefix (array16)", () => {
    const arr = new Array(16).fill(0);
    const result = encodeMsgpack(arr);
    expect(result[0]).toBe(0xdc);
    // Next 2 bytes should be 0x00 0x10 (16)
    expect(result[1]).toBe(0x00);
    expect(result[2]).toBe(0x10);
  });

  it("encodes large map (>15 keys) with 0xde prefix (map16)", () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 16; i++) {
      obj[`k${i.toString().padStart(2, "0")}`] = i;
    }
    const result = encodeMsgpack(obj);
    expect(result[0]).toBe(0xde);
  });

  it("encodes undefined as null (0xc0)", () => {
    const result = encodeMsgpack(undefined);
    expect(Array.from(result)).toEqual([0xc0]);
  });

  it("encodes uint64 (> 0xffffffff) with 0xcf prefix", () => {
    const result = encodeMsgpack(0x100000000); // 4294967296
    expect(result[0]).toBe(0xcf);
    expect(result.length).toBe(9);
  });

  it("encodes large negative (< -32768) with 0xd2 prefix (int32)", () => {
    const result = encodeMsgpack(-40000);
    expect(result[0]).toBe(0xd2);
    expect(result.length).toBe(5);
  });

  it("encodes string > 31 bytes with 0xd9 prefix (str8)", () => {
    const str = "a".repeat(32);
    const result = encodeMsgpack(str);
    expect(result[0]).toBe(0xd9);
    expect(result[1]).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// createL1ActionHash with vaultAddress
// ---------------------------------------------------------------------------

describe("createL1ActionHash with vault", () => {
  it("produces different hash with vaultAddress vs without", () => {
    const action = { type: "order", orders: [], grouping: "na" };
    const nonce = 1700000000000;

    const hashWithout = createL1ActionHash({ action, nonce });
    const hashWith = createL1ActionHash({
      action,
      nonce,
      vaultAddress: "0x1234567890abcdef1234567890abcdef12345678",
    });

    // Hashes should differ because vault marker changes
    expect(toHex(hashWithout)).not.toBe(toHex(hashWith));
  });

  it("includes vault marker byte (0x01) + 20 address bytes in hash input", () => {
    // We verify indirectly that the hash changes deterministically
    const action = { type: "test" };
    const nonce = 42;
    const addr = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const hash1 = createL1ActionHash({ action, nonce, vaultAddress: addr });
    const hash2 = createL1ActionHash({ action, nonce, vaultAddress: addr });
    expect(toHex(hash1)).toBe(toHex(hash2)); // deterministic

    // Different vault = different hash
    const hash3 = createL1ActionHash({
      action,
      nonce,
      vaultAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    expect(toHex(hash1)).not.toBe(toHex(hash3));
  });
});

// ---------------------------------------------------------------------------
// sortOrderAction with builder
// ---------------------------------------------------------------------------

describe("sortOrderAction with builder", () => {
  it("lowercases builder address and uses { b, f } key order", () => {
    const action = sortOrderAction({
      type: "order",
      orders: [
        {
          a: 1,
          b: true,
          p: "0.5",
          s: "10",
          r: false,
          t: { limit: { tif: "Gtc" } },
        },
      ],
      grouping: "na",
      builder: { b: "0xABCDef1234567890AbCdEf1234567890ABCDEF12", f: 100 },
    });

    const sorted = action as unknown as Record<string, unknown>;
    expect(sorted.builder).toEqual({
      b: "0xabcdef1234567890abcdef1234567890abcdef12",
      f: 100,
    });

    // Key order: type, orders, grouping, builder
    const keys = Object.keys(sorted);
    expect(keys).toEqual(["type", "orders", "grouping", "builder"]);
  });
});

// ---------------------------------------------------------------------------
// sortOrderAction with trigger order type
// ---------------------------------------------------------------------------

describe("sortOrderAction with trigger", () => {
  it("sorts trigger fields in order: isMarket, triggerPx, tpsl", () => {
    const action = sortOrderAction({
      type: "order",
      orders: [
        {
          a: 1,
          b: true,
          p: "0.5000",
          s: "10.00",
          r: false,
          t: {
            trigger: {
              triggerPx: "0.6000",
              isMarket: true,
              tpsl: "tp",
            },
          },
        },
      ],
      grouping: "na",
    } as HLOrderAction);

    const order = (action as unknown as Record<string, unknown[]>).orders[0] as Record<string, unknown>;
    const t = order.t as Record<string, unknown>;
    const trigger = (t as { trigger: Record<string, unknown> }).trigger;

    // Check key order
    const triggerKeys = Object.keys(trigger);
    expect(triggerKeys).toEqual(["isMarket", "triggerPx", "tpsl"]);

    // Check formatDecimal applied to triggerPx
    expect(trigger.triggerPx).toBe("0.6");

    // Check p and s also formatted
    expect(order.p).toBe("0.5");
    expect(order.s).toBe("10");
  });
});

// ---------------------------------------------------------------------------
// formatDecimal with scientific notation (tested via sortOrderAction)
// ---------------------------------------------------------------------------

describe("formatDecimal with scientific notation", () => {
  it("converts scientific notation in price", () => {
    const action = sortOrderAction({
      type: "order",
      orders: [
        {
          a: 1,
          b: true,
          p: "1e-5",
          s: "1",
          r: false,
          t: { limit: { tif: "Gtc" } },
        },
      ],
      grouping: "na",
    });

    const order = (action as unknown as Record<string, unknown[]>).orders[0] as Record<string, unknown>;
    // "1e-5" → Number("1e-5").toFixed(20) → "0.00001000000000000000" → trimmed to "0.00001"
    expect(order.p).toBe("0.00001");
  });
});
