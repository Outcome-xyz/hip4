// ---------------------------------------------------------------------------
// Agent (API wallet) lifecycle
//
// @experimental An agent holds nothing and can do nothing with funds: it
// cannot withdraw, transfer or unstake. What it can do is deploy and settle
// on behalf of its master, alone, with one signature and no quorum. That is
// what keeps a staked master out of the hot path.
//
// This module reads approvals; it does not create keys. The SDK carries no
// secp256k1 implementation, so generate the agent key with whatever the host
// already uses (viem's `generatePrivateKey` / `privateKeyToAccount`) and pass
// the address in.
// ---------------------------------------------------------------------------

import type { HLExtraAgent } from "../adapter/hyperliquid/types";

/**
 * The longest an approval can run. Set by appending `valid_until {timestamp}`
 * to the agent name; approvals commonly land nearer 90 days.
 */
export const AGENT_APPROVAL_MAX_DAYS = 180;

/**
 * Named agent slots. The cap rises with cumulative volume traded, so a fresh
 * account gets fewer. Re-approving an existing name replaces that agent
 * rather than adding one, which is how rotation works within the cap.
 */
export const NAMED_AGENT_SLOTS = 3;

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The approval for one address, or null when it is not approved. */
export function findAgent(
  agents: readonly HLExtraAgent[],
  address: string,
): HLExtraAgent | null {
  return agents.find((a) => eq(a.address, address)) ?? null;
}

/** The approvals that have not expired. */
export function activeAgents(
  agents: readonly HLExtraAgent[],
  now: number = Date.now(),
): HLExtraAgent[] {
  return agents.filter((a) => a.validUntil > now);
}

/** Where one agent stands. */
export interface AgentStatus {
  address: string;
  approved: boolean;
  name: string | null;
  /** Millisecond timestamp the approval lapses, or null when not approved. */
  validUntil: number | null;
  /** Milliseconds left, floored at zero. */
  expiresInMs: number;
  expired: boolean;
}

/**
 * Whether this agent can act right now, and for how much longer.
 *
 * Worth diarising: settlement deadlines carry a penalty, and an approval that
 * lapses stops the deployer settling until a replacement is approved.
 */
export function agentStatus(
  agents: readonly HLExtraAgent[],
  address: string,
  now: number = Date.now(),
): AgentStatus {
  const found = findAgent(agents, address);
  if (!found) {
    return {
      address,
      approved: false,
      name: null,
      validUntil: null,
      expiresInMs: 0,
      expired: false,
    };
  }
  const expired = found.validUntil <= now;
  return {
    address: found.address,
    approved: !expired,
    name: found.name,
    validUntil: found.validUntil,
    expiresInMs: Math.max(0, found.validUntil - now),
    expired,
  };
}

/** Approvals lapsing inside `withinMs`, soonest first. */
export function expiringAgents(
  agents: readonly HLExtraAgent[],
  withinMs: number,
  now: number = Date.now(),
): HLExtraAgent[] {
  return agents
    .filter((a) => a.validUntil > now && a.validUntil - now <= withinMs)
    .sort((a, b) => a.validUntil - b.validUntil);
}
