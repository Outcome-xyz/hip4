// ---------------------------------------------------------------------------
// HYPE/USDC spot markPx selector
//
// Pure selector over the bulk `spotAssetCtxs` WS subscription the app
// already maintains. No new WS subscription - the app pipes live spotAssetCtxs
// into its store, and consumers that need HYPE markPx just read through this
// selector. This is the authoritative price HL uses to debit Core→EVM gas
// when the sender has no HYPE on Core spot.
//
// Live-confirmed pair coins (2026-04-23):
//   - Mainnet: "@107"
//   - Testnet: "@1035"
// ---------------------------------------------------------------------------

import type { HLWsSpotAssetCtxItem } from "./types";

export const HYPE_USDC_SPOT_INDEX_MAINNET = 107 as const;
export const HYPE_USDC_SPOT_INDEX_TESTNET = 1035 as const;
export const HYPE_USDC_SPOT_PAIR_MAINNET =
  `@${HYPE_USDC_SPOT_INDEX_MAINNET}` as const;
export const HYPE_USDC_SPOT_PAIR_TESTNET =
  `@${HYPE_USDC_SPOT_INDEX_TESTNET}` as const;

export interface SelectHypeSpotMarkPxOptions {
  readonly testnet?: boolean;
}

/**
 * Pull the HYPE/USDC `markPx` (USD) from a bulk spotAssetCtxs store map.
 *
 * Returns `null` when the pair entry is missing or its markPx is not a
 * positive finite number. Callers should treat `null` as "price not yet
 * available" (pre-WS-hydration) rather than zero.
 *
 * Deliberately does NOT fall back to midPx when markPx is absent - midPx
 * diverges from markPx during volatile periods and using it would misprice
 * the fee relative to HL's actual debit.
 */
export function selectHypeSpotMarkPx(
  ctxs: Record<string, HLWsSpotAssetCtxItem | undefined>,
  options: SelectHypeSpotMarkPxOptions = {},
): number | null {
  const coin = options.testnet
    ? HYPE_USDC_SPOT_PAIR_TESTNET
    : HYPE_USDC_SPOT_PAIR_MAINNET;
  const ctx = ctxs[coin];
  if (!ctx) return null;
  const raw = ctx.markPx;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export interface SpotMetaShape {
  readonly tokens: ReadonlyArray<{ name: string; index: number }>;
  readonly universe: ReadonlyArray<{
    index: number;
    tokens: readonly [number, number];
  }>;
}

/**
 * Discover the HYPE/USDC pair coin string (`@N`) dynamically from spotMeta.
 *
 * Belt-and-suspenders against HL renumbering. The hardcoded constants above
 * are the steady-state truth; this helper lets a caller recover gracefully
 * if HL ever reindexes a pair. USDC is always token index 0.
 */
export function findHypeUsdcSpotPairCoin(meta: SpotMetaShape): string | null {
  const hype = meta.tokens.find((t) => t.name === "HYPE");
  if (!hype) return null;
  const pair = meta.universe.find(
    (p) => p.tokens[0] === hype.index && p.tokens[1] === 0,
  );
  if (!pair) return null;
  return `@${pair.index}`;
}
