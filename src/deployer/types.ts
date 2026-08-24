// ---------------------------------------------------------------------------
// HIP-4 deployer action types
//
// @experimental The whole deployer surface is experimental. HIP-4 deployment,
// settlement and native multi-sig are not covered by a published schema; the
// shapes here were read back from the live API and from a testnet run of the
// multi-sig deployer proof of concept (18 Aug 2026).
//
// Key order inside every action below is load-bearing. The signature is taken
// over the MessagePack bytes, and JavaScript preserves object literal
// insertion order, so reordering a field silently changes the action hash and
// the exchange recovers a different signer.
// ---------------------------------------------------------------------------

import type { HLSignature } from "../adapter/hyperliquid/types";

/** Which Hyperliquid book an action is for. @experimental */
export type HLNetwork = "mainnet" | "testnet";

/**
 * One template instantiation. `keywordToValue` must be sorted by keyword:
 * the exchange hashes the pairs in the order given.
 * @experimental
 */
export interface HLTemplateInstance {
  id: string;
  keywordToValue: Array<[string, string]>;
  /** Present on the instance that carries the fee, omitted on named outcomes. */
  deployerFeeScale?: string;
}

/**
 * Activate or deactivate an outcome deployer.
 *
 * Three accepted shapes, and only three: `{ type, activate: { venueName } }`
 * to claim a venue, `{ type, isDeactivate: false }` to activate without one,
 * `{ type, isDeactivate: true }` to deactivate. A flat `venueNameIfActivate`
 * is refused with a 422.
 * @experimental
 */
export interface HLActivateOutcomeDeployerAction {
  type: "activateOutcomeDeployer";
  activate?: { venueName: string };
  isDeactivate?: boolean;
}

/** Register a standalone two-sided outcome from a registry template. @experimental */
export interface HLRegisterStandaloneOutcomeAction {
  type: "spotDeploy";
  outcome: { registerStandaloneOutcomeFromTemplate: HLTemplateInstance };
}

/** Register a question and its named outcomes in one action. @experimental */
export interface HLRegisterQuestionAction {
  type: "spotDeploy";
  outcome: {
    registerQuestionFromTemplate: {
      questionTemplateInstance: HLTemplateInstance;
      /** In the order given, not sorted. */
      namedOutcomeTemplateInstances: HLTemplateInstance[];
    };
  };
}

/**
 * How one outcome settles. `settleFraction` is the share paid to the first
 * side: `"1"` pays side 0, `"0"` pays side 1, and anything between splits.
 * @experimental
 */
export interface HLOutcomeSettlement {
  outcome: number;
  settleFraction: string;
  details: string;
  /** The outcome's own name and description, echoed back verbatim. */
  nameAndDescription: [string, string];
  /** The outcome's own side names, echoed back verbatim. */
  sideNames: [string, string];
}

/** Settle a standalone outcome. @experimental */
export interface HLSettleOutcomeAction {
  type: "spotDeploy";
  outcome: { settleOutcome: HLOutcomeSettlement };
}

/** Settle every unsettled named outcome of a question at once. @experimental */
export interface HLSettleQuestionAction {
  type: "spotDeploy";
  outcome: {
    settleQuestion2: {
      question: number;
      outcomeSettlements: HLOutcomeSettlement[];
      nameAndDescription: [string, string];
    };
  };
}

/** Any L1 action the deployer surface sends. @experimental */
export type HLDeployerAction =
  | HLActivateOutcomeDeployerAction
  | HLRegisterStandaloneOutcomeAction
  | HLRegisterQuestionAction
  | HLSettleOutcomeAction
  | HLSettleQuestionAction;

// -- User-signed account actions --------------------------------------------

/** Fields every user-signed action carries. @experimental */
export interface HLUserSignedEnvelope {
  signatureChainId: string;
  hyperliquidChain: "Mainnet" | "Testnet";
}

/**
 * Approve an API wallet (agent) for the signing account.
 *
 * `agentAddress` must be lowercase. A checksummed address is refused, and the
 * error names the outer signer rather than the address, which is misleading.
 * An account may hold one unnamed agent and up to three named ones, subject
 * to a volume-based cap; re-approving an existing name replaces that agent.
 * @experimental
 */
export interface HLApproveAgentAction extends HLUserSignedEnvelope {
  type: "approveAgent";
  agentAddress: string;
  agentName: string;
  nonce: number;
}

/**
 * Convert an account to native multi-sig. `signers` is a JSON string, not an
 * object: `{"authorizedUsers":[...sorted lowercase...],"threshold":n}`.
 * @experimental
 */
export interface HLConvertToMultiSigUserAction extends HLUserSignedEnvelope {
  type: "convertToMultiSigUser";
  signers: string;
  nonce: number;
}

/**
 * Account abstraction mode as `userSetAbstraction` names it. HIP-4 deployers
 * must be on `disabled`, which the spec calls Standard and the Hyperliquid
 * app calls Manual.
 * @experimental
 */
export type HLAbstractionSetting =
  | "disabled"
  | "unifiedAccount"
  | "portfolioMargin";

/** Set the account abstraction mode. `user` must be lowercase. @experimental */
export interface HLUserSetAbstractionAction extends HLUserSignedEnvelope {
  type: "userSetAbstraction";
  user: string;
  abstraction: HLAbstractionSetting;
  nonce: number;
}

/** Delegate or undelegate staked HYPE. `validator` must be lowercase. @experimental */
export interface HLTokenDelegateAction extends HLUserSignedEnvelope {
  type: "tokenDelegate";
  validator: string;
  /** HYPE in wei, 8 decimals. */
  wei: number;
  isUndelegate: boolean;
  nonce: number;
}

/** Move HYPE from spot into the staking balance. @experimental */
export interface HLCDepositAction extends HLUserSignedEnvelope {
  type: "cDeposit";
  wei: number;
  nonce: number;
}

/** Move HYPE from the staking balance back to spot. @experimental */
export interface HLCWithdrawAction extends HLUserSignedEnvelope {
  type: "cWithdraw";
  wei: number;
  nonce: number;
}

/** Any user-signed account action the deployer surface sends. @experimental */
export type HLAccountAction =
  | HLApproveAgentAction
  | HLConvertToMultiSigUserAction
  | HLUserSetAbstractionAction
  | HLTokenDelegateAction
  | HLCDepositAction
  | HLCWithdrawAction;

// -- Multi-sig --------------------------------------------------------------

/**
 * The outer wrapper a multi-sig account sends instead of a bare action.
 * `signatures` are the inner signatures from the authorised users, at least
 * `threshold` of them, all over the same nonce and the same leader.
 * @experimental
 */
export interface HLMultiSigAction {
  type: "multiSig";
  signatureChainId: string;
  signatures: HLSignature[];
  payload: {
    /** The multi-sig account the action is performed on behalf of. */
    multiSigUser: string;
    /** The authorised user submitting, which cannot be the multi-sig account. */
    outerSigner: string;
    action: Record<string, unknown>;
  };
}

/** Result of any deployer or account action. @experimental */
export interface DeployerActionResult {
  success: boolean;
  error?: string;
  /** Nonce the action was signed with, for correlating with the exchange. */
  nonce: number;
  /** Keccak-256 of the signed action, for an approval record or a replay check. */
  actionHash?: string;
  /** The exchange's answer, verbatim. */
  response?: unknown;
}
