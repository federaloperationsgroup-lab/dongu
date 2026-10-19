#!/bin/sh
# Sunucu paketi: server/public (web/index.html + sw + manifest + assets + yasal) ve server/{engine,economy}.js; catalog.json üretir
cd "$(dirname "$0")"
cp engine.js economy.js server/
rm -rf server/public && mkdir -p server/public
cp web/index.html web/sw.js web/manifest.webmanifest server/public/
cp -r web/assets server/public/assets
mkdir -p server/public/yasal && cp web/yasal/*.html server/public/yasal/
node build-catalog.js
echo "server/public hazır: $(du -sh server/public | cut -f1)"
