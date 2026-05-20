// ---------------------------------------------------------------------------
// HIP-4 Event Adapter - maps outcomeMeta to PredictionEvent / PredictionCategory
//
// Mapping:
//   HL Question  → PredictionEvent  (groups multiple outcomes)
//   HL Outcome   → PredictionMarket (has 2 sides as outcomes)
//   HL SideSpec  → PredictionOutcome
//   Standalone outcomes (not in a question) become their own event.
// ---------------------------------------------------------------------------

import type {
  PredictionCategory,
  PredictionEvent,
  PredictionMarket,
  PredictionOutcome,
} from "../../types/event";
import type {
  FetchMarketsParams,
  HIP4Market,
  MarketsByQuestion,
  MarketsByType,
  MultiOutcomeMarket,
} from "../../types/hip4-market";
import type { PredictionEventAdapter, Unsubscribe } from "../types";
import type { HIP4Client } from "./client";
import { sideCoin } from "./client";
import { classifyAllOutcomes } from "./market-classification";
import type {
  HLOutcome,
  HLOutcomeMeta,
  HLQuestion,
  HLWsOutcomeMetaUpdate,
  HLWsOutcomeMetaUpdates,
} from "./types";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const CATEGORIES: PredictionCategory[] = [
  { id: "custom", name: "Custom", slug: "custom" },
  { id: "recurring", name: "Recurring", slug: "recurring" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecurring(outcome: HLOutcome): boolean {
  return outcome.name === "Recurring";
}

/** Parse "class:priceBinary|underlying:BTC|expiry:20260311-0300|targetPrice:69070|period:1d" */
function parseRecurringDescription(
  desc: string,
): Record<string, string> | null {
  if (!desc.includes("|")) return null;
  const result: Record<string, string> = {};
  for (const segment of desc.split("|")) {
    const [key, ...rest] = segment.split(":");
    if (key && rest.length > 0) {
      result[key] = rest.join(":");
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function recurringTitle(outcome: HLOutcome): string {
  const parsed = parseRecurringDescription(outcome.description);
  if (!parsed) return `Outcome #${outcome.outcome}`;

  const underlying = parsed.underlying ?? "???";
  const target = parsed.targetPrice ?? "???";
  const period = parsed.period ?? "";

  if (parsed.class === "priceBinary") {
    return `${underlying} > $${target} (${period})`;
  }
  return `${underlying} ${parsed.class ?? "outcome"} (${period})`;
}

function recurringDescription(outcome: HLOutcome): string {
  const parsed = parseRecurringDescription(outcome.description);
  if (!parsed) return outcome.description;

  const expiry = parsed.expiry ?? "unknown";
  return `Will ${parsed.underlying ?? "asset"} be above $${parsed.targetPrice ?? "?"} by ${expiry}?`;
}

function mapOutcomeToMarket(
  outcome: HLOutcome,
  eventId: string,
): PredictionMarket {
  const outcomes: PredictionOutcome[] = outcome.sideSpecs.map(
    (spec, sideIndex) => ({
      name: spec.name,
      tokenId: sideCoin(outcome.outcome, sideIndex),
      price: "0",
    }),
  );

  return {
    id: String(outcome.outcome),
    eventId,
    question: isRecurring(outcome)
      ? recurringDescription(outcome)
      : outcome.name,
    outcomes,
    volume: "0",
    liquidity: "0",
  };
}

function mapQuestionToEvent(
  question: HLQuestion,
  outcomeMap: Map<number, HLOutcome>,
): PredictionEvent {
  const eventId = `q${question.question}`;
  const allOutcomeIds = [
    ...question.namedOutcomes,
    question.fallbackOutcome,
  ].filter((id) => outcomeMap.has(id));

  const markets = allOutcomeIds
    .map((id) => outcomeMap.get(id)!)
    .map((o) => mapOutcomeToMarket(o, eventId));

  const settled = new Set(question.settledNamedOutcomes);
  const hasUnsettled = question.namedOutcomes.some((id) => !settled.has(id));

  return {
    id: eventId,
    title: question.name,
    description: question.description,
    category: "custom",
    markets,
    totalVolume: "0",
    endDate: "",
    status: hasUnsettled ? "active" : "resolved",
  };
}

function mapStandaloneOutcomeToEvent(outcome: HLOutcome): PredictionEvent {
  const eventId = `o${outcome.outcome}`;
  const recurring = isRecurring(outcome);

  return {
    id: eventId,
    title: recurring ? recurringTitle(outcome) : outcome.name,
    description: recurring
      ? recurringDescription(outcome)
      : outcome.description,
    category: recurring ? "recurring" : "custom",
    markets: [mapOutcomeToMarket(outcome, eventId)],
    totalVolume: "0",
    endDate: recurring
      ? (parseRecurringDescription(outcome.description)?.expiry ?? "")
      : "",
    status: "active",
  };
}

// ---------------------------------------------------------------------------
// HIP4EventAdapter
// ---------------------------------------------------------------------------

/**
 * Resolve side names for an outcome by ID.
 * Returns [side0Name, side1Name] (e.g. ["Yes", "No"] or ["Hypurr", "Usain Bolt"]).
 * Returns null if the outcome ID is unknown.
 */
export type SideNameResolver = (outcomeId: number) => [string, string] | null;

export class HIP4EventAdapter implements PredictionEventAdapter {
  private cache: { events: PredictionEvent[]; timestamp: number } | null = null;
  private metaCache: {
    meta: HLOutcomeMeta;
    mids: Record<string, string>;
    markets: HIP4Market[];
    timestamp: number;
  } | null = null;
  private static readonly CACHE_TTL_MS = 30_000;

  /** Side names from outcomeMeta. Populated once, never cleared (sideSpecs don't change). */
  private sideNames: Map<number, [string, string]> | null = null;

  constructor(private readonly client: HIP4Client) {}

  /** Returns a resolver function that looks up side names by outcome ID. */
  getSideNameResolver(): SideNameResolver {
    return (outcomeId: number) => this.sideNames?.get(outcomeId) ?? null;
  }

  /** Ensure sideNames are loaded. Call before using the resolver if data may not be cached yet. */
  async ensureSideNames(): Promise<void> {
    if (this.sideNames) return;
    const meta = await this.client.fetchOutcomeMeta();
    this.populateSideNames(meta);
  }

  /**
   * Subscribe to live outcome-meta updates (HIP-4 catalog changes).
   *
   * Each frame is an array of one or more updates. The handler is invoked
   * once per update with the discriminated payload. Internally we also:
   *   - extend `sideNames` for newly created outcomes (so `getSideNameResolver`
   *     returns real names instead of falling back to "Side 0/1")
   *   - invalidate the events + markets caches so the next read refetches
   *     and reflects the change
   *
   * Returns an unsubscribe callback.
   */
  subscribeOutcomeMetaUpdates(
    onData: (update: HLWsOutcomeMetaUpdate) => void,
  ): Unsubscribe {
    return this.client.subscribe(
      { type: "outcomeMetaUpdates" },
      (raw: unknown) => {
        if (!Array.isArray(raw)) return;
        const updates = raw as HLWsOutcomeMetaUpdates;
        for (const update of updates) {
          this.applyMetaUpdate(update);
          onData(update);
        }
      },
    );
  }

  private applyMetaUpdate(update: HLWsOutcomeMetaUpdate): void {
    if ("outcomeCreated" in update) {
      const spec = update.outcomeCreated;
      // Grow sideNames in place so callers using getSideNameResolver pick
      // up the new outcome immediately. populateSideNames is gated on
      // `!sideNames` and won't overwrite existing entries.
      if (this.sideNames && spec.sideSpecs.length >= 2) {
        this.sideNames.set(spec.outcome, [
          spec.sideSpecs[0].name,
          spec.sideSpecs[1].name,
        ]);
      }
    }
    // All four variants change the catalog - drop the time-based caches so
    // the next loadEvents/loadMarkets call refetches.
    this.cache = null;
    this.metaCache = null;
  }

  private populateSideNames(meta: HLOutcomeMeta): void {
    if (this.sideNames) return;
    this.sideNames = new Map();
    for (const o of meta.outcomes) {
      if (o.sideSpecs.length >= 2) {
        this.sideNames.set(o.outcome, [
          o.sideSpecs[0].name,
          o.sideSpecs[1].name,
        ]);
      }
    }
  }

  async fetchEvents(
    params: {
      category?: string;
      active?: boolean;
      limit?: number;
      offset?: number;
      query?: string;
    } = {},
  ): Promise<PredictionEvent[]> {
    let events = await this.loadEvents();

    if (params.category && params.category !== "all") {
      events = events.filter((e) => e.category === params.category);
    }

    if (params.active) {
      events = events.filter((e) => e.status === "active");
    }

    if (params.query) {
      const q = params.query.toLowerCase();
      events = events.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q),
      );
    }

    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    return events.slice(offset, offset + limit);
  }

  async fetchEvent(eventId: string): Promise<PredictionEvent> {
    const events = await this.loadEvents();
    const event = events.find((e) => e.id === eventId);
    if (!event) {
      throw new Error(`HIP-4 event not found: ${eventId}`);
    }
    return event;
  }

  async fetchCategories(): Promise<PredictionCategory[]> {
    return CATEGORIES;
  }

  // -------------------------------------------------------------------------
  // fetchMarkets  - typed HIP4Market discovery
  // -------------------------------------------------------------------------

  /**
   * Fetch and classify all HIP-4 markets.
   *
   * Supports optional type filtering, groupBy, limit, and offset.
   * Results are cached for CACHE_TTL_MS alongside the events cache.
   */
  async fetchMarkets(
    params?: FetchMarketsParams,
  ): Promise<HIP4Market[] | MarketsByType | MarketsByQuestion>;
  async fetchMarkets(
    params: FetchMarketsParams = {},
  ): Promise<HIP4Market[] | MarketsByType | MarketsByQuestion> {
    const allMarkets = await this.loadMarkets();

    // Filter by type
    let filtered = params.type
      ? allMarkets.filter((m) => m.type === params.type)
      : allMarkets;

    // groupBy
    if (params.groupBy === "type") {
      const grouped: MarketsByType = {};
      for (const m of filtered) {
        (grouped[m.type] ??= []).push(m);
      }
      return grouped;
    }

    if (params.groupBy === "question") {
      const grouped: MarketsByQuestion = {};
      for (const m of filtered) {
        const key =
          m.type === "multiOutcome"
            ? String((m as MultiOutcomeMarket).questionId)
            : "standalone";
        (grouped[key] ??= []).push(m);
      }
      return grouped;
    }

    // Pagination
    const offset = params.offset ?? 0;
    const limit = params.limit ?? filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  private async loadMarkets(): Promise<HIP4Market[]> {
    const now = Date.now();
    if (
      this.metaCache &&
      now - this.metaCache.timestamp < HIP4EventAdapter.CACHE_TTL_MS
    ) {
      return this.metaCache.markets;
    }

    const [meta, mids] = await Promise.all([
      this.client.fetchOutcomeMeta(),
      this.client.fetchAllMids().catch(() => ({}) as Record<string, string>),
    ]);

    this.populateSideNames(meta);

    const markets = classifyAllOutcomes(meta.outcomes, meta.questions);

    this.metaCache = { meta, mids, markets, timestamp: now };
    return markets;
  }

  // -------------------------------------------------------------------------
  // loadEvents  - legacy PredictionEvent API
  // -------------------------------------------------------------------------

  private async loadEvents(): Promise<PredictionEvent[]> {
    const now = Date.now();
    if (
      this.cache &&
      now - this.cache.timestamp < HIP4EventAdapter.CACHE_TTL_MS
    ) {
      return this.cache.events;
    }

    const [meta, mids] = await Promise.all([
      this.client.fetchOutcomeMeta(),
      this.client.fetchAllMids().catch(() => ({}) as Record<string, string>),
    ]);

    this.populateSideNames(meta);

    const events = buildEventsFromMeta(meta);

    for (const event of events) {
      for (const market of event.markets) {
        for (const outcome of market.outcomes) {
          const mid = mids[outcome.tokenId];
          if (mid) {
            outcome.price = mid;
          }
        }
      }
    }

    this.cache = { events, timestamp: now };
    return events;
  }
}

// ---------------------------------------------------------------------------
// Build event list from outcomeMeta
// ---------------------------------------------------------------------------

function buildEventsFromMeta(meta: HLOutcomeMeta): PredictionEvent[] {
  const outcomeMap = new Map<number, HLOutcome>();
  for (const o of meta.outcomes) {
    outcomeMap.set(o.outcome, o);
  }

  const claimedOutcomes = new Set<number>();
  const events: PredictionEvent[] = [];

  for (const q of meta.questions) {
    for (const id of q.namedOutcomes) claimedOutcomes.add(id);
    claimedOutcomes.add(q.fallbackOutcome);
    events.push(mapQuestionToEvent(q, outcomeMap));
  }

  for (const o of meta.outcomes) {
    if (!claimedOutcomes.has(o.outcome)) {
      events.push(mapStandaloneOutcomeToEvent(o));
    }
  }

  return events;
}
