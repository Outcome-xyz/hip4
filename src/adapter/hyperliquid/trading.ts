// ---------------------------------------------------------------------------
// HIP-4 Trading Adapter
//
// Places/cancels orders via the HL exchange endpoint. Orders target
// per-side coins (#<outcomeId><sideIndex>) using standard HL order format.
//
// Asset ID mapping: 100_000_000 + outcomeId * 10 + sideIndex
// ---------------------------------------------------------------------------

import { fixed } from "../../lib/precision/io";
import {
  clamp,
  lt,
  min,
  mul,
  sub,
  toDecimal,
  toNum,
} from "../../lib/precision/primitives";
import type {
  PredictionBatchOrderResult,
  PredictionCancelParams,
  PredictionModifyParams,
  PredictionOrderParams,
  PredictionOrderResult,
} from "../../types/trading";
import type { PredictionTradingAdapter, WalletActionResult } from "../types";
import type { HIP4Auth } from "./auth";
import type { HIP4Client } from "./client";
import { sideAssetId } from "./client";
import { formatPrice, getMinShares, MIN_NOTIONAL, stripZeros } from "./pricing";
import {
  signL1Action,
  sortCancelAction,
  sortModifyAction,
  sortOrderAction,
  sortScheduleCancelAction,
  sortUserOutcomeAction,
} from "./signing";
import {
  type HLCancelAction,
  type HLCancelResponse,
  type HLModifyAction,
  type HLOrderAction,
  type HLOrderStatus,
  type HLOrderWire,
  type HLScheduleCancelAction,
  type HLUserOutcomeAction,
} from "./types";

// ---------------------------------------------------------------------------
// userOutcome action params
// ---------------------------------------------------------------------------

export interface SplitOutcomeParams {
  /** Outcome ID (numeric, matches HL's `outcomeMeta.outcomes[].outcome`). */
  outcome: number;
  /** Amount of quote tokens to split. Decimal string (e.g. "12.5"). */
  amount: string;
}

export interface MergeOutcomeParams {
  outcome: number;
  /** Amount of paired Yes+No shares to merge. `null` means max available. */
  amount: string | null;
}

export interface MergeQuestionParams {
  /** Question ID (numeric, matches HL's `outcomeMeta.questions[].question`). */
  question: number;
  /** Yes-share count to redeem from each member outcome. `null` = max. */
  amount: string | null;
}

export interface NegateOutcomeParams {
  question: number;
  /** Source outcome whose No shares are being converted. */
  outcome: number;
  /** No-share count to convert. */
  amount: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @deprecated Use {@link formatPrice} from pricing.ts instead.
 */
export function formatPredictionPrice(price: number): string {
  if (price <= 0) return "0";
  let formatted: string;
  if (price >= 1000) {
    formatted = Math.round(price).toString();
  } else if (price >= 10) {
    formatted = price.toFixed(1);
  } else if (price >= 1) {
    formatted = price.toFixed(2);
  } else {
    formatted = price.toFixed(4);
  }
  return formatted.replace(/\.?0+$/, "");
}

function mapTif(
  type: PredictionOrderParams["type"],
  tif?: PredictionOrderParams["timeInForce"],
): HLOrderWire["t"] {
  if (type === "market") {
    return { limit: { tif: "FrontendMarket" } };
  }
  switch (tif) {
    case "FOK":
      throw new Error(
        "FOK (Fill-or-Kill) is not supported by Hyperliquid. Use FAK (Fill-and-Kill / IoC) for immediate partial fills, or GTC for resting orders.",
      );
    case "FAK":
      return { limit: { tif: "Ioc" } };
    case "ALO":
      return { limit: { tif: "Alo" } };
    case "GTD":
      throw new Error(
        "GTD (Good-til-Date) is not supported for prediction markets on Hyperliquid. Use GTC for resting orders.",
      );
    case "GTC":
    case undefined:
    default:
      return { limit: { tif: "Gtc" } };
  }
}

function resolveAssetId(marketId: string, outcome: string): number {
  const outcomeId = parseInt(marketId, 10);

  if (outcome.startsWith("#") || outcome.startsWith("+")) {
    const num = outcome.slice(1);
    const sideIndex = parseInt(num.slice(-1), 10);
    if (sideIndex !== 0 && sideIndex !== 1) {
      throw new Error(
        `Invalid sideIndex ${sideIndex} in outcome "${outcome}". Must be 0 or 1.`,
      );
    }
    return sideAssetId(outcomeId, sideIndex);
  }

  const sideMatch = /(\d)$/.exec(outcome);
  if (sideMatch?.[1]) {
    const sideIndex = parseInt(sideMatch[1], 10);
    if (sideIndex > 1) {
      return sideAssetId(outcomeId, 0);
    }
    return sideAssetId(outcomeId, sideIndex);
  }

  return sideAssetId(outcomeId, 0);
}

function interpretStatus(
  status: HLOrderStatus,
): Pick<PredictionOrderResult, "orderId" | "status" | "shares" | "error"> {
  if ("filled" in status) {
    return {
      orderId: String(status.filled.oid),
      status: "filled",
      shares: status.filled.totalSz,
    };
  }
  if ("resting" in status) {
    return {
      orderId: String(status.resting.oid),
      status: "resting",
    };
  }
  if ("error" in status) {
    return {
      error: status.error,
      status: "error",
    };
  }
  return { status: "unknown" };
}

// ---------------------------------------------------------------------------
// HIP4TradingAdapter
// ---------------------------------------------------------------------------

export interface TradingAdapterConfig {
  builderAddress?: string;
  builderFee?: number;
}

export class HIP4TradingAdapter implements PredictionTradingAdapter {
  private readonly builderAddress?: string;
  private readonly builderFee?: number;

  constructor(
    private readonly client: HIP4Client,
    private readonly auth: HIP4Auth,
    config?: TradingAdapterConfig,
  ) {
    this.builderAddress = config?.builderAddress;
    this.builderFee = config?.builderFee;
  }

  private buildOrderWire(
    params: PredictionOrderParams,
  ): { wire: HLOrderWire } | { error: string } {
    const assetId = resolveAssetId(params.marketId, params.outcome);
    const isBuy = params.side === "buy";
    const amount = stripZeros(params.amount);

    let price: string;
    if (params.type === "market") {
      price = isBuy ? "0.99999" : "0.00001";

      this.client.log(
        "debug",
        `Market order: side=${isBuy ? "buy" : "sell"}, price=${price} (FrontendMarket best-execution)`,
      );
    } else {
      const rawPrice = toNum(toDecimal(params.price ?? "0"));
      price = formatPrice(rawPrice);
      this.client.log("debug", `Limit order: price=${price}`);

      const numericSize = toDecimal(amount);

      if (params.markPx !== undefined && !params.skipMinNotionalCheck) {
        const minShares = getMinShares(params.markPx);
        if (numericSize.lt(minShares)) {
          return {
            error: `Size ${numericSize} below minimum ${minShares} shares (markPx=${params.markPx})`,
          };
        }
      }

      const effectiveNotional =
        params.markPx !== undefined
          ? mul(
              amount,
              clamp(
                min(String(params.markPx), sub("1", String(params.markPx))),
                "0.01",
                "1",
              ),
            )
          : mul(price, amount);

      if (
        !params.skipMinNotionalCheck &&
        lt(effectiveNotional, String(MIN_NOTIONAL))
      ) {
        return {
          error: `Notional $${fixed(effectiveNotional, 2)} below minimum $${MIN_NOTIONAL}`,
        };
      }
    }

    return {
      wire: {
        a: assetId,
        b: isBuy,
        p: price,
        s: amount,
        r: false,
        t: mapTif(params.type, params.timeInForce),
      },
    };
  }

  async placeOrder(
    params: PredictionOrderParams,
  ): Promise<PredictionOrderResult> {
    const signer = this.auth.getSigner();
    if (!signer) {
      return {
        success: false,
        error: "Not authenticated. Call auth.initAuth() first.",
      };
    }

    const wireResult = this.buildOrderWire(params);
    if ("error" in wireResult) {
      return { success: false, error: wireResult.error };
    }

    const action: HLOrderAction & { builder?: { b: string; f: number } } = {
      type: "order",
      orders: [wireResult.wire],
      grouping: "na",
    };

    // Use per-order builder params if provided, otherwise fall back to adapter-level config
    const effectiveBuilderAddress =
      params.builderAddress ?? this.builderAddress;
    const effectiveBuilderFee = params.builderFee ?? this.builderFee;

    if (effectiveBuilderAddress) {
      action.builder = {
        b: effectiveBuilderAddress.toLowerCase(),
        f: effectiveBuilderFee ?? 0,
      };
    }

    const sortedAction = sortOrderAction(action);

    this.client.log("debug", "Order wire", wireResult.wire);

    try {
      const nonce = Date.now();
      const signature = await signL1Action({
        signer,
        action: sortedAction,
        nonce,
        isTestnet: this.client.testnet,
      });

      const res = await this.client.placeOrder(
        sortedAction,
        nonce,
        signature,
        null,
      );

      if (res.status !== "ok" || !res.response) {
        return { success: false, error: "Exchange returned non-ok status" };
      }

      const firstStatus = res.response.data.statuses[0];
      if (!firstStatus) {
        return { success: false, error: "No order status returned" };
      }

      const result = interpretStatus(firstStatus);
      return {
        success: !result.error,
        ...result,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown order error";
      return { success: false, error: message };
    }
  }

  async placeOrders(
    params: PredictionOrderParams[],
  ): Promise<PredictionBatchOrderResult> {
    if (params.length === 0) {
      return { success: true, results: [] };
    }

    const signer = this.auth.getSigner();
    if (!signer) {
      return {
        success: false,
        results: params.map(() => ({
          success: false,
          error: "Not authenticated. Call auth.initAuth() first.",
        })),
      };
    }

    // Build wires, tracking which input indices have pre-validation errors
    const results: PredictionOrderResult[] = new Array(params.length);
    const validWires: HLOrderWire[] = [];
    const wireToInputIndex: number[] = [];

    for (let i = 0; i < params.length; i++) {
      const wireResult = this.buildOrderWire(params[i]);
      if ("error" in wireResult) {
        results[i] = { success: false, error: wireResult.error };
      } else {
        wireToInputIndex.push(i);
        validWires.push(wireResult.wire);
      }
    }

    if (validWires.length === 0) {
      return { success: false, results };
    }

    const action: HLOrderAction & { builder?: { b: string; f: number } } = {
      type: "order",
      orders: validWires,
      grouping: "na",
    };

    if (this.builderAddress) {
      action.builder = {
        b: this.builderAddress.toLowerCase(),
        f: this.builderFee ?? 0,
      };
    }

    const sortedAction = sortOrderAction(action);

    this.client.log("debug", `Batch order: ${validWires.length} wires`);

    try {
      const nonce = Date.now();
      const signature = await signL1Action({
        signer,
        action: sortedAction,
        nonce,
        isTestnet: this.client.testnet,
      });

      const res = await this.client.placeOrder(
        sortedAction,
        nonce,
        signature,
        null,
      );

      if (res.status !== "ok" || !res.response) {
        for (const idx of wireToInputIndex) {
          results[idx] = {
            success: false,
            error: "Exchange returned non-ok status",
          };
        }
        return { success: false, results };
      }

      const statuses = res.response.data.statuses;
      for (let j = 0; j < wireToInputIndex.length; j++) {
        const inputIdx = wireToInputIndex[j];
        const status = statuses[j];
        if (!status) {
          results[inputIdx] = {
            success: false,
            error: "No order status returned",
          };
        } else {
          const interpreted = interpretStatus(status);
          results[inputIdx] = { success: !interpreted.error, ...interpreted };
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown order error";
      for (const idx of wireToInputIndex) {
        results[idx] = { success: false, error: message };
      }
    }

    const allSuccess = results.every((r) => r.success);
    return { success: allSuccess, results };
  }

  async cancelOrder(
    params: PredictionCancelParams[],
  ): Promise<HLCancelResponse> {
    const signer = this.auth.getSigner();
    if (!signer) {
      throw new Error("Not authenticated. Call auth.initAuth() first.");
    }

    if (params.length === 0) {
      throw new Error("cancelOrder requires at least one order to cancel.");
    }

    const cancels = params.map((p) => {
      const assetId = p.outcome
        ? resolveAssetId(p.marketId, p.outcome)
        : sideAssetId(parseInt(p.marketId, 10), 0);
      return { a: assetId, o: parseInt(p.orderId, 10) };
    });

    const action: HLCancelAction = {
      type: "cancel",
      cancels,
    };

    const sortedAction = sortCancelAction(action);

    const nonce = Date.now();
    const signature = await signL1Action({
      signer,
      action: sortedAction,
      nonce,
      isTestnet: this.client.testnet,
    });

    return this.client.cancelOrder(sortedAction, nonce, signature, null);
  }

  async modifyOrder(
    params: PredictionModifyParams,
  ): Promise<PredictionOrderResult> {
    const signer = this.auth.getSigner();
    if (!signer) {
      return {
        success: false,
        error: "Not authenticated. Call auth.initAuth() first.",
      };
    }

    // Reuse buildOrderWire so modify shares the same price/size/notional
    // validation as placeOrder - the wire format is identical.
    const wireResult = this.buildOrderWire({
      marketId: params.marketId,
      outcome: params.outcome,
      side: params.side,
      type: params.type,
      price: params.price,
      amount: params.amount,
      timeInForce: params.timeInForce,
      markPx: params.markPx,
    });
    if ("error" in wireResult) {
      return { success: false, error: wireResult.error };
    }

    const oid = parseInt(params.orderId, 10);
    if (!Number.isFinite(oid)) {
      return { success: false, error: `Invalid orderId "${params.orderId}"` };
    }

    const action: HLModifyAction = {
      type: "modify",
      oid,
      order: wireResult.wire,
    };
    const sortedAction = sortModifyAction(action);

    this.client.log("debug", "Modify wire", {
      oid,
      order: wireResult.wire,
    });

    try {
      const nonce = Date.now();
      const signature = await signL1Action({
        signer,
        action: sortedAction,
        nonce,
        isTestnet: this.client.testnet,
      });

      const res = await this.client.modifyOrder(
        sortedAction,
        nonce,
        signature,
        null,
      );

      if (res.status !== "ok") {
        // HL returns the rejection reason as a plain string in `response`
        // on top-level errors (e.g. "Price would cross book"). Surface it
        // so users see something actionable instead of a generic string.
        const errorMsg =
          typeof res.response === "string"
            ? res.response
            : "Exchange returned non-ok status";
        return { success: false, error: errorMsg };
      }

      // Modify's success response shape is looser than placeOrder: HL
      // sometimes omits `response.data.statuses` (just returns
      // `{status: "ok"}`). Treat that as "order still resting at the same
      // oid" rather than crashing the UI. Structured responses only -
      // string responses on success are not a thing HL sends.
      const structured =
        res.response && typeof res.response !== "string" ? res.response : null;
      const firstStatus = structured?.data?.statuses?.[0];
      if (!firstStatus) {
        return {
          success: true,
          orderId: String(oid),
          status: "resting",
        };
      }

      const result = interpretStatus(firstStatus);
      return {
        success: !result.error,
        ...result,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown modify error";
      return { success: false, error: message };
    }
  }

  // -------------------------------------------------------------------------
  // userOutcome share-conversion actions
  //
  // All four variants share the same envelope (`type: "userOutcome"`) and use
  // L1 agent signing - same authority as orders, so an active agent is
  // required. They affect the user's spot balances directly (no order book).
  // -------------------------------------------------------------------------

  /** Split X quote tokens into X Yes + X No shares of one outcome. */
  async splitOutcome(params: SplitOutcomeParams): Promise<WalletActionResult> {
    return this.submitUserOutcomeAction({
      type: "userOutcome",
      splitOutcome: { outcome: params.outcome, amount: params.amount },
    });
  }

  /** Merge X Yes + X No shares of one outcome back into X quote tokens. */
  async mergeOutcome(params: MergeOutcomeParams): Promise<WalletActionResult> {
    return this.submitUserOutcomeAction({
      type: "userOutcome",
      mergeOutcome: { outcome: params.outcome, amount: params.amount },
    });
  }

  /** Merge X Yes shares from every outcome of a question into X quote tokens. */
  async mergeQuestion(
    params: MergeQuestionParams,
  ): Promise<WalletActionResult> {
    return this.submitUserOutcomeAction({
      type: "userOutcome",
      mergeQuestion: { question: params.question, amount: params.amount },
    });
  }

  /**
   * Convert X No shares of one outcome into X Yes shares of every *other*
   * outcome belonging to the same question (including the fallback). The
   * wire sub-key is `negateOutcome` - confirmed against HL's own testnet
   * "Convert Outcomes" UI; their docs body's `negateQuestion` is a typo.
   */
  async negateOutcome(
    params: NegateOutcomeParams,
  ): Promise<WalletActionResult> {
    return this.submitUserOutcomeAction({
      type: "userOutcome",
      negateOutcome: {
        question: params.question,
        outcome: params.outcome,
        amount: params.amount,
      },
    });
  }

  private async submitUserOutcomeAction(
    action: HLUserOutcomeAction,
  ): Promise<WalletActionResult> {
    const signer = this.auth.getSigner();
    if (!signer) {
      return {
        success: false,
        error: "Not authenticated. Call auth.initAuth() first.",
      };
    }

    try {
      const sorted = sortUserOutcomeAction(action);
      const nonce = Date.now();
      this.client.log("debug", "userOutcome action wire", sorted);
      const signature = await signL1Action({
        signer,
        action: sorted,
        nonce,
        isTestnet: this.client.testnet,
      });

      const res = await this.client.submitUserSignedAction(
        sorted as unknown as Record<string, unknown>,
        nonce,
        signature,
      );

      if (res.status === "ok") return { success: true };

      let errorMsg = "User outcome action failed";
      if (typeof res.response === "string") {
        errorMsg = res.response;
      } else if (
        res.response &&
        typeof res.response === "object" &&
        !Array.isArray(res.response)
      ) {
        const obj = res.response as Record<string, unknown>;
        if (typeof obj.error === "string") errorMsg = obj.error;
      }
      return { success: false, error: errorMsg };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown user outcome error";
      return { success: false, error: message };
    }
  }

  // -------------------------------------------------------------------------
  // scheduleCancel - HL "dead-man's switch"
  //
  // Registers a future timestamp at which HL cancels every open order from
  // this agent. Per-agent, not per-order: a new schedule replaces the
  // previous one. Pass `null` to clear an existing schedule.
  //
  // Use case: arm 1h before a HIP-4 market's settlement so resting limits
  // never sit through the auction unprotected.
  // -------------------------------------------------------------------------

  async scheduleCancel(time: number | null): Promise<WalletActionResult> {
    const signer = this.auth.getSigner();
    if (!signer) {
      return {
        success: false,
        error: "Not authenticated. Call auth.initAuth() first.",
      };
    }

    try {
      const action: HLScheduleCancelAction = {
        type: "scheduleCancel",
        time,
      };
      const sorted = sortScheduleCancelAction(action);
      const nonce = Date.now();
      this.client.log("debug", "scheduleCancel action wire", sorted);
      const signature = await signL1Action({
        signer,
        action: sorted,
        nonce,
        isTestnet: this.client.testnet,
      });

      const res = await this.client.submitUserSignedAction(
        sorted as unknown as Record<string, unknown>,
        nonce,
        signature,
      );

      if (res.status === "ok") return { success: true };

      let errorMsg = "scheduleCancel failed";
      if (typeof res.response === "string") {
        errorMsg = res.response;
      } else if (
        res.response &&
        typeof res.response === "object" &&
        !Array.isArray(res.response)
      ) {
        const obj = res.response as Record<string, unknown>;
        if (typeof obj.error === "string") errorMsg = obj.error;
      }
      return { success: false, error: errorMsg };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown scheduleCancel error";
      return { success: false, error: message };
    }
  }
}
