// ---------------------------------------------------------------------------
// HIP-4 Market Data Adapter
//
// marketId = outcome ID as string (e.g. "10")
// Order book fetched for side 0 (first side / "Yes").
// Prices fetched for both sides via allMids.
// ---------------------------------------------------------------------------

import type {
  PredictionOrderBook,
  PredictionPrice,
  PredictionTrade,
} from "../../types/market";
import type { PredictionMarketDataAdapter, Unsubscribe } from "../types";
import type { HIP4Client } from "./client";
import { sideCoin } from "./client";
import type { SideNameResolver } from "./events";
import type {
  HLL2Book,
  HLTrade,
  HLWsActivePerpAssetCtxData,
  HLWsActiveSpotAssetCtxData,
  HLWsAllMidsData,
  HLWsL2BookData,
  HLWsSpotAssetCtxsData,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapBook(raw: HLL2Book, marketId: string): PredictionOrderBook {
  const [bids, asks] = raw.levels;
  return {
    marketId,
    bids: bids.map((l) => ({ price: l.px, size: l.sz })),
    asks: asks.map((l) => ({ price: l.px, size: l.sz })),
    timestamp: raw.time,
  };
}

function mapWsBook(raw: HLWsL2BookData, marketId: string): PredictionOrderBook {
  const [bids, asks] = raw.levels;
  return {
    marketId,
    bids: bids.map((l) => ({ price: l.px, size: l.sz })),
    asks: asks.map((l) => ({ price: l.px, size: l.sz })),
    timestamp: raw.time,
  };
}

function mapTrade(raw: HLTrade, marketId: string): PredictionTrade {
  return {
    id: String(raw.tid),
    marketId,
    outcome: raw.coin,
    side: raw.side === "B" ? "buy" : "sell",
    price: raw.px,
    size: raw.sz,
    timestamp: raw.time,
  };
}

// ---------------------------------------------------------------------------
// HIP4MarketDataAdapter
// ---------------------------------------------------------------------------

export class HIP4MarketDataAdapter implements PredictionMarketDataAdapter {
  private midsCache: { data: Record<string, string>; time: number } | null =
    null;
  private static readonly MIDS_CACHE_TTL = 5_000;

  private readonly resolveSideNames: SideNameResolver;
  private readonly ensureSideNames?: () => Promise<void>;

  constructor(
    private readonly client: HIP4Client,
    resolveSideNames?: SideNameResolver,
    ensureSideNames?: () => Promise<void>,
  ) {
    this.resolveSideNames = resolveSideNames ?? (() => null);
    this.ensureSideNames = ensureSideNames;
  }

  async fetchOrderBook(
    marketId: string,
    sideIndex: number = 0,
  ): Promise<PredictionOrderBook> {
    const outcomeId = parseInt(marketId, 10);
    const coin = sideCoin(outcomeId, sideIndex);
    const raw = await this.client.fetchL2Book(coin);
    return mapBook(raw, marketId);
  }

  private sideNamesFor(marketId: string): [string, string] {
    const outcomeId = parseInt(marketId, 10);
    return this.resolveSideNames(outcomeId) ?? ["Side 0", "Side 1"];
  }

  async fetchPrice(marketId: string): Promise<PredictionPrice> {
    await this.ensureSideNames?.();
    const outcomeId = parseInt(marketId, 10);
    const mids = await this.getMids();
    const [name0, name1] = this.sideNamesFor(marketId);

    const side0Coin = sideCoin(outcomeId, 0);
    const side1Coin = sideCoin(outcomeId, 1);

    const side0Mid = mids[side0Coin] ?? "0";
    const side1Mid = mids[side1Coin] ?? "0";

    return {
      marketId,
      outcomes: [
        { name: name0, price: side0Mid, midpoint: side0Mid },
        { name: name1, price: side1Mid, midpoint: side1Mid },
      ],
      timestamp: Date.now(),
    };
  }

  async fetchTrades(
    marketId: string,
    limit = 50,
    sideIndex: number = 0,
  ): Promise<PredictionTrade[]> {
    const outcomeId = parseInt(marketId, 10);
    const coin = sideCoin(outcomeId, sideIndex);
    const raw = await this.client.fetchRecentTrades(coin);
    return raw.slice(0, limit).map((t) => mapTrade(t, marketId));
  }

  async fetchCandles(
    marketId: string,
    interval = "1h",
    startTime?: number,
    endTime?: number,
  ): Promise<
    Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>
  > {
    const outcomeId = parseInt(marketId, 10);
    const coin = sideCoin(outcomeId, 0);
    const now = Date.now();
    const start = startTime ?? now - 14 * 24 * 60 * 60 * 1000;
    const end = endTime ?? now;
    const raw = await this.client.fetchCandleSnapshot(
      coin,
      interval,
      start,
      end,
    );
    return raw.map((c) => ({
      time: c.t / 1000,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
    }));
  }

  // -- WebSocket subscriptions --------------------------------------------

  subscribeOrderBook(
    marketId: string,
    onData: (book: PredictionOrderBook) => void,
  ): Unsubscribe {
    const outcomeId = parseInt(marketId, 10);
    const coin = sideCoin(outcomeId, 0);
    return this.subscribeWs("l2Book", coin, (data) => {
      if (isL2BookData(data) && data.coin === coin) {
        onData(mapWsBook(data, marketId));
      }
    });
  }

  subscribePrice(
    marketId: string,
    onData: (price: PredictionPrice) => void,
  ): Unsubscribe {
    const outcomeId = parseInt(marketId, 10);
    const coin0 = sideCoin(outcomeId, 0);
    const coin1 = sideCoin(outcomeId, 1);

    return this.subscribeWs("allMids", "*", (data) => {
      if (!isAllMidsData(data)) return;
      const mids = data.mids as Record<string, string>;
      const side0Mid = mids[coin0];
      const side1Mid = mids[coin1];
      if (side0Mid === undefined && side1Mid === undefined) return;

      // Resolve names on each callback so we pick up sideSpec names
      // once they're loaded (may be "Side 0"/"Side 1" on first tick)
      const [n0, n1] = this.sideNamesFor(marketId);

      onData({
        marketId,
        outcomes: [
          {
            name: n0,
            price: side0Mid ?? "0",
            midpoint: side0Mid ?? "0",
          },
          {
            name: n1,
            price: side1Mid ?? "0",
            midpoint: side1Mid ?? "0",
          },
        ],
        timestamp: Date.now(),
      });
    });
  }

  subscribeTrades(
    marketId: string,
    onData: (trade: PredictionTrade) => void,
  ): Unsubscribe {
    const outcomeId = parseInt(marketId, 10);
    const coin = sideCoin(outcomeId, 0);
    return this.subscribeWs("trades", coin, (data) => {
      if (!isTradesData(data)) return;
      for (const t of data) {
        const trade = t as HLTrade;
        if (trade.coin === coin) {
          onData(mapTrade(trade, marketId));
        }
      }
    });
  }

  subscribeAllMids(onData: (data: HLWsAllMidsData) => void): Unsubscribe {
    return this.subscribeWs("allMids", "*", (data) => {
      if (isAllMidsData(data)) {
        onData(data);
      }
    });
  }

  /**
   * Subscribe to real-time asset context (volume, mark price, OI) for a spot coin.
   *
   * HL subscription type is "activeAssetCtx" but the response channel for spot
   * assets is "activeSpotAssetCtx" (perps use "activeAssetCtx" instead).
   * We only handle spot here since HIP-4 prediction tokens are spot assets.
   * If perps support is added, a separate method or channel-aware routing is needed.
   */
  subscribeActiveAssetCtx(
    coin: string,
    onData: (data: HLWsActiveSpotAssetCtxData) => void,
  ): Unsubscribe {
    return this.subscribeWs(
      "activeSpotAssetCtx",
      coin,
      (data) => {
        if (isActiveAssetCtxData(data) && data.coin === coin) {
          onData(data);
        }
      },
      "activeAssetCtx",
    );
  }

  /**
   * Subscribe to bulk spot asset context updates for ALL spot coins.
   * Undocumented HL subscription type "spotAssetCtxs" - streams an array
   * of SpotAssetCtx entries on each update.
   */
  subscribeSpotAssetCtxs(
    onData: (data: HLWsSpotAssetCtxsData) => void,
  ): Unsubscribe {
    return this.subscribeWs("spotAssetCtxs", "*", (data) => {
      if (isSpotAssetCtxsData(data)) {
        onData(data);
      }
    });
  }

  /**
   * Subscribe to real-time perp asset context (mark price, oracle, funding).
   * For perps, both subscription type and response channel are "activeAssetCtx".
   */
  subscribePerpAssetCtx(
    coin: string,
    onData: (data: HLWsActivePerpAssetCtxData) => void,
  ): Unsubscribe {
    return this.subscribeWs("activeAssetCtx", coin, (data) => {
      if (isActivePerpAssetCtxData(data) && data.coin === coin) {
        onData(data);
      }
    });
  }

  /** No-op - WebSocket lifecycle is managed by the shared HIP4Client. */
  destroy(): void {
    // Individual subscriptions are cleaned up by their unsubscribe functions.
  }

  // -- Internal helpers ---------------------------------------------------

  private async getMids(): Promise<Record<string, string>> {
    const now = Date.now();
    if (
      this.midsCache &&
      now - this.midsCache.time < HIP4MarketDataAdapter.MIDS_CACHE_TTL
    ) {
      return this.midsCache.data;
    }
    const data = await this.client.fetchAllMids();
    this.midsCache = { data, time: now };
    return data;
  }

  /**
   * Subscribe to a WebSocket channel via the shared HIP4Client.
   *
   * @param channel   Response channel name used for message routing (e.g. "l2Book").
   * @param coin      Coin filter ("*" for channel-only subscriptions).
   * @param onData    Callback fired on each matching message.
   * @param subscriptionType  Wire type sent in the subscribe message. Defaults
   *   to `channel`. Needed when HL uses a different name in the subscribe
   *   request vs the response channel (e.g. send "activeAssetCtx" but receive
   *   on "activeSpotAssetCtx" for spot assets).
   */
  private subscribeWs(
    channel: string,
    coin: string,
    onData: (data: unknown) => void,
    subscriptionType?: string,
  ): Unsubscribe {
    const wireType = subscriptionType ?? channel;
    const subscription: Record<string, unknown> = { type: wireType };
    if (coin !== "*") {
      subscription.coin = coin;
    }

    return this.client.subscribe(
      subscription as { type: string },
      onData,
      wireType !== channel ? { responseChannel: channel } : undefined,
    );
  }
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isL2BookData(data: unknown): data is HLWsL2BookData {
  return (
    typeof data === "object" &&
    data !== null &&
    "coin" in data &&
    "levels" in data
  );
}

function isAllMidsData(data: unknown): data is HLWsAllMidsData {
  return typeof data === "object" && data !== null && "mids" in data;
}

function isTradesData(data: unknown): data is HLTrade[] {
  return Array.isArray(data);
}

function isActiveAssetCtxData(
  data: unknown,
): data is HLWsActiveSpotAssetCtxData {
  return (
    typeof data === "object" && data !== null && "coin" in data && "ctx" in data
  );
}

function isActivePerpAssetCtxData(
  data: unknown,
): data is HLWsActivePerpAssetCtxData {
  return (
    typeof data === "object" && data !== null && "coin" in data && "ctx" in data
  );
}

function isSpotAssetCtxsData(data: unknown): data is HLWsSpotAssetCtxsData {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0] === "object" &&
    data[0] !== null &&
    "coin" in data[0] &&
    "markPx" in data[0]
  );
}
