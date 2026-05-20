// ---------------------------------------------------------------------------
// Hyperliquid HIP-4 HTTP Client
//
// Wraps the HL info + exchange REST API. Outcome markets use the same
// endpoints as perps but with @<id> (outcome-level) and #<id><side>
// (per-side probability) coin prefixes.
// ---------------------------------------------------------------------------

import type {
  HLAllMids,
  HLBatchModifyAction,
  HLCancelAction,
  HLCancelResponse,
  HLCandle,
  HLClearinghouseState,
  HLExchangeResponse,
  HLExtraAgent,
  HLFill,
  HLFrontendOrder,
  HLL2Book,
  HLModifyAction,
  HLModifyResponse,
  HLOrderAction,
  HLOutcomeMeta,
  HLReferralState,
  HLSettledOutcome,
  HLSignature,
  HLSpotClearinghouseState,
  HLTrade,
  HLUserAbstraction,
  HLUserFees,
  HLUserRoleResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Typed API error - carries HTTP status for retry decisions
// ---------------------------------------------------------------------------

export class HLApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HLApiError";
  }
}

const MAINNET_INFO_URL = "https://api.hyperliquid.xyz/info";
const MAINNET_EXCHANGE_URL = "https://api.hyperliquid.xyz/exchange";
const TESTNET_INFO_URL = "https://api-ui.hyperliquid-testnet.xyz/info";
const TESTNET_EXCHANGE_URL = "https://api-ui.hyperliquid-testnet.xyz/exchange";

const TESTNET_WS_URL = "wss://api-ui.hyperliquid-testnet.xyz/ws";
const MAINNET_WS_URL = "wss://api.hyperliquid.xyz/ws";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface HIP4ClientConfig {
  testnet?: boolean;
  infoUrl?: string;
  exchangeUrl?: string;
  /** Optional logger. Default: no-op. */
  logger?: (
    level: "debug" | "info" | "warn" | "error",
    msg: string,
    data?: unknown,
  ) => void;
}

/**
 * Canonical value for info queries that should span every perp dex.
 * Replaces reliance on DEX abstraction, which Hyperliquid is deprecating.
 */
export const ALL_DEXS = "ALL_DEXS";

/**
 * Predicate: does this abstraction mode require a `usdClassTransfer`
 * step to move USDC between spot and perps silos?
 *
 * - `disabled` (Standard): spot/perp split, transfer required.
 * - `dexAbstraction`: unifies multiple perp DEXes only - spot/perp
 *   split is preserved, transfer still required. Verified empirically:
 *   addresses on `dexAbstraction` carry independent spot-USDC and
 *   perp-`withdrawable` balances.
 * - `unifiedAccount` / `portfolioMargin`: spot↔perp merged into a
 *   single balance - `usdClassTransfer` is rejected with `"Action
 *   disabled when unified account is active"`.
 */
export function isUsdClassTransferRequired(
  abstraction: HLUserAbstraction,
): boolean {
  return (
    abstraction === "default" ||
    abstraction === "disabled" ||
    abstraction === "dexAbstraction"
  );
}

// ---------------------------------------------------------------------------
// Coin-name helpers
// ---------------------------------------------------------------------------

/** Outcome-level coin name (AMM instrument) */
export function outcomeCoin(outcomeId: number): string {
  return `@${outcomeId}`;
}

/** Per-side probability coin name */
export function sideCoin(outcomeId: number, sideIndex: number): string {
  return `#${outcomeId}${sideIndex}`;
}

/** Asset ID for order placement: 100_000_000 + outcomeId * 10 + sideIndex */
export function sideAssetId(outcomeId: number, sideIndex: number): number {
  return 100_000_000 + outcomeId * 10 + sideIndex;
}

/** Parse a side coin like "#5160" or "+5160" into {outcomeId, sideIndex} */
export function parseSideCoin(coin: string): {
  outcomeId: number;
  sideIndex: number;
} | null {
  // HIP-4 uses # prefix, testnet may use + as an alternative
  if (!coin.startsWith("#") && !coin.startsWith("+")) return null;
  const num = coin.slice(1);
  if (num.length < 2) return null;
  const sideIndex = parseInt(num.slice(-1), 10);
  const outcomeId = parseInt(num.slice(0, -1), 10);
  if (isNaN(sideIndex) || isNaN(outcomeId)) return null;
  if (sideIndex > 1) return null;
  return { outcomeId, sideIndex };
}

/** Parse an outcome-level coin like "@1338" into {outcomeId} */
export function parseOutcomeCoin(coin: string): { outcomeId: number } | null {
  if (!coin.startsWith("@")) return null;
  const outcomeId = parseInt(coin.slice(1), 10);
  if (isNaN(outcomeId)) return null;
  return { outcomeId };
}

/** Extract the outcome ID from either @, #, or + coin format */
export function coinOutcomeId(coin: string): number | null {
  if (coin.startsWith("#") || coin.startsWith("+")) {
    const parsed = parseSideCoin(coin);
    return parsed ? parsed.outcomeId : null;
  }
  if (coin.startsWith("@")) {
    const parsed = parseOutcomeCoin(coin);
    return parsed ? parsed.outcomeId : null;
  }
  return null;
}

/** Check if a coin is an outcome-level or side-level instrument */
export function isOutcomeCoin(coin: string): boolean {
  return coin.startsWith("@") || coin.startsWith("#") || coin.startsWith("+");
}

// ---------------------------------------------------------------------------
// HIP4Client
// ---------------------------------------------------------------------------

export class HIP4Client {
  readonly infoUrl: string;
  readonly exchangeUrl: string;
  readonly wsUrl: string;
  readonly testnet: boolean;
  readonly log: (
    level: "debug" | "info" | "warn" | "error",
    msg: string,
    data?: unknown,
  ) => void;

  constructor(config: HIP4ClientConfig = {}) {
    this.testnet = config.testnet ?? true;
    this.infoUrl =
      config.infoUrl ?? (this.testnet ? TESTNET_INFO_URL : MAINNET_INFO_URL);
    this.exchangeUrl =
      config.exchangeUrl ??
      (this.testnet ? TESTNET_EXCHANGE_URL : MAINNET_EXCHANGE_URL);
    this.wsUrl = this.testnet ? TESTNET_WS_URL : MAINNET_WS_URL;
    this.log = config.logger ?? (() => {});
  }

  // -- Info endpoints -------------------------------------------------------

  async fetchOutcomeMeta(): Promise<HLOutcomeMeta> {
    return this.infoPost<HLOutcomeMeta>({ type: "outcomeMeta" });
  }

  async fetchSettledOutcome(outcome: number): Promise<HLSettledOutcome | null> {
    return this.infoPost<HLSettledOutcome | null>({
      type: "settledOutcome",
      outcome,
    });
  }

  async fetchL2Book(coin: string): Promise<HLL2Book> {
    return this.infoPost<HLL2Book>({ type: "l2Book", coin });
  }

  async fetchRecentTrades(coin: string): Promise<HLTrade[]> {
    return this.infoPost<HLTrade[]>({ type: "recentTrades", coin });
  }

  async fetchAllMids(): Promise<HLAllMids> {
    return this.infoPost<HLAllMids>({ type: "allMids" });
  }

  async fetchCandleSnapshot(
    coin: string,
    interval: string,
    startTime: number,
    endTime: number,
  ): Promise<HLCandle[]> {
    return this.infoPost<HLCandle[]>({
      type: "candleSnapshot",
      req: { coin, interval, startTime, endTime },
    });
  }

  async fetchClearinghouseState(user: string): Promise<HLClearinghouseState> {
    return this.infoPost<HLClearinghouseState>({
      type: "clearinghouseState",
      user,
    });
  }

  async fetchUserFills(user: string): Promise<HLFill[]> {
    return this.infoPost<HLFill[]>({ type: "userFills", user });
  }

  /** Spot meta + asset contexts (includes markPx / oracle price for each spot asset) */
  async fetchSpotAssetCtx(
    spotIndex: number,
  ): Promise<{ markPx: string; midPx: string } | null> {
    const data = await this.infoPost<
      [unknown, Array<{ markPx?: string; midPx?: string; coin?: string }>]
    >({
      type: "spotMetaAndAssetCtxs",
    });
    const ctx = data[1]?.[spotIndex];
    if (!ctx?.markPx) return null;
    return { markPx: ctx.markPx, midPx: ctx.midPx ?? "0" };
  }

  /** Spot balances - HIP-4 prediction market positions live here (USDH, outcome tokens) */
  async fetchSpotClearinghouseState(
    user: string,
  ): Promise<HLSpotClearinghouseState> {
    return this.infoPost<HLSpotClearinghouseState>({
      type: "spotClearinghouseState",
      user,
    });
  }

  /** Trade fills with time range filtering */
  async fetchUserFillsByTime(
    user: string,
    startTime: number,
    endTime: number,
  ): Promise<HLFill[]> {
    return this.infoPost<HLFill[]>({
      type: "userFillsByTime",
      user,
      startTime,
      endTime,
      aggregateByTime: true,
      reversed: true,
      dex: ALL_DEXS,
    });
  }

  /** Approved extra agents for a user */
  async fetchExtraAgents(user: string): Promise<HLExtraAgent[]> {
    return this.infoPost<HLExtraAgent[]>({ type: "extraAgents", user });
  }

  /**
   * Check the maximum builder fee a user has approved for a given builder.
   * Returns the approved fee in tenths of a basis point (e.g. 100 = 0.1%).
   * Returns 0 if no approval exists.
   */
  async fetchMaxBuilderFee(user: string, builder: string): Promise<number> {
    const result = await this.infoPost<string | number>({
      type: "maxBuilderFee",
      user,
      builder: builder.toLowerCase(),
    });
    return result ? Number(result) : 0;
  }

  /**
   * Fetch all approved builder addresses for a user.
   * Hyperliquid limits each address to a maximum of 3 approved builders.
   */
  async fetchApprovedBuilders(user: string): Promise<string[]> {
    return this.infoPost<string[]>({ type: "approvedBuilders", user });
  }

  /**
   * Fetch a user's referral state from Hyperliquid.
   * Returns the referral state object, or null if no referrer is set.
   */
  async fetchReferralState(user: string): Promise<HLReferralState> {
    return this.infoPost<HLReferralState>({ type: "referral", user });
  }

  /**
   * Fetch the role assigned to a user by Hyperliquid.
   * `role === "missing"` indicates the wallet has never interacted with HL.
   */
  async fetchUserRole(user: string): Promise<HLUserRoleResponse> {
    return this.infoPost<HLUserRoleResponse>({ type: "userRole", user });
  }

  /**
   * Fetch the user's effective fee schedule (post-discount).
   * Spot rates (`userSpotCrossRate` / `userSpotAddRate`) are what apply to
   * HIP-4 outcome closes; opens are 0-fee.
   */
  async fetchUserFees(user: string): Promise<HLUserFees> {
    return this.infoPost<HLUserFees>({ type: "userFees", user });
  }

  /**
   * Fetch the user's account abstraction mode.
   *
   * Returns one of `"default" | "disabled" | "dexAbstraction" |
   * "unifiedAccount" | "portfolioMargin"`. Standard accounts return
   * `"default"` (or `"disabled"`); both keep spot and perp as separate
   * silos and require a `usdClassTransfer` before `withdraw3`. Only
   * `"unifiedAccount"` / `"portfolioMargin"` merge the balances and reject
   * `usdClassTransfer`. Use {@link isUsdClassTransferRequired} to gate the
   * spot↔perp transfer step in deposit/withdraw flows.
   *
   * Endpoint: `POST /info` body `{ type: "userAbstraction", user }`.
   */
  async fetchUserAbstraction(user: string): Promise<HLUserAbstraction> {
    return this.infoPost<HLUserAbstraction>({ type: "userAbstraction", user });
  }

  /** Frontend-formatted open orders */
  async fetchFrontendOpenOrders(user: string): Promise<HLFrontendOrder[]> {
    return this.infoPost<HLFrontendOrder[]>({
      type: "frontendOpenOrders",
      user,
      dex: ALL_DEXS,
    });
  }

  // -- Exchange endpoints ---------------------------------------------------

  async placeOrder(
    action: HLOrderAction,
    nonce: number,
    signature: HLSignature,
    vaultAddress: string | null = null,
  ): Promise<HLExchangeResponse> {
    return this.exchangePost({
      action,
      nonce,
      signature,
      vaultAddress,
    });
  }

  async cancelOrder(
    action: HLCancelAction,
    nonce: number,
    signature: HLSignature,
    vaultAddress: string | null = null,
  ): Promise<HLCancelResponse> {
    return this.exchangePost({
      action,
      nonce,
      signature,
      vaultAddress,
    });
  }

  async modifyOrder(
    action: HLModifyAction,
    nonce: number,
    signature: HLSignature,
    vaultAddress: string | null = null,
  ): Promise<HLModifyResponse> {
    return this.exchangePost({
      action,
      nonce,
      signature,
      vaultAddress,
    });
  }

  async batchModifyOrders(
    action: HLBatchModifyAction,
    nonce: number,
    signature: HLSignature,
    vaultAddress: string | null = null,
  ): Promise<HLModifyResponse> {
    return this.exchangePost({
      action,
      nonce,
      signature,
      vaultAddress,
    });
  }

  /** Submit a user-signed action (withdraw, usdClassTransfer, etc.) */
  async submitUserSignedAction(
    action: Record<string, unknown>,
    nonce: number,
    signature: HLSignature,
  ): Promise<{ status: string; response?: unknown }> {
    return this.exchangePost({
      action,
      nonce,
      signature,
    });
  }

  // -- WebSocket subscriptions -----------------------------------------------

  private ws: WebSocket | null = null;
  private wsPendingMessages: string[] = [];
  /** Callbacks keyed by response channel (for message routing). */
  private wsCallbacks: Map<string, Set<(data: unknown) => void>> = new Map();
  /** Active subscribe messages as JSON strings (for reconnection). */
  private wsActiveSubs: Set<string> = new Set();

  /**
   * Subscribe to a Hyperliquid WebSocket channel.
   * Returns an unsubscribe function.
   *
   * @param options.responseChannel  Channel name HL uses in response messages
   *   when it differs from `subscription.type` (e.g. subscribe as
   *   "activeAssetCtx" but receive on "activeSpotAssetCtx").
   */
  subscribe(
    subscription: { type: string; [key: string]: unknown },
    onData: (data: unknown) => void,
    options?: { responseChannel?: string },
  ): () => void {
    const responseChannel = options?.responseChannel ?? subscription.type;
    this.ensureWs();

    // Send subscribe to HL
    const subMsg = JSON.stringify({ method: "subscribe", subscription });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(subMsg);
    } else {
      this.wsPendingMessages.push(subMsg);
    }
    this.wsActiveSubs.add(subMsg);

    // Register callback for message routing
    if (!this.wsCallbacks.has(responseChannel)) {
      this.wsCallbacks.set(responseChannel, new Set());
    }
    this.wsCallbacks.get(responseChannel)?.add(onData);

    return () => {
      // Send unsubscribe to HL
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: "unsubscribe", subscription }));
      }
      this.wsActiveSubs.delete(subMsg);

      // Remove callback
      const cbs = this.wsCallbacks.get(responseChannel);
      if (cbs) {
        cbs.delete(onData);
        if (cbs.size === 0) this.wsCallbacks.delete(responseChannel);
      }

      // Close WS if nothing left
      if (this.wsCallbacks.size === 0 && this.ws) {
        this.ws.close();
        this.ws = null;
      }
    };
  }

  /** Tear down WebSocket and clear all subscriptions. */
  closeWs(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    this.wsReconnectAttempts = 0;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsCallbacks.clear();
    this.wsActiveSubs.clear();
    this.wsPendingMessages = [];
  }

  private ensureWs(): void {
    if (this.ws) return;
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.wsReconnectAttempts = 0;
      for (const msg of this.wsPendingMessages) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      }
      this.wsPendingMessages = [];
    };
    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data as string) as {
          channel?: string;
          data?: unknown;
        };
        if (!parsed.channel) return;
        const cbs = this.wsCallbacks.get(parsed.channel);
        if (cbs) {
          for (const cb of cbs) cb(parsed.data);
        }
      } catch {
        // Ignore unparseable frames
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
        if (this.wsActiveSubs.size > 0) {
          this.scheduleReconnect();
        }
      }
    };
  }

  private wsReconnectAttempts = 0;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsDestroyed = false;

  private scheduleReconnect(): void {
    if (this.wsDestroyed) return;
    if (this.wsReconnectAttempts >= 10) {
      this.log("warn", "WS max reconnect attempts reached");
      return;
    }
    const delay = Math.min(1000 * 2 ** this.wsReconnectAttempts, 30_000);
    this.wsReconnectAttempts++;
    this.wsReconnectTimer = setTimeout(() => {
      if (this.wsDestroyed || this.wsActiveSubs.size === 0) return;
      this.ensureWs();
      for (const msg of this.wsActiveSubs) {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(msg);
        } else {
          this.wsPendingMessages.push(msg);
        }
      }
    }, delay);
  }

  // -- Internal -------------------------------------------------------------

  private async infoPost<T>(body: Record<string, unknown>): Promise<T> {
    try {
      return await this.doInfoPost<T>(body);
    } catch (err) {
      // Only retry on 5xx or network errors, not 4xx
      if (err instanceof HLApiError && err.status >= 400 && err.status < 500)
        throw err;
      this.log("warn", "Info request failed, retrying once", {
        type: body.type,
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, 1000));
      return this.doInfoPost<T>(body);
    }
  }

  private async doInfoPost<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.infoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new HLApiError(
        res.status,
        `HL info API responded with ${res.status}: ${res.statusText}`,
      );
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new HLApiError(res.status, "Exchange returned non-JSON response");
    }
  }

  private async exchangePost<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.exchangeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new HLApiError(
        res.status,
        `HL exchange API responded with ${res.status}: ${res.statusText}`,
      );
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new HLApiError(res.status, "Exchange returned non-JSON response");
    }
  }
}
