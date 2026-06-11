// ---------------------------------------------------------------------------
// Monarch rewards API access (raw snake_case shapes + normalizers)
//
// The Monarch API is public (no auth). Requests retry once on 5xx/network
// errors, matching HIP4Client semantics; 4xx throws immediately.
// ---------------------------------------------------------------------------

import { LIQUIDITY_REWARDS_CONFIG } from "../../../config";
import type {
  LiquidityRewardsChampionMarket,
  LiquidityRewardsMatchMarket,
  LiquidityRewardsScore,
  LiquidityRewardsSnapshot,
} from "../../../types";
import { LiquidityRewardsError } from "../../../types";

// -- Raw Monarch responses ----------------------------------------------------

type MonarchSnapshot = {
  status: "preview" | "live" | "final";
  as_of: string | null;
  finalized_at: string | null;
};

type MonarchEpochBase = {
  campaign_id: string;
  epoch_date: string;
  epoch_status: "upcoming" | "provisional" | "final";
  epoch_start_time?: string | null;
  epoch_end_time?: string | null;
  snapshot: MonarchSnapshot;
};

// Observed live: teams may carry only team_name + hyperliquid_outcome_id;
// eligibility_mid and mids are omitted despite the docs showing them.
type MonarchTeam = {
  team_name: string;
  hyperliquid_outcome_id: number;
  eligibility_mid?: string | null;
  mids?: Array<{ source: string; mid: string }> | null;
};

export type MonarchEligibleTeamsResponse = MonarchEpochBase & {
  builder_code: string;
  eligible_teams?: MonarchTeam[];
  ineligible_teams?: MonarchTeam[];
};

type MonarchMatch = {
  match_id: string;
  hyperliquid_question_id: number;
  match_name: string;
  scheduled_kickoff_time: string;
  incentive_start_time: string;
  incentive_end_rule: string;
  match_reward_amount_usdc: string;
  live_multiplier: string;
  publication_status: "published" | "unpublished";
  scored_outcomes?: Array<{
    outcome_name: string;
    hyperliquid_outcome_id: number;
  }> | null;
};

export type MonarchDailyMatchesResponse = MonarchEpochBase & {
  builder_code: string;
  matches?: MonarchMatch[];
};

type MonarchScore = {
  score_scope: "champion" | "match";
  wallet: string;
  hyperliquid_outcome_id: number;
  team_name?: string;
  team_scoring_weight?: string;
  match_id?: string;
  hyperliquid_question_id?: number;
  match_name?: string;
  outcome_name?: string;
  quote_depth_score: string;
  maker_fill_volume_usdc: string;
  taker_fill_volume_usdc: string;
  total_score: string;
  daily_reward_usdc: string | null;
  cumulative_reward_usdc: string | null;
};

export type MonarchScoresResponse = MonarchEpochBase & {
  scores?: MonarchScore[];
};

// -- Fetch with retry-once semantics -------------------------------------------

export type MonarchRequestOptions = {
  /** Scoring day (YYYY-MM-DD). Omitted = current epoch. */
  date?: string;
  /** Override the Monarch base URL from the config file. */
  baseUrl?: string;
  /** Abort signal. Defaults to a 15s timeout. */
  signal?: AbortSignal;
};

export async function monarchGet<T>(
  path: string,
  options: MonarchRequestOptions,
): Promise<T> {
  try {
    return await doGet<T>(path, options);
  } catch (err) {
    // Only retry on 5xx or network errors, not 4xx
    if (
      err instanceof LiquidityRewardsError &&
      err.status >= 400 &&
      err.status < 500
    )
      throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return doGet<T>(path, options);
  }
}

async function doGet<T>(
  path: string,
  options: MonarchRequestOptions,
): Promise<T> {
  const base = (
    options.baseUrl ?? LIQUIDITY_REWARDS_CONFIG.monarchBaseUrl
  ).replace(/\/$/, "");
  const query = options.date
    ? `?epoch_date=${encodeURIComponent(options.date)}`
    : "";
  const res = await fetch(`${base}${path}${query}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: options.signal ?? AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new LiquidityRewardsError(
      res.status,
      `Rewards API responded with ${res.status}: ${res.statusText}`,
    );
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new LiquidityRewardsError(
      res.status,
      "Rewards API returned non-JSON response",
    );
  }
}

// -- Normalizers (snake_case -> camelCase) -------------------------------------

export function normalizeSnapshot(
  raw: MonarchSnapshot,
): LiquidityRewardsSnapshot {
  return {
    status: raw.status,
    asOf: raw.as_of,
    finalizedAt: raw.finalized_at,
  };
}

export function normalizeTeam(
  raw: MonarchTeam,
): LiquidityRewardsChampionMarket {
  return {
    teamName: raw.team_name,
    hyperliquidOutcomeId: raw.hyperliquid_outcome_id,
    eligibilityMid: raw.eligibility_mid ?? undefined,
    mids: (raw.mids ?? []).map((m) => ({ source: m.source, mid: m.mid })),
  };
}

export function normalizeMatch(
  raw: MonarchMatch,
): LiquidityRewardsMatchMarket {
  return {
    matchId: raw.match_id,
    hyperliquidQuestionId: raw.hyperliquid_question_id,
    matchName: raw.match_name,
    scheduledKickoffTime: raw.scheduled_kickoff_time,
    incentiveStartTime: raw.incentive_start_time,
    incentiveEndRule: raw.incentive_end_rule,
    matchRewardAmountUsdc: raw.match_reward_amount_usdc,
    liveMultiplier: raw.live_multiplier,
    publicationStatus: raw.publication_status,
    scoredOutcomes: (raw.scored_outcomes ?? []).map((o) => ({
      outcomeName: o.outcome_name,
      hyperliquidOutcomeId: o.hyperliquid_outcome_id,
    })),
  };
}

export function normalizeScore(raw: MonarchScore): LiquidityRewardsScore {
  return {
    scoreScope: raw.score_scope,
    wallet: raw.wallet,
    hyperliquidOutcomeId: raw.hyperliquid_outcome_id,
    teamName: raw.team_name,
    teamScoringWeight: raw.team_scoring_weight,
    matchId: raw.match_id,
    hyperliquidQuestionId: raw.hyperliquid_question_id,
    matchName: raw.match_name,
    outcomeName: raw.outcome_name,
    quoteDepthScore: raw.quote_depth_score,
    makerFillVolumeUsdc: raw.maker_fill_volume_usdc,
    takerFillVolumeUsdc: raw.taker_fill_volume_usdc,
    totalScore: raw.total_score,
    dailyRewardUsdc: raw.daily_reward_usdc,
    cumulativeRewardUsdc: raw.cumulative_reward_usdc,
  };
}
