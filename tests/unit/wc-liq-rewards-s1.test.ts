// ---------------------------------------------------------------------------
// Unit tests for liquidity rewards season 1 (World Cup 2026):
// liquidityRewards.season("s1").checkEligibility / checkRewards
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIQUIDITY_REWARDS_CONFIG,
  liquidityRewards,
  LiquidityRewardsError,
} from "../../src/liquidity-rewards";

// ---------------------------------------------------------------------------
// Raw Monarch fixtures (snake_case, as returned by api.monarch.fast)
// ---------------------------------------------------------------------------

const RAW_ELIGIBLE_TEAMS = {
  campaign_id: "world-cup-2026",
  epoch_date: "2026-06-10",
  epoch_status: "provisional",
  epoch_start_time: "2026-06-10T09:00:00Z",
  epoch_end_time: "2026-06-11T09:00:00Z",
  snapshot: { status: "live", as_of: "2026-06-10T13:50:00Z", finalized_at: null },
  builder_code: "0xab5dbc057628bc18523c4cdfc0e1e2ebdbecb704",
  eligible_teams: [
    {
      team_name: "France",
      hyperliquid_outcome_id: 189,
      eligibility_mid: "0.16150",
      mids: [{ source: "polymarket", mid: "0.16150" }],
    },
  ],
  ineligible_teams: [
    // mids intentionally omitted - observed live despite the docs
    {
      team_name: "New Zealand",
      hyperliquid_outcome_id: 190,
      eligibility_mid: "0.00500",
    },
  ],
};

const RAW_DAILY_MATCHES = {
  campaign_id: "world-cup-2026",
  epoch_date: "2026-06-10",
  epoch_status: "provisional",
  snapshot: { status: "live", as_of: "2026-06-10T13:55:00Z", finalized_at: null },
  builder_code: "0xab5dbc057628bc18523c4cdfc0e1e2ebdbecb704",
  matches: [
    {
      match_id: "mexico-vs-south-africa-2026-06-11",
      hyperliquid_question_id: 837,
      match_name: "Mexico vs South Africa",
      scheduled_kickoff_time: "2026-06-11T19:00:00Z",
      incentive_start_time: "2026-06-10T19:00:00Z",
      incentive_end_rule: "final_whistle_or_penalties_resolved",
      match_reward_amount_usdc: "100.00",
      live_multiplier: "3",
      publication_status: "unpublished",
      scored_outcomes: [
        { outcome_name: "Mexico", hyperliquid_outcome_id: 10351 },
        { outcome_name: "Draw", hyperliquid_outcome_id: 10352 },
        { outcome_name: "South Africa", hyperliquid_outcome_id: 10353 },
      ],
    },
  ],
};

const RAW_SCORES = {
  campaign_id: "world-cup-2026",
  epoch_date: "2026-06-10",
  epoch_status: "provisional",
  epoch_start_time: "2026-06-10T09:00:00Z",
  epoch_end_time: "2026-06-11T09:00:00Z",
  snapshot: { status: "live", as_of: "2026-06-10T13:55:00Z", finalized_at: null },
  scores: [
    {
      score_scope: "champion",
      wallet: "0xAbC0000000000000000000000000000000000001",
      team_name: "France",
      hyperliquid_outcome_id: 189,
      team_scoring_weight: "0.16010",
      quote_depth_score: "20081.38",
      maker_fill_volume_usdc: "4800.50",
      taker_fill_volume_usdc: "1220.00",
      total_score: "21045.26",
      daily_reward_usdc: null,
      cumulative_reward_usdc: null,
    },
    {
      score_scope: "match",
      wallet: "0xdef0000000000000000000000000000000000002",
      match_id: "mexico-vs-south-africa-2026-06-11",
      hyperliquid_question_id: 837,
      match_name: "Mexico vs South Africa",
      outcome_name: "Mexico",
      hyperliquid_outcome_id: 10351,
      quote_depth_score: "1200.00",
      maker_fill_volume_usdc: "500.00",
      taker_fill_volume_usdc: "80.00",
      total_score: "1780.00",
      daily_reward_usdc: null,
      cumulative_reward_usdc: null,
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

describe("liquidityRewards.season()", () => {
  it("throws on unknown seasons with the known list", () => {
    expect(() => liquidityRewards.season("s9")).toThrow(
      'Unknown liquidity rewards season "s9"',
    );
  });

  it("resolves s1 to the world-cup-2026 campaign from the config file", () => {
    const s1 = liquidityRewards.season("s1");
    expect(s1.seasonId).toBe("s1");
    expect(s1.campaignId).toBe("world-cup-2026");
  });
});

describe("checkEligibility (s1, World Cup 2026)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("checks team eligibility against the configured Monarch URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_ELIGIBLE_TEAMS));
    vi.stubGlobal("fetch", fetchMock);

    const result = await liquidityRewards
      .season("s1")
      .checkEligibility({ subject: "teams" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${LIQUIDITY_REWARDS_CONFIG.monarchBaseUrl}/marina/campaigns/world-cup-2026/eligible-teams`,
    );
    expect(result.subject).toBe("teams");
    expect(result.season).toBe("s1");
    expect(result.epochDate).toBe("2026-06-10");
    expect(result.builderCode).toBe(RAW_ELIGIBLE_TEAMS.builder_code);
    expect(result.snapshot.asOf).toBe("2026-06-10T13:50:00Z");
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0].teamName).toBe("France");
    expect(result.eligible[0].hyperliquidOutcomeId).toBe(189);
    expect(result.ineligible[0].teamName).toBe("New Zealand");
    expect(result.ineligible[0].mids).toEqual([]);
  });

  it("checks match eligibility from the daily-matches endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_DAILY_MATCHES));
    vi.stubGlobal("fetch", fetchMock);

    const result = await liquidityRewards
      .season("s1")
      .checkEligibility({ subject: "matches" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${LIQUIDITY_REWARDS_CONFIG.monarchBaseUrl}/marina/campaigns/world-cup-2026/daily-matches`,
    );
    expect(result.subject).toBe("matches");
    expect(result.season).toBe("s1");
    expect(result.epochStartTime).toBeNull();
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0].hyperliquidQuestionId).toBe(837);
    expect(result.eligible[0].matchRewardAmountUsdc).toBe("100.00");
    expect(result.eligible[0].scoredOutcomes).toHaveLength(3);
  });

  it("appends ?epoch_date= for a specific scoring day and respects baseUrl", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_ELIGIBLE_TEAMS));
    vi.stubGlobal("fetch", fetchMock);

    await liquidityRewards.season("s1").checkEligibility({
      subject: "teams",
      date: "2026-06-08",
      baseUrl: "https://example.com/",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.com/marina/campaigns/world-cup-2026/eligible-teams?epoch_date=2026-06-08",
    );
  });

  it("retries once on 500 then returns successful result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse(500))
      .mockResolvedValueOnce(mockFetchResponse(200, RAW_ELIGIBLE_TEAMS));
    vi.stubGlobal("fetch", fetchMock);

    const promise = liquidityRewards
      .season("s1")
      .checkEligibility({ subject: "teams" });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.epochDate).toBe("2026-06-10");
  });

  it("does NOT retry on 404 - throws LiquidityRewardsError immediately", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      liquidityRewards.season("s1").checkEligibility({ subject: "teams" }),
    ).rejects.toThrow(LiquidityRewardsError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    try {
      await liquidityRewards
        .season("s1")
        .checkEligibility({ subject: "teams" });
    } catch (err) {
      expect(err).toBeInstanceOf(LiquidityRewardsError);
      expect((err as LiquidityRewardsError).status).toBe(404);
    }
  });

  it("retries on network error (TypeError)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(mockFetchResponse(200, RAW_ELIGIBLE_TEAMS));
    vi.stubGlobal("fetch", fetchMock);

    const promise = liquidityRewards
      .season("s1")
      .checkEligibility({ subject: "teams" });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.builderCode).toBe(RAW_ELIGIBLE_TEAMS.builder_code);
  });

  it("propagates error when both attempts return 500", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    const promise = liquidityRewards
      .season("s1")
      .checkEligibility({ subject: "teams" })
      .catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toBeInstanceOf(LiquidityRewardsError);
    expect((result as LiquidityRewardsError).status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("checkRewards (s1, World Cup 2026)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns normalized score rows from the scores endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_SCORES));
    vi.stubGlobal("fetch", fetchMock);

    const result = await liquidityRewards.season("s1").checkRewards();

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${LIQUIDITY_REWARDS_CONFIG.monarchBaseUrl}/marina/campaigns/world-cup-2026/scores`,
    );
    expect(result.season).toBe("s1");
    expect(result.epochStatus).toBe("provisional");
    expect(result.scores).toHaveLength(2);

    const champion = result.scores[0];
    expect(champion.scoreScope).toBe("champion");
    expect(champion.teamName).toBe("France");
    expect(champion.teamScoringWeight).toBe("0.16010");
    expect(champion.totalScore).toBe("21045.26");
    expect(champion.dailyRewardUsdc).toBeNull();

    const match = result.scores[1];
    expect(match.scoreScope).toBe("match");
    expect(match.matchId).toBe("mexico-vs-south-africa-2026-06-11");
    expect(match.outcomeName).toBe("Mexico");
  });

  it("filters by wallet case-insensitively", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, RAW_SCORES));
    vi.stubGlobal("fetch", fetchMock);

    const result = await liquidityRewards.season("s1").checkRewards({
      wallet: "0xABC0000000000000000000000000000000000001",
    });

    expect(result.scores).toHaveLength(1);
    expect(result.scores[0].teamName).toBe("France");
  });

  it("passes ?epoch_date= and treats empty scores as a normal result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse(200, {
        ...RAW_SCORES,
        epoch_date: "2026-06-20",
        epoch_status: "upcoming",
        snapshot: { status: "preview", as_of: null, finalized_at: null },
        scores: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await liquidityRewards
      .season("s1")
      .checkRewards({ date: "2026-06-20" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${LIQUIDITY_REWARDS_CONFIG.monarchBaseUrl}/marina/campaigns/world-cup-2026/scores?epoch_date=2026-06-20`,
    );
    expect(result.epochStatus).toBe("upcoming");
    expect(result.snapshot.status).toBe("preview");
    expect(result.scores).toEqual([]);
  });
});
