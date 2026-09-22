---
"@outcome.xyz/hip4": minor
---

`createHIP4Adapter` accepts an optional `minOrderNotional` to raise the client-side order-notional
floor above the protocol `MIN_NOTIONAL` ($1). `getMinShares` gains an optional second parameter for
the same purpose. `MIN_NOTIONAL` itself is unchanged — this is an additive, backward-compatible
config option, not a change to the protocol floor.
