#!/bin/sh
# Çalışma klasöründeki kaynak ve testleri depodaki src/ altına eşitler, değişenleri commit edip gönderir.
# Kullanım: sh src_sync.sh v10.19 "kısa açıklama"   (gh_push.sh'ten sonra; depo main dalında)
set -e
V=$1; MSG=$2; O=/home/claude/okey; R=/home/claude/dongu
cd $R && [ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "depo main dalında değil"; exit 1; }
for f in app.js app.html en.js economy.js engine.js i18n.js rig.js venue.js build.sh wrap.sh build-server.sh build-catalog.js build-yasal.py pkg.sh pkg_split.py gh_push.sh src_sync.sh; do [ -f $O/$f ] && cp $O/$f $R/src/$f; done
for f in $(ls $O/tests | grep -v '^out$'); do [ -f $O/tests/$f ] && cp $O/tests/$f $R/src/tests/$f; done
git add -A src
git status --short | head -30
git -c user.name="Döngü" -c user.email="dongu@users.noreply.github.com" commit -q -m "src: $V ($MSG)

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019Lt6xGFxABfQnrFWcbi5x2" || { echo "değişiklik yok"; exit 0; }
git push -q origin HEAD:main
git log -1 --format='%h %ci %s' | cut -c1-140
