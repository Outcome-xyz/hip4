/** Parameters for placing a prediction market order. */
export interface PredictionOrderParams {
  marketId: string;
  outcome: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  /** Required for limit orders. */
  price?: string;
  amount: string;
  timeInForce?: "GTC" | "GTD" | "FOK" | "FAK" | "ALO";
  expiration?: string;
  /**
   * Mark price of the coin (0-1), used for minimum notional validation.
   * When provided, getMinShares(markPx) is enforced before submission.
   */
  markPx?: number;
  /**
   * Builder address for referral fees.
   * Will be lowercased  - checksummed addresses are accepted.
   */
  builderAddress?: string;
  /**
   * Builder fee in tenths of a basis point.
   * 0 = no fee. 100 = 0.1%. 1000 = 1.0% (maximum).
   */
  builderFee?: number;
  /**
   * When true, skips the SDK's local minimum-notional and minimum-shares
   * pre-checks. Use for position-closing flows (close, close-all) where
   * the residual notional may be under $10 but Hyperliquid still accepts
   * the order.
   */
  skipMinNotionalCheck?: boolean;
}

/** Result returned by placeOrder. Never throws. Check success/error fields. */
export interface PredictionOrderResult {
  success: boolean;
  orderId?: string;
  status?: string;
  shares?: string;
  error?: string;
}

/** Result returned by placeOrders (batch). One entry per input order, index-matched. */
export interface PredictionBatchOrderResult {
  /** True when every individual order succeeded. */
  success: boolean;
  /** Per-order results, indexed to match the input params array. */
  results: PredictionOrderResult[];
}

/** Parameters for cancelling a resting order. */
export interface PredictionCancelParams {
  marketId: string;
  orderId: string;
  /** Optional outcome identifier (e.g. "#5160") to resolve the correct side asset ID. */
  outcome?: string;
}

/**
 * Parameters for modifying an existing resting order. Hyperliquid preserves
 * queue priority when only the size is changed; price changes move the order
 * to the back of the queue at the new level.
 *
 * Note: HL's modify endpoint only accepts resting limit orders (market orders
 * never rest). `type` is locked to "limit" accordingly.
 */
export interface PredictionModifyParams {
  marketId: string;
  outcome: string;
  orderId: string;
  side: "buy" | "sell";
  type: "limit";
  price: string;
  amount: string;
  timeInForce?: "GTC" | "GTD" | "FOK" | "FAK" | "ALO";
  markPx?: number;
}
