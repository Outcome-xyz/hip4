---
"@outcome.xyz/hip4": patch
---

`readDeployedOutcomes` now accepts the same optional `declared` keyword set as `readDeployedOutcome` and
`parseInstanceDescription`, and `settlementStatus` accepts it for raw outcomes. Without it the behaviour is
unchanged: a glued `metadata=` tag is cut from values. The 1.3.0 notes said `readDeployedOutcomes` took this set
before it did.

`fetchMarkets` with `sortBy: "expiry"` now handles metadata tags the same way as the rendered market names, using
the template's declared keywords, so the sort order and the displayed event time agree. A fallback outcome whose
plain name merely starts with `template` is no longer renamed "Other"; only `template:` names are.
