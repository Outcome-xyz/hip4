/**
 * Fetch all HIP-4 markets and display them grouped by type.
 *
 * Usage: npx tsx examples/get-all-markets.ts
 */

import { createHIP4Adapter } from "../src";
import type { DefaultBinaryMarket, MultiOutcomeMarket, HIP4Market } from "../src";

async function main() {
  const adapter = createHIP4Adapter({ testnet: true });
  await adapter.initialize();

  // Fetch all markets, grouped by type
  const grouped = (await adapter.events.fetchMarkets({ groupBy: "type" })) as Record<string, HIP4Market[]>;

  // Default binary (recurring price binary)
  const defaults = (grouped.defaultBinary ?? []) as DefaultBinaryMarket[];
  console.log(`\n--- defaultBinary (${defaults.length}) ---`);
  for (const m of defaults) {
    console.log(`  ${m.underlying} > $${m.targetPrice} (${m.period}) | expires ${m.expiry.toISOString()}`);
    console.log(`    Yes: ${m.sides[0].coin} (asset ${m.sides[0].asset})`);
    console.log(`    No:  ${m.sides[1].coin} (asset ${m.sides[1].asset})`);
  }

  // Labelled binary (custom side names)
  const labelled = grouped.labelledBinary ?? [];
  console.log(`\n--- labelledBinary (${labelled.length}) ---`);
  for (const m of labelled) {
    console.log(`  ${m.name}`);
    console.log(`    ${m.sides[0].name} vs ${m.sides[1].name}`);
  }

  // Multi-outcome (question groups)
  const multi = (grouped.multiOutcome ?? []) as MultiOutcomeMarket[];
  console.log(`\n--- multiOutcome (${multi.length}) ---`);
  const byQuestion = new Map<number, MultiOutcomeMarket[]>();
  for (const m of multi) {
    const list = byQuestion.get(m.questionId) ?? [];
    list.push(m);
    byQuestion.set(m.questionId, list);
  }
  for (const [qId, markets] of byQuestion) {
    console.log(`  Question ${qId}: ${markets[0].questionName}`);
    for (const m of markets) {
      console.log(`    ${m.isFallback ? "(fallback) " : ""}${m.name} | ${m.sides[0].coin}`);
    }
  }

  adapter.destroy();
}

main().catch(console.error);
