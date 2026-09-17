#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
cat .source/part_*.b64 | base64 -d | gzip -dc > public/index.html
printf '%s  %s\n' '42049121107f60959597d61ab1883d0ba40d971e6b998495dbd56114c652123c' 'public/index.html' | sha256sum -c -
