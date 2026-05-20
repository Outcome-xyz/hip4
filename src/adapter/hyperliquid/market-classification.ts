// ---------------------------------------------------------------------------
// HIP-4 Market Classification
//
// Classifies raw HLOutcome objects into typed HIP4Market variants:
//   defaultBinary   - description parses as class:priceBinary (recurring)
//   priceBucket     - parent question parses as class:priceBucket (recurring)
//   multiOutcome    - outcome belongs to a non-priceBucket question group
//   labelledBinary  - everything else (standalone, any side labels)
//
// Detection priority:
//   1. priceBinary description parse → defaultBinary
//   2. Parent question is priceBucket → priceBucket
//   3. In a question's namedOutcomes or fallbackOutcome → multiOutcome
//   4. Fallthrough → labelledBinary
// ---------------------------------------------------------------------------

import type {
  DefaultBinaryMarket,
  HIP4Market,
  LabelledBinaryMarket,
  MarketSide,
  MultiOutcomeMarket,
  PriceBucketMarket,
} from "../../types/hip4-market";
import type { ParsedPriceBucketDescription } from "./market-discovery";
import {
  parseDescription,
  parsePriceBucketDescription,
} from "./market-discovery";
import type { HLOutcome, HLQuestion } from "./types";

const PREDICTION_ASSET_OFFSET = 100_000_000;

// ---------------------------------------------------------------------------
// Side builder
// ---------------------------------------------------------------------------

function buildSides(outcome: HLOutcome): [MarketSide, MarketSide] {
  return [
    {
      name: outcome.sideSpecs[0]?.name ?? "Side 0",
      coinNum: outcome.outcome * 10,
      coin: `#${outcome.outcome * 10}`,
      asset: PREDICTION_ASSET_OFFSET + outcome.outcome * 10,
    },
    {
      name: outcome.sideSpecs[1]?.name ?? "Side 1",
      coinNum: outcome.outcome * 10 + 1,
      coin: `#${outcome.outcome * 10 + 1}`,
      asset: PREDICTION_ASSET_OFFSET + outcome.outcome * 10 + 1,
    },
  ];
}

// ---------------------------------------------------------------------------
// Question lookup index
// ---------------------------------------------------------------------------

interface QuestionEntry {
  question: HLQuestion;
  isFallback: boolean;
  /** Index in question.namedOutcomes; -1 for fallback */
  bucketIndex: number;
  /** Pre-parsed priceBucket spec on the question, if any */
  bucket: ParsedPriceBucketDescription | null;
}

/**
 * Pre-computed lookup from outcomeId → parent question metadata.
 * Reuse across multiple `classifyOutcome` calls to avoid O(N) rebuilds per
 * call (see {@link buildQuestionIndex}).
 */
export interface QuestionIndex {
  /** outcomeId → entry */
  byOutcome: Map<number, QuestionEntry>;
}

/**
 * Build the question index once and reuse it when classifying many outcomes
 * via `classifyOutcome`. `classifyAllOutcomes` builds its own index
 * internally - this helper exists for callers that need per-outcome
 * classification in a loop.
 */
export function buildQuestionIndex(questions: HLQuestion[]): QuestionIndex {
  const byOutcome = new Map<number, QuestionEntry>();

  for (const q of questions) {
    const bucket = parsePriceBucketDescription(q.description);
    q.namedOutcomes.forEach((id, bucketIndex) => {
      byOutcome.set(id, {
        question: q,
        isFallback: false,
        bucketIndex,
        bucket,
      });
    });
    byOutcome.set(q.fallbackOutcome, {
      question: q,
      isFallback: true,
      bucketIndex: -1,
      bucket,
    });
  }

  return { byOutcome };
}

/**
 * Resolve the [lowerBound, upperBound) for a bucket within a priceBucket
 * question, given the question's `priceThresholds`. Bounds are half-open:
 * `lowerBound` is inclusive, `upperBound` is exclusive.
 *
 *   bucketIndex < 0           → both null (fallback bucket)
 *   bucketIndex === 0         → lowerBound is null (unbounded below)
 *   bucketIndex >= len        → upperBound is null (unbounded above)
 *
 * @param thresholds Sorted list of bucket boundaries from the question.
 * @param bucketIndex Position in the question's namedOutcomes array.
 */
export function getPriceBucketBounds(
  thresholds: readonly number[],
  bucketIndex: number,
): { lowerBound: number | null; upperBound: number | null } {
  if (bucketIndex < 0) return { lowerBound: null, upperBound: null };
  const lowerBound =
    bucketIndex === 0 ? null : (thresholds[bucketIndex - 1] ?? null);
  const upperBound =
    bucketIndex >= thresholds.length ? null : (thresholds[bucketIndex] ?? null);
  return { lowerBound, upperBound };
}

function buildPriceBucketMarket(
  outcome: HLOutcome,
  sides: [MarketSide, MarketSide],
  entry: QuestionEntry,
  bucket: ParsedPriceBucketDescription,
): PriceBucketMarket {
  const { lowerBound, upperBound } = getPriceBucketBounds(
    bucket.priceThresholds,
    entry.bucketIndex,
  );
  return {
    type: "priceBucket",
    outcomeId: outcome.outcome,
    name: outcome.name,
    description: outcome.description,
    sides,
    raw: outcome,
    underlying: bucket.underlying,
    expiry: bucket.expiry,
    priceThresholds: bucket.priceThresholds,
    period: bucket.period,
    questionId: entry.question.question,
    questionName: entry.question.name,
    questionDescription: entry.question.description,
    isFallback: entry.isFallback,
    bucketIndex: entry.bucketIndex,
    lowerBound,
    upperBound,
    rawQuestion: entry.question,
  };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify a single HLOutcome into a typed HIP4Market.
 *
 * Detection priority:
 *   1. Description parses as class:priceBinary → defaultBinary
 *   2. Outcome is in a question → multiOutcome (or priceBucket)
 *   3. Everything else → labelledBinary
 *
 * For batch classification, prefer `classifyAllOutcomes` (builds the index
 * once). When calling `classifyOutcome` repeatedly, pass a pre-built
 * `precomputedIndex` to avoid rebuilding it on every call:
 *
 *     const index = buildQuestionIndex(questions);
 *     for (const o of outcomes) classifyOutcome(o, questions, index);
 */
export function classifyOutcome(
  outcome: HLOutcome,
  questions: HLQuestion[],
  precomputedIndex?: QuestionIndex,
): HIP4Market {
  const sides = buildSides(outcome);
  const index = precomputedIndex ?? buildQuestionIndex(questions);

  // 1. Try priceBinary
  const parsed = parseDescription(outcome.description);
  if (parsed) {
    const market: DefaultBinaryMarket = {
      type: "defaultBinary",
      outcomeId: outcome.outcome,
      name: `${parsed.underlying} > $${parsed.targetPrice} (${parsed.period})`,
      description: `Will ${parsed.underlying} be above $${parsed.targetPrice} by expiry?`,
      sides,
      raw: outcome,
      underlying: parsed.underlying,
      targetPrice: parsed.targetPrice,
      expiry: parsed.expiry,
      period: parsed.period,
    };
    return market;
  }

  // 2. Check if in a question
  const questionEntry = index.byOutcome.get(outcome.outcome);
  if (questionEntry) {
    if (questionEntry.bucket) {
      return buildPriceBucketMarket(
        outcome,
        sides,
        questionEntry,
        questionEntry.bucket,
      );
    }
    const market: MultiOutcomeMarket = {
      type: "multiOutcome",
      outcomeId: outcome.outcome,
      name: outcome.name,
      description: outcome.description,
      sides,
      raw: outcome,
      questionId: questionEntry.question.question,
      questionName: questionEntry.question.name,
      questionDescription: questionEntry.question.description,
      isFallback: questionEntry.isFallback,
      rawQuestion: questionEntry.question,
    };
    return market;
  }

  // 3. Fallthrough  - labelledBinary
  const market: LabelledBinaryMarket = {
    type: "labelledBinary",
    outcomeId: outcome.outcome,
    name: outcome.name,
    description: outcome.description,
    sides,
    raw: outcome,
  };
  return market;
}

/**
 * Classify all outcomes in one pass.
 * Builds the question index once and reuses it.
 */
export function classifyAllOutcomes(
  outcomes: HLOutcome[],
  questions: HLQuestion[],
): HIP4Market[] {
  const index = buildQuestionIndex(questions);
  return outcomes.map((outcome) => {
    const sides = buildSides(outcome);
    const parsed = parseDescription(outcome.description);

    if (parsed) {
      return {
        type: "defaultBinary",
        outcomeId: outcome.outcome,
        name: `${parsed.underlying} > $${parsed.targetPrice} (${parsed.period})`,
        description: `Will ${parsed.underlying} be above $${parsed.targetPrice} by expiry?`,
        sides,
        raw: outcome,
        underlying: parsed.underlying,
        targetPrice: parsed.targetPrice,
        expiry: parsed.expiry,
        period: parsed.period,
      } satisfies DefaultBinaryMarket;
    }

    const questionEntry = index.byOutcome.get(outcome.outcome);
    if (questionEntry) {
      if (questionEntry.bucket) {
        return buildPriceBucketMarket(
          outcome,
          sides,
          questionEntry,
          questionEntry.bucket,
        );
      }
      return {
        type: "multiOutcome",
        outcomeId: outcome.outcome,
        name: outcome.name,
        description: outcome.description,
        sides,
        raw: outcome,
        questionId: questionEntry.question.question,
        questionName: questionEntry.question.name,
        questionDescription: questionEntry.question.description,
        isFallback: questionEntry.isFallback,
        rawQuestion: questionEntry.question,
      } satisfies MultiOutcomeMarket;
    }

    return {
      type: "labelledBinary",
      outcomeId: outcome.outcome,
      name: outcome.name,
      description: outcome.description,
      sides,
      raw: outcome,
    } satisfies LabelledBinaryMarket;
  });
}
