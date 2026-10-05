#!/usr/bin/env bash
# Print the CHANGELOG.md section for one version, without its heading.
#
# Usage: release-notes.sh <version> [changelog-path]
#
# Matches a heading that is exactly "## <version>" (Changesets format) or "## [<version>]" optionally
# followed by " - <date>" (the older hand-written format). Prints everything up to the next "## " heading,
# with leading and trailing blank lines trimmed. Exits 1 with no output when the section is missing or empty.
set -euo pipefail

version="${1:?usage: release-notes.sh <version> [changelog-path]}"
changelog="${2:-CHANGELOG.md}"

notes=$(
  awk -v v="$version" '
    /^## / {
      if (found) exit
      if ($0 == "## " v || $0 == "## [" v "]" || index($0, "## [" v "] - ") == 1) { found = 1 }
      next
    }
    found { print }
  ' "$changelog" | awk '
    NF { started = 1 }
    started { buf[++n] = $0 }
    END {
      while (n > 0 && buf[n] !~ /[^[:space:]]/) n--
      for (i = 1; i <= n; i++) print buf[i]
    }
  '
)

if [ -z "$notes" ]; then
  exit 1
fi
printf '%s\n' "$notes"
