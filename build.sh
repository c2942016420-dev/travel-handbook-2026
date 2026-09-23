#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
cat .source/part_*.b64 | base64 -d | gzip -dc > public/index.html
printf '%s  %s\n' 'f334f8601b193e562e3c225eaa80b8d59476fd9efeddddf2084bbe76374672c3' 'public/index.html' | sha256sum -c -
