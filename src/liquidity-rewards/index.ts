// ---------------------------------------------------------------------------
// Liquidity rewards
//
//   import { liquidityRewards } from "@outcome.xyz/hip4";
//
//   const s1 = liquidityRewards.season("s1");
//   const { eligible, builderCode } = await s1.checkEligibility({ subject: "teams" });
//   const { scores } = await s1.checkRewards({ wallet: "0x..." });
// ---------------------------------------------------------------------------

import { season } from "./season/1/wc";

export { LIQUIDITY_REWARDS_CONFIG } from "./config";
export type {
  CheckEligibilityParams,
  CheckRewardsParams,
  EligibilitySubject,
  LiquidityRewardsSeasonHandle,
  MatchesEligibility,
  RewardsCheckResult,
  TeamsEligibility,
} from "./season/1/wc";
export { season } from "./season/1/wc";
export type {
  LiquidityRewardsChampionMarket,
  LiquidityRewardsEpochStatus,
  LiquidityRewardsMatchMarket,
  LiquidityRewardsMid,
  LiquidityRewardsScore,
  LiquidityRewardsScoredOutcome,
  LiquidityRewardsSeasonId,
  LiquidityRewardsSnapshot,
} from "./types";
export { LiquidityRewardsError } from "./types";

/** Entry point for the liquidity rewards API, scoped by season. */
export const liquidityRewards = { season };
