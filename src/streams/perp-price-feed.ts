// ---------------------------------------------------------------------------
// Perp Price Feed Stream
// ---------------------------------------------------------------------------
// Merges historical OHLCV candles with real-time candle WebSocket updates
// for a perpetual market coin (e.g. "BTC", "ETH", "HYPE").
//
// Uses two WebSocket channels:
//   - `candle` subscription for authoritative OHLCV candle updates
//   - `allMids` subscription for live mid-price (currentMid only)
//
// Usage:
//   const unsub = createPerpPriceFeed(hip4Client, "BTC", (snap) => {
//     renderChart(snap.candles);
//   });
// ---------------------------------------------------------------------------

import type { HIP4Client } from "../adapter/hyperliquid/client";
import { type PriceFeedCandle, intervalToMs } from "./candle-utils";

// Re-export candle type for consumers
export { type PriceFeedCandle } from "./candle-utils";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PerpPriceFeedOptions {
  /** Candle interval string accepted by Hyperliquid (e.g. "1m", "5m", "1h", "1d"). Default: `"1h"`. */
  interval?: string;
  /** How far back to fetch historical candles, in milliseconds. Default: 14 days. */
  lookbackMs?: number;
}

export interface PerpPriceFeedSnapshot {
  coin: string;
  /** Full candle array (historical + live). */
  candles: PriceFeedCandle[];
  /** Latest mid-price received (may be newer than the last candle close). */
  currentMid: number | null;
  /** `false` until the initial candle fetch resolves. */
  ready: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RawWsCandle {
  t: number;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  s?: string;
  i?: string;
}

function parseWsCandle(raw: RawWsCandle): PriceFeedCandle {
  return {
    time: raw.t / 1000,
    open: parseFloat(raw.o),
    high: parseFloat(raw.h),
    low: parseFloat(raw.l),
    close: parseFloat(raw.c),
    volume: parseFloat(raw.v),
  };
}

function mergeCandle(
  candles: PriceFeedCandle[],
  incoming: PriceFeedCandle,
): void {
  if (candles.length === 0) {
    candles.push(incoming);
    return;
  }

  const last = candles[candles.length - 1];

  if (incoming.time === last.time) {
    last.open = incoming.open;
    last.high = incoming.high;
    last.low = incoming.low;
    last.close = incoming.close;
    last.volume = incoming.volume;
  } else if (incoming.time > last.time) {
    candles.push(incoming);
  }
  // Older candles are silently dropped
}

/**
 * If the last candle is older than the chart window, bridge the gap by
 * inserting a flat candle one interval before now. The first live tick
 * then creates a sharp step rather than a long diagonal.
 */
function bridgeToNow(candles: PriceFeedCandle[], intervalMs: number): void {
  if (candles.length === 0) return;

  const last = candles[candles.length - 1];
  const nowMs = Date.now();
  const lastMs = last.time * 1000;

  if (nowMs - lastMs <= intervalMs * 2) return;

  const boundary = Math.floor(nowMs / intervalMs) * intervalMs - intervalMs;
  if (boundary <= lastMs) return;

  candles.push({
    time: boundary / 1000,
    open: last.close,
    high: last.close,
    low: last.close,
    close: last.close,
    volume: 0,
  });
}

/** Trim candles to the display window, keeping one anchor before the start. */
function trimToWindow(
  candles: PriceFeedCandle[],
  lookbackMs: number,
): PriceFeedCandle[] {
  if (candles.length === 0) return candles;
  const windowStartSec = (Date.now() - lookbackMs) / 1000;
  const firstInWindow = candles.findIndex((c) => c.time >= windowStartSec);
  if (firstInWindow === 0) return candles;
  if (firstInWindow === -1) return candles.slice(-1);
  return candles.slice(firstInWindow - 1);
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Create a live price feed for a perpetual market coin.
 *
 * 1. Subscribes to `allMids` for live mid-price updates (currentMid).
 * 2. Subscribes to `candle` WS for authoritative OHLCV candle updates.
 * 3. Fetches historical candles for the lookback window.
 * 4. After historical fetch, replays buffered data and emits snapshots
 *    on every candle WS update or allMids tick.
 *
 * Returns an **unsubscribe** function - call it to stop the feed.
 */
export function createPerpPriceFeed(
  client: HIP4Client,
  coin: string,
  onSnapshot: (snapshot: PerpPriceFeedSnapshot) => void,
  options?: PerpPriceFeedOptions,
): () => void {
  const interval = options?.interval ?? "1h";
  const lookbackMs = options?.lookbackMs ?? 14 * 24 * 60 * 60 * 1000;
  const intervalMs = intervalToMs(interval);

  let destroyed = false;
  let candles: PriceFeedCandle[] = [];
  let currentMid: number | null = null;
  let ready = false;
  let receivedCandleWs = false;
  let bufferedCandles: RawWsCandle[] = [];

  // -- helpers ---------------------------------------------------------------

  function emit() {
    if (destroyed) return;
    const trimmed = trimToWindow(candles, lookbackMs);
    onSnapshot({
      coin,
      candles: trimmed.map((c) => ({ ...c })),
      currentMid,
      ready,
    });
  }

  // -- subscribe to allMids for initial currentMid fallback only --------------
  // Mark price (from activeAssetCtx) is the authoritative currentMid.
  // allMids only provides the initial fallback before mark price arrives.
  // It does NOT build candles - candle data comes only from candleSnapshot
  // and candle WS.

  const unsubMids = client.subscribe({ type: "allMids" }, (data: unknown) => {
    if (destroyed) return;

    const mids = (data as { mids?: Record<string, string> })?.mids;
    if (!mids) return;

    const raw = mids[coin];
    if (raw === undefined) return;

    const mid = Number.parseFloat(raw);
    if (Number.isNaN(mid)) return;

    if (currentMid === null) {
      currentMid = mid;
      if (ready) emit();
    }
  });

  // -- subscribe to candle WS for authoritative OHLCV updates ----------------

  const unsubCandle = client.subscribe(
    { type: "candle", coin, interval },
    (data: unknown) => {
      if (destroyed) return;

      const raw = data as RawWsCandle;
      if (!raw?.t || !raw?.o) return;
      if (raw.s !== undefined && raw.s !== coin) return;
      if (raw.i !== undefined && raw.i !== interval) return;

      receivedCandleWs = true;

      if (!ready) {
        bufferedCandles.push(raw);
        return;
      }

      mergeCandle(candles, parseWsCandle(raw));
      emit();
    },
  );

  // -- subscribe to activeAssetCtx for mark price ----------------------------

  const unsubMarkPrice = client.subscribe(
    { type: "activeAssetCtx", coin },
    (data: unknown) => {
      if (destroyed) return;

      const msg = data as { coin?: string; ctx?: { markPx?: string } };
      if (!msg?.ctx?.markPx) return;
      if (msg.coin !== coin) return;

      const mark = Number.parseFloat(msg.ctx.markPx);
      if (Number.isNaN(mark)) return;

      currentMid = mark;
      if (ready) emit();
    },
  );

  // -- fetch historical candles ----------------------------------------------

  // Fetch with at least 7 days of lookback to find the last available candle,
  // even if the chart display window is shorter (e.g., 1 hour).
  // bridgeToNow() will connect old candles to the present time.
  const MIN_FETCH_LOOKBACK = 7 * 24 * 60 * 60 * 1000;
  const fetchLookback = Math.max(lookbackMs, MIN_FETCH_LOOKBACK);
  const now = Date.now();
  client
    .fetchCandleSnapshot(coin, interval, now - fetchLookback, now)
    .then((historical) => {
      if (destroyed) return;

      candles = historical.map((c) => ({
        time: c.t / 1000,
        open: parseFloat(c.o),
        high: parseFloat(c.h),
        low: parseFloat(c.l),
        close: parseFloat(c.c),
        volume: parseFloat(c.v),
      }));

      // Replay buffered candle WS updates first (authoritative)
      for (const raw of bufferedCandles) {
        mergeCandle(candles, parseWsCandle(raw));
      }
      bufferedCandles = [];

      bridgeToNow(candles, intervalMs);
      ready = true;
      emit();
    })
    .catch((err: unknown) => {
      console.warn("[perp-price-feed] candle fetch failed:", err);
      if (destroyed) return;

      // Replay buffered candle WS updates
      for (const raw of bufferedCandles) {
        mergeCandle(candles, parseWsCandle(raw));
      }
      bufferedCandles = [];

      bridgeToNow(candles, intervalMs);
      ready = true;
      emit();
    });

  // -- teardown --------------------------------------------------------------

  return () => {
    destroyed = true;
    unsubMids();
    unsubCandle();
    unsubMarkPrice();
  };
}
