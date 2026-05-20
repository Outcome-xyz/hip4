/** An open position in a prediction market outcome. */
export interface PredictionPosition {
  marketId: string;
  eventTitle: string;
  marketQuestion: string;
  /** Coin identifier (e.g. "#90" or "#91"). Use for lookups. */
  outcome: string;
  /** Human-readable side name from sideSpecs (e.g. "Hypurr", "Yes"). Use for display. */
  outcomeName: string;
  shares: string;
  avgCost: string;
  currentPrice: string;
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
