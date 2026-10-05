/** Snapshot of the order book for one side of a prediction market. */
export interface PredictionOrderBook {
  marketId: string;
  bids: PredictionOrderBookLevel[];
  asks: PredictionOrderBookLevel[];
  timestamp: number;
}

/** A single price level in the order book. */
export interface PredictionOrderBookLevel {
  price: string;
  size: string;
}

/** A filled trade on a prediction market. */
export interface PredictionTrade {
  id: string;
  marketId: string;
  outcome: string;
  side: "buy" | "sell";
  price: string;
  size: string;
  timestamp: number;
}

/** Current price information for both sides of a prediction market. */
export interface PredictionPrice {
  marketId: string;
  /** Price data for each side. `name` is the side name sent on chain (for example "Yes" or "template:Yes"), or "Side 0"/"Side 1" when the side names are not known. `parsedName` is the rendered name. */
  outcomes: Array<{
    name: string;
    /** Readable side name. Template sides are rendered ("template:Yes" reads "Yes"); others repeat `name`. */
    parsedName?: string;
    price: string;
    midpoint: string;
  }>;
  timestamp: number;
}
