#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
cat .source/part_*.b64 | base64 -d | gzip -dc > public/index.html
printf '%s  %s\n' '4810d468e2e665dd50f1e6a2da4efd4a27bb4f356212779c054dd5c385c0ab03' 'public/index.html' | sha256sum -c -
