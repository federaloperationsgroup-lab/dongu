# Döngü – Oyun + çevrim içi oda sunucusu

Bu paket hem oyunu (public/) hem de oda/eşleşme sunucusunu içerir. Tek adresten çalışır.

Çalıştırmak için:

    npm install
    npm start

Sunucu varsayılan olarak 8080 portunu dinler (PORT ortam değişkeni ile değiştirilebilir).
Tarayıcıda sunucunun adresini açınca oyun gelir; "Çevrim içi oda" ekranında sunucu adresi otomatik dolar.
Telefonda "Ana ekrana ekle" ile tam ekran (yatay) uygulama gibi açılır.

Dosyalar: server.js (oda/maç/kıraathane sunucusu), engine.js (kurallar), economy.js (ekonomi ayarları ve formüller; istemciyle ortak),
accounts.js (hesaplar: dosya ya da Postgres), venues.js (kıraathaneler: dosya ya da Postgres), public.zip, public-2.zip … (oyun) ve
assets.zip, assets-2.zip … (kıraathane görselleri: public/assets/k) — normalde tek public.zip + assets.zip; bir zip 24 MB'ı (GitHub web yüklemesi sınırı 25 MB) aşarsa `pkg_split.py` onu kendiliğinden public-2.zip, assets-2.zip … diye böler (daha küçük parça için `PART_MB=5 sh pkg.sh`). Açılışta hepsi public/ klasörüne açılır. public.zip'in zip açıklaması sürümü ve parça listesini taşır; sunucu yalnız aynı sürümden parçaları açar. Eksik ya da eski sürümden kalmış parça açılmaz; log'da "EKSİK PARÇA" / "ESKİ PARÇA" yazar ve /durum satırında "Paket: v9.76, 8/8 parça" (sorun varsa "SORUN: …") görünür. Eski biçim (açıklamasız tek public.zip + assets.zip) da açılır. Paket `pkg.sh` → `pkg_split.py` ile üretilir.

Ortam değişkenleri: PORT, DATABASE_URL (Postgres; yoksa data/*.json dosyaları), QUICK_WAIT (hızlı masa bekleme ms),
PAID_WAIT (bahisli masada 2+ insan varken bot doldurma süresi ms, varsayılan 60000), TURN_MS (hamle süresi ms, varsayılan 30000; dolunca sunucu oyuncu yerine oynar), DISC_GRACE_MS (bağlantısı kopan oyuncunun sırası için tolerans ms, varsayılan 10000; sayfa yenileyen oyuncu hamlesini kaybetmez), ROOM_GRACE_MS (başlamamış arkadaş odası bütün oyuncuların bağlantısı kopunca bu kadar ms açık kalır, varsayılan 600000 = 10 dk; kurucu kodu paylaşmak için uygulamadan çıkınca oda silinmez), REMATCH_WAIT (maç sonunda "Bu masayla devam et" oy süresi ms, varsayılan 60000), ALLOW_LOCKED_STAKES=1 (Usta/Efsane masalarını açar),
BOT_DELAY, NEXT_DELAY, RESULT_GAP_MS (geliştirme/test).

Kalıcı oda kaydı (v9.85): başlamış ve bitmemiş maçlar Postgres'te `rooms` tablosunda (DATABASE_URL yoksa `data/rooms.json`) tutulur; en geç 1 sn'de bir ve her el sonunda yazılır, maç bitince silinir. Sunucu yeniden kurulunca ya da yeniden başlayınca oda geri yüklenir; oyuncuların uygulaması aynı oda kodu ve koltuk anahtarıyla kendiliğinden yeniden bağlanır. Kapanışta (SIGTERM — Render kurulumda gönderir) son durum yazılır ve oda "bırakılır"; yeni sunucu süreci bırakılan odayı hemen, sahibi sessiz kalan (çökmüş) odayı ROOM_STALE_S sn sonra devralır. Kurulumda eski ve yeni süreç kısa süre birlikte çalışırsa yeni süreç eskisinin odasına dokunmaz. Yarım kalan emanetler (bahisli masa girişi) açılıştan ESCROW_RELEASE_MS sonra, yalnız hiçbir masada oturmayan hesaplar için iade edilir. Ortam değişkenleri (isteğe bağlı): ROOM_STALE_S (varsayılan 45), RESTORE_GRACE_MS (geri yüklenen odada bağlantısı kopuk oyuncunun sırası için bekleme, varsayılan 30000), ESCROW_RELEASE_MS (varsayılan 90000). `/durum` satırında "Odalar: N (kayıttan dönen M)".

Ölçüm (v9.76): her el ve maç için bir kayıt satırı — dosya modunda `data/matches.jsonl`, Postgres'te `match_log` tablosu (kişisel veri yok: hesap kimliği yazılmaz). `/durum` satırında "Kayıt: N el / M maç"; `/olcum` JSON özeti (görev başına açılma, el süresi, bitiş türleri, ×2/×4, maç tamamlama ve rövanş oranı).

Hesap kilidi (v9.86): aynı hesabın oku → değiştir → yaz işlemleri (maç ödülleri, havuz payı, mağaza, günlük ödül, kıraathane uçları, açılıştaki emanet iadesi) sunucu içinde sırayla yürür; Postgres modunda eşzamanlı iki yazmadan birinin kaybolması önlenir.

Lig (v9.87, basit sürüm): ayrı kuyruk yok. Hızlı Katıl'ın Sosyal (girişsiz) masası en az 3 gerçek (hesabı doğrulanmış) oyuncuyla başlarsa lig maçıdır; maç sonunda sıraya göre Döngü Puanı (economy.js `CONFIG.league`: taban +20/+8/−8/−20, el sayısı katsayısı, rakip gücü, aynı grupla günde 3 maç, hükmen son 4.; puan 0'ın altına inmez). Sezon UTC takvim ayıdır (TR 03.00). Puan hesap kaydında (`players.data.league`); ek tablo yok. Liderlik: `POST /api/lig` {id, token} → bu sezonun ilk 50'si (ad, seviye, puan, maç, birincilik; hesap kimliği gönderilmez), isteyenin sırası ve geçen sezonun ilk 3'ü. Önbellek LEAGUE_CACHE_MS (varsayılan 20000), lig maçı bitince tazelenir. Lig maçında Çaktırmadan Bak kapalı (`CONFIG.league.peekOff`). Maç kaydında `league` alanı; `/olcum` özetinde `leagueMatches`.
