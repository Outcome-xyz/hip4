// ---------------------------------------------------------------------------
// USDH On/Off-Ramp Adapter
//
// Bridges Across Protocol (crosschain intents) + Coinbase (fiat on/off-ramp)
// to enable fiat ↔ USDH on Hyperliquid.
//
// MAINNET ONLY - all mutating methods throw on testnet.
// ---------------------------------------------------------------------------

import type {
  CoinbaseSession,
  CoinbaseUrl,
  DepositAddressResult,
  DepositStatus,
  GenerateDepositAddressParams,
  PredictionRampAdapter,
  RampConfig,
  SellQuoteParams,
  SellQuoteResult,
} from "../../types/ramp";

// ─── Constants ───────────────────────────────────────────────────────────────

const ACROSS_API_BASE = "https://app.across.to/api";

/** USDC on Arbitrum */
const USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
/** USDH-SPOT on HyperCore (8 decimals) */
const USDH_HYPERCORE = "0x2000000000000000000000000000000000000168";
/** USDH on HyperEVM (6 decimals) */
const USDH_HYPEREVM = "0x111111a1a0667d36bD57c0A9f569b98057111111";
/** USDC on Arbitrum */
const USDC_ARB = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

const ARBITRUM_CHAIN_ID = 42161;
const HYPERCORE_CHAIN_ID = 1337;
const HYPEREVM_CHAIN_ID = 999;

const USDC_DECIMALS = 6;
const USDH_HYPEREVM_DECIMALS = 6;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a human-readable amount to smallest unit.
 * Uses string math to avoid floating point issues.
 */
function parseAmount(amount: string, decimals: number): string {
  if (!amount || amount === "0") return "0";
  const [whole, fraction = ""] = amount.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  return (whole + padded).replace(/^0+/, "") || "0";
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class HIP4RampAdapter implements PredictionRampAdapter {
  private readonly isTestnet: boolean;
  private readonly acrossBase: string;
  private readonly acrossApiKey: string;
  private readonly acrossIntegratorId: string;
  private readonly coinbaseWorkerUrl: string;
  private readonly coinbaseAppId: string;

  constructor(isTestnet: boolean, config: RampConfig = {}) {
    this.isTestnet = isTestnet;
    this.acrossBase = config.acrossApiBase ?? ACROSS_API_BASE;
    this.acrossApiKey = config.acrossApiKey ?? "";
    this.acrossIntegratorId = config.acrossIntegratorId ?? "";
    this.coinbaseWorkerUrl = config.coinbaseTokenWorkerUrl ?? "";
    this.coinbaseAppId = config.coinbaseAppId ?? "";
  }

  // ── Guards ──────────────────────────────────────────────────────────────

  private assertMainnet(op: string): void {
    if (this.isTestnet) {
      throw new Error(
        `[ramp] ${op} is only available on mainnet. ` +
          `Across and Coinbase integrations do not support Hyperliquid testnet.`,
      );
    }
  }

  // ── Across API ──────────────────────────────────────────────────────────

  private acrossHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.acrossApiKey) h["Authorization"] = `Bearer ${this.acrossApiKey}`;
    return h;
  }

  private async acrossGet<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.acrossBase}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), { headers: this.acrossHeaders() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[ramp] Across API error (${res.status}): ${body}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Buy: fiat → USDH ───────────────────────────────────────────────────

  async generateDepositAddress(
    params: GenerateDepositAddressParams,
  ): Promise<DepositAddressResult> {
    this.assertMainnet("generateDepositAddress");

    const q: Record<string, string> = {
      useDepositAddress: "true",
      inputToken: USDC_ARBITRUM,
      outputToken: USDH_HYPERCORE,
      originChainId: String(ARBITRUM_CHAIN_ID),
      destinationChainId: String(HYPERCORE_CHAIN_ID),
      amount: parseAmount(params.amount, USDC_DECIMALS),
      recipient: params.recipient,
      refundAddress: params.refundAddress ?? params.recipient,
    };
    if (this.acrossIntegratorId) q.integratorId = this.acrossIntegratorId;

    return this.acrossGet<DepositAddressResult>("/swap/counterfactual", q);
  }

  // ── Sell: USDH → fiat ──────────────────────────────────────────────────

  async getSellQuote(params: SellQuoteParams): Promise<SellQuoteResult> {
    this.assertMainnet("getSellQuote");

    const q: Record<string, string> = {
      tradeType: "exactInput",
      amount: parseAmount(params.amount, USDH_HYPEREVM_DECIMALS),
      inputToken: USDH_HYPEREVM,
      outputToken: USDC_ARB,
      originChainId: String(HYPEREVM_CHAIN_ID),
      destinationChainId: String(ARBITRUM_CHAIN_ID),
      depositor: params.depositor,
      skipOriginTxEstimation: "true",
    };
    if (this.acrossIntegratorId) q.integratorId = this.acrossIntegratorId;

    return this.acrossGet<SellQuoteResult>("/swap/approval", q);
  }

  // ── Deposit tracking ───────────────────────────────────────────────────

  async checkDepositStatus(
    depositAddress: string,
    index = 0,
  ): Promise<DepositStatus> {
    return this.acrossGet<DepositStatus>("/deposit/status", {
      depositAddress,
      index: String(index),
    });
  }

  // ── Coinbase integration ───────────────────────────────────────────────

  async getCoinbaseSessionToken(params: {
    walletAddress: string;
    blockchains: string[];
    assets?: string[];
  }): Promise<CoinbaseSession> {
    if (!this.coinbaseWorkerUrl) {
      throw new Error("[ramp] coinbaseTokenWorkerUrl is not configured");
    }

    const res = await fetch(this.coinbaseWorkerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addresses: [
          { address: params.walletAddress, blockchains: params.blockchains },
        ],
        assets: params.assets ?? ["USDC"],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `[ramp] Coinbase session token error (${res.status}): ${body}`,
      );
    }

    return res.json() as Promise<CoinbaseSession>;
  }

  generateBuyUrl(params: {
    sessionToken: string;
    amount?: number;
  }): CoinbaseUrl {
    const qs = new URLSearchParams({
      appId: this.coinbaseAppId,
      sessionToken: params.sessionToken,
      defaultAsset: "USDC",
      defaultNetwork: "arbitrum",
      presetFiatAmount: String(params.amount ?? 100),
      fiatCurrency: "USD",
      defaultExperience: "buy",
    });
    return { url: `https://pay.coinbase.com/?${qs.toString()}`, type: "buy" };
  }

  generateSellUrl(params: {
    sessionToken: string;
    amount?: number;
  }): CoinbaseUrl {
    const qs = new URLSearchParams({
      appId: this.coinbaseAppId,
      sessionToken: params.sessionToken,
      defaultAsset: "USDC",
      defaultNetwork: "arbitrum",
      presetCryptoAmount: String(params.amount ?? 0),
      defaultExperience: "send",
    });
    return { url: `https://pay.coinbase.com/?${qs.toString()}`, type: "sell" };
  }
}
