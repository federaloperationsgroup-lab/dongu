#!/bin/sh
# `npx cap add android|ios` ile üretilen yerel projeyi oyuna göre ayarlar: yalnız yatay, tam ekran, sürüm numarası, uygulama adı.
# CI her derlemede projeyi sıfırdan üretir; bu yüzden ayarlar burada, elle düzenlenen dosya yok.
set -e
cd "$(dirname "$0")"
V=$(cat version.txt 2>/dev/null || echo 10.0); CODE=$(cat versioncode.txt 2>/dev/null || echo 1000)
case "$1" in
android)
  M=android/app/src/main/AndroidManifest.xml
  # yalnız yatay + klavye/döndürme yeniden başlatmasın
  sed -i 's/android:configChanges="[^"]*"/android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation"/' "$M"
  sed -i 's/<activity\([^>]*\)android:name="\.MainActivity"/<activity\1android:name=".MainActivity" android:screenOrientation="sensorLandscape"/' "$M"
  grep -q 'android:screenOrientation="sensorLandscape"' "$M" || sed -i 's/android:name="\.MainActivity"/android:name=".MainActivity" android:screenOrientation="sensorLandscape"/' "$M"
  # sürüm
  G=android/app/build.gradle
  sed -i "s/versionCode [0-9]*/versionCode $CODE/; s/versionName \"[^\"]*\"/versionName \"$V\"/" "$G"
  # tam ekran tema (durum/gezinme çubuğu gizli): styles.xml'e windowFullscreen
  S=android/app/src/main/res/values/styles.xml
  if ! grep -q windowFullscreen "$S"; then sed -i 's#<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">#<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">\n        <item name="android:windowFullscreen">true</item>#' "$S"; fi
  echo "android ayarlandı: v$V ($CODE), yatay, tam ekran"
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
  # proje ayarlarındaki MARKETING_VERSION / CURRENT_PROJECT_VERSION da plist'i ezebilir
  sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $V;/g; s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $CODE;/g" ios/App/App.xcodeproj/project.pbxproj
  echo "ios ayarlandı: v$V ($CODE), yatay, tam ekran"
  ;;
*) echo "kullanım: patch-native.sh android|ios"; exit 1;;
esac
