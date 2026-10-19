# Döngü — kaynak kod (src/)

Depo kökü **yükleme paketidir** (Render bunu çalıştırır: server.js + public.zip/assets.zip). Bu klasör ise oyunun **kaynak dosyaları**;
19 Ekim 2026'da çalışma ortamı sıfırlanınca kaynak canlı paketten geri çıkarıldı ve bir daha kaybolmasın diye buraya kondu.

- `app.html` (yer tutucular `/*I18N*/ /*ENGINE*/ /*RIG*/ /*APP*/ /*VENUE*/`), `app.js`, `venue.js`, `rig.js`, `engine.js`, `economy.js`, `en.js` (İngilizce sözlük), `i18n.js` (dil katmanı)
- `build.sh` → `web/index.html`; `build-server.sh` → `server/public` (+ `build-catalog.js` → catalog.json); `pkg.sh` → `pkg/` (zip parçaları `pkg_split.py`); `gh_push.sh` → depo köküne yükler
- `web/`: sw.js, manifest, yasal sayfalar (`build-yasal.py` üretir). Görseller depo kökündeki assets.zip / public.zip içindedir (kaynakta ayrıca tutulmaz).
- Sunucu dosyaları depo kökündekilerle aynıdır (`server/` = kök).
- `tests/`: test betikleri (pkg_smoke.sh; Playwright testleri yeniden yazıldıkça buraya eklenir).

Çalışma klasörü kurulumu: `/home/claude/okey/` ← src/* + `server/` ← kök js dosyaları + `web/assets` ← assets.zip + public.zip içindeki assets.
