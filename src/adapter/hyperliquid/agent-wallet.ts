import { splitHexSignature, type HLSignature } from "./types";

const HL_MAINNET_CHAIN_ID = 42161;
const HL_TESTNET_CHAIN_ID = 421614;

function getEIP712Domain(isMainnet: boolean) {
  return {
    name: "HyperliquidSignTransaction",
    version: "1",
    chainId: isMainnet ? HL_MAINNET_CHAIN_ID : HL_TESTNET_CHAIN_ID,
    verifyingContract:
      "0x0000000000000000000000000000000000000000" as `0x${string}`,
  } as const;
}

const HL_MAINNET_API = "https://api.hyperliquid.xyz";
const HL_TESTNET_API = "https://api.hyperliquid-testnet.xyz";

/** Build EIP-712 typed data for an agent-wallet approval signature. */
export function getAgentApprovalTypedData(
  agentAddress: `0x${string}`,
  agentName: string,
  nonce: number,
  isMainnet = true,
) {
  return {
    domain: getEIP712Domain(isMainnet),
    types: {
      "HyperliquidTransaction:ApproveAgent": [
        { name: "hyperliquidChain", type: "string" },
        { name: "agentAddress", type: "address" },
        { name: "agentName", type: "string" },
        { name: "nonce", type: "uint64" },
      ],
    },
    primaryType: "HyperliquidTransaction:ApproveAgent" as const,
    message: {
      hyperliquidChain: isMainnet ? "Mainnet" : "Testnet",
      agentAddress: agentAddress.toLowerCase() as `0x${string}`,
      agentName,
      nonce: BigInt(nonce),
    },
  };
}

// ---------------------------------------------------------------------------
// Builder fee approval
// ---------------------------------------------------------------------------

/** EIP-712 types for builder fee approval. */
export const APPROVE_BUILDER_FEE_TYPES: Record<
  string,
  Array<{ name: string; type: string }>
> = {
  "HyperliquidTransaction:ApproveBuilderFee": [
    { name: "hyperliquidChain", type: "string" },
    { name: "maxFeeRate", type: "string" },
    { name: "builder", type: "address" },
    { name: "nonce", type: "uint64" },
  ],
};

/** Build EIP-712 typed data for a builder-fee approval signature. */
export function getBuilderFeeApprovalTypedData(
  builderAddress: `0x${string}`,
  maxFeeRate: string,
  nonce: number,
  isMainnet = true,
) {
  return {
    domain: getEIP712Domain(isMainnet),
    types: APPROVE_BUILDER_FEE_TYPES,
    primaryType: "HyperliquidTransaction:ApproveBuilderFee",
    message: {
      hyperliquidChain: isMainnet ? "Mainnet" : "Testnet",
      maxFeeRate,
      builder: builderAddress.toLowerCase() as `0x${string}`,
      nonce: BigInt(nonce),
    },
  };
}

/** Submit a signed builder-fee approval to the Hyperliquid exchange API. */
export async function submitBuilderFeeApproval(
  signature: `0x${string}`,
  builderAddress: `0x${string}`,
  maxFeeRate: string,
  nonce: number,
  isMainnet = true,
  exchangeUrl?: string,
): Promise<{ success: boolean; error?: string }> {
  const parsedSig: HLSignature = splitHexSignature(signature);

  const action = {
    type: "approveBuilderFee",
    signatureChainId: isMainnet ? "0xa4b1" : "0x66eee",
    hyperliquidChain: isMainnet ? "Mainnet" : "Testnet",
    maxFeeRate,
    builder: builderAddress.toLowerCase(),
    nonce,
  };

  try {
    const url =
      exchangeUrl ?? `${isMainnet ? HL_MAINNET_API : HL_TESTNET_API}/exchange`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        nonce,
        signature: parsedSig,
      }),
    });

    const result = (await response.json()) as {
      status?: string;
      response?: { error?: string } | string;
    };

    if (result.status === "ok") {
      return { success: true };
    }

    const errorMsg =
      typeof result.response === "string"
        ? result.response
        : result.response?.error ?? "Failed to approve builder fee";
    return { success: false, error: errorMsg };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

// ---------------------------------------------------------------------------
// Set referrer
// ---------------------------------------------------------------------------
// Agent approval
// ---------------------------------------------------------------------------

/** Submit a signed agent-approval transaction to the Hyperliquid exchange API. */
export async function submitAgentApproval(
  signature: `0x${string}`,
  agentAddress: `0x${string}`,
  agentName: string,
  nonce: number,
  isMainnet = true,
  exchangeUrl?: string,
): Promise<{ success: boolean; error?: string }> {
  const parsedSig: HLSignature = splitHexSignature(signature);

  const action = {
    type: "approveAgent",
    signatureChainId: isMainnet ? "0xa4b1" : "0x66eee",
    hyperliquidChain: isMainnet ? "Mainnet" : "Testnet",
    agentAddress: agentAddress.toLowerCase(),
    agentName,
    nonce,
  };

  try {
    const url =
      exchangeUrl ?? `${isMainnet ? HL_MAINNET_API : HL_TESTNET_API}/exchange`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        nonce,
        signature: parsedSig,
      }),
    });

    const result = (await response.json()) as {
      status?: string;
      response?: string | { error?: string };
    };

    if (result.status === "ok") {
      return { success: true };
    }

    const error =
      typeof result.response === "string"
        ? result.response
        : (result.response?.error ?? "Failed to approve agent");
    return { success: false, error };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
