// ---------------------------------------------------------------------------
// Template display names: the pure renderer, and the event, market and
// position surfaces that use it.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import { HIP4AccountAdapter } from "../../src/adapter/hyperliquid/account";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4EventAdapter } from "../../src/adapter/hyperliquid/events";
import { classifyAllOutcomes } from "../../src/adapter/hyperliquid/market-classification";
import {
  renderOutcomeDisplay,
  renderTemplateDisplay,
} from "../../src/adapter/hyperliquid/template-display";
import type {
  HLOutcomeMeta,
  HLOutcomeTemplate,
} from "../../src/adapter/hyperliquid/types";

const TEMPLATES: HLOutcomeTemplate[] = [
  {
    id: "priceTouch",
    role: { standaloneOutcome: { sideNames: ["Yes", "No"] } },
    name: "{perp} touches {target} by {time}",
    description: "Resolves Yes if {perp} touches {target}.",
    keywords: [
      ["perp", "hlPerp"],
      ["target", "uDecimal"],
      ["time", "dateTime"],
    ],
  },
  {
    id: "dayPrice",
    role: { standaloneOutcome: { sideNames: ["Yes", "No"] } },
    name: "{perp} above {target} on {day}",
    description: "",
    keywords: [
      ["perp", "hlPerp"],
      ["target", "uDecimal"],
      ["day", "date"],
    ],
  },
  {
    id: "contest",
    role: { standaloneOutcome: { sideNames: ["{a}", "{b}"] } },
    name: "{a} vs {b}",
    description: "",
    keywords: [
      ["a", "shortString"],
      ["b", "shortString"],
    ],
  },
  {
    id: "race",
    role: "question",
    name: "Race on {day}",
    description: "",
    keywords: [["day", "date"]],
  },
];

const PRICE_TOUCH = {
  name: "template:priceTouch",
  description: "perp:BTC|target:90000|time:20261101-0000",
  sideSpecs: [{ name: "template:Yes" }, { name: "template:No" }],
};

describe("renderTemplateDisplay", () => {
  it("fills the name and strips the prefix from side names", () => {
    expect(renderTemplateDisplay(PRICE_TOUCH, TEMPLATES)).toEqual({
      name: "BTC touches 90000 by Nov 1, 00:00 UTC",
      sideNames: ["Yes", "No"],
    });
  });

  it("formats a date hint without a time and a dateTime hint with one", () => {
    const day = renderTemplateDisplay(
      {
        name: "template:dayPrice",
        description: "perp:ETH|target:5000|day:20261101-0000",
        sideSpecs: [],
      },
      TEMPLATES,
    );
    expect(day.name).toBe("ETH above 5000 on Nov 1, 2026");
    expect(renderTemplateDisplay(PRICE_TOUCH, TEMPLATES).name).toContain(
      "00:00 UTC",
    );
  });

  it("fills placeholders in side names", () => {
    const out = renderTemplateDisplay(
      {
        name: "template:contest",
        description: "a:ARS|b:LEE",
        sideSpecs: [{ name: "template:{a}" }, { name: "template:{b}" }],
      },
      TEMPLATES,
    );
    expect(out.name).toBe("ARS vs LEE");
    expect(out.sideNames).toEqual(["ARS", "LEE"]);
  });

  it("keeps the wire name when a keyword is missing", () => {
    const out = renderTemplateDisplay(
      { ...PRICE_TOUCH, description: "perp:BTC|target:90000" },
      TEMPLATES,
    );
    expect(out.name).toBe("template:priceTouch");
  });

  it("keeps the wire name when the template is not in the registry", () => {
    const out = renderTemplateDisplay(
      { ...PRICE_TOUCH, name: "template:unknown" },
      TEMPLATES,
    );
    expect(out.name).toBe("template:unknown");
  });

  it("strips the prefix from plain side names when the registry is empty", () => {
    const out = renderTemplateDisplay(PRICE_TOUCH, []);
    expect(out.name).toBe("template:priceTouch");
    expect(out.sideNames).toEqual(["Yes", "No"]);
  });

  it("leaves a side name with a placeholder as sent when the template is unknown", () => {
    const out = renderTemplateDisplay(
      { ...PRICE_TOUCH, sideSpecs: [{ name: "template:{a}" }, { name: "No" }] },
      [],
    );
    expect(out.sideNames).toEqual(["template:{a}", "No"]);
  });

  it("does not touch markets that are not template instances", () => {
    const out = renderTemplateDisplay(
      {
        name: "Plain",
        description: "x",
        sideSpecs: [{ name: "Hypurr" }, { name: "Bolt" }],
      },
      TEMPLATES,
    );
    expect(out).toEqual({ name: "Plain", sideNames: ["Hypurr", "Bolt"] });
  });

  it("ignores a trailing metadata segment and never cuts a value", () => {
    const out = renderTemplateDisplay(
      {
        ...PRICE_TOUCH,
        name: "template:contest",
        description: "a:metadata=ok|b:LEE|metadata=route:abc",
      },
      TEMPLATES,
    );
    expect(out.name).toBe("metadata=ok vs LEE");
  });
});

describe("renderOutcomeDisplay", () => {
  it("names the fallback leg of a template question Other", () => {
    const fallback = { name: "template:race", description: "", sideSpecs: [] };
    expect(renderOutcomeDisplay(fallback, TEMPLATES, true).name).toBe("Other");
    expect(renderOutcomeDisplay(fallback, TEMPLATES, false).name).toBe(
      "template:race",
    );
  });
});

// ---------------------------------------------------------------------------
// Adapter surfaces
// ---------------------------------------------------------------------------

const META: HLOutcomeMeta = {
  outcomes: [
    { outcome: 10, ...PRICE_TOUCH },
    {
      outcome: 20,
      name: "template:race",
      description: "day:20261101-0000",
      sideSpecs: [{ name: "template:Yes" }, { name: "template:No" }],
    },
    {
      outcome: 21,
      name: "template:contest",
      description: "a:ARS|b:LEE",
      sideSpecs: [{ name: "template:{a}" }, { name: "template:{b}" }],
    },
    {
      outcome: 22,
      name: "template:contest",
      description: "a:CHE|b:MUN",
      sideSpecs: [{ name: "template:{a}" }, { name: "template:{b}" }],
    },
  ],
  questions: [
    {
      question: 5,
      name: "template:race",
      description: "day:20261101-0000",
      fallbackOutcome: 22,
      namedOutcomes: [20, 21],
      settledNamedOutcomes: [],
    },
  ],
};

function createClient(
  overrides: Record<string, unknown> = {},
): HIP4Client {
  return {
    testnet: true,
    log: vi.fn(),
    fetchOutcomeMeta: vi.fn().mockResolvedValue(META),
    fetchOutcomeTemplates: vi.fn().mockResolvedValue(TEMPLATES),
    fetchAllMids: vi.fn().mockResolvedValue({}),
    fetchSpotClearinghouseState: vi.fn().mockResolvedValue({
      balances: [
        { coin: "+100", token: 0, total: "5", hold: "0", entryNtl: "2.5" },
        { coin: "+210", token: 0, total: "3", hold: "0", entryNtl: "1.5" },
      ],
    }),
    ...overrides,
  } as unknown as HIP4Client;
}

describe("event adapter names", () => {
  it("fetchEvents renders event titles, market names and side names", async () => {
    const adapter = new HIP4EventAdapter(createClient());
    const events = await adapter.fetchEvents();

    const standalone = events.find((e) => e.id === "o10")!;
    expect(standalone.title).toBe("BTC touches 90000 by Nov 1, 00:00 UTC");
    expect(standalone.markets[0]!.question).toBe(standalone.title);
    expect(standalone.markets[0]!.outcomes.map((o) => o.name)).toEqual([
      "Yes",
      "No",
    ]);

    const question = events.find((e) => e.id === "q5")!;
    expect(question.title).toBe("Race on Nov 1, 2026");
    expect(question.markets.map((m) => m.question)).toEqual([
      "Race on Nov 1, 2026",
      "ARS vs LEE",
      "Other",
    ]);
    const contest = question.markets.find((m) => m.id === "21")!;
    expect(contest.outcomes.map((o) => o.name)).toEqual(["ARS", "LEE"]);
  });

  it("fetchEvent returns the rendered event", async () => {
    const adapter = new HIP4EventAdapter(createClient());
    const event = await adapter.fetchEvent("o10");
    expect(event.title).toBe("BTC touches 90000 by Nov 1, 00:00 UTC");
  });

  it("shares one outcomeTemplates request between events and markets", async () => {
    const client = createClient();
    const adapter = new HIP4EventAdapter(client);
    await Promise.all([adapter.fetchEvents(), adapter.fetchMarkets()]);
    await adapter.fetchEvents();
    expect(client.fetchOutcomeTemplates).toHaveBeenCalledTimes(1);
  });

  it("strips the template prefix from plain names when the registry fails", async () => {
    const client = createClient({
      fetchOutcomeTemplates: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const adapter = new HIP4EventAdapter(client);
    const events = await adapter.fetchEvents();
    const standalone = events.find((e) => e.id === "o10")!;
    expect(standalone.title).toBe("template:priceTouch");
    expect(standalone.markets[0]!.outcomes.map((o) => o.name)).toEqual([
      "Yes",
      "No",
    ]);
    const markets = await adapter.fetchMarkets();
    expect(markets.find((m) => m.outcomeId === 10)!.sides.map((s) => s.name)).toEqual(
      ["Yes", "No"],
    );
  });

  it("keeps the same market names as classifyAllOutcomes", async () => {
    const adapter = new HIP4EventAdapter(createClient());
    const markets = await adapter.fetchMarkets();
    const direct = classifyAllOutcomes(META.outcomes, META.questions, TEMPLATES);
    expect(markets.map((m) => m.name)).toEqual(direct.map((m) => m.name));
  });
});

describe("position side names", () => {
  it("fetchPositions reports rendered side names", async () => {
    const client = createClient();
    const events = new HIP4EventAdapter(client);
    const account = new HIP4AccountAdapter(
      client,
      events,
      events.getSideNameResolver(),
    );
    const positions = await account.fetchPositions("0xabc");
    const byMarket = new Map(positions.map((p) => [p.marketId, p]));
    expect(byMarket.get("10")!.outcome).toBe("+100");
    expect(byMarket.get("10")!.outcomeName).toBe("Yes");
    expect(byMarket.get("21")!.outcomeName).toBe("ARS");
    expect(byMarket.get("10")!.eventTitle).toBe(
      "BTC touches 90000 by Nov 1, 00:00 UTC",
    );
  });
});

describe("outcomeCreated updates", () => {
  it("renders side names of a newly created template outcome", async () => {
    let push: (raw: unknown) => void = () => {};
    const client = createClient({
      subscribe: vi.fn((_sub: unknown, cb: (raw: unknown) => void) => {
        push = cb;
        return () => {};
      }),
    });
    const adapter = new HIP4EventAdapter(client);
    await adapter.fetchMarkets();
    adapter.subscribeOutcomeMetaUpdates(() => {});

    push([
      {
        outcomeCreated: {
          outcome: 30,
          name: "template:contest",
          description: "a:ARS|b:LEE",
          sideSpecs: [{ name: "template:{a}" }, { name: "template:{b}" }],
        },
      },
    ]);

    expect(adapter.getSideNameResolver()(30)).toEqual(["ARS", "LEE"]);
  });
});
