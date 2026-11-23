# Döngü — Türkiye'deki sunucu (kurulum takımı)

v10.20 (23 Kasım 2026). Karar: oyuncu verisi Türkiye'de durur; yurt dışına kişisel veri aktarımı kalmaz.
Tek bir sanal sunucuda (Ubuntu 24.04) oyun sunucusu (Node.js), veritabanı (PostgreSQL) ve web sunucusu (Caddy, HTTPS) birlikte çalışır.
GitHub'da yalnız kod durur; sunucu yeni sürümü oradan kendisi çeker.

## Kurulum (bir kez)

Sunucuya yönetici (root) olarak bağlanıp tek satır:

```
curl -fsSL https://raw.githubusercontent.com/federaloperationsgroup-lab/dongu/main/sunucu/kur.sh | bash
```

Yeniden çalıştırmak güvenlidir: veritabanına, ayar dosyasına ve gizli bilgilere dokunmaz; eksikleri tamamlar ve yardımcı komutları yeniler.

Kurulanlar: Node.js 22, PostgreSQL (PGDG deposundan; 18, yoksa 17/16), Caddy, güvenlik duvarı (ufw: yalnız SSH, 80, 443), fail2ban,
işletim sistemi güvenlik güncellemeleri (unattended-upgrades), `dongu` adlı yetkisiz kullanıcı, `dongu` hizmeti ve iki zamanlayıcı.

## Komutlar (hepsi sunucuda, yönetici olarak)

| Komut | Ne yapar |
| --- | --- |
| `dongu-durum` | Durum özeti. Gizli bilgi göstermez; ekran görüntüsü paylaşılabilir. |
| `dongu-alan [adlar…]` | Alan adlarını ayarlar; sertifikayı Caddy alır. İlk yazılan asıl addır, ötekiler ona yönlenir. Adsız: yalnız `http://IP`. |
| `dongu-tasi` | Eski veritabanını (Neon) buraya taşır, tablo tablo karşılaştırır. Bir kez yapılır (`--yeniden` ile yinelenir). |
| `dongu-google` | Google Play hizmet hesabı anahtarını yerleştirir ve gerçek istekle dener (`--dene`: yalnız dener). |
| `dongu-ayar [AD [değer]]` | Ayar değiştirir (değer gizli sorulur) ve sunucuyu yeniden başlatır. Adsız: ayar adlarını listeler. |
| `dongu-yedek` | Veritabanı yedeği alır. Her gece 04.30'da (Türkiye saati) kendiliğinden çalışır; 14 gün saklanır. |
| `dongu-guncelle` | GitHub'da yeni sürüm varsa kurar. 2 dakikada bir kendiliğinden çalışır. `--zorla`, `--betikler` seçenekleri var. |

## Nerede ne var

| Yer | İçerik |
| --- | --- |
| `/opt/dongu/app` | Deponun kopyası (sığ klon). Oyun paketi her açılışta zip'lerden `public/` içine yeniden çıkarılır. |
| `/etc/dongu/dongu.env` | Ayarlar (veritabanı şifresi, yönetim anahtarı). Gizli; `root:dongu 640`. |
| `/etc/dongu/google-hizmet-hesabi.json` | Google Play anahtarı. Gizli; `root:dongu 640`. |
| `/etc/caddy/Caddyfile` | `dongu-alan` yazar; elle düzenlenmez. İstek günlüğü tutulmaz. |
| `/var/backups/dongu` | Yedekler (`dongu-*.dump`, yalnız `postgres`/`root` okur). |
| `/var/log/dongu-guncelle.log` | Güncelleme kayıtları (yalnız değişiklik olduğunda satır eklenir). |
| `journalctl -u dongu` | Oyun sunucusunun günlüğü; en çok 30 gün saklanır. |

## Çalışma biçimi

- **Güncelleme:** `dongu-guncelle` `main` dalını çeker. Depo kökündeki sunucu dosyaları (`*.js`, `*.json`, `*.zip`) değiştiyse sunucuyu yeniden başlatır ve `/durum` yanıtını bekler.
  Yeni sürüm 60 saniyede açılmazsa önceki sürüme döner; o sürümü yeniden denemez (yeni gönderim gelene ya da `--zorla` denene kadar).
- **Yardımcı komutlar kendiliğinden güncellenmez.** Yönetici yetkisiyle çalıştıkları için depodaki değişiklik ancak `dongu-guncelle --betikler` (ya da `kur.sh`) ile, elle uygulanır.
- **Ayarlar** `dongu.env` içindedir. `TZ=UTC` hizmet tanımında sabittir (eski sunucudaki davranışla aynı).
- **Veritabanı** yalnız bu makineden erişilir (127.0.0.1), bağlantı şifreli (SSL) ve parolalıdır. Dil ayarı `C.UTF-8`.
- **Veritabanı yoksa oyun açılmaz** (`DB_REQUIRED=1`): sunucu veritabanına ulaşamazsa dosya deposuna geçmez, kapanır ve hizmet birkaç saniyede bir yeniden dener. Böylece veritabanı geç açıldığında oyuncular boş bir depoyla karşılaşıp yeni misafir hesabına düşmez.
- **WebSocket** HTTP/1.1 üzerinden kurulur (`GODEBUG=http2xconnect=0`); sayfa ve dosyalar HTTP/2 ile gider; HTTP/3 kapalıdır.
- **Gerçek IP:** Caddy istemcinin gönderdiği `X-Forwarded-For` değerini atıp kendi gördüğü adresi yazar; `CF-Connecting-IP` başlığı silinir (Cloudflare artık araya girmiyor).

## Eski sunucudan (Render + Neon) taşıma sırası

1. Sunucu alınır, `kur.sh` çalıştırılır; `dongu-durum` temiz çıkar.
2. Cloudflare → DNS: `tr.dongu.app` için A kaydı sunucunun IP'sine, **DNS only** (gri bulut). Sonra `dongu-alan tr.dongu.app`. Tarayıcıda `https://tr.dongu.app` denenir (boş veritabanı; çevrim içi maç dahil).
3. Render'da hizmet durdurulur (Suspend). `dongu-tasi` çalıştırılır (eski `DATABASE_URL` gizli yapıştırılır). Bütün satırlar "aynı" çıkmalıdır.
4. Gereken ayarlar taşınır: `dongu-ayar ADMIN_KEY`, varsa `dongu-ayar ANDROID_SHA256`.
5. Cloudflare → DNS: `dongu.app` (ve varsa `www`) A kaydı sunucunun IP'sine, **DNS only**. Sonra `dongu-alan dongu.app www.dongu.app tr.dongu.app`.
6. `https://dongu.app/durum` ve oyun denenir (kayıtlı hesapla giriş, çevrim içi maç, telefon uygulaması).
7. Birkaç gün sorunsuz geçince Render hizmeti ve Neon projesi silinir (veri artık yurt dışında durmaz).

## Bakım

- **Ayda bir:** `apt-get update && apt-get upgrade` (PostgreSQL, Node.js ve Caddy güncellemeleri; işletim sisteminin güvenlik güncellemeleri zaten kendiliğinden kurulur). `dongu-durum` "yeniden başlatılması bekleniyor" diyorsa sakin bir saatte `reboot`.
- **Node.js 22** Nisan 2027'de destekten çıkar; ondan önce 24'e geçilir (önce testler 24 ile çalıştırılır).
- **Yedekler aynı makinededir.** Makinenin tamamen kaybına karşı sağlayıcının yedekleme / anlık görüntü hizmeti (Türkiye'de) açılmalıdır.
- **Yedekten geri yükleme** (yalnız gerektiğinde, Claude ile birlikte): `systemctl stop dongu` → `sudo -u postgres dropdb dongu` → `sudo -u postgres createdb -O dongu -E UTF8 -T template0 --locale=C.UTF-8 dongu` → `sudo -u postgres pg_restore --no-owner --role=dongu -d dongu /var/backups/dongu/DOSYA.dump` → `systemctl start dongu`.

## Bilinen sınırlar

- Cloudflare'in saldırı koruması artık önde değil (kayıtlar "DNS only"). Saldırı olursa sağlayıcının koruması ve gerekirse ek önlem düşünülür.
- Tek makine: makine kapalıyken oyun da kapalıdır.
- Depo herkese açık olduğu için klonlama kimliksiz yapılır. Depo gizli yapılırsa sunucuya salt okunur bir "deploy key" tanımlanması gerekir.
- SSH parolayla açıktır (fail2ban deneme sayısını sınırlar). Anahtarla girişe geçmek daha güvenlidir.

## Nasıl denendi

- `tests/sunucu_smoke.sh`: yedi yardımcı komut sahte `systemctl`/`caddy` ve yerel PostgreSQL ile (taşıma, fark yakalama, geri dönüş, gizli bilgi sızmaması…) ve "veritabanı yoksa açılma" koruması gerçek sunucu koduyla — 46 denetim.
- `kur.sh` Ubuntu 24.04 üzerinde benzetimle baştan sona çalıştırıldı (paket kurulumları ve `systemctl` sahte; PostgreSQL gerçek: rol, veritabanı, parolalı ve şifreli bağlantı, ikinci çalıştırmada ayarların korunması).
- **Denenmeyenler (ancak gerçek sunucuda görülür):** gerçek paket kurulumları (PGDG, NodeSource, Caddy), systemd hizmet ve zamanlayıcıları, Caddy'nin ayarı kabul etmesi, HTTPS sertifikası, WebSocket, güvenlik duvarı, Neon'dan kopya alma.
