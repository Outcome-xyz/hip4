#!/usr/bin/env bash
# Runs tag-release.sh with DRY_RUN=1 only, in a scratch repo with a fake npm. Nothing is tagged or pushed.
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/tag-release.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir "$tmp/bin" "$tmp/repo"
cat > "$tmp/bin/npm" <<'NPM'
#!/usr/bin/env bash
# fake npm: `view <spec> version` succeeds; `view <spec> gitHead` prints $FAKE_GITHEAD
case "$*" in
  *gitHead*) printf '%s\n' "${FAKE_GITHEAD:-}" ;;
  *) echo "${2#*@}" ;;
esac
NPM
chmod +x "$tmp/bin/npm"
cd "$tmp/repo"
git init -q && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
printf '# Changelog\n\n## 1.0.0\n\n- Note.\n' > CHANGELOG.md
export PATH="$tmp/bin:$PATH" DRY_RUN=1

pkg() { printf '{"name":"@x/y","version":"%s"}\n' "$1" > package.json; }

pkg latest
if out=$("$script" 2>&1); then echo "FAIL non-semver version accepted"; fail=1
elif echo "$out" | grep -q "is not semver" && ! echo "$out" | grep -q "dry-run"; then echo "ok   non-semver version rejected, nothing created"
else echo "FAIL non-semver output: $out"; fail=1; fi

pkg 1.0.0
head=$(git rev-parse HEAD)
out=$(FAKE_GITHEAD=refs/heads/main "$script" 2>&1)
if echo "$out" | grep -q "no gitHead" && echo "$out" | grep -q "tag -a v1.0.0 $head"; then echo "ok   ref-like gitHead ignored"
else echo "FAIL ref-like gitHead: $out"; fail=1; fi

out=$(FAKE_GITHEAD="$head" "$script" 2>&1)
if echo "$out" | grep -q "matches main HEAD" && echo "$out" | grep -q -- "--latest"; then echo "ok   valid gitHead accepted, stable release is latest"
else echo "FAIL valid gitHead: $out"; fail=1; fi
exit "$fail"
