#!/bin/sh
# Configure git to use the shared hooks directory
git config core.hooksPath .githooks
echo "Git hooks installed (.githooks/)"
