// ---------------------------------------------------------------------------
// EIP-712 type tables for the deployer and account actions
//
// @experimental Field order is part of the EIP-712 struct hash. These match
// the Hyperliquid Python SDK's tables verbatim; a deviation produces a valid
// signature over a different message and the exchange reports an unrelated
// address as the signer.
// ---------------------------------------------------------------------------

export type Eip712Fields = Array<{ name: string; type: string }>;
export type Eip712Types = Record<string, Eip712Fields>;

/** approveAgent. `agentAddress` is an address field, so it must be lowercase. */
export const APPROVE_AGENT_TYPES: Eip712Types = {
  "HyperliquidTransaction:ApproveAgent": [
    { name: "hyperliquidChain", type: "string" },
    { name: "agentAddress", type: "address" },
    { name: "agentName", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
};

/** convertToMultiSigUser. `signers` is a JSON string, not a struct. */
export const CONVERT_TO_MULTI_SIG_USER_TYPES: Eip712Types = {
  "HyperliquidTransaction:ConvertToMultiSigUser": [
    { name: "hyperliquidChain", type: "string" },
    { name: "signers", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
};

/** userSetAbstraction. */
export const USER_SET_ABSTRACTION_TYPES: Eip712Types = {
  "HyperliquidTransaction:UserSetAbstraction": [
    { name: "hyperliquidChain", type: "string" },
    { name: "user", type: "address" },
    { name: "abstraction", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
};

/** tokenDelegate. */
export const TOKEN_DELEGATE_TYPES: Eip712Types = {
  "HyperliquidTransaction:TokenDelegate": [
    { name: "hyperliquidChain", type: "string" },
    { name: "validator", type: "address" },
    { name: "wei", type: "uint64" },
    { name: "isUndelegate", type: "bool" },
    { name: "nonce", type: "uint64" },
  ],
};

/** cDeposit, staking deposit. */
export const C_DEPOSIT_TYPES: Eip712Types = {
  "HyperliquidTransaction:CDeposit": [
    { name: "hyperliquidChain", type: "string" },
    { name: "wei", type: "uint64" },
    { name: "nonce", type: "uint64" },
  ],
};

/** cWithdraw, staking withdrawal. */
export const C_WITHDRAW_TYPES: Eip712Types = {
  "HyperliquidTransaction:CWithdraw": [
    { name: "hyperliquidChain", type: "string" },
    { name: "wei", type: "uint64" },
    { name: "nonce", type: "uint64" },
  ],
};

/** The outer multi-sig envelope, signed by the leader over the inner hash. */
export const SEND_MULTI_SIG_TYPES: Eip712Types = {
  "HyperliquidTransaction:SendMultiSig": [
    { name: "hyperliquidChain", type: "string" },
    { name: "multiSigActionHash", type: "bytes32" },
    { name: "nonce", type: "uint64" },
  ],
};
