import {
  createHIP4Adapter,
  parseInstanceDescription,
  templateIdOfOutcome,
} from "@outcome.xyz/hip4";
import type { HIP4Market, HLOutcomeTemplate } from "@outcome.xyz/hip4";

export const hip4 = createHIP4Adapter();

/**
 * Outcome's live events, highest 24h volume first. An event is a question's
 * options (Arsenal, Draw, Leeds United) or a single market.
 */
export async function loadEvents() {
  const [markets, mids, templates] = await Promise.all([
    hip4.events.fetchMarkets({ sortBy: "volume" }) as Promise<HIP4Market[]>,
    hip4.client.fetchAllMids(),
    hip4.client.fetchOutcomeTemplates(),
  ]);
  const events = new Map<string, HIP4Market[]>();
  for (const market of markets) {
    // Other deployers publish on Hyperliquid too. Outcome's markets have venue
    // "out". A question's fallback outcome has no order book.
    if (market.raw.venue !== "out" || ("isFallback" in market && market.isFallback)) continue;
    const id = "questionId" in market ? `q${market.questionId}` : `o${market.outcomeId}`;
    events.set(id, [...(events.get(id) ?? []), market]);
  }
  const options = [...events.values()].map((e) => e.sort((a, b) => a.outcomeId - b.outcomeId));
  return { events: options, mids, templates };
}

export const CATEGORIES = ["sports", "crypto", "esports", "economics", "finance"];
const ESPORTS = ["esport", "esports", "lol", "leagueoflegends", "dota", "dota2", "cs2", "csgo", "counterstrike"];

/** The category outcome.xyz lists a market under, or "all" if none. */
export function categoryOf(market: HIP4Market, templates: HLOutcomeTemplate[]): string {
  const event = "rawQuestion" in market ? market.rawQuestion : market.raw;
  const keywords = {
    ...parseInstanceDescription(market.raw.description),
    ...parseInstanceDescription(event.description),
  };
  if (keywords.sport) {
    return ESPORTS.includes(keywords.sport.toLowerCase().replace(/[^a-z0-9]/g, "")) ? "esports" : "sports";
  }
  // Templates tag their category, e.g. "metadata=category:economics|...".
  const template = templates.find((t) => t.id === templateIdOfOutcome(event.name));
  const tag = template?.description.match(/metadata=category:(\w+)/)?.[1];
  if (tag && CATEGORIES.includes(tag)) return tag;
  // A market on a Hyperliquid perp: BTC is crypto, xyz:GOLD (the xyz dex) is finance.
  const perp = keywords.perp ?? keywords.underlying;
  if (perp?.startsWith("xyz:")) return "finance";
  if (perp && !perp.includes(":")) return "crypto";
  return "all";
}
