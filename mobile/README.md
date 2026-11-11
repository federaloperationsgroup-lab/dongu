# Döngü — mağaza uygulaması (Android + iOS)

Oyun bir web uygulamasıdır; mağaza sürümleri **Capacitor** ile paketlenir: web dosyaları (public.zip + assets.zip) uygulamanın içine konur,
sunucu olarak `https://dongu.app` kullanılır (app.js `NATIVE` dalı: `SERVER_ORIGIN`, `wss://dongu.app`, sunucuda CORS izni yalnız uygulama kökenlerine).

- Uygulama kimliği: `app.dongu.okey` (Android package / iOS bundle id). Ad: Döngü. Yalnız yatay, tam ekran.
- Sürüm: `prepare-www.sh` index.html'deki `VERSION`'ı okur → `version.txt` (10.02) ve `versioncode.txt` (1002).
- Yerel projeler (android/, ios/) depoda **tutulmaz**; GitHub Actions her derlemede `npx cap add` ile üretip `patch-native.sh` ile ayarlar.
- Simgeler/açılış: `assets/icon.png` (v10.19: alfasız RGB — App Store alfa kanallı simgeyi kabul etmez), `icon-foreground.png`, `icon-background.png`, `splash.png` → `@capacitor/assets`.
- **v10.19: Capacitor 8** (Node 22, Android derleme/hedef API 36 — Google Play 31 Ağustos 2026'dan beri yeni uygulamada bunu ister —, en düşük Android 7 / API 24, iOS 15+). iOS projesi CocoaPods ile üretilir (`npx cap add ios --packagemanager CocoaPods`).
- **Eklentiler:** `@revenuecat/purchases-capacitor` (satın alma), `@capacitor-community/admob` (ödüllü reklam), `@capacitor/app`, `status-bar`, `splash-screen`.

## Reklam (AdMob) ayarı — `app-config.json` → `admob`
| Alan | Ne | Nereden |
|---|---|---|
| `appIdAndroid`, `appIdIos` | AdMob **uygulama** kimliği (`ca-app-pub-…~…`) | AdMob → Uygulamalar → uygulama → Uygulama ayarları |
| `rewardedAndroid`, `rewardedIos` | **Ödüllü reklam birimi** kimliği (`ca-app-pub-…/…`) | AdMob → uygulama → Reklam birimleri → Ödüllü |
| `test` | `true`: deneme reklamı ("Test Ad"; gelir yok, hesap riski yok). `false`: gerçek reklam | mağazaya çıkarken `false` |

Depodaki değerler Google'ın herkese açık **deneme** kimlikleridir. Bu kimlikler gizli değildir (uygulamanın içinde zaten görünür).
`patch-native.sh` uygulama kimliğini AndroidManifest'e (`com.google.android.gms.ads.APPLICATION_ID`) ve Info.plist'e (`GADApplicationIdentifier` + `SKAdNetworkItems`, liste `skadnetwork.txt`) yazar; kimlik yoksa deneme kimliği yazılır (eklenti kuruluyken kimlik olmazsa uygulama açılışta kapanır).
Reklam birimi boşsa oyunda "Altın Kazan" düğmesi çıkmaz. Gerçek reklama geçerken sunucuda `ADS_SSV=1` yapılır ve AdMob'da ödüllü reklam biriminin "Sunucu tarafı doğrulama" adresine `https://dongu.app/api/ads/ssv` yazılır (ayrıntı: kök `README.md`, "Ödüllü reklam").
Android'de reklam SDK'sı `AD_ID` iznini ekler → Play Console'da "Reklam kimliği" beyanı ve "Reklam içerir: Evet". iOS'ta izleme izni (ATT) istenmez; reklamlar kişiselleştirilmemiş istenir.
Yatay kilit: `android:appCategory="game"` + `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` (Android 16, tablet / katlanır ekran).

## Derleme (GitHub Actions)
- `.github/workflows/android.yml`: debug APK (telefona doğrudan kurulur) + imzasız release AAB (Play için jarsigner ile imzalanır).
- `debug-test.keystore` (v10.08): **yalnız test APK'sının** sabit imzası (standart debug anahtarı, şifre `android`; mağaza/yükleme anahtarı DEĞİL). Her derleme aynı anahtarla imzalanır → yeni APK eskisinin üstüne kurulur, oyun hesabı silinmez. Sabit indirme adresi: `https://github.com/federaloperationsgroup-lab/dongu/releases/download/android-latest/dongu.apk`.
- `.github/workflows/ios.yml`: simülatör derlemesi (imzasız, proje doğrulaması; yalnız `mobile/**` değişince ya da elle başlatılınca çalışır). Mağaza için Apple geliştirici hesabı + imza sırları eklenince `xcodebuild archive` adımı açılır.

## Elle (Mac/PC'de)
```
cd mobile && npm install && sh prepare-www.sh && npm run add:android && npx cap sync android && cd android && ./gradlew assembleDebug   # Node 22+, JDK 21
```
