#!/bin/sh
# GitHub'a paket yükleme (K132): pkg/ içindeki dosyaları depoya kopyalar, değişenleri commit edip main'e push eder.
# Kullanım: sh gh_push.sh v9.99 "kısa açıklama"   (önce sh pkg.sh; depo main dalında olmalı)
set -e
V=$1; MSG=$2; R=/home/claude/dongu; P=/home/claude/okey/pkg
cd $R && [ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "depo main dalında değil: $(git rev-parse --abbrev-ref HEAD)"; exit 1; }
git fetch -q origin main && git reset -q --hard origin/main
for f in $(cd $R && ls public*.zip assets*.zip 2>/dev/null); do [ -f $P/$f ] || git rm -q $f; done
for f in README.md accounts.js ads.js bots.js economy.js engine.js iap.js moderation.js package.json server.js social.js venues.js $(cd $P && ls public*.zip assets*.zip); do cp $P/$f $R/$f; done
# v10.19: mobil kabuk ve derleme iş akışları da çalışma klasöründen eşitlenir (depo = çalışma klasörü; üretilen android/ ios/ www/ node_modules kopyalanmaz)
M=/home/claude/okey/mobile
for f in README.md app-config.json capacitor.config.json debug-test.keystore package.json patch-native.sh prepare-www.sh skadnetwork.txt; do cp $M/$f $R/mobile/$f; done
cp $M/assets/*.png $R/mobile/assets/
cp /home/claude/okey/ci/*.yml $R/.github/workflows/
git add -A
git -c user.name="Döngü" -c user.email="dongu@users.noreply.github.com" commit -q -m "$V: $MSG

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019Lt6xGFxABfQnrFWcbi5x2" || { echo "değişiklik yok"; exit 0; }
git push -q origin HEAD:main
git log -1 --format='%h %ci %s'
