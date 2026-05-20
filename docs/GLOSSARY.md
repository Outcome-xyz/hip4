# HIP-4 SDK Glossary

A comprehensive glossary of every term, concept, and convention used in this SDK, organized by domain.

---

## Hyperliquid Protocol Terms

**allMids** - A map of coin name to mid-market price string (`Record<string, string>`). Fetched via the Info endpoint with `{ type: "allMids" }`. Used to look up current prices for both outcome coins (`@<id>`) and side coins (`#<id><sideIndex>`). Cached for 5 seconds in the market data adapter. (`src/adapter/hyperliquid/client.ts`: `fetchAllMids`)

**Alo** - "Add Liquidity Only" time-in-force type. A limit order that is rejected if it would immediately match (i.e., it must rest on the book). One of the `HLOrderType.limit.tif` values. (`src/adapter/hyperliquid/types.ts`: `HLOrderType`)

**candleSnapshot** - An Info endpoint request that returns OHLCV candle data for a given coin, interval, and time range. Each candle includes open time (`t`), close time (`T`), symbol (`s`), interval (`i`), OHLCV values, and trade count (`n`). (`src/adapter/hyperliquid/types.ts`: `HLCandle`; `src/adapter/hyperliquid/client.ts`: `fetchCandleSnapshot`)

**clearinghouseState** - A user's perpetual futures account state fetched from the Info endpoint. Contains margin summaries (`accountValue`, `totalNtlPos`, `totalRawUsd`, `totalMarginUsed`), cross-margin data, withdrawable balance, and an array of `assetPositions`. Each position carries `coin`, `szi` (signed size), `entryPx`, `unrealizedPnl`, leverage, and cumulative funding. (`src/adapter/hyperliquid/types.ts`: `HLClearinghouseState`, `HLAssetPosition`)

**Exchange endpoint** - The authenticated Hyperliquid REST endpoint (`/exchange`) that accepts signed actions such as placing orders and cancelling orders. All requests require an EIP-712 signature and a nonce. The SDK uses testnet (`api-ui.hyperliquid-testnet.xyz/exchange`) or mainnet (`api.hyperliquid.xyz/exchange`). (`src/adapter/hyperliquid/client.ts`: `exchangePost`, `placeOrder`, `cancelOrder`)

**FrontendMarket** - A special time-in-force value used for market orders on Hyperliquid. Internally it behaves as an IOC order with the exchange handling slippage. The SDK maps `type: "market"` to `{ limit: { tif: "FrontendMarket" } }`. (`src/adapter/hyperliquid/trading.ts`: `mapTif`)

**frontendOpenOrders** - An Info endpoint request that returns a user's currently resting orders in a frontend-friendly format. Each order includes `coin`, `side` (B/A), `limitPx`, `sz`, `oid`, `timestamp`, `origSz`, `reduceOnly`, `orderType`, `tif`, and optional `cloid` (client order ID). (`src/adapter/hyperliquid/types.ts`: `HLFrontendOrder`; `src/adapter/hyperliquid/client.ts`: `fetchFrontendOpenOrders`)

**Gtc** - "Good Til Cancelled" time-in-force type. The default for limit orders. The order remains on the book until filled or explicitly cancelled. (`src/adapter/hyperliquid/types.ts`: `HLOrderType`)

**Info endpoint** - The read-only Hyperliquid REST endpoint (`/info`) for querying market data, account state, and metadata. All requests are unauthenticated POST requests with a `type` field. The SDK uses testnet (`api-ui.hyperliquid-testnet.xyz/info`) or mainnet (`api.hyperliquid.xyz/info`). (`src/adapter/hyperliquid/client.ts`: `infoPost`)

**Ioc** - "Immediate or Cancel" time-in-force type. The order fills as much as possible immediately and cancels any unfilled remainder. This is HL's _Fill-and-Kill_ semantics - partial fills are allowed. The SDK's `FAK` value maps here. The SDK rejects `FOK` rather than mapping it to `Ioc`, since Fill-or-Kill (all-or-nothing) is materially different. (`src/adapter/hyperliquid/types.ts`: `HLOrderType`)

**l2Book** - An Info endpoint request (and WebSocket channel) that returns the Level 2 order book for a coin. Returns two arrays (bids and asks), each containing levels with price (`px`), size (`sz`), and order count (`n`). (`src/adapter/hyperliquid/types.ts`: `HLL2Book`, `HLL2Level`; `src/adapter/hyperliquid/client.ts`: `fetchL2Book`)

**outcomeMeta** - The primary Info endpoint request for HIP-4 prediction market metadata. Returns the full catalogue of outcomes and questions. This is the single source of truth for all prediction markets on Hyperliquid. (`src/adapter/hyperliquid/types.ts`: `HLOutcomeMeta`; `src/adapter/hyperliquid/client.ts`: `fetchOutcomeMeta`)

**spotClearinghouseState** - A user's spot token balances fetched from the Info endpoint. HIP-4 prediction market positions (outcome tokens, USDH) are stored here as spot balances, not in the perps clearinghouse. Each balance has `coin`, `token` (numeric ID), `hold`, `total`, and `entryNtl` (entry notional). (`src/adapter/hyperliquid/types.ts`: `HLSpotClearinghouseState`; `src/adapter/hyperliquid/client.ts`: `fetchSpotClearinghouseState`)

**userFills** - An Info endpoint request that returns all trade fills for a user. Each fill includes `coin`, `px`, `sz`, `side` (B/A), `time`, `startPosition`, `dir`, `closedPnl`, `hash`, `oid`, `crossed`, `fee`, `tid`, and `feeToken`. (`src/adapter/hyperliquid/types.ts`: `HLFill`; `src/adapter/hyperliquid/client.ts`: `fetchUserFills`)

**userFillsByTime** - A time-range-filtered variant of `userFills`. Accepts `startTime`, `endTime`, `aggregateByTime`, and `reversed` parameters. Used by the account adapter to fetch 30 days of activity. (`src/adapter/hyperliquid/client.ts`: `fetchUserFillsByTime`)

---

## HIP-4 Prediction Market Terms

**Asset ID formula** - The numeric identifier used in order wire format to target a specific side of an outcome. Computed as `100_000_000 + outcomeId * 10 + sideIndex`. For example, outcome 516 side 0 = `100_005_160`. (`src/adapter/hyperliquid/client.ts`: `sideAssetId`)

**Custom** - A category for prediction markets that are manually created (non-recurring). These are question-based events with explicit named outcomes and descriptions. (`src/adapter/hyperliquid/events.ts`: `CATEGORIES`)

**fallbackOutcome** - In a `HLQuestion`, the outcome ID that serves as the "other / none of the above" resolution. It is included alongside `namedOutcomes` when building the market list for an event. (`src/adapter/hyperliquid/types.ts`: `HLQuestion.fallbackOutcome`)

**isNegRisk** - An optional boolean on `PredictionMarket` indicating whether the market uses negative risk (multi-outcome) pricing where outcome probabilities need not sum to 1. (`src/types/event.ts`: `PredictionMarket.isNegRisk`)

**Outcome** - A prediction market instrument on Hyperliquid. Identified by a numeric `outcome` ID. Each outcome has a `name`, `description`, and an array of `sideSpecs` (typically two: Yes/No). Outcomes can be standalone or grouped under a Question. (`src/adapter/hyperliquid/types.ts`: `HLOutcome`)

**Outcome coin** - A coin prefixed with `@` followed by the outcome ID (e.g., `@1338`). Represents the outcome-level AMM-managed instrument. Used for price lookups but not directly for order placement. (`src/adapter/hyperliquid/client.ts`: `outcomeCoin`, `parseOutcomeCoin`)

**Question** - A grouping mechanism in HIP-4. A `HLQuestion` has a numeric `question` ID, `name`, `description`, `namedOutcomes` (array of outcome IDs), `fallbackOutcome`, and `settledNamedOutcomes`. Maps to a `PredictionEvent` in the SDK. (`src/adapter/hyperliquid/types.ts`: `HLQuestion`)

**priceBucket** - Recurring multi-bucket price markets. The parent question carries a `class:priceBucket|underlying:BTC|expiry:20260505-1700|priceThresholds:81015.3,81258.7|period:15m` description and each child outcome represents one bucket defined by adjacent thresholds. `N` thresholds → `N+1` buckets, plus a settlement fallback outcome. The `PriceBucketMarket` type adds `priceThresholds`, `period`, `bucketIndex`, `lowerBound`, `upperBound`, and `isFallback` fields. (`src/types/hip4-market.ts`: `PriceBucketMarket`; `src/adapter/hyperliquid/market-discovery.ts`: `parsePriceBucketDescription`; `src/adapter/hyperliquid/market-classification.ts`: `getPriceBucketBounds`)

**Recurring market** - An automatically generated prediction market (e.g., price binary options). Identified by `outcome.name === "Recurring"`. The description is a pipe-delimited key-value string like `class:priceBinary|underlying:BTC|expiry:20260311-0300|targetPrice:69070|period:1d`. Parsed by `parseRecurringDescription`. (`src/adapter/hyperliquid/events.ts`: `isRecurring`, `parseRecurringDescription`, `recurringTitle`)

**Resolution / Settlement** - The process of determining a prediction market outcome. In `HLQuestion`, resolved outcomes are tracked via `settledNamedOutcomes`. The SDK maps event status to `"active"` (has unsettled outcomes) or `"resolved"` (all settled). (`src/adapter/hyperliquid/events.ts`: `mapQuestionToEvent`)

**fetchSettledOutcome** - Events-adapter method that returns the full `HLSettledOutcome` for a resolved outcome (or `null` if not yet settled). Useful for surfacing winning side / payout details after settlement. (`src/adapter/hyperliquid/events.ts`: `fetchSettledOutcome`; `src/adapter/hyperliquid/types.ts`: `HLSettledOutcome`)

**Side** - One of two possible positions within an outcome (typically Yes = side 0, No = side 1). Each side trades as its own probability market in the 0-1 price range. (`src/adapter/hyperliquid/types.ts`: `HLSideSpec`)

**Side coin** - A coin prefixed with `#` followed by the outcome ID and side index (e.g., `#5160` for outcome 516 side 0, `#5161` for side 1). This is the tradeable instrument. All order book, price, and trade data uses side coins. (`src/adapter/hyperliquid/client.ts`: `sideCoin`, `parseSideCoin`)

**SideSpec** - The specification for one side of an outcome. Contains only a `name` field (e.g., "Yes", "No"). The array index determines the `sideIndex` (0 or 1). (`src/adapter/hyperliquid/types.ts`: `HLSideSpec`)

**Standalone outcome** - An outcome not claimed by any question. Becomes its own single-market `PredictionEvent` with ID `o<outcomeId>`. Common for recurring markets. (`src/adapter/hyperliquid/events.ts`: `mapStandaloneOutcomeToEvent`)

---

## SDK Architecture Terms

**Adapter** - The top-level interface (`PredictionsAdapter`) that defines the complete API surface for a prediction market backend. Composed of five sub-adapters (`events`, `marketData`, `account`, `trading`, `auth`) plus the `wallet` adapter for fund management. Has `initialize()` and `destroy()` lifecycle methods. (`src/adapter/types.ts`: `PredictionsAdapter`)

**createHIP4Adapter** - The factory function that instantiates a `HyperliquidHip4Adapter` with optional config (testnet, custom URLs, logger). This is the main entry point for consumers. (`src/adapter/factory.ts`: `createHIP4Adapter`)

**CreateHIP4AdapterConfig** - Configuration object for the adapter factory. Fields: `testnet` (boolean, defaults to true), `infoUrl` (custom Info endpoint), `exchangeUrl` (custom Exchange endpoint), `logger` (log function). (`src/adapter/factory.ts`: `CreateHIP4AdapterConfig`)

**HIP4Auth** - The authentication sub-adapter. Stores a wallet address and signer reference. Transitions through three states: `"disconnected"` -> `"pending_approval"` -> `"ready"`. Exposes `getSigner()` internally for the trading adapter. Does not validate that the signer address matches the wallet address, since agent wallets sign on behalf of users. (`src/adapter/hyperliquid/auth.ts`: `HIP4Auth`)

**HIP4Client** - The low-level HTTP client wrapping Hyperliquid's Info and Exchange REST APIs. Handles URL resolution (testnet vs mainnet), automatic retry on 5xx errors (single retry with 1-second delay), JSON parsing, and error typing. Also exposes the WebSocket URL. (`src/adapter/hyperliquid/client.ts`: `HIP4Client`)

**HIP4Signer interface** - The contract that consumers must implement to enable order signing. Requires `getAddress()` (returns wallet address) and `signTypedData(domain, types, value)` (produces EIP-712 signatures). Accepts both native `HLSignature` objects and hex strings as return values. Compatible with ethers Wallet, viem WalletClient, or any EIP-712-capable signer. (`src/adapter/hyperliquid/types.ts`: `HIP4Signer`)

**HIP4WalletAdapter** - The fund management sub-adapter. Handles USDH spot buy/sell (L1 agent signing), Perp↔Spot transfers, withdrawals, and USD sends (EIP-712 user signing). Uses two signers: the agent key from `HIP4Auth` for spot orders, and a user wallet set via `setSigner()` for EIP-712 operations. (`src/adapter/hyperliquid/wallet.ts`: `HIP4WalletAdapter`)

**HyperliquidHip4Adapter** - The concrete implementation of `PredictionsAdapter` for Hyperliquid HIP-4. Composes `HIP4EventAdapter`, `HIP4MarketDataAdapter`, `HIP4AccountAdapter`, `HIP4TradingAdapter`, `HIP4Auth`, and `HIP4WalletAdapter` around a shared `HIP4Client` instance. (`src/adapter/hyperliquid/index.ts`: `HyperliquidHip4Adapter`)

**PredictionsAdapterProvider** - A React context provider that makes a `PredictionsAdapter` instance available to all descendant components via `usePredictionsAdapter()`. Calls `adapter.initialize()` on mount and `adapter.destroy()` on unmount. Available in `@outcome.xyz/hip4-react`.

**SideNameResolver** - A function type `(outcomeId: number) => [string, string] | null` that resolves outcome IDs to their sideSpec names (e.g. `[\"Yes\", \"No\"]` or `[\"Hypurr\", \"Usain Bolt\"]`). Populated from `outcomeMeta` on first fetch and cached permanently. Shared across events, market-data, and account adapters. (`src/adapter/hyperliquid/events.ts`: `SideNameResolver`)

**Sub-adapter** - One of six domain-specific components that compose the full adapter: `PredictionEventAdapter` (event/category queries), `PredictionMarketDataAdapter` (order book, prices, trades, subscriptions), `PredictionAccountAdapter` (positions, activity, position subscriptions), `PredictionTradingAdapter` (place/cancel orders), `PredictionAuthAdapter` (wallet auth lifecycle), and `HIP4WalletAdapter` (fund management). (`src/adapter/types.ts`, `src/adapter/hyperliquid/wallet.ts`)

**Unsubscribe** - A function type `() => void` returned by all subscription methods. Calling it removes the callback and, if no subscriptions remain, closes the underlying WebSocket connection. (`src/adapter/types.ts`: `Unsubscribe`)

**usePredictionsAdapter** - A React hook that retrieves the `PredictionsAdapter` from context. Throws if called outside a `PredictionsAdapterProvider`. Available in `@outcome.xyz/hip4-react`.

---

## EIP-712 Signing

The SDK implements two EIP-712 signing flows. Both produce `HLSignature` objects (`{r, s, v}`) accepted by the Hyperliquid exchange.

### L1 Agent Signing (orders, cancels, USDH spot trades)

**AGENT_DOMAIN** - The EIP-712 domain for L1 agent signing. Fields: `name: "Exchange"`, `version: "1"`, `chainId: 1337`, `verifyingContract: 0x000...000`. (`src/adapter/hyperliquid/signing.ts`: `AGENT_DOMAIN`)

**AGENT_TYPES** - The EIP-712 type definition for the Agent message. Structure: `Agent` with fields `source` (string, `"a"` for mainnet, `"b"` for testnet) and `connectionId` (bytes32, the keccak-256 hash of the msgpack-encoded action). (`src/adapter/hyperliquid/signing.ts`: `AGENT_TYPES`)

**signL1Action** - Signs an exchange action using L1 agent signing: msgpack-encode, append nonce + vault marker, keccak-256 hash, then EIP-712 sign with the Agent type on the phantom domain. Used for orders, cancels, and USDH spot trades. (`src/adapter/hyperliquid/signing.ts`: `signL1Action`)

### User-Signed EIP-712 (transfers, withdrawals, sends)

**signUserSignedAction** - Signs an exchange action using EIP-712 on the `HyperliquidSignTransaction` domain. The action must include `signatureChainId` (always `0x66eee` / 421614). The message is filtered to only include keys defined in the EIP-712 types for wallet compatibility. Invalid `signatureChainId` values are rejected. (`src/adapter/hyperliquid/signing.ts`: `signUserSignedAction`)

**WITHDRAW_TYPES** - EIP-712 types for the `withdraw3` action. Primary type `HyperliquidTransaction:Withdraw` with fields: `hyperliquidChain`, `destination`, `amount`, `time`. (`src/adapter/hyperliquid/signing.ts`: `WITHDRAW_TYPES`)

**USD_CLASS_TRANSFER_TYPES** - EIP-712 types for the `usdClassTransfer` action. Primary type `HyperliquidTransaction:UsdClassTransfer` with fields: `hyperliquidChain`, `amount`, `toPerp`, `nonce`. (`src/adapter/hyperliquid/signing.ts`: `USD_CLASS_TRANSFER_TYPES`)

**USD_SEND_TYPES** - EIP-712 types for the `usdSend` action. Primary type `HyperliquidTransaction:UsdSend` with fields: `hyperliquidChain`, `destination`, `amount`, `time`. (`src/adapter/hyperliquid/signing.ts`: `USD_SEND_TYPES`)

### Shared

**HLSignature** - The signature format Hyperliquid expects: an object with `r` (hex string), `s` (hex string), and `v` (number, 27 or 28). All exchange requests include this. (`src/adapter/hyperliquid/types.ts`: `HLSignature`)

**normalizeSignature** - Accepts either an `HLSignature` object or a hex string and returns a normalized `HLSignature`. If a string is passed, delegates to `splitHexSignature`. Used after every `signTypedData` call to handle both signer output formats. (`src/adapter/hyperliquid/types.ts`: `normalizeSignature`)

**splitHexSignature** - Converts a viem-style hex signature string (`0x` + 32 bytes r + 32 bytes s + 1 byte v, total 65 bytes) into the `{r, s, v}` format Hyperliquid expects. (`src/adapter/hyperliquid/types.ts`: `splitHexSignature`)

---

## Trading Terms

**Market order pricing** - Market orders use `FrontendMarket` TIF with extreme prices (`0.99999` for buys, `0.00001` for sells) to ensure fill. The exchange handles best-execution via the FrontendMarket mechanism. (`src/adapter/hyperliquid/trading.ts`: `placeOrder`)

**FOK (Fill or Kill)** - The all-or-nothing time-in-force type. Hyperliquid does not support true FOK - its `Ioc` is _Fill-and-Kill_ (allows partial fills). The SDK rejects `FOK` explicitly rather than silently mapping it to `Ioc`, so callers don't unknowingly receive partial-fill behavior. Use `FAK` for IoC semantics or `GTC` for resting orders. (`src/adapter/hyperliquid/trading.ts`: `mapTif`)

**FAK (Fill and Kill)** - HL's actual `Ioc` semantics: fill what's available immediately, cancel the rest. Maps to `{ limit: { tif: "Ioc" } }`. (`src/adapter/hyperliquid/trading.ts`: `mapTif`)

**formatPrice** - Formats a numeric price to Hyperliquid's magnitude-based decimal precision. Rules: >= 1000 rounds to integer, >= 10 uses 1 decimal, >= 1 uses 2 decimals, < 1 uses 4 decimals. Trailing zeros are stripped. Prediction market prices (always < $1) get 4 decimal places. (`src/adapter/hyperliquid/trading.ts`: `formatPrice`)

**GTC (Good Til Cancelled)** - Default time-in-force for limit orders. The order remains on the book until explicitly filled or cancelled. Maps to `{ limit: { tif: "Gtc" } }`. (`src/adapter/hyperliquid/trading.ts`: `mapTif`)

**GTD (Good Til Date)** - A time-in-force type where the order expires at a specified time. In the SDK, GTD currently maps to GTC behavior (the expiration is accepted in `PredictionOrderParams` but not wired through to the HL order wire). (`src/types/trading.ts`: `PredictionOrderParams.expiration`)

**HLCancelAction** - The wire format for cancel requests. Contains `type: "cancel"` and a `cancels` array of `{ a: assetId, o: orderId }` tuples. (`src/adapter/hyperliquid/types.ts`: `HLCancelAction`)

**HLOrderAction** - The wire format for order placement requests. Contains `type: "order"`, `grouping: "na"` (no grouping), and an `orders` array of `HLOrderWire` objects. (`src/adapter/hyperliquid/types.ts`: `HLOrderAction`)

**HLOrderWire** - The individual order in wire format. Fields: `a` (asset index / ID), `b` (boolean, true = buy), `p` (price string), `s` (size string), `r` (reduce-only boolean), `t` (order type with TIF), optional `c` (client order ID). (`src/adapter/hyperliquid/types.ts`: `HLOrderWire`)

**IOC (Immediate or Cancel)** - A time-in-force type where the order fills immediately against existing liquidity and any unfilled remainder is cancelled. Maps to `{ limit: { tif: "Ioc" } }`. Also the target for FOK and FAK mappings. (`src/adapter/hyperliquid/trading.ts`: `mapTif`)

**Limit order** - An order placed at a specific price. The provided price is formatted via `formatPrice` and sent with the specified TIF (default GTC). (`src/adapter/hyperliquid/trading.ts`: `placeOrder`)

**Market order** - An order that executes immediately at the best available price. The SDK uses `FrontendMarket` TIF with extreme prices (`0.99999` for buys, `0.00001` for sells), delegating best-execution to the exchange. (`src/adapter/hyperliquid/trading.ts`: `placeOrder`)

**Nonce** - A monotonically increasing number included in every exchange request to prevent replay attacks. The SDK uses `Date.now()` (current timestamp in milliseconds) as the nonce. (`src/adapter/hyperliquid/trading.ts`: `placeOrder`, `cancelOrder`)

**Order status: error** - Returned when the exchange rejects an order. Contains an `error` string describing the rejection reason. (`src/adapter/hyperliquid/types.ts`: `HLOrderStatus`)

**Order status: filled** - Returned when an order is fully or partially matched immediately. Contains `totalSz` (filled size), `avgPx` (average fill price), and `oid` (order ID). (`src/adapter/hyperliquid/types.ts`: `HLOrderStatus`)

**Order status: resting** - Returned when a limit order is placed on the book without immediate fills. Contains `oid` (order ID). The order remains active until filled or cancelled. (`src/adapter/hyperliquid/types.ts`: `HLOrderStatus`)

**resolveAssetId** - Converts a `marketId` + `outcome` string pair into a numeric HL asset ID. Resolution order: (1) explicit `#<id><side>` format, (2) trailing digit regex inference, (3) fallback to side 0. (`src/adapter/hyperliquid/trading.ts`: `resolveAssetId`)

**Time-in-Force (TIF)** - Controls how long an order remains active. SDK supports: `GTC` (Good Til Cancelled), `GTD` (Good Til Date, treated as GTC), `FAK` (Fill and Kill, mapped to `Ioc`). `FOK` is rejected (see FOK glossary entry). Market orders use `FrontendMarket`. USDH spot orders use `Ioc`. (`src/types/trading.ts`: `PredictionOrderParams.timeInForce`; `src/adapter/hyperliquid/trading.ts`: `mapTif`)

**placeOrders** - Batch order placement. Takes `PredictionOrderParams[]` and submits a single signed action carrying every wire. Each entry is validated independently - failures are reported in the result without affecting the rest. Returns `PredictionBatchOrderResult`. Never throws. (`src/adapter/hyperliquid/trading.ts`: `placeOrders`)

**modifyOrder** - Modifies a resting order's price and/or size. When only the size changes, HL preserves queue priority. Returns the same shape as `placeOrder`, with the (possibly new) `orderId`. (`src/adapter/hyperliquid/trading.ts`: `modifyOrder`)

**cancelOrder** - Takes `PredictionCancelParams[]` (an array) and returns `HLCancelResponse` with per-cancel statuses. Pass each entry's `outcome` to target a specific side; otherwise side 0 is used. (`src/adapter/hyperliquid/trading.ts`: `cancelOrder`)

**scheduleCancel / Dead-man's switch** - Registers a future Unix-millisecond timestamp at which Hyperliquid cancels every open order from the signing agent. Per-agent (a new schedule replaces the previous), not per-order. Pass `null` to clear an existing schedule. Common pattern: arm ~1h before a HIP-4 market's settlement so resting limits aren't picked off in the auction. (`src/adapter/hyperliquid/trading.ts`: `scheduleCancel`; `src/adapter/hyperliquid/types.ts`: `HLScheduleCancelAction`)

**userOutcome actions** - L1-signed share-conversion actions on the `userOutcome` envelope. The SDK exposes four variants: `splitOutcome` (X quote → X Yes + X No of one outcome), `mergeOutcome` (paired Yes+No → X quote), `mergeQuestion` (X Yes from every outcome of a question → X quote), and `negateOutcome` (X No of one outcome → X Yes of every other outcome under the same question). Affect spot balances directly with no order book interaction. (`src/adapter/hyperliquid/trading.ts`; `src/adapter/hyperliquid/types.ts`: `HLUserOutcomeAction`)

**Builder fee / Builder address** - A referral mechanism on Hyperliquid orders. The `builder` field on an `HLOrderAction` tags the order with a builder address (lowercased before signing) and a fee in tenths of a basis point (`0–1000`, where `100` = 0.1%). Adapter-level config (`createHIP4Adapter({ builderAddress, builderFee })`) sets defaults, and per-order overrides are supported. The builder field is attached whenever a `builderAddress` is set, even if `fee` is `0`. Builders must be approved separately via `submitBuilderFeeApproval` before fees can be collected. (`src/adapter/factory.ts`: `CreateHIP4AdapterConfig`; `src/adapter/hyperliquid/trading.ts`: builder field assembly; `src/adapter/hyperliquid/agent-wallet.ts`: `submitBuilderFeeApproval`)

---

## Data Terms

**PredictionActivity** - A record of user activity on prediction markets. Fields: `id`, `type` (one of `"trade"`, `"redeem"`, `"deposit"`, `"withdrawal"`), optional `marketId`, `outcome`, `side`, `price`, `size`, `amount`, and `timestamp`. Mapped from `HLFill` records filtered to outcome coins. (`src/types/account.ts`: `PredictionActivity`)

**PredictionAuthState** - The current authentication state. Has `status` (`"disconnected"`, `"pending_approval"`, or `"ready"`), optional `address`, and optional `apiKey`. (`src/types/account.ts`: `PredictionAuthState`)

**PredictionCancelParams** - Parameters for cancelling an order: `marketId`, `orderId`, and optional `outcome` (used to resolve the correct side asset ID; if omitted, falls back to side 0). (`src/types/trading.ts`: `PredictionCancelParams`)

**PredictionCategory** - A classification for prediction events. Fields: `id`, `name`, `slug`. The SDK defines two built-in categories: `"custom"` and `"recurring"`. (`src/types/event.ts`: `PredictionCategory`)

**PredictionEvent** - The top-level entity grouping one or more prediction markets. Fields: `id` (prefixed `q<questionId>` for question-based or `o<outcomeId>` for standalone), `title`, `description`, `category`, `markets` array, `totalVolume`, `endDate`, `status`, optional `imageUrl` and `resolutionSource`. (`src/types/event.ts`: `PredictionEvent`)

**PredictionEventStatus** - The lifecycle state of a prediction event. One of: `"active"` (trading open), `"pending_resolution"` (awaiting settlement), `"resolved"` (outcome determined), `"cancelled"`. (`src/types/event.ts`: `PredictionEventStatus`)

**PredictionMarket** - A single question within an event, containing tradeable outcomes. Fields: `id` (outcome ID as string), `eventId`, `question`, `outcomes` array, `volume`, `liquidity`, optional `isNegRisk`. Maps from an `HLOutcome`. (`src/types/event.ts`: `PredictionMarket`)

**PredictionOrderBook** - The current order book for a market. Fields: `marketId`, `bids` (array of `PredictionOrderBookLevel`), `asks` (array of `PredictionOrderBookLevel`), `timestamp`. (`src/types/market.ts`: `PredictionOrderBook`)

**PredictionOrderBookLevel** - A single price level in the order book. Fields: `price` (string) and `size` (string). Mapped from HL's `{ px, sz, n }` format (order count `n` is dropped). (`src/types/market.ts`: `PredictionOrderBookLevel`)

**PredictionOrderParams** - Parameters for placing an order. Fields: `marketId`, `outcome`, `side` (`"buy"` or `"sell"`), `type` (`"market"` or `"limit"`), optional `price` (required for limit), `amount`, optional `timeInForce`, optional `expiration`. (`src/types/trading.ts`: `PredictionOrderParams`)

**PredictionOrderResult** - The result of an order placement. Fields: `success` (boolean), optional `orderId`, `status`, `shares` (filled size), `error`. (`src/types/trading.ts`: `PredictionOrderResult`)

**PredictionOutcome** - One tradeable side of a prediction market. Fields: `name` (e.g., "Yes", "No"), `tokenId` (side coin like `#5160`), `price` (current mid price). Mapped from `HLSideSpec`. (`src/types/event.ts`: `PredictionOutcome`)

**PredictionPosition** - A user's position in a prediction market. Fields: `marketId`, `eventTitle`, `marketQuestion`, `outcome` (coin ID like `#90`), `outcomeName` (resolved sideSpec name like "Hypurr"), `shares`, `avgCost` (entry notional / total shares), `currentPrice`, `unrealizedPnl`, `potentialPayout`, `eventStatus`. Derived from spot balances filtered to outcome coins. (`src/types/account.ts`: `PredictionPosition`)

**PredictionPrice** - Real-time price data for a market's outcomes. Fields: `marketId`, `outcomes` (array of `{ name, price, midpoint }`), `timestamp`. Both sides are included (Side 0 and Side 1). (`src/types/market.ts`: `PredictionPrice`)

**PredictionTrade** - A single executed trade. Fields: `id` (from `tid`), `marketId`, `outcome` (coin name), `side` (`"buy"` or `"sell"`, mapped from B/A), `price`, `size`, `timestamp`. (`src/types/market.ts`: `PredictionTrade`)

---

## Infrastructure Terms

**Agent wallet** - An ephemeral keypair that signs on behalf of a user's main wallet. In the Hyperliquid ecosystem, agents are authorized via an `ApproveAgent` action. The SDK's `HIP4Auth` intentionally does not validate that the signer address matches the wallet address, because agent wallets have different addresses by design. (`src/adapter/hyperliquid/auth.ts`: comment in `initAuth`)

**Cache TTL** - Time-to-live for cached data. Events/outcomeMeta are cached for 30 seconds (`CACHE_TTL_MS = 30_000` in `HIP4EventAdapter`). allMids prices are cached for 5 seconds (`MIDS_CACHE_TTL = 5_000` in `HIP4MarketDataAdapter`). (`src/adapter/hyperliquid/events.ts`: `CACHE_TTL_MS`; `src/adapter/hyperliquid/market-data.ts`: `MIDS_CACHE_TTL`)

**Exponential backoff reconnection** - The WebSocket reconnection strategy. On disconnect, the adapter waits `min(1000 * 2^attempt, 30000)` ms before reconnecting. Maximum 10 attempts (`MAX_RECONNECT_ATTEMPTS`). The counter resets on successful connection. All active subscriptions are automatically restored after reconnection. (`src/adapter/hyperliquid/market-data.ts`: `ensureWs` onclose handler)

**HLApiError** - A typed error class extending `Error` with an HTTP `status` code. Thrown by the client on non-OK responses. The status code is used for retry decisions: 4xx errors are not retried, 5xx and network errors trigger a single retry with 1-second delay. (`src/adapter/hyperliquid/client.ts`: `HLApiError`)

**Logger injection** - An optional logging function passed via `CreateHIP4AdapterConfig.logger`. Signature: `(level: "debug" | "info" | "warn" | "error", msg: string, data?: unknown) => void`. Defaults to a no-op. Used throughout the client and trading adapter for debugging order placement, WebSocket reconnection, and API errors. (`src/adapter/hyperliquid/client.ts`: `HIP4ClientConfig.logger`)

**Polling (position updates)** - The account adapter uses polling (`POLL_INTERVAL_MS = 10_000`, i.e., 10 seconds) for position subscriptions rather than WebSocket, since spot balance updates are not available via HL's WebSocket channels. (`src/adapter/hyperliquid/account.ts`: `subscribePositions`)

**Ref counting** - The WebSocket pool tracks the number of active subscriptions via `refCount`. When a subscription is removed and `refCount` drops to zero, the WebSocket connection is closed. This prevents idle connections from consuming resources. (`src/adapter/hyperliquid/market-data.ts`: `WsPoolEntry.refCount`)

**Subscription routing** - The shared `HIP4Client.subscribe` registers callbacks by `responseChannel` (defaults to the subscription `type`, e.g. `"l2Book"`, `"trades"`, `"allMids"`). HL responses arrive on the bare channel name; per-coin filtering is done in the `HIP4MarketDataAdapter` by inspecting `data.coin` (or `data[].coin` for array payloads like trades) before invoking each subscriber's callback. Subscribers passing `"*"` for the coin filter receive every message on that channel (used by `subscribeAllMids`). (`src/adapter/hyperliquid/client.ts`: `subscribe`, `ensureWs` onmessage handler; `src/adapter/hyperliquid/market-data.ts`: `subscribeWs`)

**Throttling (hook updates)** - The React hooks in `@outcome.xyz/hip4-react` (`usePredictionPrice`, `usePredictionBook`, `usePredictionPositions`) throttle state updates to a minimum interval of 200ms. Rapid updates within this window are coalesced via `setTimeout`, ensuring the last value is always delivered.

**WebSocket pool** - A shared single-connection pool managed by `HIP4MarketDataAdapter`. All subscriptions (l2Book, allMids, trades) share one WebSocket connection. The pool entry stores the `WebSocket` instance, a `subscriptions` map, and a `refCount`. On disconnect, the pool attempts reconnection with exponential backoff and restores all subscriptions. (`src/adapter/hyperliquid/market-data.ts`: `WsPoolEntry`, `ensureWs`)

---

## React Hooks

React hooks and the context provider are available in `@outcome.xyz/hip4-react`:

**useEvents**, **useEventDetail**, **usePredictionBook**, **usePredictionPrice**, **usePredictionPositions**, **PredictionsAdapterProvider**, **usePredictionsAdapter**

See [@outcome.xyz/hip4-react](https://github.com/Outcome-xyz/hip4-react) for documentation.

---

## Streams

**createPriceFeed** - Drop-in price feed for a HIP-4 outcome side. Builds a rolling candle history from `fetchCandles`, then keeps the trailing candle current via `subscribePrice`. Each snapshot includes the candle array, current mid, and a `ready` flag. Returns an `Unsubscribe`. Signature: `(marketData, marketId, onSnapshot, opts?)`. (`src/streams/price-feed.ts`)

**createPerpPriceFeed** - Same shape as `createPriceFeed` but targets an HL perp coin. Uses `HIP4Client` directly, mixing `fetchCandleSnapshot` with WS candle and active-asset-ctx subscriptions for low-latency mid updates. (`src/streams/perp-price-feed.ts`)

**PriceFeedCandle** - Normalized OHLCV candle: `{ time, open, high, low, close, volume }`. Time is in seconds. (`src/streams/candle-utils.ts`)

**processTick / candleBoundaryMs / intervalToMs** - Lower-level candle aggregation utilities. `processTick` folds a single tick into the current candle, opening a new candle when the tick crosses a boundary. (`src/streams/candle-utils.ts`)

---

## USDH Ramp (mainnet only)

**PredictionRampAdapter** - The fiat ↔ USDH ramp adapter. Buy flow: fiat → Coinbase onramp → USDC (Arbitrum) → Across counterfactual deposit address → USDH (HyperCore). Sell flow: USDH (HyperEVM) → Across swap → USDC (Arbitrum) → Coinbase offramp → fiat. Mainnet only - throws on testnet. (`src/types/ramp.ts`: `PredictionRampAdapter`; `src/adapter/hyperliquid/ramp.ts`)

**Counterfactual deposit address** - A deterministic Arbitrum address generated by Across for a specific Buy quote. The user sends USDC to this address, Across detects the deposit and atomically delivers USDH on HyperCore to the recipient. The address embeds the routing parameters; no on-chain pre-registration is needed. (`src/types/ramp.ts`: `DepositAddressResult`; `src/adapter/hyperliquid/ramp.ts`: `generateDepositAddress`)

**Core ↔ EVM bridging helpers** - HyperCore and HyperEVM share an asset namespace; the SDK exposes the conversion math: `deriveCoreEvmSystemAddress(tokenIndex)` returns the deterministic system address that bridges a given Core token to/from EVM. `estimateCoreToEvmFee` and `medianBaseFeeWei` give realistic gas estimates for the bridge. (`src/adapter/hyperliquid/core-evm-system-address.ts`, `core-to-evm-fees.ts`)

**HYPE spot mark-px helpers** - Selecting the live HYPE/USDC mark price across testnet/mainnet spot pairs. `findHypeUsdcSpotPairCoin` resolves the right `@<spotIndex>` coin; `selectHypeSpotMarkPx` picks the mark from a `spotMetaAndAssetCtxs` payload. (`src/adapter/hyperliquid/hype-spot-mark-px.ts`)

---

## Decimal arithmetic

**Inline `Decimal` class** - Self-contained arbitrary-precision decimal arithmetic backed by a BigInt mantissa + integer exponent. Mirrors decimal.js semantics for the methods this SDK uses (arithmetic, comparison, predicates, rounding HALF_UP/DOWN, `toFixed`, `toString` plain + exponential at decimal.js's default thresholds, `toSignificantDigits`, `toNumber`, `min`/`max`/`sum`). Verified against decimal.js by [`tests/unit/decimal-parity.test.ts`](../tests/unit/decimal-parity.test.ts) (54 tests, ~10k randomized inputs). (`src/lib/precision/primitives/_decimal-impl.ts`, `src/lib/precision/primitives/core.ts`)

**floorLog10** - Internal helper that returns `floor(log10(|value|))` as an integer Decimal directly from the mantissa's digit count + exponent - no transcendentals required. (`src/lib/precision/primitives/_decimal-impl.ts`: `Decimal.floorLog10`)

---

## Wallet & USDH Terms

**USDH** - The collateral token for HIP-4 prediction markets on Hyperliquid. Traded as a spot token (not a HIP-4 outcome) on the USDH/USDC pair. Spot market index 1338, asset ID 11338 (`10000 + 1338`), spot pair name `@1338`. (`src/adapter/hyperliquid/wallet.ts`: `USDH_SPOT_INDEX`, `USDH_ASSET_ID`, `USDH_SPOT_PAIR`)

**Deposit flow** - The multi-step process for funding HIP-4 prediction trading: (1) bridge USDC to HL perps (external), (2) `transferToSpot` (user-signed `usdClassTransfer`), (3) `buyUsdh` (L1 agent-signed spot order). Steps 2 and 3 are handled by `HIP4WalletAdapter`.

**Withdraw flow** - The multi-step process for withdrawing from HIP-4: (1) `sellUsdh` (L1 agent-signed spot order), (2) `transferToPerps` (user-signed `usdClassTransfer`), (3) `withdraw` (user-signed `withdraw3`). All steps handled by `HIP4WalletAdapter`.

**Oracle price** - The mark/reference price for a spot asset, fetched from `spotMetaAndAssetCtxs`. Hyperliquid rejects orders priced more than ~20% from the oracle. The wallet adapter prices USDH spot orders at oracle ± 10% to stay within this limit. (`src/adapter/hyperliquid/client.ts`: `fetchSpotAssetCtx`)

**Spot asset ID** - The numeric asset ID for spot token orders: `10000 + spotMeta.universe[].index`. Different from HIP-4 outcome asset IDs (`100_000_000 + outcomeId * 10 + sideIndex`). USDH uses asset ID 11338. (`src/adapter/hyperliquid/wallet.ts`: `USDH_ASSET_ID`)

**WalletActionResult** - The result type for all wallet operations. Fields: `success` (boolean), optional `error` (string), optional `filledSz` and `avgPx` (spot orders only). (`src/adapter/hyperliquid/wallet.ts`: `WalletActionResult`)

---

## Coin Name Conventions

| Format                    | Example          | Meaning                                 | Used For                    |
| ------------------------- | ---------------- | --------------------------------------- | --------------------------- |
| `@<outcomeId>`            | `@1338`          | Outcome-level coin / spot pair name     | Price lookups, spot pair ID |
| `#<outcomeId><sideIndex>` | `#5160`, `#5161` | Per-side probability coin               | Order books, trading, fills |
| `B` / `A`                 | -                | Buy / Ask (sell) side in HL wire format | Raw trade/order data        |
| `"buy"` / `"sell"`        | -                | Normalized side in SDK types            | All public SDK interfaces   |

**Asset ID formulas:**

- HIP-4 outcomes: `100_000_000 + outcomeId * 10 + sideIndex`
- Spot tokens: `10_000 + spotMeta.universe[].index`

Helper functions: `outcomeCoin`, `sideCoin`, `parseSideCoin`, `parseOutcomeCoin`, `coinOutcomeId`, `isOutcomeCoin` - all in `src/adapter/hyperliquid/client.ts`.
