# Döngü — mağaza uygulaması (Android + iOS)

Oyun bir web uygulamasıdır; mağaza sürümleri **Capacitor** ile paketlenir: web dosyaları (public.zip + assets.zip) uygulamanın içine konur,
sunucu olarak `https://dongu.app` kullanılır (app.js `NATIVE` dalı: `SERVER_ORIGIN`, `wss://dongu.app`, sunucuda CORS izni yalnız uygulama kökenlerine).

- Uygulama kimliği: `app.dongu.okey` (Android package / iOS bundle id). Ad: Döngü. Yalnız yatay, tam ekran.
- Sürüm: `prepare-www.sh` index.html'deki `VERSION`'ı okur → `version.txt` (10.02) ve `versioncode.txt` (1002).
- Yerel projeler (android/, ios/) depoda **tutulmaz**; GitHub Actions her derlemede `npx cap add` ile üretip `patch-native.sh` ile ayarlar.
- Simgeler/açılış: `assets/icon.png`, `icon-foreground.png`, `icon-background.png`, `splash.png` → `@capacitor/assets`.

## Derleme (GitHub Actions)
- `.github/workflows/android.yml`: debug APK (telefona doğrudan kurulur) + imzasız release AAB (Play için jarsigner ile imzalanır).
- `debug-test.keystore` (v10.08): **yalnız test APK'sının** sabit imzası (standart debug anahtarı, şifre `android`; mağaza/yükleme anahtarı DEĞİL). Her derleme aynı anahtarla imzalanır → yeni APK eskisinin üstüne kurulur, oyun hesabı silinmez. Sabit indirme adresi: `https://github.com/federaloperationsgroup-lab/dongu/releases/download/android-latest/dongu.apk`.
- `.github/workflows/ios.yml`: simülatör derlemesi (imzasız, proje doğrulaması). Mağaza için Apple geliştirici hesabı + imza sırları eklenince `xcodebuild archive` adımı açılır.

## Elle (Mac/PC'de)
```
cd mobile && npm install && sh prepare-www.sh && npm run add:android && npx cap sync android && cd android && ./gradlew assembleDebug
```
