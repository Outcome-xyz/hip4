import { describe, it, expect } from "vitest";
import {
  splitHexSignature,
  normalizeSignature,
} from "../../src/adapter/hyperliquid/types";
import type { HLSignature } from "../../src/adapter/hyperliquid/types";

// A realistic 65-byte hex signature (r: 32 bytes, s: 32 bytes, v: 1 byte)
const SAMPLE_R = "a".repeat(64);
const SAMPLE_S = "b".repeat(64);
const SAMPLE_V_HEX = "1b"; // 27 in decimal
const SAMPLE_HEX_WITH_PREFIX = `0x${SAMPLE_R}${SAMPLE_S}${SAMPLE_V_HEX}`;
const SAMPLE_HEX_WITHOUT_PREFIX = `${SAMPLE_R}${SAMPLE_S}${SAMPLE_V_HEX}`;

// ---------------------------------------------------------------------------
// splitHexSignature
// ---------------------------------------------------------------------------

describe("splitHexSignature", () => {
  it("splits a 0x-prefixed hex signature into r, s, v", () => {
    const result = splitHexSignature(SAMPLE_HEX_WITH_PREFIX);
    expect(result).toEqual({
      r: `0x${SAMPLE_R}`,
      s: `0x${SAMPLE_S}`,
      v: 27,
    });
  });

  it("splits a hex signature without 0x prefix", () => {
    const result = splitHexSignature(SAMPLE_HEX_WITHOUT_PREFIX);
    expect(result).toEqual({
      r: `0x${SAMPLE_R}`,
      s: `0x${SAMPLE_S}`,
      v: 27,
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeSignature
// ---------------------------------------------------------------------------

describe("normalizeSignature", () => {
  it("passes through an HLSignature object unchanged", () => {
    const sig: HLSignature = {
      r: `0x${SAMPLE_R}`,
      s: `0x${SAMPLE_S}`,
      v: 27,
    };
    const result = normalizeSignature(sig);
    expect(result).toBe(sig); // same reference
  });

  it("converts a hex string into an HLSignature", () => {
    const result = normalizeSignature(SAMPLE_HEX_WITH_PREFIX);
    expect(result).toEqual({
      r: `0x${SAMPLE_R}`,
      s: `0x${SAMPLE_S}`,
      v: 27,
    });
  });
});
