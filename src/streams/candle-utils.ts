// ---------------------------------------------------------------------------
// Shared candle utilities for price feed streams
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PriceFeedCandle {
  /** Unix timestamp in **seconds** (matches fetchCandles convention). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// Interval helpers
// ---------------------------------------------------------------------------

const INTERVAL_REGEX = /^(\d+)([mhd])$/;

/** Convert an interval string like `"1h"` to milliseconds. Falls back to 1 h. */
export function intervalToMs(interval: string): number {
  const match = interval.match(INTERVAL_REGEX);
  if (!match) return 3_600_000;
  const n = Number(match[1]);
  switch (match[2]) {
    case "m":
      return n * 60_000;
    case "h":
      return n * 3_600_000;
    case "d":
      return n * 86_400_000;
    default:
      return 3_600_000;
  }
}

/** Floor a millisecond timestamp to its candle boundary (in ms). */
export function candleBoundaryMs(
  timestampMs: number,
  intervalMs: number,
): number {
  return Math.floor(timestampMs / intervalMs) * intervalMs;
}

// ---------------------------------------------------------------------------
// Candle accumulation
// ---------------------------------------------------------------------------

/**
 * Process a price tick against a mutable candle array.
 * Either updates the last candle's OHLC or appends a new one.
 * Returns `true` if the tick was applied (not stale).
 *
 * Internal mutable accumulator - callers own the array and snapshot via
 * `candles.map(c => ({ ...c }))` before emitting to consumers.
 */
export function processTick(
  candles: PriceFeedCandle[],
  price: number,
  timestampMs: number,
  intervalMs: number,
): boolean {
  if (candles.length === 0) {
    const boundary = candleBoundaryMs(timestampMs, intervalMs);
    candles.push({
      time: boundary / 1000,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    });
    return true;
  }

  const last = candles[candles.length - 1];
  const lastBoundaryMs = last.time * 1000;
  const tickBoundaryMs = candleBoundaryMs(timestampMs, intervalMs);

  if (tickBoundaryMs === lastBoundaryMs) {
    last.close = price;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    return true;
  }

  if (tickBoundaryMs > lastBoundaryMs) {
    candles.push({
      time: tickBoundaryMs / 1000,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    });
    return true;
  }

  // Tick older than the last candle - silently dropped
  return false;
}
