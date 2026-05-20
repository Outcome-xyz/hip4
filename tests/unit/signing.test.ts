import { describe, expect, it } from "vitest";
import {
  createL1ActionHash,
  encodeMsgpack,
  keccak256,
  sortCancelAction,
  sortOrderAction,
} from "../../src/adapter/hyperliquid/signing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// ---------------------------------------------------------------------------
// Keccak-256
// ---------------------------------------------------------------------------

describe("keccak256", () => {
  it("hashes empty input to known vector", () => {
    const result = keccak256(new Uint8Array(0));
    expect(toHex(result)).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it('hashes "hello" to known vector', () => {
    const result = keccak256(new TextEncoder().encode("hello"));
    expect(toHex(result)).toBe(
      "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8",
    );
  });

  it('hashes "testing" to known vector', () => {
    const result = keccak256(new TextEncoder().encode("testing"));
    expect(toHex(result)).toBe(
      "0x5f16f4c7f149ac4f9510d9cf8cf384038ad348b3bcdc01915f95de12df9d1b02",
    );
  });
});

// ---------------------------------------------------------------------------
// MessagePack Encoder
// ---------------------------------------------------------------------------

describe("encodeMsgpack", () => {
  it('encodes "hello" as fixstr', () => {
    const result = encodeMsgpack("hello");
    expect(Array.from(result)).toEqual([0xa5, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it("encodes true as 0xc3", () => {
    const result = encodeMsgpack(true);
    expect(Array.from(result)).toEqual([0xc3]);
  });

  it("encodes false as 0xc2", () => {
    const result = encodeMsgpack(false);
    expect(Array.from(result)).toEqual([0xc2]);
  });

  it("encodes null as 0xc0", () => {
    const result = encodeMsgpack(null);
    expect(Array.from(result)).toEqual([0xc0]);
  });

  it("encodes 42 as positive fixint", () => {
    const result = encodeMsgpack(42);
    expect(Array.from(result)).toEqual([0x2a]);
  });

  it("encodes 200 as uint8", () => {
    const result = encodeMsgpack(200);
    expect(Array.from(result)).toEqual([0xcc, 0xc8]);
  });

  it("encodes 100017580 with uint32 prefix (0xce)", () => {
    const result = encodeMsgpack(100017580);
    expect(result[0]).toBe(0xce);
  });

  it("encodes -1 as negative fixint", () => {
    const result = encodeMsgpack(-1);
    expect(Array.from(result)).toEqual([0xff]);
  });

  it("encodes {a: 1, b: 'x'} starting with fixmap (0x82)", () => {
    const result = encodeMsgpack({ a: 1, b: "x" });
    expect(result[0]).toBe(0x82);
  });

  it("encodes [1, 2] starting with fixarray (0x92)", () => {
    const result = encodeMsgpack([1, 2]);
    expect(result[0]).toBe(0x92);
  });
});

// ---------------------------------------------------------------------------
// Action Sorters
// ---------------------------------------------------------------------------

describe("sortOrderAction", () => {
  it("produces keys in order: type, orders, grouping", () => {
    const action = sortOrderAction({
      type: "order",
      orders: [
        {
          a: 1,
          b: true,
          p: "1.0",
          s: "1.0",
          r: false,
          t: { limit: { tif: "Gtc" } },
        },
      ],
      grouping: "na",
    });
    const keys = Object.keys(action);
    expect(keys).toEqual(["type", "orders", "grouping"]);
  });

  it("strips trailing zeros from price and size", () => {
    const action = sortOrderAction({
      type: "order",
      orders: [
        {
          a: 1,
          b: true,
          p: "0.5000",
          s: "10.00",
          r: false,
          t: { limit: { tif: "Gtc" } },
        },
      ],
      grouping: "na",
    });
    const order = (action as unknown as Record<string, unknown[]>)
      .orders[0] as Record<string, unknown>;
    expect(order.p).toBe("0.5");
    expect(order.s).toBe("10");
  });

  it("omits c field when undefined", () => {
    const action = sortOrderAction({
      type: "order",
      orders: [
        {
          a: 1,
          b: true,
          p: "1",
          s: "1",
          r: false,
          t: { limit: { tif: "Gtc" } },
        },
      ],
      grouping: "na",
    });
    const order = (action as unknown as Record<string, unknown[]>)
      .orders[0] as Record<string, unknown>;
    expect("c" in order).toBe(false);
  });

  it("includes c field when present", () => {
    const action = sortOrderAction({
      type: "order",
      orders: [
        {
          a: 1,
          b: true,
          p: "1",
          s: "1",
          r: false,
          t: { limit: { tif: "Gtc" } },
          c: "0xcloid",
        } as never,
      ],
      grouping: "na",
    });
    const order = (action as unknown as Record<string, unknown[]>)
      .orders[0] as Record<string, unknown>;
    expect(order.c).toBe("0xcloid");
  });

  it("omits builder when undefined", () => {
    const action = sortOrderAction({
      type: "order",
      orders: [],
      grouping: "na",
    });
    expect("builder" in action).toBe(false);
  });
});

describe("sortCancelAction", () => {
  it("produces keys in order: type, cancels", () => {
    const action = sortCancelAction({
      type: "cancel",
      cancels: [{ a: 1, o: 2 }],
    });
    const keys = Object.keys(action);
    expect(keys).toEqual(["type", "cancels"]);
  });
});

// ---------------------------------------------------------------------------
// L1 Action Hash
// ---------------------------------------------------------------------------

describe("createL1ActionHash", () => {
  it("produces correct hash for an order action", () => {
    const action = sortOrderAction({
      type: "order",
      orders: [
        {
          a: 100017580,
          b: true,
          p: "0.55",
          s: "10",
          r: false,
          t: { limit: { tif: "Gtc" } },
        },
      ],
      grouping: "na",
    });
    const hash = createL1ActionHash({
      action: action as unknown as Record<string, unknown>,
      nonce: 1700000000000,
    });
    expect(toHex(hash)).toBe(
      "0x4b5e3a6100e09595c2d6832bc12e92580c2fc43f9979f3496babd393acbef3c5",
    );
  });

  it("produces correct hash for a cancel action", () => {
    const cancel = sortCancelAction({
      type: "cancel",
      cancels: [{ a: 100017580, o: 12345 }],
    });
    const hash = createL1ActionHash({
      action: cancel as unknown as Record<string, unknown>,
      nonce: 1700000000000,
    });
    expect(toHex(hash)).toBe(
      "0x44fbf1da741dc60547399e5c8bb94a3fc7b3a46c600419590ee152efba9164a9",
    );
  });

  it("produces correct hash with trailing-zero inputs (tests formatDecimal)", () => {
    const action = sortOrderAction({
      type: "order",
      orders: [
        {
          a: 100000090,
          b: true,
          p: "0.5000",
          s: "10.00",
          r: false,
          t: { limit: { tif: "Gtc" } },
        },
      ],
      grouping: "na",
    });
    const hash = createL1ActionHash({
      action: action as unknown as Record<string, unknown>,
      nonce: 1700000000000,
    });
    expect(toHex(hash)).toBe(
      "0x7870e83874912e8953a1bc1ab37dff9bec4deeb971d49c46736937899130fb88",
    );
  });
});
