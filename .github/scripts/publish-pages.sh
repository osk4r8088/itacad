#!/usr/bin/env bash
# Publishes a directory to the gh-pages branch, which GitHub Pages serves.
#
#   publish-pages.sh root  <dir>  <message>   the site itself, at the top level; pr-* folders stay
#   publish-pages.sh pr-12 <dir>  <message>   a pull request preview in its own folder
#   publish-pages.sh pr-12 ""     <message>   removes that preview
#
# Main deploys and previews can run at the same time. If the push loses the race, the script
# clones again and repeats its change on top of the other one.
set -euo pipefail

target="$1"
src="${2:+$(realpath "$2")}"
message="$3"
remote="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

for attempt in 1 2 3 4 5; do
  work="$(mktemp -d)"
  cd "$work"
  if git clone --quiet --depth 1 --branch gh-pages "$remote" site 2>/dev/null; then
    cd site
  else
    # First publish: the branch does not exist yet.
    git init --quiet site
    cd site
    git checkout --quiet --orphan gh-pages
    git remote add origin "$remote"
  fi
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

  # Serve the files as they are, without Jekyll.
  touch .nojekyll
  if [ "$target" = root ]; then
    find . -mindepth 1 -maxdepth 1 ! -name .git ! -name .nojekyll ! -name 'pr-*' -exec rm -rf {} +
    cp -r "$src"/. .
  else
    rm -rf "$target"
    if [ -n "$src" ]; then
      mkdir "$target"
      cp -r "$src"/. "$target"/
    fi
  fi

  git add --all
  if git diff --cached --quiet; then
    echo 'Nothing to publish.'
    exit 0
  fi
  git commit --quiet -m "$message"
  if git push --quiet origin gh-pages; then
    echo "Published $target (attempt $attempt)."
    exit 0
  fi
  echo "Push rejected, retrying (attempt $attempt)."
  sleep $((attempt * 3))
done
echo 'Could not publish after 5 attempts.' >&2
exit 1
