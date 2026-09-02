# Outcome Rewards

A read of what the Outcome Markets liquidity-rewards programme has paid:
programme-wide totals, one wallet's earnings, the reward periods behind
them, and a leaderboard.

## How it works

This is a separate service from Monarch - it reads Monarch's finalized
reward periods and the actual USDC transfers on Hypercore, and adds
attribution: which reward period each payment belongs to, and what is
owed but not yet sent.

`paidUsdc` is money that has left the treasury. `pendingUsdc` is money
Monarch has finalized and is owed, between finalization and the payout
sweep (every ten minutes) - usually minutes. `awardedUsdc` is the two
combined, minus dust below the minimum payout and rows an operator
dismissed - those were awarded and deliberately never sent.

## Usage

```typescript
import { outcomeRewards } from "@outcome.xyz/hip4";
```

### Programme totals

```typescript
const totals = await outcomeRewards.programme();
```

| Field           | What it is                                          |
| --------------- | ---------------------------------------------------- |
| `paidUsdc`      | USDC actually transferred to wallets so far          |
| `pendingUsdc`   | USDC finalized but not yet swept to wallets          |
| `awardedUsdc`   | `paidUsdc + pendingUsdc`, excluding dust/dismissed   |
| `rewardPeriods` | Count of finalized reward periods                    |
| `lastPaidAt`    | Time of the most recent transfer                     |
| `last24h`       | Rolling trailing-24-hour totals (`paidUsdc`, `payments`) |
| `today`         | Totals since the current UTC day began (`paidUsdc`, `payments`, `wallets`) |

### One wallet's earnings

```typescript
const mine = await outcomeRewards.wallet("0x...");
```

Same totals, scoped to one wallet, plus `rewards`: one row per reward
period the wallet earned in, newest first, up to 500. An address with no
rewards returns zeroes and an empty list - not an error.

### Reward periods

```typescript
const periods = await outcomeRewards.periods({ limit: 50 });
```

Every finalized reward period, newest first. `state` is `"unpaid"`,
`"partial"`, or `"paid"`.

### Leaderboard

```typescript
const board = await outcomeRewards.leaderboard({ limit: 10 });
```

Wallets ranked by USDC actually paid (not awarded) - a rank never changes
without a real payment.

## Limits

The upstream API allows 120 requests a minute per IP and caches responses
for 60 seconds (30 seconds for a single wallet). The underlying ledger
changes at most once every ten minutes, when the payout sweep runs -
polling faster than that buys nothing. `outcomeRewardsGet` retries once on
5xx/network errors; 4xx (429 rate-limiting included) throws
`OutcomeRewardsError` immediately rather than retrying into the limit.
