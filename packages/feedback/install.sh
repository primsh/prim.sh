#!/bin/sh
# THIS FILE IS GENERATED — DO NOT EDIT
# Source: packages/feedback/prim.yaml
# Regenerate: pnpm gen:install

# Install feedback.sh — prim.sh
# Usage: curl -fsSL https://feedback.prim.sh/install.sh | sh
set -eu

BIN_DIR="$HOME/.prim/bin"
BIN="$BIN_DIR/prim"
BASE_URL="https://dl.prim.sh/latest"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

BINARY="prim-${OS}-${ARCH}"

echo "Installing prim (${OS}-${ARCH})..."

mkdir -p "$BIN_DIR"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Download binary + checksums
curl -fsSL -o "$TMPDIR/$BINARY" "$BASE_URL/$BINARY"
curl -fsSL -o "$TMPDIR/checksums.sha256" "$BASE_URL/checksums.sha256"

# Verify checksum
cd "$TMPDIR"
EXPECTED=$(grep "$BINARY" checksums.sha256)
if [ -z "$EXPECTED" ]; then
  echo "No checksum found for $BINARY" >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  echo "$EXPECTED" | sha256sum -c >/dev/null
elif command -v shasum >/dev/null 2>&1; then
  echo "$EXPECTED" | shasum -a 256 -c >/dev/null
fi
cd - >/dev/null

# Install binary
cp "$TMPDIR/$BINARY" "$BIN"
chmod +x "$BIN"

# Install feedback.sh skills
"$BIN" install feedback

# Add to PATH
PATH_LINE="export PATH=\"\$HOME/.prim/bin:\$PATH\""
add_to_rc() {
  rc_file="$1"
  if [ -f "$rc_file" ]; then
    if ! grep -qF '.prim/bin' "$rc_file"; then
      printf '\n# prim CLI\n%s\n' "$PATH_LINE" >> "$rc_file"
    fi
  fi
}
add_to_rc "$HOME/.bashrc"
add_to_rc "$HOME/.zshrc"

VERSION=$("$BIN" --version 2>/dev/null || echo "unknown")
echo ""
echo "prim v${VERSION} installed to $BIN"
echo ""
echo "Restart your shell or run:"
echo "  export PATH=\"\$HOME/.prim/bin:\$PATH\""
echo ""
echo "  feedback.sh installed. Your agent can now use feedback tools."
