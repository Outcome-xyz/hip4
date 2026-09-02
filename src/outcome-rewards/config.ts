// ---------------------------------------------------------------------------
// Outcome rewards - configuration
//
// The endpoint is configured here, in code - never via environment
// variables. Consumers can override the base URL per call with the
// `baseUrl` option.
// ---------------------------------------------------------------------------

export const OUTCOME_REWARDS_CONFIG = {
  /**
   * Outcome liquidity-rewards payouts API base URL. Public, no auth,
   * CORS-open. Not a Monarch host - see docs/OUTCOME-REWARDS.md.
   */
  baseUrl: "https://pd-liquidity-rewards-payouts.outcome-e91.workers.dev",
} as const;
