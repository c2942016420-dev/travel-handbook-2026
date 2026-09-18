#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
cat .source/part_*.b64 | base64 -d | gzip -dc > public/index.html
printf '%s  %s\n' 'e1461797f96c59811a4a136badb76335b2d0b9624c5fb1ea4be4d8438ccd3048' 'public/index.html' | sha256sum -c -
