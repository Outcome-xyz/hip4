---
"@outcome.xyz/hip4": patch
---

Releases are now automated with Changesets. Every PR that should ship a release adds a `.changeset/*.md` file
(`pnpm changeset`); merging to `main` opens or updates a "Version Packages" PR, and merging that PR bumps the
version and regenerates this changelog. This replaces hand-editing `CHANGELOG.md`. hip4 stays on the `beta`
prerelease channel (versions are `X.Y.Z-beta.N`, one dot-number higher than the previous bare `X.Y.Z-beta`
tags — still valid semver, just a visible format change) — no change to which npm dist-tag consumers install
from.

Publishing itself is no longer automatic end to end, and that's deliberate. It uses npm's OIDC **trusted
publishing** in **staged** mode: no npm token is stored anywhere, CI stages the release non-interactively, and
it only goes live once a maintainer approves it with 2FA (via `npm stage approve` or npmjs.com) — even a fully
compromised CI run can stage a package but never publish it unattended. A **git tag** for the release is
created only after that approval, on the next push to `main` that finds the version already live (or
immediately, if the approving maintainer runs `pnpm changeset git-tag && git push --tags` themselves right
after approving) — not automatically the moment the Version Packages PR is merged. Each approved publish
additionally carries a signed provenance attestation — `npm view @outcome.xyz/hip4 --json` shows a
`dist.attestations` entry, and the npmjs.com package page's Provenance panel shows the publish identity as
`GitHub Actions`, not a personal account.
