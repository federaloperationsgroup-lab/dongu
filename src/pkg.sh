#!/bin/sh
# Yükleme paketi: pkg/ — sunucu dosyaları + public.zip / public-N.zip + assets.zip / assets-N.zip (pkg_split.py)
set -e
cd "$(dirname "$0")"
sh build.sh > /dev/null && sh build-server.sh > /dev/null
mkdir -p pkg
for f in README.md accounts.js bots.js economy.js engine.js iap.js moderation.js package.json server.js social.js venues.js; do cp server/$f pkg/; done
PART_MB=${PART_MB:-25} python3 pkg_split.py pkg
node -e "['accounts','bots','economy','engine','iap','moderation','social','venues'].forEach(function(m){require('./pkg/'+m+'.js');}); console.log('require denetimi tamam')"
ls -la pkg | awk '{print $5, $9}' | tail -n +4
