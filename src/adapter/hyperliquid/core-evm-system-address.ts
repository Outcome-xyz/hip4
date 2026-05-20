// ---------------------------------------------------------------------------
// Core → HyperEVM System Address Derivation
//
// Every Hyperliquid spot token has a "system address" on HyperCore that acts
// as the sink for Core → HyperEVM transfers via `spotSend`. The address is
// `0x20` + 19 bytes big-endian token index. HYPE is the one documented
// exception at `0x2222…2222`.
//
// Reference: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/hypercore-less-than-greater-than-hyperevm-transfers
//
// Callers should never hand-roll this address. Spot-pair/market indices
// (e.g. `USDH_SPOT_INDEX_MAINNET = 230`) are NOT token indices and must not
// be passed here.
// ---------------------------------------------------------------------------

/** HYPE is the one documented exception to the 0x20-prefix rule. */
export const HYPE_CORE_EVM_SYSTEM_ADDRESS =
  "0x2222222222222222222222222222222222222222" as const;

/**
 * Upper bound on derivable token indices. 19-byte big-endian can hold values
 * up to 2^152 - 1, which overflows JS numbers. We clamp to MAX_SAFE_INTEGER
 * so the derivation math stays exact; every real Hyperliquid token index is
 * orders of magnitude below this.
 */
export const MAX_CORE_EVM_TOKEN_INDEX = Number.MAX_SAFE_INTEGER;

/**
 * Derive the HyperCore system address for a given spot token index.
 *
 * IMPORTANT: `tokenIndex` is the value from `info: spotMeta → tokens[].index`,
 * not the spot-pair/market index from `universe[]`. Passing the wrong one
 * sends funds to an unrelated token's system address.
 *
 * For HYPE, import `HYPE_CORE_EVM_SYSTEM_ADDRESS` directly - there is no
 * derivable address.
 */
export function deriveCoreEvmSystemAddress(tokenIndex: number): string {
  if (!Number.isInteger(tokenIndex)) {
    throw new Error(
      `Token index must be an integer, got ${String(tokenIndex)}`,
    );
  }
  if (tokenIndex < 0) {
    throw new Error(`Token index must be non-negative, got ${tokenIndex}`);
  }
  if (tokenIndex > MAX_CORE_EVM_TOKEN_INDEX) {
    throw new Error(
      `Token index ${tokenIndex} exceeds safe-integer ceiling ${MAX_CORE_EVM_TOKEN_INDEX}`,
    );
  }

  // 19 bytes = 38 hex chars after the 0x20 prefix byte. BigInt formatting
  // keeps us exact across all safe integers.
  const hex = BigInt(tokenIndex).toString(16).padStart(38, "0");
  return `0x20${hex}`;
}
