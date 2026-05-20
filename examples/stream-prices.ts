/**
 * Stream live prices for all recurring markets via WebSocket.
 *
 * Usage: npx tsx examples/stream-prices.ts
 *
 * Press Ctrl+C to stop.
 */

import { createHIP4Adapter } from "../src";
import type { DefaultBinaryMarket } from "../src";

async function main() {
  const adapter = createHIP4Adapter({ testnet: true });
  await adapter.initialize();

  const markets = (await adapter.events.fetchMarkets({
    type: "defaultBinary",
  })) as DefaultBinaryMarket[];

  if (markets.length === 0) {
    console.log("No recurring markets found");
    adapter.destroy();
    return;
  }

  console.log(`Streaming prices for ${markets.length} markets. Ctrl+C to stop.\n`);

  const unsubs: Array<() => void> = [];

  for (const market of markets) {
    const label = `${market.underlying} > $${market.targetPrice} (${market.period})`;

    const unsub = adapter.marketData.subscribePrice(
      String(market.outcomeId),
      (price) => {
        const yes = price.outcomes[0]?.price ?? "?";
        const no = price.outcomes[1]?.price ?? "?";
        const yesPct = (parseFloat(yes) * 100).toFixed(1);
        console.log(`${label} | Yes: ${yesPct}% (${yes}) | No: ${no}`);
      },
    );
    unsubs.push(unsub);
  }

  // Keep alive until Ctrl+C
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    for (const unsub of unsubs) unsub();
    adapter.destroy();
    process.exit(0);
  });

  // Prevent node from exiting
  await new Promise(() => {});
}

main().catch(console.error);
