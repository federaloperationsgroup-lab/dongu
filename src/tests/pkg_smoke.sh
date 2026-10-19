#!/bin/sh
# Paketten temiz kurulum denemesi: pkg/ boş klasöre kopyalanır, sunucu oradan açılır (Render'daki gibi zip'ler açılır), /durum ve dosyalar denetlenir.
# Kullanım: sh tests/pkg_smoke.sh v10.12
T=/tmp/pkgsmoke; PORT=8779; WANT=${1:-v10.12}; OK=/home/claude/okey
rm -rf $T && mkdir -p $T && cp $OK/pkg/* $T/ && ln -s $OK/server/node_modules $T/node_modules
cd $T && (PORT=$PORT ADMIN_KEY=k_smoke_1 NODE_PATH=/opt/npm-tools/node_modules setsid nohup node ./server.js pkgsmoke > $T/srv.log 2>&1 &)
i=0; until curl -s --noproxy '*' http://127.0.0.1:$PORT/durum > $T/durum.txt 2>/dev/null && [ -s $T/durum.txt ]; do i=$((i+1)); [ $i -gt 120 ] && break; sleep 0.25; done
i=0; until grep -q "gizli botlar hazır" $T/srv.log; do i=$((i+1)); [ $i -gt 80 ] && break; sleep 0.25; done
curl -s --noproxy '*' http://127.0.0.1:$PORT/durum > $T/durum.txt
ok() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fi; }
ok "sunucu paketten açıldı (/durum yanıt verdi)" "[ -s $T/durum.txt ]"
ok "/durum: Sürüm $WANT" "grep -q 'Sürüm: $WANT\.' $T/durum.txt"
ok "/durum: Paket $WANT, parçalar tam" "grep -Eq 'Paket: $WANT, ([0-9]+)/\1 parça' $T/durum.txt"
ok "/durum: SORUN satırı yok" "! grep -q 'SORUN' $T/durum.txt"
ok "günlük: public.zip açıldı" "grep -q 'public.zip açıldı' $T/srv.log"
ok "günlük: gizli botlar hazır" "grep -q 'gizli botlar hazır' $T/srv.log"
ok "günlük: hata yığını yok" "! grep -q 'Error:\|Cannot find module' $T/srv.log"
for p in / /assets/ui/ikon-kiraathane.webp /assets/arena/istaka-rakip-yatay-kor.webp /kosullar /gizlilik /catalog.json; do c=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT$p); ok "GET $p → 200" "[ $c = 200 ]"; done
ok "Kullanım Koşulları: bilgisayar oyuncusu cümlesi" "curl -s --noproxy '*' http://127.0.0.1:$PORT/kosullar | grep -q 'bilgisayar oyuncusu'"
ok "oyun sayfasında İngilizce sözlük ve dil katmanı" "curl -s --noproxy '*' http://127.0.0.1:$PORT/ | grep -q 'window.DONGU_EN' && curl -s --noproxy '*' http://127.0.0.1:$PORT/ | grep -q 'DonguI18n'"
c=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/olcum); ok "/olcum anahtarsız → 404" "[ $c = 404 ]"
c=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/olcum?key=k_smoke_1"); ok "/olcum anahtarla → 200" "[ $c = 200 ]"
sed -n '1,3p' $T/durum.txt | cut -c1-200
pkill -f "^node ./server.js pkgsmoke"; sleep 0.5
