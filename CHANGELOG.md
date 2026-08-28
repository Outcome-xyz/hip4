# Changelog

All notable changes to `@outcome.xyz/hip4` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Deployer actions follow the published HIP-4 reference (breaking within
  the experimental surface).** Deploy and settle actions are now
  `{ type: "outcomeDeploy", venue, operation }` instead of
  `{ type: "spotDeploy", outcome }`; testnet rejects the old shape. Every
  register builder and `RegisterStandaloneOutcomeParams` /
  `RegisterQuestionParams` / `SettleQuestionParams` take a required `venue`;
  `buildSettleOutcomeAction(venue, outcome, fraction)`. The adapter's
  `settleOutcome` / `settleQuestion` read the venue from `outcomeMeta`.
  `buildDeactivateDeployerAction` emits `{ deactivate: null }`. The `details`
  parameter on settlements is gone (the exchange requires it empty).
  `venueNameError` refuses `spot`; questions are capped at 100 named
  outcomes. `buildConvertToMultiSigUserAction` accepts an empty signer set
  for converting back to a normal user; the threshold sent with it (`0`) is
  not published and has not been measured live.

### Added

- `buildRegisterAndAssociateNamedOutcomeAction` /
  `deployer.registerAndAssociateNamedOutcome` and
  `buildSetSubDeployersAction` / `deployer.setSubDeployers`, with parity
  vectors. `MAX_QUESTION_OUTCOMES`, `HLOutcomeDeployAction`,
  `HLSubDeployerVariant`, `HLSubDeployerEntry`.

- **Deployer surface (experimental).** Registering and settling HIP-4 markets,
  deployer activation, agent approval, and Hyperliquid native multi-sig.
  Everything under `hip4.deployer` and the new top-level exports is marked
  `@experimental` and may change without a major version. See
  [docs/DEPLOYER.md](docs/DEPLOYER.md).
  - `hip4.deployer` on the adapter, plus a standalone `HIP4DeployerAdapter`.
  - Action builders: `buildRegisterStandaloneOutcomeAction`,
    `buildRegisterQuestionAction`, `buildSettleOutcomeAction`,
    `buildSettleQuestionAction`, `buildActivateDeployerAction`,
    `buildApproveAgentAction`, `buildConvertToMultiSigUserAction`,
    `buildUserSetAbstractionAction`, `buildTokenDelegateAction`,
    `buildCDepositAction`, `buildCWithdrawAction`. All pure, all producing the
    exact key order the exchange hashes.
  - Multi-sig: `signMultiSigInnerL1Action`,
    `signMultiSigInnerUserSignedAction`, `buildMultiSigAction`,
    `signMultiSigEnvelope`, `multiSigActionHash`, `withMultiSigTypes`. Envelope
    hashing is pinned against the Hyperliquid Python SDK in the test suite.
  - Templates: `requireTemplate`, `validateTemplateInstance`,
    `assertTemplateInstance`, `renderTemplateText`, `instanceDescription`,
    `parseInstanceDescription`, `unfillablePlaceholders`, and the
    `parseSeriesId` / `splitBySeries` versioning helpers.
  - Chain state: `readDeployerSnapshot`, `deployerSteps`, `canDeploy`,
    `deployBlockedReason`, `isDeployerAbstraction`, `DEPLOYER_LIMITS`.
  - Agents: `agentStatus`, `activeAgents`, `expiringAgents`, `findAgent`.
  - Fees: `feeSplit`, `feeAmounts`.
  - Reading a deployed market back: `readDeployedOutcome`,
    `canonicalKeywords`, `eventAtFrom`, `resolutionDeadlineFrom`, `perpFrom`,
    `thresholdFrom`, `scalarBandFrom`. Resolves the keyword aliases that
    differ between template generations (`underlying`/`perp`,
    `targetPrice`/`threshold`, `expiry`/`time`, `target`/`threshold`) and
    keeps a template's event time separate from its resolution deadline.
    Covers the `template:*` markets that `parseDescription` does not, which
    on live testnet is 237 outcomes against 5.
  - Settlement tracking: `settlementQueue`, `settlementStatus`,
    `deployer.fetchSettlementQueue(master, window)`. A template's own
    `resolutionDeadline` is used where it publishes one; otherwise the caller
    supplies the window, which is required and has no default.
  - `suggestPriceSettlement` applies a price template's published rule to a
    mark, using decimal math rather than floats. A suggestion only.
  - `minimalSignatureHex`, and `buildMultiSigAction` applies it. The exchange
    renders `r` and `s` as minimal-length hex when it recomputes the multi-sig
    envelope hash; a standard signer zero-pads, and the forms disagree whenever
    a component's top nibble is zero. That is roughly one submission in four
    with two inner signers, and it fails as `Invalid multi-sig outer signer`.
    Measured on testnet 19 Aug 2026: 0 of 2 accepted zero-padded, 6 of 6
    minimal, 24 of 24 after the fix.
  - `readDeployedOutcomes` and `questionByOutcome`. A question's outcomes carry
    no times of their own, so they inherit the parent question's; without this
    every named outcome read as having no deadline.

### Fixed

- `./types` now points at the declaration files tsup emits. The old paths named
  a directory that was never built. TypeScript fell through to the `default`
  condition and resolved types anyway, so no consumer was broken; the config
  was stale rather than wrong.
- `publishConfig.tag` is `alpha`, so publishing a prerelease cannot move the
  `latest` dist-tag by default.
- `client.fetchOutcomeTemplates()` - the live template registry.
- `client.fetchMultiSigSigners(user)` - authorized users and threshold, or
  `null` for an account that has not been converted.
- `client.fetchDelegatorSummary(user)` - staking balances, which is what a
  deployer's stake requirement is measured against.
- `client.submitAction(action, nonce, signature, vaultAddress?)` - submit any
  already-signed action, including a `multiSig` wrapper.
- `outcomeMeta` now types `deployers` and `feeScale`, and an outcome its
  `venue` and `deployerFeeScale`. `userRole` types the `data.user` field an
  agent role carries.

## [1.0.3-beta] - 2026-07-06

### Fixed

- Shared WebSocket subscriptions are now reference-counted so a single
  `unsubscribe()` no longer tears down the underlying stream for the remaining
  subscribers.

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

[1.0.3-beta]: https://github.com/Outcome-xyz/hip4/releases/tag/v1.0.3-beta
[1.0.2-beta]: https://github.com/Outcome-xyz/hip4/releases/tag/v1.0.2-beta
[1.0.1-beta]: https://github.com/Outcome-xyz/hip4/releases/tag/v1.0.1-beta
[1.0.0-beta]: https://github.com/Outcome-xyz/hip4/releases/tag/v1.0.0-beta
