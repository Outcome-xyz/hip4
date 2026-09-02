// ---------------------------------------------------------------------------
// Unit tests for the Outcome rewards module:
// outcomeRewards.programme / .wallet / .periods / .leaderboard
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OUTCOME_REWARDS_CONFIG,
  outcomeRewards,
  OutcomeRewardsError,
} from "../../src/outcome-rewards";

// ---------------------------------------------------------------------------
// Raw fixtures (snake_case, as returned by the live API)
// ---------------------------------------------------------------------------

const RAW_PROGRAMME_TOTALS = {
  paid_usdc: "38057.564596",
  pending_usdc: "0.000000",
  awarded_usdc: "38057.564596",
  payments: 4959,
  wallets: 868,
  reward_periods: 80,
  last_paid_at: "2026-09-02T10:01:12.051Z",
  last_24h: { paid_usdc: "11463.540031", payments: 1694 },
  today: { paid_usdc: "11463.540031", payments: 1694, wallets: 455 },
};

const RAW_WALLET_SUMMARY = {
  wallet: "0xf1e76ce906bf7f81a2db85764749e4d19b4d2054",
  paid_usdc: "2238.159569",
  pending_usdc: "0.000000",
  awarded_usdc: "2238.159569",
  payments: 37,
  rewards: [
    {
      market_id: "O1238",
      epoch_end_date: null,
      market_name: "XYZ100 above 29,505 at August 31, 2026 20:00 UTC",
      reward_usdc: "162.887472",
      status: "sent",
      tx_hash:
        "0xfeb55505086484ab002f04437285dc02080200eaa367a37ea27e0057c7685e96",
      paid_at: "2026-09-01T11:38:33.913Z",
    },
    {
      market_id: "Q191",
      epoch_end_date: "2026-08-30",
      market_name: "Federal Reserve September 2026 policy rate decision",
      reward_usdc: "11.108286",
      status: "sent",
      tx_hash: "0x5d03...",
      paid_at: "2026-08-31T09:12:04.118Z",
    },
  ],
};

const RAW_EMPTY_WALLET_SUMMARY = {
  wallet: "0x0000000000000000000000000000000000000000",
  paid_usdc: "0.000000",
  pending_usdc: "0.000000",
  awarded_usdc: "0.000000",
  payments: 0,
  rewards: [],
};

const RAW_PERIODS = {
  periods: [
    {
      market_id: "Q191",
      epoch_end_date: "2026-08-30",
      market_name: "Federal Reserve September 2026 policy rate decision",
      period_type: "epoch",
      finalized_at: "2026-08-31T08:25:29.401Z",
      awarded_usdc: "399.999983",
      paid_usdc: "399.999983",
      wallets: 21,
      payments: 21,
      state: "paid",
    },
  ],
};

const RAW_LEADERBOARD = {
  wallets: [
    {
      rank: 1,
      wallet: "0xf1e76ce906bf7f81a2db85764749e4d19b4d2054",
      paid_usdc: "2238.159569",
      payments: 37,
      reward_periods: 37,
    },
  ],
};

function mockFetchResponse(status: number, data: unknown = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("outcomeRewards.programme()", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns normalized programme-wide totals from /v1/rewards", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_PROGRAMME_TOTALS));
    vi.stubGlobal("fetch", fetchMock);

    const result = await outcomeRewards.programme();

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${OUTCOME_REWARDS_CONFIG.baseUrl}/v1/rewards`,
    );
    expect(result.paidUsdc).toBe("38057.564596");
    expect(result.pendingUsdc).toBe("0.000000");
    expect(result.awardedUsdc).toBe("38057.564596");
    expect(result.payments).toBe(4959);
    expect(result.wallets).toBe(868);
    expect(result.rewardPeriods).toBe(80);
    expect(result.lastPaidAt).toBe("2026-09-02T10:01:12.051Z");
    expect(result.last24h).toEqual({
      paidUsdc: "11463.540031",
      payments: 1694,
    });
    expect(result.today).toEqual({
      paidUsdc: "11463.540031",
      payments: 1694,
      wallets: 455,
    });
  });

  it("respects a baseUrl override", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_PROGRAMME_TOTALS));
    vi.stubGlobal("fetch", fetchMock);

    await outcomeRewards.programme({ baseUrl: "https://example.com/" });

    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/v1/rewards");
  });

  it("retries once on 500 then returns the successful result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse(500))
      .mockResolvedValueOnce(mockFetchResponse(200, RAW_PROGRAMME_TOTALS));
    vi.stubGlobal("fetch", fetchMock);

    const promise = outcomeRewards.programme();
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.payments).toBe(4959);
  });

  it("retries on network error (TypeError)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(mockFetchResponse(200, RAW_PROGRAMME_TOTALS));
    vi.stubGlobal("fetch", fetchMock);

    const promise = outcomeRewards.programme();
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.wallets).toBe(868);
  });

  it("propagates error when both attempts return 500", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    const promise = outcomeRewards.programme().catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toBeInstanceOf(OutcomeRewardsError);
    expect((result as OutcomeRewardsError).status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 429 - throws OutcomeRewardsError immediately", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockFetchResponse(429, {
          error: "Too many requests",
          code: "rate-limited",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(outcomeRewards.programme()).rejects.toThrow(
      OutcomeRewardsError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    try {
      await outcomeRewards.programme();
    } catch (err) {
      expect(err).toBeInstanceOf(OutcomeRewardsError);
      expect((err as OutcomeRewardsError).status).toBe(429);
      expect((err as OutcomeRewardsError).code).toBe("rate-limited");
    }
  });
});

describe("outcomeRewards.wallet()", () => {
  it("returns a wallet's normalized totals and reward rows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_WALLET_SUMMARY));
    vi.stubGlobal("fetch", fetchMock);

    const result = await outcomeRewards.wallet(
      "0xf1e76ce906bf7f81a2db85764749e4d19b4d2054",
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${OUTCOME_REWARDS_CONFIG.baseUrl}/v1/rewards/0xf1e76ce906bf7f81a2db85764749e4d19b4d2054`,
    );
    expect(result.paidUsdc).toBe("2238.159569");
    expect(result.rewards).toHaveLength(2);
    expect(result.rewards[0].marketId).toBe("O1238");
    expect(result.rewards[0].epochEndDate).toBeNull();
    expect(result.rewards[0].status).toBe("sent");
    expect(result.rewards[1].epochEndDate).toBe("2026-08-30");
  });

  it("returns zeroes and an empty list for a wallet with no rewards, not an error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_EMPTY_WALLET_SUMMARY));
    vi.stubGlobal("fetch", fetchMock);

    const result = await outcomeRewards.wallet(
      "0x0000000000000000000000000000000000000000",
    );

    expect(result.payments).toBe(0);
    expect(result.rewards).toEqual([]);
  });

  it("throws OutcomeRewardsError with the upstream code on a malformed address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse(400, {
        error: "Ask for a 0x wallet address.",
        code: "bad-request",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await outcomeRewards.wallet("not-a-wallet");
      expect.unreachable("expected a rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(OutcomeRewardsError);
      expect((err as OutcomeRewardsError).status).toBe(400);
      expect((err as OutcomeRewardsError).code).toBe("bad-request");
      expect((err as OutcomeRewardsError).message).toBe(
        "Ask for a 0x wallet address.",
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("outcomeRewards.periods()", () => {
  it("returns normalized reward periods and appends ?limit=", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_PERIODS));
    vi.stubGlobal("fetch", fetchMock);

    const result = await outcomeRewards.periods({ limit: 50 });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${OUTCOME_REWARDS_CONFIG.baseUrl}/v1/rewards/periods?limit=50`,
    );
    expect(result).toHaveLength(1);
    expect(result[0].marketId).toBe("Q191");
    expect(result[0].periodType).toBe("epoch");
    expect(result[0].state).toBe("paid");
  });

  it("omits the query string when no limit is given", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_PERIODS));
    vi.stubGlobal("fetch", fetchMock);

    await outcomeRewards.periods();

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${OUTCOME_REWARDS_CONFIG.baseUrl}/v1/rewards/periods`,
    );
  });
});

describe("outcomeRewards.leaderboard()", () => {
  it("returns normalized leaderboard rows and appends ?limit=", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_LEADERBOARD));
    vi.stubGlobal("fetch", fetchMock);

    const result = await outcomeRewards.leaderboard({ limit: 10 });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${OUTCOME_REWARDS_CONFIG.baseUrl}/v1/rewards/leaderboard?limit=10`,
    );
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(1);
    expect(result[0].paidUsdc).toBe("2238.159569");
  });
});
