#!/usr/bin/env bash
# Pre-release validation — run before `git tag && git push`.
# Usage: bash scripts/pre-release.sh 0.2.0
set -euo pipefail

VERSION="${1:?Usage: bash scripts/pre-release.sh <version> (e.g. 0.2.0)}"
TAG="v${VERSION}"
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')

REQUIRED_CHECKS=("Lint" "Typecheck" "Test" "Gen check" "Audit" "Safeguards" "Secret scan")

# 1. Clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree is not clean"
  git status --short
  exit 1
fi
echo "✓ Working tree clean"

# 2. On main branch
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "✗ Not on main (on: ${BRANCH})"
  exit 1
fi
echo "✓ On main"

# 3. Local matches remote
git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "✗ Local main (${LOCAL:0:8}) != origin/main (${REMOTE:0:8})"
  exit 1
fi
echo "✓ In sync with origin/main"

# 4. CI checks passed
echo "Checking CI on ${LOCAL:0:8}..."
CHECKS=$(gh api "repos/${REPO}/commits/${LOCAL}/check-runs" \
  --paginate --jq '.check_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"')

FAILED=0
for check in "${REQUIRED_CHECKS[@]}"; do
  line=$(echo "$CHECKS" | awk -F'\t' -v name="$check" '$1 == name' | head -1)
  if [[ -z "$line" ]]; then
    echo "  ✗ ${check} — not found"
    FAILED=1
  else
    status=$(echo "$line" | cut -f2)
    conclusion=$(echo "$line" | cut -f3)
    if [[ "$status" != "completed" ]]; then
      echo "  ✗ ${check} — still ${status}"
      FAILED=1
    elif [[ "$conclusion" != "success" ]]; then
      echo "  ✗ ${check} — ${conclusion}"
      FAILED=1
    else
      echo "  ✓ ${check}"
    fi
  fi
done
if [[ $FAILED -ne 0 ]]; then
  echo "✗ CI checks failed"
  exit 1
fi
echo "✓ All CI checks passed"

# 5. Tag doesn't exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "✗ Tag ${TAG} exists locally"
  exit 1
fi
if git ls-remote --tags origin "$TAG" | grep -q "$TAG"; then
  echo "✗ Tag ${TAG} exists on remote"
  exit 1
fi
echo "✓ Tag ${TAG} available"

# 6. Version not on npm
if npm view "@primsh/mcp@${VERSION}" version >/dev/null 2>&1; then
  echo "✗ @primsh/mcp@${VERSION} already on npm"
  exit 1
fi
echo "✓ @primsh/mcp@${VERSION} not on npm"

# 7. MCP package builds
echo "Building @primsh/mcp..."
pnpm --filter @primsh/x402-middleware build > /dev/null
pnpm --filter @primsh/mcp build > /dev/null
echo "✓ MCP builds"

echo ""
echo "Ready to release. Run:"
echo "  git tag ${TAG} && git push origin ${TAG}"
