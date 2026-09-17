#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
cat .source/part_*.b64 | base64 -d | gzip -dc > public/index.html
printf '%s  %s\n' 'ec5a39cdcc24356d20d635344637f6fa073cb946c015a1ed88393f179b6a01ef' 'public/index.html' | sha256sum -c -
