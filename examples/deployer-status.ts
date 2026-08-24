/**
 * Read a HIP-4 deployer's state off the chain, and say what is in the way.
 *
 * Read-only: no key, no signer, nothing written. Use it to check a candidate
 * master before spending an activation, which is a one-way door.
 *
 * Usage: npx tsx examples/deployer-status.ts <master-address> [agent-address]
 *
 * @experimental The deployer surface may change without a major version.
 */

import {
  createHIP4Adapter,
  deployerSteps,
  deployBlockedReason,
  splitBySeries,
} from "../src";

/* Your number, not the SDK's: HIP-4 publishes no general settlement window,
   so templates that carry no resolutionDeadline of their own fall back to
   this. Templates that do publish one ignore it. */
const SETTLE_WITHIN_MS = 6 * 60 * 60 * 1000;

async function main() {
  const master = process.argv[2];
  const agentAddress = process.argv[3];
  if (!master) {
    console.error("Usage: deployer-status.ts <master-address> [agent-address]");
    process.exit(1);
  }

  const adapter = createHIP4Adapter({ testnet: true });
  const snapshot = await adapter.deployer.fetchSnapshot(master);

  console.log(`master           ${snapshot.master}`);
  console.log(`role             ${snapshot.role ?? "missing"}`);
  console.log(`userAbstraction  ${snapshot.abstraction ?? "unknown"}`);
  console.log(
    `multi-sig        ${
      snapshot.isMultiSig
        ? `${snapshot.threshold} of ${snapshot.authorizedUsers.length}`
        : "no"
    }`,
  );
  console.log(`staked           ${snapshot.stakedHype} HYPE`);
  console.log(`venue            ${snapshot.venue ?? "none"}`);
  console.log(
    `outcomes         ${snapshot.activeOutcomes} of ${snapshot.limits.activeOutcomes}`,
  );

  console.log("\n--- agents ---");
  for (const agent of snapshot.agents) {
    const when = new Date(agent.validUntil).toISOString().slice(0, 16);
    console.log(`  ${agent.address}  ${agent.name || "(unnamed)"}  until ${when}`);
  }

  console.log("\n--- onboarding ---");
  for (const step of deployerSteps(snapshot, { agentAddress })) {
    const mark = step.state === "done" ? "x" : step.state === "ready" ? " " : "!";
    console.log(`  [${mark}] ${step.title}: ${step.detail}`);
    if (step.blockedBy) console.log(`        ${step.blockedBy}`);
  }

  const blocked = deployBlockedReason(snapshot);
  console.log(`\ncan deploy       ${blocked === null ? "yes" : `no, ${blocked}`}`);

  const queue = await adapter.deployer.fetchSettlementQueue(master, {
    settleWithinMs: SETTLE_WITHIN_MS,
    warnLeadMs: 30 * 60 * 1000,
  });
  console.log(`\n--- settlement queue (${queue.length}) ---`);
  for (const item of queue) {
    const when = item.deadline?.toISOString().slice(0, 16) ?? "unknown";
    const source = item.deadlineIsPublished ? "template" : "window";
    console.log(
      `  [${item.state}] @${item.outcome.outcomeId} by ${when} (${source})`,
    );
    console.log(`        ${item.why}`);
  }

  const { current, deprecated } = splitBySeries(
    await adapter.deployer.fetchTemplates(),
  );
  console.log(`\n--- templates (${current.length} current) ---`);
  for (const t of current) console.log(`  ${t.id}  ${t.name}`);
  if (deprecated.length > 0) {
    console.log(`  superseded: ${deprecated.map((t) => t.id).join(", ")}`);
  }

  adapter.destroy();
}

main().catch(console.error);
