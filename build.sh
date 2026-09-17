#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
cat .source/part_*.b64 | base64 -d | gzip -dc > public/index.html
printf '%s  %s\n' '9e3607b3e32a78e4bd38313a11c8785ccc5671371d3739d759cee846469588b4' 'public/index.html' | sha256sum -c -
