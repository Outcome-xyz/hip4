// ---------------------------------------------------------------------------
// Hyperliquid HIP-4 Adapter - composes sub-adapters around a shared client
//
// HIP-4 prediction markets reuse the standard HL REST/WS API with:
//   @<outcomeId>              - outcome-level instrument (AMM-managed)
//   #<outcomeId><sideIndex>   - per-side probability market (0-1 range)
// ---------------------------------------------------------------------------

import type { CreateHIP4AdapterConfig } from "../factory";
import type { PredictionsAdapter } from "../types";
import { HIP4AccountAdapter } from "./account";
import { HIP4Auth } from "./auth";
import { HIP4Client } from "./client";
import { HIP4EventAdapter } from "./events";
import { HIP4MarketDataAdapter } from "./market-data";
import { HIP4TradingAdapter } from "./trading";
import { HIP4WalletAdapter } from "./wallet";

export class HyperliquidHip4Adapter implements PredictionsAdapter {
  readonly id = "hyperliquid";
  readonly name: string;
  readonly events: HIP4EventAdapter;
  readonly marketData: PredictionsAdapter["marketData"];
  readonly account: PredictionsAdapter["account"];
  readonly trading: HIP4TradingAdapter;
  readonly auth: PredictionsAdapter["auth"];
  readonly wallet: HIP4WalletAdapter;

  readonly client: HIP4Client;
  private readonly _marketData: HIP4MarketDataAdapter;

  constructor(config: CreateHIP4AdapterConfig = {}) {
    const testnet = config.testnet ?? true;
    this.name = testnet ? "Hyperliquid HIP-4 (Testnet)" : "Hyperliquid HIP-4";

    this.client = new HIP4Client({
      testnet,
      infoUrl: config.infoUrl,
      exchangeUrl: config.exchangeUrl,
      logger: config.logger,
    });

    const auth = new HIP4Auth();
    const eventAdapter = new HIP4EventAdapter(this.client);
    this.events = eventAdapter;
    const sideNameResolver = eventAdapter.getSideNameResolver();
    const ensureSideNames = () => eventAdapter.ensureSideNames();
    this._marketData = new HIP4MarketDataAdapter(this.client, sideNameResolver, ensureSideNames);
    this.marketData = this._marketData;
    this.account = new HIP4AccountAdapter(this.client, eventAdapter, sideNameResolver);
    this.trading = new HIP4TradingAdapter(this.client, auth, {
      builderAddress: config.builderAddress,
      builderFee: config.builderFee,
    });
    this.auth = auth;
    this.wallet = new HIP4WalletAdapter(this.client, auth);
  }


  async initialize(): Promise<void> {
    // Populate the side names cache from outcomeMeta so sideSpec names are
    // available before any market data or account queries.
    await this.events.ensureSideNames();
  }

  destroy(): void {
    this.client.closeWs();
    this.auth.clearAuth();
  }
}
