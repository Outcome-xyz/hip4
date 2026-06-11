# Liquidity Rewards

Check which markets are eligible for liquidity rewards, and what each wallet
is earning, by season.

`s1` = the World Cup 2026 campaign (June 11 – July 19).

## How it works

```
SDK ──> Monarch rewards API (public, no auth)
        api.monarch.fast — configured in src/liquidity-rewards/config.ts
```

Eligibility is per team: each day (rolling 09:00 UTC) Monarch decides which
countries' winner books are inside the 1%–99% mid band, plus which match
books are in the incentive window. If a team is eligible that day, maker
orders on its markets earn rewards. Monarch handles all scoring and payout
math; the SDK reads it directly and normalizes the responses.

The base URL and season → campaign mapping live in `LIQUIDITY_REWARDS_CONFIG`
(a config file in code — never environment variables). Season implementations
live under `src/liquidity-rewards/season/<n>/<campaign>/` — season 1 is
`season/1/wc/`.

## Usage

```typescript
import { liquidityRewards } from "@outcome.xyz/hip4";

const s1 = liquidityRewards.season("s1");
```

### Eligibility

```typescript
const teams = await s1.checkEligibility({ subject: "teams" });
const matches = await s1.checkEligibility({ subject: "matches" });
const past = await s1.checkEligibility({ subject: "teams", date: "2026-06-08" });
```

| Field         | What it is                                                          |
| ------------- | --------------------------------------------------------------------- |
| `eligible`    | Books eligible on the scoring day (`hyperliquidOutcomeId` per book)  |
| `ineligible`  | Teams outside the 1%–99% band (`subject: "teams"` only)             |
| `builderCode` | Orders only earn rewards when placed with this builder code         |
| `epochDate`   | The scoring day this data belongs to                                 |

### Rewards (for the UI rewards page)

```typescript
const rewards = await s1.checkRewards({ wallet: "0x..." });
```

Each row in `rewards.scores` is one (wallet, scored book) pair:

- **While the day is live** (`epochStatus: "provisional"`): `totalScore` is
  the wallet's provisional score — its relative share of the day's pot.
  `dailyRewardUsdc` is `null`.
- **Once the day settles** (`epochStatus: "final"`, updated once daily):
  `dailyRewardUsdc` and `cumulativeRewardUsdc` carry the actual USDC
  amounts and may be summed by wallet.

Empty `scores` for upcoming days is normal ("no scores yet"), not an error.

## New seasons

When a new rewards season launches, add one line to the `seasons` map in
`src/liquidity-rewards/config.ts` mapping the season id to its campaign,
and add its implementation under `src/liquidity-rewards/season/<n>/`.
Then call `liquidityRewards.season("s2")`.
