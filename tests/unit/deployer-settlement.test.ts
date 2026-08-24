import { describe, expect, it } from "vitest";
import type { HLOutcome } from "../../src/adapter/hyperliquid/types";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4DeployerAdapter } from "../../src/deployer/deployer";
import {
  canonicalKeywords,
  eventAtFrom,
  perpFrom,
  readDeployedOutcome,
  resolutionDeadlineFrom,
  scalarBandFrom,
  thresholdFrom,
} from "../../src/deployer/keywords";
import {
  settlementQueue,
  settlementStatus,
  suggestPriceSettlement,
} from "../../src/deployer/settlement";
import { createMockClient } from "../helpers/mock-client";

const HOUR = 60 * 60 * 1000;
/* 2026-09-01T12:00Z, the stamp used throughout below. */
const EVENT = Date.UTC(2026, 8, 1, 12, 0);

/* Shapes taken from live testnet outcomeMeta, trimmed. */
const PRICE: HLOutcome = {
  outcome: 11010,
  name: "template:binaryPrice4",
  description:
    "perp:BTC|priceDescription:Bitcoin|seconds:60|threshold:50000|time:20260901-1200",
  sideSpecs: [{ name: "template:Yes" }, { name: "template:No" }],
  venue: "zzz",
};

const SPORTS: HLOutcome = {
  outcome: 12000,
  name: "template:sportsContestWinner3",
  description:
    "participantA:Brazil|participantB:Spain|resolutionDeadline:20260902-1200|scheduledStart:20260901-1200|shortNameA:BRA",
  sideSpecs: [{ name: "BRA" }, { name: "ESP" }],
  venue: "zzz",
};

/* A protocol-generated recurring market, which uses the older names. */
const CLASS_MARKET: HLOutcome = {
  outcome: 9000,
  name: "BTC above 66200",
  description:
    "class:priceBinary|underlying:BTC|expiry:20260901-1200|targetPrice:66200|period:15m",
  sideSpecs: [{ name: "Yes" }, { name: "No" }],
  venue: "aa",
};

const UNDATED: HLOutcome = {
  outcome: 7002,
  name: "Other",
  description: "N/A",
  sideSpecs: [{ name: "Yes" }, { name: "No" }],
  venue: "zzz",
};

describe("keyword aliasing", () => {
  it("renames the older class-market names to current template names", () => {
    expect(
      canonicalKeywords({
        underlying: "BTC",
        targetPrice: "66200",
        expiry: "20260901-1200",
        period: "15m",
      }),
    ).toEqual({
      perp: "BTC",
      threshold: "66200",
      time: "20260901-1200",
      period: "15m",
    });
  });

  it("does not let an alias clobber a canonical name already present", () => {
    expect(canonicalKeywords({ perp: "ETH", underlying: "BTC" })).toEqual({
      perp: "ETH",
    });
  });

  it("reads the perp and level under either generation's names", () => {
    const template = { perp: "BTC", threshold: "50000" };
    const older = canonicalKeywords({ underlying: "BTC", targetPrice: "66200" });
    expect(perpFrom(template)).toBe("BTC");
    expect(perpFrom(older)).toBe("BTC");
    expect(thresholdFrom(template)).toBe("50000");
    expect(thresholdFrom(older)).toBe("66200");
  });

  it("reads priceTouch's `target` as the level too", () => {
    expect(thresholdFrom({ target: "70000" })).toBe("70000");
  });

  it("reads a scalar band", () => {
    expect(scalarBandFrom({ low: "10", high: "20" })).toEqual({
      low: "10",
      high: "20",
    });
    expect(scalarBandFrom({ low: "10" })).toBeNull();
  });
});

describe("times", () => {
  it("takes the event time, not the resolution deadline", () => {
    const keywords = canonicalKeywords({
      scheduledStart: "20260901-1200",
      resolutionDeadline: "20260902-1200",
    });
    expect(eventAtFrom(keywords)?.getTime()).toBe(EVENT);
    expect(resolutionDeadlineFrom(keywords)?.getTime()).toBe(EVENT + 24 * HOUR);
  });

  it("finds the event time of a class market through its alias", () => {
    expect(
      eventAtFrom({ underlying: "BTC", expiry: "20260901-1200" })?.getTime(),
    ).toBe(EVENT);
  });

  it("falls back to the earliest stamp under an unrecognised keyword", () => {
    expect(eventAtFrom({ somethingNew: "20260901-1200" })?.getTime()).toBe(EVENT);
  });

  it("never falls back onto a resolution deadline", () => {
    expect(eventAtFrom({ resolutionDeadline: "20260902-1200" })).toBeNull();
  });

  it("returns null when nothing dated is present", () => {
    expect(eventAtFrom({ participantA: "Brazil" })).toBeNull();
  });
});

describe("readDeployedOutcome", () => {
  it("decodes a template market", () => {
    const decoded = readDeployedOutcome(PRICE);
    expect(decoded).toMatchObject({
      outcomeId: 11010,
      templateId: "binaryPrice4",
      perp: "BTC",
      threshold: "50000",
      venue: "zzz",
      sideNames: ["template:Yes", "template:No"],
    });
    expect(decoded.eventAt?.getTime()).toBe(EVENT);
    expect(decoded.resolutionDeadline).toBeNull();
  });

  it("decodes a class market with no template of its own", () => {
    const decoded = readDeployedOutcome(CLASS_MARKET);
    expect(decoded.templateId).toBeNull();
    expect(decoded.perp).toBe("BTC");
    expect(decoded.threshold).toBe("66200");
    expect(decoded.eventAt?.getTime()).toBe(EVENT);
  });

  it("decodes a market that carries no keywords at all", () => {
    const decoded = readDeployedOutcome(UNDATED);
    expect(decoded).toMatchObject({ templateId: null, eventAt: null, perp: null });
  });
});

describe("settlementStatus", () => {
  const window = { settleWithinMs: 6 * HOUR };

  it("waits while the event is still ahead", () => {
    const s = settlementStatus(PRICE, { ...window, now: EVENT - HOUR });
    expect(s.state).toBe("waiting");
    expect(s.lateBy).toBe(0);
  });

  it("prefers the template's own deadline over the supplied window", () => {
    const s = settlementStatus(SPORTS, { ...window, now: EVENT + HOUR });
    expect(s.deadlineIsPublished).toBe(true);
    expect(s.deadline?.getTime()).toBe(EVENT + 24 * HOUR);
    expect(s.state).toBe("waiting");
  });

  it("derives a deadline from the window when the template publishes none", () => {
    const s = settlementStatus(PRICE, { ...window, now: EVENT + HOUR });
    expect(s.deadlineIsPublished).toBe(false);
    expect(s.deadline?.getTime()).toBe(EVENT + 6 * HOUR);
    expect(s.state).toBe("waiting");
  });

  it("reports due once the deadline is inside the warning lead", () => {
    const s = settlementStatus(PRICE, {
      ...window,
      warnLeadMs: 2 * HOUR,
      now: EVENT + 5 * HOUR,
    });
    expect(s.state).toBe("due");
  });

  it("reports overdue past the deadline, and says how far", () => {
    const s = settlementStatus(PRICE, { ...window, now: EVENT + 30 * HOUR });
    expect(s.state).toBe("overdue");
    expect(s.lateBy).toBe(24 * HOUR);
    expect(s.why).toMatch(/1d past its deadline/);
  });

  it("says so rather than assuming fine when no time can be read", () => {
    const s = settlementStatus(UNDATED, { ...window, now: EVENT });
    expect(s.state).toBe("unknown");
    expect(s.deadline).toBeNull();
  });
});

describe("settlementQueue", () => {
  it("drops what is waiting, keeps what cannot be judged, worst first", () => {
    const queue = settlementQueue([PRICE, SPORTS, UNDATED], {
      settleWithinMs: 6 * HOUR,
      now: EVENT + 30 * HOUR,
    });
    expect(queue.map((s) => [s.outcome.outcomeId, s.state])).toEqual([
      [11010, "overdue"],
      [12000, "overdue"],
      [7002, "unknown"],
    ]);
  });

  it("orders the latest first among equals", () => {
    const older: HLOutcome = {
      ...PRICE,
      outcome: 11011,
      description: "perp:ETH|threshold:2000|time:20260801-1200",
    };
    const queue = settlementQueue([PRICE, older], {
      settleWithinMs: 6 * HOUR,
      now: EVENT + 30 * HOUR,
    });
    expect(queue[0]?.outcome.outcomeId).toBe(11011);
  });
});

describe("suggestPriceSettlement", () => {
  const eventAt = new Date(EVENT);

  it("stays silent until the event time has passed", () => {
    expect(
      suggestPriceSettlement({
        markPx: "60000",
        threshold: "50000",
        eventAt,
        now: EVENT - 1,
      }),
    ).toBeNull();
    expect(
      suggestPriceSettlement({
        markPx: "60000",
        threshold: "50000",
        eventAt: null,
        now: EVENT + 1,
      }),
    ).toBeNull();
  });

  it("pays the first side above the threshold and the second at or below", () => {
    const above = suggestPriceSettlement({
      markPx: "60000",
      threshold: "50000",
      eventAt,
      now: EVENT + 1,
    });
    expect(above?.settleFraction).toBe("1");
    const below = suggestPriceSettlement({
      markPx: "40000",
      threshold: "50000",
      eventAt,
      now: EVENT + 1,
    });
    expect(below?.settleFraction).toBe("0");
    const exactly = suggestPriceSettlement({
      markPx: "50000",
      threshold: "50000",
      eventAt,
      now: EVENT + 1,
    });
    expect(exactly?.settleFraction).toBe("0");
  });

  it("compares with decimal math, not floats", () => {
    /* 0.1 + 0.2 > 0.3 in binary floating point; it must not be here. */
    const s = suggestPriceSettlement({
      markPx: "0.3",
      threshold: "0.30000000000000004",
      eventAt,
      now: EVENT + 1,
    });
    expect(s?.settleFraction).toBe("0");
  });
});

describe("adapter", () => {
  it("queues only the outcomes this deployer's venue owns", async () => {
    const client = createMockClient();
    client.fetchOutcomeMeta.mockResolvedValue({
      outcomes: [PRICE, SPORTS, CLASS_MARKET],
      questions: [],
      deployers: [{ deployer: "0x" + "aa".repeat(20), venue: "zzz" }],
    });
    const deployer = new HIP4DeployerAdapter(client as unknown as HIP4Client);
    const queue = await deployer.fetchSettlementQueue("0x" + "aa".repeat(20), {
      settleWithinMs: 6 * HOUR,
      now: EVENT + 30 * HOUR,
    });
    /* CLASS_MARKET is venue "aa", so it belongs to someone else. */
    expect(queue.map((s) => s.outcome.outcomeId).sort()).toEqual([11010, 12000]);
  });

  it("returns nothing for an account that is not a deployer", async () => {
    const client = createMockClient();
    client.fetchOutcomeMeta.mockResolvedValue({
      outcomes: [PRICE],
      questions: [],
      deployers: [],
    });
    const deployer = new HIP4DeployerAdapter(client as unknown as HIP4Client);
    expect(
      await deployer.fetchSettlementQueue("0x" + "bb".repeat(20), {
        settleWithinMs: 6 * HOUR,
      }),
    ).toEqual([]);
  });
});
