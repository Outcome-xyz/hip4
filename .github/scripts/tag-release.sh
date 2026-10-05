#!/usr/bin/env bash
# Create the git tag and GitHub Release for the version in package.json, once that version is live on npm.
# Idempotent: does nothing while the version is only staged (not yet approved), and skips whatever exists.
#
# Env: GH_TOKEN (required unless DRY_RUN=1), GITHUB_REPOSITORY (owner/name), DRY_RUN=1 to print instead of
# tagging, pushing or releasing. Run from a checkout of main with full history and tags.
set -euo pipefail

dry="${DRY_RUN:-0}"
here="$(cd "$(dirname "$0")" && pwd)"
repo="${GITHUB_REPOSITORY:-Outcome-xyz/hip4}"
run() { if [ "$dry" = "1" ]; then echo "[dry-run] $*"; else "$@"; fi; }

name=$(node -p "require('./package.json').name")
version=$(node -p "require('./package.json').version")
tag="v$version"

if ! npm view "$name@$version" version >/dev/null 2>&1; then
  echo "$name@$version is not live on npm (not published yet, or staged and awaiting approval). Nothing to do."
  exit 0
fi

# Use the commit npm recorded for the published version when it has one; otherwise main's HEAD.
head_sha=$(git rev-parse HEAD)
npm_sha=$(npm view "$name@$version" gitHead 2>/dev/null || true)
target="$head_sha"
if [ -n "$npm_sha" ]; then
  if [ "$npm_sha" = "$head_sha" ]; then
    echo "npm gitHead matches main HEAD ($head_sha)."
  elif git cat-file -e "$npm_sha^{commit}" 2>/dev/null; then
    echo "npm gitHead $npm_sha differs from main HEAD $head_sha; tagging npm's gitHead."
    target="$npm_sha"
  else
    echo "npm gitHead $npm_sha is not in this checkout; tagging main HEAD $head_sha."
  fi
else
  echo "npm reports no gitHead for $version; tagging main HEAD $head_sha."
fi

if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "Tag $tag already exists on origin."
else
  echo "Creating annotated tag $tag at $target."
  run git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    tag -a "$tag" "$target" -m "$name $version"
  run git push origin "refs/tags/$tag"
fi

if [ "$dry" != "1" ] && gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
  echo "GitHub Release $tag already exists. Nothing more to do."
  exit 0
fi

# Previous release tag = the next lower version tag (prereleases sort below their stable version).
prev=$(git -c versionsort.suffix=- tag -l 'v[0-9]*' --sort=-v:refname | awk -v t="$tag" 'found { print; exit } $0 == t { found = 1 }')

notes_file=$(mktemp)
if "$here/release-notes.sh" "$version" CHANGELOG.md > "$notes_file"; then
  have_notes=1
else
  have_notes=0
  echo "No CHANGELOG.md section for $version; falling back to generated notes."
fi
if [ -n "$prev" ]; then
  { [ "$have_notes" = "1" ] && echo; echo "**Full diff**: https://github.com/$repo/compare/$prev...$tag"; } >> "$notes_file"
fi

args=(release create "$tag" --repo "$repo" --title "$tag" --verify-tag)
if [ "$have_notes" = "1" ]; then
  args+=(--notes-file "$notes_file")
else
  args+=(--generate-notes)
  [ -n "$prev" ] && args+=(--notes-start-tag "$prev")
fi
case "$version" in
  *-*) args+=(--prerelease --latest=false) ;;
  *) args+=(--latest) ;;
esac

echo "Creating GitHub Release $tag (previous tag: ${prev:-none})."
run gh "${args[@]}"
if [ "$dry" = "1" ]; then echo "--- notes ---"; cat "$notes_file"; fi
