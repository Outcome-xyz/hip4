// ---------------------------------------------------------------------------
// HIP-4 deployer adapter
//
// @experimental Signs and submits the deployer and account actions. The
// builders in `actions.ts` stay pure; this is the part that holds a signer and
// touches the network.
//
// Two signing paths, and the difference decides the architecture:
//
//   L1 actions (deploy, settle, activate) sign on the phantom agent domain,
//   chain 1337, which no browser wallet will produce. An approved agent holds
//   a raw key and signs these alone.
//
//   User-signed actions (approveAgent, convertToMultiSigUser,
//   userSetAbstraction, staking) sign ordinary typed data on a real chain id,
//   so the founders can sign them from their own wallets.
// ---------------------------------------------------------------------------

import type { HIP4Client } from "../adapter/hyperliquid/client";
import {
  bytesToHex,
  createL1ActionHash,
  signL1Action,
  signUserSignedAction,
} from "../adapter/hyperliquid/signing";
import type {
  HIP4Signer,
  HLOutcome,
  HLOutcomeTemplate,
  HLQuestion,
  HLSignature,
} from "../adapter/hyperliquid/types";
import {
  buildActivateDeployerAction,
  buildApproveAgentAction,
  buildCDepositAction,
  buildConvertToMultiSigUserAction,
  buildCWithdrawAction,
  buildDeactivateDeployerAction,
  buildRegisterQuestionAction,
  buildRegisterStandaloneOutcomeAction,
  buildSettleOutcomeAction,
  buildSettleQuestionAction,
  buildTokenDelegateAction,
  buildUserSetAbstractionAction,
  nextNonce,
} from "./actions";
import type {
  RegisterQuestionParams,
  RegisterStandaloneOutcomeParams,
} from "./actions";
import { DeployerError } from "./error";
import { readDeployedOutcomes, type DeployedOutcome } from "./keywords";
import { buildMultiSigAction, signMultiSigEnvelope } from "./multisig";
import { settlementQueue } from "./settlement";
import type { SettlementStatus, SettlementWindow } from "./settlement";
import {
  APPROVE_AGENT_TYPES,
  CONVERT_TO_MULTI_SIG_USER_TYPES,
  C_DEPOSIT_TYPES,
  C_WITHDRAW_TYPES,
  TOKEN_DELEGATE_TYPES,
  USER_SET_ABSTRACTION_TYPES,
} from "./signing-types";
import type { Eip712Types } from "./signing-types";
import {
  readDeployerSnapshot,
  type DeployerSnapshot,
  type ReadDeployerSnapshotOptions,
} from "./status";
import type {
  DeployerActionResult,
  HLAbstractionSetting,
  HLAccountAction,
  HLDeployerAction,
  HLMultiSigAction,
  HLNetwork,
} from "./types";

/**
 * Read the exchange's answer. A `spotDeploy` can come back `ok` at the top
 * level and still carry a per-item error underneath, so both are checked.
 */
function interpret(res: { status?: string; response?: unknown }): {
  success: boolean;
  error?: string;
} {
  if (res.status !== "ok") {
    const message =
      typeof res.response === "string"
        ? res.response
        : JSON.stringify(res.response ?? res);
    return { success: false, error: explain(message) };
  }
  const data = (res.response as { data?: { statuses?: Array<{ error?: string }> } })
    ?.data;
  const failed = data?.statuses?.find((s) => s.error)?.error;
  return failed ? { success: false, error: failed } : { success: true };
}

/**
 * "User or API Wallet 0x... does not exist" reads like a permissions problem
 * and usually is not one: it names the address recovered from the signature.
 */
function explain(message: string): string {
  if (!/does not exist/i.test(message)) return message;
  const trimmed = message.replace(/\.+\s*$/, "");
  return `${trimmed}. That address is the one the exchange recovered from the signature; if it is not the expected signer, what was signed does not match what the exchange hashed.`;
}

export interface HIP4DeployerAdapterOptions {
  /** Which book to sign for. Defaults to the client's own network. */
  network?: HLNetwork;
  /** Vault or sub-account to act on behalf of. */
  vaultAddress?: string | null;
}

export class HIP4DeployerAdapter {
  readonly network: HLNetwork;
  private signer: HIP4Signer | null = null;
  private readonly vaultAddress: string | null;

  constructor(
    private readonly client: HIP4Client,
    options: HIP4DeployerAdapterOptions = {},
  ) {
    this.network =
      options.network ?? (client.testnet ? "testnet" : "mainnet");
    this.vaultAddress = options.vaultAddress ?? null;
  }

  /**
   * The key that signs. For deploying and settling this is the approved
   * agent; for account actions it is the master, or one authorized user of a
   * multi-sig master acting as leader.
   */
  setSigner(signer: HIP4Signer): void {
    this.signer = signer;
  }

  private requireSigner(): HIP4Signer {
    if (!this.signer) {
      throw new DeployerError(
        "No signer set. Call deployer.setSigner() before submitting an action.",
      );
    }
    return this.signer;
  }

  // -- Reads ----------------------------------------------------------------

  /** The live template registry. */
  async fetchTemplates(): Promise<HLOutcomeTemplate[]> {
    return this.client.fetchOutcomeTemplates();
  }

  /** Full deployer state for one master account. */
  async fetchSnapshot(
    master: string,
    options: ReadDeployerSnapshotOptions = {},
  ): Promise<DeployerSnapshot> {
    return readDeployerSnapshot(this.client, master, {
      network: this.network,
      ...options,
    });
  }

  /**
   * One live outcome's metadata. Settling echoes the name, description and
   * side names back verbatim, so they have to be read rather than guessed.
   * A settled outcome is pruned from `outcomeMeta` and will not be found.
   */
  async fetchOutcome(outcomeId: number): Promise<HLOutcome> {
    const meta = await this.client.fetchOutcomeMeta();
    const found = meta.outcomes.find((o) => Number(o.outcome) === outcomeId);
    if (!found) {
      throw new DeployerError(
        `Outcome ${outcomeId} is not live. A settled outcome is pruned from outcomeMeta.`,
      );
    }
    return found;
  }

  /** One live question and the metadata of its unsettled named outcomes. */
  async fetchQuestion(questionId: number): Promise<{
    question: HLQuestion;
    outcomes: HLOutcome[];
  }> {
    const meta = await this.client.fetchOutcomeMeta();
    const question = meta.questions.find(
      (q) => Number(q.question) === questionId,
    );
    if (!question) {
      throw new DeployerError(`Question ${questionId} is not live`);
    }
    const settled = new Set(question.settledNamedOutcomes.map(Number));
    const wanted = new Set(
      question.namedOutcomes.map(Number).filter((id) => !settled.has(id)),
    );
    return {
      question,
      outcomes: meta.outcomes.filter((o) => wanted.has(Number(o.outcome))),
    };
  }

  /**
   * Every live outcome this venue deployed, decoded, with each one wired to
   * its parent question so a question's outcomes inherit its times.
   */
  async fetchDeployedOutcomes(venue: string): Promise<DeployedOutcome[]> {
    const meta = await this.client.fetchOutcomeMeta();
    return readDeployedOutcomes(
      meta.outcomes.filter((o) => o.venue === venue),
      meta.questions,
    );
  }

  /**
   * What this deployer still owes settlement on, worst first.
   *
   * Being listed in `outcomeMeta` at all is what makes an outcome unsettled,
   * since settling prunes it, so this needs no record of what was settled.
   *
   * `window.settleWithinMs` applies only to templates that publish no
   * `resolutionDeadline` of their own; where one exists it wins.
   */
  async fetchSettlementQueue(
    master: string,
    window: SettlementWindow,
  ): Promise<SettlementStatus[]> {
    /* One read, not a snapshot plus a second pass: `outcomeMeta` already
       carries the venue, the outcomes and the questions, and an address-level
       rate limit makes a redundant fetch worth avoiding. */
    const meta = await this.client.fetchOutcomeMeta();
    const lower = master.toLowerCase();
    const venue =
      (meta.deployers ?? []).find((d) => d.deployer.toLowerCase() === lower)
        ?.venue ?? null;
    if (venue === null) return [];
    return settlementQueue(
      readDeployedOutcomes(
        meta.outcomes.filter((o) => o.venue === venue),
        meta.questions,
      ),
      window,
    );
  }

  // -- L1 actions, signed alone ---------------------------------------------

  /** Claim a venue and activate. One-way door: read `DEPLOYER_LIMITS` first. */
  async activate(venueName: string): Promise<DeployerActionResult> {
    return this.submitL1(buildActivateDeployerAction(venueName));
  }

  /** Deactivate, permanently. The account can never activate again. */
  async deactivate(): Promise<DeployerActionResult> {
    return this.submitL1(buildDeactivateDeployerAction());
  }

  /** Register a standalone two-sided outcome from a registry template. */
  async registerStandaloneOutcome(
    params: RegisterStandaloneOutcomeParams,
  ): Promise<DeployerActionResult> {
    return this.submitL1(buildRegisterStandaloneOutcomeAction(params));
  }

  /** Register a question and its named outcomes in one action. */
  async registerQuestion(
    params: RegisterQuestionParams,
  ): Promise<DeployerActionResult> {
    return this.submitL1(buildRegisterQuestionAction(params));
  }

  /**
   * Settle a standalone outcome. `settleFraction` is the share paid to the
   * first side: `"1"` pays side 0, `"0"` pays side 1.
   */
  async settleOutcome(params: {
    outcomeId: number;
    settleFraction: string;
    details?: string;
  }): Promise<DeployerActionResult> {
    const outcome = await this.fetchOutcome(params.outcomeId);
    return this.submitL1(
      buildSettleOutcomeAction(outcome, params.settleFraction, params.details ?? ""),
    );
  }

  /** Settle every unsettled named outcome of a question: winner 1, rest 0. */
  async settleQuestion(params: {
    questionId: number;
    winner: number;
    details?: string;
  }): Promise<DeployerActionResult> {
    const { question, outcomes } = await this.fetchQuestion(params.questionId);
    return this.submitL1(
      buildSettleQuestionAction({
        question,
        outcomes,
        winner: params.winner,
        details: params.details,
      }),
    );
  }

  // -- User-signed account actions ------------------------------------------

  /** Approve an API wallet as an agent of the signing account. */
  async approveAgent(params: {
    agentAddress: string;
    agentName?: string;
  }): Promise<DeployerActionResult> {
    const nonce = nextNonce();
    return this.submitUserSigned(
      buildApproveAgentAction({ ...params, nonce, network: this.network }),
      APPROVE_AGENT_TYPES,
      nonce,
    );
  }

  /** Convert the signing account to native multi-sig, or re-assert its signers. */
  async convertToMultiSigUser(params: {
    authorizedUsers: string[];
    threshold: number;
  }): Promise<DeployerActionResult> {
    const nonce = nextNonce();
    return this.submitUserSigned(
      buildConvertToMultiSigUserAction({
        ...params,
        nonce,
        network: this.network,
      }),
      CONVERT_TO_MULTI_SIG_USER_TYPES,
      nonce,
    );
  }

  /**
   * Set the account abstraction mode. Deployers need `"disabled"`, which the
   * spec calls Standard and the app calls Manual.
   *
   * This is `userSetAbstraction`, a user-signed action that also works through
   * a multi-sig quorum. It is not `wallet.agentSetAbstraction`, which is a
   * separate L1 action an approved agent signs for its master.
   */
  async setAbstraction(params: {
    user: string;
    abstraction: HLAbstractionSetting;
  }): Promise<DeployerActionResult> {
    const nonce = nextNonce();
    return this.submitUserSigned(
      buildUserSetAbstractionAction({ ...params, nonce, network: this.network }),
      USER_SET_ABSTRACTION_TYPES,
      nonce,
    );
  }

  /** Move HYPE from spot into the staking balance. */
  async stakeDeposit(amount: string): Promise<DeployerActionResult> {
    const nonce = nextNonce();
    return this.submitUserSigned(
      buildCDepositAction({ amount, nonce, network: this.network }),
      C_DEPOSIT_TYPES,
      nonce,
    );
  }

  /** Move HYPE from the staking balance back to spot. */
  async stakeWithdraw(amount: string): Promise<DeployerActionResult> {
    const nonce = nextNonce();
    return this.submitUserSigned(
      buildCWithdrawAction({ amount, nonce, network: this.network }),
      C_WITHDRAW_TYPES,
      nonce,
    );
  }

  /** Delegate or undelegate staked HYPE against a validator. */
  async delegate(params: {
    validator: string;
    amount: string;
    isUndelegate?: boolean;
  }): Promise<DeployerActionResult> {
    const nonce = nextNonce();
    return this.submitUserSigned(
      buildTokenDelegateAction({
        validator: params.validator,
        amount: params.amount,
        isUndelegate: params.isUndelegate ?? false,
        nonce,
        network: this.network,
      }),
      TOKEN_DELEGATE_TYPES,
      nonce,
    );
  }

  // -- Multi-sig ------------------------------------------------------------

  /**
   * Submit an action on behalf of a multi-sig account.
   *
   * The signer set here is the leader, who must be an authorized user and
   * cannot be the multi-sig account itself. `signatures` are the inner
   * signatures collected from at least `threshold` authorized users, every
   * one of them over this same nonce and this same leader.
   */
  async submitMultiSig(params: {
    multiSigUser: string;
    action: Record<string, unknown>;
    signatures: HLSignature[];
    nonce: number;
    /** The leader's address. Defaults to the signer's own. */
    outerSigner?: string;
  }): Promise<DeployerActionResult> {
    const signer = this.requireSigner();
    const outerSigner = params.outerSigner ?? (await signer.getAddress());
    const wrapper = buildMultiSigAction({
      multiSigUser: params.multiSigUser,
      outerSigner,
      action: params.action,
      signatures: params.signatures,
      network: this.network,
    });
    return this.postSigned(
      wrapper as unknown as Record<string, unknown>,
      params.nonce,
      await signMultiSigEnvelope({
        signer,
        action: wrapper,
        nonce: params.nonce,
        network: this.network,
        vaultAddress: this.vaultAddress,
      }),
    );
  }

  /** The assembled wrapper without submitting it, for inspection or logging. */
  buildMultiSig(params: {
    multiSigUser: string;
    outerSigner: string;
    action: Record<string, unknown>;
    signatures: HLSignature[];
  }): HLMultiSigAction {
    return buildMultiSigAction({ ...params, network: this.network });
  }

  // -- Internals ------------------------------------------------------------

  private async submitL1(
    typed: HLDeployerAction,
    nonce: number = nextNonce(),
  ): Promise<DeployerActionResult> {
    const signer = this.requireSigner();
    /* Interfaces carry no index signature, so the wire form is taken once. */
    const action = typed as unknown as Record<string, unknown>;
    const actionHash = bytesToHex(
      createL1ActionHash({ action, nonce, vaultAddress: this.vaultAddress }),
    );
    try {
      const signature = await signL1Action({
        signer,
        action,
        nonce,
        isTestnet: this.network !== "mainnet",
        vaultAddress: this.vaultAddress,
      });
      const res = await this.client.submitAction(
        action,
        nonce,
        signature,
        this.vaultAddress,
      );
      return { ...interpret(res), nonce, actionHash, response: res };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        nonce,
        actionHash,
      };
    }
  }

  private async submitUserSigned(
    typed: HLAccountAction,
    types: Eip712Types,
    nonce: number,
  ): Promise<DeployerActionResult> {
    const signer = this.requireSigner();
    const action = typed as unknown as Record<string, unknown> & {
      signatureChainId: string;
    };
    try {
      const signature = await signUserSignedAction({ signer, action, types });
      return this.postSigned(action, nonce, signature);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        nonce,
      };
    }
  }

  private async postSigned(
    action: Record<string, unknown>,
    nonce: number,
    signature: HLSignature,
  ): Promise<DeployerActionResult> {
    try {
      const res = await this.client.submitUserSignedAction(
        action,
        nonce,
        signature,
      );
      return { ...interpret(res), nonce, response: res };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        nonce,
      };
    }
  }
}
