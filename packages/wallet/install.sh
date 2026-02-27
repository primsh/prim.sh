#!/bin/sh
# Install wallet.sh — prim.sh
# Usage: curl -fsSL https://wallet.prim.sh/install.sh | sh
set -eu

LIB_DIR="$HOME/.prim/lib"
BIN_DIR="$HOME/.prim/bin"
BIN="$BIN_DIR/prim"
CLI="$LIB_DIR/cli.js"
BASE_URL="https://dl.prim.sh/latest"

# Ensure Bun is installed
if ! command -v bun >/dev/null 2>&1; then
  echo "Bun not found. Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

echo "Installing prim..."

mkdir -p "$LIB_DIR" "$BIN_DIR"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Download bundle + checksum
curl -fsSL -o "$TMPDIR/cli.js" "$BASE_URL/cli.js"
curl -fsSL -o "$TMPDIR/cli.js.sha256" "$BASE_URL/cli.js.sha256"

# Verify checksum
cd "$TMPDIR"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c cli.js.sha256 >/dev/null
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 -c cli.js.sha256 >/dev/null
fi
cd - >/dev/null

# Install bundle
cp "$TMPDIR/cli.js" "$CLI"

# Write wrapper
cat > "$BIN" <<'EOF'
#!/bin/sh
exec bun run "$HOME/.prim/lib/cli.js" "$@"
EOF
chmod +x "$BIN"

# Install wallet.sh skills
"$BIN" install wallet

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
echo "  wallet.sh installed. Your agent can now use wallet tools."
