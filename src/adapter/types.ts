import type {
  PredictionActivity,
  PredictionAuthState,
  PredictionPosition,
} from "../types/account";
import type { PredictionCategory, PredictionEvent } from "../types/event";
import type {
  FetchMarketsParams,
  HIP4Market,
  MarketsByQuestion,
  MarketsByType,
} from "../types/hip4-market";
import type {
  PredictionOrderBook,
  PredictionPrice,
  PredictionTrade,
} from "../types/market";
import type {
  PredictionBatchOrderResult,
  PredictionCancelParams,
  PredictionModifyParams,
  PredictionOrderParams,
  PredictionOrderResult,
} from "../types/trading";
import type {
  HLCancelResponse,
  HLWsActivePerpAssetCtxData,
  HLWsActiveSpotAssetCtxData,
  HLWsAllMidsData,
  HLWsSpotAssetCtxsData,
} from "./hyperliquid/types";

/** Callback returned by subscribe methods; call it to unsubscribe. */
export type Unsubscribe = () => void;

/** Top-level adapter that groups all prediction-market sub-adapters. */
export interface PredictionsAdapter {
  readonly id: string;
  readonly name: string;

  readonly events: PredictionEventAdapter;
  readonly marketData: PredictionMarketDataAdapter;
  readonly account: PredictionAccountAdapter;
  readonly trading: PredictionTradingAdapter;
  readonly auth: PredictionAuthAdapter;
  readonly wallet: PredictionWalletAdapter;

  /** Initialize connections and internal state. Must be called before use. */
  initialize(): Promise<void>;
  /** Tear down connections and clean up subscriptions. */
  destroy(): void;
}

export interface PredictionEventAdapter {
  /** List events with optional filters (category, active, limit, offset, query). */
  fetchEvents(params?: {
    category?: string;
    active?: boolean;
    limit?: number;
    offset?: number;
    query?: string;
  }): Promise<PredictionEvent[]>;
  /** Fetch a single event by ID. IDs are "q<n>" for questions, "o<n>" for standalone outcomes. */
  fetchEvent(eventId: string): Promise<PredictionEvent>;
  /** List available categories (e.g. "custom", "recurring"). */
  fetchCategories(): Promise<PredictionCategory[]>;
  /** Fetch typed HIP-4 markets with optional type filtering, grouping, and pagination. */
  fetchMarkets(
    params?: FetchMarketsParams,
  ): Promise<HIP4Market[] | MarketsByType | MarketsByQuestion>;
}

export interface PredictionMarketDataAdapter {
  /** Fetch the order book for a market. marketId is the outcome ID as string; sideIndex defaults to 0 (Yes). */
  fetchOrderBook(
    marketId: string,
    sideIndex?: number,
  ): Promise<PredictionOrderBook>;
  /** Fetch the current price for both sides of a market. Names are generic ("Side 0"/"Side 1") - use event.markets[].outcomes[].name for real names. */
  fetchPrice(marketId: string): Promise<PredictionPrice>;
  /** Fetch recent trades for a market. */
  fetchTrades(marketId: string, limit?: number): Promise<PredictionTrade[]>;
  /** Fetch OHLCV candles for a market. Defaults to 1h interval, 14 days lookback. */
  fetchCandles(
    marketId: string,
    interval?: string,
    startTime?: number,
    endTime?: number,
  ): Promise<
    Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>
  >;

  /** Subscribe to real-time order book updates. Returns an unsubscribe callback. */
  subscribeOrderBook(
    marketId: string,
    onData: (book: PredictionOrderBook) => void,
  ): Unsubscribe;
  /** Subscribe to real-time price updates. Returns an unsubscribe callback. */
  subscribePrice(
    marketId: string,
    onData: (price: PredictionPrice) => void,
  ): Unsubscribe;
  /** Subscribe to real-time trade updates. Returns an unsubscribe callback. */
  subscribeTrades(
    marketId: string,
    onData: (trade: PredictionTrade) => void,
  ): Unsubscribe;
  /** Subscribe to all mid-price updates across every market. Returns an unsubscribe callback. */
  subscribeAllMids(onData: (data: HLWsAllMidsData) => void): Unsubscribe;
  /** Subscribe to real-time asset context (volume, OI, mark price) for a spot coin. Returns an unsubscribe callback. */
  subscribeActiveAssetCtx(
    coin: string,
    onData: (data: HLWsActiveSpotAssetCtxData) => void,
  ): Unsubscribe;
  /** Subscribe to bulk spot asset context updates for all spot coins. Returns an unsubscribe callback. */
  subscribeSpotAssetCtxs(
    onData: (data: HLWsSpotAssetCtxsData) => void,
  ): Unsubscribe;
  /** Subscribe to real-time perp asset context (mark price, oracle, funding) for a perp coin. Returns an unsubscribe callback. */
  subscribePerpAssetCtx(
    coin: string,
    onData: (data: HLWsActivePerpAssetCtxData) => void,
  ): Unsubscribe;
}

export interface PredictionAccountAdapter {
  /** Fetch all open positions for an address. */
  fetchPositions(address: string): Promise<PredictionPosition[]>;
  /** Fetch account activity (trades, redeems, deposits, withdrawals) for an address. */
  fetchActivity(address: string): Promise<PredictionActivity[]>;
  /** Fetch raw spot balances (including USDH) for an address. */
  fetchBalance(
    address: string,
  ): Promise<Array<{ coin: string; total: string; hold: string }>>;
  /** Fetch resting limit orders from frontendOpenOrders for an address. */
  fetchOpenOrders(address: string): Promise<
    Array<{
      coin: string;
      side: "B" | "A";
      limitPx: string;
      sz: string;
      oid: number;
      timestamp: number;
    }>
  >;
  /** Subscribe to position changes. Polls at 10s interval (no WS channel for spot). */
  subscribePositions(
    address: string,
    onData: (positions: PredictionPosition[]) => void,
  ): Unsubscribe;
}

export interface PredictionTradingAdapter {
  /** Place a market or limit order. Returns { success, orderId?, status?, shares?, error? }. Never throws. */
  placeOrder(params: PredictionOrderParams): Promise<PredictionOrderResult>;
  /** Place multiple orders in a single batched request. Never throws. */
  placeOrders(
    params: PredictionOrderParams[],
  ): Promise<PredictionBatchOrderResult>;
  /** Cancel one or more resting orders in a single request. */
  cancelOrder(params: PredictionCancelParams[]): Promise<HLCancelResponse>;
  /**
   * Modify a resting order (price and/or size). Preserves queue priority
   * when only size changes. Returns the same shape as placeOrder so the
   * result carries the (potentially new) order id. Never throws.
   */
  modifyOrder(params: PredictionModifyParams): Promise<PredictionOrderResult>;
}

export interface PredictionAuthAdapter {
  /** Initialize auth with a wallet. Accepts a viem PrivateKeyAccount or ethers Signer. */
  initAuth(
    walletAddress: string,
    signer: unknown,
  ): Promise<PredictionAuthState>;
  /** Return the current authentication state. */
  getAuthStatus(): PredictionAuthState;
  /** Clear stored auth credentials and reset state to disconnected. */
  clearAuth(): void;
}

export interface WalletActionResult {
  success: boolean;
  error?: string;
  filledSz?: string;
  avgPx?: string;
  /**
   * Order id of the resulting fill (set only on `success: true` for actions
   * that produce a fill - `buyUsdh`, `sellUsdh`, etc). Callers use this to
   * look up the realized fee in `userFills` / `userFillsByTime`, since the
   * synchronous order ack does not carry fee.
   */
  oid?: number;
}

export interface PredictionWalletAdapter {
  /** Set the user's wallet signer for EIP-712 operations (transfers, withdrawals). */
  setSigner(
    signer:
      | {
          address: string;
          signTypedData: (...args: unknown[]) => Promise<string>;
        }
      | unknown,
  ): void;
  /** Buy USDH on the spot market. Uses L1 agent signing. */
  buyUsdh(amount: string): Promise<WalletActionResult>;
  /** Sell USDH on the spot market. Uses L1 agent signing. */
  sellUsdh(amount: string): Promise<WalletActionResult>;
  /** Transfer USDC from Perp to Spot account. */
  transferToSpot(amount: string): Promise<WalletActionResult>;
  /** Transfer USDC from Spot to Perp account. */
  transferToPerps(amount: string): Promise<WalletActionResult>;
  /** Withdraw USDC to an external address. */
  withdraw(params: {
    destination: string;
    amount: string;
  }): Promise<WalletActionResult>;
  /** Send USDC to another Hyperliquid address. */
  usdSend(params: {
    destination: string;
    amount: string;
  }): Promise<WalletActionResult>;
}
