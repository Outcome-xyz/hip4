<p align="center">
  <img src="./assets/outcome-icon-light.svg" alt="@outcome.xyz/hip4" />
</p>

<h1 align="center">@outcome.xyz/hip4</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@outcome.xyz/hip4"><img src="https://img.shields.io/npm/v/@outcome.xyz/hip4.svg" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="zero dependencies" />
  <img src="https://img.shields.io/npm/l/@outcome.xyz/hip4" alt="license" />
</p>

---

TypeScript SDK for Hyperliquid HIP-4 prediction markets. Zero runtime dependencies.

## Built for developers

The SDK is structured around a single adapter with typed sub-modules for each domain - events, market data, account state, trading, wallet, and auth. Everything returns typed responses, WebSocket subscriptions return unsubscribe functions, and all signing (L1 agent + EIP-712) is handled internally with no external crypto dependencies.

```bash
pnpm add @outcome.xyz/hip4
```

```typescript
import { createHIP4Adapter } from "@outcome.xyz/hip4";

const hip4 = createHIP4Adapter({ testnet: true });
await hip4.initialize();
```

## Examples

- [`auth-eoa.ts`](examples/auth-eoa.ts) - Agent key approval and auth setup
- [`get-all-markets.ts`](examples/get-all-markets.ts) - Fetch all markets grouped by type
- [`get-multi-outcome.ts`](examples/get-multi-outcome.ts) - Multi-outcome markets with live prices
- [`get-recurring-markets.ts`](examples/get-recurring-markets.ts) - Recurring markets with expiry countdowns
- [`place-limit-order.ts`](examples/place-limit-order.ts) - Limit order with price validation
- [`place-market-order.ts`](examples/place-market-order.ts) - Market order with FrontendMarket TIF
- [`stream-prices.ts`](examples/stream-prices.ts) - Stream live prices via WebSocket
- [`usdh-ramp.ts`](examples/usdh-ramp.ts) - End-to-end USDH on/off-ramp via Coinbase + Across

## API

### `hip4.events`

| Method                           | Description                                                              |
| -------------------------------- | ------------------------------------------------------------------------ |
| `fetchEvents(params?)`           | List events. Filters: `category`, `active`, `limit`, `offset`, `query`   |
| `fetchEvent(eventId)`            | Single event by ID                                                       |
| `fetchCategories()`              | Available categories                                                     |
| `fetchMarkets(params?)`          | Typed HIP-4 markets with optional grouping by type or question           |
| `fetchSettledOutcome(outcomeId)` | Settlement details for a resolved outcome. Returns `null` if not settled |

### `hip4.marketData`

| Method                                            | Description                                   |
| ------------------------------------------------- | --------------------------------------------- |
| `fetchOrderBook(marketId, sideIndex?)`            | L2 snapshot                                   |
| `fetchPrice(marketId)`                            | Both sides, 5s cache                          |
| `fetchTrades(marketId, limit?)`                   | Recent trades                                 |
| `fetchCandles(marketId, interval?, start?, end?)` | OHLCV candles                                 |
| `subscribeOrderBook(marketId, cb)`                | Real-time L2 book                             |
| `subscribePrice(marketId, cb)`                    | Real-time prices                              |
| `subscribeTrades(marketId, cb)`                   | Real-time trades                              |
| `subscribeAllMids(cb)`                            | All mid-prices across every market            |
| `subscribeActiveAssetCtx(coin, cb)`               | Per-spot-coin context (vol, OI, mark)         |
| `subscribeSpotAssetCtxs(cb)`                      | Bulk spot-asset context updates               |
| `subscribePerpAssetCtx(coin, cb)`                 | Per-perp-coin context (mark, oracle, funding) |

### `hip4.account`

| Method                            | Description                                |
| --------------------------------- | ------------------------------------------ |
| `fetchPositions(address)`         | Outcome positions with resolved side names |
| `fetchActivity(address)`          | Fills, last 30 days                        |
| `fetchBalance(address)`           | Spot balances                              |
| `fetchOpenOrders(address)`        | Resting orders                             |
| `subscribePositions(address, cb)` | Polling at 10s                             |

### `hip4.trading`

| Method                  | Description                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `placeOrder(params)`    | Place market or limit order. Returns `{ success, orderId?, error? }`                                                        |
| `placeOrders(params[])` | Batch place orders in a single signed request                                                                               |
| `modifyOrder(params)`   | Modify a resting order (price and/or size); preserves queue priority on size-only edits                                     |
| `cancelOrder(params[])` | Cancel one or more resting orders. Returns `HLCancelResponse`                                                               |
| `scheduleCancel(time)`  | Dead-man's switch - registers a future timestamp at which HL cancels every open order from this agent. Pass `null` to clear |
| `splitOutcome(params)`  | Split X quote tokens into X Yes + X No shares of one outcome                                                                |
| `mergeOutcome(params)`  | Merge X paired Yes+No shares back into X quote tokens                                                                       |
| `mergeQuestion(params)` | Merge X Yes shares from every outcome of a question into X quote tokens                                                     |
| `negateOutcome(params)` | Convert X No shares of one outcome into X Yes shares of every other outcome in the question                                 |

### `hip4.wallet`

| Method                              | Signing  | Description                     |
| ----------------------------------- | -------- | ------------------------------- |
| `setSigner(signer)`                 | -        | Set user wallet for EIP-712 ops |
| `buyUsdh(amount)`                   | L1 agent | Buy USDH on spot                |
| `sellUsdh(amount)`                  | L1 agent | Sell USDH on spot               |
| `transferToSpot(amount)`            | EIP-712  | Perp -> Spot                    |
| `transferToPerps(amount)`           | EIP-712  | Spot -> Perp                    |
| `withdraw({ destination, amount })` | EIP-712  | Withdraw to external address    |
| `usdSend({ destination, amount })`  | EIP-712  | Send to another HL address      |

### `hip4.auth`

| Method                            | Description                                         |
| --------------------------------- | --------------------------------------------------- |
| `initAuth(walletAddress, signer)` | Accepts viem `PrivateKeyAccount` or ethers `Signer` |
| `getAuthStatus()`                 | `"disconnected" \| "pending_approval" \| "ready"`   |
| `clearAuth()`                     | Reset auth state                                    |

## Market Types

`fetchMarkets()` classifies every HIP-4 outcome into one of four types:

| Type             | Description                                                | Parsed Fields                                                                                  |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `defaultBinary`  | Recurring price markets (BTC > $67250 1d)                  | `underlying`, `targetPrice`, `expiry`, `period`                                                |
| `labelledBinary` | Standalone binary with custom sides (Hypurr vs Usain Bolt) | Custom side labels                                                                             |
| `multiOutcome`   | Grouped under a question, with fallback                    | `questionId`, `questionName`, `isFallback`                                                     |
| `priceBucket`    | Recurring multi-bucket price markets (per-bucket Yes/No)   | `underlying`, `expiry`, `priceThresholds`, `period`, `bucketIndex`, `lowerBound`, `upperBound` |

```typescript
// Filter by type
const binaries = await hip4.events.fetchMarkets({ type: "defaultBinary" });

// Group by type
const grouped = await hip4.events.fetchMarkets({ groupBy: "type" });

// Group multi-outcome by question
const byQuestion = await hip4.events.fetchMarkets({ groupBy: "question" });
```

## Configuration

```typescript
const hip4 = createHIP4Adapter({
  testnet: true,
  // Builder fee - collected on every order placed by this adapter
  builderAddress: "0xYourBuilderAddress",
  builderFee: 100, // 0.1% (tenths of a basis point, 0–1000)
  logger: (level, msg, data) => console.log(level, msg, data),
});
```

Per-order builder address/fee can also be passed on `placeOrder` to override the adapter-level config.

## Streams

Drop-in price feeds backed by HL's WebSocket. Each takes a callback and returns an unsubscribe function. The snapshot includes the rolling candle history plus the current mid.

```typescript
import { createPriceFeed, createPerpPriceFeed } from "@outcome.xyz/hip4";

// HIP-4 outcome side (uses sideIndex 0 by default)
const unsub = createPriceFeed(
  hip4.marketData,
  "1758",
  (snapshot) => console.log(snapshot.currentMid, snapshot.candles),
  { interval: "1h" },
);
unsub();
```

| Helper                                                     | Use                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `createPriceFeed(marketData, marketId, onSnapshot, opts?)` | Live mid + tick-aggregated candle history for a HIP-4 outcome side |
| `createPerpPriceFeed(client, coin, onSnapshot, opts?)`     | Same shape for an HL perp coin                                     |
| `processTick`, `candleBoundaryMs`, `intervalToMs`          | Lower-level candle utilities                                       |

## USDH on/off-ramp (mainnet)

Built-in fiat ↔ USDH ramp via Coinbase + Across. Buy: fiat → Coinbase onramp → USDC (Arbitrum) → Across counterfactual → USDH (HyperCore). Sell: USDH (HyperEVM) → Across swap → USDC (Arbitrum) → Coinbase offramp → fiat. See [`examples/usdh-ramp.ts`](examples/usdh-ramp.ts) for the full flow.

## Orderbook utilities

```typescript
import {
  computeTradeCost,
  computeEstimatedCost,
  computePotentialReturn,
} from "@outcome.xyz/hip4";

const cost = computeTradeCost({
  tokenAmount: 100,
  orderType: "limit",
  limitPriceCents: 55, // 0.55 in cents
});
// → { estimatedCost, potentialReturn, displayShares }
```

## Signing

Both Hyperliquid signing flows are implemented from scratch.

**L1 agent signing** (orders, cancels, USDH spot):

1. Sort action keys in canonical order
2. MessagePack encode
3. Append nonce as BE u64
4. Append vault marker byte
5. Keccak-256 hash -> `connectionId`
6. EIP-712 sign with `Agent` type on chainId `1337`

**User-signed EIP-712** (transfers, withdrawals, sends):

- Domain: `HyperliquidSignTransaction`, `signatureChainId: 0x66eee`
- Message filtered to EIP-712 type keys only
- Requires user wallet, agent keys rejected

## Acknowledgements

Signing implementation inspired by [@nktkas/hyperliquid](https://github.com/nktkas/hyperliquid).

## License

BUSL-1.1

## Builders

Dennis Furrer
