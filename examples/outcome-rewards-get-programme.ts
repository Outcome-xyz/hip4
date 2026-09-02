/**
 * Outcome liquidity rewards: programme totals, one wallet's earnings,
 * reward periods, and the leaderboard.
 *
 * Usage: npx tsx examples/outcome-rewards-get-programme.ts [wallet]
 */

import { outcomeRewards } from "../src";

async function main() {
  const totals = await outcomeRewards.programme();
  console.log(
    `Programme: ${totals.paidUsdc} paid, ${totals.pendingUsdc} pending, ${totals.awardedUsdc} awarded`,
  );
  console.log(
    `${totals.payments} payments to ${totals.wallets} wallets across ${totals.rewardPeriods} reward periods`,
  );

  const wallet = process.argv[2];
  if (wallet) {
    const mine = await outcomeRewards.wallet(wallet);
    console.log(`\n--- ${wallet} (${mine.rewards.length} rewards) ---`);
    for (const r of mine.rewards) {
      console.log(
        `  ${r.marketName} | ${r.rewardUsdc} USDC | ${r.status}${r.epochEndDate ? ` | epoch ${r.epochEndDate}` : ""}`,
      );
    }
  }

  const periods = await outcomeRewards.periods({ limit: 10 });
  console.log(`\n--- most recent reward periods (${periods.length}) ---`);
  for (const p of periods) {
    console.log(
      `  ${p.marketName} | ${p.paidUsdc}/${p.awardedUsdc} USDC | ${p.state}`,
    );
  }

  const board = await outcomeRewards.leaderboard({ limit: 5 });
  console.log(`\n--- leaderboard (top ${board.length}) ---`);
  for (const w of board) {
    console.log(`  #${w.rank} ${w.wallet} | ${w.paidUsdc} USDC paid`);
  }
}

main().catch(console.error);
