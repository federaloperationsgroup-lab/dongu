#!/bin/sh
# Bütün testler sırayla (her biri kendi sunucusunu açar; aynı anda ikinci tur çalıştırılmaz). Çıktı: tests/out/<ad>.out + tests/out/sonuc.log
cd "$(dirname "$0")"; mkdir -p out; LOG=out/sonuc.log; : > $LOG
export NODE_PATH=/opt/npm-tools/node_modules:/opt/node-tools/node_modules
echo "başladı $(date +%H:%M:%S)" >> $LOG
for t in ${@:-$(ls qa_*.js | grep -v qa_lib | grep -v qa_srv | sed 's/\.js$//')}; do
  pkill -xf "node server.js" 2>/dev/null; sleep 0.5
  timeout 900 node $t.js > out/$t.out 2>&1
  echo "=== $t: PASS $(grep -c '^PASS' out/$t.out) / FAIL $(grep -c '^FAIL' out/$t.out) $(grep -m1 'SONUÇ' out/$t.out) $(grep -c 'CRASH' out/$t.out) çökme" >> $LOG
  grep '^FAIL\|CRASH' out/$t.out | head -5 | cut -c1-300 >> $LOG
done
sh pkg_smoke.sh > out/pkg_smoke.out 2>&1; echo "=== pkg_smoke: PASS $(grep -c '^PASS' out/pkg_smoke.out) / FAIL $(grep -c '^FAIL' out/pkg_smoke.out)" >> $LOG
echo "bitti $(date +%H:%M:%S)" >> $LOG; cat $LOG
