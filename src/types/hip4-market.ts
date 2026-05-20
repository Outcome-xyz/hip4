// ---------------------------------------------------------------------------
// HIP-4 Market Types  - discriminated union for all market types
//
// Three market types exist on Hyperliquid HIP-4:
//   defaultBinary   - recurring price binary (structured description, Yes/No)
//   labelledBinary  - standalone with custom side names
//   multiOutcome    - grouped under a question with fallback
// ---------------------------------------------------------------------------

import type { HLOutcome, HLQuestion } from "../adapter/hyperliquid/types";

// ---------------------------------------------------------------------------
// Market type discriminant
// ---------------------------------------------------------------------------

export type MarketType = "defaultBinary" | "labelledBinary" | "multiOutcome" | "priceBucket";

// ---------------------------------------------------------------------------
// Side (shared across all types)
// ---------------------------------------------------------------------------

export interface MarketSide {
  /** Human-readable side name (e.g. "Yes", "No", "Hypurr") */
  name: string;
  /** Raw coin number: outcomeId * 10 + sideIndex */
  coinNum: number;
  /** Coin string for API calls: "#<coinNum>" */
  coin: string;
  /** Order asset field: 100_000_000 + coinNum */
  asset: number;
}

// ---------------------------------------------------------------------------
// Base market (shared fields)
// ---------------------------------------------------------------------------

export interface BaseMarket {
  type: MarketType;
  /** HL outcome ID */
  outcomeId: number;
  /** Human-readable name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Both sides with pre-computed coin/asset identifiers */
  sides: [MarketSide, MarketSide];
  /** Raw HL API response  - always attached for escape-hatch access */
  raw: HLOutcome;
}

// ---------------------------------------------------------------------------
// defaultBinary  - recurring price binary markets
// ---------------------------------------------------------------------------

export interface DefaultBinaryMarket extends BaseMarket {
  type: "defaultBinary";
  /** Underlying asset symbol (e.g. "BTC", "ETH", "HYPE") */
  underlying: string;
  /** Strike price */
  targetPrice: number;
  /** Expiry timestamp as Date (UTC) */
  expiry: Date;
  /** Period string (e.g. "15m", "1h", "1d") */
  period: string;
}

// ---------------------------------------------------------------------------
// labelledBinary  - standalone binary with custom side labels
// ---------------------------------------------------------------------------

export interface LabelledBinaryMarket extends BaseMarket {
  type: "labelledBinary";
}

// ---------------------------------------------------------------------------
// multiOutcome  - outcome grouped under a question
// ---------------------------------------------------------------------------

export interface MultiOutcomeMarket extends BaseMarket {
  type: "multiOutcome";
  /** Parent question ID */
  questionId: number;
  /** Parent question name */
  questionName: string;
  /** Parent question description */
  questionDescription: string;
  /** Whether this is the fallback ("Other") outcome */
  isFallback: boolean;
  /** Raw question from API */
  rawQuestion: HLQuestion;
}

// ---------------------------------------------------------------------------
// priceBucket  - recurring multi-bucket price markets
//
// The `class:priceBucket` tag lives on the parent QUESTION's description, not
// the outcome's. Each outcome under that question represents one bucket
// defined by adjacent priceThresholds. N thresholds → N+1 buckets, plus a
// settlement fallback outcome.
//
// Example question description:
//   class:priceBucket|underlying:BTC|expiry:20260505-1700|priceThresholds:81015.3,81258.7|period:15m
// ---------------------------------------------------------------------------

export interface PriceBucketMarket extends BaseMarket {
  type: "priceBucket";
  /** Underlying asset symbol (e.g. "BTC") */
  underlying: string;
  /** Expiry timestamp as Date (UTC) */
  expiry: Date;
  /** Sorted ascending price thresholds. N thresholds → N+1 buckets. */
  priceThresholds: number[];
  /** Period string (e.g. "15m", "1h", "1d") */
  period: string;
  /** Parent question ID */
  questionId: number;
  /** Parent question name */
  questionName: string;
  /** Parent question description (the raw priceBucket spec) */
  questionDescription: string;
  /** Whether this is the settlement fallback outcome */
  isFallback: boolean;
  /**
   * Index of this bucket within the question's namedOutcomes array.
   * -1 when this is the fallback outcome.
   */
  bucketIndex: number;
  /** Lower bound of this bucket (inclusive). null = unbounded below. */
  lowerBound: number | null;
  /** Upper bound of this bucket (exclusive). null = unbounded above. */
  upperBound: number | null;
  /** Raw question from API */
  rawQuestion: HLQuestion;
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type HIP4Market =
  | DefaultBinaryMarket
  | LabelledBinaryMarket
  | MultiOutcomeMarket
  | PriceBucketMarket;

// ---------------------------------------------------------------------------
// fetchMarkets params
// ---------------------------------------------------------------------------

export interface FetchMarketsParams {
  /** Filter to a specific market type */
  type?: MarketType;
  /** Sort order. Default: "newest" */
  sortBy?: "volume" | "expiry" | "newest";
  /** Group results by key */
  groupBy?: "type" | "question";
  /** Max results (after filtering). Default: 100 */
  limit?: number;
  /** Offset for pagination. Default: 0 */
  offset?: number;
}

/** Result when groupBy is "type" */
export type MarketsByType = Partial<Record<MarketType, HIP4Market[]>>;

/** Result when groupBy is "question"  - keyed by questionId or "standalone" */
export type MarketsByQuestion = Record<string, HIP4Market[]>;

/** Return type varies based on groupBy */
export type FetchMarketsResult<T extends FetchMarketsParams> =
  T extends { groupBy: "type" } ? MarketsByType :
  T extends { groupBy: "question" } ? MarketsByQuestion :
  HIP4Market[];
