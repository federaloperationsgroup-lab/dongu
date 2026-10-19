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
| pkg_smoke.sh | pkg/ paketi: zip parçaları, require, sunucu açılışı, /durum, /api/guest, katalog | 17 |

## Bilinen tasarım gerçekleri (test beklentileri buna göre)
- Onay penceresi yalnız gerçek sunucuda sorulur (K134); dosya modunda yok.
- Sayfa yenilenince giriş ekranı gelir; "Misafir Girişi" aynı hesabı sürdürür, lobide "Kaldığın çevrim içi maça dön" çubuğu çıkar.
- Arkadaş odası maçları lige sayılmaz (lig yalnız Hızlı Katıl); rövanş evet/evet arkadaş odasında bekleme odasına döner, kurucu yeniden başlatır.
- Tamamen AFK oynanan el "ödül dışı: bağlantı/katılım yetersiz" (K14); bu yüzden ödül testleri gerçek hamleyle yapılır.
- Sahip olunan ürüne /api/buy `already` döner (hata değil), altın değişmez.
