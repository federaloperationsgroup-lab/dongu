# Döngü test takımı (v10.12 sonrası, 19 Ekim 2026'da yeniden yazıldı)

Ortam sıfırlanınca eski 52 dosyalık takım kayboldu; bu takım aynı kapsamı daha az dosyada, hepsi gerçek düğme/gerçek sunucu akışıyla kapsar.
Kaynak: `src/` (kök: app.js, app.html, venue.js, rig.js, engine.js, economy.js, en.js, i18n.js; `src/server/` sunucu; `src/tests/` bu klasör).

## Çalıştırma

    cd /home/claude/okey/tests
    sh run_all.sh            # hepsi sırayla → out/sonuc.log (+ out/<ad>.out)
    sh run_all.sh qa_engine  # tek test

Gerekli: Playwright + Chromium ve `ws` (`NODE_PATH=/opt/npm-tools/node_modules:/opt/node-tools/node_modules`, run_all.sh ayarlar).
Sunucu testleri `../server` içinde kendi sunucusunu açar ve `server/data` dosyalarını siler → **aynı anda iki test turu çalıştırılmaz.**
Dosya modu testleri `web/test.html` (build.sh → wrap.sh sonrası) üzerinde koşar.

## Dosyalar

| Dosya | Kapsam | Kontrol |
|---|---|---|
| qa_lib.js / qa_srv.js | yardımcılar (Playwright, sunucu, WS istemci, yönetim işlemleri) | – |
| qa_engine.js | motor + ekonomi birim: 106 taş, deste, okey, 200 tam bot eli (taş sayımı), serialize, XP/seviye, lig tabanı, el ödülü, kıraathane yerleşimi | 18 |
| qa_journey.js | dosya modu kullanıcı yolculuğu: giriş → lobi → 12 gezinti → masalar → 1 el bot maçı gerçek düğmelerle → sonuç → yeniden → pencereler | 76 |
| qa_tutorial.js | 7 öğretici bölümü baştan sona, TR ve EN, her adım kendi koşuluyla (sürükleme olayları, per dizme, işleme/okey alma, skin paneli, mağaza) | 19 |
| qa_screens.js | yasal onay akışı (gerçek sunucu), /gizlilik /kosullar /hesap-silme, mağaza satın alma/giyme/kalıcılık/yetersiz altın, Ayarlar (Skinler, dil canlı), EN ekran taraması masaüstü + telefon (taşma dahil) | 25 |
| qa_assets.js | katalog × 2 cinsiyet × 3 duruş katman dosyaları, 7 tam karakter + rig klasörleri, 224 mağaza denemesi, giriş/aksiyon skinleri, 13 tema, kıraathane sprite'ları, sw/manifest/mobil yapılandırma | 12 |
| qa_online_rules.js | ham WS: misafir/yönetim, prefs.skins, Hızlı Katıl gizli botlar, bakış kuralları (P1/P3/P5), tokat 0,6 sn + bonus, Tos penceresi, /olcum | 24 |
| qa_online_ui.js | iki tarayıcı (telefon EN + masaüstü TR) + 2 bot: arkadaşlık kodla, DM çevrilmez, kıraathane kur/cephe/iç/dükkân/üretim/Keşfet, 1 el baştan sona, iki dilde sonuç, EN kalıntı taraması | 17 |
| qa_online_match.js | 6 el arkadaş odası gerçek hamlelerle; 2. elde sayfa yenileme → "Masaya dön" aynı koltuk; maç sonu ödül/XP; rövanş evet/evet → bekleme odası → aynı grupla yeni maç; maç ortasında çıkış → bot devralır; /olcum | 13 |
| qa_server_econ.js | Bronz masa: seviye kilidi, yetersiz altın, emanet, 3 gizli bot (zayıf), AFK → hükmen, emanet kapanışı; Usta kapalı; rövanş hayır; günlük ödül bir kez; /api/buy tx tekrarı; uygunsuz ad; şikâyet/yönetim/engel; davet; /api/lig; IAP webhook reddi | 28 |
| qa_skin_rig.js | v10.16: botlar (Ali/Ayşe/Mehmet) gardırop karakteri ve parçalı — koltuk, portre, profil kartı, çevrim içi oda; bakış (baş/gövde hedefe döner, süre boyunca tutulur, bitince beklemeye döner), tokat (kol savrulur, yiyenin başı savrulur), Zafer/Tos rig'de bütün resmi kaydırmaz; kendi skininde portre kırpımı genişler; hareket azaltma; masaüstü + telefon | 35 |
| qa_iap.js | v10.18 satın alma (ham HTTP + sahte RevenueCat REST): ürün listesi, yetkisiz bildirim, işlem kimliği bir kez, aynı anda gelen çift bildirim, bildirim ve eşitleme farklı kimlikle gelse de tek işleme, Başlangıç Paketi bir kez, iade (verilen kadar; 0'ın altına inmez; ikinci kimlikle bulunur), sandbox süzme, yeniden başlatma | 45 |
| qa_iap_pg.js | satın alma modülü gerçek PostgreSQL 16 üzerinde (`pg_local.sh` yerel küme açar; yoksa ATLANIR): eski tabloya `alt` sütunu, kimlik / ikinci kimlik / aynı an eşleşmesi, aynı anda 8 istek, iade, bir kerelik paket | 30 |
| qa_recovery.js | v10.18 hesap kurtarma kodu (sunucu): üretim, biçim, geri yükleme, yanlış/bozuk kod, deneme sınırı, kodu yenile (yeni anahtar), kod görünümde/indirilen veride sızmaz, silinen hesap | 24 |
| qa_native.js | v10.18 **mağaza uygulaması benzetimi** (sahte Capacitor + satın alma eklentisi, gerçek sunucu): eklenti kurulumu, mağaza fiyatları, satın alma → altın, vazgeçme/hata, geri yükle, Başlangıç Paketi teklifi (altın yetmeyince, ilk maçtan sonra, günde bir, 3 kez), lobi (reklam düğmesi yok, hediye işareti), iPhone + İngilizce; web: teklif yok, kurtarma kodu (Ayarlar, giriş ekranı, kodu yenile), İngilizce | 59 |
| pkg_smoke.sh | pkg/ paketi: zip parçaları, require, sunucu açılışı, /durum, /api/guest, katalog | 17 |

## Uygulama benzetimi (qa_native.js)
Sayfa betiklerinden önce `window.Capacitor` (isNativePlatform → true) ve `window.DONGU_CONFIG = { server: 'http://127.0.0.1:PORT', rcAndroid, rcIos }` verilir; istemci `NATIVE` dalına girer ama sunucu olarak deneme sunucusunu kullanır (v10.18: `CFG.server`, varsayılan https://dongu.app). Sahte `Purchases.purchaseStoreProduct` satın almayı sahte RevenueCat REST'e yazar; sunucu oradan okuyup hesaba işler. Gerçek mağaza ödemesi, gerçek RevenueCat ve gerçek telefon denenmez.

## Bilinen tasarım gerçekleri (test beklentileri buna göre)
- Onay penceresi yalnız gerçek sunucuda sorulur (K134); dosya modunda yok.
- Sayfa yenilenince giriş ekranı gelir; "Misafir Girişi" aynı hesabı sürdürür, lobide "Kaldığın çevrim içi maça dön" çubuğu çıkar.
- Arkadaş odası maçları lige sayılmaz (lig yalnız Hızlı Katıl); rövanş evet/evet arkadaş odasında bekleme odasına döner, kurucu yeniden başlatır.
- Tamamen AFK oynanan el "ödül dışı: bağlantı/katılım yetersiz" (K14); bu yüzden ödül testleri gerçek hamleyle yapılır.
- Sahip olunan ürüne /api/buy `already` döner (hata değil), altın değişmez.
