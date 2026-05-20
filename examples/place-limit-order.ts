/**
 * Place a limit order on a prediction market with pre-submission validation.
 *
 * Demonstrates:
 * - Fetching market price for min-shares validation
 * - Placing a limit order with markPx
 * - Builder fee configuration
 * - Handling the order result
 *
 * Usage: PRIVATE_KEY=0x... npx tsx examples/place-limit-order.ts
 *
 * NOTE: Requires a funded testnet account with an approved agent.
 * See auth-eoa.ts for the approval flow.
 */

import { privateKeyToAccount } from "viem/accounts";
import { createHIP4Adapter, getMinShares } from "../src";
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

  // Auth with agent key (assumes agent already approved -- see auth-eoa.ts)
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
  console.log(`  Yes coin: ${market.sides[0].coin}`);

  // Fetch current price for validation
  const priceData = await adapter.marketData.fetchPrice(String(market.outcomeId));
  const markPx = parseFloat(priceData.outcomes[0]?.midpoint ?? "0.5");
  console.log(`  Mark price: ${markPx}`);
  console.log(`  Min shares at this price: ${getMinShares(markPx)}`);

  // Place a limit buy on the Yes side
  const result = await adapter.trading.placeOrder({
    marketId: String(market.outcomeId),
    outcome: market.sides[0].coin,   // Yes side
    side: "buy",
    type: "limit",
    price: String(markPx),
    amount: String(getMinShares(markPx)),
    markPx,                           // enables pre-submission min-shares check
    // builderAddress: "0x...",       // optional referral
    // builderFee: 100,              // optional fee (0.1%)
  });

  if (result.success) {
    console.log(`\nOrder placed: ${result.status}`);
    if (result.orderId) console.log(`  Order ID: ${result.orderId}`);
    if (result.shares) console.log(`  Filled: ${result.shares} shares`);
  } else {
    console.log(`\nOrder rejected: ${result.error}`);
  }

  adapter.destroy();
}

main().catch(console.error);
