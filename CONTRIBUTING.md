# Contributing

## Getting started

Clone the repo and make sure you're on Node 18+ with pnpm installed.

## Install dependencies

```bash
pnpm install
```

## Run the tests

```bash
pnpm test
```

## Type-check

```bash
pnpm typecheck
```

## Build

```bash
pnpm build
```

## Releases

Releases are stable versions (`X.Y.Z`) published to the npm `latest` dist-tag. They are automated with
[Changesets](https://github.com/changesets/changesets):

1. Every PR that should ship a release adds a changeset with `pnpm changeset`. Pick the bump (patch, minor or
   major) and write the note as it should read in the changelog.
2. Merging to `main` opens or updates a "Version Packages" PR that bumps `package.json` and regenerates
   `CHANGELOG.md`. Do not edit either by hand.
3. Merging the Version Packages PR makes the Release workflow stage the package with npm trusted publishing.
   No npm token is stored anywhere, and a staged release is not live yet.
4. A maintainer approves the staged release with 2FA, either on the package's Publishing tab on npmjs.com or
   with `npm stage list @outcome.xyz/hip4` and `npm stage approve <stage-id>` (needs npm 11.15 or later).
5. Once the version is live on npm, the Tag release workflow creates the `vX.Y.Z` git tag and a GitHub Release
   with that version's changelog section. It checks every 20 minutes and on every push to `main`, so this
   happens by itself shortly after approval. It does nothing while a release is only staged, and it can be run
   from the Actions tab to skip the wait.

## Raising issues

Please open an issue against the [GitHub repository](https://github.com/Outcome-xyz/hip4/issues).
The maintainers will address it in due course.
