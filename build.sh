#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
cat .source/part_*.b64 | base64 -d | gzip -dc > public/index.html
printf '%s  %s\n' '9b379496c21a665b285241b14c77cbbc5541f0e1c1e9e6163187d090f7d1c66a' 'public/index.html' | sha256sum -c -
