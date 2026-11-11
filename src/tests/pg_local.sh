#!/bin/sh
# Testler için yerel PostgreSQL 16 (yalnız Unix soketi, port 54331, veritabanı dongu_test). Canlı veritabanına (Neon) dokunmaz.
# Kullanım: sh pg_local.sh        → kur (gerekirse) + başlat; soket klasörünü yazar
#           sh pg_local.sh durdur
PGD=${DONGU_PGDIR:-/tmp/dongu-pg}; PORT=54331
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1); [ -n "$PGBIN" ] || PGBIN=$(dirname "$(command -v pg_ctl 2>/dev/null)")
[ -x "$PGBIN/pg_ctl" ] || { echo "postgres yok" >&2; exit 3; }
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; else RUN=""; fi
if [ "$1" = "durdur" ]; then $RUN "$PGBIN/pg_ctl" -D "$PGD/data" stop -m fast >/dev/null 2>&1; exit 0; fi
mkdir -p "$PGD/data" "$PGD/sock"; [ "$(id -u)" = "0" ] && chown -R postgres:postgres "$PGD"
[ -f "$PGD/data/PG_VERSION" ] || $RUN "$PGBIN/initdb" -D "$PGD/data" -A trust -U postgres >/dev/null 2>&1 || { echo "initdb başarısız" >&2; exit 4; }
$RUN "$PGBIN/pg_ctl" -D "$PGD/data" status >/dev/null 2>&1 || $RUN "$PGBIN/pg_ctl" -D "$PGD/data" -o "-p $PORT -k $PGD/sock -c listen_addresses=''" -l "$PGD/pg.log" -w start >/dev/null 2>&1 || { echo "postgres başlamadı" >&2; exit 5; }
psql -h "$PGD/sock" -p $PORT -U postgres -At -c "select 1 from pg_database where datname='dongu_test'" 2>/dev/null | grep -q 1 || psql -h "$PGD/sock" -p $PORT -U postgres -q -c "create database dongu_test" >/dev/null 2>&1
echo "$PGD/sock"
