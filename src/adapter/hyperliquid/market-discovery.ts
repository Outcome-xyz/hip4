// ---------------------------------------------------------------------------
// HIP-4 Price Binary Market Discovery
//
// Parses outcomeMeta descriptions and discovers active priceBinary markets.
// Returns typed PriceBinaryMarket objects with pre-computed asset IDs.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MarketType = "priceBinary" | "priceBucket";

export interface ParsedDescription {
  class: "priceBinary";
  underlying: string;
  expiry: Date;
  targetPrice: number;
  period: string;
}

export interface ParsedPriceBucketDescription {
  class: "priceBucket";
  underlying: string;
  expiry: Date;
  /** Sorted ascending price thresholds. N thresholds → N+1 buckets. */
  priceThresholds: number[];
  period: string;
}

/**
 * A single active HIP-4 recurring price binary market.
 *
 * Coin naming conventions:
 *   #<coinNum>    - API coin used in allMids, l2Book, candle, recentTrades
 *   @<pairNum>    - Token pair (EMPTY orderbook  - not traded directly)
 *   +<coinNum>    - Token balance key in spotClearinghouseState
 *   a = 100000000 + coinNum  - order asset field
 */
export interface PriceBinaryMarket {
  outcomeId: number;
  underlying: string;
  targetPrice: number;
  expiry: Date;
  period: string;
  yesCoinNum: number;
  noCoinNum: number;
  yesCoin: string;
  noCoin: string;
  yesAsset: number;
  noAsset: number;
}

const PREDICTION_ASSET_OFFSET = 100_000_000;

// ---------------------------------------------------------------------------
// Description parsing
// ---------------------------------------------------------------------------

/**
 * Parse a pipe-delimited outcome description string.
 *
 * Format: "class:priceBinary|underlying:BTC|expiry:20260310-0300|targetPrice:66200|period:15m"
 *
 * Returns null if not a valid priceBinary description.
 */
export function parseDescription(desc: string): ParsedDescription | null {
  if (!desc || !desc.includes("|")) return null;

  const fields: Record<string, string> = {};
  for (const pair of desc.split("|")) {
    const idx = pair.indexOf(":");
    if (idx > 0) {
      fields[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
  }

  if (fields.class !== "priceBinary") return null;
  if (!fields.underlying || !fields.expiry || !fields.targetPrice || !fields.period) {
    return null;
  }

  return {
    class: "priceBinary",
    underlying: fields.underlying,
    expiry: parseExpiry(fields.expiry),
    targetPrice: parseFloat(fields.targetPrice),
    period: fields.period,
  };
}

/**
 * Parse a pipe-delimited priceBucket description string.
 *
 * Format: "class:priceBucket|underlying:BTC|expiry:20260505-1700|priceThresholds:81015.3,81258.7|period:15m"
 *
 * Returns null if not a valid priceBucket description.
 */
export function parsePriceBucketDescription(
  desc: string,
): ParsedPriceBucketDescription | null {
  if (!desc || !desc.includes("|")) return null;

  const fields: Record<string, string> = {};
  for (const pair of desc.split("|")) {
    const idx = pair.indexOf(":");
    if (idx > 0) {
      fields[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
  }

  if (fields.class !== "priceBucket") return null;
  if (!fields.underlying || !fields.expiry || !fields.priceThresholds || !fields.period) {
    return null;
  }

  const priceThresholds = fields.priceThresholds
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (priceThresholds.length === 0) return null;

  return {
    class: "priceBucket",
    underlying: fields.underlying,
    expiry: parseExpiry(fields.expiry),
    priceThresholds,
    period: fields.period,
  };
}

function parseExpiry(s: string): Date {
  const year = parseInt(s.slice(0, 4));
  const month = parseInt(s.slice(4, 6)) - 1;
  const day = parseInt(s.slice(6, 8));
  const hour = parseInt(s.slice(9, 11));
  const min = parseInt(s.slice(11, 13));
  return new Date(Date.UTC(year, month, day, hour, min));
}

// ---------------------------------------------------------------------------
// Market discovery
// ---------------------------------------------------------------------------

interface OutcomeMeta {
  outcomes: Array<{
    outcome: number;
    name: string;
    description: string;
    sideSpecs: Array<{ name: string }>;
  }>;
  questions: unknown[];
}

/**
 * Discover all active priceBinary markets from outcomeMeta + allMids.
 *
 * A market is included when:
 * 1. Its description parses as class:priceBinary
 * 2. Expiry is in the future
 * 3. A live price exists in mids for the underlying
 */
export function discoverPriceBinaryMarkets(
  meta: OutcomeMeta,
  mids: Record<string, string>,
): PriceBinaryMarket[] {
  const markets: PriceBinaryMarket[] = [];

  for (const outcome of meta.outcomes) {
    const parsed = parseDescription(outcome.description);
    if (!parsed) continue;
    if (!mids[parsed.underlying]) continue;
    if (parsed.expiry.getTime() <= Date.now()) continue;

    const yesCoinNum = outcome.outcome * 10;
    const noCoinNum = outcome.outcome * 10 + 1;

    markets.push({
      outcomeId: outcome.outcome,
      underlying: parsed.underlying,
      targetPrice: parsed.targetPrice,
      expiry: parsed.expiry,
      period: parsed.period,
      yesCoinNum,
      noCoinNum,
      yesCoin: `#${yesCoinNum}`,
      noCoin: `#${noCoinNum}`,
      yesAsset: PREDICTION_ASSET_OFFSET + yesCoinNum,
      noAsset: PREDICTION_ASSET_OFFSET + noCoinNum,
    });
  }

  return markets;
}

// ---------------------------------------------------------------------------
// Time utilities
// ---------------------------------------------------------------------------

/** Minutes until market expires. Negative means already expired. */
export function timeToExpiry(market: PriceBinaryMarket): number {
  return (market.expiry.getTime() - Date.now()) / 60_000;
}

/**
 * Parse a period string to minutes.
 * "1m"→1, "5m"→5, "15m"→15, "1h"→60, "4h"→240, "1d"→1440
 */
export function periodMinutes(period: string): number {
  const match = period.match(/^(\d+)(m|h|d)$/);
  if (!match) return 15;

  const value = parseInt(match[1]);
  switch (match[2]) {
    case "m": return value;
    case "h": return value * 60;
    case "d": return value * 1440;
    default: return 15;
  }
}

/** Human-readable label: "BTC-1d", "HYPE-15m" */
export function formatMarketLabel(market: PriceBinaryMarket): string {
  return `${market.underlying}-${market.period}`;
}
