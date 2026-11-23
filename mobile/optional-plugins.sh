#!/bin/sh
# İsteğe bağlı eklentiler app-config.json'a göre kurulur (npm install'dan sonra, cap add'den önce çalışır).
# v10.20: reklam eklentisi (AdMob) yalnız "ads": true iken pakete girer. Kapalıyken uygulamada reklam yazılımı hiç bulunmaz:
# Google'a reklam için veri gitmez, reklam kimliği izni (AD_ID) istenmez, mağaza beyanında "reklam içermez" denir.
set -e
cd "$(dirname "$0")"
ADS=$(python3 -c "import json
try: print('1' if json.load(open('app-config.json')).get('ads') is True else '0')
except Exception: print('0')")
if [ "$ADS" = "1" ]; then
  npm install --no-audit --no-fund --save @capacitor-community/admob@^8.0.0
  echo "reklam eklentisi kuruldu (ads: true)"
else
  echo "reklam eklentisi kurulmadı (ads: false): pakette reklam yazılımı yok"
fi
