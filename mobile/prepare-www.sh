#!/bin/sh
# Web paketini www/ içine açar: depo kökündeki public.zip (+ parçaları) ve assets.zip (+ parçaları) → public/ → www/
# Ayrıca sürümü index.html'den okuyup version.txt'ye yazar (CI, Android versionCode / iOS CFBundleVersion için kullanır).
set -e
cd "$(dirname "$0")"
ROOT=${ROOT:-..}   # test: ROOT=/yol/pkg
rm -rf www tmp_www && mkdir -p tmp_www
for z in $ROOT/public.zip $ROOT/public-*.zip $ROOT/assets.zip $ROOT/assets-*.zip; do [ -f "$z" ] && unzip -q -o "$z" -d tmp_www; done
if [ -d tmp_www/public ]; then mv tmp_www/public www; else mv tmp_www www; fi
rm -rf tmp_www
# Uygulama ayarı sayfaya gömülür: window.DONGU_CONFIG (app-config.json; gizli bilgi içermez).
# v10.20: "ads" true değilse reklam ayarı (admob) sayfaya hiç yazılmaz → oyunda Altın Kazan çıkmaz; açıklama (note) da gömülmez.
# Ekrana kimlik değeri içermeyen bir özet yazılır (hangi hizmet açık, hangi kip): yanlış ayarla derleme günlükten erkenden görülür.
if [ -f app-config.json ]; then python3 - <<'PY'
import json
c = json.load(open('app-config.json', encoding='utf-8'))
ads = c.get('ads') is True
c.pop('note', None)
if not ads: c.pop('admob', None)
c['store'] = c.get('store') is True
c['ads'] = ads
p = 'www/index.html'; s = open(p, encoding='utf-8').read()
tag = '<script>window.DONGU_CONFIG=' + json.dumps(c, ensure_ascii=False, separators=(',', ':')) + ';</script>'
if 'window.DONGU_CONFIG=' not in s: s = s.replace('<script', tag + '<script', 1)
open(p, 'w', encoding='utf-8').write(s)
kip = 'deneme reklamı' if (c.get('admob') or {}).get('test') else 'GERÇEK reklam'
print('ayar gömüldü → satın alma: ' + ('AÇIK' if c['store'] else 'KAPALI') + ' · reklam: ' + ('AÇIK (' + kip + ')' if ads else 'KAPALI (reklam yazılımı pakette yok)'))
PY
fi
# paketten açılan sayfada service worker gereksiz (Capacitor kendi şemasından sunar); kayıt zaten hata yakalar — dokunulmuyor
V=$(grep -o "VERSION = '[0-9.]*'" www/index.html | head -1 | sed "s/VERSION = '//; s/'//")
[ -n "$V" ] || V=10.0
MAJOR=$(echo "$V" | cut -d. -f1); MINOR=$(echo "$V" | cut -s -d. -f2)
# v10.08: printf "%02d" "08" sekizlik sayı sanıp hata veriyordu (08 ve 09) → iki haneye yalnız metin olarak tamamlanır
case "$MINOR" in ''|*[!0-9]*) MINOR=00 ;; ?) MINOR=0$MINOR ;; esac
echo "$V" > version.txt; echo "$MAJOR$MINOR" > versioncode.txt   # 10.02 → 1002
echo "www hazır: sürüm $V (kod $(cat versioncode.txt)), $(find www -type f | wc -l) dosya"
