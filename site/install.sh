#!/bin/sh
# Install script for the prim CLI
# Usage: curl -fsSL prim.sh/install | sh
set -eu

INSTALL_DIR="$HOME/.prim/bin"
BIN="$INSTALL_DIR/prim"

# Detect OS
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$OS" in
  darwin) ;;
  linux) ;;
  *)
    echo "Error: unsupported OS: $OS" >&2
    exit 1
    ;;
esac

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64)        ARCH="x64" ;;
  *)
    echo "Error: unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

BINARY="prim-${OS}-${ARCH}"
BASE_URL="https://dl.prim.sh/latest"

echo "Installing prim (${OS}-${ARCH})..."

# Download binary + checksum
mkdir -p "$INSTALL_DIR"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

curl -fsSL -o "$TMPDIR/$BINARY" "$BASE_URL/$BINARY"
curl -fsSL -o "$TMPDIR/$BINARY.sha256" "$BASE_URL/$BINARY.sha256"

# Verify checksum
echo "Verifying checksum..."
cd "$TMPDIR"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c "$BINARY.sha256" >/dev/null
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 -c "$BINARY.sha256" >/dev/null
else
  echo "Warning: no sha256sum or shasum found, skipping verification" >&2
fi
cd - >/dev/null

# Install
mv "$TMPDIR/$BINARY" "$BIN"
chmod +x "$BIN"

# Add to PATH if not already present
PATH_LINE="export PATH=\"\$HOME/.prim/bin:\$PATH\""

add_to_rc() {
  rc_file="$1"
  if [ -f "$rc_file" ]; then
    if ! grep -qF '.prim/bin' "$rc_file"; then
      echo "" >> "$rc_file"
      echo "# prim CLI" >> "$rc_file"
      echo "$PATH_LINE" >> "$rc_file"
    fi
  fi
}

add_to_rc "$HOME/.bashrc"
add_to_rc "$HOME/.zshrc"

# Verify installation
VERSION=$("$BIN" --version 2>/dev/null || echo "unknown")
echo ""
echo "prim v${VERSION} installed to $BIN"
echo ""
echo "Restart your shell or run:"
echo "  export PATH=\"\$HOME/.prim/bin:\$PATH\""
echo ""
echo "Then try:"
echo "  prim wallet create"
