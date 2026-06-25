# Changelog

All notable changes to `@outcome.xyz/hip4` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2-beta] - 2026-06-25

### Added

- `wallet.sellHype(amount)` - sell HYPE on the HYPE/USDC spot market. Size is
  floored to HYPE's 2 decimals (`ROUND_DOWN`) so a sell never exceeds the
  caller's balance.
- `wallet.agentSetAbstraction("u" | "p" | "i")` - switch the master account's
  abstraction mode (`"u"` unifiedAccount, `"p"` portfolioMargin, `"i"`
  disabled) via the approved agent key.
- `client.fetchUserNonFundingLedgerUpdates(user)` - REST counterpart of the
  `userNonFundingLedgerUpdates` channel (deposits, withdrawals, transfers),
  returned newest-first.
- `participantsCount` on liquidity-reward `checkRewards` results - total
  distinct participants for the epoch, independent of the `wallet` filter.
- Exported `HYPE_USDC_SPOT_INDEX_MAINNET` / `HYPE_USDC_SPOT_INDEX_TESTNET`
  constants and `HLLedgerUpdate`, `HLLedgerDelta`, `HLWebData3`,
  `HLClearinghouseState`, `HLFrontendOrder` types from the root entry point.

## [1.0.1-beta] - 2026-06-11

### Added

- `liquidityRewards` module - season-scoped liquidity-reward checks
  (`liquidityRewards.season("s1")` for the World Cup 2026 campaign):
  - `checkEligibility({ subject })` - eligible team/match markets.
  - `checkRewards({ wallet, date })` - per-wallet reward scores.
  - `LIQUIDITY_REWARDS_CONFIG` - in-code endpoint and season mappings.
  - `LiquidityRewardsError` and typed results exported from the root
    entry point.
- Example: `examples/wc-liq-rewards-s1-get-markets.ts`.
- Docs: `docs/LIQUIDITY-REWARDS.md` and a README section on liquidity
  rewards.

## [1.0.0-beta] - 2026-05-20

Initial public beta release.

### Added

- `createHIP4Adapter()` - single entry point for HIP-4 prediction market access
  on Hyperliquid (events, market data, account state, trading, wallet, auth).
- Typed sub-modules: `events`, `marketData`, `account`, `trading`, `wallet`,
  `auth`, `ramp`.
- WebSocket subscriptions for prices, order books, fills, and positions
  (return an unsubscribe function).
- Internal L1 agent + EIP-712 signing - no external crypto dependencies.
- Decimal-precision math helpers under `lib/precision` for safe price/size
  arithmetic.
- Stream helpers: `createPriceFeed`, `createPerpPriceFeed`.
- Type-only entry point: `import type { ... } from "@outcome.xyz/hip4/types"`.

### Notes

- Zero runtime dependencies.
- Node 18+ required.
- React bindings live in a separate package (`@outcome.xyz/hip4-react`).

[1.0.2-beta]: https://github.com/Outcome-xyz/hip4/releases/tag/v1.0.2-beta
[1.0.1-beta]: https://github.com/Outcome-xyz/hip4/releases/tag/v1.0.1-beta
[1.0.0-beta]: https://github.com/Outcome-xyz/hip4/releases/tag/v1.0.0-beta
