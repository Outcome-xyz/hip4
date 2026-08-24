/**
 * Deploy a market and settle it, signing as an approved agent.
 *
 * The agent holds no funds and cannot move any. It can register and settle
 * outcomes for its master alone, one signature, no quorum, which is what keeps
 * a staked master wallet out of the hot path.
 *
 * Usage: AGENT_PRIVATE_KEY=0x... npx tsx examples/deploy-and-settle.ts
 *
 * @experimental The deployer surface may change without a major version.
 *
 * WARNING: this writes to the chain. Registering consumes one of the day's
 * deploys and one concurrent outcome slot; settling is irreversible.
 */

import { privateKeyToAccount } from "viem/accounts";
import {
  assertTemplateInstance,
  createHIP4Adapter,
  requireTemplate,
  toTemplateStamp,
} from "../src";

const TEMPLATE_ID = "binaryPrice4";

async function main() {
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) {
    console.error("Set AGENT_PRIVATE_KEY to an approved agent key");
    process.exit(1);
  }
  const account = privateKeyToAccount(key as `0x${string}`);
  console.log("Signing as agent", account.address);

  const adapter = createHIP4Adapter({ testnet: true });
  adapter.deployer.setSigner({
    getAddress: () => account.address,
    signTypedData: (domain, types, message) =>
      account.signTypedData({
        domain,
        types,
        primaryType: Object.keys(types)[0] as string,
        message,
      }),
  });

  /* Validate against the live registry first: a refusal here costs a
     correction, a refusal on the wire costs one of the day's deploys. */
  const template = requireTemplate(
    await adapter.deployer.fetchTemplates(),
    TEMPLATE_ID,
  );
  const values = {
    perp: "BTC",
    threshold: "50000",
    time: toTemplateStamp(new Date(Date.now() + 15 * 60 * 1000)),
  };
  assertTemplateInstance(template, values);

  const registered = await adapter.deployer.registerStandaloneOutcome({
    templateId: TEMPLATE_ID,
    values,
    deployerFeeScale: "0",
  });
  console.log("register", registered.success ? "ok" : registered.error);
  console.log("action hash", registered.actionHash);
  if (!registered.success) process.exit(1);

  /* The exchange assigns the outcome id, so read it back from outcomeMeta
     rather than guessing it from the response. */
  const meta = await adapter.client.fetchOutcomeMeta();
  const venue = meta.deployers?.find(
    (d) => d.deployer.toLowerCase() === account.address.toLowerCase(),
  )?.venue;
  const mine = meta.outcomes.filter((o) => o.venue === venue);
  const outcomeId = mine.at(-1)?.outcome;
  console.log("outcome", outcomeId, "on venue", venue);

  if (outcomeId !== undefined && process.env.SETTLE === "1") {
    /* settleFraction 1 pays the first side, 0 pays the second. */
    const settled = await adapter.deployer.settleOutcome({
      outcomeId,
      settleFraction: "1",
    });
    console.log("settle", settled.success ? "ok" : settled.error);
  }

  adapter.destroy();
}

main().catch(console.error);
