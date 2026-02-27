#!/usr/bin/env bash
# prim-env.sh — shared constants for all prim deploy/ops scripts
#
# Source this file from any script that needs these values:
#   source "$(dirname "${BASH_SOURCE[0]}")/prim-env.sh"      # from deploy/prim/
#   source "$(dirname "${BASH_SOURCE[0]}")/../deploy/prim/prim-env.sh"  # from scripts/
#
# Do not duplicate these values in individual scripts.

REPO_URL="https://github.com/primsh/prim.sh"
REPO_DIR="/opt/prim"
PRIM_USER="prim"
ENV_DIR="/etc/prim"

# x402 network identifiers (mirrors packages/x402-middleware/src/network-config.ts)
MAINNET="eip155:8453"
TESTNET="eip155:84532"
