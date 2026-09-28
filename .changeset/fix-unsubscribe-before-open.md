---
"@outcome.xyz/hip4": patch
---

`HIP4Client.subscribe`: unsubscribing before the WebSocket has opened now removes the queued
subscribe message instead of leaving it in the queue. Previously the cancelled subscription was
still sent when the socket opened, with no unsubscribe to follow, so its frames kept arriving on the
shared response channel (for example a coarse `l2Book` with `nSigFigs` overwriting a full-precision
book subscribed right after it). Identical subscribe messages are also no longer queued twice, so a
socket that drops before opening and reconnects sends each subscription once.
