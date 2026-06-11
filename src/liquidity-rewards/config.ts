// ---------------------------------------------------------------------------
// Liquidity rewards - configuration
//
// All liquidity-rewards endpoints and season mappings are configured here,
// in code - never via environment variables. Consumers can override the
// base URL per call with the `baseUrl` option.
// ---------------------------------------------------------------------------

export const LIQUIDITY_REWARDS_CONFIG = {
  /** Monarch rewards API base URL. Public, no auth. */
  monarchBaseUrl: "https://api.monarch.fast",
  /** Season registry: SDK season ids -> upstream campaign ids. */
  seasons: {
    /** Season 1: World Cup 2026 (Jun 11 - Jul 19). */
    s1: { campaignId: "world-cup-2026" },
  },
} as const;
