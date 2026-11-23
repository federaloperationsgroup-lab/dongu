#!/usr/bin/env bash
# Türkiye sunucusu yardımcı komutlarının (sunucu/bin: dongu-guncelle, -tasi, -yedek, -ayar, -alan, -google, -durum) denemesi (v10.20).
# Sahte systemctl / caddy / sudo / ufw ve yerel PostgreSQL (pg_local.sh) kullanır; sistem dosyalarına dokunmaz
# (her yol DONGU_* değişkenleriyle deneme klasörüne çevrilir). Kullanım: bash sunucu_smoke.sh
# Kapsam dışı (ancak gerçek sunucuda denenir): kur.sh'ın paket kurulumları, gerçek systemd, gerçek Caddy (HTTPS, WebSocket), güvenlik duvarı.
set -u
HERE=$(cd "$(dirname "$0")" && pwd); KIT=$HERE/../sunucu
T=$(mktemp -d /tmp/dongu-sunucu-test.XXXXXX); PASS=0; FAIL=0
S=$(sh "$HERE/pg_local.sh") || { echo "FAIL yerel PostgreSQL başlatılamadı"; echo "SONUÇ: 0 PASS / 1 FAIL"; exit 1; }
export PGHOST=$S PGPORT=54331 PGUSER=postgres
sq() { psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }
killfake() { if [ -s "$T/fake.pid" ]; then kill "$(cat "$T/fake.pid")" 2>/dev/null; rm -f "$T/fake.pid"; fi; }
cleanup() { killfake; sq -c "DROP DATABASE IF EXISTS eski_smoke WITH (FORCE)" -c "DROP DATABASE IF EXISTS dongu WITH (FORCE)" -c "DROP ROLE IF EXISTS dongu" >/dev/null 2>&1; rm -rf "$T"; }
trap cleanup EXIT
ok() { if [ "$1" = 0 ]; then PASS=$((PASS + 1)); echo "PASS $2"; else FAIL=$((FAIL + 1)); echo "FAIL $2 :: ${3:-}"; fi; }
t() { local d="$1"; shift; if "$@"; then ok 0 "$d"; else ok 1 "$d" "${LAST:-}"; fi; }   # t "açıklama" koşul…
has() { grep -q -- "$2" <<<"$1"; }; hasnt() { ! grep -q -- "$2" <<<"$1"; }
restarts() { grep -c "$1 dongu" "$T/systemctl.log" 2>/dev/null || true; }

mkdir -p "$T/shim" "$T/state" "$T/bk" "$T/etc" "$T/bin2" "$T/units2"
cat > "$T/shim/fake-server.js" <<'EOF'
const http = require('http'), fs = require('fs'), path = require('path');
const T = process.env.KIT_T, key = process.env.ADMIN_KEY || '';
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/durum') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Döngü çalışıyor. Sürüm: v10.20. Hesap deposu: postgres. Satın alma: Google Play doğrulaması açık, deneme satın alması kabul, iade taraması bekliyor. Reklam ödülü: kapalı'); }
  if (u.pathname === '/yonetim/iade-tara') {
    if (u.searchParams.get('key') !== key) { res.writeHead(404); return res.end('bulunamadı'); }
    let mode = 'ok'; try { mode = fs.readFileSync(path.join(T, 'google-mode'), 'utf8').trim(); } catch (e) {}
    const m = { ok: [200, { seen: 0, refunded: 0 }], auth: [502, { error: 'Google yetkilendirme 400 (invalid_grant)' }], perm: [502, { error: 'HTTP 403' }], off: [200, { off: true }], net: [502, { error: 'getaddrinfo ENOTFOUND androidpublisher.googleapis.com' }] }[mode];
    res.writeHead(m[0], { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(m[1]));
  }
  res.writeHead(404); res.end('yok');
}).listen(parseInt(process.env.PORT, 10), '127.0.0.1');
EOF
cat > "$T/shim/systemctl" <<'EOF'
#!/usr/bin/env bash
# sahte systemctl: çağrıları kaydeder; "dongu" hizmeti yerine sahte sunucuyu açar/kapatır
T=${KIT_T:?}; echo "$*" >> "$T/systemctl.log"; pidf="$T/fake.pid"
stop() { if [ -s "$pidf" ]; then kill "$(cat "$pidf")" 2>/dev/null; rm -f "$pidf"; fi; }
start() { stop; ( PORT=$(grep -E '^PORT=' "$T/etc/dongu.env" | cut -d= -f2); ADMIN_KEY=$(grep -E '^ADMIN_KEY=' "$T/etc/dongu.env" | cut -d= -f2-); export PORT ADMIN_KEY; cd "${FAKE_APP:-$T/shim}" || exit 1; nohup node "${FAKE_MAIN:-fake-server.js}" >/dev/null 2>&1 9>&- & echo $! > "$pidf" ); }
case "$1 ${2:-}" in "stop dongu") stop;; "start dongu"|"restart dongu") start;; "is-active "*) echo active;; esac
exit 0
EOF
cat > "$T/shim/caddy" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "${KIT_T:?}/caddy.log"
if [ "$1" = "validate" ] && [ -e "$KIT_T/caddy-bozuk" ]; then echo "Error: adapting config using caddyfile: unrecognized directive: ornek" >&2; exit 1; fi
exit 0
EOF
cat > "$T/shim/sudo" <<'EOF'
#!/usr/bin/env bash
while [ $# -gt 0 ]; do case "$1" in -u) shift 2;; -H) shift;; *) break;; esac; done
exec "$@"
EOF
printf '#!/usr/bin/env bash\necho "Status: active"\n' > "$T/shim/ufw"
chmod +x "$T"/shim/*
cat > "$T/etc/dongu.env" <<EOF
# deneme ayar dosyası
PORT=18077
DATABASE_URL=postgresql://dongu@$(printf '%s' "$S" | sed 's|/|%2F|g'):54331/dongu
ADMIN_KEY=gizli anahtar+&=1
CANON_HOST=
GP_SERVICE_ACCOUNT_FILE=$T/etc/google.json
EOF
export KIT_T=$T PATH=$T/shim:$KIT/bin:$PATH
export DONGU_ENV=$T/etc/dongu.env DONGU_BACKUPS=$T/bk DONGU_STATE=$T/state DONGU_GRP=$(id -gn) DONGU_WAIT=8 DONGU_CADDYFILE=$T/etc/Caddyfile DONGU_LOG=$T/guncelle.log DONGU_LOCK=$T/lock DONGU_RUNAS= DONGU_BIN=$T/bin2 DONGU_UNITS=$T/units2
export DONGU_PGSU="env PGHOST=$S PGPORT=54331 PGUSER=postgres"
NEWURL=$(grep '^DATABASE_URL=' "$T/etc/dongu.env" | cut -d= -f2-); OLDURL="postgresql://postgres@$(printf '%s' "$S" | sed 's|/|%2F|g'):54331/eski_smoke"

# ---------- 0) sözdizimi ve sabit denetimler ----------
bad=""; for f in "$KIT"/kur.sh "$KIT"/bin/*; do bash -n "$f" 2>/dev/null || bad="$bad $(basename "$f")"; done
t "bütün betikler sözdizimi denetiminden geçiyor (kur.sh + 7 komut)" test -z "$bad" -a "$(ls "$KIT"/bin | wc -l)" = 7
U=$(cat "$KIT/systemd/dongu.service")
t "hizmet tanımı: ayrı kullanıcı, ayar dosyası, kendiliğinden yeniden başlatma, paket her açılışta yeniden çıkarılır, saat dilimi UTC" eval 'has "$U" "^User=dongu" && has "$U" "^EnvironmentFile=/etc/dongu/dongu.env" && has "$U" "^Restart=always" && has "$U" "^ExecStartPre=/usr/bin/rm -rf /opt/dongu/app/public" && has "$U" "^Environment=TZ=UTC" && has "$U" "^NoNewPrivileges=true" && has "$U" "^ExecStartPre=-/usr/bin/timeout 30 .*pg_isready"'
K=$(cat "$KIT/kur.sh")
t "kur.sh: gizli değerler ekrana yazılmaz; ayar dosyası 640; reklam kapalı; veritabanı yalnız bu makineden; güvenlik duvarı ve günlük süresi" eval 'hasnt "$K" "echo.*\$PW" && hasnt "$K" "echo.*\$AK" && has "$K" "chmod 640" && has "$K" "^ADS_OFF=1" && has "$K" "^DB_REQUIRED=1" && has "$K" "@127.0.0.1:5432/dongu" && has "$K" "ufw --force enable" && has "$K" "MaxRetentionSec=30day" && has "$K" "main \"\$@\" </dev/null"'
t "zamanlayıcılar: güncelleme 2 dakikada bir, yedek her gece" eval 'grep -q "OnUnitActiveSec=2min" "$KIT/systemd/dongu-guncelle.timer" && grep -q "OnCalendar=.*01:30:00 UTC" "$KIT/systemd/dongu-yedek.timer"'

# ---------- 1) veri taşıma (dongu-tasi) ----------
PGOPTIONS='-c client_min_messages=warning' sq -c "DROP DATABASE IF EXISTS eski_smoke WITH (FORCE)" -c "DROP DATABASE IF EXISTS dongu WITH (FORCE)" -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='dongu') THEN CREATE ROLE dongu LOGIN; END IF; END \$\$" -c "CREATE DATABASE eski_smoke" -c "CREATE DATABASE dongu OWNER dongu ENCODING 'UTF8' LOCALE 'C.UTF-8' TEMPLATE template0"
sq -d eski_smoke <<'SQL'
CREATE TABLE players (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now());
CREATE TABLE match_log (id SERIAL PRIMARY KEY, at TIMESTAMPTZ DEFAULT now(), data JSONB NOT NULL);
CREATE INDEX players_rec ON players ((data->>'rec'));
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE purchases (id SERIAL PRIMARY KEY, tx TEXT UNIQUE NOT NULL, player TEXT NOT NULL, product TEXT NOT NULL, store TEXT, price NUMERIC, currency TEXT, at BIGINT, status TEXT, alt TEXT);
CREATE TABLE rooms (code TEXT PRIMARY KEY, data JSONB NOT NULL, owner TEXT, beat TIMESTAMPTZ DEFAULT now());
CREATE TABLE dm (id BIGSERIAL PRIMARY KEY, conv TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, cid TEXT NOT NULL, body TEXT, at BIGINT, read BOOLEAN DEFAULT false);
CREATE TABLE venues (id TEXT PRIMARY KEY, code TEXT, data JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now());
INSERT INTO players SELECT 'p' || g, jsonb_build_object('name', 'Oyuncu Şükrü İğdır ' || g, 'coins', g * 1000.5, 'rec', md5(g::text), 'tags', jsonb_build_array('ç', 'ö', g), 'n', jsonb_build_object('a', null, 'b', 1e3)), now() - (g || ' minutes')::interval FROM generate_series(1, 400) g;
INSERT INTO match_log (data) SELECT jsonb_build_object('k', 'match', 'hands', g) FROM generate_series(1, 900) g;
DELETE FROM match_log WHERE id % 9 = 0;
INSERT INTO meta VALUES ('sifirla', '3'), ('boş', NULL);
INSERT INTO purchases (tx, player, product, store, price, currency, at, status, alt) SELECT 'GPA.' || g, 'p' || g, 'altin_kucuk', 'play', 49.99, 'TRY', 1790000000000 + g, CASE WHEN g % 7 = 0 THEN 'refunded' ELSE 'ok' END, 'gpt:' || md5(g::text) FROM generate_series(1, 40) g;
INSERT INTO rooms VALUES ('ABCD', '{"seats": [1, 2, 3, 4]}', 'eski-ornek', now());
INSERT INTO dm (conv, sender, recipient, cid, body, at) SELECT 'p1:p2', 'p1', 'p2', 'c' || g, 'Merhaba “tırnak” ''tek'' \ ters ' || g || E'\nikinci satır', 1790000000000 + g FROM generate_series(1, 150) g;
SQL
sq -d "$NEWURL" -c "CREATE TABLE players (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now())" -c "INSERT INTO players VALUES ('deneme1', '{}')"
: > "$T/systemctl.log"
LAST=$(printf '%s\nhayır\n' "$OLDURL" | dongu-tasi 2>&1); rc=$?
t "taşıma: \"hayır\" denince hiçbir şey değişmez" eval '[ $rc = 0 ] && has "$LAST" "Vazgeçildi" && [ "$(sq -d "$NEWURL" -c "select count(*) from players")" = 1 ] && [ "$(restarts stop)" = 0 ]'
t "taşıma: özet eski ve yeni kayıt sayılarını gösterir, adresi göstermez" eval 'has "$LAST" "7 tablo, 400 oyuncu kaydı" && has "$LAST" "şu an 1 oyuncu kaydı" && hasnt "$LAST" "eski_smoke"'
LAST=$(printf 'http://yanlis\n' | dongu-tasi 2>&1); rc=$?
t "taşıma: postgres ile başlamayan adres reddedilir" eval '[ $rc = 1 ] && has "$LAST" "ile başlamalı"'
LAST=$(printf 'postgresql://postgres@127.0.0.1:1/yok\n' | dongu-tasi 2>&1); rc=$?
t "taşıma: ulaşılamayan eski veritabanı → açık hata, değişiklik yok" eval '[ $rc = 1 ] && has "$LAST" "bağlanılamadı" && [ "$(restarts stop)" = 0 ]'
LAST=$(printf '  %s \r\nevet\n' "$OLDURL" | dongu-tasi 2>&1); rc=$?
t "taşıma: bütün tablolar ve sayaçlar aynı, oyun sunucusu durdurulup yeniden başlatılır" eval '[ $rc = 0 ] && [ "$(grep -c " aynı$" <<<"$LAST")" = 8 ] && hasnt "$LAST" "FARKLI" && has "$LAST" "TAŞIMA TAMAM" && [ "$(restarts stop)" = 1 ] && [ "$(restarts start)" = 1 ]'
t "taşıma: veri yeni veritabanında (Türkçe harfler, sahiplik, dizinler, sayaç devamı, dil ayarı)" eval '[ "$(sq -d "$NEWURL" -c "select count(*) from players")" = 400 ] && [ "$(sq -d "$NEWURL" -c "select data->>'"'"'name'"'"' from players where id='"'"'p7'"'"'")" = "Oyuncu Şükrü İğdır 7" ] && [ "$(sq -d dongu -c "select string_agg(distinct tableowner, '"'"','"'"') from pg_tables where schemaname='"'"'public'"'"'")" = dongu ] && [ "$(sq -d dongu -c "select count(*) from pg_indexes where schemaname='"'"'public'"'"'")" = 9 ] && [ "$(sq -d dongu -c "select nextval('"'"'match_log_id_seq'"'"')")" = 901 ] && [ "$(sq -c "select datcollate from pg_database where datname='"'"'dongu'"'"'")" = "C.UTF-8" ]'
t "taşıma: önceki deneme verisi yedeklendi; eski veritabanının kopyası ve kayıt yalnız yöneticiye açık; işaret dosyası yazıldı" eval '[ "$(ls "$T"/bk/dongu-2*.dump 2>/dev/null | wc -l)" = 1 ] && [ "$(stat -c %a "$T"/bk/dongu-eski-veritabani-*.dump)" = 600 ] && [ -s "$T/state/tasindi" ] && [ ! -e "$T/state/tasima-suruyor" ]'
LAST=$(printf '%s\nevet\n' "$OLDURL" | dongu-tasi 2>&1); rc=$?
t "taşıma: ikinci kez çalıştırma reddedilir (güncel veri silinmesin)" eval '[ $rc = 1 ] && has "$LAST" "daha önce yapıldı" && has "$LAST" "dongu-tasi --yeniden"'
mkdir -p "$T/fakelib/16/bin"; REALBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
printf '#!/usr/bin/env bash\n%s/pg_dump "$@"; rc=$?\npsql -X -q -d eski_smoke -c "update players set data = jsonb_set(data, '"'"'{coins}'"'"', '"'"'7'"'"') where id = '"'"'p3'"'"'" -c "insert into dm (conv, sender, recipient, cid, body, at) values ('"'"'p1:p2'"'"', '"'"'p1'"'"', '"'"'p2'"'"', '"'"'gec'"'"', '"'"'geç'"'"', 1)"\nexit $rc\n' "$REALBIN" > "$T/fakelib/16/bin/pg_dump"
printf '#!/usr/bin/env bash\nexec %s/pg_restore "$@"\n' "$REALBIN" > "$T/fakelib/16/bin/pg_restore"; chmod +x "$T"/fakelib/16/bin/*
: > "$T/systemctl.log"
LAST=$(printf '%s\nevet\n' "$OLDURL" | DONGU_PGLIB=$T/fakelib dongu-tasi --yeniden 2>&1); rc=$?
t "taşıma: kopyadan sonra eski veritabanı değişirse (eski sunucu durdurulmamış) fark yakalanır, oyun sunucusu başlatılmaz" eval '[ $rc = 1 ] && [ "$(grep -c "FARKLI" <<<"$LAST")" = 3 ] && has "$LAST" "TAŞIMA TAMAMLANMADI" && [ "$(restarts stop)" = 1 ] && [ "$(restarts start)" = 0 ] && [ -e "$T/state/tasima-suruyor" ]'
t "taşıma: aynı satır sayısıyla içerik farkı da yakalanır (players 400 → 400 FARKLI)" eval 'grep -q "players  *400 satır →  *400 satır  *FARKLI" <<<"$LAST"'
LAST=$(printf '%s\nevet\n' "$OLDURL" | dongu-tasi --yeniden 2>&1); rc=$?
t "taşıma: --yeniden ile temiz yineleme; yarım işareti kalkar" eval '[ $rc = 0 ] && has "$LAST" "TAŞIMA TAMAM" && [ ! -e "$T/state/tasima-suruyor" ] && [ "$(sq -d "$NEWURL" -c "select count(*) from dm")" = 151 ]'

# ---------- 2) yedek (dongu-yedek) ----------
touch -d '20 days ago' "$T/bk/dongu-2020-01-01-000000.dump" "$T/bk/tasima-2020-01-01-000000.log"; touch -d '3 days ago' "$T/bk/dongu-2026-01-01-000000.dump"
LAST=$(dongu-yedek 2>&1); rc=$?
t "yedek: yeni yedek alınır (boş değil, 600); 14 günden eski yedek ve taşıma kaydı silinir, yenisi kalır" eval '[ $rc = 0 ] && has "$LAST" "yedek alındı" && [ ! -e "$T/bk/dongu-2020-01-01-000000.dump" ] && [ ! -e "$T/bk/tasima-2020-01-01-000000.log" ] && [ -e "$T/bk/dongu-2026-01-01-000000.dump" ] && [ "$(stat -c %a "$(ls -t "$T"/bk/dongu-2*.dump | head -1)")" = 600 ]'
NEWEST=$(ls -t "$T"/bk/dongu-2*.dump | grep -v 2026-01-01 | head -1)
t "yedek: dosya geri yüklenebilir biçimde (içinde players tablosu var)" eval '"$REALBIN/pg_restore" -l "$NEWEST" | grep -q "TABLE DATA public players"'
LAST=$(DONGU_PGSU="env PGHOST=/yok PGPORT=1" dongu-yedek 2>&1); rc=$?
t "yedek: veritabanına ulaşılamazsa hata verir, yarım dosya bırakmaz" eval '[ $rc = 1 ] && has "$LAST" "HATA" && [ -z "$(ls "$T"/bk/*.tmp 2>/dev/null)" ]'

# ---------- 3) kendiliğinden güncelleme (dongu-guncelle) ----------
killfake; rm -f "$T/guncelle.log"; : > "$T/guncelle.log"
git init -q --bare "$T/origin.git"; git init -q "$T/work"; cd "$T/work" || exit 1
git config user.email t@t; git config user.name t; git config push.negotiate false; git checkout -q -b main
mkserver() { printf "const http = require('http'); %s\nhttp.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); r.end('Döngü çalışıyor. Sürüm: v%s. Satın alma: kapalı'); }).listen(parseInt(process.env.PORT, 10), '127.0.0.1');\n" "$2" "$1" > server.js; }
mkserver 1.0 ""; echo '{"name":"x","dependencies":{}}' > package.json; mkdir -p src sunucu/bin sunucu/systemd; echo a > src/a.txt; echo '#!/bin/sh' > sunucu/bin/dongu-ornek; echo '[Unit]' > sunucu/systemd/dongu-ornek.service; echo '[Timer]' > sunucu/systemd/dongu-ornek.timer
git add -A; git commit -qm "v1.0"; git remote add origin "$T/origin.git"; git push -q origin main 2>/dev/null
cd "$T" || exit 1; git clone -q --depth 1 --branch main "file://$T/origin.git" app; mkdir -p app/node_modules
export DONGU_APP=$T/app FAKE_APP=$T/app FAKE_MAIN=server.js
systemctl restart dongu; sleep 1
ver() { curl -s -m 3 http://127.0.0.1:18077/durum | grep -o 'Sürüm: v[0-9.]*[0-9]' || echo "YANIT YOK"; }
push() { ( cd "$T/work" && git add -A && git commit -qm "$1" && git push -q origin main 2>/dev/null ); }
head_s() { git -C "$T/app" log -1 --format=%s; }
dongu-guncelle; rc=$?
t "güncelleme: değişiklik yoksa hiçbir şey yapmaz, kayıt yazmaz" eval '[ $rc = 0 ] && [ "$(ver)" = "Sürüm: v1.0" ] && [ ! -s "$T/guncelle.log" ]'
echo b > "$T/work/src/a.txt"; push "yalnız kaynak"; : > "$T/systemctl.log"; dongu-guncelle; rc=$?
t "güncelleme: yalnız kaynak klasörü değiştiyse dosyalar yenilenir, sunucu yeniden başlatılmaz" eval '[ $rc = 0 ] && [ "$(restarts restart)" = 0 ] && [ "$(head_s)" = "yalnız kaynak" ] && grep -q "yeniden başlatılmadı" "$T/guncelle.log"'
( cd "$T/work" && mkserver 1.1 "" ); push "v1.1"; : > "$T/systemctl.log"; dongu-guncelle; rc=$?
t "güncelleme: sunucu dosyası değişince yeni sürüm yayına girer" eval '[ $rc = 0 ] && [ "$(restarts restart)" = 1 ] && [ "$(ver)" = "Sürüm: v1.1" ] && grep -q "yayında (Sürüm: v1.1)" "$T/guncelle.log"'
( cd "$T/work" && mkserver 1.2 "process.exit(1);" ); push "v1.2 bozuk"; : > "$T/systemctl.log"; DONGU_WAIT=4 dongu-guncelle; rc=$?
t "güncelleme: açılmayan sürümde öncekine dönülür" eval '[ $rc = 1 ] && [ "$(restarts restart)" = 2 ] && [ "$(ver)" = "Sürüm: v1.1" ] && [ "$(head_s)" = "v1.1" ] && [ -s "$T/state/acilmayan" ] && grep -q "önceki sürüm .* yeniden yayında" "$T/guncelle.log"'
: > "$T/systemctl.log"; dongu-guncelle; rc=$?
t "güncelleme: açılmadığı görülen sürüm yeniden denenmez (sunucu 2 dakikada bir kapanıp açılmaz)" eval '[ $rc = 0 ] && [ "$(restarts restart)" = 0 ] && [ "$(ver)" = "Sürüm: v1.1" ]'
( cd "$T/work" && mkserver 1.3 "" && echo yeni > sunucu/bin/dongu-ornek && echo '{"name":"x","dependencies":{},"v":2}' > package.json ); push "v1.3"; : > "$T/systemctl.log"; dongu-guncelle; rc=$?
t "güncelleme: düzeltilmiş sürüm yayına girer; yardımcı komutlar kendiliğinden kurulmaz (yalnız not düşülür)" eval '[ $rc = 0 ] && [ "$(ver)" = "Sürüm: v1.3" ] && [ ! -e "$T/state/acilmayan" ] && [ -z "$(ls "$T/bin2")" ] && grep -q "dongu-guncelle --betikler" "$T/guncelle.log"'
: > "$T/systemctl.log"; dongu-guncelle --betikler; rc=$?
t "güncelleme: --betikler yardımcı komutları ve hizmet tanımlarını kurar" eval '[ $rc = 0 ] && [ "$(cat "$T/bin2/dongu-ornek")" = yeni ] && [ -x "$T/bin2/dongu-ornek" ] && [ -e "$T/units2/dongu-ornek.service" ] && [ -e "$T/units2/dongu-ornek.timer" ] && grep -q "daemon-reload" "$T/systemctl.log"'
mv "$T/origin.git" "$T/origin.kapali"; n0=$(wc -l < "$T/guncelle.log"); dongu-guncelle; dongu-guncelle; rc=$?; n1=$(wc -l < "$T/guncelle.log"); mv "$T/origin.kapali" "$T/origin.git"; dongu-guncelle
t "güncelleme: GitHub'a ulaşılamazsa sunucu çalışmayı sürdürür, kesinti boyunca tek satır kayıt; dönünce bildirir" eval '[ $rc = 0 ] && [ $((n1 - n0)) = 1 ] && [ "$(ver)" = "Sürüm: v1.3" ] && grep -q "yeniden ulaşıldı" "$T/guncelle.log"'
: > "$T/systemctl.log"; dongu-guncelle --zorla; rc=$?
t "güncelleme: --zorla değişiklik olmasa da yeniden başlatır" eval '[ $rc = 0 ] && [ "$(restarts restart)" = 1 ] && [ "$(ver)" = "Sürüm: v1.3" ]'
: > "$T/state/tasima-suruyor"; echo c > "$T/work/src/a.txt"; push "taşıma sırasında"; dongu-guncelle; rc=$?
t "güncelleme: veri taşıma yarımken bekler (oyun sunucusunu başlatmaz)" eval '[ $rc = 0 ] && [ "$(head_s)" = "v1.3" ]'
rm -f "$T/state/tasima-suruyor"; ( dongu-guncelle & dongu-guncelle & wait )
t "güncelleme: aynı anda iki çalıştırma birbirini bozmaz" eval '[ "$(head_s)" = "taşıma sırasında" ] && [ "$(ver)" = "Sürüm: v1.3" ]'
killfake; export FAKE_APP=$T/shim FAKE_MAIN=fake-server.js

# ---------- 4) ayar (dongu-ayar) ----------
systemctl restart dongu; sleep 1
LAST=$(dongu-ayar 2>&1)
t "ayar: liste yalnız adları gösterir, değer göstermez" eval 'has "$LAST" "ADMIN_KEY = (dolu)" && has "$LAST" "CANON_HOST = (boş)" && hasnt "$LAST" "gizli anahtar" && hasnt "$LAST" "postgresql://"'
: > "$T/systemctl.log"; dongu-ayar ANDROID_SHA256 "AA:BB,CC:DD" >/dev/null; LAST=$(printf 'yeni-anahtar_123\n' | dongu-ayar ADMIN_KEY 2>&1); dongu-ayar IAP_SANDBOX_OK "" >/dev/null
E=$(cat "$T/etc/dongu.env")
t "ayar: yeni ayar eklenir, var olan değişir (değer ekrana yazılmaz), boşaltılır; her seferinde sunucu yeniden başlar; dosya 640 ve açıklaması duruyor" eval 'has "$E" "^ANDROID_SHA256=AA:BB,CC:DD$" && has "$E" "^ADMIN_KEY=yeni-anahtar_123$" && [ "$(grep -c "^ADMIN_KEY=" <<<"$E")" = 1 ] && has "$E" "^IAP_SANDBOX_OK=$" && hasnt "$LAST" "yeni-anahtar" && [ "$(restarts restart)" = 3 ] && [ "$(stat -c %a "$T/etc/dongu.env")" = 640 ] && has "$E" "^# deneme ayar dosyası"'
r=""; dongu-ayar kucuk x >/dev/null 2>&1 || r="${r}1"; dongu-ayar DATABASE_URL x >/dev/null 2>&1 || r="${r}2"; dongu-ayar ADMIN_KEY 'tır"nak' >/dev/null 2>&1 || r="${r}3"; dongu-ayar ADMIN_KEY ' boşluk' >/dev/null 2>&1 || r="${r}4"; dongu-ayar ADMIN_KEY 'ters\eğik' >/dev/null 2>&1 || r="${r}5"
t "ayar: geçersiz ad, korunan ayar (DATABASE_URL), tırnak / baş boşluk / ters eğik çizgi içeren değer reddedilir; dosya değişmez" eval '[ "$r" = 12345 ] && [ "$(cat "$T/etc/dongu.env")" = "$E" ]'

# ---------- 5) alan adı (dongu-alan) ----------
: > "$T/systemctl.log"; LAST=$(dongu-alan 2>&1); rc=$?; C=$(cat "$T/etc/Caddyfile")
t "alan: alan adı yokken yalnız 80 numaralı kapı; istek günlüğü tutulmaz; sahte IP başlığı silinir; HTTP/3 kapalı" eval '[ $rc = 0 ] && has "$C" "^:80 {" && has "$C" "reverse_proxy 127.0.0.1:18077" && has "$C" "header_up -CF-Connecting-IP" && has "$C" "protocols h1 h2" && ! grep -q "^[[:space:]]*log" <<<"$C" && grep -q "reload caddy" "$T/systemctl.log" && [ "$(restarts restart)" = 0 ]'
: > "$T/systemctl.log"; dongu-alan tr.dongu.app >/dev/null 2>&1
t "alan: tek alan adında yönlendirme kapalı kalır (deneme adresi)" eval 'grep -q "^tr.dongu.app {" "$T/etc/Caddyfile" && grep -q "^CANON_HOST=$" "$T/etc/dongu.env" && [ "$(restarts restart)" = 0 ]'
: > "$T/systemctl.log"; LAST=$(dongu-alan dongu.app www.dongu.app tr.dongu.app 2>&1)
t "alan: birden çok adda ilki asıl adres olur; oyun sunucusu bir kez yeniden başlar" eval 'grep -q "^dongu.app, www.dongu.app, tr.dongu.app {" "$T/etc/Caddyfile" && grep -q "^CANON_HOST=dongu.app$" "$T/etc/dongu.env" && [ "$(restarts restart)" = 1 ] && has "$LAST" "Asıl adres: https://dongu.app"'
: > "$T/systemctl.log"; dongu-alan dongu.app www.dongu.app tr.dongu.app >/dev/null 2>&1
t "alan: aynı komut yinelenince oyun sunucusu yeniden başlatılmaz" eval '[ "$(restarts restart)" = 0 ]'
C=$(cat "$T/etc/Caddyfile"); r=""; dongu-alan https://dongu.app >/dev/null 2>&1 || r="${r}1"; dongu-alan DONGU.app >/dev/null 2>&1 || r="${r}2"; touch "$T/caddy-bozuk"; LAST=$(dongu-alan ornek.dongu.app 2>&1) || r="${r}3"; rm -f "$T/caddy-bozuk"
t "alan: geçersiz ad ya da web sunucusunun reddettiği ayar → hiçbir şey değişmez, hata gösterilir" eval '[ "$r" = 123 ] && [ "$(cat "$T/etc/Caddyfile")" = "$C" ] && has "$LAST" "unrecognized directive"'

# ---------- 6) Google anahtarı (dongu-google) ----------
dongu-ayar ADMIN_KEY 'gizli anahtar+&=1' >/dev/null
node -e "
const c = require('crypto'); const { privateKey } = c.generateKeyPairSync('rsa', { modulusLength: 2048 });
const j = { type: 'service_account', project_id: 'ornek-proje', private_key_id: 'abc', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), client_email: 'dongu-satin-alma@ornek-proje.iam.gserviceaccount.com', client_id: '1', token_uri: 'https://oauth2.googleapis.com/token' };
require('fs').writeFileSync(process.argv[1], '﻿' + JSON.stringify(j, null, 2).replace(/\n/g, '\r\n'));" "$T/ornek-anahtar.json"
echo ok > "$T/google-mode"; LAST=$(dongu-google < "$T/ornek-anahtar.json" 2>&1); rc=$?
t "google: geçerli anahtar (BOM ve Windows satır sonlarıyla) yerleştirilir ve gerçek istekle denenir; yönetim anahtarı özel karakterli olsa da çalışır" eval '[ $rc = 0 ] && has "$LAST" "Anahtar tanındı" && has "$LAST" "Google bağlantısı ÇALIŞIYOR" && [ "$(stat -c %a "$T/etc/google.json")" = 640 ] && python3 -c "import json,sys; assert json.load(open(sys.argv[1], encoding=\"utf-8-sig\"))[\"type\"] == \"service_account\"" "$T/etc/google.json"'
t "google: ekrana anahtar, tam hesap adı ya da yönetim anahtarı yazılmaz" eval 'hasnt "$LAST" "PRIVATE KEY" && hasnt "$LAST" "dongu-satin-alma@" && hasnt "$LAST" "gizli anahtar" && has "$LAST" "don…@ornek-proje"'
G0=$(md5sum < "$T/etc/google.json"); r=""; head -c 400 "$T/ornek-anahtar.json" | dongu-google >/dev/null 2>&1 || r="${r}1"; echo '{"type":"authorized_user"}' | dongu-google >/dev/null 2>&1 || r="${r}2"
t "google: yarım kopyalanmış ya da yanlış türde dosya reddedilir; yerleşik anahtar değişmez" eval '[ "$r" = 12 ] && [ "$(md5sum < "$T/etc/google.json")" = "$G0" ]'
r=""; for m in auth:KABUL\ ETMEDİ perm:izin\ vermedi off:okuyamadı net:bağlanılamadı; do echo "${m%%:*}" > "$T/google-mode"; LAST=$(dongu-google --dene 2>&1) && r="${r}!"; has "$LAST" "${m#*:}" && r="${r}${m%%:*} "; done; echo ok > "$T/google-mode"
t "google: --dene dört hata durumunu ayrı ayrı açıklar (anahtar reddi, izin eksik, anahtar okunamadı, bağlantı yok)" eval '[ "$r" = "auth perm off net " ]'

# ---------- 7) durum (dongu-durum) ----------
LAST=$(dongu-durum 2>&1); rc=$?
t "durum: özet çıkar (hizmetler, oyun durumu, alan adları, sürüm, yedek, Google anahtarı)" eval '[ $rc = 0 ] && has "$LAST" "Oyun sunucusu      : çalışıyor" && has "$LAST" "Sürüm: v10.20" && has "$LAST" "Alan adları        : dongu.app, www.dongu.app, tr.dongu.app" && has "$LAST" "Son yedek          : dongu-" && has "$LAST" "Google Play anahtarı: yerleştirilmiş" && has "$LAST" "Kurulu sürüm       : "'
t "durum: gizli bilgi göstermez (yönetim anahtarı, veritabanı adresi, hizmet hesabı)" eval 'hasnt "$LAST" "gizli anahtar" && hasnt "$LAST" "postgresql://" && hasnt "$LAST" "DATABASE_URL" && hasnt "$LAST" "iam.gserviceaccount"'

# ---------- 8) veritabanı zorunluluğu (gerçek sunucu kodu; DB_REQUIRED) ----------
killfake; SRV=$HERE/../server; export NODE_PATH=/opt/npm-tools/node_modules:/opt/node-tools/node_modules
LAST=$(cd "$SRV" && PORT=18079 DATABASE_URL='postgres://kimse:cokgizli@127.0.0.1:1/yok' DB_REQUIRED=1 timeout 20 node server.js 2>&1); rc=$?
t "veritabanı zorunlu (DB_REQUIRED=1): ulaşılamazsa sunucu dosya deposuna geçmez, dinlemeye başlamadan kapanır; şifre günlüğe yazılmaz" eval '[ $rc = 1 ] && has "$LAST" "VERİTABANINA BAĞLANILAMADI" && hasnt "$LAST" "cokgizli" && hasnt "$LAST" "portunda" && hasnt "$LAST" "hesap deposu: dosya"'
LAST=$(cd "$SRV" && PORT=18079 DATABASE_URL= DB_REQUIRED=1 timeout 20 node server.js 2>&1); rc=$?
t "veritabanı zorunlu: adres hiç tanımlı değilse de açılmaz" eval '[ $rc = 1 ] && has "$LAST" "DATABASE_URL tanımlı değil" && hasnt "$LAST" "portunda"'
( cd "$SRV" && PORT=18079 DATABASE_URL='postgres://kimse:cokgizli@127.0.0.1:1/yok' node server.js > "$T/srv.log" 2>&1 9>&- & echo $! > "$T/srv.pid" )
D=""; for _ in $(seq 1 25); do sleep 1; D=$(curl -fsS -m 3 http://127.0.0.1:18079/durum 2>/dev/null) && break; done; kill "$(cat "$T/srv.pid")" 2>/dev/null; LAST=$(cat "$T/srv.log")
t "DB_REQUIRED tanımlı değilken eski davranış sürer (dosya deposuyla açılır; eski kurulum etkilenmez)" eval 'has "$D" "Sürüm: v" && has "$LAST" "hesap deposu: dosya"'

echo "SONUÇ: $PASS PASS / $FAIL FAIL"
[ "$FAIL" = 0 ]
