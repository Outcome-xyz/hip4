/**
 * Place a market order on a prediction market.
 *
 * Market orders use FrontendMarket TIF -- the exchange handles
 * best-execution pricing. The SDK sets extreme prices (0.99999 for
 * buys, 0.00001 for sells) to ensure the order fills.
 *
 * Usage: PRIVATE_KEY=0x... npx tsx examples/place-market-order.ts
 *
 * NOTE: Requires a funded testnet account with an approved agent.
 */

import { privateKeyToAccount } from "viem/accounts";
import { createHIP4Adapter } from "../src";
import type { DefaultBinaryMarket } from "../src";

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("Set PRIVATE_KEY env var");
    process.exit(1);
  }

  const account = privateKeyToAccount(pk as `0x${string}`);
  const adapter = createHIP4Adapter({ testnet: true });
  await adapter.initialize();
  await adapter.auth.initAuth(account.address, account);

  // Pick the first recurring market
  const markets = (await adapter.events.fetchMarkets({
    type: "defaultBinary",
  })) as DefaultBinaryMarket[];

  if (markets.length === 0) {
    console.log("No recurring markets found");
    adapter.destroy();
    return;
  }

  const market = markets[0];
  console.log(`Market: ${market.underlying} > $${market.targetPrice} (${market.period})`);

  // Market buy 20 shares of Yes
  const result = await adapter.trading.placeOrder({
    marketId: String(market.outcomeId),
    outcome: market.sides[0].coin,
    side: "buy",
    type: "market",
    amount: "20",
  });

  if (result.success) {
    console.log(`Filled: ${result.shares ?? "?"} shares`);
    console.log(`Status: ${result.status}`);
  } else {
    console.log(`Order failed: ${result.error}`);
  }

  adapter.destroy();
}

main().catch(console.error);
