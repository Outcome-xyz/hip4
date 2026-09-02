// ---------------------------------------------------------------------------
// Outcome rewards - shared types
//
// A read of what the Outcome Markets liquidity-rewards programme has paid:
// programme-wide totals, one wallet's earnings, the reward periods behind
// them, and a leaderboard. Data comes from a public, unauthenticated,
// CORS-open read API (not Monarch directly - see docs/OUTCOME-REWARDS.md),
// normalized to camelCase by this module.
// ---------------------------------------------------------------------------

/** `Q<number>` for a grouped question, `O<number>` for a standalone outcome. */
export type OutcomeRewardsMarketId = string;

/**
 * A reward row's payment state. Only `"sent"` has been observed live; the
 * upstream API's own docs describe awarded-but-unsent states (dust below
 * the minimum payout, operator-dismissed rows) that may surface other
 * values here - treat this as an open string, not an exhaustive union.
 */
export type OutcomeRewardStatus = string;

/** Exhaustive per the upstream docs: a reward period is unpaid, partially
 * paid (some wallets sent, others not), or fully paid. */
export type OutcomeRewardsPeriodState = "unpaid" | "partial" | "paid";

export type OutcomeRewardsPeriodType = "market" | "epoch";

/** `paidUsdc` + `payments` over a trailing window */
export type OutcomeRewardsWindowTotals = {
  paidUsdc: string;
  payments: number;
};

/** {@link OutcomeRewardsWindowTotals} plus the distinct-wallet count for the window. */
export type OutcomeRewardsTodayTotals = OutcomeRewardsWindowTotals & {
  wallets: number;
};

/** Programme-wide totals from `outcomeRewards.programme()`. */
export type OutcomeRewardsProgrammeTotals = {
  /** USDC actually transferred to wallets so far. */
  paidUsdc: string;
  /** USDC Monarch has finalized and owes, not yet swept to wallets. */
  pendingUsdc: string;
  /**
   * `paidUsdc + pendingUsdc` - excludes dust below the minimum payout and
   * rows an operator dismissed, which were awarded and deliberately never
   * sent.
   */
  awardedUsdc: string;
  payments: number;
  wallets: number;
  rewardPeriods: number;
  lastPaidAt: string | null;
  /** Rolling trailing-24-hour totals. */
  last24h: OutcomeRewardsWindowTotals;
  /** Totals since the current UTC day began. */
  today: OutcomeRewardsTodayTotals;
};

/** One (wallet, reward period) row from `outcomeRewards.wallet(address)`. */
export type OutcomeRewardsWalletReward = {
  marketId: OutcomeRewardsMarketId;
  /** UTC date for an epoch reward period, `null` for a full-market one. */
  epochEndDate: string | null;
  marketName: string;
  rewardUsdc: string;
  status: OutcomeRewardStatus;
  /** `null` until the reward is actually transferred. */
  txHash: string | null;
  /** `null` until the reward is actually transferred. */
  paidAt: string | null;
};

/**
 * Result of `outcomeRewards.wallet(address)`. An address with no rewards
 * returns zeroes and an empty `rewards` list, not an error.
 */
export type OutcomeRewardsWalletSummary = {
  wallet: string;
  paidUsdc: string;
  pendingUsdc: string;
  awardedUsdc: string;
  payments: number;
  rewards: OutcomeRewardsWalletReward[];
};

/** One finalized reward period from `outcomeRewards.periods()`. */
export type OutcomeRewardsPeriod = {
  marketId: OutcomeRewardsMarketId;
  epochEndDate: string | null;
  marketName: string;
  periodType: OutcomeRewardsPeriodType;
  finalizedAt: string;
  awardedUsdc: string;
  paidUsdc: string;
  wallets: number;
  payments: number;
  state: OutcomeRewardsPeriodState;
};

/** One row from `outcomeRewards.leaderboard()`. Ranked by USDC actually
 * paid, not awarded - a rank never changes without a real payment. */
export type OutcomeRewardsLeaderboardEntry = {
  rank: number;
  wallet: string;
  paidUsdc: string;
  payments: number;
  rewardPeriods: number;
};

/**
 * Typed error carrying the HTTP status and, when the upstream body included
 * one, its machine-readable `code` (e.g. `"bad-request"`).
 */
export class OutcomeRewardsError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "OutcomeRewardsError";
  }
}
