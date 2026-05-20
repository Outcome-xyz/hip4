/**
 * Authenticate with an EOA (externally owned account) using viem.
 *
 * This example shows how to:
 * 1. Generate an ephemeral agent keypair
 * 2. Get the user to sign an agent approval
 * 3. Submit the approval to Hyperliquid
 * 4. Initialize the adapter for trading
 *
 * Usage: PRIVATE_KEY=0x... npx tsx examples/auth-eoa.ts
 *
 * WARNING: Never hardcode private keys. Use env vars or a secure vault.
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { arbitrum } from "viem/chains";
import {
  createHIP4Adapter,
  getAgentApprovalTypedData,
  submitAgentApproval,
} from "../src";

const IS_MAINNET = false;
const AGENT_NAME = "HIP-4 Example";

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("Set PRIVATE_KEY env var (0x-prefixed hex)");
    process.exit(1);
  }

  // User's main wallet
  const userAccount = privateKeyToAccount(pk as `0x${string}`);
  const walletClient = createWalletClient({
    account: userAccount,
    chain: arbitrum,
    transport: http(),
  });
  console.log("User wallet:", userAccount.address);

  // Generate ephemeral agent key
  const agentPrivateKey = generatePrivateKey();
  const agentAccount = privateKeyToAccount(agentPrivateKey);
  console.log("Agent wallet:", agentAccount.address);

  // Get EIP-712 typed data for user to sign
  const nonce = Date.now();
  const typedData = getAgentApprovalTypedData(
    agentAccount.address,
    AGENT_NAME,
    nonce,
    IS_MAINNET,
  );

  // User signs the agent approval
  const signature = await walletClient.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });
  console.log("Approval signed");

  // Submit approval to HL exchange
  const approval = await submitAgentApproval(
    signature,
    agentAccount.address,
    AGENT_NAME,
    nonce,
    IS_MAINNET,
  );

  if (!approval.success) {
    console.error("Agent approval failed:", approval.error);
    process.exit(1);
  }
  console.log("Agent approved on exchange");

  // Initialize the adapter with the ephemeral agent
  const adapter = createHIP4Adapter({ testnet: !IS_MAINNET });
  await adapter.initialize();
  await adapter.auth.initAuth(userAccount.address, agentAccount);

  const status = adapter.auth.getAuthStatus();
  console.log("Auth status:", status.status);
  console.log("Ready to trade as", status.address);

  // Also set the wallet signer for user-signed operations (transfers, withdrawals)
  adapter.wallet.setSigner({
    address: userAccount.address,
    signTypedData: walletClient.signTypedData.bind(walletClient) as (
      ...args: unknown[]
    ) => Promise<string>,
  });
  console.log("Wallet signer set for transfers/withdrawals");

  adapter.destroy();
}

main().catch(console.error);
