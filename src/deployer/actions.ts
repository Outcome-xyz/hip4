// ---------------------------------------------------------------------------
// HIP-4 deployer action builders
//
// @experimental Pure functions: every builder returns the exact object that
// gets MessagePack-encoded and hashed, with its keys already in the order the
// exchange expects. Nothing here touches the network.
//
// Two rules run through all of it, both learned the expensive way:
//
//   1. Lowercase every address before signing and before sending. An address
//      field parsed as bytes is lowercased across the network, so a
//      checksummed one recovers a different signer. The resulting error names
//      the outer signer, which is not what is wrong.
//   2. Decimal strings carry no sign, no exponent, and no trailing zeros.
// ---------------------------------------------------------------------------

import { DeployerError } from "./error";
import { FEE_SCALE_MAX, FEE_SCALE_MIN } from "./fees";
import type {
  HLAbstractionSetting,
  HLActivateOutcomeDeployerAction,
  HLApproveAgentAction,
  HLCDepositAction,
  HLConvertToMultiSigUserAction,
  HLCWithdrawAction,
  HLNetwork,
  HLOutcomeSettlement,
  HLRegisterQuestionAction,
  HLRegisterStandaloneOutcomeAction,
  HLSettleOutcomeAction,
  HLSettleQuestionAction,
  HLTemplateInstance,
  HLTokenDelegateAction,
  HLUserSetAbstractionAction,
  HLUserSignedEnvelope,
} from "./types";

// -- Primitives -------------------------------------------------------------

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const UDECIMAL_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** HYPE staking amounts are quoted in wei at 8 decimals. */
export const HYPE_WEI_DECIMALS = 8;

let lastNonce = 0;

/**
 * Monotonic millisecond nonce. Two actions raised inside the same millisecond
 * would otherwise collide, and the exchange refuses a repeated nonce.
 *
 * Every signature in one multi-sig action must carry the same nonce, so take
 * it once and pass it to each signer rather than calling this per signature.
 */
export function nextNonce(): number {
  const now = Date.now();
  lastNonce = now > lastNonce ? now : lastNonce + 1;
  return lastNonce;
}

/** Lowercase an address, refusing anything that is not one. */
export function lowerAddress(address: string, what = "address"): string {
  if (!ADDRESS_RE.test(address)) {
    throw new DeployerError(`${what} is not a 20-byte hex address: ${address}`);
  }
  return address.toLowerCase();
}

/** The chain id an action declares for its EIP-712 domain. */
export function signatureChainId(network: HLNetwork): string {
  return network === "mainnet" ? "0xa4b1" : "0x66eee";
}

/** The two fields every user-signed action carries. */
export function userSignedEnvelope(network: HLNetwork): HLUserSignedEnvelope {
  return {
    signatureChainId: signatureChainId(network),
    hyperliquidChain: network === "mainnet" ? "Mainnet" : "Testnet",
  };
}

/**
 * A plain decimal in `[lo, hi]`, with trailing zeros removed.
 * Rejects signs, exponents and anything non-numeric outright.
 */
function boundedDecimal(
  value: string,
  lo: number,
  hi: number,
  what: string,
): string {
  if (typeof value !== "string" || !UDECIMAL_RE.test(value)) {
    throw new DeployerError(
      `${what} must be a plain unsigned decimal, got ${JSON.stringify(value)}`,
    );
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < lo || n > hi) {
    throw new DeployerError(`${what} must be between ${lo} and ${hi}`);
  }
  const trimmed = value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
  return trimmed === "" ? "0" : trimmed;
}

/** A deployer fee scale, 0 to 10. */
export function normalizeFeeScale(value: string): string {
  return boundedDecimal(value, FEE_SCALE_MIN, FEE_SCALE_MAX, "Fee scale");
}

/** A settlement fraction, 0 to 1. */
export function normalizeSettleFraction(value: string): string {
  return boundedDecimal(value, 0, 1, "Settle fraction");
}

/**
 * Keyword values as the exchange wants them: `[keyword, value]` pairs sorted
 * lexicographically by keyword. The signature is over the MessagePack bytes,
 * so the order is part of the hash.
 */
export function sortedKeywordPairs(
  values: Record<string, string>,
): Array<[string, string]> {
  return Object.keys(values)
    .sort()
    .map((key) => [key, values[key] as string] as [string, string]);
}

/**
 * A HYPE amount as staking wei, at 8 decimals. Anything finer is truncated
 * rather than rounded, so a converted amount never exceeds what was asked for.
 */
export function hypeToWei(amount: string): number {
  const normalized = boundedDecimal(amount, 0, Number.MAX_SAFE_INTEGER, "HYPE amount");
  const [whole, fraction = ""] = normalized.split(".");
  const padded = (fraction + "0".repeat(HYPE_WEI_DECIMALS)).slice(
    0,
    HYPE_WEI_DECIMALS,
  );
  const wei = Number(`${whole}${padded}`);
  if (!Number.isSafeInteger(wei)) {
    throw new DeployerError(`HYPE amount does not fit a safe integer: ${amount}`);
  }
  return wei;
}

// -- Venue names ------------------------------------------------------------

/**
 * A venue name: 2 to 4 lowercase letters. Globally unique across every
 * deployer including deactivated ones, and never released once claimed.
 */
export const VENUE_NAME_RE = /^[a-z]{2,4}$/;

export function normalizeVenueName(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The problem with a venue name, or null when there is none. */
export function venueNameError(raw: string): string | null {
  const name = normalizeVenueName(raw);
  if (name === "") return "A venue name is required.";
  if (!VENUE_NAME_RE.test(name)) return "2 to 4 lowercase letters (a to z).";
  return null;
}

// -- Deployer activation ----------------------------------------------------

/**
 * Claim a venue and become an active outcome deployer.
 *
 * One-way door. Activation commits the stake for the minimum staking period,
 * deactivation additionally requires no active outcomes and is permanent, and
 * the venue name is reserved forever either way.
 */
export function buildActivateDeployerAction(
  venueName: string,
): HLActivateOutcomeDeployerAction {
  const problem = venueNameError(venueName);
  if (problem !== null) throw new DeployerError(problem);
  return {
    type: "activateOutcomeDeployer",
    activate: { venueName: normalizeVenueName(venueName) },
  };
}

/** Deactivate, permanently. The account can never activate again. */
export function buildDeactivateDeployerAction(): HLActivateOutcomeDeployerAction {
  return { type: "activateOutcomeDeployer", isDeactivate: true };
}

// -- Registration -----------------------------------------------------------

function templateInstance(
  id: string,
  values: Record<string, string>,
  feeScale?: string,
): HLTemplateInstance {
  if (!id) throw new DeployerError("Template id is required");
  const instance: HLTemplateInstance = {
    id,
    keywordToValue: sortedKeywordPairs(values),
  };
  if (feeScale !== undefined) {
    instance.deployerFeeScale = normalizeFeeScale(feeScale);
  }
  return instance;
}

export interface RegisterStandaloneOutcomeParams {
  /** Registry template id, e.g. `"binaryPrice4"`. */
  templateId: string;
  /** One value per keyword the template declares. */
  values: Record<string, string>;
  /** 0 to 10. Defaults to `"0"`. */
  deployerFeeScale?: string;
}

/** Register a standalone two-sided outcome from a registry template. */
export function buildRegisterStandaloneOutcomeAction(
  params: RegisterStandaloneOutcomeParams,
): HLRegisterStandaloneOutcomeAction {
  return {
    type: "spotDeploy",
    outcome: {
      registerStandaloneOutcomeFromTemplate: templateInstance(
        params.templateId,
        params.values,
        params.deployerFeeScale ?? "0",
      ),
    },
  };
}

export interface RegisterQuestionParams {
  /** The container template and its values. */
  question: { templateId: string; values: Record<string, string> };
  /**
   * The named outcomes, in the order they should be created. Order is not
   * sorted, unlike keyword values, because it is the display order.
   */
  namedOutcomes: Array<{ templateId: string; values: Record<string, string> }>;
  /** 0 to 10, carried on the question instance only. Defaults to `"0"`. */
  deployerFeeScale?: string;
}

/**
 * Register a question and its named outcomes in one action. The protocol
 * creates a fallback outcome alongside them.
 */
export function buildRegisterQuestionAction(
  params: RegisterQuestionParams,
): HLRegisterQuestionAction {
  if (params.namedOutcomes.length === 0) {
    throw new DeployerError("A question needs at least one named outcome");
  }
  return {
    type: "spotDeploy",
    outcome: {
      registerQuestionFromTemplate: {
        questionTemplateInstance: templateInstance(
          params.question.templateId,
          params.question.values,
          params.deployerFeeScale ?? "0",
        ),
        namedOutcomeTemplateInstances: params.namedOutcomes.map((o) =>
          templateInstance(o.templateId, o.values),
        ),
      },
    },
  };
}

// -- Settlement -------------------------------------------------------------

/** The outcome fields a settlement has to echo back verbatim. */
export interface SettleableOutcome {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: Array<{ name: string }>;
}

/**
 * One outcome's settlement. `settleFraction` is the share paid to the first
 * side: `"1"` pays side 0 in full, `"0"` pays side 1, and a value between
 * splits the pool.
 */
export function buildOutcomeSettlement(
  outcome: SettleableOutcome,
  settleFraction: string,
  details = "",
): HLOutcomeSettlement {
  const sides = outcome.sideSpecs.map((s) => String(s.name));
  if (sides.length !== 2) {
    throw new DeployerError(
      `Outcome ${outcome.outcome} has ${sides.length} sides, settlement needs exactly two`,
    );
  }
  return {
    outcome: Number(outcome.outcome),
    settleFraction: normalizeSettleFraction(settleFraction),
    details,
    nameAndDescription: [String(outcome.name), String(outcome.description)],
    sideNames: [sides[0] as string, sides[1] as string],
  };
}

/** Settle a standalone outcome. */
export function buildSettleOutcomeAction(
  outcome: SettleableOutcome,
  settleFraction: string,
  details = "",
): HLSettleOutcomeAction {
  return {
    type: "spotDeploy",
    outcome: {
      settleOutcome: buildOutcomeSettlement(outcome, settleFraction, details),
    },
  };
}

export interface SettleQuestionParams {
  question: {
    question: number;
    name: string;
    description: string;
    namedOutcomes: number[];
    settledNamedOutcomes: number[];
  };
  /** Live metadata for every named outcome still unsettled. */
  outcomes: SettleableOutcome[];
  /** The named outcome that resolves Yes. Every other one resolves No. */
  winner: number;
  details?: string;
}

/**
 * Settle every unsettled named outcome of a question in one action: the
 * winner at fraction 1, the rest at 0. Already-settled outcomes are skipped,
 * so this is safe to re-raise after a partial settlement.
 */
export function buildSettleQuestionAction(
  params: SettleQuestionParams,
): HLSettleQuestionAction {
  const { question, outcomes, winner } = params;
  const settled = new Set(question.settledNamedOutcomes.map(Number));
  const remaining = question.namedOutcomes
    .map(Number)
    .filter((id) => !settled.has(id));

  if (!remaining.includes(Number(winner))) {
    throw new DeployerError(
      `Winner ${winner} is not one of the unsettled named outcomes: ${remaining.join(", ")}`,
    );
  }
  const byId = new Map(outcomes.map((o) => [Number(o.outcome), o]));
  const missing = remaining.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new DeployerError(
      `No live metadata for named outcomes: ${missing.join(", ")}`,
    );
  }

  return {
    type: "spotDeploy",
    outcome: {
      settleQuestion2: {
        question: Number(question.question),
        outcomeSettlements: remaining.map((id) =>
          buildOutcomeSettlement(
            byId.get(id) as SettleableOutcome,
            id === Number(winner) ? "1" : "0",
            params.details ?? "",
          ),
        ),
        nameAndDescription: [
          String(question.name),
          String(question.description),
        ],
      },
    },
  };
}

// -- Account actions --------------------------------------------------------

export interface ApproveAgentParams {
  agentAddress: string;
  /** Empty string is the unnamed agent slot. */
  agentName?: string;
  nonce: number;
  network: HLNetwork;
}

/**
 * Approve an API wallet as an agent of the signing account.
 *
 * Signed on `HyperliquidSignTransaction` at a real chain id, so a browser
 * wallet or a custodian can produce it. Deploy and settle sign on chain 1337,
 * which no wallet will touch, which is why they get delegated to the agent.
 */
export function buildApproveAgentAction(
  params: ApproveAgentParams,
): HLApproveAgentAction {
  return {
    type: "approveAgent",
    ...userSignedEnvelope(params.network),
    agentAddress: lowerAddress(params.agentAddress, "agentAddress"),
    agentName: params.agentName ?? "",
    nonce: params.nonce,
  };
}

export interface ConvertToMultiSigUserParams {
  authorizedUsers: string[];
  threshold: number;
  nonce: number;
  network: HLNetwork;
}

/**
 * Convert an account to native multi-sig, or re-assert a different signer set
 * on one that already is.
 *
 * The account must already exist on the exchange: an address the exchange has
 * never seen is not an L1 user and has nothing to convert. At most 10
 * authorised users. After conversion every action from the account must go
 * through the wrapper, HyperEVM excepted.
 */
export function buildConvertToMultiSigUserAction(
  params: ConvertToMultiSigUserParams,
): HLConvertToMultiSigUserAction {
  const users = params.authorizedUsers.map((u) =>
    lowerAddress(u, "authorizedUser"),
  );
  if (users.length === 0) {
    throw new DeployerError("At least one authorized user is required");
  }
  if (users.length > 10) {
    throw new DeployerError("At most 10 authorized users are allowed");
  }
  if (new Set(users).size !== users.length) {
    throw new DeployerError("Authorized users must be distinct");
  }
  if (
    !Number.isInteger(params.threshold) ||
    params.threshold < 1 ||
    params.threshold > users.length
  ) {
    throw new DeployerError(
      `Threshold must be between 1 and ${users.length}, got ${params.threshold}`,
    );
  }
  return {
    type: "convertToMultiSigUser",
    ...userSignedEnvelope(params.network),
    signers: JSON.stringify({
      authorizedUsers: [...users].sort(),
      threshold: params.threshold,
    }),
    nonce: params.nonce,
  };
}

/**
 * Set the account abstraction mode.
 *
 * HIP-4 deployers must be on `disabled`, which the spec calls Standard, the
 * Hyperliquid app calls Manual, and `userAbstraction` reports as `disabled`.
 * Setting this before activating avoids needing to correct it afterwards.
 */
export function buildUserSetAbstractionAction(params: {
  user: string;
  abstraction: HLAbstractionSetting;
  nonce: number;
  network: HLNetwork;
}): HLUserSetAbstractionAction {
  return {
    type: "userSetAbstraction",
    ...userSignedEnvelope(params.network),
    user: lowerAddress(params.user, "user"),
    abstraction: params.abstraction,
    nonce: params.nonce,
  };
}

/** Delegate or undelegate staked HYPE against a validator. */
export function buildTokenDelegateAction(params: {
  validator: string;
  /** HYPE as a decimal string; converted to wei at 8 decimals. */
  amount: string;
  isUndelegate: boolean;
  nonce: number;
  network: HLNetwork;
}): HLTokenDelegateAction {
  return {
    type: "tokenDelegate",
    ...userSignedEnvelope(params.network),
    validator: lowerAddress(params.validator, "validator"),
    wei: hypeToWei(params.amount),
    isUndelegate: params.isUndelegate,
    nonce: params.nonce,
  };
}

/** Move HYPE from spot into the staking balance. */
export function buildCDepositAction(params: {
  amount: string;
  nonce: number;
  network: HLNetwork;
}): HLCDepositAction {
  return {
    type: "cDeposit",
    ...userSignedEnvelope(params.network),
    wei: hypeToWei(params.amount),
    nonce: params.nonce,
  };
}

/** Move HYPE from the staking balance back to spot. */
export function buildCWithdrawAction(params: {
  amount: string;
  nonce: number;
  network: HLNetwork;
}): HLCWithdrawAction {
  return {
    type: "cWithdraw",
    ...userSignedEnvelope(params.network),
    wei: hypeToWei(params.amount),
    nonce: params.nonce,
  };
}
