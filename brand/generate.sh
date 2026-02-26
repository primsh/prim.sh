#!/bin/bash
# Generate brand assets via Gemini 3 Pro image generation.
#
# Usage:
#   ./brand/generate.sh "prompt text" output-name
#
# Output saved to brand/assets/<output-name>.jpg
# Opens in Chrome automatically.
#
# Requires GEMINI_API_KEY in ~/.config/secrets/env

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <prompt> <output-name>"
  echo "Example: $0 'Neon green > on black' favicon-v5"
  exit 1
fi

PROMPT="$1"
OUTPUT_NAME="$2"
OUTPUT_PATH="$(cd "$(dirname "$0")" && pwd)/assets/${OUTPUT_NAME}.jpg"
MODEL="gemini-3-pro-image-preview"

# Load API key
source ~/.config/secrets/env
if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "Error: GEMINI_API_KEY not found in ~/.config/secrets/env"
  exit 1
fi

PAYLOAD=$(jq -n --arg prompt "$PROMPT" '{
  "contents": [{"parts": [{"text": $prompt}]}],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"]
  }
}')

echo "Generating with ${MODEL}..."
RESPONSE_FILE=$(mktemp)

curl -s "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -o "$RESPONSE_FILE"

bun -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('${RESPONSE_FILE}', 'utf8'));
if (data.error) {
  console.error('API Error:', JSON.stringify(data.error, null, 2));
  process.exit(1);
}
let saved = false;
for (const part of data.candidates[0].content.parts) {
  if (part.inlineData) {
    const buf = Buffer.from(part.inlineData.data, 'base64');
    fs.writeFileSync('${OUTPUT_PATH}', buf);
    console.log('Saved ${OUTPUT_PATH} (' + buf.length + ' bytes)');
    saved = true;
  }
}
if (!saved) {
  console.error('No image in response');
  process.exit(1);
}
"

rm -f "$RESPONSE_FILE"

# Open in Chrome
open -a "Google Chrome" "$OUTPUT_PATH"
echo "Opened in Chrome."
