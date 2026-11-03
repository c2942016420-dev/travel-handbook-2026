#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
cat .source/part_*.b64 | base64 -d | gzip -dc > public/index.html
printf '%s  %s\n' '81f341830e18cc6cd084edfefaa785c871137e602be87987843b9f19786aa411' 'public/index.html' | sha256sum -c -

# Apply verified Istanbul-only itinerary revisions after the original HTML checksum.
node patch-itinerary.mjs

# Update 15-16 Nov Cappadocia accommodation in Göreme and linked route data.
node patch-cappadocia.mjs
