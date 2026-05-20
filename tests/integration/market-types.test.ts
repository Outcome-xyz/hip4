// ---------------------------------------------------------------------------
// Integration test: market classification against real Hyperliquid testnet
//
// Verifies all 3 market types are discovered and classified correctly.
// Flags any outcomes that don't classify as a known type.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHIP4Adapter } from "../../src/adapter/factory";
import type { PredictionsAdapter } from "../../src/adapter/types";
import { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4EventAdapter } from "../../src/adapter/hyperliquid/events";
import type {
  HIP4Market,
  DefaultBinaryMarket,
  MultiOutcomeMarket,
  MarketType,
} from "../../src/types/hip4-market";

const VALID_TYPES: MarketType[] = [
  "defaultBinary",
  "labelledBinary",
  "multiOutcome",
  "priceBucket",
];

describe("market classification (testnet)", { timeout: 30_000 }, () => {
  let adapter: PredictionsAdapter;
  let eventAdapter: HIP4EventAdapter;
  let allMarkets: HIP4Market[];

  beforeAll(async () => {
    adapter = createHIP4Adapter({ testnet: true });
    await adapter.initialize();

    // Create a standalone event adapter for fetchMarkets
    const client = new HIP4Client({ testnet: true });
    eventAdapter = new HIP4EventAdapter(client);
    allMarkets = await eventAdapter.fetchMarkets() as HIP4Market[];
  });

  afterAll(() => {
    adapter.destroy();
  });

  // -------------------------------------------------------------------------
  // Exhaustive classification  - no market left behind
  // -------------------------------------------------------------------------

  it("classifies every outcome into a known type", () => {
    const unknowns = allMarkets.filter((m) => !VALID_TYPES.includes(m.type));
    if (unknowns.length > 0) {
      const details = unknowns.map((m) =>
        `POTENTIAL NEW MARKET TYPE - INVESTIGATE: outcomeId=${m.outcomeId} name=${JSON.stringify(m.name)} type=${JSON.stringify(m.type)} raw=${JSON.stringify(m.raw)}`
      );
      throw new Error(
        `Found ${unknowns.length} unclassified market(s):\n${details.join("\n")}`
      );
    }
  });

  it("returns at least one market", () => {
    expect(allMarkets.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // defaultBinary
  // -------------------------------------------------------------------------

  describe("defaultBinary", () => {
    let defaults: DefaultBinaryMarket[];

    beforeAll(() => {
      defaults = allMarkets.filter(
        (m): m is DefaultBinaryMarket => m.type === "defaultBinary",
      );
    });

    it("finds at least one", () => {
      expect(defaults.length).toBeGreaterThan(0);
    });

    it("every defaultBinary has parsed priceBinary fields", () => {
      for (const m of defaults) {
        expect(m.underlying).toBeTruthy();
        expect(m.targetPrice).toBeGreaterThan(0);
        expect(m.period).toMatch(/^\d+(m|h|d)$/);
        expect(m.expiry).toBeInstanceOf(Date);
      }
    });

    it("every defaultBinary has correct side/coin/asset derivation", () => {
      for (const m of defaults) {
        expect(m.sides).toHaveLength(2);
        expect(m.sides[0].coinNum).toBe(m.outcomeId * 10);
        expect(m.sides[1].coinNum).toBe(m.outcomeId * 10 + 1);
        expect(m.sides[0].coin).toBe(`#${m.outcomeId * 10}`);
        expect(m.sides[1].coin).toBe(`#${m.outcomeId * 10 + 1}`);
        expect(m.sides[0].asset).toBe(100_000_000 + m.outcomeId * 10);
        expect(m.sides[1].asset).toBe(100_000_000 + m.outcomeId * 10 + 1);
      }
    });

    it("sides are always Yes/No", () => {
      for (const m of defaults) {
        expect(m.sides[0].name).toBe("Yes");
        expect(m.sides[1].name).toBe("No");
      }
    });

    it("raw response is attached", () => {
      for (const m of defaults) {
        expect(m.raw).toBeDefined();
        expect(m.raw.outcome).toBe(m.outcomeId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // multiOutcome
  // -------------------------------------------------------------------------

  describe("multiOutcome", () => {
    let multis: MultiOutcomeMarket[];

    beforeAll(() => {
      multis = allMarkets.filter(
        (m): m is MultiOutcomeMarket => m.type === "multiOutcome",
      );
    });

    it("finds at least one (if questions exist on testnet)", () => {
      // Questions may not always exist  - skip if none
      if (multis.length === 0) return;
      expect(multis.length).toBeGreaterThan(0);
    });

    it("every multiOutcome has question metadata", () => {
      for (const m of multis) {
        expect(m.questionId).toBeGreaterThan(0);
        expect(m.questionName).toBeTruthy();
        expect(typeof m.isFallback).toBe("boolean");
        expect(m.rawQuestion).toBeDefined();
      }
    });

    it("at least one fallback exists per question", () => {
      const byQuestion = new Map<number, MultiOutcomeMarket[]>();
      for (const m of multis) {
        const list = byQuestion.get(m.questionId) ?? [];
        list.push(m);
        byQuestion.set(m.questionId, list);
      }
      for (const [qId, markets] of byQuestion) {
        const fallbacks = markets.filter((m) => m.isFallback);
        expect(
          fallbacks.length,
          `Question ${qId} should have exactly 1 fallback`,
        ).toBe(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // labelledBinary
  // -------------------------------------------------------------------------

  describe("labelledBinary", () => {
    it("any labelledBinary has non-empty name and description", () => {
      const labelled = allMarkets.filter((m) => m.type === "labelledBinary");
      for (const m of labelled) {
        expect(m.name).toBeTruthy();
        expect(m.description).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // fetchMarkets type filter
  // -------------------------------------------------------------------------

  describe("fetchMarkets type filter", () => {
    it("type filter returns only that type", async () => {
      for (const t of VALID_TYPES) {
        const filtered = await eventAdapter.fetchMarkets({ type: t }) as HIP4Market[];
        for (const m of filtered) {
          expect(m.type).toBe(t);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // fetchMarkets groupBy
  // -------------------------------------------------------------------------

  describe("fetchMarkets groupBy", () => {
    it("groupBy 'type' keys match actual types present", async () => {
      const grouped = await eventAdapter.fetchMarkets({ groupBy: "type" }) as Record<string, HIP4Market[]>;
      const presentTypes = new Set(allMarkets.map((m) => m.type));
      for (const t of presentTypes) {
        expect(grouped[t]).toBeDefined();
        expect(grouped[t].length).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Shared invariants
  // -------------------------------------------------------------------------

  describe("shared invariants", () => {
    it("all outcomeIds are distinct", () => {
      const ids = allMarkets.map((m) => m.outcomeId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every market has exactly 2 sides", () => {
      for (const m of allMarkets) {
        expect(m.sides).toHaveLength(2);
      }
    });
  });
});
