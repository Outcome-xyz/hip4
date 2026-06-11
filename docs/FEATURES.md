# @outcome.xyz/hip4 - Exhaustive Feature Reference

> Generated from source code at `src/`. Every method, type, constant, and helper documented.

---

## Table of Contents

1. [SDK Overview](#1-sdk-overview)
2. [Configuration](#2-configuration)
3. [Client Layer](#3-client-layer)
4. [Coin Naming](#4-coin-naming)
5. [Events Adapter](#5-events-adapter)
6. [Market Data Adapter](#6-market-data-adapter)
7. [Account Adapter](#7-account-adapter)
8. [Trading Adapter](#8-trading-adapter)
9. [Auth Adapter](#9-auth-adapter)
10. [Type System](#10-type-system)
11. [React Bindings](#11-react-bindings)
12. [Implementation Notes](#12-implementation-notes)
13. [Known Limitations](#13-known-limitations)
14. [Integration Examples](#14-integration-examples)

---

## 1. SDK Overview

| Field                    | Value                                                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Package name**         | `@outcome.xyz/hip4`                                                                                                                                                                                                                                                                               |
| **Version**              | `1.0.1-beta`                                                                                                                                                                                                                                                                                      |
| **License**              | BSL 1.1 (Business Source License) - converts to MIT on 2028-04-01. Production use requires a commercial license from Dennis Furrer (get@rekt.fi). Evaluation, testing, non-production development, academic use, and personal non-commercial projects are permitted without a separate agreement. |
| **Author**               | Dennis Furrer                                                                                                                                                                                                                                                                                     |
| **Runtime dependencies** | Zero. The package has no `dependencies` at all.                                                                                                                                                                                                                                                   |
| **Peer dependencies**    | None. React bindings are in `@outcome.xyz/hip4-react`.                                                                                                                                                                                                                                            |
| **Dev dependencies**     | `tsup`, `typescript`, `vitest`                                                                                                                                                                                                                                                                    |
| **Build tool**           | tsup                                                                                                                                                                                                                                                                                              |
| **Distribution**         | ESM (`.js`) + CJS (`.cjs`) + TypeScript declarations (`.d.ts` / `.d.cts`) with sourcemaps. Code-splitting and tree-shaking are enabled.                                                                                                                                                           |

### Entry Points

| Import path               | Resolves to          | Contents                   |
| ------------------------- | -------------------- | -------------------------- |
| `@outcome.xyz/hip4`       | `src/index.ts`       | Adapter, types, wallet     |
| `@outcome.xyz/hip4/types` | `src/types/index.ts` | Pure type definitions only |

### Architecture

```
createHIP4Adapter(config)
  └─ HyperliquidHip4Adapter          (implements PredictionsAdapter)
       ├─ HIP4Client                  (HTTP + WS transport)
       ├─ HIP4EventAdapter            (events, side name resolver, settled outcomes)
       ├─ HIP4MarketDataAdapter       (market data, WS subscriptions)
       ├─ HIP4AccountAdapter          (positions, activity)
       ├─ HIP4TradingAdapter          (orders, cancels, modify, scheduleCancel,
       │                                userOutcome conversions - L1 agent signing)
       ├─ HIP4Auth                    (auth lifecycle)
       └─ HIP4WalletAdapter           (USDH buy/sell, transfers, withdrawals,
                                        spotSend, sendToEvm)

Standalone modules (importable from "@outcome.xyz/hip4"):
  ├─ src/streams/*                    (createPriceFeed, createPerpPriceFeed,
  │                                    candle aggregation utilities)
  ├─ src/utils/orderbook.ts           (computeTradeCost, computeEstimatedCost,
  │                                    computePotentialReturn)
  ├─ src/adapter/hyperliquid/ramp.ts  (USDH on/off-ramp via Coinbase + Across,
  │                                    mainnet only)
  └─ src/lib/precision/*              (inline BigInt-backed Decimal class -
                                       zero runtime deps replacement for decimal.js)
```

The factory creates a `HyperliquidHip4Adapter` which composes six sub-adapters around a shared `HIP4Client`. The client handles all HTTP transport (info + exchange endpoints) and exposes the WebSocket URL. Each sub-adapter maps raw Hyperliquid responses to the SDK's normalized types. Side names from `outcomeMeta.sideSpecs` are cached permanently and shared across events, market-data, and account adapters via a resolver function.

### Public Exports

The package exposes ~70 named runtime exports plus their type counterparts. Highlights:

| Category                 | Examples                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factory + config         | `createHIP4Adapter`, `CreateHIP4AdapterConfig`                                                                                                                                                                                                                                                                                                        |
| Adapter interfaces       | `PredictionsAdapter`, `PredictionEventAdapter`, `PredictionMarketDataAdapter`, `PredictionAccountAdapter`, `PredictionTradingAdapter`, `PredictionAuthAdapter`, `PredictionWalletAdapter`, `Unsubscribe`, `WalletActionResult`                                                                                                                        |
| Concrete classes         | `HIP4Client`, `HIP4EventAdapter`, `HIP4TradingAdapter`, `HIP4WalletAdapter`, `HyperliquidHip4Adapter`, `HLApiError`                                                                                                                                                                                                                                   |
| Market types             | `HIP4Market`, `DefaultBinaryMarket`, `LabelledBinaryMarket`, `MultiOutcomeMarket`, `PriceBucketMarket`, `MarketType`, `MarketSide`, `FetchMarketsParams`, `MarketsByType`, `MarketsByQuestion`                                                                                                                                                        |
| Pricing + classification | `computeTickSize`, `roundToTick`, `formatPrice`, `formatPredictionPrice`, `stripZeros`, `getMinShares`, `MIN_NOTIONAL`, `classifyOutcome`, `classifyAllOutcomes`, `buildQuestionIndex`, `getPriceBucketBounds`, `parseDescription`, `parsePriceBucketDescription`, `discoverPriceBinaryMarkets`, `formatMarketLabel`, `timeToExpiry`, `periodMinutes` |
| Coin helpers             | `outcomeCoin`, `sideCoin`, `sideAssetId`, `parseSideCoin`, `parseOutcomeCoin`                                                                                                                                                                                                                                                                         |
| Signing                  | `splitHexSignature`, `normalizeSignature`, `getAgentApprovalTypedData`, `submitAgentApproval`, `getBuilderFeeApprovalTypedData`, `submitBuilderFeeApproval`, `isUsdClassTransferRequired`, `HIP4Signer`, `HLSignature`                                                                                                                                |
| Wallet constants         | `USDH_ASSET_ID`, `USDH_SPOT_PAIR`, plus mainnet/testnet variants: `USDH_ASSET_ID_MAINNET`, `USDH_ASSET_ID_TESTNET`, `USDH_TOKEN_INDEX_*`, `USDH_TOKEN_HASH_*`, `USDH_EVM_ADDRESS_*`, `USDH_HL_TOKEN_*`, `USDC_HL_TOKEN_*`, `USDH_CORE_DECIMALS`, `USDH_EVM_DECIMALS`, `ALL_DEXS`                                                                      |
| Core ↔ EVM bridging      | `deriveCoreEvmSystemAddress`, `HYPE_CORE_EVM_SYSTEM_ADDRESS`, `MAX_CORE_EVM_TOKEN_INDEX`, `CORE_TO_EVM_GAS_LIMIT`, `estimateCoreToEvmFee`, `medianBaseFeeWei`, `findHypeUsdcSpotPairCoin`, `selectHypeSpotMarkPx`, `HYPE_USDC_SPOT_PAIR_*`                                                                                                            |
| Streams                  | `createPriceFeed`, `createPerpPriceFeed`, `processTick`, `candleBoundaryMs`, `intervalToMs`, `PriceFeedSnapshot`, `PerpPriceFeedSnapshot`, `PriceFeedCandle`                                                                                                                                                                                          |
| Orderbook utils          | `computeTradeCost`, `computeEstimatedCost`, `computePotentialReturn`, `TradeCostResult`                                                                                                                                                                                                                                                               |
| Trading params           | `PredictionOrderParams`, `PredictionOrderResult`, `PredictionBatchOrderResult`, `PredictionCancelParams`, `PredictionModifyParams`, `SplitOutcomeParams`, `MergeOutcomeParams`, `MergeQuestionParams`, `NegateOutcomeParams`                                                                                                                          |
| Wallet params            | `UsdClassTransferParams`, `WithdrawParams`, `UsdSendParams`, `SpotSendParams`, `SendToEvmWithDataParams`                                                                                                                                                                                                                                              |
| HL action / WS types     | `HLOrderAction`, `HLCancelAction`, `HLCancelResponse`, `HLModifyAction`, `HLBatchModifyAction`, `HLScheduleCancelAction`, `HLUserOutcomeAction` (and its variants), `HLOutcome`, `HLOutcomeMeta`, `HLQuestion`, `HLSettledOutcome`, plus the full `HLWs*` family for typed subscriptions                                                              |

> The full export list lives at [src/index.ts](../src/index.ts) and [src/adapter/index.ts](../src/adapter/index.ts) - both barrels use named re-exports (no wildcards).

---

## 2. Configuration

### `CreateHIP4AdapterConfig`

Passed to `createHIP4Adapter()`.

| Field            | Type        | Default                  | Description                                                                                                |
| ---------------- | ----------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `testnet`        | `boolean?`  | `true`                   | Use testnet URLs if true, mainnet if false\*                                                               |
| `infoUrl`        | `string?`   | (derived from `testnet`) | Override the info API URL                                                                                  |
| `exchangeUrl`    | `string?`   | (derived from `testnet`) | Override the exchange API URL                                                                              |
| `builderAddress` | `string?`   | -                        | Builder address for fee collection. When set, all orders include this builder (lowercased before signing). |
| `builderFee`     | `number?`   | -                        | Builder fee in tenths of a basis point (`0–1000`). `100` = 0.1%. `1000` = 1.0% maximum.                    |
| `logger`         | `function?` | no-op                    | `(level: "debug" \| "info" \| "warn" \| "error", msg: string, data?: unknown) => void`.                    |

> `builderAddress` / `builderFee` are configured at the adapter level. They can also be passed per order on `placeOrder` to override the adapter-level values.

### `HIP4ClientConfig`

Internal config used by `HIP4Client`. Same shape as `CreateHIP4AdapterConfig`:

| Field         | Type       | Default                                        |
| ------------- | ---------- | ---------------------------------------------- |
| `testnet`     | `boolean?` | `true`                                         |
| `infoUrl`     | `string?`  | Testnet or mainnet URL based on `testnet` flag |
| `exchangeUrl` | `string?`  | Testnet or mainnet URL based on `testnet` flag |

### URL Constants

| Constant               | Value                                             |
| ---------------------- | ------------------------------------------------- |
| `MAINNET_INFO_URL`     | `https://api.hyperliquid.xyz/info`                |
| `MAINNET_EXCHANGE_URL` | `https://api.hyperliquid.xyz/exchange`            |
| `TESTNET_INFO_URL`     | `https://api-ui.hyperliquid-testnet.xyz/info`     |
| `TESTNET_EXCHANGE_URL` | `https://api-ui.hyperliquid-testnet.xyz/exchange` |
| `TESTNET_WS_URL`       | `wss://api-ui.hyperliquid-testnet.xyz/ws`         |
| `MAINNET_WS_URL`       | `wss://api.hyperliquid.xyz/ws`                    |

Note: The WebSocket URL is always derived from the `testnet` flag and cannot be overridden via config.

### `HyperliquidHip4Adapter` Initialization

The `testnet` flag defaults to `true` in the adapter constructor. The adapter name is set to:

- `"Hyperliquid HIP-4 (Testnet)"` when testnet is true
- `"Hyperliquid HIP-4"` when testnet is false

The `id` field is always `"hyperliquid"`.

`initialize()` calls `this.events.fetchCategories()` (which returns hardcoded categories, so this is a lightweight warmup). `destroy()` calls `this.auth.clearAuth()`.

---

## 3. Client Layer

### `HIP4Client`

Constructed with `HIP4ClientConfig`. Exposes four readonly properties:

| Property      | Type      | Description                         |
| ------------- | --------- | ----------------------------------- |
| `infoUrl`     | `string`  | Resolved info API endpoint          |
| `exchangeUrl` | `string`  | Resolved exchange API endpoint      |
| `wsUrl`       | `string`  | Resolved WebSocket endpoint         |
| `testnet`     | `boolean` | Whether this client targets testnet |

### Info Endpoint Methods

All info methods use `POST` to `this.infoUrl` with `Content-Type: application/json`.

#### `fetchOutcomeMeta(): Promise<HLOutcomeMeta>`

- **HL request body**: `{ type: "outcomeMeta" }`
- **Returns**: `HLOutcomeMeta` - contains `outcomes: HLOutcome[]` and `questions: HLQuestion[]`
- **Purpose**: Fetches the full metadata for all HIP-4 prediction outcomes and questions

#### `fetchL2Book(coin: string): Promise<HLL2Book>`

- **HL request body**: `{ type: "l2Book", coin }`
- **Returns**: `HLL2Book` - contains `coin`, `time`, and `levels` (bids/asks tuple)

#### `fetchRecentTrades(coin: string): Promise<HLTrade[]>`

- **HL request body**: `{ type: "recentTrades", coin }`
- **Returns**: Array of `HLTrade`

#### `fetchAllMids(): Promise<HLAllMids>`

- **HL request body**: `{ type: "allMids" }`
- **Returns**: `Record<string, string>` - mapping of coin name to midpoint price string

#### `fetchCandleSnapshot(coin: string, interval: string, startTime: number, endTime: number): Promise<HLCandle[]>`

- **HL request body**: `{ type: "candleSnapshot", req: { coin, interval, startTime, endTime } }`
- **Returns**: Array of `HLCandle`
- **Note**: Defined on the client but not currently used by any adapter.

#### `fetchClearinghouseState(user: string): Promise<HLClearinghouseState>`

- **HL request body**: `{ type: "clearinghouseState", user }`
- **Returns**: `HLClearinghouseState` - perps margin/position data
- **Note**: Defined on the client but not used by any adapter. HIP-4 positions use `spotClearinghouseState` instead.

#### `fetchUserFills(user: string): Promise<HLFill[]>`

- **HL request body**: `{ type: "userFills", user }`
- **Returns**: Array of `HLFill`
- **Note**: Defined on the client but not used by any adapter. `fetchUserFillsByTime` is used instead.

#### `fetchSpotClearinghouseState(user: string): Promise<HLSpotClearinghouseState>`

- **HL request body**: `{ type: "spotClearinghouseState", user }`
- **Returns**: `HLSpotClearinghouseState` - contains `balances` array with coin, token, hold, total, entryNtl
- **Purpose**: HIP-4 prediction market positions live in the spot clearinghouse as token balances

#### `fetchUserFillsByTime(user: string, startTime: number, endTime: number): Promise<HLFill[]>`

- **HL request body**: `{ type: "userFillsByTime", user, startTime, endTime, aggregateByTime: true, reversed: true }`
- **Returns**: Array of `HLFill`
- **Note**: Always sends `aggregateByTime: true` and `reversed: true` (newest first)

#### `fetchFrontendOpenOrders(user: string): Promise<HLFrontendOrder[]>`

- **HL request body**: `{ type: "frontendOpenOrders", user }`
- **Returns**: Array of `HLFrontendOrder`
- **Note**: Defined on the client but not currently used by any adapter.

### Exchange Endpoint Methods

All exchange methods use `POST` to `this.exchangeUrl` with `Content-Type: application/json`.

#### `placeOrder(action: HLOrderAction, nonce: number, signature: HLSignature, vaultAddress?: string | null): Promise<HLExchangeResponse>`

- **Request body**: `{ action, nonce, signature, vaultAddress }`
- **Returns**: `HLExchangeResponse`

#### `cancelOrder(action: HLCancelAction, nonce: number, signature: HLSignature, vaultAddress?: string | null): Promise<HLExchangeResponse>`

- **Request body**: `{ action, nonce, signature, vaultAddress }`
- **Returns**: `HLExchangeResponse`

### Internal Methods

#### `private infoPost<T>(body: Record<string, unknown>): Promise<T>`

Generic POST helper for the info endpoint. Throws on non-OK HTTP status with the message: `"HL info API responded with {status}: {statusText}"`.

#### `private exchangePost<T>(body: Record<string, unknown>): Promise<T>`

Generic POST helper for the exchange endpoint. Throws on non-OK HTTP status with the message: `"HL exchange API responded with {status}: {statusText}"`.

---

## 4. Coin Naming

HIP-4 uses two coin naming conventions:

- **`@<outcomeId>`** - Outcome-level instrument (AMM-managed)
- **`#<outcomeId><sideIndex>`** - Per-side probability market (0-1 range, what you trade)

### Helper Functions

All exported from `src/adapter/hyperliquid/client.ts`.

#### `outcomeCoin(outcomeId: number): string`

Returns `@{outcomeId}`.

```
outcomeCoin(1338)  // "@1338"
```

#### `sideCoin(outcomeId: number, sideIndex: number): string`

Returns `#{outcomeId}{sideIndex}`.

```
sideCoin(516, 0)  // "#5160"
sideCoin(516, 1)  // "#5161"
```

#### `sideAssetId(outcomeId: number, sideIndex: number): number`

Returns `100_000_000 + outcomeId * 10 + sideIndex`. Used for order placement.

```
sideAssetId(516, 0)  // 100005160
sideAssetId(516, 1)  // 100005161
```

#### `parseSideCoin(coin: string): { outcomeId: number; sideIndex: number } | null`

Parses a `#` prefixed coin. Returns null if invalid. The last character is the side index; everything between `#` and the last char is the outcome ID.

```
parseSideCoin("#5160")  // { outcomeId: 516, sideIndex: 0 }
parseSideCoin("#5161")  // { outcomeId: 516, sideIndex: 1 }
parseSideCoin("BTC")    // null
parseSideCoin("#")      // null (length < 2 after #)
```

#### `parseOutcomeCoin(coin: string): { outcomeId: number } | null`

Parses an `@` prefixed coin. Returns null if invalid.

```
parseOutcomeCoin("@1338")  // { outcomeId: 1338 }
parseOutcomeCoin("BTC")    // null
```

#### `coinOutcomeId(coin: string): number | null`

Extracts the outcome ID from either `@` or `#` coin format. Delegates to `parseSideCoin` or `parseOutcomeCoin` internally.

```
coinOutcomeId("#5160")   // 516
coinOutcomeId("@1338")   // 1338
coinOutcomeId("BTC")     // null
```

#### `isOutcomeCoin(coin: string): boolean`

Returns true if the coin starts with `@` or `#`.

```
isOutcomeCoin("#5160")   // true
isOutcomeCoin("@1338")   // true
isOutcomeCoin("USDC")    // false
```

---

## 5. Events Adapter

### `HIP4EventAdapter`

Implements `PredictionEventAdapter`. Constructed with a `HIP4Client` reference.

### Caching

- Cache TTL: **30 seconds** (`CACHE_TTL_MS = 30_000`)
- Cache structure: `{ events: PredictionEvent[]; timestamp: number } | null`
- The cache stores the fully mapped and price-enriched event list
- Cache is checked in `loadEvents()` - if within TTL, the cached list is returned without any API calls

### Methods

#### `fetchEvents(params?): Promise<PredictionEvent[]>`

Parameters (all optional):

| Param      | Type       | Default | Description                                                    |
| ---------- | ---------- | ------- | -------------------------------------------------------------- |
| `category` | `string?`  | -       | Filter by category. `"all"` is treated as no filter.           |
| `active`   | `boolean?` | -       | If true, filter to events with `status === "active"`           |
| `limit`    | `number?`  | `50`    | Max results to return                                          |
| `offset`   | `number?`  | `0`     | Pagination offset                                              |
| `query`    | `string?`  | -       | Case-insensitive search across event `title` and `description` |

Filtering order: category -> active -> query -> slice(offset, offset + limit).

Internally calls `loadEvents()` which fetches `outcomeMeta` and `allMids` in parallel, then runs `buildEventsFromMeta`.

#### `fetchEvent(eventId: string): Promise<PredictionEvent>`

Loads all events via `loadEvents()` and finds by ID. Throws `"HIP-4 event not found: {eventId}"` if not found.

#### `fetchCategories(): Promise<PredictionCategory[]>`

Returns a hardcoded array - no API call:

```ts
[
  { id: "custom", name: "Custom", slug: "custom" },
  { id: "recurring", name: "Recurring", slug: "recurring" },
];
```

### Event Mapping Logic

#### `buildEventsFromMeta(meta: HLOutcomeMeta): PredictionEvent[]`

1. Builds a `Map<number, HLOutcome>` from `meta.outcomes`
2. Iterates `meta.questions` - each question becomes a `PredictionEvent` via `mapQuestionToEvent`. All named outcomes + the fallback outcome are claimed.
3. Any `HLOutcome` not claimed by a question becomes a standalone event via `mapStandaloneOutcomeToEvent`.

#### `mapQuestionToEvent(question, outcomeMap): PredictionEvent`

- Event ID: `"q{question.question}"` (e.g., `"q5"`)
- Title: `question.name`
- Description: `question.description`
- Category: `"custom"`
- Markets: each outcome (named + fallback) becomes a `PredictionMarket`
- Status: `"resolved"` if all named outcomes are in `settledNamedOutcomes`; `"active"` otherwise
- `totalVolume`: `"0"`, `endDate`: `""`

#### `mapStandaloneOutcomeToEvent(outcome): PredictionEvent`

- Event ID: `"o{outcome.outcome}"` (e.g., `"o1338"`)
- For recurring outcomes (`name === "Recurring"`): title from `recurringTitle()`, description from `recurringDescription()`, category `"recurring"`, endDate from parsed expiry
- For non-recurring: title = `outcome.name`, description = `outcome.description`, category `"custom"`, endDate `""`
- Status: always `"active"`
- Contains a single market

#### `mapOutcomeToMarket(outcome, eventId): PredictionMarket`

- Market ID: `String(outcome.outcome)` (e.g., `"516"`)
- `eventId`: passed through
- `question`: `recurringDescription(outcome)` for recurring; `outcome.name` otherwise
- `outcomes`: one `PredictionOutcome` per `sideSpec`, with `tokenId` = `sideCoin(outcome.outcome, sideIndex)` and `price = "0"` (enriched later)
- `volume`: `"0"`, `liquidity`: `"0"`

### Recurring Market Parsing

#### `isRecurring(outcome): boolean`

Returns `outcome.name === "Recurring"`.

#### `parseRecurringDescription(desc): Record<string, string> | null`

Parses pipe-delimited key:value pairs. Example input:

```
class:priceBinary|underlying:BTC|expiry:20260311-0300|targetPrice:69070|period:1d
```

Returns `{ class: "priceBinary", underlying: "BTC", expiry: "20260311-0300", targetPrice: "69070", period: "1d" }`.

Returns null if the description has no `|` separator or no valid key:value pairs.

#### `recurringTitle(outcome): string`

For `class === "priceBinary"`: returns `"{underlying} > ${targetPrice} ({period})"` (e.g., `"BTC > $69070 (1d)"`).
Otherwise: `"{underlying} {class} ({period})"`.
Fallback: `"Outcome #{outcome.outcome}"`.

#### `recurringDescription(outcome): string`

Returns `"Will {underlying} be above ${targetPrice} by {expiry}?"`.
Fallback: raw `outcome.description`.

### Price Enrichment

After building events from meta, `loadEvents()` fetches `allMids` (in parallel with `outcomeMeta`). For every outcome in every market of every event, if `mids[outcome.tokenId]` exists, the outcome's `price` field is updated from `"0"` to the midpoint value. The `allMids` call is wrapped in `.catch(() => ({}))` so price enrichment silently degrades if the mids endpoint fails.

---

## 6. Market Data Adapter

### `HIP4MarketDataAdapter`

Implements `PredictionMarketDataAdapter`. Constructed with a `HIP4Client` reference.

### Convention

`marketId` throughout this adapter is the **outcome ID as a string** (e.g., `"10"`). Order books and trades are fetched for **side 0** (the first side / "Yes") by default.

### Caching

- **Mids cache** TTL: **5 seconds** (`MIDS_CACHE_TTL = 5_000`)
- Structure: `{ data: Record<string, string>; time: number } | null`
- Used only by `fetchPrice()` and the private `getMids()` method

### Methods

#### `fetchOrderBook(marketId: string): Promise<PredictionOrderBook>`

1. Parses `marketId` to integer `outcomeId`
2. Constructs coin = `sideCoin(outcomeId, 0)` (always side 0)
3. Calls `client.fetchL2Book(coin)`
4. Maps via `mapBook()`: `levels[0]` -> bids, `levels[1]` -> asks; each level maps `{ px, sz, n }` -> `{ price, size }`

#### `fetchPrice(marketId: string): Promise<PredictionPrice>`

1. Parses `marketId` to integer `outcomeId`
2. Calls `getMids()` (5s cached `allMids`)
3. Looks up `sideCoin(outcomeId, 0)` and `sideCoin(outcomeId, 1)` in the mids map
4. Returns `PredictionPrice` with two outcomes: `"Side 0"` and `"Side 1"`, each with `price` and `midpoint` set to the mid value (or `"0"` if missing)

#### `fetchTrades(marketId: string, limit?: number): Promise<PredictionTrade[]>`

- Default `limit`: `50`
- Fetches trades for `sideCoin(outcomeId, 0)` via `client.fetchRecentTrades()`
- Maps via `mapTrade()`: `tid` -> `id`, `side "B"` -> `"buy"` / `"A"` -> `"sell"`, `px` -> `price`, `sz` -> `size`, `time` -> `timestamp`
- Slices to `limit` after fetch

### WebSocket Subscriptions

#### `subscribeOrderBook(marketId: string, onData: (book: PredictionOrderBook) => void): Unsubscribe`

Subscribes to `l2Book` channel for `sideCoin(outcomeId, 0)`. Uses `isL2BookData` type guard (checks for `coin` and `levels` properties). Maps incoming data via `mapWsBook()`.

#### `subscribePrice(marketId: string, onData: (price: PredictionPrice) => void): Unsubscribe`

Subscribes to `allMids` channel with **wildcard key `"*"`**. The callback fires for every `allMids` update, but only calls `onData` if either `sideCoin(outcomeId, 0)` or `sideCoin(outcomeId, 1)` is present in the incoming mids. Uses `isAllMidsData` type guard (checks for `mids` property).

#### `subscribeTrades(marketId: string, onData: (trade: PredictionTrade) => void): Unsubscribe`

Subscribes to `trades` channel for `sideCoin(outcomeId, 0)`. The callback receives an array; each element is mapped via `mapTrade()` and dispatched individually to `onData`.

### WebSocket Pool Architecture

The adapter manages a **single shared WebSocket connection** via a pool pattern:

#### `WsPoolEntry` (internal interface)

| Field           | Type                                       | Description                                 |
| --------------- | ------------------------------------------ | ------------------------------------------- |
| `ws`            | `WebSocket`                                | The underlying connection                   |
| `subscriptions` | `Map<string, Set<(msg: unknown) => void>>` | Map of subscription key -> set of callbacks |
| `refCount`      | `number`                                   | Number of active subscribers                |

#### `ensureWs(): WsPoolEntry`

Lazily creates a single WebSocket to `this.client.wsUrl`. Sets up:

- `onmessage`: Parses JSON, dispatches `msg.data` to all callbacks registered under `msg.channel`, **plus** all callbacks registered under `"*"` (wildcard)
- `onclose`: Nullifies the pool entry

#### `subscribeWs(channel, coin, onData): Unsubscribe`

1. Gets or creates the WebSocket via `ensureWs()`
2. Increments `refCount`
3. Builds subscription key: `coin === "*"` -> `channel`; otherwise -> `"{channel}:{coin}"`
4. Adds `onData` callback to the set for that key
5. Sends subscribe message immediately if WS is `OPEN`, otherwise waits for `open` event (with `{ once: true }`)
6. Subscribe message format:
   - Wildcard: `{ method: "subscribe", subscription: { type: channel } }`
   - Specific coin: `{ method: "subscribe", subscription: { type: channel, coin } }`
7. Returns unsubscribe function that:
   - Removes the callback from the subscription set
   - Cleans up empty sets
   - Decrements `refCount`
   - **Closes the WebSocket** if `refCount <= 0` and connection is OPEN (auto-close)

### Type Guards (private)

| Function              | Checks                                             |
| --------------------- | -------------------------------------------------- |
| `isL2BookData(data)`  | `typeof object`, not null, has `coin` and `levels` |
| `isAllMidsData(data)` | `typeof object`, not null, has `mids`              |
| `isTradesData(data)`  | `Array.isArray(data)`                              |

### Mapping Functions (private)

| Function                   | Input            | Output                |
| -------------------------- | ---------------- | --------------------- |
| `mapBook(raw, marketId)`   | `HLL2Book`       | `PredictionOrderBook` |
| `mapWsBook(raw, marketId)` | `HLWsL2BookData` | `PredictionOrderBook` |
| `mapTrade(raw, marketId)`  | `HLTrade`        | `PredictionTrade`     |

---

## 7. Account Adapter

### `HIP4AccountAdapter`

Implements `PredictionAccountAdapter`. Constructed with a `HIP4Client` reference.

### Constants

| Name               | Value    | Description                                      |
| ------------------ | -------- | ------------------------------------------------ |
| `POLL_INTERVAL_MS` | `10_000` | Position subscription poll interval (10 seconds) |

### Methods

#### `fetchPositions(address: string): Promise<PredictionPosition[]>`

1. Fetches `spotClearinghouseState(address)` and `allMids` in parallel
2. Iterates `state.balances`, filtering to coins where `isOutcomeCoin(coin)` is true and `parseFloat(total) !== 0`
3. Maps each balance via `mapSpotBalance()`

**Why `spotClearinghouseState`**: HIP-4 prediction market positions are spot token balances, not perpetual positions. Outcome tokens live in the spot clearinghouse alongside USDH.

#### `fetchActivity(address: string): Promise<PredictionActivity[]>`

1. Computes a **30-day window**: `startTime = now - 30 * 24 * 60 * 60 * 1000`, `endTime = now`
2. Calls `client.fetchUserFillsByTime(address, startTime, now)`
3. Filters fills to outcome coins via `mapFill()` (returns null for non-outcome fills)

#### `subscribePositions(address: string, onData: (positions: PredictionPosition[]) => void): Unsubscribe`

Polling-based subscription (no WebSocket):

1. Starts an async loop that calls `fetchPositions(address)` every 10 seconds
2. On each successful fetch, calls `onData(positions)` if still active
3. Errors are silently caught to continue polling
4. Returns an unsubscribe function that sets `active = false` to stop the loop

### Position Mapping

#### `mapSpotBalance(bal, allMids): PredictionPosition | null` (private)

| Computed field    | Logic                                                               |
| ----------------- | ------------------------------------------------------------------- |
| `marketId`        | `coinOutcomeId(coin)` as string, or raw coin if null                |
| `outcome`         | If parseable as side coin: `"Side {sideIndex}"`; otherwise raw coin |
| `shares`          | `parseFloat(total).toFixed(6)`                                      |
| `avgCost`         | `entryNtl / total` (or 0 if total is 0), `.toFixed(6)`              |
| `currentPrice`    | Mid from `allMids[coin]`, or `"0"`                                  |
| `unrealizedPnl`   | `(currentPrice - avgCost) * total`, `.toFixed(6)`                   |
| `potentialPayout` | Same as `total`, `.toFixed(6)`                                      |
| `eventTitle`      | Always `""` (not enriched)                                          |
| `marketQuestion`  | Always `""` (not enriched)                                          |
| `eventStatus`     | Always `"active"`                                                   |

Returns null if: coin is not an outcome coin, or total is 0.

### Activity Mapping

#### `mapFill(raw): PredictionActivity | null` (private)

Returns null if `!isOutcomeCoin(raw.coin)`.

| Field       | Source                              |
| ----------- | ----------------------------------- |
| `id`        | `String(raw.tid)`                   |
| `type`      | Always `"trade"`                    |
| `marketId`  | `coinOutcomeId(raw.coin)` as string |
| `outcome`   | `raw.coin` (raw coin string)        |
| `side`      | `"B"` -> `"buy"`, `"A"` -> `"sell"` |
| `price`     | `raw.px`                            |
| `size`      | `raw.sz`                            |
| `timestamp` | `raw.time`                          |

### Internal Helpers

#### `sleep(ms: number): Promise<void>` (private)

Simple `setTimeout` wrapper used by the polling loop.

---

## 8. Trading Adapter

### `HIP4TradingAdapter`

Implements `PredictionTradingAdapter`. Constructed with a `HIP4Client` and `HIP4Auth` reference.

### Constants

| Name                      | Value  | Description                   |
| ------------------------- | ------ | ----------------------------- |
| `DEFAULT_MARKET_SLIPPAGE` | `0.08` | 8% slippage for market orders |

### Methods

#### `placeOrder(params: PredictionOrderParams): Promise<PredictionOrderResult>`

Full flow:

1. **Auth check**: Gets signer from `auth.getSigner()`. If null, returns `{ success: false, error: "Not authenticated..." }`.
2. **Asset ID resolution**: Calls `resolveAssetId(marketId, outcome)`.
3. **Price resolution**:
   - **Market orders**: Fetches `allMids`, looks up the midpoint for the side coin. If no mid found, returns error `"No mid price found for {coin}..."`. Applies slippage: buy = `mid * (1 + 0.08)`, sell = `mid * (1 - 0.08)`. Clamps to `[0.0001, 0.9999]`. Formats via `formatPrice()`.
   - **Limit orders**: Parses `params.price` as float, formats via `formatPrice()`.
4. **Order wire construction**: `{ a: assetId, b: isBuy, p: price, s: params.amount, r: false, t: mapTif(...) }`
5. **Action construction**: `{ type: "order", grouping: "na", orders: [orderWire] }`
6. **EIP-712 signing**: Builds domain, uses `ORDER_TYPES`, builds value with `JSON.stringify(action)` and nonce (`Date.now()`). Normalizes signature.
7. **Exchange call**: `client.placeOrder(action, nonce, signature, null)`
8. **Response interpretation**: Checks `res.status === "ok"`, extracts first status from `res.response.data.statuses`, delegates to `interpretStatus()`.

Console logging: The adapter logs market order price calculation details and limit order prices, plus the raw order wire JSON.

#### `placeOrders(params: PredictionOrderParams[]): Promise<PredictionBatchOrderResult>`

Batch counterpart of `placeOrder`. Builds one signed action containing every wire and submits it in a single round-trip. Per-order validation runs first; orders that fail validation are reported in the result without affecting the rest. Returns `{ success, results: PredictionOrderResult[] }`. Never throws.

#### `modifyOrder(params: PredictionModifyParams): Promise<PredictionOrderResult>`

Modify a resting order's price and/or size. When only the size changes, HL preserves queue priority. The result has the same shape as `placeOrder` and carries the (possibly new) `orderId`.

#### `cancelOrder(params: PredictionCancelParams[]): Promise<HLCancelResponse>`

Takes an array of `PredictionCancelParams` and returns the typed `HLCancelResponse` from HL (so callers can inspect per-cancel statuses). Each entry resolves its asset ID via `outcome` if provided, otherwise falls back to `sideAssetId(outcomeId, 0)`. Throws on empty array or missing auth.

#### `scheduleCancel(time: number | null): Promise<WalletActionResult>`

HL "dead-man's switch". Registers a future Unix-millisecond timestamp at which HL cancels every open order from the signing agent. Per-agent (a new schedule replaces the previous one), not per-order. Pass `null` to clear an existing schedule. Intended use: arm ~1h before a HIP-4 market's settlement so resting limits don't sit through the auction unprotected.

#### `splitOutcome / mergeOutcome / mergeQuestion / negateOutcome`

`userOutcome` share-conversion actions. All four share the same `type: "userOutcome"` envelope and use L1 agent signing. They affect the user's spot balances directly (no order book interaction).

| Method                                         | What it does                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `splitOutcome({ outcome, amount })`            | Split X quote tokens into X Yes + X No shares of one outcome                                        |
| `mergeOutcome({ outcome, amount? })`           | Merge X paired Yes+No shares back into X quote tokens (`amount: null` = max available)              |
| `mergeQuestion({ question, amount? })`         | Merge X Yes shares from every outcome of a question into X quote tokens                             |
| `negateOutcome({ question, outcome, amount })` | Convert X No shares of one outcome into X Yes shares of every other outcome under the same question |

> The wire sub-key for negate is `negateOutcome` (matching the page heading), not `negateQuestion` as the docs body's example renders it. Verified against HL's testnet "Convert Outcomes" UI.

### Price Formatting

#### `formatPrice(price: number): string` (private)

Magnitude-based decimal places:

| Price range | Decimal places      |
| ----------- | ------------------- |
| `<= 0`      | Returns `"0"`       |
| `>= 1000`   | 0 (rounded integer) |
| `>= 10`     | 1                   |
| `>= 1`      | 2                   |
| `< 1`       | 4                   |

Trailing zeros are stripped: `"0.5000"` -> `"0.5"`, `"1000.0"` -> `"1000"`.

Since prediction markets are always 0-1, prices always get 4 decimal places in practice.

### Time-in-Force Mapping

#### `mapTif(type, tif?): HLOrderType` (private)

| Input type | Input TIF                       | HL TIF                |
| ---------- | ------------------------------- | --------------------- |
| `"market"` | (ignored)                       | `FrontendMarket`      |
| `"limit"`  | `"FOK"`                         | **rejected** - throws |
| `"limit"`  | `"FAK"`                         | `Ioc`                 |
| `"limit"`  | `"GTD"`                         | `Gtc`                 |
| `"limit"`  | `"GTC"` / `undefined` / default | `Gtc`                 |

> FOK is rejected explicitly. HL's `Ioc` is _Fill-and-Kill_ (allows partial fills), not _Fill-or-Kill_. Mapping FOK to `Ioc` would silently give callers partial-fill behavior they didn't ask for. Callers wanting all-or-nothing semantics must inspect fill size in the response themselves; use `FAK` for immediate partial fills, or `GTC` for resting orders.

GTD maps to `Gtc` (no actual GTD support).

### Asset ID Resolution

#### `resolveAssetId(marketId: string, outcome: string): number` (private)

1. Parses `marketId` to `outcomeId`
2. If `outcome` starts with `#`: extracts last digit as `sideIndex`, returns `sideAssetId(outcomeId, sideIndex)`
3. If `outcome` ends with a digit (regex `/(\d)$/`): uses that digit as `sideIndex`
4. Fallback: `sideAssetId(outcomeId, 0)` (defaults to side 0)

### Order Status Interpretation

#### `interpretStatus(status: HLOrderStatus): {...}` (private)

| Status variant                        | Result                                                |
| ------------------------------------- | ----------------------------------------------------- |
| `{ filled: { totalSz, avgPx, oid } }` | `{ orderId: oid, status: "filled", shares: totalSz }` |
| `{ resting: { oid } }`                | `{ orderId: oid, status: "resting" }`                 |
| `{ error: string }`                   | `{ error: msg, status: "error" }`                     |
| (none match)                          | `{ status: "unknown" }`                               |

### EIP-712 Signing Internals

#### `buildEIP712Domain(testnet: boolean): Record<string, unknown>`

```ts
{
  name: "Exchange",
  version: "1",
  chainId: testnet ? 421614 : 42161,  // Arbitrum Sepolia / Arbitrum One
  verifyingContract: "0x0000000000000000000000000000000000000000"
}
```

#### `ORDER_TYPES` (constant)

```ts
{
  "HyperliquidTransaction:Exchange": [
    { name: "action", type: "string" },
    { name: "nonce", type: "uint64" },
  ]
}
```

#### `CANCEL_TYPES` (constant)

Same structure as `ORDER_TYPES`:

```ts
{
  "HyperliquidTransaction:Exchange": [
    { name: "action", type: "string" },
    { name: "nonce", type: "uint64" },
  ]
}
```

#### `buildOrderValue(action, nonce): Record<string, unknown>`

Returns `{ action: JSON.stringify(action), nonce }`. The action is serialized to a JSON string for signing.

#### `buildCancelValue(action, nonce): Record<string, unknown>`

Same pattern: `{ action: JSON.stringify(action), nonce }`.

---

## 9. Auth Adapter

### `HIP4Auth`

Implements `PredictionAuthAdapter`. Manages wallet address and signer for EIP-712 signing.

### Internal State

| Field    | Type                  | Initial                      |
| -------- | --------------------- | ---------------------------- |
| `state`  | `PredictionAuthState` | `{ status: "disconnected" }` |
| `signer` | `HIP4Signer \| null`  | `null`                       |

### Methods

#### `initAuth(walletAddress: string, signer: unknown): Promise<PredictionAuthState>`

1. Validates `signer` via `isHIP4Signer()` type guard - checks that it's a non-null object with `getAddress` and `signTypedData` as functions
2. If validation fails: sets state to `"disconnected"` and throws `"HIP-4 auth requires a signer with getAddress() and signTypedData() methods..."`
3. Sets state to `{ status: "pending_approval", address: walletAddress }` and stores signer
4. **Immediately** sets state to `{ status: "ready", address: walletAddress }` - there is no actual approval step
5. Returns the final state

**No address check**: The adapter intentionally does **not** compare `signer.getAddress()` to `walletAddress`. This is by design for agent wallet support - with HL API wallets, the signer address differs from the user's wallet address because the agent signs on behalf of the user.

#### `getAuthStatus(): PredictionAuthState`

Returns the current `state` object. Synchronous.

#### `clearAuth(): void`

Sets `signer = null` and `state = { status: "disconnected" }`.

#### `getSigner(): HIP4Signer | null`

Returns the stored signer. Used internally by `HIP4TradingAdapter`. Not part of the `PredictionAuthAdapter` interface.

### `HIP4Signer` Interface

```ts
interface HIP4Signer {
  getAddress(): string | Promise<string>;
  signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>,
  ): Promise<HLSignature | string>;
}
```

`signTypedData` can return either:

- An `HLSignature` object (`{ r: string, s: string, v: number }`) directly
- A hex string (`"0x..."`) which will be split via `splitHexSignature()`

### Signature Utilities

#### `splitHexSignature(hex: string): HLSignature`

Converts a viem-style hex signature (65 bytes: 32r + 32s + 1v) to `{ r, s, v }`:

- Strips `0x` prefix if present
- `r = "0x" + raw[0..64]`
- `s = "0x" + raw[64..128]`
- `v = parseInt(raw[128..130], 16)`

#### `normalizeSignature(sig: HLSignature | string): HLSignature`

If `sig` is a string, calls `splitHexSignature(sig)`. Otherwise returns `sig` as-is.

### `isHIP4Signer(val: unknown): val is HIP4Signer` (private)

Runtime type guard. Returns true if `val` is a non-null object with `getAddress` and `signTypedData` as functions.

---

## 10. Type System

### Event Types (`src/types/event.ts`)

#### `PredictionEvent`

| Field              | Type                    | Description                                                                  |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------- |
| `id`               | `string`                | Event identifier (e.g., `"q5"` for question-based, `"o1338"` for standalone) |
| `title`            | `string`                | Human-readable event title                                                   |
| `description`      | `string`                | Event description                                                            |
| `category`         | `string`                | Category slug (`"custom"` or `"recurring"`)                                  |
| `markets`          | `PredictionMarket[]`    | Array of markets belonging to this event                                     |
| `totalVolume`      | `string`                | Total trading volume (always `"0"` in current impl)                          |
| `endDate`          | `string`                | Expiration date string (populated for recurring markets)                     |
| `status`           | `PredictionEventStatus` | Current event status                                                         |
| `imageUrl`         | `string?`               | Optional image URL (never populated by HL adapter)                           |
| `resolutionSource` | `string?`               | Optional resolution source (never populated by HL adapter)                   |

#### `PredictionEventStatus`

Union type: `"active" | "pending_resolution" | "resolved" | "cancelled"`

#### `PredictionMarket`

| Field       | Type                  | Description                                           |
| ----------- | --------------------- | ----------------------------------------------------- |
| `id`        | `string`              | Outcome ID as string (e.g., `"516"`)                  |
| `eventId`   | `string`              | Parent event ID                                       |
| `question`  | `string`              | Market question text                                  |
| `outcomes`  | `PredictionOutcome[]` | Array of tradeable outcomes (typically 2 sides)       |
| `volume`    | `string`              | Market volume (always `"0"` in current impl)          |
| `liquidity` | `string`              | Market liquidity (always `"0"` in current impl)       |
| `isNegRisk` | `boolean?`            | Optional negative risk flag (never set by HL adapter) |

#### `PredictionOutcome`

| Field     | Type     | Description                                                         |
| --------- | -------- | ------------------------------------------------------------------- |
| `name`    | `string` | Side name from `HLSideSpec.name` (e.g., `"Yes"`, `"No"`)            |
| `tokenId` | `string` | Side coin identifier (e.g., `"#5160"`)                              |
| `price`   | `string` | Current midpoint price (enriched from `allMids`, defaults to `"0"`) |

#### `PredictionCategory`

| Field  | Type     | Description         |
| ------ | -------- | ------------------- |
| `id`   | `string` | Category identifier |
| `name` | `string` | Display name        |
| `slug` | `string` | URL-safe slug       |

### Market Types (`src/types/market.ts`)

#### `PredictionOrderBook`

| Field       | Type                         | Description      |
| ----------- | ---------------------------- | ---------------- |
| `marketId`  | `string`                     | Outcome ID       |
| `bids`      | `PredictionOrderBookLevel[]` | Buy-side levels  |
| `asks`      | `PredictionOrderBookLevel[]` | Sell-side levels |
| `timestamp` | `number`                     | Server timestamp |

#### `PredictionOrderBookLevel`

| Field   | Type     | Description         |
| ------- | -------- | ------------------- |
| `price` | `string` | Price level         |
| `size`  | `string` | Total size at level |

#### `PredictionTrade`

| Field       | Type              | Description           |
| ----------- | ----------------- | --------------------- |
| `id`        | `string`          | Trade ID (from `tid`) |
| `marketId`  | `string`          | Outcome ID            |
| `outcome`   | `string`          | Raw coin string       |
| `side`      | `"buy" \| "sell"` | Trade side            |
| `price`     | `string`          | Execution price       |
| `size`      | `string`          | Trade size            |
| `timestamp` | `number`          | Trade time            |

#### `PredictionPrice`

| Field       | Type                                                       | Description       |
| ----------- | ---------------------------------------------------------- | ----------------- |
| `marketId`  | `string`                                                   | Outcome ID        |
| `outcomes`  | `Array<{ name: string; price: string; midpoint: string }>` | Price per side    |
| `timestamp` | `number`                                                   | Fetch/update time |

### Trading Types (`src/types/trading.ts`)

#### `PredictionOrderParams`

| Field         | Type                                | Description                                          |
| ------------- | ----------------------------------- | ---------------------------------------------------- |
| `marketId`    | `string`                            | Outcome ID                                           |
| `outcome`     | `string`                            | Side identifier (e.g., `"#5160"`, `"0"`, `"Side 0"`) |
| `side`        | `"buy" \| "sell"`                   | Order direction                                      |
| `type`        | `"market" \| "limit"`               | Order type                                           |
| `price`       | `string?`                           | Required for limit orders                            |
| `amount`      | `string`                            | Order size                                           |
| `timeInForce` | `"GTC" \| "GTD" \| "FOK" \| "FAK"?` | Time-in-force (limit only)                           |
| `expiration`  | `string?`                           | Unused in current implementation                     |

#### `PredictionOrderResult`

| Field     | Type      | Description                                        |
| --------- | --------- | -------------------------------------------------- |
| `success` | `boolean` | Whether the order succeeded                        |
| `orderId` | `string?` | HL order ID (if filled or resting)                 |
| `status`  | `string?` | `"filled"`, `"resting"`, `"error"`, or `"unknown"` |
| `shares`  | `string?` | Filled size (only for filled orders)               |
| `error`   | `string?` | Error message                                      |

#### `PredictionCancelParams`

| Field      | Type     | Description           |
| ---------- | -------- | --------------------- |
| `marketId` | `string` | Outcome ID            |
| `orderId`  | `string` | HL order ID to cancel |

### Account Types (`src/types/account.ts`)

#### `PredictionPosition`

| Field             | Type                                             | Description                                |
| ----------------- | ------------------------------------------------ | ------------------------------------------ |
| `marketId`        | `string`                                         | Outcome ID                                 |
| `eventTitle`      | `string`                                         | Always `""` (not enriched by current impl) |
| `marketQuestion`  | `string`                                         | Always `""` (not enriched by current impl) |
| `outcome`         | `string`                                         | Side label (e.g., `"Side 0"`) or raw coin  |
| `shares`          | `string`                                         | Number of outcome tokens held              |
| `avgCost`         | `string`                                         | Average cost per token                     |
| `currentPrice`    | `string`                                         | Current midpoint price                     |
| `unrealizedPnl`   | `string`                                         | Unrealized profit/loss                     |
| `potentialPayout` | `string`                                         | Max payout (equals total shares)           |
| `eventStatus`     | `"active" \| "pending_resolution" \| "resolved"` | Always `"active"` in current impl          |

#### `PredictionActivity`

| Field       | Type                                               | Description                      |
| ----------- | -------------------------------------------------- | -------------------------------- |
| `id`        | `string`                                           | Trade ID (from `tid`)            |
| `type`      | `"trade" \| "redeem" \| "deposit" \| "withdrawal"` | Always `"trade"` in current impl |
| `marketId`  | `string?`                                          | Outcome ID                       |
| `outcome`   | `string?`                                          | Raw coin string                  |
| `side`      | `"buy" \| "sell"?`                                 | Trade side                       |
| `price`     | `string?`                                          | Execution price                  |
| `size`      | `string?`                                          | Trade size                       |
| `amount`    | `string?`                                          | Never populated by current impl  |
| `timestamp` | `number`                                           | Fill time                        |

#### `PredictionAuthState`

| Field     | Type                                              | Description                                |
| --------- | ------------------------------------------------- | ------------------------------------------ |
| `status`  | `"disconnected" \| "pending_approval" \| "ready"` | Auth lifecycle state                       |
| `address` | `string?`                                         | Wallet address (set when pending or ready) |
| `apiKey`  | `string?`                                         | Never populated by current impl            |

### Raw Hyperliquid Types (`src/adapter/hyperliquid/types.ts`)

These are internal types mapping to HL API responses. Exported for advanced consumers.

#### `HLOutcomeMeta`

| Field       | Type           |
| ----------- | -------------- |
| `outcomes`  | `HLOutcome[]`  |
| `questions` | `HLQuestion[]` |

#### `HLOutcome`

| Field         | Type           |
| ------------- | -------------- |
| `outcome`     | `number`       |
| `name`        | `string`       |
| `description` | `string`       |
| `sideSpecs`   | `HLSideSpec[]` |

#### `HLSideSpec`

| Field  | Type     |
| ------ | -------- |
| `name` | `string` |

#### `HLQuestion`

| Field                  | Type       |
| ---------------------- | ---------- |
| `question`             | `number`   |
| `name`                 | `string`   |
| `description`          | `string`   |
| `fallbackOutcome`      | `number`   |
| `namedOutcomes`        | `number[]` |
| `settledNamedOutcomes` | `number[]` |

#### `HLL2Book`

| Field    | Type                                      |
| -------- | ----------------------------------------- |
| `coin`   | `string`                                  |
| `time`   | `number`                                  |
| `levels` | `[HLL2Level[], HLL2Level[]]` (bids, asks) |

#### `HLL2Level`

| Field | Type     |
| ----- | -------- |
| `px`  | `string` |
| `sz`  | `string` |
| `n`   | `number` |

#### `HLTrade`

| Field   | Type               |
| ------- | ------------------ |
| `coin`  | `string`           |
| `side`  | `"B" \| "A"`       |
| `px`    | `string`           |
| `sz`    | `string`           |
| `time`  | `number`           |
| `hash`  | `string`           |
| `tid`   | `number`           |
| `users` | `[string, string]` |

#### `HLCandle`

| Field | Type     | Description |
| ----- | -------- | ----------- |
| `t`   | `number` | Open time   |
| `T`   | `number` | Close time  |
| `s`   | `string` | Symbol      |
| `i`   | `string` | Interval    |
| `o`   | `string` | Open        |
| `c`   | `string` | Close       |
| `h`   | `string` | High        |
| `l`   | `string` | Low         |
| `v`   | `string` | Volume      |
| `n`   | `number` | Trade count |

#### `HLAllMids`

```ts
type HLAllMids = Record<string, string>;
```

#### `HLClearinghouseState`

| Field                        | Type                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `marginSummary`              | `{ accountValue, totalNtlPos, totalRawUsd, totalMarginUsed }` (all `string`) |
| `crossMarginSummary`         | `{ accountValue, totalNtlPos, totalRawUsd, totalMarginUsed }` (all `string`) |
| `crossMaintenanceMarginUsed` | `string`                                                                     |
| `withdrawable`               | `string`                                                                     |
| `assetPositions`             | `HLAssetPosition[]`                                                          |
| `time`                       | `number`                                                                     |

#### `HLAssetPosition`

| Field      | Type                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `type`     | `string`                                                                                                                             |
| `position` | `{ coin, szi, entryPx, positionValue, unrealizedPnl, returnOnEquity, liquidationPx, marginUsed, maxLeverage, leverage, cumFunding }` |

`position.leverage`: `{ type: string; value: number; rawUsd?: string }`
`position.cumFunding`: `{ allTime: string; sinceOpen: string; sinceChange: string }`
`position.liquidationPx`: `string | null`

#### `HLSpotClearinghouseState`

| Field      | Type                                                                                    |
| ---------- | --------------------------------------------------------------------------------------- |
| `balances` | `Array<{ coin: string; token: number; hold: string; total: string; entryNtl: string }>` |

#### `HLFrontendOrder`

| Field        | Type             |
| ------------ | ---------------- |
| `coin`       | `string`         |
| `side`       | `"B" \| "A"`     |
| `limitPx`    | `string`         |
| `sz`         | `string`         |
| `oid`        | `number`         |
| `timestamp`  | `number`         |
| `origSz`     | `string`         |
| `reduceOnly` | `boolean`        |
| `orderType`  | `string`         |
| `tif`        | `string \| null` |
| `cloid`      | `string \| null` |

#### `HLFill`

| Field           | Type         |
| --------------- | ------------ |
| `coin`          | `string`     |
| `px`            | `string`     |
| `sz`            | `string`     |
| `side`          | `"B" \| "A"` |
| `time`          | `number`     |
| `startPosition` | `string`     |
| `dir`           | `string`     |
| `closedPnl`     | `string`     |
| `hash`          | `string`     |
| `oid`           | `number`     |
| `crossed`       | `boolean`    |
| `fee`           | `string`     |
| `tid`           | `number`     |
| `feeToken`      | `string`     |

#### `HLOrderAction`

| Field      | Type            |
| ---------- | --------------- |
| `type`     | `"order"`       |
| `grouping` | `"na"`          |
| `orders`   | `HLOrderWire[]` |

#### `HLOrderWire`

| Field | Type          | Description    |
| ----- | ------------- | -------------- |
| `a`   | `number`      | Asset index    |
| `b`   | `boolean`     | True = buy     |
| `p`   | `string`      | Price          |
| `s`   | `string`      | Size           |
| `r`   | `boolean`     | Reduce only    |
| `t`   | `HLOrderType` | Order type/TIF |

#### `HLOrderType`

```ts
type HLOrderType =
  | { limit: { tif: "Gtc" | "Ioc" | "Alo" | "FrontendMarket" } }
  | { trigger: { triggerPx: string; isMarket: boolean; tpsl: "tp" | "sl" } };
```

#### `HLExchangeRequest`

| Field          | Type             |
| -------------- | ---------------- |
| `action`       | `HLOrderAction`  |
| `nonce`        | `number`         |
| `signature`    | `HLSignature`    |
| `vaultAddress` | `string \| null` |

#### `HLSignature`

| Field | Type     |
| ----- | -------- |
| `r`   | `string` |
| `s`   | `string` |
| `v`   | `number` |

#### `HLExchangeResponse`

| Field      | Type                                                      |
| ---------- | --------------------------------------------------------- |
| `status`   | `"ok" \| "err"`                                           |
| `response` | `{ type: "order"; data: { statuses: HLOrderStatus[] } }?` |

#### `HLOrderStatus`

```ts
type HLOrderStatus =
  | { filled: { totalSz: string; avgPx: string; oid: number } }
  | { resting: { oid: number } }
  | { error: string };
```

#### `HLCancelAction`

| Field     | Type                              |
| --------- | --------------------------------- |
| `type`    | `"cancel"`                        |
| `cancels` | `Array<{ a: number; o: number }>` |

#### `HLCancelRequest`

| Field          | Type             |
| -------------- | ---------------- |
| `action`       | `HLCancelAction` |
| `nonce`        | `number`         |
| `signature`    | `HLSignature`    |
| `vaultAddress` | `string \| null` |

#### `HLWsMessage`

| Field     | Type      |
| --------- | --------- |
| `channel` | `string`  |
| `data`    | `unknown` |

#### `HLWsL2BookData`

| Field    | Type                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- |
| `coin`   | `string`                                                                                       |
| `time`   | `number`                                                                                       |
| `levels` | `[Array<{ px: string; sz: string; n: number }>, Array<{ px: string; sz: string; n: number }>]` |

#### `HLWsTradeData`

| Field  | Type         |
| ------ | ------------ |
| `coin` | `string`     |
| `side` | `"B" \| "A"` |
| `px`   | `string`     |
| `sz`   | `string`     |
| `time` | `number`     |
| `hash` | `string`     |
| `tid`  | `number`     |

### Adapter Interface Types (`src/adapter/types.ts`)

#### `Unsubscribe`

```ts
type Unsubscribe = () => void;
```

#### `PredictionsAdapter`

| Member         | Type                                   | Description             |
| -------------- | -------------------------------------- | ----------------------- |
| `id`           | `readonly string`                      | Adapter identifier      |
| `name`         | `readonly string`                      | Human-readable name     |
| `events`       | `readonly PredictionEventAdapter`      | Events sub-adapter      |
| `marketData`   | `readonly PredictionMarketDataAdapter` | Market data sub-adapter |
| `account`      | `readonly PredictionAccountAdapter`    | Account sub-adapter     |
| `trading`      | `readonly PredictionTradingAdapter`    | Trading sub-adapter     |
| `auth`         | `readonly PredictionAuthAdapter`       | Auth sub-adapter        |
| `initialize()` | `Promise<void>`                        | Initialize the adapter  |
| `destroy()`    | `void`                                 | Clean up resources      |

#### `PredictionEventAdapter`

| Method            | Signature                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `fetchEvents`     | `(params?: { category?: string; active?: boolean; limit?: number; offset?: number; query?: string }) => Promise<PredictionEvent[]>` |
| `fetchEvent`      | `(eventId: string) => Promise<PredictionEvent>`                                                                                     |
| `fetchCategories` | `() => Promise<PredictionCategory[]>`                                                                                               |

#### `PredictionMarketDataAdapter`

| Method                    | Signature                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `fetchOrderBook`          | `(marketId: string, sideIndex?: number) => Promise<PredictionOrderBook>`                           |
| `fetchPrice`              | `(marketId: string) => Promise<PredictionPrice>`                                                   |
| `fetchTrades`             | `(marketId: string, limit?: number) => Promise<PredictionTrade[]>`                                 |
| `fetchCandles`            | `(marketId: string, interval?: string, startTime?: number, endTime?: number) => Promise<Candle[]>` |
| `subscribeOrderBook`      | `(marketId: string, onData: (book: PredictionOrderBook) => void) => Unsubscribe`                   |
| `subscribePrice`          | `(marketId: string, onData: (price: PredictionPrice) => void) => Unsubscribe`                      |
| `subscribeTrades`         | `(marketId: string, onData: (trade: PredictionTrade) => void) => Unsubscribe`                      |
| `subscribeAllMids`        | `(onData: (data: HLWsAllMidsData) => void) => Unsubscribe`                                         |
| `subscribeActiveAssetCtx` | `(coin: string, onData: (data: HLWsActiveSpotAssetCtxData) => void) => Unsubscribe`                |
| `subscribeSpotAssetCtxs`  | `(onData: (data: HLWsSpotAssetCtxsData) => void) => Unsubscribe`                                   |
| `subscribePerpAssetCtx`   | `(coin: string, onData: (data: HLWsActivePerpAssetCtxData) => void) => Unsubscribe`                |

#### `PredictionAccountAdapter`

| Method               | Signature                                                                             |
| -------------------- | ------------------------------------------------------------------------------------- |
| `fetchPositions`     | `(address: string) => Promise<PredictionPosition[]>`                                  |
| `fetchActivity`      | `(address: string) => Promise<PredictionActivity[]>`                                  |
| `subscribePositions` | `(address: string, onData: (positions: PredictionPosition[]) => void) => Unsubscribe` |

#### `PredictionTradingAdapter`

| Method        | Signature                                                                  |
| ------------- | -------------------------------------------------------------------------- |
| `placeOrder`  | `(params: PredictionOrderParams) => Promise<PredictionOrderResult>`        |
| `placeOrders` | `(params: PredictionOrderParams[]) => Promise<PredictionBatchOrderResult>` |
| `modifyOrder` | `(params: PredictionModifyParams) => Promise<PredictionOrderResult>`       |
| `cancelOrder` | `(params: PredictionCancelParams[]) => Promise<HLCancelResponse>`          |

`HIP4TradingAdapter` (the concrete class) additionally exposes `scheduleCancel`, `splitOutcome`, `mergeOutcome`, `mergeQuestion`, and `negateOutcome`. See [§ 8 Trading Adapter](#8-trading-adapter) for details.

#### `PredictionAuthAdapter`

| Method          | Signature                                                                  |
| --------------- | -------------------------------------------------------------------------- |
| `initAuth`      | `(walletAddress: string, signer: unknown) => Promise<PredictionAuthState>` |
| `getAuthStatus` | `() => PredictionAuthState`                                                |
| `clearAuth`     | `() => void`                                                               |

---

## 11. React Bindings

React bindings (context provider + hooks) are available as a separate package: `@outcome.xyz/hip4-react`.

```bash
npm install @outcome.xyz/hip4-react
```

Exports: `PredictionsAdapterProvider`, `usePredictionsAdapter`, `useEvents`, `useEventDetail`, `usePredictionBook`, `usePredictionPrice`, `usePredictionPositions`.

See [@outcome.xyz/hip4-react](https://github.com/Outcome-xyz/hip4-react) for full documentation.

---

## 12. Implementation Notes

### Why `spotClearinghouseState` Instead of `clearinghouseState`

HIP-4 outcome tokens are spot assets, not perpetual positions. They appear as token balances in the spot clearinghouse alongside USDH, not as leveraged positions in the perps clearinghouse. The SDK uses `spotClearinghouseState` for positions and filters by `isOutcomeCoin()` to isolate prediction tokens from regular spot holdings.

### Why No Address Check in Auth

The `initAuth` method accepts a `walletAddress` and a `signer` but never verifies that `signer.getAddress()` matches `walletAddress`. This is intentional for agent wallet support. Hyperliquid API wallets use a delegation model where an agent key signs on behalf of a user address. The signer's address is the agent, while `walletAddress` is the actual user account.

### Market Order Pricing

HIP-4 market orders use `FrontendMarket` TIF with extreme prices (`0.99999` for buys, `0.00001` for sells). The exchange handles best-execution. USDH spot orders use `Ioc` TIF with prices at oracle ± 10%, fetching the oracle from `spotMetaAndAssetCtxs`.

### MessagePack Note

The SDK uses `application/json` for all API communication. Hyperliquid also supports MessagePack encoding for some endpoints, but this SDK does not implement it. All request/response serialization is JSON via `fetch()`.

### WebSocket Pooling

A single WebSocket connection is shared across all market data subscriptions. The pool uses reference counting - the connection opens lazily on the first subscription and closes automatically when the last subscriber unsubscribes (`refCount <= 0`). Subscription dispatch extracts `data.coin` from incoming messages (or `data[0].coin` for array payloads like trades) to route to per-coin subscribers, then falls through to channel-only subscribers (e.g. `allMids`). Auto-reconnect with exponential backoff (max 10 attempts) restores all subscriptions after disconnect.

### Cache Choices

| Cache                  | TTL                     | Scope                            | Rationale                                                                                    |
| ---------------------- | ----------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| Event list             | 30s                     | `HIP4EventAdapter` instance      | `outcomeMeta` changes infrequently; avoids hammering the API on repeated `fetchEvents` calls |
| All mids (market data) | 5s                      | `HIP4MarketDataAdapter` instance | Midpoint prices change frequently but `fetchPrice` may be called in rapid succession         |
| All mids (events)      | Part of 30s event cache | N/A                              | Price enrichment piggybacks on the event cache                                               |

### EIP-712 Domain Configuration

Two EIP-712 domains are used:

- **L1 agent signing** (orders, cancels, USDH trades): domain `Exchange`, chainId `1337`, primaryType `Agent`. The action is msgpack-encoded and keccak-256 hashed into a `connectionId`.
- **User-signed actions** (transfers, withdrawals, sends): domain `HyperliquidSignTransaction`, chainId from `signatureChainId` (`0x66eee` = 421614). The action fields are signed directly as typed data.

### Nonce Generation

All exchange actions use `Date.now()` as the nonce. This provides millisecond-level uniqueness for normal use but could theoretically collide under extremely rapid order submission.

---

## 13. Known Limitations

### Unimplemented Features

1. **`PredictionOrderParams.expiration`**: Field exists on the type but is never read by the trading adapter.
2. **`PredictionAuthState.apiKey`**: Field exists on the type but is never populated.
3. **No "cancel all" helper**: Cancel multiple orders by passing an array to `cancelOrder([...])`. There is no separate `cancelAllOrders` method.

### Unused Client Methods

These methods exist on `HIP4Client` but are not called by any adapter:

- `fetchClearinghouseState` - perps clearinghouse, not used for HIP-4
- `fetchUserFills` - superseded by `fetchUserFillsByTime`

### Data Gaps

4. **`PredictionPosition.eventTitle`**: Always empty string. Position mapping does not cross-reference event metadata.
5. **`PredictionPosition.marketQuestion`**: Always empty string. Same reason.
6. **`PredictionPosition.eventStatus`**: Always `"active"`. No settlement status check.
7. **`PredictionEvent.totalVolume`**: Always `"0"`. No volume aggregation from HL.
8. **`PredictionMarket.volume`**: Always `"0"`. Same.
9. **`PredictionMarket.liquidity`**: Always `"0"`. No liquidity data from HL.
10. **`PredictionMarket.isNegRisk`**: Never set.
11. **`PredictionEvent.imageUrl`**: Never set.
12. **`PredictionEvent.resolutionSource`**: Never set.
13. **`PredictionActivity`**: Only `"trade"` type is ever produced. `"redeem"`, `"deposit"`, `"withdrawal"` types are defined but never mapped.
14. **`PredictionActivity.amount`**: Never populated.

### Trading Limitations

15. **Cancel side resolution**: `cancelOrder` resolves the side from the per-entry `outcome` field (e.g. `"#17581"`) when present; otherwise it falls back to side 0. Pass `outcome` explicitly when cancelling orders on side 1.
16. **FOK is rejected**: HL's `Ioc` is _Fill-and-Kill_ (allows partial fills), not Fill-or-Kill. The SDK rejects FOK explicitly so callers don't silently receive partial-fill behavior. Use `FAK` for IoC semantics or `GTC` for resting orders.
17. **GTD maps to GTC**: There is no actual Good-Till-Date implementation. GTD orders behave as GTC.
18. **`reduceOnly` is always false**: The order wire sets `r: false` unconditionally. There is no way to place reduce-only orders.
19. **Batch placement available**: `placeOrders(params[])` sends multiple orders in a single signed action. Use `placeOrder` for the single-order convenience path.

### WebSocket Limitations

20. **Reconnection restores subscriptions**: WebSocket auto-reconnects with exponential backoff (max 10 attempts) and restores all active subscriptions. However, data received during the disconnect window is lost.
21. **No unsubscribe message sent**: When a subscriber unsubscribes, the WS unsubscribe message is not sent to the server. The connection is just closed when refCount reaches 0.
22. **No heartbeat/ping**: No keepalive mechanism for the WebSocket connection.
23. **Unparseable frames silently ignored**: JSON parse errors in `onmessage` are caught and discarded.

### Polling Limitations

24. **Position polling is 10s fixed interval**: No adaptive polling or WebSocket-based position updates. Each poll makes 2 API calls (`spotClearinghouseState` + `allMids`).
25. **Polling errors silently swallowed**: Failed position fetches during `subscribePositions` are caught and ignored; the next poll continues.

### Activity Limitations

26. **30-day fixed window**: `fetchActivity` always queries the last 30 days. No pagination or custom time range parameter.

### Architecture Limitations

27. **WebSocket URL not configurable**: Unlike `infoUrl` and `exchangeUrl`, the WebSocket URL cannot be overridden via config.
28. **Single retry on 5xx**: Info endpoint requests retry once with a 1-second delay on 5xx or network errors. 4xx errors are not retried. Exchange endpoint requests are not retried.
29. **Floating point arithmetic for positions**: `mapSpotBalance` uses `parseFloat` for financial calculations (avgCost, unrealizedPnl, potentialPayout), which can introduce precision errors.
30. **Console.log in production paths**: The trading adapter logs order details to `console.log`, which may leak to production.
31. **HLWsTradeData type defined but unused**: The type exists in `types.ts` but is never referenced. Actual trade data is typed as `HLTrade` after `isTradesData` guard.

---

## 14. Integration Examples

### Basic Setup (No React)

```ts
import { createHIP4Adapter } from "@outcome.xyz/hip4";

const adapter = createHIP4Adapter({ testnet: true });
await adapter.initialize();

// Fetch all active events
const events = await adapter.events.fetchEvents({ active: true });
console.log(events);

// Clean up
adapter.destroy();
```

### React Setup

```tsx
import { createHIP4Adapter } from "@outcome.xyz/hip4";
import { PredictionsAdapterProvider } from "@outcome.xyz/hip4-react";

const adapter = createHIP4Adapter({ testnet: true });

function App() {
  return (
    <PredictionsAdapterProvider adapter={adapter}>
      <YourComponents />
    </PredictionsAdapterProvider>
  );
}
```

### Fetching Events with Hooks

```tsx
import { useEvents, useEventDetail } from "@outcome.xyz/hip4-react";

function EventList() {
  const { events, isLoading, error } = useEvents({
    active: true,
    category: "recurring",
    limit: 10,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {events?.map((e) => (
        <li key={e.id}>{e.title}</li>
      ))}
    </ul>
  );
}

function EventDetail({ eventId }: { eventId: string }) {
  const { event, isLoading } = useEventDetail(eventId);
  if (isLoading || !event) return null;
  return <h1>{event.title}</h1>;
}
```

### Subscribing to Live Prices

```tsx
import { usePredictionPrice } from "@outcome.xyz/hip4-react";

function PriceDisplay({ marketId }: { marketId: string }) {
  const { data, isLoading } = usePredictionPrice(marketId);

  if (isLoading || !data) return <div>--</div>;

  return (
    <div>
      {data.outcomes.map((o) => (
        <span key={o.name}>
          {o.name}: {o.price}
        </span>
      ))}
    </div>
  );
}
```

### Subscribing to Order Book

```tsx
import { usePredictionBook } from "@outcome.xyz/hip4-react";

function OrderBook({ marketId }: { marketId: string }) {
  const { data } = usePredictionBook(marketId);
  if (!data) return null;

  return (
    <div>
      <div>Bids: {data.bids.length} levels</div>
      <div>Asks: {data.asks.length} levels</div>
    </div>
  );
}
```

### Fetching Positions

```tsx
import { usePredictionPositions } from "@outcome.xyz/hip4-react";

function Positions({ address }: { address: string }) {
  const { data, isLoading } = usePredictionPositions(address);

  if (isLoading) return <div>Loading positions...</div>;

  return (
    <ul>
      {data?.map((pos) => (
        <li key={`${pos.marketId}-${pos.outcome}`}>
          {pos.outcome}: {pos.shares} shares @ {pos.avgCost} avg (PnL:{" "}
          {pos.unrealizedPnl})
        </li>
      ))}
    </ul>
  );
}
```

### Placing an Order (Programmatic)

```ts
import { createHIP4Adapter } from "@outcome.xyz/hip4";
import type { HIP4Signer } from "@outcome.xyz/hip4";

const adapter = createHIP4Adapter({ testnet: true });
await adapter.initialize();

// Authenticate with a signer (ethers Wallet, viem WalletClient, etc.)
const signer: HIP4Signer = {
  getAddress: () => "0xYourAgentAddress",
  signTypedData: async (domain, types, value) => {
    // Return HLSignature or hex string
    return yourSigningLogic(domain, types, value);
  },
};

await adapter.auth.initAuth("0xYourWalletAddress", signer);

// Place a market buy order
const result = await adapter.trading.placeOrder({
  marketId: "516", // outcome ID
  outcome: "#5160", // side 0 (Yes)
  side: "buy",
  type: "market",
  amount: "10", // 10 shares
});

console.log(result);
// { success: true, orderId: "12345", status: "filled", shares: "10" }

// Place a limit sell order
const limitResult = await adapter.trading.placeOrder({
  marketId: "516",
  outcome: "#5161", // side 1 (No)
  side: "sell",
  type: "limit",
  price: "0.65",
  amount: "5",
  timeInForce: "GTC",
});

// Cancel one or more orders (takes an array, returns HLCancelResponse)
const cancelRes = await adapter.trading.cancelOrder([
  { marketId: "516", orderId: "12345", outcome: "#5160" },
]);
// cancelRes.response.data.statuses lets you inspect per-cancel results.
```

### Fetching Activity (Programmatic)

```ts
const activity = await adapter.account.fetchActivity("0xYourAddress");
for (const a of activity) {
  console.log(`${a.side} ${a.size} @ ${a.price} on ${a.outcome}`);
}
```

### Mainnet Configuration

```ts
const adapter = createHIP4Adapter({
  testnet: false, // Uses mainnet URLs
});
```

### Custom URL Override

```ts
const adapter = createHIP4Adapter({
  testnet: true,
  infoUrl: "https://custom-proxy.example.com/info",
  exchangeUrl: "https://custom-proxy.example.com/exchange",
});
```
