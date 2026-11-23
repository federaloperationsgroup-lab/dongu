#!/usr/bin/env bash
# Döngü — Türkiye'deki sunucunun kurulumu (v10.20, 23 Kasım 2026).
# Yeni alınmış bir Ubuntu sunucusunda (24.04 önerilir; 22.04 da olur) yönetici (root) olarak bir kez çalıştırılır:
#   curl -fsSL https://raw.githubusercontent.com/federaloperationsgroup-lab/dongu/main/sunucu/kur.sh | bash
# Yeniden çalıştırmak güvenlidir: var olan veritabanına, ayar dosyasına ve gizli bilgilere dokunmaz; yalnız eksikleri tamamlar
# ve yardımcı komutları (dongu-…) depodaki son hâline getirir.
# Kurulanlar: Node.js 22, PostgreSQL (yalnız bu makineden erişilir), Caddy (HTTPS sertifikasını kendisi alır), güvenlik duvarı,
#   oyun sunucusu (systemd hizmeti "dongu"), GitHub'dan kendiliğinden güncelleme (2 dakikada bir), gecelik veritabanı yedeği.
# Oyuncu verisi yalnız bu sunucuda durur. Bu betik ve yardımcıları hiçbir gizli bilgiyi ekrana, günlüğe ya da depoya yazmaz.
set -euo pipefail

main() {
REPO=${DONGU_REPO:-https://github.com/federaloperationsgroup-lab/dongu.git}
APP=/opt/dongu/app; ETC=/etc/dongu; ENVF=$ETC/dongu.env
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
[ "$(id -u)" = "0" ] || { echo "Bu betik yönetici (root) olarak çalıştırılmalı. Komutun sonundaki 'bash' yerine 'sudo bash' yazın."; exit 1; }
cd /
. /etc/os-release
case "$ID:$VERSION_ID" in ubuntu:22.04|ubuntu:24.04|debian:12|debian:13) ;; *) echo "UYARI: bu sistemde denenmedi: $PRETTY_NAME (Ubuntu 24.04 önerilir). Devam ediliyor.";; esac
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1
APT="apt-get -y -q -o DPkg::Lock::Timeout=600"

say "1/8 Temel paketler"
$APT update
$APT install curl ca-certificates gnupg git unzip sudo ufw fail2ban unattended-upgrades python3 openssl
timedatectl set-ntp true >/dev/null 2>&1 || true   # saat doğru olmalı (Google doğrulaması ve sertifikalar saate bakar)

say "2/8 PostgreSQL, Node.js 22, Caddy"
install -d /usr/share/postgresql-common/pgdg
[ -s /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc ] || curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//; s/\..*//')" -lt 22 ]; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; fi
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
fi
$APT update
# Sunucuda zaten bir PostgreSQL varsa o kullanılır; yoksa kararlı en yeni ana sürüm kurulur (eski veritabanından taşıma için en az onun kadar yeni olmalı)
if ! ls /usr/lib/postgresql/*/bin/postgres >/dev/null 2>&1; then
  for v in 18 17 16; do if $APT install "postgresql-$v"; then break; fi; done
fi
ls /usr/lib/postgresql/*/bin/postgres >/dev/null 2>&1 || { echo "HATA: PostgreSQL kurulamadı."; exit 1; }
$APT install nodejs caddy
systemctl enable --now postgresql >/dev/null 2>&1 || true
for _ in $(seq 1 30); do sudo -u postgres psql -Atc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
sudo -u postgres psql -Atc 'select 1' >/dev/null || { echo "HATA: PostgreSQL çalışmıyor (systemctl status postgresql)."; exit 1; }
# Oyun sunucusu veritabanına şifreli (SSL) bağlanır; Ubuntu'da kendiliğinden açıktır, değilse açılır
if [ "$(sudo -u postgres psql -Atc 'show ssl')" != "on" ]; then
  $APT install ssl-cert >/dev/null; make-ssl-cert generate-default-snakeoil >/dev/null 2>&1 || true; usermod -aG ssl-cert postgres
  sudo -u postgres psql -q -c "ALTER SYSTEM SET ssl_cert_file = '/etc/ssl/certs/ssl-cert-snakeoil.pem'" -c "ALTER SYSTEM SET ssl_key_file = '/etc/ssl/private/ssl-cert-snakeoil.key'" -c "ALTER SYSTEM SET ssl = on"
  systemctl restart postgresql; sleep 3
  [ "$(sudo -u postgres psql -Atc 'show ssl')" = "on" ] || { echo "HATA: veritabanında şifreli bağlantı (SSL) açılamadı."; exit 1; }
fi

say "3/8 Kullanıcı ve klasörler"
id dongu >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/dongu --shell /usr/sbin/nologin dongu
install -d -o dongu -g dongu /opt/dongu /var/lib/dongu
install -d -o root -g dongu -m 750 "$ETC"
install -d -o postgres -g postgres -m 700 /var/backups/dongu
install -d -m 755 /var/lib/dongu-guncelle

say "4/8 Oyun dosyaları (GitHub)"
if [ -d "$APP/.git" ]; then
  sudo -u dongu -H git -C "$APP" fetch -q --depth 1 origin main
  sudo -u dongu -H git -C "$APP" reset -q --hard FETCH_HEAD
else
  sudo -u dongu -H git clone -q --depth 1 --branch main "$REPO" "$APP"
fi
( cd "$APP" && sudo -u dongu -H npm install --omit=dev --no-audit --no-fund >/dev/null )
install -m 755 "$APP"/sunucu/bin/* /usr/local/bin/
install -m 644 "$APP"/sunucu/systemd/*.service "$APP"/sunucu/systemd/*.timer /etc/systemd/system/

say "5/8 Veritabanı ve ayar dosyası"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='dongu') THEN CREATE ROLE dongu LOGIN; END IF; END \$\$;"
sudo -u postgres psql -Atc "select 1 from pg_database where datname='dongu'" | grep -q 1 || sudo -u postgres createdb -O dongu -E UTF8 -T template0 --locale=C.UTF-8 dongu
if [ ! -s "$ENVF" ]; then
  PW=$(openssl rand -hex 24); AK=$(openssl rand -hex 20)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
ALTER ROLE dongu PASSWORD '${PW}';
SQL
  umask 027
  cat > "$ENVF" <<ENV
# Döngü sunucu ayarları. Bu dosya gizlidir (veritabanı şifresi ve yönetim anahtarı içerir); kimseyle paylaşılmaz, ekran görüntüsü alınmaz.
# Değer değiştirmek için: dongu-ayar AD   (ör. dongu-ayar ADMIN_KEY). Ad listesi: dongu-ayar
PORT=8080
NODE_ENV=production
DATABASE_URL=postgres://dongu:${PW}@127.0.0.1:5432/dongu
DB_REQUIRED=1
ADMIN_KEY=${AK}
CANON_HOST=
ANDROID_PACKAGE=app.dongu.okey
ANDROID_SHA256=
ADS_OFF=1
IAP_SANDBOX_OK=1
GP_SERVICE_ACCOUNT_FILE=${ETC}/google-hizmet-hesabi.json
ENV
  chown root:dongu "$ENVF"; chmod 640 "$ENVF"; umask 022
  echo "ayar dosyası oluşturuldu (veritabanı şifresi ve yönetim anahtarı rastgele üretildi; ekrana yazılmadı)"
else echo "ayar dosyası zaten var; dokunulmadı"; fi

say "6/8 Güvenlik duvarı, güncellemeler, günlük saklama süresi"
for p in $(sshd -T 2>/dev/null | awk '$1=="port"{print $2}'); do ufw allow "$p/tcp" >/dev/null; done   # uzaktan bağlantı (SSH) kapısı açık kalır
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1 || true
[ -s /etc/apt/apt.conf.d/20auto-upgrades ] || printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades   # işletim sistemi güvenlik güncellemeleri kendiliğinden kurulur
install -d /etc/systemd/journald.conf.d
printf '[Journal]\nMaxRetentionSec=30day\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/dongu.conf   # sunucu günlükleri en çok 30 gün saklanır
systemctl restart systemd-journald || true

say "7/8 Hizmetler"
install -d /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=GODEBUG=http2xconnect=0\n' > /etc/systemd/system/caddy.service.d/dongu.conf   # canlı bağlantı (WebSocket) hep denenmiş yoldan (HTTP/1.1) kurulur
systemctl daemon-reload
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy
systemctl enable dongu.service dongu-guncelle.timer dongu-yedek.timer >/dev/null
systemctl restart dongu.service
systemctl start dongu-guncelle.timer dongu-yedek.timer
[ -s /etc/caddy/Caddyfile.dongu ] || dongu-alan >/dev/null     # alan adı verilene kadar yalnız http://SUNUCU-IP (deneme)
PORT=$(grep -E '^PORT=' "$ENVF" | cut -d= -f2)
for _ in $(seq 1 60); do curl -fsS -m 3 "http://127.0.0.1:${PORT:-8080}/durum" >/dev/null 2>&1 && break; sleep 1; done

say "8/8 Sonuç"
dongu-durum || true
cat <<'SON'

KURULUM TAMAM.
Sıradaki adımlar (Claude ile birlikte, birer birer):
  1) Alan adını bu sunucuya yönlendir, sonra:      dongu-alan tr.dongu.app
  2) Eski sunucudaki verileri taşı:                dongu-tasi
  3) Google Play satın alma anahtarını yerleştir:  dongu-google
Durumu görmek için her zaman:                      dongu-durum
SON
}

main "$@" </dev/null
