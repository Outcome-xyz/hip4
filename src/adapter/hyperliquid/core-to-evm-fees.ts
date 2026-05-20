// ---------------------------------------------------------------------------
// Core → HyperEVM transfer fee estimator
//
// HL docs (verbatim): "A transfer from HyperCore to HyperEVM costs 200k gas
// at the base gas price of the next HyperEVM block."
//
// Empirically confirmed byte-for-byte on testnet via `sendAsset`:
//   fee_usd = CORE_TO_EVM_GAS_LIMIT × baseFeeWei × hypeSpotMarkPx_usd / 1e18
//
// Debit currency hierarchy (confirmed empirically):
//   1. Core spot HYPE if balance ≥ fee_hype → debited in HYPE directly
//      (formula collapses to `gasLimit × baseFeeWei / 1e18`, no price needed)
//   2. Otherwise → debited in the source token at fee_usd / sourceTokenPrice
//
// The helper is pure. RPC plumbing (feeHistory + spot markPx fetch) is the
// caller's job - inject the values once resolved. This keeps the core
// formula hermetic and unit-testable without network.
// ---------------------------------------------------------------------------

/** HL-canonical gas budget for Core→HyperEVM system-tx credit. Fixed, from
 *  the docs. Over/under-provisioning at the action level is not applicable
 *  - the protocol uses exactly this value. */
export const CORE_TO_EVM_GAS_LIMIT = 200_000n;

export interface CoreToEvmFeeInputs {
  /** HyperEVM block baseFee in wei. Prefer a median-over-history sample
   *  (`medianBaseFeeWei`) to stay robust against single-block MEV spikes. */
  readonly baseFeeWei: bigint;
  /** User's HYPE balance on HL Core spot, as a decimal number. */
  readonly hypeCoreSpotBalance: number;
  /** HYPE/USDC spot `markPx` in USD. Source: HL info endpoint,
   *  `{"type":"spotMetaAndAssetCtxs"}`, pair `@107` mainnet / `@1035` testnet.
   *  Using midPx or perp mark diverges from HL's actual debit. */
  readonly hypeSpotMarkPxUsd: number;
  /** USD price of the token being sent (USDH ≈ 1.0). Used only in the
   *  source-token fallback path - ignored when the user has HYPE. */
  readonly sourceTokenPriceUsd: number;
}

export interface CoreToEvmFeeBreakdown {
  /** Which balance HL will actually debit. */
  readonly currency: "HYPE" | "source";
  /** Fee amount if debited in HYPE. Zero in the source-token path. */
  readonly amountHype: number;
  /** Fee amount if debited in the source token. Zero in the HYPE path. */
  readonly amountSourceToken: number;
  /** USD-equivalent of the fee. Identical between both paths. */
  readonly usd: number;
  /** Echoed back for UI tooltips / audit. */
  readonly gasLimit: bigint;
  readonly baseFeeWei: bigint;
}

/**
 * Estimate the Core→HyperEVM transfer fee and which balance will be debited.
 *
 * Pure, synchronous. Call once per quote with freshly-fetched inputs.
 */
export function estimateCoreToEvmFee(
  inputs: CoreToEvmFeeInputs,
): CoreToEvmFeeBreakdown {
  if (inputs.hypeCoreSpotBalance < 0) {
    throw new Error(
      `hypeCoreSpotBalance must be non-negative, got ${inputs.hypeCoreSpotBalance}`,
    );
  }
  if (inputs.sourceTokenPriceUsd <= 0) {
    throw new Error(
      `sourceTokenPriceUsd must be positive, got ${inputs.sourceTokenPriceUsd}`,
    );
  }
  if (inputs.hypeSpotMarkPxUsd <= 0) {
    throw new Error(
      `hypeSpotMarkPxUsd must be positive, got ${inputs.hypeSpotMarkPxUsd}`,
    );
  }

  const zeroBase: CoreToEvmFeeBreakdown = {
    currency: "source",
    amountHype: 0,
    amountSourceToken: 0,
    usd: 0,
    gasLimit: CORE_TO_EVM_GAS_LIMIT,
    baseFeeWei: inputs.baseFeeWei,
  };
  if (inputs.baseFeeWei <= 0n) return zeroBase;

  // Stay in the bigint domain as long as possible to avoid precision loss on
  // gas × baseFee. Realistic product is ~10^13 wei - safe JS integer range
  // after dividing to gwei (/ 1e9).
  const gasWei = CORE_TO_EVM_GAS_LIMIT * inputs.baseFeeWei;
  const gasGwei = Number(gasWei / 1_000_000_000n);
  const feeHype = gasGwei / 1e9;
  const feeUsd = feeHype * inputs.hypeSpotMarkPxUsd;

  if (inputs.hypeCoreSpotBalance >= feeHype) {
    return {
      currency: "HYPE",
      amountHype: feeHype,
      amountSourceToken: 0,
      usd: feeUsd,
      gasLimit: CORE_TO_EVM_GAS_LIMIT,
      baseFeeWei: inputs.baseFeeWei,
    };
  }

  return {
    currency: "source",
    amountHype: 0,
    amountSourceToken: feeUsd / inputs.sourceTokenPriceUsd,
    usd: feeUsd,
    gasLimit: CORE_TO_EVM_GAS_LIMIT,
    baseFeeWei: inputs.baseFeeWei,
  };
}

/**
 * Median over an `eth_feeHistory` baseFee sample.
 *
 * Why median, not max: a single MEV-saturated block can spike baseFee briefly
 * before mean-reverting under EIP-1559's 12.5%-per-block decay. `max` lets
 * one outlier dominate the UI quote; `median` is robust in both directions
 * while still tracking genuine trends over a few blocks' lag.
 *
 * Why not a safety multiplier on top: the fee we display is the fee the
 * user pays. Padding the display hides the true accounting - users compare
 * UI fee vs ledger debit and notice. Accuracy over pessimism.
 */
export function medianBaseFeeWei(samples: readonly bigint[]): bigint {
  if (samples.length === 0) {
    throw new Error("medianBaseFeeWei: empty sample array");
  }
  for (const s of samples) {
    if (s < 0n) {
      throw new Error(
        `medianBaseFeeWei: non-negative values required, got ${s}`,
      );
    }
  }
  const sorted = [...samples].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) {
    return sorted[mid] as bigint;
  }
  const a = sorted[mid - 1] as bigint;
  const b = sorted[mid] as bigint;
  return (a + b) / 2n;
}
