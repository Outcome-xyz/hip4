---
"@outcome.xyz/hip4": minor
---

BREAKING: `createHIP4Adapter()` and `new HIP4Client()` called without `testnet` now target mainnet and
sign orders with real funds. Before, they targeted testnet. Pass `testnet: true` to keep the old behaviour.

`placeOrder` and `placeOrders` return Hyperliquid's message when the exchange rejects the whole request,
for example "User or API Wallet 0x... does not exist.", instead of "Exchange returned non-ok status".

Limit order prices are rounded to 5 decimals, the outcome price tick. Before, prices below 0.1 could be
sent with 6 or more decimals (0.012345 stayed 0.012345). `formatOutcomePrice` is exported for the same
rounding in your own code.

`fetchMarkets` now applies `sortBy`. It was ignored before. `"newest"` puts the highest outcome id first,
`"expiry"` the soonest event time, and `"volume"` the highest 24h volume (one extra `spotMetaAndAssetCtxs`
request). Without `sortBy` the order is unchanged.

Template markets are named from the `outcomeTemplates` registry, for example "BTC touches 90000 by Nov 1,
00:00 UTC" instead of "template:priceTouch". This applies consistently to `fetchMarkets`, `fetchEvents`,
`fetchEvent`, `fetchPositions` side names and `outcomeCreated` updates. The fallback outcome of a template
question is named "Other". If the registry cannot be fetched, the `template:` prefix is still removed from
plain names such as "template:Yes". Refreshing the market or event cache now makes one extra
`outcomeTemplates` request (cached for 30 seconds and shared by both). `classifyOutcome` and
`classifyAllOutcomes` take the registry as an optional last argument. New `HIP4Client.fetchSpotAssetCtxs()`.

`fetchPositions` now reports `currentPrice` and `unrealizedPnl` for outcome positions. Spot balances name
side coins `+<coin>` while mids use `#<coin>`, so the price lookup found nothing and returned "0".
