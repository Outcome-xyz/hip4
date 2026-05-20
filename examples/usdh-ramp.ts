/**
 * USDH On/Off-Ramp Example
 *
 * Demonstrates the full buy and sell flows:
 *
 *   Buy:  fiat → Coinbase onramp → USDC (Arbitrum) → Across counterfactual → USDH (HyperCore)
 *   Sell: USDH (HyperEVM) → Across swap → USDC (Arbitrum) → Coinbase offramp → fiat
 *
 * Usage:
 *   # Show buy flow (generate deposit address + Coinbase URL)
 *   ACROSS_API_KEY=... COINBASE_WORKER_URL=... COINBASE_APP_ID=... \
 *     npx tsx examples/usdh-ramp.ts buy 100 0xYourHyperCoreAddress
 *
 *   # Show sell flow (get swap quote)
 *   ACROSS_API_KEY=... \
 *     npx tsx examples/usdh-ramp.ts sell 50 0xYourHyperEVMAddress
 *
 *   # Check deposit status
 *   ACROSS_API_KEY=... \
 *     npx tsx examples/usdh-ramp.ts status 0xDepositAddress
 *
 *   # Test on testnet (will show error - ramp is mainnet only)
 *   npx tsx examples/usdh-ramp.ts buy 100 0xAddr --testnet
 *
 * Environment variables:
 *   ACROSS_API_KEY          - Across API bearer token
 *   ACROSS_INTEGRATOR_ID    - 2-byte hex integrator ID (e.g. 0x00f3)
 *   COINBASE_WORKER_URL     - Worker URL for session token generation
 *   COINBASE_APP_ID         - Coinbase Developer Platform project ID
 */

import { createHIP4Adapter } from "../src";

// ─── Config from env ─────────────────────────────────────────────────────────

const ACROSS_API_KEY = process.env.ACROSS_API_KEY ?? "";
const ACROSS_INTEGRATOR_ID = process.env.ACROSS_INTEGRATOR_ID ?? "";
const COINBASE_WORKER_URL = process.env.COINBASE_WORKER_URL ?? "";
const COINBASE_APP_ID = process.env.COINBASE_APP_ID ?? "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAmount(raw: string, decimals: number): string {
  if (!raw || raw === "0") return "0";
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function hr() {
  console.log("─".repeat(60));
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function buyFlow(amount: string, recipient: string, isTestnet: boolean) {
  console.log("\n🟢 Buy USDH - Fiat → USDC (Arbitrum) → USDH (HyperCore)\n");
  hr();

  const adapter = createHIP4Adapter({
    testnet: isTestnet,
    ramp: {
      acrossApiKey: ACROSS_API_KEY,
      acrossIntegratorId: ACROSS_INTEGRATOR_ID,
      coinbaseTokenWorkerUrl: COINBASE_WORKER_URL,
      coinbaseAppId: COINBASE_APP_ID,
    },
  });

  // Access ramp adapter (cast since PredictionsAdapter doesn't expose it)
  const ramp = (
    adapter as { ramp: typeof adapter extends { ramp: infer R } ? R : never }
  ).ramp;
  if (!ramp) {
    console.error("Ramp adapter not available");
    return;
  }

  try {
    // Step 1: Generate deposit address
    console.log(`Amount:    $${amount} USD`);
    console.log(`Recipient: ${recipient} (HyperCore)`);
    hr();

    console.log("⏳ Generating counterfactual deposit address...");
    const deposit = await ramp.generateDepositAddress({ amount, recipient });

    console.log(`\n✅ Deposit address generated!\n`);
    console.log(`  Address:         ${deposit.depositAddress}`);
    console.log(
      `  Send:            ${formatAmount(deposit.inputAmount, deposit.inputToken.decimals)} ${deposit.inputToken.symbol} on Arbitrum`,
    );
    console.log(
      `  Receive:         ~${formatAmount(deposit.expectedOutputAmount, deposit.outputToken.decimals)} ${deposit.outputToken.symbol} on HyperCore`,
    );
    console.log(
      `  Min output:      ${formatAmount(deposit.minOutputAmount, deposit.outputToken.decimals)} ${deposit.outputToken.symbol}`,
    );
    console.log(`  Est. fill:       ~${deposit.expectedFillTime}s`);
    console.log(
      `  Quote expires:   ${new Date(deposit.quoteExpiryTimestamp * 1000).toISOString()}`,
    );
    console.log(`  Quote ID:        ${deposit.id}`);

    if (deposit.fees?.total?.amountUsd) {
      console.log(
        `  Fees:            $${Number(deposit.fees.total.amountUsd).toFixed(4)}`,
      );
    }

    // Step 2: Generate Coinbase URL (if worker configured)
    if (COINBASE_WORKER_URL && COINBASE_APP_ID) {
      hr();
      console.log("⏳ Getting Coinbase session token...");
      const session = await ramp.getCoinbaseSessionToken({
        walletAddress: deposit.depositAddress,
        blockchains: ["arbitrum"],
      });
      const buyUrl = ramp.generateBuyUrl({
        sessionToken: session.token,
        amount: Number(amount),
      });
      console.log(`\n🔗 Coinbase onramp URL:\n   ${buyUrl.url}\n`);
      console.log("Open this URL in a browser to complete the purchase.");
    } else {
      hr();
      console.log(
        "\n📋 Send USDC to the deposit address on Arbitrum manually.",
      );
      console.log(
        "   (Set COINBASE_WORKER_URL + COINBASE_APP_ID for 1-click buy)\n",
      );
    }

    hr();
    console.log(
      "After payment, Across will detect the deposit and deliver USDH.",
    );
    console.log(
      `Track status: npx tsx examples/usdh-ramp.ts status ${deposit.depositAddress}`,
    );
  } catch (err) {
    console.error("\n❌ Error:", (err as Error).message);
  }

  adapter.destroy();
}

async function sellFlow(amount: string, depositor: string, isTestnet: boolean) {
  console.log("\n🔴 Sell USDH - USDH (HyperEVM) → USDC (Arbitrum) → Fiat\n");
  hr();

  const adapter = createHIP4Adapter({
    testnet: isTestnet,
    ramp: {
      acrossApiKey: ACROSS_API_KEY,
      acrossIntegratorId: ACROSS_INTEGRATOR_ID,
      coinbaseTokenWorkerUrl: COINBASE_WORKER_URL,
      coinbaseAppId: COINBASE_APP_ID,
    },
  });

  const ramp = (
    adapter as { ramp: typeof adapter extends { ramp: infer R } ? R : never }
  ).ramp;
  if (!ramp) {
    console.error("Ramp adapter not available");
    return;
  }

  try {
    console.log(`Amount:    ${amount} USDH`);
    console.log(`Depositor: ${depositor} (HyperEVM)`);
    hr();

    console.log("⏳ Getting swap quote...");
    const quote = await ramp.getSellQuote({ amount, depositor });

    console.log(`\n✅ Quote received!\n`);
    console.log(
      `  You sell:        ${formatAmount(quote.inputAmount, quote.inputToken.decimals)} ${quote.inputToken.symbol} (HyperEVM)`,
    );
    console.log(
      `  You receive:     ~${formatAmount(quote.expectedOutputAmount, quote.outputToken.decimals)} ${quote.outputToken.symbol} (Arbitrum)`,
    );
    console.log(
      `  Min received:    ${formatAmount(quote.minOutputAmount, quote.outputToken.decimals)} ${quote.outputToken.symbol}`,
    );
    console.log(`  Est. fill:       ~${quote.expectedFillTime}s`);

    if (quote.fees?.total?.amountUsd) {
      console.log(
        `  Fees:            $${Number(quote.fees.total.amountUsd).toFixed(4)}`,
      );
    }

    if (quote.approvalTxns?.length) {
      console.log(
        `\n  ⚠ ${quote.approvalTxns.length} approval tx(s) required before swap`,
      );
      for (const tx of quote.approvalTxns) {
        console.log(`    → to: ${tx.to} (chainId: ${tx.chainId})`);
      }
    }

    if (quote.swapTx) {
      console.log(`\n  Swap TX:`);
      console.log(`    to:      ${quote.swapTx.to}`);
      console.log(`    chainId: ${quote.swapTx.chainId}`);
      console.log(`    data:    ${quote.swapTx.data.slice(0, 42)}...`);
    }

    // Coinbase offramp URL
    if (COINBASE_WORKER_URL && COINBASE_APP_ID) {
      hr();
      console.log("⏳ Getting Coinbase session token for offramp...");
      const session = await ramp.getCoinbaseSessionToken({
        walletAddress: depositor,
        blockchains: ["arbitrum", "base", "ethereum"],
      });
      const sellUrl = ramp.generateSellUrl({
        sessionToken: session.token,
        amount: Number(
          formatAmount(quote.expectedOutputAmount, quote.outputToken.decimals),
        ),
      });
      console.log(
        `\n🔗 Coinbase offramp URL (use after swap fills):\n   ${sellUrl.url}\n`,
      );
    }

    hr();
    console.log("\nTo execute: sign the swap TX with your wallet on HyperEVM,");
    console.log("then use the Coinbase offramp to cash out USDC to your bank.");
  } catch (err) {
    console.error("\n❌ Error:", (err as Error).message);
  }

  adapter.destroy();
}

async function checkStatus(depositAddress: string) {
  console.log("\n📊 Deposit Status\n");
  hr();

  const adapter = createHIP4Adapter({
    testnet: false,
    ramp: { acrossApiKey: ACROSS_API_KEY },
  });

  const ramp = (
    adapter as { ramp: typeof adapter extends { ramp: infer R } ? R : never }
  ).ramp;
  if (!ramp) {
    console.error("Ramp adapter not available");
    return;
  }

  try {
    const status = await ramp.checkDepositStatus(depositAddress);
    console.log(`  Address:     ${depositAddress}`);
    console.log(`  Status:      ${status.status}`);
    if (status.depositTxnRef)
      console.log(`  Deposit tx:  ${status.depositTxnRef}`);
    if (status.fillTxnRef) console.log(`  Fill tx:     ${status.fillTxnRef}`);
    console.log(`  Origin:      Chain ${status.originChainId}`);
    console.log(`  Destination: Chain ${status.destinationChainId}`);
  } catch (err) {
    console.error("\n❌ Error:", (err as Error).message);
  }

  adapter.destroy();
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const isTestnet = args.includes("--testnet");

  if (!command) {
    console.log(`
USDH On/Off-Ramp CLI

Commands:
  buy <amount> <recipient>     Generate deposit address + Coinbase URL
  sell <amount> <depositor>    Get swap quote (USDH → USDC)
  status <depositAddress>      Check deposit status

Options:
  --testnet                    Use testnet (will error - ramp is mainnet only)

Examples:
  npx tsx examples/usdh-ramp.ts buy 100 0x1234...
  npx tsx examples/usdh-ramp.ts sell 50 0x1234...
  npx tsx examples/usdh-ramp.ts status 0xABCD...
`);
    return;
  }

  switch (command) {
    case "buy":
      if (!args[1] || !args[2]) {
        console.error("Usage: buy <amount> <recipient>");
        return;
      }
      await buyFlow(args[1], args[2], isTestnet);
      break;
    case "sell":
      if (!args[1] || !args[2]) {
        console.error("Usage: sell <amount> <depositor>");
        return;
      }
      await sellFlow(args[1], args[2], isTestnet);
      break;
    case "status":
      if (!args[1]) {
        console.error("Usage: status <depositAddress>");
        return;
      }
      await checkStatus(args[1]);
      break;
    default:
      console.error(`Unknown command: ${command}`);
  }
}

main().catch(console.error);
