/**
 * Approve an agent on behalf of a 2-of-3 multi-sig master.
 *
 * The shape of it: each authorised founder signs the action INNER, then one of
 * them acts as leader, collects the signatures, wraps them and submits. Every
 * signature has to be over the same nonce and name the same leader, so the
 * nonce is taken once at the top.
 *
 * approveAgent is ordinary typed data on a real chain id, so each founder's
 * inner signature can come from their own browser wallet or custodian. This
 * example uses local keys for brevity; in practice `signMultiSigInnerUserSignedAction`
 * takes any HIP4Signer, so a wallet-backed one drops straight in.
 *
 * Deploying and settling sign on chain 1337, which no browser wallet will
 * touch. That asymmetry is the whole reason those get delegated to an agent.
 *
 * Usage: FOUNDER_A_KEY=0x... FOUNDER_B_KEY=0x... MASTER=0x... AGENT=0x... \
 *          npx tsx examples/multisig-approve-agent.ts
 *
 * @experimental The deployer surface may change without a major version.
 */

import { privateKeyToAccount } from "viem/accounts";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  APPROVE_AGENT_TYPES,
  buildApproveAgentAction,
  createHIP4Adapter,
  nextNonce,
  signMultiSigInnerUserSignedAction,
} from "../src";
import type { HIP4Signer } from "../src";

function toSigner(account: PrivateKeyAccount): HIP4Signer {
  return {
    getAddress: () => account.address,
    signTypedData: (domain, types, message) =>
      account.signTypedData({
        domain,
        types,
        primaryType: Object.keys(types)[0] as string,
        message,
      }),
  };
}

async function main() {
  const { FOUNDER_A_KEY, FOUNDER_B_KEY, MASTER, AGENT } = process.env;
  if (!FOUNDER_A_KEY || !FOUNDER_B_KEY || !MASTER || !AGENT) {
    console.error("Set FOUNDER_A_KEY, FOUNDER_B_KEY, MASTER and AGENT");
    process.exit(1);
  }

  const founderA = privateKeyToAccount(FOUNDER_A_KEY as `0x${string}`);
  const founderB = privateKeyToAccount(FOUNDER_B_KEY as `0x${string}`);
  /* The leader submits, so it must be an authorised user and can never be the
     multi-sig account itself. */
  const leader = founderA;

  const adapter = createHIP4Adapter({ testnet: true });

  const signers = await adapter.client.fetchMultiSigSigners(MASTER);
  if (!signers) {
    console.error(`${MASTER} is not a multi-sig account.`);
    adapter.destroy();
    return;
  }
  console.log(`quorum ${signers.threshold} of ${signers.authorizedUsers.length}`);

  /* One nonce, shared by every inner signature and the outer submission. */
  const nonce = nextNonce();
  const action = buildApproveAgentAction({
    agentAddress: AGENT,
    agentName: "operations",
    nonce,
    network: "testnet",
  });

  const inner = { multiSigUser: MASTER, outerSigner: leader.address, network: "testnet" } as const;
  const signatures = await Promise.all(
    [founderA, founderB].map((founder) =>
      signMultiSigInnerUserSignedAction({
        ...inner,
        signer: toSigner(founder),
        action: action as unknown as Record<string, unknown> & {
          signatureChainId: string;
        },
        types: APPROVE_AGENT_TYPES,
      }),
    ),
  );
  console.log(`collected ${signatures.length} inner signatures`);

  adapter.deployer.setSigner(toSigner(leader));
  const result = await adapter.deployer.submitMultiSig({
    multiSigUser: MASTER,
    outerSigner: leader.address,
    action: action as unknown as Record<string, unknown>,
    signatures,
    nonce,
  });
  console.log(result.success ? "approved" : `refused: ${result.error}`);

  adapter.destroy();
}

main().catch(console.error);
