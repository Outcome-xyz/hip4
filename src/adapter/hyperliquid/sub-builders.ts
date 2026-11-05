// ---------------------------------------------------------------------------
// Sub-builders: Hyperliquid's optional `builder.s` on the order action.
// Up to 5 entries of { b: address, s: share }. Share is in units of 0.001%
// of the builder fee (50000 = half). Shares must be positive and sum to at
// most 100%. The top builder keeps the remainder.
// Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#place-an-order
// ---------------------------------------------------------------------------

import type { SubBuilder } from "../../types/trading";
import type { HLSubBuilderWire } from "./types";

export const MAX_SUB_BUILDERS = 5;
/** Raw share units equal to 100% of the builder fee. */
export const SUB_BUILDER_SHARE_TOTAL = 100_000;
const UNITS_PER_PERCENT = SUB_BUILDER_SHARE_TOTAL / 100;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function toRawShare(sub: SubBuilder): number {
  const hasShare = sub.share !== undefined;
  const hasPercent = sub.sharePercent !== undefined;
  if (hasShare === hasPercent) {
    throw new Error(
      `Sub-builder ${sub.address}: provide exactly one of share or sharePercent`,
    );
  }

  const raw = hasShare
    ? (sub.share as number)
    : (sub.sharePercent as number) * UNITS_PER_PERCENT;
  const rounded = Math.round(raw);
  if (!Number.isFinite(raw) || Math.abs(raw - rounded) > 1e-9 || rounded <= 0) {
    throw new Error(
      `Sub-builder ${sub.address}: share must be a positive integer in 0.001% units (got ${raw})`,
    );
  }
  return rounded;
}

/**
 * Validate sub-builders and convert them to wire format.
 * Returns undefined for no sub-builders. Throws on invalid input.
 */
export function toWireSubBuilders(
  subBuilders: readonly SubBuilder[] | undefined,
): HLSubBuilderWire[] | undefined {
  if (!subBuilders || subBuilders.length === 0) return undefined;

  if (subBuilders.length > MAX_SUB_BUILDERS) {
    throw new Error(
      `At most ${MAX_SUB_BUILDERS} sub-builders allowed (got ${subBuilders.length})`,
    );
  }

  const wire = subBuilders.map((sub) => {
    if (!ADDRESS_RE.test(sub.address)) {
      throw new Error(`Sub-builder has invalid address: ${sub.address}`);
    }
    return { b: sub.address.toLowerCase(), s: toRawShare(sub) };
  });

  const total = wire.reduce((sum, w) => sum + w.s, 0);
  if (total > SUB_BUILDER_SHARE_TOTAL) {
    throw new Error(
      `Sub-builder shares must not exceed ${SUB_BUILDER_SHARE_TOTAL} (100%) in total (got ${total})`,
    );
  }

  return wire;
}
