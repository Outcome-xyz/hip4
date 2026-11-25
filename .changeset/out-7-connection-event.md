---
"@outcome.xyz/hip4": minor
---

Add an `onConnectionEvent` callback to `HIP4ClientConfig` / `CreateHIP4AdapterConfig`.

A dropped WebSocket used to be invisible to consumers: the feed just went
quiet, and giving up after the reconnect budget was a single warn log. The
callback now receives a `HIP4ConnectionEvent`: `closed` (with the close `code`)
when the socket drops under live subscriptions — never for a consumer
`closeWs()` / last-unsubscribe teardown — and `max_reconnect` when the client
stops retrying. `attempts` resets to 0 on every successful open. Backward
compatible: the default is a no-op and a throwing callback is swallowed.

Also fixes teardown ordering: `closeWs()` and the last-unsubscribe path now
detach the socket before calling `close()`. Runtimes that fire `onclose`
synchronously inside `close()` (e.g. Node's WebSocket) previously saw a
teardown as a drop and armed a stray reconnect timer.

A `subscribe()` that has to open a socket while no reconnect is pending (after
giving up, or after every subscriber left mid-backoff) now starts with a fresh
reconnect budget instead of the stale count, so it retries with full backoff
again and reports its first drop as `attempts: 0` rather than repeating
`max_reconnect`.
