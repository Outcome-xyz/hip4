import { describe, expect, it } from "vitest";
import type { HLOutcomeTemplate } from "../../src/adapter/hyperliquid/types";
import { DeployerError } from "../../src/deployer/error";
import {
  assertTemplateInstance,
  findTemplate,
  instanceDescription,
  namedOutcomeTemplates,
  parseInstanceDescription,
  parseSeriesId,
  parseTemplateStamp,
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
} from "../../src/deployer/templates";

/* Trimmed from the live testnet registry, 18 Aug 2026. */
const BINARY_PRICE_4: HLOutcomeTemplate = {
  id: "binaryPrice4",
  role: { standaloneOutcome: { sideNames: ["Yes", "No"] } },
  name: "{perp} above {threshold} at {time}?",
  description: "If the {perp} mark price is above {threshold} at {time}...",
  keywords: [
    ["perp", "hlPerp"],
    ["threshold", "uDecimal"],
    ["time", "dateTime"],
  ],
};

const SPORTS_RESULT: HLOutcomeTemplate = {
  id: "sportsContestResult",
  role: "question",
  name: "{participantA} versus {participantB}",
  description: "Result of the contest",
  keywords: [
    ["participantA", "string"],
    ["participantB", "string"],
  ],
};

const SPORTS_DRAW: HLOutcomeTemplate = {
  id: "sportsContestDraw",
  role: { questionOutcome: { parent: "sportsContestResult" } },
  name: "Draw",
  description: "The contest ends level",
  keywords: [],
};

const WINNER_3: HLOutcomeTemplate = {
  id: "sportsContestWinner3",
  role: { standaloneOutcome: { sideNames: ["{shortNameA}", "{shortNameB}"] } },
  name: "{shortNameA} beats {shortNameB}?",
  description: "Contest winner",
  keywords: [["shortNameA", "shortString"]],
};

const REGISTRY = [BINARY_PRICE_4, SPORTS_RESULT, SPORTS_DRAW, WINNER_3];

/* A fixed clock, so the dated hints do not drift with the suite. */
const NOW = Date.UTC(2026, 7, 18, 12, 0);

describe("roles", () => {
  it("reads the three role kinds", () => {
    expect(templateRoleKind(BINARY_PRICE_4.role)).toBe("standaloneOutcome");
    expect(templateRoleKind(SPORTS_RESULT.role)).toBe("question");
    expect(templateRoleKind(SPORTS_DRAW.role)).toBe("questionOutcome");
  });

  it("names the parent of a question outcome", () => {
    expect(templateParentId(SPORTS_DRAW.role)).toBe("sportsContestResult");
    expect(templateParentId(BINARY_PRICE_4.role)).toBeNull();
  });

  it("returns side names as published, placeholders and all", () => {
    expect(templateSideNames(WINNER_3.role)).toEqual([
      "{shortNameA}",
      "{shortNameB}",
    ]);
    expect(templateSideNames(SPORTS_RESULT.role)).toEqual(["Yes", "No"]);
  });

  it("collects the named outcomes of a question template", () => {
    expect(namedOutcomeTemplates(REGISTRY, "sportsContestResult")).toEqual([
      SPORTS_DRAW,
    ]);
  });
});

describe("lookup", () => {
  it("finds by id and says what is available when it cannot", () => {
    expect(findTemplate(REGISTRY, "binaryPrice4")).toBe(BINARY_PRICE_4);
    expect(findTemplate(REGISTRY, "nope")).toBeNull();
    expect(() => requireTemplate(REGISTRY, "nope")).toThrow(/binaryPrice4/);
  });
});

describe("stamps", () => {
  it("round-trips a UTC dateTime stamp", () => {
    const date = parseTemplateStamp("20260901-1200");
    expect(date?.toISOString()).toBe("2026-09-01T12:00:00.000Z");
    expect(toTemplateStamp(date as Date)).toBe("20260901-1200");
    expect(toTemplateStamp(date as Date, "date")).toBe("20260901");
  });

  it("refuses anything that is not a stamp", () => {
    expect(parseTemplateStamp("2026-09-01")).toBeNull();
    expect(parseTemplateStamp("")).toBeNull();
  });

  it("refuses an out-of-range part rather than rolling it over", () => {
    expect(parseTemplateStamp("20261301")).toBeNull();
    expect(parseTemplateStamp("20260231")).toBeNull();
    expect(parseTemplateStamp("20260901-2500")).toBeNull();
  });
});

describe("keyword values", () => {
  const opts = { now: NOW };

  it("accepts a future dateTime and refuses a past one", () => {
    expect(validateKeywordValue("time", "dateTime", "20260901-1200", opts)).toBeNull();
    expect(validateKeywordValue("time", "dateTime", "20260101-1200", opts)).toBe(
      "Must be in the future",
    );
  });

  it("keeps date and dateTime as distinct grammars", () => {
    expect(validateKeywordValue("d", "date", "20260901", opts)).toBeNull();
    expect(validateKeywordValue("d", "date", "20260901-1200", opts)).not.toBeNull();
    expect(validateKeywordValue("t", "dateTime", "20260901", opts)).not.toBeNull();
  });

  it("refuses a dateTime more than a year out", () => {
    expect(validateKeywordValue("time", "dateTime", "20280101-1200", opts)).toBe(
      "Must be within one year",
    );
  });

  it("holds the numeric grammars the exchange holds", () => {
    expect(validateKeywordValue("t", "uInt", "10", opts)).toBeNull();
    expect(validateKeywordValue("t", "uInt", "010", opts)).not.toBeNull();
    expect(validateKeywordValue("t", "uDecimal", "1.5", opts)).toBeNull();
    expect(validateKeywordValue("t", "uDecimal", "1.50", opts)).not.toBeNull();
    expect(validateKeywordValue("t", "uDecimal", "-1", opts)).not.toBeNull();
  });

  it("rejects the characters that would break a pipe-joined description", () => {
    expect(validateKeywordValue("t", "string", "a|b", opts)).not.toBeNull();
    expect(validateKeywordValue("t", "string", "{a}", opts)).not.toBeNull();
  });

  it("checks an hlPerp against the known set when one is given", () => {
    const knownPerps = new Set(["BTC", "ETH"]);
    expect(validateKeywordValue("perp", "hlPerp", "BTC", { ...opts, knownPerps })).toBeNull();
    expect(validateKeywordValue("perp", "hlPerp", "XYZ", { ...opts, knownPerps })).not.toBeNull();
    expect(validateKeywordValue("perp", "hlPerp", "XYZ", opts)).toBeNull();
  });

  it("caps a shortString at 10 characters", () => {
    expect(validateKeywordValue("s", "shortString", "12345678901", opts)).not.toBeNull();
  });
});

describe("instantiation", () => {
  const values = { perp: "BTC", threshold: "50000", time: "20260901-1200" };

  it("passes a complete, valid instance", () => {
    expect(validateTemplateInstance(BINARY_PRICE_4, values, { now: NOW })).toEqual([]);
  });

  it("reports missing and unknown keywords together", () => {
    const problems = validateTemplateInstance(
      BINARY_PRICE_4,
      { perp: "BTC", nonsense: "x" },
      { now: NOW },
    );
    expect(problems.map((p) => p.keyword).sort()).toEqual([
      "nonsense",
      "threshold",
      "time",
    ]);
  });

  it("throws with every problem listed at once", () => {
    expect(() => assertTemplateInstance(BINARY_PRICE_4, {}, { now: NOW })).toThrow(
      DeployerError,
    );
  });
});

describe("descriptions", () => {
  it("round-trips a pipe-joined instance description", () => {
    const values = { time: "20260901-1200", perp: "BTC", threshold: "50000" };
    const description = instanceDescription(values);
    expect(description).toBe("perp:BTC|threshold:50000|time:20260901-1200");
    expect(parseInstanceDescription(description)).toEqual(values);
  });

  it("keeps colons that appear inside a value", () => {
    expect(parseInstanceDescription("officialSource:NFL: the league")).toEqual({
      officialSource: "NFL: the league",
    });
  });

  it("reads the template id off a deployed outcome name", () => {
    expect(templateIdOfOutcome("template:binaryPrice")).toBe("binaryPrice");
    expect(templateIdOfOutcome("Other")).toBeNull();
  });

  it("finds placeholders a template never declares", () => {
    expect(unfillablePlaceholders(WINNER_3)).toEqual(["shortNameB"]);
    expect(unfillablePlaceholders(SPORTS_DRAW)).toEqual([]);
  });
});

describe("versioning", () => {
  const ids = ["binaryPrice", "binaryPrice2", "binaryPrice4", "priceTouch"];

  it("splits an id into base and index", () => {
    expect(parseSeriesId("binaryPrice4")).toEqual({ base: "binaryPrice", index: 4 });
    expect(parseSeriesId("priceTouch")).toEqual({ base: "priceTouch", index: 1 });
  });

  it("deprecates every id below the highest in its series", () => {
    const facts = seriesFacts(ids);
    expect([...facts.deprecated].sort()).toEqual(["binaryPrice", "binaryPrice2"]);
    expect(facts.currentOf.get("binaryPrice")).toBe("binaryPrice4");
  });

  it("leaves a lone suffixed id alone, having nothing to compare it to", () => {
    expect(seriesFacts(["sportsContestWinner3"]).deprecated.size).toBe(0);
  });

  it("names the successor of a deprecated id", () => {
    expect(supersededBy("binaryPrice", ids)).toBe("binaryPrice4");
    expect(supersededBy("binaryPrice4", ids)).toBeNull();
  });

  it("splits a registry into current and deprecated", () => {
    const { current, deprecated } = splitBySeries([
      BINARY_PRICE_4,
      { ...BINARY_PRICE_4, id: "binaryPrice" },
    ]);
    expect(current.map((t) => t.id)).toEqual(["binaryPrice4"]);
    expect(deprecated.map((t) => t.id)).toEqual(["binaryPrice"]);
  });
});
