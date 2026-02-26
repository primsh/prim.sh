#!/bin/bash
set -euo pipefail

VERSION=$(node -p "require('./packages/keystore/package.json').version")
echo "Building prim CLI v${VERSION}..."

mkdir -p dist

for target in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
  echo "  Building bun-${target}..."
  bun build packages/keystore/src/cli.ts \
    --compile --target=bun-${target} \
    --outfile dist/prim-${target}
done

echo "Done. Binaries in dist/"
ls -lh dist/prim-*
