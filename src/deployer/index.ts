// ---------------------------------------------------------------------------
// HIP-4 deployer surface
//
// @experimental Everything exported here is experimental and may change
// without a major version. It covers registering and settling outcomes,
// deployer activation, agent approval, and Hyperliquid native multi-sig.
//
// See docs/DEPLOYER.md for the architecture and the operational caveats.
// ---------------------------------------------------------------------------

/* Named re-exports - no wildcard barrels (project convention) */

export {
  buildActivateDeployerAction,
  buildApproveAgentAction,
  buildCDepositAction,
  buildConvertToMultiSigUserAction,
  buildCWithdrawAction,
  buildDeactivateDeployerAction,
  buildOutcomeSettlement,
  buildRegisterAndAssociateNamedOutcomeAction,
  buildRegisterQuestionAction,
  buildRegisterStandaloneOutcomeAction,
  buildSetSubDeployersAction,
  buildSettleOutcomeAction,
  buildSettleQuestionAction,
  buildTokenDelegateAction,
  buildUserSetAbstractionAction,
  hypeToWei,
  HYPE_WEI_DECIMALS,
  lowerAddress,
  MAX_QUESTION_OUTCOMES,
  nextNonce,
  normalizeFeeScale,
  normalizeSettleFraction,
  normalizeVenueName,
  signatureChainId,
  sortedKeywordPairs,
  userSignedEnvelope,
  venueNameError,
  VENUE_NAME_RE,
} from "./actions";
export type {
  ApproveAgentParams,
  ConvertToMultiSigUserParams,
  RegisterAndAssociateNamedOutcomeParams,
  RegisterQuestionParams,
  RegisterStandaloneOutcomeParams,
  SetSubDeployersParams,
  SettleableOutcome,
  SettleQuestionParams,
} from "./actions";

export {
  activeAgents,
  agentStatus,
  AGENT_APPROVAL_MAX_DAYS,
  expiringAgents,
  findAgent,
  NAMED_AGENT_SLOTS,
} from "./agent";
export type { AgentStatus } from "./agent";

export { HIP4DeployerAdapter } from "./deployer";
export type { HIP4DeployerAdapterOptions } from "./deployer";

export { DeployerError } from "./error";

export {
  canonicalKeywords,
  eventAtFrom,
  EVENT_KEYWORDS,
  KEYWORD_ALIASES,
  perpFrom,
  PERP_KEYWORDS,
  questionByOutcome,
  readDeployedOutcome,
  readDeployedOutcomes,
  resolutionDeadlineFrom,
  RESOLUTION_DEADLINE_KEYWORDS,
  scalarBandFrom,
  thresholdFrom,
  THRESHOLD_KEYWORDS,
} from "./keywords";
export type { DeployedOutcome } from "./keywords";

export {
  settlementQueue,
  settlementStatus,
  suggestPriceSettlement,
} from "./settlement";
export type {
  SettlementState,
  SettlementStatus,
  SettlementSuggestion,
  SettlementWindow,
} from "./settlement";

export {
  BASE_TAKER_RATE,
  feeAmounts,
  feeSplit,
  FEE_SCALE_MAX,
  FEE_SCALE_MIN,
} from "./fees";
export type { FeeSplit } from "./fees";

export {
  ABSTRACTION_WIRE_VALUES,
  buildMultiSigAction,
  minimalSignatureHex,
  multiSigActionHash,
  multiSigPayloadAction,
  signMultiSigEnvelope,
  signMultiSigInnerL1Action,
  signMultiSigInnerUserSignedAction,
  withMultiSigTypes,
} from "./multisig";
export type {
  BuildMultiSigActionParams,
  MultiSigInnerParams,
} from "./multisig";

export {
  APPROVE_AGENT_TYPES,
  CONVERT_TO_MULTI_SIG_USER_TYPES,
  C_DEPOSIT_TYPES,
  C_WITHDRAW_TYPES,
  SEND_MULTI_SIG_TYPES,
  TOKEN_DELEGATE_TYPES,
  USER_SET_ABSTRACTION_TYPES,
} from "./signing-types";
export type { Eip712Fields, Eip712Types } from "./signing-types";

export {
  canDeploy,
  deployBlockedReason,
  deployerSteps,
  DEPLOYER_LIMITS,
  isDeployerAbstraction,
  readDeployerSnapshot,
} from "./status";
export type {
  DeployerLimits,
  DeployerSnapshot,
  DeployerStep,
  DeployerStepsOptions,
  ReadDeployerSnapshotOptions,
} from "./status";

export {
  assertTemplateInstance,
  findTemplate,
  instanceDescription,
  KEYWORD_HINTS,
  MAX_KEYWORD_HORIZON_MS,
  namedOutcomeTemplates,
  parseInstanceDescription,
  parseSeriesId,
  parseTemplateStamp,
  placeholdersIn,
  renderTemplateText,
  requireTemplate,
  seriesFacts,
  splitBySeries,
  supersededBy,
  templateIdOfOutcome,
  templateParentId,
  templateRoleKind,
  templateSideNames,
  toTemplateStamp,
  unfillablePlaceholders,
  validateKeywordValue,
  validateTemplateInstance,
} from "./templates";
export type {
  SeriesFacts,
  SeriesId,
  TemplateProblem,
  ValidateKeywordOptions,
} from "./templates";

export type {
  DeployerActionResult,
  HLAbstractionSetting,
  HLAccountAction,
  HLActivateOutcomeDeployerAction,
  HLApproveAgentAction,
  HLCDepositAction,
  HLConvertToMultiSigUserAction,
  HLCWithdrawAction,
  HLDeployerAction,
  HLMultiSigAction,
  HLNetwork,
  HLOutcomeDeployAction,
  HLOutcomeSettlement,
  HLRegisterAndAssociateNamedOutcomeAction,
  HLRegisterQuestionAction,
  HLRegisterStandaloneOutcomeAction,
  HLSetSubDeployersAction,
  HLSettleOutcomeAction,
  HLSettleQuestionAction,
  HLSubDeployerEntry,
  HLSubDeployerVariant,
  HLTemplateInstance,
  HLTokenDelegateAction,
  HLUserSetAbstractionAction,
  HLUserSignedEnvelope,
} from "./types";
