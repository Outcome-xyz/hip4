---
"@outcome.xyz/hip4": patch
---

CI gate added. `.github/workflows/ci.yml` now runs typecheck, build, and the test suite (Node 20 and 24) on every
pull request and on push to `main`. No change to published behavior. Node pinned to `24` via `.nvmrc`/`packageManager`;
the test matrix omits Node 18 because `vitest@4` requires Node `^20.0.0 || ^22.0.0 || >=24.0.0`.
