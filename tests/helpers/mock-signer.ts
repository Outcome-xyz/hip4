import { vi } from "vitest";
import type { HIP4Signer, HLSignature } from "../../src/adapter/hyperliquid/types";

const VALID_SIGNATURE: HLSignature = {
  r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  s: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
  v: 27,
};

const TEST_ADDRESS = "0xTEST0000000000000000000000000000deadbeef";

/**
 * Returns a valid HIP4Signer that produces deterministic signatures.
 */
export function createValidSigner(): HIP4Signer & {
  signTypedData: ReturnType<typeof vi.fn>;
} {
  return {
    getAddress: () => TEST_ADDRESS,
    signTypedData: vi.fn().mockResolvedValue(VALID_SIGNATURE),
  };
}

/**
 * Returns a signer whose signTypedData always rejects.
 */
export function createRejectingSigner(): HIP4Signer & {
  signTypedData: ReturnType<typeof vi.fn>;
} {
  return {
    getAddress: () => TEST_ADDRESS,
    signTypedData: vi.fn().mockRejectedValue(new Error("User rejected")),
  };
}

/**
 * Returns an invalid signer object that is missing getAddress.
 * Useful for testing validation / error handling.
 */
export function createInvalidSigner(): Record<string, unknown> {
  return {
    // getAddress intentionally missing
    signTypedData: vi.fn().mockResolvedValue(VALID_SIGNATURE),
  };
}

export { TEST_ADDRESS, VALID_SIGNATURE };
