/** A prediction event containing one or more markets. */
export interface PredictionEvent {
  /** Unique event ID (e.g. "q123" for questions, "o456" for standalone outcomes). */
  id: string;
  title: string;
  /** Readable title. Template markets are rendered from the `outcomeTemplates` registry; others repeat `title`. */
  parsedTitle?: string;
  description: string;
  category: string;
  markets: PredictionMarket[];
  /** Cumulative volume across all markets in the event. */
  totalVolume: string;
  endDate: string;
  status: PredictionEventStatus;
  imageUrl?: string;
  resolutionSource?: string;
}

export type PredictionEventStatus =
  | "active"
  | "pending_resolution"
  | "resolved"
  | "cancelled";

/** A single market (question) within a prediction event. */
export interface PredictionMarket {
  id: string;
  eventId: string;
  question: string;
  /** Readable question, rendered like `PredictionEvent.parsedTitle` */
  parsedQuestion?: string;
  outcomes: PredictionOutcome[];
  volume: string;
  liquidity: string;
  /** True if this market uses neg-risk framing. */
  isNegRisk?: boolean;
}

/** One side of a prediction market (e.g. "Yes" or "No"). */
export interface PredictionOutcome {
  name: string;
  /** Readable name. Template sides are rendered ("template:Yes" reads "Yes"); others repeat `name`. */
  parsedName?: string;
  /** The spot token ID used for trading this outcome. */
  tokenId: string;
  /** Current price as a decimal string (0-1). */
  price: string;
}

/** A category used to group prediction events. */
export interface PredictionCategory {
  id: string;
  name: string;
  slug: string;
}
