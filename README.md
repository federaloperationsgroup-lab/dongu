# Döngü – Oyun + çevrim içi oda sunucusu

Bu paket hem oyunu (public/) hem de oda/eşleşme sunucusunu içerir. Tek adresten çalışır.

Çalıştırmak için:

    npm install
    npm start

Sunucu varsayılan olarak 8080 portunu dinler (PORT ortam değişkeni ile değiştirilebilir).
Tarayıcıda sunucunun adresini açınca oyun gelir; "Çevrim içi oda" ekranında sunucu adresi otomatik dolar.
Telefonda "Ana ekrana ekle" ile tam ekran (yatay) uygulama gibi açılır.

Dosyalar: server.js (oda/maç/kıraathane sunucusu), engine.js (kurallar), economy.js (ekonomi ayarları ve formüller; istemciyle ortak),
accounts.js (hesaplar: dosya ya da Postgres), venues.js (kıraathaneler: dosya ya da Postgres), public.zip (oyun; açılışta public/ klasörüne açılır),
assets.zip (kıraathane görselleri: public/assets/k; açılışta aynı klasöre açılır). İki zip de GitHub web yüklemesinin 25 MB sınırının altındadır.

Ortam değişkenleri: PORT, DATABASE_URL (Postgres; yoksa data/*.json dosyaları), QUICK_WAIT (hızlı masa bekleme ms),
PAID_WAIT (bahisli masada 2+ insan varken bot doldurma süresi ms, varsayılan 60000), TURN_MS (hamle süresi ms, varsayılan 45000; dolunca sunucu oyuncu yerine oynar), DISC_GRACE_MS (bağlantısı kopan oyuncunun sırası için tolerans ms, varsayılan 10000; sayfa yenileyen oyuncu hamlesini kaybetmez), ALLOW_LOCKED_STAKES=1 (Usta/Efsane masalarını açar),
BOT_DELAY, NEXT_DELAY, RESULT_GAP_MS (geliştirme/test).
