# Changelog

All notable changes to `@outcome.xyz/hip4` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0-beta]: https://github.com/Outcome-xyz/hip4/releases/tag/v1.0.0-beta
