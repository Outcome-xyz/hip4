// ---------------------------------------------------------------------------
// What a deployer owes settlement on
//
// @experimental Settlement is the one irreversible action with a penalty
// attached to its deadline, so this is deliberately built to derive its
// answers rather than be told them: a market is overdue because its own
// published time says so and it is still listed in `outcomeMeta`, never
// because something upstream reported it late. A watcher that depends on the
// thing it watches cannot see the failure where nothing arrives at all.
//
// Where a template publishes its own resolution deadline, that is the
// protocol's number and it is used. Where it does not, the caller supplies a
// window. There is no default: HIP-4 does not publish a general settlement
// window, and inventing one here would put a number in front of an operator
// that nothing stands behind.
// ---------------------------------------------------------------------------

import type { HLOutcome } from "../adapter/hyperliquid/types";
import { gt, toDecimal } from "../lib/precision/primitives";
import { readDeployedOutcome, type DeployedOutcome } from "./keywords";

/** How long a market gets, where its template does not say. @experimental */
export interface SettlementWindow {
  /**
   * Milliseconds after the event before a settlement is expected, used only
   * for templates that publish no `resolutionDeadline` of their own.
   *
   * Required on purpose. Confirm the figure that applies to your deployer
   * rather than taking one from an SDK.
   */
  settleWithinMs: number;
  /** How far ahead of a deadline to start reporting `due`. Defaults to 0. */
  warnLeadMs?: number;
  now?: number;
}

/** Where one outcome stands against its deadline. @experimental */
export type SettlementState =
  /** No time could be derived, so nothing here can say whether it is late. */
  | "unknown"
  /** The event has not happened yet. */
  | "waiting"
  /** The event has happened and the deadline is close or reached. */
  | "due"
  /** Past the deadline, and still listed as unsettled. */
  | "overdue";

/** One outcome's settlement position. @experimental */
export interface SettlementStatus {
  outcome: DeployedOutcome;
  state: SettlementState;
  /** When settlement is expected by. Null when no time could be derived. */
  deadline: Date | null;
  /** Whether that deadline came from the template rather than the window. */
  deadlineIsPublished: boolean;
  /** Milliseconds past the deadline, floored at zero. */
  lateBy: number;
  /** One sentence, for whoever is being handed the list. */
  why: string;
}

function ago(ms: number): string {
  const minute = 60_000;
  const hour = 60 * minute;
  if (ms < hour) return `${Math.round(ms / minute)}m`;
  if (ms < 24 * hour) return `${(ms / hour).toFixed(1)}h`;
  return `${Math.round(ms / (24 * hour))}d`;
}

/**
 * Where one live outcome stands. It being present in `outcomeMeta` at all is
 * what makes it unsettled: settling prunes it.
 *
 * A raw `HLOutcome` is decoded without a parent question, so a named outcome
 * passed that way reads as `unknown`: its times live on the question. Decode
 * with `readDeployedOutcomes(outcomes, questions)` first, or use
 * `deployer.fetchSettlementQueue`, which does it for you.
 */
export function settlementStatus(
  outcome: HLOutcome | DeployedOutcome,
  window: SettlementWindow,
): SettlementStatus {
  const decoded =
    "keywords" in outcome ? outcome : readDeployedOutcome(outcome);
  const now = window.now ?? Date.now();
  const warnLead = window.warnLeadMs ?? 0;

  const published = decoded.resolutionDeadline;
  const derived =
    decoded.eventAt === null
      ? null
      : new Date(decoded.eventAt.getTime() + window.settleWithinMs);
  const deadline = published ?? derived;

  if (deadline === null) {
    return {
      outcome: decoded,
      state: "unknown",
      deadline: null,
      deadlineIsPublished: false,
      lateBy: 0,
      why: "No time could be read from this market, so whether it is late is unknown.",
    };
  }

  const lateBy = Math.max(0, now - deadline.getTime());
  const base = {
    outcome: decoded,
    deadline,
    deadlineIsPublished: published !== null,
    lateBy,
  };

  if (lateBy > 0) {
    return {
      ...base,
      state: "overdue",
      why: `Unsettled ${ago(lateBy)} past its deadline. Settlement deadlines carry a penalty.`,
    };
  }
  if (decoded.eventAt !== null && decoded.eventAt.getTime() > now) {
    return {
      ...base,
      state: "waiting",
      why: "The event has not happened yet.",
    };
  }
  if (now >= deadline.getTime() - warnLead) {
    return {
      ...base,
      state: "due",
      why: `Resolvable now, and due in ${ago(deadline.getTime() - now)}.`,
    };
  }
  return {
    ...base,
    state: "waiting",
    why: "The event has resolved and there is time in hand.",
  };
}

/**
 * Everything a deployer still owes settlement on, worst first. Markets that
 * are simply waiting are dropped; `unknown` is kept, because a market nothing
 * can judge is exactly the one worth looking at.
 *
 * Pass outcomes already decoded with `readDeployedOutcomes` so a question's
 * outcomes carry its times; see {@link settlementStatus}.
 */
export function settlementQueue(
  outcomes: readonly (HLOutcome | DeployedOutcome)[],
  window: SettlementWindow,
): SettlementStatus[] {
  const rank: Record<SettlementState, number> = {
    overdue: 0,
    due: 1,
    unknown: 2,
    waiting: 3,
  };
  return outcomes
    .map((o) => settlementStatus(o, window))
    .filter((s) => s.state !== "waiting")
    .sort((a, b) => rank[a.state] - rank[b.state] || b.lateBy - a.lateBy);
}

/** What the mark price implies, and why. @experimental */
export interface SettlementSuggestion {
  /** `"1"` pays the first side, `"0"` the second. */
  settleFraction: "1" | "0";
  why: string;
}

/**
 * What a price market's own rule implies, given the mark at settlement time.
 *
 * The rule is the template's, not this SDK's: `binaryPrice` reads "if the
 * {perp} mark price at time of settlement is above {threshold}, Yes tokens pay
 * out $1 each. Otherwise, No tokens pay out $1 each."
 *
 * A suggestion only. The deployer is the oracle and the settlement is its
 * call; returns null until the event time has passed, so a mark read early is
 * never mistaken for a result.
 */
export function suggestPriceSettlement(params: {
  /** Mark price as a decimal string. Compared with decimal math, not floats. */
  markPx: string;
  threshold: string;
  /** The market's event time. Null suppresses the suggestion. */
  eventAt: Date | null;
  now?: number;
}): SettlementSuggestion | null {
  const now = params.now ?? Date.now();
  if (params.eventAt === null || params.eventAt.getTime() > now) return null;

  const mark = toDecimal(params.markPx);
  const level = toDecimal(params.threshold);
  return gt(mark, level)
    ? {
        settleFraction: "1",
        why: `Mark ${mark.toString()} is above ${level.toString()}, so the first side pays.`,
      }
    : {
        settleFraction: "0",
        why: `Mark ${mark.toString()} is not above ${level.toString()}, so the second side pays.`,
      };
}
