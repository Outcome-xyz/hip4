// ---------------------------------------------------------------------------
// Season-scoped liquidity rewards API - season 1: World Cup 2026
//
//   liquidityRewards.season("s1").checkEligibility({ subject: "teams" })
//   liquidityRewards.season("s1").checkRewards({ wallet: "0x..." })
//
// `checkEligibility` is intentionally abstract - what is being checked is
// carried entirely by the params: the season selects the campaign (s1 =
// World Cup 2026), `subject` selects what to check ("teams" = which
// countries' winner books are eligible that day), and `date` selects the
// scoring day (defaults to the current one).
//
// `checkRewards` returns per-wallet score rows: `totalScore` is the
// provisional score (the wallet's relative share of the day's pot while
// the epoch is live), and `dailyRewardUsdc` / `cumulativeRewardUsdc` are
// the actual rewards, filled in once the epoch finalizes (once per day).
// ---------------------------------------------------------------------------

import { LIQUIDITY_REWARDS_CONFIG } from "../../../config";
import type {
  LiquidityRewardsChampionMarket,
  LiquidityRewardsEpochStatus,
  LiquidityRewardsMatchMarket,
  LiquidityRewardsScore,
  LiquidityRewardsSeasonId,
  LiquidityRewardsSnapshot,
} from "../../../types";
import type {
  MonarchDailyMatchesResponse,
  MonarchEligibleTeamsResponse,
  MonarchRequestOptions,
  MonarchScoresResponse,
} from "./monarch";
import {
  monarchGet,
  normalizeMatch,
  normalizeScore,
  normalizeSnapshot,
  normalizeTeam,
} from "./monarch";

/**
 * What to check eligibility of:
 * - `"teams"`: which countries' winner books are eligible for liquidity
 *   rewards on the scoring day (decided daily by blended-mid band).
 * - `"matches"`: which match books are inside the day's incentive window.
 */
export type EligibilitySubject = "teams" | "matches";

export type CheckEligibilityParams = MonarchRequestOptions & {
  /** What to check eligibility of. See {@link EligibilitySubject}. */
  subject: EligibilitySubject;
};

export type CheckRewardsParams = MonarchRequestOptions & {
  /** Filter score rows to one Hypercore address (case-insensitive). */
  wallet?: string;
};

type EpochBase = {
  /** Season id, e.g. "s1". */
  season: string;
  /** Upstream campaign id, e.g. "world-cup-2026". */
  campaignId: string;
  /** Scoring day this result belongs to (YYYY-MM-DD, rolls 09:00 UTC). */
  epochDate: string;
  epochStatus: LiquidityRewardsEpochStatus;
  epochStartTime: string | null;
  epochEndTime: string | null;
  snapshot: LiquidityRewardsSnapshot;
};

/** Result of `checkEligibility({ subject: "teams" })`. */
export type TeamsEligibility = EpochBase & {
  subject: "teams";
  /** Orders/trades only count toward rewards when they use this builder code. */
  builderCode: string;
  /** Winner books inside the 1%–99% eligibility band on the scoring day. */
  eligible: LiquidityRewardsChampionMarket[];
  /** Winner books outside the band - displayed but not earning. */
  ineligible: LiquidityRewardsChampionMarket[];
};

/** Result of `checkEligibility({ subject: "matches" })`. */
export type MatchesEligibility = EpochBase & {
  subject: "matches";
  /** Orders/trades only count toward rewards when they use this builder code. */
  builderCode: string;
  /** Match books eligible for daily match rewards on the scoring day. */
  eligible: LiquidityRewardsMatchMarket[];
};

/** Result of `checkRewards`. */
export type RewardsCheckResult = EpochBase & {
  /**
   * One row per (wallet, scored book). Empty for upcoming epochs - that is
   * normal "no scores yet", not an error.
   */
  scores: LiquidityRewardsScore[];
  /**
   * Total distinct participants for the epoch (every wallet that scored that
   * day), from the upstream `participants_count`. Independent of the `wallet`
   * filter, so it stays the full count even when `scores` is filtered to one
   * wallet. Falls back to the distinct-wallet count of the returned scores when
   * the upstream field is absent.
   */
  participantsCount: number;
};

/** Season-scoped handle returned by `liquidityRewards.season(id)`. */
export type LiquidityRewardsSeasonHandle = {
  readonly seasonId: string;
  readonly campaignId: string;
  /**
   * Check which markets are eligible for liquidity rewards on a scoring
   * day. Retries once on 5xx/network errors; 4xx throws
   * `LiquidityRewardsError` immediately.
   */
  checkEligibility(
    params: CheckEligibilityParams & { subject: "teams" },
  ): Promise<TeamsEligibility>;
  checkEligibility(
    params: CheckEligibilityParams & { subject: "matches" },
  ): Promise<MatchesEligibility>;
  checkEligibility(
    params: CheckEligibilityParams,
  ): Promise<TeamsEligibility | MatchesEligibility>;
  /**
   * Check a wallet's liquidity-reward scores for a scoring day:
   * provisional `totalScore` while the day is live, finalized
   * `dailyRewardUsdc` / `cumulativeRewardUsdc` once the epoch settles.
   * Omit `wallet` to get every scored wallet.
   */
  checkRewards(params?: CheckRewardsParams): Promise<RewardsCheckResult>;
};

/** Create a season-scoped handle: `season("s1").checkEligibility(...)`. */
export function season(
  seasonId: LiquidityRewardsSeasonId,
): LiquidityRewardsSeasonHandle {
  const seasons: Record<string, { campaignId: string }> =
    LIQUIDITY_REWARDS_CONFIG.seasons;
  const config = seasons[seasonId];
  if (!config) {
    throw new Error(
      `Unknown liquidity rewards season "${seasonId}". Known seasons: ${Object.keys(
        seasons,
      ).join(", ")}`,
    );
  }
  const { campaignId } = config;
  const campaignPath = `/marina/campaigns/${encodeURIComponent(campaignId)}`;

  const epochBase = (raw: {
    epoch_date: string;
    epoch_status: LiquidityRewardsEpochStatus;
    epoch_start_time?: string | null;
    epoch_end_time?: string | null;
    snapshot: Parameters<typeof normalizeSnapshot>[0];
  }): EpochBase => ({
    season: seasonId,
    campaignId,
    epochDate: raw.epoch_date,
    epochStatus: raw.epoch_status,
    epochStartTime: raw.epoch_start_time ?? null,
    epochEndTime: raw.epoch_end_time ?? null,
    snapshot: normalizeSnapshot(raw.snapshot),
  });

  const checkEligibility = async (
    params: CheckEligibilityParams,
  ): Promise<TeamsEligibility | MatchesEligibility> => {
    if (params.subject === "teams") {
      const raw = await monarchGet<MonarchEligibleTeamsResponse>(
        `${campaignPath}/eligible-teams`,
        params,
      );
      return {
        ...epochBase(raw),
        subject: "teams",
        builderCode: raw.builder_code,
        eligible: (raw.eligible_teams ?? []).map(normalizeTeam),
        ineligible: (raw.ineligible_teams ?? []).map(normalizeTeam),
      };
    }
    const raw = await monarchGet<MonarchDailyMatchesResponse>(
      `${campaignPath}/daily-matches`,
      params,
    );
    return {
      ...epochBase(raw),
      subject: "matches",
      builderCode: raw.builder_code,
      eligible: (raw.matches ?? []).map(normalizeMatch),
    };
  };

  const checkRewards = async (
    params: CheckRewardsParams = {},
  ): Promise<RewardsCheckResult> => {
    const raw = await monarchGet<MonarchScoresResponse>(
      `${campaignPath}/scores`,
      params,
    );
    let scores = (raw.scores ?? []).map(normalizeScore);
    // Prefer the server's authoritative `participants_count`. The dedup
    // fallback is only correct because `/scores` returns EVERY participant's
    // rows and the `wallet` filter below is applied CLIENT-SIDE - so `scores`
    // here still holds the full set. If `/scores` ever gains server-side wallet
    // filtering, `raw.scores` would already be narrowed and this fallback would
    // undercount; the server must then always send `participants_count` (or the
    // filter must move below this line).
    const participantsCount =
      raw.participants_count ??
      new Set(scores.map((s) => s.wallet.toLowerCase())).size;
    if (params.wallet) {
      const wallet = params.wallet.toLowerCase();
      scores = scores.filter((s) => s.wallet.toLowerCase() === wallet);
    }
    return { ...epochBase(raw), scores, participantsCount };
  };

  return {
    seasonId,
    campaignId,
    checkEligibility:
      checkEligibility as LiquidityRewardsSeasonHandle["checkEligibility"],
    checkRewards,
  };
}
