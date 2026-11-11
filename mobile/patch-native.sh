#!/bin/sh
# `npx cap add android|ios` ile üretilen yerel projeyi oyuna göre ayarlar: yalnız yatay, tam ekran, sürüm numarası, uygulama adı,
# v10.19: reklam (AdMob) uygulama kimliği, oyun kategorisi, büyük ekranda yatay kilidi.
# CI her derlemede projeyi sıfırdan üretir; bu yüzden ayarlar burada, elle düzenlenen dosya yok.
set -e
cd "$(dirname "$0")"
V=$(cat version.txt 2>/dev/null || echo 10.0); CODE=$(cat versioncode.txt 2>/dev/null || echo 1000)
# AdMob uygulama kimliği app-config.json'dan (admob.appIdAndroid / admob.appIdIos); yoksa Google'ın herkese açık DENEME kimliği.
# Reklam eklentisi kuruluyken bu kimlik yerel projede yoksa uygulama açılışta kapanır; bu yüzden her zaman bir değer yazılır.
cfg() { python3 -c "import json,sys
try: c=json.load(open('app-config.json'))
except Exception: c={}
print((c.get('admob') or {}).get(sys.argv[1]) or sys.argv[2])" "$1" "$2"; }
case "$1" in
android)
  M=android/app/src/main/AndroidManifest.xml
  # yalnız yatay + klavye/döndürme yeniden başlatmasın (v10.19: Capacitor 8 şablonundaki 'density' korunur)
  sed -i 's/android:configChanges="[^"]*"/android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"/' "$M"
  sed -i 's/<activity\([^>]*\)android:name="\.MainActivity"/<activity\1android:name=".MainActivity" android:screenOrientation="sensorLandscape"/' "$M"
  grep -q 'android:screenOrientation="sensorLandscape"' "$M" || sed -i 's/android:name="\.MainActivity"/android:name=".MainActivity" android:screenOrientation="sensorLandscape"/' "$M"
  # v10.19: oyun kategorisi. Android 16 (hedef API 36) tablet ve katlanır ekranlarda yön kilidini yok sayar; oyunlar (appCategory) muaftır.
  # Ek güvence: PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY (API 36 hedefinde geçerli).
  grep -q 'android:appCategory' "$M" || sed -i '0,/<application/s/<application/<application android:appCategory="game"/' "$M"
  grep -q 'PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY' "$M" || sed -i 's#</application>#    <property android:name="android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY" android:value="true" />\n    </application>#' "$M"
  # v10.19: AdMob uygulama kimliği
  ADID=$(cfg appIdAndroid 'ca-app-pub-3940256099942544~3347511713')
  grep -q 'com.google.android.gms.ads.APPLICATION_ID' "$M" || sed -i "s#</application>#    <meta-data android:name=\"com.google.android.gms.ads.APPLICATION_ID\" android:value=\"$ADID\" />\n    </application>#" "$M"
  # sürüm
  G=android/app/build.gradle
  sed -i "s/versionCode [0-9]*/versionCode $CODE/; s/versionName \"[^\"]*\"/versionName \"$V\"/" "$G"
  # v10.08: test APK'sı hep aynı anahtarla imzalanır (debug-test.keystore; mağaza anahtarı değil) → yeni APK eskisinin üstüne kurulur, oyun hesabı silinmez
  if [ -f debug-test.keystore ] && ! grep -q 'debug-test.keystore' "$G"; then
    KS="$(pwd)/debug-test.keystore"
    printf '\nandroid {\n    signingConfigs {\n        debug {\n            storeFile file("%s")\n            storePassword "android"\n            keyAlias "androiddebugkey"\n            keyPassword "android"\n        }\n    }\n}\n' "$KS" >> "$G"
  fi
  # tam ekran tema (durum/gezinme çubuğu gizli): styles.xml'e windowFullscreen
  S=android/app/src/main/res/values/styles.xml
  if ! grep -q windowFullscreen "$S"; then sed -i 's#<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">#<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">\n        <item name="android:windowFullscreen">true</item>#' "$S"; fi
  echo "android ayarlandı: v$V ($CODE), yatay, tam ekran, oyun kategorisi, AdMob $ADID"
  ;;
ios)
  P=ios/App/App/Info.plist
  plutil -replace UISupportedInterfaceOrientations -json '["UIInterfaceOrientationLandscapeLeft","UIInterfaceOrientationLandscapeRight"]' "$P"
  plutil -replace 'UISupportedInterfaceOrientations~ipad' -json '["UIInterfaceOrientationLandscapeLeft","UIInterfaceOrientationLandscapeRight"]' "$P"
  plutil -replace UIStatusBarHidden -bool true "$P"
  plutil -replace UIViewControllerBasedStatusBarAppearance -bool false "$P"
  plutil -replace UIRequiresFullScreen -bool true "$P"
  plutil -replace CFBundleDisplayName -string "Döngü" "$P"
  plutil -replace CFBundleShortVersionString -string "$V" "$P"
  plutil -replace CFBundleVersion -string "$CODE" "$P"
  plutil -replace ITSAppUsesNonExemptEncryption -bool false "$P"
  # v10.19: AdMob uygulama kimliği + reklam ağı kimlikleri (skadnetwork.txt: Google'ın yayımladığı liste). İzleme izni (ATT) istenmez; reklamlar kişiselleştirilmemiş istenir.
  ADID=$(cfg appIdIos 'ca-app-pub-3940256099942544~1458002511')
  plutil -replace GADApplicationIdentifier -string "$ADID" "$P"
  if [ -f skadnetwork.txt ]; then
    SK=$(python3 -c "import json;print(json.dumps([{'SKAdNetworkIdentifier':l.strip()} for l in open('skadnetwork.txt') if l.strip()]))")
    plutil -replace SKAdNetworkItems -json "$SK" "$P"
  fi
  # proje ayarlarındaki MARKETING_VERSION / CURRENT_PROJECT_VERSION da plist'i ezebilir
  sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $V;/g; s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $CODE;/g" ios/App/App.xcodeproj/project.pbxproj
  echo "ios ayarlandı: v$V ($CODE), yatay, tam ekran, AdMob $ADID"
  ;;
*) echo "kullanım: patch-native.sh android|ios"; exit 1;;
esac
