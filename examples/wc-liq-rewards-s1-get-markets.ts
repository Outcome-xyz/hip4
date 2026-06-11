/**
 * Liquidity rewards season 1 (World Cup 2026): check team/match eligibility
 * and wallet reward scores.
 *
 * Usage: npx tsx examples/wc-liq-rewards-s1-get-markets.ts [wallet]
 */

import { liquidityRewards } from "../src";

async function main() {
  const s1 = liquidityRewards.season("s1");

  const teams = await s1.checkEligibility({ subject: "teams" });
  console.log(`Season ${teams.season} (${teams.campaignId})`);
  console.log(`Scoring day ${teams.epochDate} [${teams.epochStatus}]`);
  console.log(`Builder code: ${teams.builderCode}`);

  console.log(`\n--- eligible teams (${teams.eligible.length}) ---`);
  for (const m of teams.eligible) {
    const mid = m.eligibilityMid ? ` | mid ${m.eligibilityMid}` : "";
    console.log(`  ${m.teamName} | outcome @${m.hyperliquidOutcomeId}${mid}`);
  }

  const matches = await s1.checkEligibility({ subject: "matches" });
  console.log(`\n--- eligible matches (${matches.eligible.length}) ---`);
  for (const m of matches.eligible) {
    console.log(
      `  ${m.matchName} | question ${m.hyperliquidQuestionId} | ${m.matchRewardAmountUsdc} USDC | ${m.liveMultiplier}x live`,
    );
  }

  const wallet = process.argv[2];
  const rewards = await s1.checkRewards(wallet ? { wallet } : {});
  console.log(
    `\n--- scores${wallet ? ` for ${wallet}` : ""} (${rewards.scores.length}) ---`,
  );
  for (const s of rewards.scores) {
    const label =
      s.scoreScope === "champion" ? s.teamName : `${s.matchName} / ${s.outcomeName}`;
    console.log(
      `  ${s.wallet} | ${label} | provisional score ${s.totalScore} | reward ${s.dailyRewardUsdc ?? "pending"}`,
    );
  }
}

main().catch(console.error);
