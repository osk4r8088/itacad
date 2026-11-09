#!/usr/bin/env bash
# Writes the preview comment on a pull request, or updates it if it exists, so there is only one.
#   preview-comment.sh <pr number> <body>
set -euo pipefail

pr="$1"
marker='<!-- pr-preview -->'
body="$marker
$2"

id="$(gh api "repos/${GITHUB_REPOSITORY}/issues/${pr}/comments" --paginate \
  --jq ".[] | select(.body | startswith(\"${marker}\")) | .id" | head -n 1)"
if [ -n "$id" ]; then
  gh api --method PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${id}" -f body="$body" > /dev/null
else
  gh api --method POST "repos/${GITHUB_REPOSITORY}/issues/${pr}/comments" -f body="$body" > /dev/null
fi
