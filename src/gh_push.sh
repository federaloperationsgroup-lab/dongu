#!/bin/sh
# GitHub'a paket yükleme (K132): pkg/ içindeki dosyaları depoya kopyalar, değişenleri commit edip main'e push eder.
# Kullanım: sh gh_push.sh v9.99 "kısa açıklama"   (önce sh pkg.sh)
set -e
V=$1; MSG=$2; R=/home/claude/dongu; P=/home/claude/okey/pkg
cd $R && git fetch -q origin main && git reset -q --hard origin/main
for f in $(cd $R && ls public*.zip assets*.zip 2>/dev/null); do [ -f $P/$f ] || git rm -q $f; done
for f in README.md accounts.js bots.js economy.js engine.js iap.js moderation.js package.json server.js social.js venues.js $(cd $P && ls public*.zip assets*.zip); do cp $P/$f $R/$f; done
git add -A
git -c user.name="Döngü" -c user.email="dongu@users.noreply.github.com" commit -q -m "$V: $MSG

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019Lt6xGFxABfQnrFWcbi5x2" || { echo "değişiklik yok"; exit 0; }
git push -q origin HEAD:main
git log -1 --format='%h %ci %s'
