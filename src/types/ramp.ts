// ---------------------------------------------------------------------------
// USDH On/Off-Ramp Types
//
// Covers the full lifecycle:
//   Buy:  fiat → Coinbase onramp → USDC (Arbitrum) → Across counterfactual → USDH (HyperCore)
//   Sell: USDH (HyperEVM) → Across swap → USDC (Arbitrum) → Coinbase offramp → fiat
// ---------------------------------------------------------------------------

/** Configuration for the ramp adapter */
export interface RampConfig {
  /** Across API base URL. Default: proxied through worker */
  acrossApiBase?: string;
  /** Across API key (Bearer token) */
  acrossApiKey?: string;
  /** Across integrator ID (2-byte hex, e.g. "0x00f3") */
  acrossIntegratorId?: string;
  /** Worker URL for Coinbase session token generation */
  coinbaseTokenWorkerUrl?: string;
  /** Coinbase CDP project ID */
  coinbaseAppId?: string;
}

/** Parameters for generating a counterfactual deposit address (buy flow) */
export interface GenerateDepositAddressParams {
  /** Amount in USD (human-readable, e.g. "100") */
  amount: string;
  /** Recipient address on HyperCore */
  recipient: string;
  /** Refund address on Arbitrum (defaults to recipient) */
  refundAddress?: string;
}

/** Result from generating a counterfactual deposit address */
export interface DepositAddressResult {
  /** The deterministic deposit address on Arbitrum */
  depositAddress: string;
  /** Unique quote ID */
  id: string;
  /** Input amount in smallest unit */
  inputAmount: string;
  /** Expected output in smallest unit */
  expectedOutputAmount: string;
  /** Minimum guaranteed output */
  minOutputAmount: string;
  /** Expected fill time in seconds */
  expectedFillTime: number;
  /** Unix timestamp when this quote expires */
  quoteExpiryTimestamp: number;
  /** Input token info */
  inputToken: {
    symbol: string;
    decimals: number;
    chainId: number;
    address: string;
  };
  /** Output token info */
  outputToken: {
    symbol: string;
    decimals: number;
    chainId: number;
    address: string;
  };
  /** Fee breakdown */
  fees: { total: { amount: string; amountUsd: string; pct: string } };
}

/** Parameters for getting a sell quote (off-ramp) */
export interface SellQuoteParams {
  /** Amount of USDH to sell (human-readable, e.g. "100") */
  amount: string;
  /** User's wallet address on HyperEVM */
  depositor: string;
}

/** Result from a sell quote */
export interface SellQuoteResult {
  /** Input amount in smallest unit */
  inputAmount: string;
  /** Expected USDC output in smallest unit */
  expectedOutputAmount: string;
  /** Minimum guaranteed USDC output */
  minOutputAmount: string;
  /** Expected fill time in seconds */
  expectedFillTime: number;
  /** Input token info */
  inputToken: {
    symbol: string;
    decimals: number;
    chainId: number;
    address: string;
  };
  /** Output token info */
  outputToken: {
    symbol: string;
    decimals: number;
    chainId: number;
    address: string;
  };
  /** Fee breakdown */
  fees: { total: { amount: string; amountUsd: string } };
  /** Transaction to execute (null if approvals needed first) */
  swapTx: { to: string; data: string; value?: string; chainId: number } | null;
  /** Approval transactions needed before swap */
  approvalTxns: { to: string; data: string; chainId: number }[];
  /** Quote ID */
  id: string;
}

/** Deposit status */
export interface DepositStatus {
  status: "filled" | "unfilled" | "refunded";
  depositTxnRef: string | null;
  fillTxnRef: string | null;
  originChainId: number;
  destinationChainId: number;
}

/** Coinbase session token result */
export interface CoinbaseSession {
  token: string;
}

/** Generated Coinbase URL */
export interface CoinbaseUrl {
  url: string;
  type: "buy" | "sell";
}

/** Ramp adapter interface - mainnet only */
export interface PredictionRampAdapter {
  /**
   * Generate a counterfactual deposit address for buying USDH.
   * Flow: User sends USDC to this address on Arbitrum → Across delivers USDH on HyperCore.
   * @throws {Error} if called on testnet
   */
  generateDepositAddress(
    params: GenerateDepositAddressParams,
  ): Promise<DepositAddressResult>;

  /**
   * Get a quote for selling USDH (HyperEVM → USDC on Arbitrum).
   * Returns the swap transaction to execute.
   * @throws {Error} if called on testnet
   */
  getSellQuote(params: SellQuoteParams): Promise<SellQuoteResult>;

  /**
   * Check the status of a counterfactual deposit.
   */
  checkDepositStatus(
    depositAddress: string,
    index?: number,
  ): Promise<DepositStatus>;

  /**
   * Get a Coinbase session token for secure onramp/offramp initialization.
   * Requires a worker URL to be configured.
   */
  getCoinbaseSessionToken(params: {
    walletAddress: string;
    blockchains: string[];
    assets?: string[];
  }): Promise<CoinbaseSession>;

  /**
   * Generate a Coinbase onramp URL (buy USDC → deposit address).
   */
  generateBuyUrl(params: {
    sessionToken: string;
    amount?: number;
  }): CoinbaseUrl;

  /**
   * Generate a Coinbase offramp URL (sell USDC → bank).
   */
  generateSellUrl(params: {
    sessionToken: string;
    amount?: number;
  }): CoinbaseUrl;
}
