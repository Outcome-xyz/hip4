import { describe, it, expect } from "vitest";
import {
  outcomeCoin,
  sideCoin,
  sideAssetId,
  parseSideCoin,
  parseOutcomeCoin,
  coinOutcomeId,
  isOutcomeCoin,
} from "../../src/adapter/hyperliquid/client";

// ---------------------------------------------------------------------------
// outcomeCoin
// ---------------------------------------------------------------------------

describe("outcomeCoin", () => {
  it("prefixes outcome ID with @", () => {
    expect(outcomeCoin(1758)).toBe("@1758");
  });

  it("handles zero", () => {
    expect(outcomeCoin(0)).toBe("@0");
  });
});

// ---------------------------------------------------------------------------
// sideCoin
// ---------------------------------------------------------------------------

describe("sideCoin", () => {
  it("returns #<outcomeId><sideIndex> for side 0", () => {
    expect(sideCoin(1758, 0)).toBe("#17580");
  });

  it("returns #<outcomeId><sideIndex> for side 1", () => {
    expect(sideCoin(1758, 1)).toBe("#17581");
  });

  it("works with different outcome IDs", () => {
    expect(sideCoin(5160, 0)).toBe("#51600");
  });
});

// ---------------------------------------------------------------------------
// sideAssetId
// ---------------------------------------------------------------------------

describe("sideAssetId", () => {
  it("computes 100_000_000 + outcomeId * 10 + sideIndex", () => {
    expect(sideAssetId(1758, 0)).toBe(100017580);
  });

  it("handles zero outcomeId", () => {
    expect(sideAssetId(0, 0)).toBe(100000000);
  });
});

// ---------------------------------------------------------------------------
// parseSideCoin
// ---------------------------------------------------------------------------

describe("parseSideCoin", () => {
  it("parses a valid side coin with side 0", () => {
    expect(parseSideCoin("#17580")).toEqual({ outcomeId: 1758, sideIndex: 0 });
  });

  it("parses a valid side coin with side 1", () => {
    expect(parseSideCoin("#51601")).toEqual({ outcomeId: 5160, sideIndex: 1 });
  });

  it("returns null for non-# prefixed strings", () => {
    expect(parseSideCoin("BTC")).toBeNull();
  });

  it("returns null for bare # with no digits", () => {
    expect(parseSideCoin("#")).toBeNull();
  });

  it("returns null when numeric part is too short (< 2 chars)", () => {
    expect(parseSideCoin("#1")).toBeNull();
  });

  it("returns null when sideIndex > 1 (e.g. #17589)", () => {
    expect(parseSideCoin("#17589")).toBeNull();
  });

  it("returns null when sideIndex is 2 (e.g. #17582)", () => {
    expect(parseSideCoin("#17582")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseOutcomeCoin
// ---------------------------------------------------------------------------

describe("parseOutcomeCoin", () => {
  it("parses a valid outcome coin", () => {
    expect(parseOutcomeCoin("@1338")).toEqual({ outcomeId: 1338 });
  });

  it("returns null for non-@ prefixed strings", () => {
    expect(parseOutcomeCoin("#123")).toBeNull();
  });

  it("returns null when value after @ is not a number", () => {
    expect(parseOutcomeCoin("@abc")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// coinOutcomeId
// ---------------------------------------------------------------------------

describe("coinOutcomeId", () => {
  it("extracts outcome ID from side coin", () => {
    expect(coinOutcomeId("#17580")).toBe(1758);
  });

  it("extracts outcome ID from outcome coin", () => {
    expect(coinOutcomeId("@1338")).toBe(1338);
  });

  it("returns null for regular coin names", () => {
    expect(coinOutcomeId("BTC")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isOutcomeCoin
// ---------------------------------------------------------------------------

describe("isOutcomeCoin", () => {
  it("returns true for side coins", () => {
    expect(isOutcomeCoin("#17580")).toBe(true);
  });

  it("returns true for outcome coins", () => {
    expect(isOutcomeCoin("@1338")).toBe(true);
  });

  it("returns false for regular coin names", () => {
    expect(isOutcomeCoin("BTC")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isOutcomeCoin("")).toBe(false);
  });
});
