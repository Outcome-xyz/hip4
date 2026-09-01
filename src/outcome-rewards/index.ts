// ---------------------------------------------------------------------------
// Outcome rewards
//
//   import { outcomeRewards } from "@outcome.xyz/hip4";
//
//   const totals = await outcomeRewards.programme();
//   const mine = await outcomeRewards.wallet("0x...");
//   const periods = await outcomeRewards.periods({ limit: 50 });
//   const board = await outcomeRewards.leaderboard({ limit: 10 });
// ---------------------------------------------------------------------------

import {
  fetchLeaderboard,
  fetchPeriods,
  fetchProgrammeTotals,
  fetchWalletSummary,
} from "./api";

export type { ListOptions, OutcomeRewardsRequestOptions } from "./api";
export { OUTCOME_REWARDS_CONFIG } from "./config";
export type {
  OutcomeRewardsLeaderboardEntry,
  OutcomeRewardsMarketId,
  OutcomeRewardsPeriod,
  OutcomeRewardsPeriodState,
  OutcomeRewardsPeriodType,
  OutcomeRewardsProgrammeTotals,
  OutcomeRewardStatus,
  OutcomeRewardsWalletReward,
  OutcomeRewardsWalletSummary,
} from "./types";
export { OutcomeRewardsError } from "./types";

/** Entry point for the Outcome liquidity-rewards payouts API. */
export const outcomeRewards = {
  programme: fetchProgrammeTotals,
  wallet: fetchWalletSummary,
  periods: fetchPeriods,
  leaderboard: fetchLeaderboard,
};
