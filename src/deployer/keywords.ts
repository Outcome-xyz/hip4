// ---------------------------------------------------------------------------
// Reading a deployed outcome back
//
// @experimental A deployed outcome carries its keyword values in its
// description, pipe-joined and sorted, and its template in its name. That is
// enough to recover what the market is about, but two things get in the way:
//
//   Template generations and protocol-generated class markets name the same
//   concept differently. `binaryPrice` says `perp` / `threshold` / `time`
//   where a `class:priceBinary` market says `underlying` / `targetPrice` /
//   `expiry`, and `priceTouch` says `target` where `binaryPrice` says
//   `threshold`.
//
//   A template publishes up to two distinct times: when the event happens,
//   and the deadline by which resolution must be published. `sportsContest*`
//   carries both, as `scheduledStart` and `resolutionDeadline`; `binaryPrice`
//   carries only `time`. Conflating them makes every sports market look
//   overdue the moment kickoff passes.
//
// Keyword names below were taken from the live registry rather than assumed.
// ---------------------------------------------------------------------------

import type { HLOutcome, HLQuestion } from "../adapter/hyperliquid/types";
import {
  parseInstanceDescription,
  parseTemplateStamp,
  templateIdOfOutcome,
} from "./templates";

/**
 * Keywords that name the same thing under different names, mapped to the one
 * the current registry templates use. Protocol-generated `class:` markets are
 * the main source of the older names.
 */
export const KEYWORD_ALIASES: Readonly<Record<string, string>> = {
  underlying: "perp",
  targetPrice: "threshold",
  expiry: "time",
};

/**
 * Keywords that name when the event itself happens, most specific first.
 * Every one of these is published by a live template.
 */
export const EVENT_KEYWORDS: readonly string[] = [
  "time",
  "scheduledStart",
  "scheduledDecision",
];

/**
 * Keywords that name the deadline for publishing a resolution. Where a
 * template carries one, it is the protocol's own number and beats any window
 * a caller supplies.
 */
export const RESOLUTION_DEADLINE_KEYWORDS: readonly string[] = [
  "resolutionDeadline",
  "decisionDeadline",
];

/** Keywords naming the perp a price market is written against. */
export const PERP_KEYWORDS: readonly string[] = ["perp", "underlying"];

/** Keywords naming a single price level. */
export const THRESHOLD_KEYWORDS: readonly string[] = [
  "threshold",
  "target",
  "targetPrice",
];

/**
 * Rename aliased keywords to the name the current templates use. A canonical
 * name already present wins, so nothing is clobbered.
 */
export function canonicalKeywords(
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const canonical = KEYWORD_ALIASES[key] ?? key;
    if (canonical in out && KEYWORD_ALIASES[key] !== undefined) continue;
    out[canonical] = value;
  }
  return out;
}

function firstStamp(
  values: Record<string, string>,
  keys: readonly string[],
): Date | null {
  for (const key of keys) {
    const value = values[key];
    if (value === undefined) continue;
    const date = parseTemplateStamp(value);
    if (date) return date;
  }
  return null;
}

/**
 * When the underlying event happens, from a deployed market's keywords.
 *
 * Falls back to the earliest parseable stamp under any keyword, so a template
 * this SDK has not seen still yields something rather than nothing.
 */
export function eventAtFrom(values: Record<string, string>): Date | null {
  const canonical = canonicalKeywords(values);
  const named = firstStamp(canonical, EVENT_KEYWORDS);
  if (named) return named;

  const deadlines = new Set(RESOLUTION_DEADLINE_KEYWORDS);
  const stamps = Object.entries(canonical)
    .filter(([key]) => !deadlines.has(key))
    .map(([, value]) => parseTemplateStamp(value))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return stamps[0] ?? null;
}

/**
 * The deadline the template itself publishes for resolving, or null when it
 * publishes none.
 */
export function resolutionDeadlineFrom(
  values: Record<string, string>,
): Date | null {
  return firstStamp(canonicalKeywords(values), RESOLUTION_DEADLINE_KEYWORDS);
}

/** The perp a price market is written against, or null. */
export function perpFrom(values: Record<string, string>): string | null {
  for (const key of PERP_KEYWORDS) {
    const value = values[key];
    if (value) return value;
  }
  return null;
}

/**
 * The single price level a market settles against, as published. Returned as
 * a string: it is compared with decimal math, never parsed to a float.
 */
export function thresholdFrom(values: Record<string, string>): string | null {
  for (const key of THRESHOLD_KEYWORDS) {
    const value = values[key];
    if (value) return value;
  }
  return null;
}

/** The band of a scalar market (`scalePrice`, `sportsScalarMarket`), or null. */
export function scalarBandFrom(
  values: Record<string, string>,
): { low: string; high: string } | null {
  const { low, high } = values;
  return low !== undefined && high !== undefined ? { low, high } : null;
}

/** A deployed outcome, decoded. @experimental */
export interface DeployedOutcome {
  outcomeId: number;
  /** Registry template it came from, or null for a market with no template. */
  templateId: string | null;
  /** Keyword values with aliases resolved to current template names. */
  keywords: Record<string, string>;
  /** When the underlying event happens. */
  eventAt: Date | null;
  /** The template's own resolution deadline, where it publishes one. */
  resolutionDeadline: Date | null;
  perp: string | null;
  threshold: string | null;
  scalarBand: { low: string; high: string } | null;
  venue: string | null;
  sideNames: [string, string];
  /** The question this outcome belongs to, or null when it is standalone. */
  questionId: number | null;
  /** Whether it is the protocol-created fallback rather than a named outcome. */
  isFallback: boolean;
}

/** Index of outcome id to the question it belongs to. */
export function questionByOutcome(
  questions: readonly HLQuestion[],
): Map<number, HLQuestion> {
  const byOutcome = new Map<number, HLQuestion>();
  for (const q of questions) {
    for (const id of q.namedOutcomes) byOutcome.set(Number(id), q);
    if (q.fallbackOutcome !== undefined && q.fallbackOutcome !== null) {
      byOutcome.set(Number(q.fallbackOutcome), q);
    }
  }
  return byOutcome;
}

/**
 * Decode a live outcome from `outcomeMeta` into what it is about.
 *
 * This is the counterpart to registering one: the exchange assigns the id and
 * echoes the instance back as a description, and this reads it home again.
 *
 * Pass the parent question for an outcome that belongs to one. A question's
 * outcomes carry only their own keywords: registering `sportsContestResult`
 * puts `scheduledStart` and `resolutionDeadline` on the question, while each
 * named outcome gets just `participant:Alpha`, or nothing at all for a draw.
 * Without the parent, such an outcome has no derivable time. Verified against
 * a live registration on testnet, 19 Aug 2026.
 */
export function readDeployedOutcome(
  outcome: HLOutcome,
  question?: HLQuestion | null,
): DeployedOutcome {
  const keywords = canonicalKeywords(
    parseInstanceDescription(outcome.description),
  );
  const sides = outcome.sideSpecs.map((s) => String(s.name));
  const outcomeId = Number(outcome.outcome);

  /* Times fall back to the question's, never the other way round: an outcome
     that states its own time is the authority on it. */
  const parentKeywords = question
    ? canonicalKeywords(parseInstanceDescription(question.description ?? ""))
    : null;

  return {
    outcomeId,
    templateId: templateIdOfOutcome(outcome.name),
    keywords,
    eventAt:
      eventAtFrom(keywords) ??
      (parentKeywords ? eventAtFrom(parentKeywords) : null),
    resolutionDeadline:
      resolutionDeadlineFrom(keywords) ??
      (parentKeywords ? resolutionDeadlineFrom(parentKeywords) : null),
    perp: perpFrom(keywords) ?? (parentKeywords ? perpFrom(parentKeywords) : null),
    threshold:
      thresholdFrom(keywords) ??
      (parentKeywords ? thresholdFrom(parentKeywords) : null),
    scalarBand:
      scalarBandFrom(keywords) ??
      (parentKeywords ? scalarBandFrom(parentKeywords) : null),
    venue: outcome.venue ?? null,
    sideNames: [sides[0] ?? "Yes", sides[1] ?? "No"],
    questionId: question ? Number(question.question) : null,
    isFallback:
      question !== undefined &&
      question !== null &&
      Number(question.fallbackOutcome) === outcomeId,
  };
}

/**
 * Decode every outcome of an `outcomeMeta` payload, wiring each one to its
 * parent question so a question's outcomes inherit its times.
 */
export function readDeployedOutcomes(
  outcomes: readonly HLOutcome[],
  questions: readonly HLQuestion[] = [],
): DeployedOutcome[] {
  const parents = questionByOutcome(questions);
  return outcomes.map((o) =>
    readDeployedOutcome(o, parents.get(Number(o.outcome)) ?? null),
  );
}
