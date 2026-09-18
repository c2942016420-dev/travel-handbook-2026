#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
cat .source/part_*.b64 | base64 -d | gzip -dc > public/index.html
printf '%s  %s\n' '13a2413250c48d901af37be982aee320a9c6566fbf75c67cc6e25673268ac104' 'public/index.html' | sha256sum -c -
