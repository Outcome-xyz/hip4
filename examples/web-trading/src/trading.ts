import {
  getAgentApprovalTypedData,
  getBuilderFeeApprovalTypedData,
  isUsdClassTransferRequired,
  submitAgentApproval,
  submitBuilderFeeApproval,
} from "@outcome.xyz/hip4";
import { createWalletClient, custom } from "viem";
import type { Address, EIP1193Provider, WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { hip4 } from "./markets";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

// Optional. The fee is in tenths of a basis point: 10 is 0.01%, 1000 is the 1% maximum.
export const BUILDER: { address: Address; fee: number } | null = null;

// Shown in the user's API wallets on Hyperliquid. Approving the same name again
// replaces the previous agent.
const AGENT_NAME = "OUTsdk";

// Hyperliquid signs approvals for Arbitrum, or Arbitrum Sepolia on testnet.
const isMainnet = !hip4.client.testnet;
const signingChain = isMainnet ? arbitrum : arbitrumSepolia;

export async function connectWallet() {
  if (!window.ethereum) throw new Error("No browser wallet found.");
  const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!account) throw new Error("The wallet returned no account.");
  const wallet = createWalletClient({ account, chain: signingChain, transport: custom(window.ethereum) });
  // Wallets only sign for the chain they're on. If the wallet doesn't know the
  // chain yet, add it, then switch again: adding a chain doesn't always switch to it.
  if ((await wallet.getChainId()) !== signingChain.id) {
    try {
      await wallet.switchChain({ id: signingChain.id });
    } catch {
      await wallet.addChain({ chain: signingChain });
      await wallet.switchChain({ id: signingChain.id });
    }
    if ((await wallet.getChainId()) !== signingChain.id) {
      throw new Error(`Switch your wallet to ${signingChain.name} to trade.`);
    }
  }
  return wallet;
}

/** Why this wallet can't trade, or null if it can. */
export async function accountProblem(user: Address): Promise<string | null> {
  const { role } = await hip4.client.fetchUserRole(user);
  if (role === "missing") return "This wallet has no Hyperliquid account yet. Deposit USDC on Hyperliquid first.";
  if (role === "agent") return "This address is an API wallet. Connect your main wallet instead.";
  return null;
}

/**
 * The wallet approves your builder fee, once per user, and a new agent key.
 * The agent key stays in memory and signs every order, with no wallet popup.
 */
export async function enableTrading(wallet: WalletClient): Promise<void> {
  const account = wallet.account!;
  if (BUILDER && (await hip4.client.fetchMaxBuilderFee(account.address, BUILDER.address)) < BUILDER.fee) {
    const rate = `${BUILDER.fee / 1000}%`;
    const nonce = Date.now();
    const typed = getBuilderFeeApprovalTypedData(BUILDER.address, rate, nonce, isMainnet);
    const signature = await wallet.signTypedData({ account, ...typed });
    const result = await submitBuilderFeeApproval(signature, BUILDER.address, rate, nonce, isMainnet);
    if (!result.success) throw new Error(result.error ?? "Builder fee approval failed");
  }

  const agent = privateKeyToAccount(generatePrivateKey());
  const nonce = Date.now();
  const typed = getAgentApprovalTypedData(agent.address, AGENT_NAME, nonce, isMainnet);
  const signature = await wallet.signTypedData({ account, ...typed });
  const result = await submitAgentApproval(signature, agent.address, AGENT_NAME, nonce, isMainnet);
  if (!result.success) throw new Error(result.error ?? "Agent approval failed");
  await hip4.auth.initAuth(account.address, agent);
}

/** USDC to move from perps to spot before trading. Unified accounts have one balance. */
export async function usdcInPerps(user: Address): Promise<string> {
  if (!isUsdClassTransferRequired(await hip4.client.fetchUserAbstraction(user))) return "0";
  return (await hip4.client.fetchClearinghouseState(user)).withdrawable;
}

export async function moveToSpot(wallet: WalletClient, amount: string): Promise<void> {
  const account = wallet.account!;
  hip4.wallet.setSigner({
    address: account.address,
    signTypedData: (args: unknown) =>
      wallet.signTypedData({ ...(args as Parameters<WalletClient["signTypedData"]>[0]), account }),
  });
  const result = await hip4.wallet.transferToSpot(amount);
  if (!result.success) throw new Error(result.error ?? "Transfer failed");
}
