/**
 * Unified-account diagnosis: does aligning the agent's abstraction to the
 * master fix "Must deposit before performing actions"?
 *
 * Flow (all on ONE wallet, your unified-balance mainnet account):
 *   1. Approve a fresh ephemeral agent (same as auth-eoa.ts).
 *   2. Print the master's abstraction mode + spot/perp balances.
 *   3. BEFORE: place a tiny, far-below-market (non-fillable) limit buy.
 *   4. Call agentSetAbstraction to match the master's mode.
 *   5. AFTER: place the exact same order again.
 *   6. Cancel anything that rested, print a BEFORE/AFTER verdict.
 *
 * If BEFORE fails with "Must deposit..." and AFTER succeeds, the fix is
 * confirmed: the agent must be aligned to the master's abstraction.
 *
 * Safety: the order is priced far below mid so it never fills; any resting
 * order is cancelled automatically. Nothing is withdrawn.
 *
 * Usage (mainnet, your unified wallet):
 *   PRIVATE_KEY=0x... npx tsx examples/unified-abstraction-test.ts
 * Testnet instead:
 *   TESTNET=1 PRIVATE_KEY=0x... npx tsx examples/unified-abstraction-test.ts
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { arbitrum } from "viem/chains";
import {
  createHIP4Adapter,
  getAgentApprovalTypedData,
  submitAgentApproval,
  HIP4Client,
  type DefaultBinaryMarket,
} from "../src";

const MAINNET = !process.env.TESTNET;
const AGENT_NAME = "hip4-test"; // HL caps agent names at 16 chars

function line() {
  console.log("─".repeat(72));
}

// This wallet has burned its action budget, so HL only allows ~1 action per
// 10s. Space exchange actions out to slip under that allowance.
const ACTION_GAP_MS = 12_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("Set PRIVATE_KEY env var (0x-prefixed hex)");
    process.exit(1);
  }

  const master = privateKeyToAccount(pk as `0x${string}`);
  const walletClient = createWalletClient({
    account: master,
    chain: arbitrum,
    transport: http(),
  });

  const client = new HIP4Client({ testnet: !MAINNET });

  line();
  console.log(`Network:        ${MAINNET ? "MAINNET" : "TESTNET"}`);
  console.log(`Master wallet:  ${master.address}`);

  // --- 1. Account context -------------------------------------------------
  const abstraction = await client.fetchUserAbstraction(master.address);
  console.log(`Abstraction:    ${abstraction}`);

  const spot = await client.fetchSpotClearinghouseState(master.address);
  const perp = await client
    .fetchClearinghouseState(master.address)
    .catch(() => null);
  const usdcSpot =
    spot.balances.find((b) => b.coin === "USDC")?.total ?? "0";
  console.log(`Spot balances:  ${spot.balances.map((b) => `${b.coin}=${b.total}`).join(", ") || "(none)"}`);
  console.log(`Perp accountValue: ${perp?.marginSummary.accountValue ?? "n/a"}  withdrawable: ${perp?.withdrawable ?? "n/a"}`);

  const code =
    abstraction === "unifiedAccount"
      ? "u"
      : abstraction === "portfolioMargin"
        ? "p"
        : null;

  if (!code) {
    console.log("");
    console.log(
      `⚠️  This wallet is "${abstraction}", not unified/portfolio. The bug only` +
        " reproduces on a unified balance — turn on unified balance in the HL UI" +
        " and rerun. (Not calling agentSetAbstraction on a standard account so it" +
        " is never flipped.)",
    );
  }

  // --- 2. Approve a fresh agent ------------------------------------------
  const agent = privateKeyToAccount(generatePrivateKey());
  const approvalNonce = Date.now();
  const typedData = getAgentApprovalTypedData(
    agent.address,
    AGENT_NAME,
    approvalNonce,
    MAINNET,
  );
  const approvalSig = await walletClient.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });
  const approval = await submitAgentApproval(
    approvalSig,
    agent.address,
    AGENT_NAME,
    approvalNonce,
    MAINNET,
  );
  if (!approval.success) {
    console.error(`\nAgent approval FAILED: ${approval.error}`);
    console.error("(If this is the deposit-gate error, it fires before we can even test the order path.)");
    process.exit(1);
  }
  console.log(`Agent approved: ${agent.address}`);

  // --- 3. Build a safe, non-fillable order -------------------------------
  const adapter = createHIP4Adapter({
    testnet: !MAINNET,
    logger: (lvl, msg, data) =>
      lvl !== "debug" ? undefined : console.log(`  [dbg] ${msg}`, data ?? ""),
  });
  await adapter.initialize();
  await adapter.auth.initAuth(master.address, agent);

  const markets = (await adapter.events.fetchMarkets({
    type: "defaultBinary",
  })) as DefaultBinaryMarket[];
  if (markets.length === 0) {
    console.error("No defaultBinary markets found — cannot place a test order.");
    adapter.destroy();
    process.exit(1);
  }
  const market = markets[0];
  const priceData = await adapter.marketData.fetchPrice(String(market.outcomeId));
  const mid = parseFloat(priceData.outcomes[0]?.midpoint ?? "0.5");
  // Far below mid → rests, never fills. >= ~$12 notional to clear HL's $10 min.
  const restPrice = Math.max(0.001, Number((mid * 0.2).toFixed(3)));
  const size = String(Math.ceil(12 / restPrice));
  const order = {
    marketId: String(market.outcomeId),
    outcome: market.sides[0].coin,
    side: "buy" as const,
    type: "limit" as const,
    price: String(restPrice),
    amount: size,
    timeInForce: "GTC" as const,
    skipMinNotionalCheck: true,
  };
  console.log(
    `Test order:     buy ${size} ${market.sides[0].coin} @ ${restPrice} (mid ${mid}, non-fillable)`,
  );

  const restingOids: string[] = [];
  const place = async (label: string) => {
    const r = await adapter.trading.placeOrder(order);
    console.log(
      `${label}: success=${r.success} status=${r.status ?? "-"} error=${r.error ?? "-"}`,
    );
    if (r.orderId && (r.status === "resting" || r.success)) restingOids.push(r.orderId);
    return r;
  };

  // --- 4. BEFORE / align / AFTER -----------------------------------------
  // ~12s between each action to dodge the address rate limit.
  line();
  await sleep(ACTION_GAP_MS);
  const before = await place("BEFORE align");

  if (code) {
    await sleep(ACTION_GAP_MS);
    const aligned = await adapter.wallet.agentSetAbstraction(code);
    console.log(
      `agentSetAbstraction("${code}"): success=${aligned.success} error=${aligned.error ?? "-"}`,
    );
  } else {
    console.log("Skipping agentSetAbstraction (wallet not unified).");
  }

  await sleep(ACTION_GAP_MS);
  const after = await place("AFTER align");

  // --- 5. Cleanup ---------------------------------------------------------
  for (const oid of restingOids) {
    try {
      await sleep(ACTION_GAP_MS);
      await adapter.trading.cancelOrder([
        { marketId: String(market.outcomeId), orderId: oid, outcome: market.sides[0].coin },
      ]);
      console.log(`Cancelled resting order ${oid}`);
    } catch (e) {
      console.log(`Could not cancel ${oid}: ${(e as Error).message}`);
    }
  }

  // --- 6. Verdict ---------------------------------------------------------
  line();
  if (!before.success && after.success) {
    console.log("✅ CONFIRMED: aligning the agent's abstraction fixes it.");
  } else if (!before.success && !after.success) {
    console.log("❌ Agent alignment did NOT fix it — the lever is elsewhere.");
    console.log(`   BEFORE error: ${before.error}`);
    console.log(`   AFTER  error: ${after.error}`);
  } else if (before.success) {
    console.log("ℹ️  BEFORE already succeeded — this wallet/mode doesn't reproduce the bug.");
  }
  line();

  adapter.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
