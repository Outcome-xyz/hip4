/**
 * Fetch only recurring (defaultBinary) markets and show expiry countdown.
 *
 * Usage: npx tsx examples/get-recurring-markets.ts
 */

import { createHIP4Adapter } from "../src";
import type { DefaultBinaryMarket } from "../src";
import { periodMinutes } from "../src";

async function main() {
  const adapter = createHIP4Adapter({ testnet: true });
  await adapter.initialize();

  const markets = (await adapter.events.fetchMarkets({
    type: "defaultBinary",
  })) as DefaultBinaryMarket[];

  console.log(`Found ${markets.length} recurring markets\n`);

  // Group by underlying
  const byUnderlying = new Map<string, DefaultBinaryMarket[]>();
  for (const m of markets) {
    const list = byUnderlying.get(m.underlying) ?? [];
    list.push(m);
    byUnderlying.set(m.underlying, list);
  }

  for (const [underlying, group] of byUnderlying) {
    console.log(`${underlying}:`);
    // Sort by expiry
    group.sort((a, b) => a.expiry.getTime() - b.expiry.getTime());

    for (const m of group) {
      const mins = (m.expiry.getTime() - Date.now()) / 60_000;
      const periodMins = periodMinutes(m.period);
      const countdown = mins > 60
        ? `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`
        : `${Math.round(mins)}m`;

      console.log(
        `  $${m.targetPrice} | ${m.period} (${periodMins}min) | expires in ${countdown}` +
        ` | yes=${m.sides[0].coin} no=${m.sides[1].coin}`
      );
    }
    console.log();
  }

  adapter.destroy();
}

main().catch(console.error);
