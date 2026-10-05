/** An open position in a prediction market outcome. */
export interface PredictionPosition {
  marketId: string;
  eventTitle: string;
  /** Readable event title, see `PredictionEvent.parsedTitle` */
  parsedEventTitle?: string;
  marketQuestion: string;
  /** Readable market question, see `PredictionMarket.parsedQuestion` */
  parsedMarketQuestion?: string;
  /** Coin identifier (e.g. "#90" or "#91"). Use for lookups. */
  outcome: string;
  /** Human-readable side name from sideSpecs (e.g. "Hypurr", "Yes"). Use for display. */
  outcomeName: string;
  /** Readable side name. Template sides are rendered ("template:Yes" reads "Yes"); others repeat `outcomeName`. */
  parsedOutcomeName?: string;
  shares: string;
  avgCost: string;
  /** The side's live mid price, or "0" when it has none. */
  currentPrice: string;
  /** Unrealized gain or loss at `currentPrice`. */
  unrealizedPnl: string;
  potentialPayout: string;
  eventStatus: "active" | "pending_resolution" | "resolved";
}

/** A historical account activity entry (trade, redeem, deposit, or withdrawal). */
export interface PredictionActivity {
  id: string;
  type: "trade" | "redeem" | "deposit" | "withdrawal";
  marketId?: string;
  outcome?: string;
  side?: "buy" | "sell";
  price?: string;
  size?: string;
  amount?: string;
  timestamp: number;
}

/** Current authentication state for the trading adapter. */
export interface PredictionAuthState {
  status: "disconnected" | "pending_approval" | "ready";
  address?: string;
  apiKey?: string;
}
