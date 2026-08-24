// ---------------------------------------------------------------------------
// Deployer state, read from the chain
//
// @experimental Nothing here is stored. Every fact is read back from
// Hyperliquid on demand, which is what makes an onboarding flow resumable from
// anywhere and unable to disagree with reality.
// ---------------------------------------------------------------------------

import type { HIP4Client } from "../adapter/hyperliquid/client";
import type {
  HLExtraAgent,
  HLUserAbstraction,
} from "../adapter/hyperliquid/types";
import { agentStatus } from "./agent";
import type { HLNetwork } from "./types";

/** What one chain lets a single deployer hold. @experimental */
export interface DeployerLimits {
  /** HYPE that must be delegated for the deployer to stay active. */
  stakeHype: number;
  /** Concurrent unsettled outcomes. */
  activeOutcomes: number;
  /** Registrations per day. */
  perDay: number;
  /** Days the stake is committed once activated. */
  minStakeDays: number;
}

/**
 * Published limits per chain. Mainnet opens conservatively. Read these as a
 * starting point and confirm against the exchange before relying on a number,
 * since they move as HIP-4 rolls out.
 */
export const DEPLOYER_LIMITS: Record<HLNetwork, DeployerLimits> = {
  /* The testnet figures are consistent with a live deployer: venue "zzz" runs
     on 120 HYPE delegated. The mainnet stake is the reported figure and has
     not been measured; confirm it before funding anything. */
  testnet: {
    stakeHype: 100,
    activeOutcomes: 10,
    perDay: 50,
    minStakeDays: 183,
  },
  mainnet: {
    stakeHype: 500_000,
    activeOutcomes: 100,
    perDay: 500,
    minStakeDays: 183,
  },
};

/**
 * The account abstraction modes a deployer may use.
 *
 * One setting, three names: the HIP-4 spec calls it Standard, the Hyperliquid
 * app calls it Manual under Portfolio, and the info API reports it as
 * `disabled`. A live deployer reads `disabled`, which is the ground truth.
 */
export function isDeployerAbstraction(
  mode: HLUserAbstraction | string | null | undefined,
): boolean {
  return mode === "disabled" || mode === "default" || !mode;
}

/** Everything the chain can say about one candidate deployer. @experimental */
export interface DeployerSnapshot {
  master: string;
  /** Whether the exchange has seen this address. Nothing works until it has. */
  masterExists: boolean;
  role: string | null;
  /** Authorized users, once converted to multi-sig. Empty before that. */
  authorizedUsers: string[];
  threshold: number;
  isMultiSig: boolean;
  abstraction: HLUserAbstraction | null;
  /** Whether that mode is one a deployer may use. */
  abstractionOk: boolean;
  /** HYPE delegated, which is what the stake requirement is measured against. */
  stakedHype: number;
  venue: string | null;
  active: boolean;
  agents: HLExtraAgent[];
  /**
   * Unsettled outcomes listed under this venue. Counts a question's
   * protocol-created fallback alongside its named outcomes, since both are
   * listed; whether the exchange's own cap counts fallbacks is not confirmed,
   * so this may read high for a venue built from questions.
   */
  activeOutcomes: number;
  limits: DeployerLimits;
  /** Every read failed together, so none of the above is a fact. */
  unreachable: boolean;
}

export interface ReadDeployerSnapshotOptions {
  /** Which chain's limits to report. Defaults to the client's own. */
  network?: HLNetwork;
}

/**
 * Read a deployer's full state in one pass.
 *
 * A single failed read is tolerated and reported as absent; only a total
 * failure is reported as unreachable, because "the chain is down" and "this
 * account has none of this yet" call for different words on a console.
 */
export async function readDeployerSnapshot(
  client: HIP4Client,
  master: string,
  options: ReadDeployerSnapshotOptions = {},
): Promise<DeployerSnapshot> {
  const network: HLNetwork =
    options.network ?? (client.testnet ? "testnet" : "mainnet");
  const limits = DEPLOYER_LIMITS[network];
  const empty: DeployerSnapshot = {
    master,
    masterExists: false,
    role: null,
    authorizedUsers: [],
    threshold: 0,
    isMultiSig: false,
    abstraction: null,
    abstractionOk: false,
    stakedHype: 0,
    venue: null,
    active: false,
    agents: [],
    activeOutcomes: 0,
    limits,
    unreachable: false,
  };
  if (!master) return empty;

  const settle = <T>(p: Promise<T>) =>
    p.then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const, value: null }),
    );

  const [role, signers, abstraction, delegator, meta, agents] =
    await Promise.all([
      settle(client.fetchUserRole(master)),
      settle(client.fetchMultiSigSigners(master)),
      settle(client.fetchUserAbstraction(master)),
      settle(client.fetchDelegatorSummary(master)),
      settle(client.fetchOutcomeMeta()),
      settle(client.fetchExtraAgents(master)),
    ]);

  if (!role.ok && !meta.ok) return { ...empty, unreachable: true };

  const lower = master.toLowerCase();
  const entry = (meta.value?.deployers ?? []).find(
    (d) => d.deployer.toLowerCase() === lower,
  );
  const venue = entry?.venue ?? null;
  const mode = abstraction.value ?? null;

  return {
    master,
    masterExists:
      role.value?.role !== undefined && role.value.role !== "missing",
    role: role.value?.role ?? null,
    authorizedUsers: signers.value?.authorizedUsers ?? [],
    threshold: signers.value?.threshold ?? 0,
    isMultiSig: (signers.value?.authorizedUsers?.length ?? 0) > 0,
    abstraction: mode,
    abstractionOk: isDeployerAbstraction(mode),
    stakedHype: Number(delegator.value?.delegated ?? 0),
    venue,
    active: entry !== undefined,
    agents: agents.value ?? [],
    activeOutcomes:
      venue === null
        ? 0
        : (meta.value?.outcomes ?? []).filter((o) => o.venue === venue).length,
    limits,
    unreachable: false,
  };
}

/** Whether this deployer can register another outcome right now. */
export function canDeploy(s: DeployerSnapshot): boolean {
  return (
    !s.unreachable &&
    s.active &&
    s.stakedHype >= s.limits.stakeHype &&
    s.activeOutcomes < s.limits.activeOutcomes
  );
}

/** Why not, in the words an operator can act on. Null when nothing blocks it. */
export function deployBlockedReason(s: DeployerSnapshot): string | null {
  if (s.unreachable) {
    return "The chain could not be read, so whether this wallet may deploy is unknown.";
  }
  if (!s.active) {
    return "This wallet is not an active outcome deployer. Activate it first.";
  }
  if (s.stakedHype < s.limits.stakeHype) {
    return `This wallet has ${s.stakedHype} HYPE delegated and needs ${s.limits.stakeHype}.`;
  }
  if (s.activeOutcomes >= s.limits.activeOutcomes) {
    return `All ${s.limits.activeOutcomes} outcome slots are in use. Settle one before deploying another.`;
  }
  return null;
}

/** One step of becoming a deployer. @experimental */
export interface DeployerStep {
  key: string;
  title: string;
  /** What the chain currently says, in a few words. */
  detail: string;
  state: "done" | "ready" | "blocked";
  /** Why it cannot be done yet. Null when it can. */
  blockedBy: string | null;
  /** Irreversible, so a caller should make the operator confirm deliberately. */
  oneWay?: boolean;
}

export interface DeployerStepsOptions {
  /** How many authorized users the intended multi-sig will have. */
  signerCount?: number;
  /** The agent address this host holds a key for, if any. */
  agentAddress?: string;
  now?: number;
}

/**
 * The sequence, resolved against live chain state.
 *
 * The order is not arbitrary. Account type has to be right before activation,
 * because activation is a one-way door. Conversion comes before the stake, so
 * the account holds nothing worth protecting while it changes shape. The agent
 * comes after activation, because it is what lets the deployer run without the
 * quorum present.
 */
export function deployerSteps(
  s: DeployerSnapshot,
  options: DeployerStepsOptions = {},
): DeployerStep[] {
  const signerCount = options.signerCount ?? 3;
  const staked = s.stakedHype >= s.limits.stakeHype;
  const agent = options.agentAddress
    ? agentStatus(s.agents, options.agentAddress, options.now)
    : null;
  const liveAgents = s.agents.filter(
    (a) => a.validUntil > (options.now ?? Date.now()),
  );
  const NEEDS_MASTER = "Fund the master wallet first.";

  const steps: DeployerStep[] = [
    {
      key: "master",
      title: "Master wallet",
      detail: !s.master
        ? "None chosen"
        : s.masterExists
          ? s.master
          : `${s.master}, not funded`,
      state: s.masterExists ? "done" : "ready",
      blockedBy: null,
    },
    {
      key: "accountType",
      title: "Account type",
      detail: s.abstractionOk
        ? `${s.abstraction ?? "standard"}, which a deployer requires`
        : `${s.abstraction ?? "unknown"}, needs Manual`,
      state: s.abstractionOk ? "done" : s.masterExists ? "ready" : "blocked",
      blockedBy: s.masterExists ? null : NEEDS_MASTER,
    },
    {
      key: "multisig",
      title: "Multi-sig",
      detail: s.isMultiSig
        ? `${s.threshold} of ${s.authorizedUsers.length}`
        : "Not converted",
      state: s.isMultiSig ? "done" : s.masterExists ? "ready" : "blocked",
      blockedBy: s.masterExists
        ? null
        : `${NEEDS_MASTER} All ${signerCount} authorized wallets must exist on the exchange too.`,
    },
    {
      key: "stake",
      title: "Stake",
      detail: staked
        ? `${s.stakedHype} HYPE`
        : `${s.stakedHype} of ${s.limits.stakeHype} HYPE`,
      state: staked ? "done" : s.masterExists ? "ready" : "blocked",
      blockedBy: s.masterExists ? null : NEEDS_MASTER,
    },
    {
      key: "activate",
      title: "Activate",
      detail: s.active
        ? `Active deployer, venue ${s.venue}`
        : "Not a deployer yet",
      state: s.active ? "done" : staked && s.abstractionOk ? "ready" : "blocked",
      blockedBy: !staked
        ? `Delegate ${s.limits.stakeHype} HYPE first.`
        : !s.abstractionOk
          ? "Account type must be Manual before activating, and activation cannot be undone."
          : null,
      oneWay: true,
    },
    {
      key: "agent",
      title: "Agent wallet",
      detail: agent?.approved
        ? "Approved, this deployer can run unattended"
        : liveAgents.length > 0
          ? `${liveAgents.length} approved, none held here`
          : "None approved",
      state: agent?.approved ? "done" : s.active ? "ready" : "blocked",
      blockedBy: s.active
        ? null
        : "Activate the deployer first. Without an agent every market needs the quorum present.",
    },
    {
      key: "market",
      title: "First market",
      detail:
        s.activeOutcomes > 0
          ? `${s.activeOutcomes} of ${s.limits.activeOutcomes} outcomes live`
          : "None deployed",
      state:
        s.activeOutcomes > 0 ? "done" : canDeploy(s) ? "ready" : "blocked",
      blockedBy: deployBlockedReason(s),
    },
  ];

  if (s.unreachable) {
    return steps.map((step) => ({
      ...step,
      state: "blocked" as const,
      blockedBy: "The chain could not be read, so nothing here is known.",
    }));
  }
  return steps;
}
