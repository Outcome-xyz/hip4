#!/usr/bin/env bash
# Checks release-notes.sh against fixtures and the real CHANGELOG.md. Run from the repo root.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
script="$here/release-notes.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected [$2] got [$3]"; fail=1; fi; }

cat > "$tmp/c.md" <<'MD'
# Changelog

## 2.0.0

### Minor Changes

- Two.

## 1.0.0-beta.1

- One beta.

## [0.9.0-beta] - 2026-01-01

### Fixed

- Old format.
MD

check "first section" "$(printf '### Minor Changes\n\n- Two.')" "$("$script" 2.0.0 "$tmp/c.md")"
check "prerelease is not a prefix match" "- One beta." "$("$script" 1.0.0-beta.1 "$tmp/c.md")"
check "bracket+date format" "$(printf '### Fixed\n\n- Old format.')" "$("$script" 0.9.0-beta "$tmp/c.md")"
if "$script" 2.0 "$tmp/c.md" >/dev/null; then echo "FAIL partial version matched"; fail=1; else echo "ok   partial version does not match"; fi
if "$script" 9.9.9 "$tmp/c.md" >/dev/null; then echo "FAIL missing version matched"; fail=1; else echo "ok   missing version exits non-zero"; fi

if [ -f CHANGELOG.md ]; then
  for v in 1.3.0-beta.0 1.2.0-beta.2; do
    out="$("$script" "$v" CHANGELOG.md)"
    case "$out" in
      "") echo "FAIL real $v empty"; fail=1 ;;
      "## "*|*$'\n'"## "*) echo "FAIL real $v leaked another heading"; fail=1 ;;
      *) echo "ok   real CHANGELOG.md $v ($(printf '%s\n' "$out" | wc -l | tr -d ' ') lines)" ;;
    esac
  done
  if "$script" 99.0.0 CHANGELOG.md >/dev/null; then echo "FAIL real missing matched"; fail=1; else echo "ok   real CHANGELOG.md 99.0.0 missing"; fi
fi
exit "$fail"
