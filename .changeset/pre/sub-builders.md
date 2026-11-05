---
"@outcome.xyz/hip4": minor
---

Orders can now split the builder fee with sub-builders. Pass `subBuilders` (up to 5) on the adapter config or per
order on `placeOrder` and `placeOrders`; each entry takes exactly one of `share` (raw units of 0.001% of the
builder fee) or `sharePercent`. Entries are validated before signing and require a builder address. A batch
signs one builder, so every order must resolve to the same one. Repeating the adapter builder address keeps
its sub-builders. A different address with no sub-builders does not. Without `subBuilders` the order action is
unchanged.
