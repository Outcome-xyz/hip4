// ---------------------------------------------------------------------------
// Tests for HIP4Market classification logic
//
// classifyOutcome must correctly detect:
//   defaultBinary   - description parses as class:priceBinary
//   labelledBinary  - standalone, custom side names (not Yes/No)
//   multiOutcome    - outcome is in a question's namedOutcomes or fallbackOutcome
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  classifyOutcome,
  classifyAllOutcomes,
} from "../../src/adapter/hyperliquid/market-classification";
import type { HLOutcome, HLQuestion } from "../../src/adapter/hyperliquid/types";

// ---------------------------------------------------------------------------
// Fixtures  - mirrors real testnet shapes
// ---------------------------------------------------------------------------

const recurringOutcome: HLOutcome = {
  outcome: 2922,
  name: "Recurring",
  description: "class:priceBinary|underlying:BTC|expiry:20260403-0300|targetPrice:67218|period:1d",
  sideSpecs: [{ name: "Yes" }, { name: "No" }],
};

const labelledOutcome: HLOutcome = {
  outcome: 9,
  name: "Who will win the HL 100 meter dash?",
  description: "This race is yet to be scheduled.",
  sideSpecs: [{ name: "Hypurr" }, { name: "Usain Bolt" }],
};

const questionGroupedOutcome: HLOutcome = {
  outcome: 10,
  name: "Akami",
  description: "Lean tuna",
  sideSpecs: [{ name: "Yes" }, { name: "No" }],
};

const fallbackOutcome: HLOutcome = {
  outcome: 13,
  name: "Other",
  description: "N/A",
  sideSpecs: [{ name: "Yes" }, { name: "No" }],
};

const standaloneYesNo: HLOutcome = {
  outcome: 50,
  name: "Will it rain tomorrow?",
  description: "Weather prediction",
  sideSpecs: [{ name: "Yes" }, { name: "No" }],
};

const question: HLQuestion = {
  question: 1,
  name: "What will Hypurr eat the most of in Feb 2026?",
  description: "Hypurr has committed to weighing and recording daily food intake.",
  fallbackOutcome: 13,
  namedOutcomes: [10, 11, 12],
  settledNamedOutcomes: [],
};

// ---------------------------------------------------------------------------
// classifyOutcome
// ---------------------------------------------------------------------------

describe("classifyOutcome", () => {
  const questions = [question];

  describe("defaultBinary detection", () => {
    it("classifies recurring priceBinary as defaultBinary", () => {
      const market = classifyOutcome(recurringOutcome, questions);
      expect(market.type).toBe("defaultBinary");
    });

    it("parses underlying from description", () => {
      const market = classifyOutcome(recurringOutcome, questions);
      if (market.type !== "defaultBinary") throw new Error("wrong type");
      expect(market.underlying).toBe("BTC");
    });

    it("parses targetPrice from description", () => {
      const market = classifyOutcome(recurringOutcome, questions);
      if (market.type !== "defaultBinary") throw new Error("wrong type");
      expect(market.targetPrice).toBe(67218);
    });

    it("parses expiry as Date", () => {
      const market = classifyOutcome(recurringOutcome, questions);
      if (market.type !== "defaultBinary") throw new Error("wrong type");
      expect(market.expiry).toBeInstanceOf(Date);
      expect(market.expiry.getUTCFullYear()).toBe(2026);
      expect(market.expiry.getUTCMonth()).toBe(3); // April
      expect(market.expiry.getUTCDate()).toBe(3);
    });

    it("parses period", () => {
      const market = classifyOutcome(recurringOutcome, questions);
      if (market.type !== "defaultBinary") throw new Error("wrong type");
      expect(market.period).toBe("1d");
    });

    it("generates human-readable name from parsed fields", () => {
      const market = classifyOutcome(recurringOutcome, questions);
      // Name should be meaningful, not just "Recurring"
      expect(market.name).not.toBe("Recurring");
      expect(market.name).toContain("BTC");
    });
  });

  describe("labelledBinary detection", () => {
    it("classifies standalone with custom side names as labelledBinary", () => {
      const market = classifyOutcome(labelledOutcome, questions);
      expect(market.type).toBe("labelledBinary");
    });

    it("preserves custom side names", () => {
      const market = classifyOutcome(labelledOutcome, questions);
      expect(market.sides[0].name).toBe("Hypurr");
      expect(market.sides[1].name).toBe("Usain Bolt");
    });

    it("uses raw outcome name as market name", () => {
      const market = classifyOutcome(labelledOutcome, questions);
      expect(market.name).toBe("Who will win the HL 100 meter dash?");
    });
  });

  describe("multiOutcome detection", () => {
    it("classifies question-grouped outcome as multiOutcome", () => {
      const market = classifyOutcome(questionGroupedOutcome, questions);
      expect(market.type).toBe("multiOutcome");
    });

    it("classifies fallback outcome as multiOutcome", () => {
      const market = classifyOutcome(fallbackOutcome, questions);
      expect(market.type).toBe("multiOutcome");
    });

    it("sets isFallback=true for fallback outcomes", () => {
      const market = classifyOutcome(fallbackOutcome, questions);
      if (market.type !== "multiOutcome") throw new Error("wrong type");
      expect(market.isFallback).toBe(true);
    });

    it("sets isFallback=false for named outcomes", () => {
      const market = classifyOutcome(questionGroupedOutcome, questions);
      if (market.type !== "multiOutcome") throw new Error("wrong type");
      expect(market.isFallback).toBe(false);
    });

    it("attaches question metadata", () => {
      const market = classifyOutcome(questionGroupedOutcome, questions);
      if (market.type !== "multiOutcome") throw new Error("wrong type");
      expect(market.questionId).toBe(1);
      expect(market.questionName).toBe("What will Hypurr eat the most of in Feb 2026?");
      expect(market.questionDescription).toContain("food intake");
    });

    it("attaches rawQuestion", () => {
      const market = classifyOutcome(questionGroupedOutcome, questions);
      if (market.type !== "multiOutcome") throw new Error("wrong type");
      expect(market.rawQuestion).toBe(question);
    });
  });

  describe("standalone Yes/No without question → labelledBinary? no, defaultBinary needs priceBinary", () => {
    it("standalone Yes/No NOT in a question and NOT priceBinary → labelledBinary", () => {
      // This is a standalone outcome with Yes/No but no structured description
      // and not in any question. It doesn't parse as priceBinary.
      // Since sides are ["Yes", "No"] and it's not in a question, it's still
      // a standalone binary. But it's not "labelled" (custom names).
      // For now this falls through to labelledBinary since it's the catch-all
      // for standalone outcomes that aren't priceBinary.
      // Actually  - Yes/No IS the default, so this IS a labelled binary
      // in the sense that it's a standalone non-priceBinary.
      const market = classifyOutcome(standaloneYesNo, questions);
      expect(market.type).toBe("labelledBinary");
    });
  });

  describe("shared fields", () => {
    it("computes sides with correct coinNum, coin, and asset", () => {
      const market = classifyOutcome(recurringOutcome, questions);
      expect(market.sides).toHaveLength(2);

      // side 0
      expect(market.sides[0].coinNum).toBe(2922 * 10);
      expect(market.sides[0].coin).toBe("#29220");
      expect(market.sides[0].asset).toBe(100_000_000 + 29220);

      // side 1
      expect(market.sides[1].coinNum).toBe(2922 * 10 + 1);
      expect(market.sides[1].coin).toBe("#29221");
      expect(market.sides[1].asset).toBe(100_000_000 + 29221);
    });

    it("attaches outcomeId", () => {
      const market = classifyOutcome(recurringOutcome, questions);
      expect(market.outcomeId).toBe(2922);
    });

    it("attaches raw response", () => {
      const market = classifyOutcome(recurringOutcome, questions);
      expect(market.raw).toBe(recurringOutcome);
    });

    it("attaches description", () => {
      const market = classifyOutcome(labelledOutcome, questions);
      expect(market.description).toBe("This race is yet to be scheduled.");
    });
  });
});

// ---------------------------------------------------------------------------
// classifyAllOutcomes
// ---------------------------------------------------------------------------

describe("classifyAllOutcomes", () => {
  const outcomes = [recurringOutcome, labelledOutcome, questionGroupedOutcome, fallbackOutcome];
  const questions = [question];

  it("classifies all outcomes in one pass", () => {
    const markets = classifyAllOutcomes(outcomes, questions);
    expect(markets).toHaveLength(4);
  });

  it("returns correct type distribution", () => {
    const markets = classifyAllOutcomes(outcomes, questions);
    const types = markets.map(m => m.type);
    expect(types.filter(t => t === "defaultBinary")).toHaveLength(1);
    expect(types.filter(t => t === "labelledBinary")).toHaveLength(1);
    expect(types.filter(t => t === "multiOutcome")).toHaveLength(2);
  });

  it("preserves order", () => {
    const markets = classifyAllOutcomes(outcomes, questions);
    expect(markets[0].outcomeId).toBe(2922);
    expect(markets[1].outcomeId).toBe(9);
    expect(markets[2].outcomeId).toBe(10);
    expect(markets[3].outcomeId).toBe(13);
  });
});
