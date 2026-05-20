// ---------------------------------------------------------------------------
// HIP-4 Account Adapter
//
// Positions: from spotClearinghouseState, filtered to outcome coins (@ / #)
// Activity: from userFillsByTime (30-day range), filtered to outcome coins
// ---------------------------------------------------------------------------

import { toDecimal, sub, mul, div, isZero } from "../../lib/precision/primitives";
import { fixed } from "../../lib/precision/io";
import type {
  PredictionActivity,
  PredictionPosition,
} from "../../types/account";
import type { PredictionEvent } from "../../types/event";
import type { PredictionAccountAdapter, Unsubscribe } from "../types";
import type { HIP4Client } from "./client";
import { coinOutcomeId, isOutcomeCoin, parseSideCoin } from "./client";
import type { SideNameResolver } from "./events";
import type { HLFill } from "./types";

interface EventDataSource {
  fetchEvents(params?: { limit?: number }): Promise<PredictionEvent[]>;
  ensureSideNames?(): Promise<void>;
}

const POLL_INTERVAL_MS = 10_000;

interface SpotBalance {
  coin: string;
  total: string;
  entryNtl: string;
}

function mapSpotBalance(
  bal: SpotBalance,
  allMids: Record<string, string>,
  nameMap: Map<string, { eventTitle: string; marketQuestion: string }>,
  resolveSideNames?: SideNameResolver,
): PredictionPosition | null {
  const coin = bal.coin;
  if (!isOutcomeCoin(coin)) return null;

  const total = toDecimal(bal.total);
  if (total.isZero()) return null;

  const outcomeId = coinOutcomeId(coin);
  const marketId = outcomeId !== null ? String(outcomeId) : coin;
  const outcome = coin;

  const parsed = parseSideCoin(coin);
  let outcomeName: string;
  if (parsed && resolveSideNames) {
    const names = resolveSideNames(parsed.outcomeId);
    outcomeName = names ? names[parsed.sideIndex] : `Side ${parsed.sideIndex}`;
  } else {
    outcomeName = parsed ? `Side ${parsed.sideIndex}` : coin;
  }

  const entryNtl = toDecimal(bal.entryNtl);
  const avgCost = isZero(bal.total) ? "0" : div(bal.entryNtl, bal.total);

  const mid = allMids[coin];
  const currentPrice = mid ?? "0";
  const unrealizedPnl = mul(sub(currentPrice, avgCost), bal.total);
  const potentialPayout = bal.total;

  const names = nameMap.get(marketId);
  return {
    marketId,
    eventTitle: names?.eventTitle ?? "",
    marketQuestion: names?.marketQuestion ?? "",
    outcome,
    outcomeName,
    shares: fixed(bal.total, 6),
    avgCost: fixed(avgCost, 6),
    currentPrice,
    unrealizedPnl: fixed(unrealizedPnl, 6),
    potentialPayout: fixed(potentialPayout, 6),
    eventStatus: "active",
  };
}

function mapFill(raw: HLFill): PredictionActivity | null {
  if (!isOutcomeCoin(raw.coin)) return null;

  const outcomeId = coinOutcomeId(raw.coin);
  const marketId = outcomeId !== null ? String(outcomeId) : raw.coin;

  return {
    id: String(raw.tid),
    type: "trade",
    marketId,
    outcome: raw.coin,
    side: raw.side === "B" ? "buy" : "sell",
    price: raw.px,
    size: raw.sz,
    timestamp: raw.time,
  };
}

export class HIP4AccountAdapter implements PredictionAccountAdapter {
  private readonly resolveSideNames?: SideNameResolver;

  constructor(
    private readonly client: HIP4Client,
    private readonly events?: EventDataSource,
    resolveSideNames?: SideNameResolver,
  ) {
    this.resolveSideNames = resolveSideNames;
  }

  async fetchPositions(address: string): Promise<PredictionPosition[]> {
    if (this.events?.ensureSideNames) {
      await this.events.ensureSideNames();
    }

    const [state, allMids, eventList] = await Promise.all([
      this.client.fetchSpotClearinghouseState(address),
      this.client.fetchAllMids(),
      this.events?.fetchEvents({ limit: 200 }).catch(() => [] as PredictionEvent[]) ??
        Promise.resolve([] as PredictionEvent[]),
    ]);

    const nameMap = new Map<string, { eventTitle: string; marketQuestion: string }>();
    for (const event of eventList) {
      for (const market of event.markets) {
        nameMap.set(market.id, { eventTitle: event.title, marketQuestion: market.question });
      }
    }

    const positions: PredictionPosition[] = [];
    for (const bal of state.balances) {
      if (!isOutcomeCoin(bal.coin)) continue;
      if (isZero(bal.total)) continue;

      const mapped = mapSpotBalance(bal, allMids, nameMap, this.resolveSideNames);
      if (mapped) positions.push(mapped);
    }

    return positions;
  }

  async fetchActivity(address: string): Promise<PredictionActivity[]> {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const startTime = now - thirtyDaysMs;

    const fills = await this.client.fetchUserFillsByTime(
      address,
      startTime,
      now,
    );
    const activities: PredictionActivity[] = [];
    for (const fill of fills) {
      const mapped = mapFill(fill);
      if (mapped) activities.push(mapped);
    }
    return activities;
  }

  async fetchBalance(
    address: string,
  ): Promise<Array<{ coin: string; total: string; hold: string }>> {
    const state = await this.client.fetchSpotClearinghouseState(address);
    return state.balances.map((b) => ({
      coin: b.coin,
      total: b.total,
      hold: b.hold,
    }));
  }

  async fetchOpenOrders(address: string): Promise<
    Array<{
      coin: string;
      side: "B" | "A";
      limitPx: string;
      sz: string;
      oid: number;
      timestamp: number;
    }>
  > {
    const orders = await this.client.fetchFrontendOpenOrders(address);
    return orders.map((o) => ({
      coin: o.coin,
      side: o.side,
      limitPx: o.limitPx,
      sz: o.sz,
      oid: o.oid,
      timestamp: o.timestamp,
    }));
  }

  subscribePositions(
    address: string,
    onData: (positions: PredictionPosition[]) => void,
  ): Unsubscribe {
    let active = true;

    const poll = async () => {
      while (active) {
        try {
          const positions = await this.fetchPositions(address);
          if (active) onData(positions);
        } catch {
          // Silently continue polling
        }
        if (active) {
          await sleep(POLL_INTERVAL_MS);
        }
      }
    };

    void poll();

    return () => {
      active = false;
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
