// ---------------------------------------------------------------------------
// Tests for the pricing module: tick size, price formatting, trailing zeros
//
// These tests verify correct 5-significant-figure tick alignment and
// trailing-zero stripping  - both critical for signing correctness.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  computeTickSize,
  roundToTick,
  formatPrice,
  stripZeros,
  getMinShares,
  MIN_NOTIONAL,
} from "../../src/adapter/hyperliquid/pricing";

// ---------------------------------------------------------------------------
// computeTickSize
// ---------------------------------------------------------------------------

describe("computeTickSize", () => {
  it("price 0.55 → tick 0.00001", () => {
    expect(computeTickSize(0.55)).toBeCloseTo(0.00001, 10);
  });

  it("price 1.0 → tick 0.0001", () => {
    expect(computeTickSize(1.0)).toBeCloseTo(0.0001, 10);
  });

  it("price 65000 → tick 1", () => {
    expect(computeTickSize(65000)).toBe(1);
  });

  it("price 0.01 → tick 0.000001", () => {
    expect(computeTickSize(0.01)).toBeCloseTo(0.000001, 12);
  });

  it("price 100 → tick 0.01", () => {
    expect(computeTickSize(100)).toBeCloseTo(0.01, 10);
  });

  it("price <= 0 returns minimum tick", () => {
    expect(computeTickSize(0)).toBe(0.00001);
    expect(computeTickSize(-1)).toBe(0.00001);
  });
});

// ---------------------------------------------------------------------------
// roundToTick
// ---------------------------------------------------------------------------

describe("roundToTick", () => {
  it("rounds 0.55123 to nearest tick for price ~0.55", () => {
    const result = roundToTick(0.55123);
    const tick = computeTickSize(0.55123);
    // Result should land on a tick. Use ratio-based check rather than `%`
    // to avoid float-modulo amplifying representation error (0.55123 has
    // no exact IEEE-754 representation, so `result % tick` produces ~1e-8
    // residue even when `result` is mathematically aligned).
    const ticks = result / tick;
    expect(Math.abs(ticks - Math.round(ticks))).toBeLessThan(1e-6);
    expect(result).toBeCloseTo(0.55123, 5);
  });

  it("rounds 0.6501 to 0.6501 (already aligned)", () => {
    expect(roundToTick(0.6501)).toBeCloseTo(0.6501, 5);
  });

  it("rounds 65123 to 65123 (tick=1 for 5-digit prices)", () => {
    expect(roundToTick(65123)).toBe(65123);
  });

  it("rounds 65123.7 to 65124", () => {
    expect(roundToTick(65123.7)).toBe(65124);
  });
});

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------

describe("formatPrice", () => {
  it("formats 0.55 → '0.55' (no trailing zeros)", () => {
    expect(formatPrice(0.55)).toBe("0.55");
  });

  it("formats 0.650 → '0.65' (strips trailing zero)", () => {
    expect(formatPrice(0.65)).toBe("0.65");
  });

  it("formats 0.5 → '0.5'", () => {
    expect(formatPrice(0.5)).toBe("0.5");
  });

  it("formats 0.10 → '0.1'", () => {
    expect(formatPrice(0.1)).toBe("0.1");
  });

  it("formats 1.0 → '1'", () => {
    expect(formatPrice(1.0)).toBe("1");
  });

  it("formats 65000 → '65000'", () => {
    expect(formatPrice(65000)).toBe("65000");
  });

  it("formats 0.99999 → '0.99999'", () => {
    expect(formatPrice(0.99999)).toBe("0.99999");
  });

  it("formats 0.00001 → '0.00001'", () => {
    expect(formatPrice(0.00001)).toBe("0.00001");
  });

  it("formats 35.81 → '35.81'", () => {
    expect(formatPrice(35.81)).toBe("35.81");
  });

  it("formats 0 → '0'", () => {
    expect(formatPrice(0)).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// stripZeros
// ---------------------------------------------------------------------------

describe("stripZeros", () => {
  it("strips trailing zeros: '35.810' → '35.81'", () => {
    expect(stripZeros("35.810")).toBe("35.81");
  });

  it("strips trailing zeros: '1.0' → '1'", () => {
    expect(stripZeros("1.0")).toBe("1");
  });

  it("strips trailing zeros: '0.650' → '0.65'", () => {
    expect(stripZeros("0.650")).toBe("0.65");
  });

  it("no-op for integer strings: '100' → '100'", () => {
    expect(stripZeros("100")).toBe("100");
  });

  it("no-op for already clean decimals: '0.55' → '0.55'", () => {
    expect(stripZeros("0.55")).toBe("0.55");
  });

  it("strips all decimal zeros: '5.000' → '5'", () => {
    expect(stripZeros("5.000")).toBe("5");
  });
});

// ---------------------------------------------------------------------------
// getMinShares
// ---------------------------------------------------------------------------

// Expectations name the divisor -- which side the formula picks, and where it
// clamps -- while deriving the dividend from MIN_NOTIONAL. That keeps the
// behaviour under test pinned without re-breaking every time the exchange
// moves the floor.
describe("getMinShares", () => {
  it("divides by the cheaper side", () => {
    expect(getMinShares(0.5)).toBe(Math.ceil(MIN_NOTIONAL / 0.5));
    // 0.1 is the cheaper side of a 0.9 mark.
    expect(getMinShares(0.1)).toBe(Math.ceil(MIN_NOTIONAL / 0.1));
  });

  it("inherits the float error in 1 - markPx", () => {
    // 1 - 0.9 is 0.09999... in IEEE 754, so this is one share more than
    // dividing by a clean 0.1 would give.
    expect(getMinShares(0.9)).toBe(Math.ceil(MIN_NOTIONAL / (1 - 0.9)));
    expect(getMinShares(0.9)).toBeGreaterThan(getMinShares(0.1));
  });

  it("clamps a side below a cent up to 0.01", () => {
    const clamped = Math.ceil(MIN_NOTIONAL / 0.01);
    expect(getMinShares(0.01)).toBe(clamped);
    expect(getMinShares(0)).toBe(clamped);
    expect(getMinShares(1)).toBe(clamped);
  });

  it("always returns a whole number", () => {
    expect(Number.isInteger(getMinShares(0.33))).toBe(true);
    expect(Number.isInteger(getMinShares(0.77))).toBe(true);
  });

  it("rounds up rather than truncating", () => {
    expect(getMinShares(0.33)).toBe(Math.ceil(MIN_NOTIONAL / 0.33));
  });
});

// ---------------------------------------------------------------------------
// MIN_NOTIONAL constant
// ---------------------------------------------------------------------------

describe("MIN_NOTIONAL", () => {
  it("is 1", () => {
    expect(MIN_NOTIONAL).toBe(1);
  });
});
