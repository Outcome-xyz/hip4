---
"@outcome.xyz/hip4": patch
---

hip4 now ships stable versions. Releases are plain `X.Y.Z` (no `-beta` suffix) and are published to the npm
`latest` dist-tag, so `npm install @outcome.xyz/hip4` resolves to the newest release without a tag. The
`beta` dist-tag is no longer updated; it keeps pointing at `1.3.0-beta.0`.

Releases are still staged through npm trusted publishing and go live only after a maintainer approves them with
2FA. Once a release is live, its git tag (`vX.Y.Z`) and GitHub Release (with these notes) are created
automatically.
