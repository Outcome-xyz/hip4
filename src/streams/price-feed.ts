// ---------------------------------------------------------------------------
// Price Feed Stream
// ---------------------------------------------------------------------------
// Merges historical candles with real-time mid-price ticks into a single
// continuously-updating candle array.  Designed to power live charts.
//
// Usage:
//   const unsub = createPriceFeed(adapter.marketData, "516", (snap) => {
//     renderChart(snap.candles);
//   });
// ---------------------------------------------------------------------------

import type {
  PredictionMarketDataAdapter,
  Unsubscribe,
} from "../adapter/types";
import {
  type PriceFeedCandle,
  intervalToMs,
  processTick as processTickUtil,
} from "./candle-utils";

// Re-export so existing consumers are not broken
export { intervalToMs, type PriceFeedCandle };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PriceFeedOptions {
  /** Candle interval string accepted by Hyperliquid (e.g. "1m", "5m", "1h", "1d"). Default: `"1h"`. */
  interval?: string;
  /** How far back to fetch historical candles, in milliseconds. Default: 14 days. */
  lookbackMs?: number;
  /** Which side to track - 0 for Yes, 1 for No. Default: `0`. */
  sideIndex?: number;
}

export interface PriceFeedSnapshot {
  marketId: string;
  /** Full candle array (historical + live). */
  candles: PriceFeedCandle[];
  /** Latest mid-price received (may be newer than the last candle close). */
  currentMid: number | null;
  /** `false` until the initial candle fetch resolves. */
  ready: boolean;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Create a live price feed for a single prediction market.
 *
 * 1. Immediately subscribes to real-time mid-price updates (ticks are buffered
 *    until the historical fetch completes).
 * 2. Fetches historical candles for the lookback window.
 * 3. Merges buffered ticks into the candle array.
 * 4. On every subsequent tick, updates the latest candle or appends a new one,
 *    then emits a {@link PriceFeedSnapshot}.
 *
 * Returns an **unsubscribe** function - call it to stop the feed.
 */
export function createPriceFeed(
  marketData: PredictionMarketDataAdapter,
  marketId: string,
  onSnapshot: (snapshot: PriceFeedSnapshot) => void,
  options?: PriceFeedOptions,
): Unsubscribe {
  const interval = options?.interval ?? "1h";
  const lookbackMs = options?.lookbackMs ?? 14 * 24 * 60 * 60 * 1000;
  const sideIndex = options?.sideIndex ?? 0;
  const intervalMs = intervalToMs(interval);

  let destroyed = false;
  let candles: PriceFeedCandle[] = [];
  let currentMid: number | null = null;
  let ready = false;
  let bufferedTicks: Array<{ price: number; timestamp: number }> = [];

  // -- helpers ---------------------------------------------------------------

  function emit() {
    if (destroyed) return;
    onSnapshot({
      marketId,
      candles: candles.map((c) => ({ ...c })),
      currentMid,
      ready,
    });
  }

  function processTick(price: number, timestampMs: number) {
    currentMid = price;
    processTickUtil(candles, price, timestampMs, intervalMs);
  }

  // -- subscribe immediately (buffer until candles arrive) -------------------

  const unsubPrice = marketData.subscribePrice(marketId, (priceData) => {
    if (destroyed) return;

    const outcome = priceData.outcomes[sideIndex];
    if (!outcome) return;

    const mid = parseFloat(outcome.midpoint);
    if (Number.isNaN(mid)) return;

    if (!ready) {
      bufferedTicks.push({ price: mid, timestamp: priceData.timestamp });
      return;
    }

    processTick(mid, priceData.timestamp);
    emit();
  });

  // -- fetch historical candles ----------------------------------------------

  const now = Date.now();
  marketData
    .fetchCandles(marketId, interval, now - lookbackMs, now)
    .then((historical) => {
      if (destroyed) return;

      candles = historical.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      // Replay any ticks that arrived while we were fetching
      for (const tick of bufferedTicks) {
        processTick(tick.price, tick.timestamp);
      }
      bufferedTicks = [];

      ready = true;
      emit();
    })
    .catch(() => {
      if (destroyed) return;
      // If candle fetch fails, go live-only
      for (const tick of bufferedTicks) {
        processTick(tick.price, tick.timestamp);
      }
      bufferedTicks = [];
      ready = true;
      emit();
    });

  // -- teardown --------------------------------------------------------------

  return () => {
    destroyed = true;
    unsubPrice();
  };
}
