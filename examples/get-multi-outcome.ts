/**
 * Fetch multi-outcome markets grouped by their parent question.
 *
 * Usage: npx tsx examples/get-multi-outcome.ts
 */

import { createHIP4Adapter } from "../src";
import type { MultiOutcomeMarket } from "../src";

async function main() {
  const adapter = createHIP4Adapter({ testnet: true });
  await adapter.initialize();

  const grouped = (await adapter.events.fetchMarkets({
    type: "multiOutcome",
    groupBy: "question",
  })) as Record<string, MultiOutcomeMarket[]>;

  for (const [questionId, markets] of Object.entries(grouped)) {
    if (questionId === "standalone") continue;

    const q = markets[0];
    console.log(`Question #${questionId}: ${q.questionName}`);
    console.log(`  ${q.questionDescription}`);
    console.log();

    for (const m of markets) {
      const tag = m.isFallback ? " (fallback)" : "";
      console.log(`  [${m.outcomeId}] ${m.name}${tag}`);
      console.log(`    Yes: ${m.sides[0].coin} | No: ${m.sides[1].coin}`);
    }

    // Fetch live prices for each option
    console.log("\n  Live prices:");
    for (const m of markets) {
      try {
        const price = await adapter.marketData.fetchPrice(String(m.outcomeId));
        const yesPrice = price.outcomes[0]?.price ?? "?";
        const noPrice = price.outcomes[1]?.price ?? "?";
        console.log(`    ${m.name}: Yes=${yesPrice} No=${noPrice}`);
      } catch {
        console.log(`    ${m.name}: (no price data)`);
      }
    }
    console.log();
  }

  adapter.destroy();
}

main().catch(console.error);
