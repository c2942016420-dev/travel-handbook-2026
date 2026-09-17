#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
cat .source/part_*.b64 | base64 -d | gzip -dc > public/index.html
printf '%s  %s\n' '04776e192db786fea81ced27e9aaede62db268c4233a48fe82c4b41db50fe862' 'public/index.html' | sha256sum -c -
