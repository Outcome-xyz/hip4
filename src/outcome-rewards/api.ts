// ---------------------------------------------------------------------------
// Outcome rewards API access (raw snake_case shapes + normalizers)
//
// The API is public (no auth), CORS-open. Requests retry once on 5xx/network
// errors, matching the SDK's other read-API clients; 4xx - including 429
// rate-limiting - throws immediately. Retrying straight into a rate limit
// without honoring a backoff would make things worse, not better.
// ---------------------------------------------------------------------------

import { OUTCOME_REWARDS_CONFIG } from "./config";
import type {
  OutcomeRewardsLeaderboardEntry,
  OutcomeRewardsPeriod,
  OutcomeRewardsProgrammeTotals,
  OutcomeRewardsWalletReward,
  OutcomeRewardsWalletSummary,
} from "./types";
import { OutcomeRewardsError } from "./types";

// -- Raw wire responses --------------------------------------------------------

type WireProgrammeTotals = {
  paid_usdc: string;
  pending_usdc: string;
  awarded_usdc: string;
  payments: number;
  wallets: number;
  reward_periods: number;
  last_paid_at: string | null;
};

type WireWalletReward = {
  market_id: string;
  epoch_end_date: string | null;
  market_name: string;
  reward_usdc: string;
  status: string;
  tx_hash: string | null;
  paid_at: string | null;
};

type WireWalletSummary = {
  wallet: string;
  paid_usdc: string;
  pending_usdc: string;
  awarded_usdc: string;
  payments: number;
  rewards?: WireWalletReward[];
};

type WirePeriod = {
  market_id: string;
  epoch_end_date: string | null;
  market_name: string;
  period_type: "market" | "epoch";
  finalized_at: string;
  awarded_usdc: string;
  paid_usdc: string;
  wallets: number;
  payments: number;
  state: "unpaid" | "partial" | "paid";
};

type WirePeriodsResponse = { periods?: WirePeriod[] };

type WireLeaderboardEntry = {
  rank: number;
  wallet: string;
  paid_usdc: string;
  payments: number;
  reward_periods: number;
};

type WireLeaderboardResponse = { wallets?: WireLeaderboardEntry[] };

type WireErrorBody = { error?: unknown; code?: unknown };

// -- Fetch with retry-once semantics -------------------------------------------

export type OutcomeRewardsRequestOptions = {
  /** Override the base URL from the config file. */
  baseUrl?: string;
  /** Abort signal. Defaults to a 15s timeout. */
  signal?: AbortSignal;
};

export type ListOptions = OutcomeRewardsRequestOptions & {
  /** Max rows to return. Upstream default 100, max 500. */
  limit?: number;
};

async function outcomeRewardsGet<T>(
  path: string,
  options: OutcomeRewardsRequestOptions,
): Promise<T> {
  try {
    return await doGet<T>(path, options);
  } catch (err) {
    // Only retry on 5xx or network errors, not 4xx (429 included)
    if (
      err instanceof OutcomeRewardsError &&
      err.status >= 400 &&
      err.status < 500
    )
      throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return doGet<T>(path, options);
  }
}

async function doGet<T>(
  path: string,
  options: OutcomeRewardsRequestOptions,
): Promise<T> {
  const base = (options.baseUrl ?? OUTCOME_REWARDS_CONFIG.baseUrl).replace(
    /\/$/,
    "",
  );
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: options.signal ?? AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body: WireErrorBody | null = await res.json().catch(() => null);
    const message =
      typeof body?.error === "string"
        ? body.error
        : `Outcome rewards API responded with ${res.status}: ${res.statusText}`;
    const code = typeof body?.code === "string" ? body.code : undefined;
    throw new OutcomeRewardsError(res.status, message, code);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new OutcomeRewardsError(
      res.status,
      "Outcome rewards API returned non-JSON response",
    );
  }
}

function listQuery(limit: number | undefined): string {
  return limit !== undefined ? `?limit=${encodeURIComponent(limit)}` : "";
}

// -- Endpoint calls -------------------------------------------------------------

export async function fetchProgrammeTotals(
  options: OutcomeRewardsRequestOptions = {},
): Promise<OutcomeRewardsProgrammeTotals> {
  const raw = await outcomeRewardsGet<WireProgrammeTotals>(
    "/v1/rewards",
    options,
  );
  return normalizeProgrammeTotals(raw);
}

export async function fetchWalletSummary(
  wallet: string,
  options: OutcomeRewardsRequestOptions = {},
): Promise<OutcomeRewardsWalletSummary> {
  const raw = await outcomeRewardsGet<WireWalletSummary>(
    `/v1/rewards/${encodeURIComponent(wallet)}`,
    options,
  );
  return normalizeWalletSummary(raw);
}

export async function fetchPeriods(
  options: ListOptions = {},
): Promise<OutcomeRewardsPeriod[]> {
  const raw = await outcomeRewardsGet<WirePeriodsResponse>(
    `/v1/rewards/periods${listQuery(options.limit)}`,
    options,
  );
  return (raw.periods ?? []).map(normalizePeriod);
}

export async function fetchLeaderboard(
  options: ListOptions = {},
): Promise<OutcomeRewardsLeaderboardEntry[]> {
  const raw = await outcomeRewardsGet<WireLeaderboardResponse>(
    `/v1/rewards/leaderboard${listQuery(options.limit)}`,
    options,
  );
  return (raw.wallets ?? []).map(normalizeLeaderboardEntry);
}

// -- Normalizers (snake_case -> camelCase) --------------------------------------

function normalizeProgrammeTotals(
  raw: WireProgrammeTotals,
): OutcomeRewardsProgrammeTotals {
  return {
    paidUsdc: raw.paid_usdc,
    pendingUsdc: raw.pending_usdc,
    awardedUsdc: raw.awarded_usdc,
    payments: raw.payments,
    wallets: raw.wallets,
    rewardPeriods: raw.reward_periods,
    lastPaidAt: raw.last_paid_at,
  };
}

function normalizeWalletReward(
  raw: WireWalletReward,
): OutcomeRewardsWalletReward {
  return {
    marketId: raw.market_id,
    epochEndDate: raw.epoch_end_date,
    marketName: raw.market_name,
    rewardUsdc: raw.reward_usdc,
    status: raw.status,
    txHash: raw.tx_hash,
    paidAt: raw.paid_at,
  };
}

function normalizeWalletSummary(
  raw: WireWalletSummary,
): OutcomeRewardsWalletSummary {
  return {
    wallet: raw.wallet,
    paidUsdc: raw.paid_usdc,
    pendingUsdc: raw.pending_usdc,
    awardedUsdc: raw.awarded_usdc,
    payments: raw.payments,
    rewards: (raw.rewards ?? []).map(normalizeWalletReward),
  };
}

function normalizePeriod(raw: WirePeriod): OutcomeRewardsPeriod {
  return {
    marketId: raw.market_id,
    epochEndDate: raw.epoch_end_date,
    marketName: raw.market_name,
    periodType: raw.period_type,
    finalizedAt: raw.finalized_at,
    awardedUsdc: raw.awarded_usdc,
    paidUsdc: raw.paid_usdc,
    wallets: raw.wallets,
    payments: raw.payments,
    state: raw.state,
  };
}

function normalizeLeaderboardEntry(
  raw: WireLeaderboardEntry,
): OutcomeRewardsLeaderboardEntry {
  return {
    rank: raw.rank,
    wallet: raw.wallet,
    paidUsdc: raw.paid_usdc,
    payments: raw.payments,
    rewardPeriods: raw.reward_periods,
  };
}
