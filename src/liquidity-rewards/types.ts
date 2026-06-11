// ---------------------------------------------------------------------------
// Liquidity rewards - shared types
//
// Eligibility and rewards are keyed by "season" (s1 = the World Cup 2026
// campaign). Data comes from the Monarch rewards API (public, no auth),
// normalized to camelCase by this module. Season -> campaign mapping lives
// in ./config.ts.
// ---------------------------------------------------------------------------

/** Known reward seasons. s1 = World Cup 2026. Open for future seasons. */
export type LiquidityRewardsSeasonId = "s1" | (string & {});

export type LiquidityRewardsEpochStatus = "upcoming" | "provisional" | "final";

export type LiquidityRewardsSnapshot = {
  status: "preview" | "live" | "final";
  asOf: string | null;
  finalizedAt: string | null;
};

/** Per-source mid used in the eligibility cutoff calculation. */
export type LiquidityRewardsMid = {
  /** Price source, e.g. "polymarket", "kalshi", "hyperliquid". */
  source: string;
  /** Decimal probability string, e.g. "0.16150". */
  mid: string;
};

/** Champion (winner-market) book, with its daily eligibility inputs. */
export type LiquidityRewardsChampionMarket = {
  teamName: string;
  /** Outcome id from Hyperliquid outcomeMeta. */
  hyperliquidOutcomeId: number;
  /**
   * Blended cutoff mid used to decide eligibility (1%–99% band).
   * The API does not always include it.
   */
  eligibilityMid?: string;
  /** Source mids behind the cutoff. Empty when the API omits them. */
  mids: LiquidityRewardsMid[];
};

/** Scored YES book belonging to a match market. */
export type LiquidityRewardsScoredOutcome = {
  outcomeName: string;
  /** Outcome id from Hyperliquid outcomeMeta. */
  hyperliquidOutcomeId: number;
};

/** Match market eligible for daily match rewards. */
export type LiquidityRewardsMatchMarket = {
  matchId: string;
  /** Question id from Hyperliquid outcomeMeta. */
  hyperliquidQuestionId: number;
  matchName: string;
  scheduledKickoffTime: string;
  /** Time when orders and trades start scoring for the match. */
  incentiveStartTime: string;
  incentiveEndRule: string;
  /** Total reward amount assigned to the match, decimal USDC string. */
  matchRewardAmountUsdc: string;
  /** Score multiplier during the live match window, decimal string. */
  liveMultiplier: string;
  publicationStatus: "published" | "unpublished";
  scoredOutcomes: LiquidityRewardsScoredOutcome[];
};

/** One score row per (wallet, scored book) from `checkRewards`. */
export type LiquidityRewardsScore = {
  /** "champion" for World Cup winner books, "match" for daily match books. */
  scoreScope: "champion" | "match";
  /** Hypercore address being scored. */
  wallet: string;
  /** Outcome id from Hyperliquid outcomeMeta. */
  hyperliquidOutcomeId: number;
  /** Champion rows only. */
  teamName?: string;
  /** Normalized team scoring weight; champion rows only. */
  teamScoringWeight?: string;
  /** Match rows only. */
  matchId?: string;
  hyperliquidQuestionId?: number;
  matchName?: string;
  /** Scored YES outcome label; match rows only. */
  outcomeName?: string;
  quoteDepthScore: string;
  makerFillVolumeUsdc: string;
  takerFillVolumeUsdc: string;
  /**
   * The wallet's provisional score for the day - its relative share of the
   * day's pot while `epochStatus` is "provisional".
   */
  totalScore: string;
  /** Final reward for the day; null until the epoch is finalized (once daily). */
  dailyRewardUsdc: string | null;
  /** Total earned through this epoch; null until finalized. */
  cumulativeRewardUsdc: string | null;
};

/** Typed error carrying the HTTP status from the rewards API. */
export class LiquidityRewardsError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LiquidityRewardsError";
  }
}
