---
"@outcome.xyz/hip4": minor
---

`fetchPositions` now reports `currentPrice` and `unrealizedPnl` for outcome positions. Spot balances name
side coins `+<coin>` while mids use `#<coin>`, so the price lookup found nothing and returned "0".

Limit order prices are rounded to 5 decimals, the outcome price tick, in `placeOrder` and `placeOrders`. Before,
prices below 0.1 could be sent with 6 or more decimals (0.012345 stayed 0.012345). `formatOutcomePrice` is
exported for the same rounding in your own code.

`fetchMarkets` now applies `sortBy`. It was ignored before. `"newest"` puts the highest outcome id first,
`"expiry"` the soonest event time, and `"volume"` the highest 24h volume (one extra `spotMetaAndAssetCtxs`
request). Without `sortBy` the order is unchanged.

Names from `fetchMarkets`, `fetchEvents`, `fetchEvent`, `fetchPrice`, `subscribePrice`, `fetchPositions` and
`outcomeCreated` updates stay the names sent on chain, as before (for example "template:priceTouch"). The names
rendered from the `outcomeTemplates` registry, for example "BTC touches 90000 by Nov 1, 00:00 UTC", are in new
optional fields: `parsedName`, `sides[].parsedName`, `parsedQuestionName`, `parsedTitle`, `parsedQuestion`,
`parsedEventTitle`, `parsedMarketQuestion`, `parsedOutcomeName` and the `parsedName` of each price outcome. The
fallback outcome of a template question is rendered as "Other". If the registry cannot be fetched, the `template:`
prefix is still removed from plain names such as "template:Yes" in the parsed fields.
`HIP4EventAdapter.getParsedSideNameResolver()` returns the rendered side names, while `getSideNameResolver()`
keeps returning the wire names. Refreshing the market or event cache now makes one extra `outcomeTemplates`
request (cached for 30 seconds and shared by both). `classifyOutcome` and `classifyAllOutcomes` take the
registry as an optional last argument. New `HIP4Client.fetchSpotAssetCtxs()`.

When Hyperliquid rejects a whole `placeOrder` or `placeOrders` request, `error` stays "Exchange returned non-ok
status". Hyperliquid's own message, for example "User or API Wallet 0x... does not exist.", is in the new
optional `raw` field of the result.

`parseInstanceDescription`, `readDeployedOutcome` and `readDeployedOutcomes` cut the `metadata=` routing tag
deployers glue onto a value, so `threshold:65000 metadata=category:economics` reads as `65000`. They take an
optional set of declared keyword names (`declared`) to also drop the tag body's segments.
