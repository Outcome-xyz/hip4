import type { HLOutcomeMeta } from "../../src/adapter/hyperliquid/types";

/**
 * Fixture: realistic HLOutcomeMeta with 2 questions and 3 standalone outcomes.
 *
 * Questions:
 *   Q1 (question: 100) - "Which party wins the 2026 midterms?" - 3 named outcomes + fallback
 *   Q2 (question: 200) - "Will BTC hit 100k by June?" - 2 named outcomes (binary)
 *
 * Standalone outcomes (not in any question):
 *   1338 - recurring price binary: "class:priceBinary|underlying:BTC|targetPrice:69070|period:1d"
 *   1400 - "Will ETH merge go smoothly?"
 *   1500 - "Will DOGE reach $1?"
 */
export const OUTCOME_META: HLOutcomeMeta = {
  outcomes: [
    // --- Q1 named outcomes ---
    {
      outcome: 1758,
      name: "Republican",
      description: "Republican party wins the 2026 midterm elections",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    {
      outcome: 5160,
      name: "Democrat",
      description: "Democrat party wins the 2026 midterm elections",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    {
      outcome: 1759,
      name: "Independent",
      description: "Independent / third-party wins the 2026 midterm elections",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    // Q1 fallback outcome
    {
      outcome: 1760,
      name: "Other / Unresolved",
      description: "Fallback outcome if none of the named outcomes are met",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },

    // --- Q2 named outcomes ---
    {
      outcome: 2001,
      name: "BTC >= 100k",
      description: "Bitcoin trades at or above $100,000 before June 30 2026",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    {
      outcome: 2002,
      name: "BTC < 100k",
      description: "Bitcoin does not reach $100,000 before June 30 2026",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },

    // --- Standalone outcomes (no question) ---
    {
      outcome: 1338,
      name: "Recurring",
      description:
        "class:priceBinary|underlying:BTC|expiry:20260311-0300|targetPrice:69070|period:1d",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    {
      outcome: 1400,
      name: "ETH merge smooth?",
      description: "Will the ETH merge complete without major issues?",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
    {
      outcome: 1500,
      name: "DOGE to $1?",
      description: "Will DOGE reach $1 by end of 2026?",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
    },
  ],

  questions: [
    {
      question: 100,
      name: "Which party wins the 2026 midterms?",
      description:
        "Multi-outcome market on the result of the 2026 US midterm elections.",
      fallbackOutcome: 1760,
      namedOutcomes: [1758, 5160, 1759],
      settledNamedOutcomes: [],
    },
    {
      question: 200,
      name: "Will BTC hit 100k by June?",
      description:
        "Binary question: does Bitcoin trade >= $100k before June 30 2026?",
      fallbackOutcome: 2002,
      namedOutcomes: [2001],
      settledNamedOutcomes: [],
    },
  ],
};
