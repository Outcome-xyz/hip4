// ---------------------------------------------------------------------------
// Raw Hyperliquid HIP-4 API response types - reverse-engineered from testnet
// ---------------------------------------------------------------------------

// -- outcomeMeta --------------------------------------------------------------

export interface HLOutcomeMeta {
  outcomes: HLOutcome[];
  questions: HLQuestion[];
}

export interface HLOutcome {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: HLSideSpec[];
  /** Quote token symbol. Optional on the wire; SDK fetch helpers default to "USDH" when absent. */
  quoteToken?: string;
}

export interface HLSideSpec {
  name: string;
  token?: number;
}

export interface HLQuestion {
  question: number;
  name: string;
  description: string;
  fallbackOutcome: number;
  namedOutcomes: number[];
  settledNamedOutcomes: number[];
}

export interface HLSettledOutcome {
  spec: HLOutcome;
  settleFraction: string;
  details: string;
  /**
   * Parent question, returned by HL for outcomes that belong to a question
   * group (priceBucket, multiOutcome). Omitted for standalone priceBinary
   * outcomes. The `description` here is the parent question's description
   * (e.g. `class:priceBucket|underlying:BTC|...`), which is what consumers
   * need to recover bucket bounds after the question itself has been
   * removed from `outcomeMeta`.
   */
  question?: {
    /** Inner shape mirrors HL's API: `{ settled: <questionId> }`. */
    question: { settled: number };
    name: string;
    description: string;
  };
}

// -- L2 book (standard HL format) -------------------------------------------

export interface HLL2Book {
  coin: string;
  time: number;
  levels: [HLL2Level[], HLL2Level[]]; // [bids, asks]
}

export interface HLL2Level {
  px: string;
  sz: string;
  n: number;
}

// -- Recent trades (standard HL format) -------------------------------------

export interface HLTrade {
  coin: string;
  side: "B" | "A"; // B = buy, A = sell (ask)
  px: string;
  sz: string;
  time: number;
  hash: string;
  tid: number;
  users: [string, string];
}

// -- Candle snapshot (standard HL format) -----------------------------------

export interface HLCandle {
  t: number; // open time
  T: number; // close time
  s: string; // symbol
  i: string; // interval
  o: string; // open
  c: string; // close
  h: string; // high
  l: string; // low
  v: string; // volume
  n: number; // trade count
}

// -- allMids ----------------------------------------------------------------

export type HLAllMids = Record<string, string>;

// -- clearinghouseState (positions) -----------------------------------------

export interface HLClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
  assetPositions: HLAssetPosition[];
  time: number;
}

export interface HLAssetPosition {
  type: string;
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    positionValue: string;
    unrealizedPnl: string;
    returnOnEquity: string;
    liquidationPx: string | null;
    marginUsed: string;
    maxLeverage: number;
    leverage: {
      type: string;
      value: number;
      rawUsd?: string;
    };
    cumFunding: {
      allTime: string;
      sinceOpen: string;
      sinceChange: string;
    };
  };
}

// -- spotClearinghouseState -------------------------------------------------

/** Spot clearinghouse state - HIP-4 prediction balances live here */
export interface HLSpotClearinghouseState {
  balances: Array<{
    coin: string;
    token: number;
    hold: string;
    total: string;
    entryNtl: string;
  }>;
}

// -- frontendOpenOrders ----------------------------------------------------

/** Frontend-formatted open order */
export interface HLFrontendOrder {
  coin: string;
  side: "B" | "A";
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  origSz: string;
  reduceOnly: boolean;
  orderType: string;
  tif: string | null;
  cloid: string | null;
  triggerCondition?: string;
  isTrigger?: boolean;
  triggerPx?: string;
  children?: unknown[];
  isPositionTpsl?: boolean;
}

// -- userFills --------------------------------------------------------------

export interface HLFill {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A";
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken: string;
}

export interface HLWsUserFillsEvent {
  readonly isSnapshot: boolean;
  readonly user: string;
  readonly fills: HLFill[];
}

// -- Exchange API (order placement) -----------------------------------------

export interface HLOrderAction {
  type: "order";
  orders: HLOrderWire[];
  grouping: "na";
}

export interface HLOrderWire {
  a: number; // asset index
  b: boolean; // true = buy
  p: string; // price
  s: string; // size
  r: boolean; // reduce only
  t: HLOrderType;
  /** Client order ID (hex string). Optional. */
  c?: string;
}

export type HLOrderType =
  | { limit: { tif: "Gtc" | "Ioc" | "Alo" | "FrontendMarket" } }
  | { trigger: { triggerPx: string; isMarket: boolean; tpsl: "tp" | "sl" } };

export interface HLExchangeRequest {
  action: HLOrderAction;
  nonce: number;
  signature: HLSignature;
  vaultAddress: string | null;
}

export interface HLSignature {
  r: string;
  s: string;
  v: number;
}

export interface HLExchangeResponse {
  status: "ok" | "err";
  response?: {
    type: "order";
    data: {
      statuses: HLOrderStatus[];
    };
  };
}

export type HLOrderStatus =
  | {
      filled: {
        totalSz: string;
        avgPx: string;
        oid: number;
      };
    }
  | {
      resting: {
        oid: number;
      };
    }
  | {
      error: string;
    };

// -- userOutcome actions ----------------------------------------------------
//
// HIP-4 share-conversion primitives. All four variants are wrapped under the
// same `type: "userOutcome"` envelope, with a single sub-action key naming
// the operation. Signed via L1 agent signing (same path as `order` / `cancel`).
//
// Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
//   - splitOutcome: X quote → X Yes shares + X No shares of one outcome
//   - mergeOutcome: X Yes + X No shares of one outcome → X quote (null = max)
//   - mergeQuestion: X Yes shares from every outcome of a question → X quote
//   - negateQuestion: X No shares of one outcome → X Yes shares of every other
//                     outcome in the same question

export interface HLSplitOutcomeAction {
  type: "userOutcome";
  splitOutcome: { outcome: number; amount: string };
}

export interface HLMergeOutcomeAction {
  type: "userOutcome";
  mergeOutcome: { outcome: number; amount: string | null };
}

export interface HLMergeQuestionAction {
  type: "userOutcome";
  mergeQuestion: { question: number; amount: string | null };
}

/**
 * The on-wire sub-key is `negateOutcome` (matching the page heading), NOT
 * `negateQuestion` as the docs body's example renders it. Confirmed by
 * inspecting Hyperliquid's own testnet "Convert Outcomes" UI on 2026-05-07
 * - its `/exchange` POST sends `{ negateOutcome: { question, outcome,
 * amount } }`. The docs body is a typo; the heading is correct.
 */
export interface HLNegateOutcomeAction {
  type: "userOutcome";
  negateOutcome: { question: number; outcome: number; amount: string };
}

export type HLUserOutcomeAction =
  | HLSplitOutcomeAction
  | HLMergeOutcomeAction
  | HLMergeQuestionAction
  | HLNegateOutcomeAction;

// -- scheduleCancel action --------------------------------------------------
//
// HL "dead-man's switch": registers a future timestamp at which every
// open order belonging to the signing agent will be cancelled. Per-agent,
// not per-order - submitting a new schedule replaces the previous one.
// Passing `time: null` clears the schedule.
//
// Used to prevent resting limit orders from sitting through a market's
// settlement auction: arm 1h before expiry, never get picked off by a
// stale quote.

export interface HLScheduleCancelAction {
  type: "scheduleCancel";
  /** Unix milliseconds at which HL cancels every open order from this agent. `null` clears. */
  time: number | null;
}

// -- Cancel action ----------------------------------------------------------

export interface HLCancelAction {
  type: "cancel";
  cancels: Array<{ a: number; o: number }>;
}

export interface HLCancelRequest {
  action: HLCancelAction;
  nonce: number;
  signature: HLSignature;
  vaultAddress: string | null;
}

export type HLCancelStatus = "success" | { error: string };

export interface HLCancelResponse {
  status: "ok" | "err";
  response?: {
    type: "cancel";
    data: {
      statuses: HLCancelStatus[];
    };
  };
}

// -- Modify action ----------------------------------------------------------

/**
 * Modify an existing order. HL preserves queue priority for size-only
 * changes; price changes move the order to the back of the queue at the
 * new level. See https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
 */
export interface HLModifyAction {
  type: "modify";
  oid: number;
  order: HLOrderWire;
}

export interface HLBatchModifyAction {
  type: "batchModify";
  modifies: Array<{
    oid: number;
    order: HLOrderWire;
  }>;
}

/**
 * HL's modify response. On success, `response` is the structured object
 * with per-order statuses. On failure (`status: "err"`), HL returns the
 * error reason as a plain string in `response` - surface it instead of
 * discarding the payload.
 */
export interface HLModifyResponse {
  status: "ok" | "err";
  response?:
    | {
        type: "modify" | "batchModify";
        data: {
          statuses: HLOrderStatus[];
        };
      }
    | string;
}

// -- WebSocket messages -----------------------------------------------------

export interface HLWsMessage {
  channel: string;
  data: unknown;
}

export interface HLWsL2BookData {
  coin: string;
  time: number;
  levels: [
    Array<{ px: string; sz: string; n: number }>,
    Array<{ px: string; sz: string; n: number }>,
  ];
  spread?: string;
}

/** BBO (Best Bid and Offer) WebSocket data - sent when the top-of-book changes. */
export interface HLWsBboData {
  coin: string;
  time: number;
  bbo: [HLWsBboLevel | null, HLWsBboLevel | null]; // [bestBid, bestAsk]
}

export interface HLWsBboLevel {
  px: string;
  sz: string;
  n: number;
}

export interface HLWsTradeData {
  coin: string;
  side: "B" | "A";
  px: string;
  sz: string;
  time: number;
  hash: string;
  tid: number;
}

// -- allMids (WebSocket) ----------------------------------------------------

export interface HLWsAllMidsData {
  mids: Record<string, string>;
}

// -- activeAssetCtx (WebSocket) ---------------------------------------------
//
// HL subscription type is "activeAssetCtx", but the response channel differs
// based on asset class:
//   - Spot assets (HIP-4 prediction tokens): channel = "activeSpotAssetCtx"
//   - Perp assets: channel = "activeAssetCtx"
//
// We currently only handle spot (prediction markets). If perps support is
// added, a second subscription or a channel-aware router will be needed.

export interface HLWsActiveSpotAssetCtxData {
  coin: string;
  ctx: {
    dayNtlVlm: string;
    markPx: string;
    midPx: string | null;
    prevDayPx: string;
    circulatingSupply: string;
    coin: string;
    totalSupply: string;
    dayBaseVlm: string;
  };
}

/** Single item from the bulk spotAssetCtxs WS subscription (flat, no ctx wrapper). */
export interface HLWsSpotAssetCtxItem {
  coin: string;
  dayNtlVlm: string;
  markPx: string;
  midPx: string | null;
  prevDayPx: string;
  circulatingSupply: string;
  totalSupply: string;
  dayBaseVlm: string;
}

/** Bulk spot asset context WS response - flat array from spotAssetCtxs subscription. */
export type HLWsSpotAssetCtxsData = HLWsSpotAssetCtxItem[];

export interface HLWsActivePerpAssetCtxData {
  coin: string;
  ctx: {
    markPx: string;
    oraclePx: string;
    funding: string;
    openInterest: string;
    dayNtlVlm: string;
    premium: string;
    prevDayPx: string;
  };
}

// -- Trades WS event (array of trades) --------------------------------------

export type HLWsTradesEvent = HLTrade[];

// -- outcomeMetaUpdates (WebSocket) -----------------------------------------
//
// Streams every change to the HIP-4 outcome catalog: new outcomes/questions
// created, outcomes/questions settled, question metadata updated. Lets a
// client keep its outcomeMeta cache fresh without polling.
//
// Subscription:  { "type": "outcomeMetaUpdates" }
// Response chan: "outcomeMetaUpdates"
//
// HL's docs type `WsOutcomeMetaUpdates` as a 1-element tuple, but the wire
// frame is a JSON array - modeled here as a plain array so callers don't
// have to special-case multi-update batches if HL emits them.

export interface HLWsOutcomeMetaSideSpec {
  name: string;
}

export interface HLWsOutcomeSpec {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: [HLWsOutcomeMetaSideSpec, HLWsOutcomeMetaSideSpec];
  /** Quote token symbol; mirrors HLOutcome.quoteToken. */
  quoteToken?: string;
}

export interface HLWsQuestionSpec {
  question: number;
  name: string;
  description: string;
  fallbackOutcome: number;
  namedOutcomes: number[];
  settledNamedOutcomes: number[];
}

export type HLWsOutcomeMetaUpdate =
  | { outcomeCreated: HLWsOutcomeSpec }
  | { outcomeSettled: number }
  | { questionUpdated: HLWsQuestionSpec }
  | { questionSettled: number };

export type HLWsOutcomeMetaUpdates = HLWsOutcomeMetaUpdate[];

// -- User WS event wrappers -------------------------------------------------

export interface HLWsSpotStateEvent {
  user: `0x${string}`;
  spotState: HLSpotClearinghouseState;
}

export interface HLWsOpenOrdersEvent {
  dex: string;
  user: `0x${string}`;
  orders: HLFrontendOrder[];
}

export interface HLWsClearinghouseStateEvent {
  dex: string;
  user: `0x${string}`;
  clearinghouseState: HLClearinghouseState;
}

// -- extraAgents ------------------------------------------------------------

export interface HLExtraAgent {
  address: `0x${string}`;
  name: string;
  validUntil: number;
}

// -- User role -------------------------------------------------------------

export interface HLUserRoleResponse {
  /** Role assigned to the address by Hyperliquid (e.g. "user", "subAccount", "missing"). */
  role?: string;
}

// -- Account abstraction mode -----------------------------------------------

/**
 * Account abstraction mode reported by the `userAbstraction` info endpoint.
 *
 * - `default` - standard mode returned by HL for regular accounts. Spot
 *   and per-perp-DEX wallets are separate. `usdClassTransfer` required.
 * - `disabled` - legacy name for the same classic Standard mode; treated
 *   identically to `"default"`. Kept for backwards compatibility.
 * - `dexAbstraction` - unifies multiple perp DEXes into one balance, but
 *   the spot/perp split is preserved. `usdClassTransfer` is still
 *   required and still allowed.
 * - `unifiedAccount` - spot ↔ perps balances merged into a single balance.
 *   `usdClassTransfer` is rejected.
 * - `portfolioMargin` - unified account plus cross-asset portfolio margin.
 *   `usdClassTransfer` is rejected.
 *
 * Only `unifiedAccount` and `portfolioMargin` trigger the API rejection
 * `"Action disabled when unified account is active"`.
 */
export type HLUserAbstraction =
  | "default"
  | "disabled"
  | "dexAbstraction"
  | "unifiedAccount"
  | "portfolioMargin";

// -- User fees --------------------------------------------------------------

/**
 * Response shape of Hyperliquid's `userFees` info request.
 * Rates are decimal strings (e.g. "0.000538" = 0.0538%).
 *
 * For HIP-4 outcome markets (spot-style), use `userSpotCrossRate`
 * (taker) and `userSpotAddRate` (maker) - these already include
 * tier, referral, staking, and aligned-quote-asset discounts.
 */
export interface HLUserFees {
  userCrossRate: string;
  userAddRate: string;
  userSpotCrossRate: string;
  userSpotAddRate: string;
  activeReferralDiscount?: string;
  activeStakingDiscount?: {
    discount: string;
    bpsOfMaxSupply: string;
  } | null;
}

// -- Referral state ---------------------------------------------------------

export interface HLReferralState {
  /** The referrer's address, if set */
  referredBy?: {
    code: string;
    referrer: string;
  } | null;
  /** Cumulative referral rewards info */
  cumVlm?: string;
  unclaimedRewards?: string;
  claimedRewards?: string;
}

// -- Signer interface -------------------------------------------------------
// Consumers provide a signer that can produce EIP-712 signatures for HL actions.
// Supports both native HLSignature ({r, s, v}) and hex strings (viem output).

export interface HIP4Signer {
  getAddress(): string | Promise<string>;

  /**
   * Sign a typed-data payload (EIP-712).
   * Can return either:
   *   - HLSignature ({r, s, v}) directly
   *   - A hex string "0x..." which will be split into {r, s, v}
   */
  signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>,
  ): Promise<HLSignature | string>;
}

/**
 * Convert a viem hex signature (0x + 32 bytes r + 32 bytes s + 1 byte v)
 * into the {r, s, v} format HL expects.
 */
export function splitHexSignature(hex: string): HLSignature {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  return {
    r: "0x" + raw.slice(0, 64),
    s: "0x" + raw.slice(64, 128),
    v: parseInt(raw.slice(128, 130), 16),
  };
}

/**
 * Normalize a signature that may be hex or already split.
 */
export function normalizeSignature(sig: HLSignature | string): HLSignature {
  if (typeof sig === "string") {
    return splitHexSignature(sig);
  }
  return sig;
}
