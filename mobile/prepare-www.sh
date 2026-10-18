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
# paketten açılan sayfada service worker gereksiz (Capacitor kendi şemasından sunar); kayıt zaten hata yakalar — dokunulmuyor
V=$(grep -o "VERSION = '[0-9.]*'" www/index.html | head -1 | sed "s/VERSION = '//; s/'//")
[ -n "$V" ] || V=10.0
MAJOR=$(echo "$V" | cut -d. -f1); MINOR=$(echo "$V" | cut -d. -f2); MINOR=$(printf "%02d" "${MINOR:-0}")
echo "$V" > version.txt; echo "$MAJOR$MINOR" > versioncode.txt   # 10.02 → 1002
echo "www hazır: sürüm $V (kod $(cat versioncode.txt)), $(find www -type f | wc -l) dosya"
