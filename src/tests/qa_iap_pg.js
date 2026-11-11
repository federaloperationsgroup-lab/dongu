// Satın alma modülü (server/iap.js) GERÇEK PostgreSQL 16 üzerinde (canlıda depo Postgres/Neon): tablo kurulumu, ikinci kimlik sütunu,
// işlem kimliği / ikinci kimlik / aynı an eşleşmesi, iade, bir kerelik paket, aynı anda gelen istekler (veritabanı yolunda her adım gerçekten eşzamansız).
// Resmî `pg` paketi bu ortamda kurulamadığı için yalnız teste ait küçük bir bağlayıcı kullanılır (psql komutu; sunucu kodu değişmez: DB.query(sql, params) → Promise<{rows}>).
// Postgres yoksa test ATLANIR (0 PASS / 0 FAIL yazar; başarılı sayılmaz).
const { execFile, execFileSync } = require('child_process'); const path = require('path');
let SOCK = ''; try { SOCK = execFileSync('sh', [path.join(__dirname, 'pg_local.sh')], { encoding: 'utf8' }).trim().split('\n').pop(); } catch (e) {}
if (!SOCK) { console.log('ATLANDI: yerel PostgreSQL başlatılamadı (bu ortamda yok).'); console.log('SONUÇ: 0 PASS / 0 FAIL'); process.exit(0); }
const PSQL = ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-h', SOCK, '-p', '54331', '-U', 'postgres', '-d', 'dongu_test'];
const lit = (v) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const DB = { n: 0, query(sql, params) { DB.n++; const q = sql.replace(/\$(\d+)/g, (m, i) => lit((params || [])[+i - 1])); const sel = /^\s*select/i.test(q);
  return new Promise((res, rej) => execFile('psql', PSQL.concat(['-c', sel ? "SELECT coalesce(json_agg(t), '[]') FROM (" + q + ') t' : q]), { encoding: 'utf8', maxBuffer: 8e6 }, (e, out, err) => { if (e) return rej(new Error((err || e.message).trim().split('\n')[0])); if (!sel) return res({ rows: [] }); try { res({ rows: JSON.parse(out.trim() || '[]') }); } catch (x) { rej(x); } })); } };
// sahte hesap deposu: kilit (oyuncu başına sıra), eşzamansız get/save
const P = {}, LOCK = {};
const Accounts = { get(id, cb) { setTimeout(() => cb(null, P[id] ? JSON.parse(JSON.stringify(P[id])) : null), 3); }, save(p, cb) { setTimeout(() => { P[p.id] = JSON.parse(JSON.stringify(p)); cb(null); }, 3); },
  withLock(id, task) { const run = () => task(() => { const q = LOCK[id]; q.shift(); if (q.length) q[0](); else delete LOCK[id]; }); if (LOCK[id]) LOCK[id].push(run); else { LOCK[id] = [run]; run(); } }, publicView(p) { return { id: p.id, coins: p.coins, owned: p.owned }; } };
const mk = (id, coins, owned) => (P[id] = { id, coins: coins || 0, owned: owned || [], avatar: { full: 'yok' } });
process.env.RC_SECRET_KEY = ''; process.env.RC_WEBHOOK_SECRET = 'wh'; process.env.IAP_SANDBOX_OK = '';
const Iap = require('/home/claude/okey/server/iap.js');
const pc = (fn, ...a) => new Promise((res) => fn(...a, (e, r) => res({ e, r })));
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 300) : '')); };
  await DB.query('DROP TABLE IF EXISTS purchases');
  // eski (v10.17) tablo düzeniyle başla → init ikinci kimlik sütununu eklemeli, eski satır okunabilmeli
  await DB.query("CREATE TABLE purchases (id SERIAL PRIMARY KEY, tx TEXT UNIQUE NOT NULL, player TEXT NOT NULL, product TEXT NOT NULL, store TEXT, price NUMERIC, currency TEXT, at BIGINT NOT NULL, status TEXT NOT NULL DEFAULT 'ok', raw JSONB)");
  await DB.query("INSERT INTO purchases (tx, player, product, store, at, status, raw) VALUES ('ESKI1','p_a','altin_kucuk','APP_STORE',1700000000000,'ok','{\"type\":\"NON_RENEWING_PURCHASE\"}')");
  const mode = await new Promise((res) => Iap.init({ accounts: Accounts, db: DB }, (e, m) => res((e ? 'HATA ' + e.message + ' ' : '') + m)));
  ok(mode === 'postgres', 'kurulum: Postgres deposu (eski tabloya ikinci kimlik sütunu eklendi)', mode);
  const cols = (await DB.query("SELECT column_name FROM information_schema.columns WHERE table_name='purchases'")).rows.map((r) => r.column_name).join(',');
  ok(/\balt\b/.test(cols), 'purchases.alt sütunu var', cols);
  mk('p_a', 1000); mk('p_b', 500, ['c_fikret']); mk('p_c', 0);
  const T = 1760000000000; let r;
  // eski kayıt: çift verme yok; iadesi ürün tanımına göre
  r = await pc(Iap.credit, 'p_a', 'altin_kucuk', 'ESKI1', { at: 1700000000000 }); ok(r.r && r.r.dup && P.p_a.coins === 1000, 'eski düzen kayıt tanınır (yeniden verilmez)');
  P.p_a.coins = 6000; r = await pc(Iap.refund, 'ESKI1'); ok(r.r && r.r.ok && P.p_a.coins === 1000, 'eski kayıtta verilen miktar yok → iade ürün tanımına göre (−5.000)', JSON.stringify(r.r));
  // satın alma + tekrar
  r = await pc(Iap.credit, 'p_a', 'altin_orta', 'S-100', { at: T, store: 'APP_STORE', price: 129.99, currency: 'TRY', raw: { via: 'webhook' } }); ok(r.r && r.r.ok && P.p_a.coins === 17500, 'Orta Kese: +16.500', r.e && r.e.message);
  r = await pc(Iap.credit, 'p_a', 'altin_orta', 'S-100', { at: T }); ok(r.r && r.r.dup && P.p_a.coins === 17500, 'aynı işlem kimliği: yeniden verilmez');
  let row = (await DB.query("SELECT tx, alt, player, product, store, price, currency, at, status, raw FROM purchases WHERE tx='S-100'")).rows[0];
  ok(row && row.player === 'p_a' && +row.at === T && +row.price === 129.99 && row.currency === 'TRY' && row.raw && row.raw.gold === 16500 && row.raw.via === 'webhook', 'kayıt: oyuncu, an, fiyat, verilen altın satırda', JSON.stringify(row));
  // aynı anda 8 istek, aynı kimlik
  let many = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => pc(Iap.credit, 'p_a', 'altin_kucuk', 'S-200', { at: T + 60000 })));
  ok(P.p_a.coins === 22500 && many.filter((m) => m.r && m.r.ok).length === 1 && many.filter((m) => m.r && m.r.dup).length === 7, 'aynı anda 8 istek (aynı kimlik): bir kez verildi', 'altın ' + P.p_a.coins + ' · ' + many.map((m) => m.e ? 'HATA' : m.r.ok ? 'ok' : 'dup').join(','));
  // aynı anda iki FARKLI kimlik, aynı satın alma (eşitleme iç kimlik + bildirim mağaza kimliği)
  many = await Promise.all([pc(Iap.credit, 'p_a', 'altin_buyuk', 'rc_300', { at: T + 120000, raw: { via: 'sync' } }), pc(Iap.credit, 'p_a', 'altin_buyuk', 'GPA.300', { at: T + 120400, raw: { via: 'webhook' } }), pc(Iap.credit, 'p_a', 'altin_buyuk', 'rc_300', { at: T + 120000 }), pc(Iap.credit, 'p_a', 'altin_buyuk', 'GPA.300', { at: T + 120400 })]);
  ok(P.p_a.coins === 70500 && many.filter((m) => m.r && m.r.ok).length === 1, 'aynı anda farklı kimliklerle gelen aynı satın alma: bir kez verildi (+48.000)', 'altın ' + P.p_a.coins + ' · ' + many.map((m) => m.e ? 'HATA ' + m.e.message : m.r.ok ? 'ok' : 'dup').join(','));
  row = (await DB.query("SELECT tx, alt FROM purchases WHERE tx IN ('rc_300','GPA.300')")).rows; ok(row.length === 1 && row[0].alt && row[0].alt !== row[0].tx, 'tek satır; öteki kimlik ikinci kimlik olarak yazıldı', JSON.stringify(row));
  r = await pc(Iap.refund, row[0].alt); ok(r.r && r.r.ok && P.p_a.coins === 22500, 'iade ikinci kimlikle gelir: bulunur, −48.000', JSON.stringify(r.r));
  many = await Promise.all([pc(Iap.refund, row[0].tx), pc(Iap.refund, row[0].alt), pc(Iap.refund, row[0].tx)]); ok(P.p_a.coins === 22500 && many.every((m) => m.r && m.r.dup), 'aynı iade yeniden (iki kimlikle de): değişmez');
  // ikinci kimlik açıkça verilirse (eşitleme: mağaza kimliği + iç kimlik)
  r = await pc(Iap.credit, 'p_c', 'altin_kucuk', 'S-400', { at: T + 180000, alt: 'rc_400' }); ok(r.r && r.r.ok && P.p_c.coins === 5000, 'eşitleme kaydı: mağaza kimliği + iç kimlik');
  r = await pc(Iap.credit, 'p_c', 'altin_kucuk', 'rc_400', { at: T + 999999 }); ok(r.r && r.r.dup && P.p_c.coins === 5000, 'iç kimlikle (başka anla) gelen aynı satın alma: yeniden verilmez');
  r = await pc(Iap.credit, 'p_c', 'altin_kucuk', 'S-401', { at: T + 240000, alt: 'rc_401' }); ok(r.r && r.r.ok && P.p_c.coins === 10000, 'aynı üründen 1 dk sonraki ayrı satın alma verilir');
  r = await pc(Iap.credit, 'p_b', 'altin_kucuk', 'S-402', { at: T + 240000 }); ok(r.r && r.r.ok && P.p_b.coins === 5500, 'başka oyuncunun aynı andaki aynı ürünü ayrı satın almadır');
  r = await pc(Iap.credit, 'p_c', 'altin_kucuk', 'S-403', {}); ok(r.r && r.r.ok && P.p_c.coins === 15000, 'satın alma anı gelmezse (yalnız kimlikle) yine işlenir');
  // Başlangıç Paketi
  r = await pc(Iap.credit, 'p_c', 'baslangic', 'B-1', { at: T + 300000 }); ok(r.r && r.r.ok && P.p_c.coins === 18000 && P.p_c.owned.join() === 'c_fikret' && P.p_c.iap.baslangic === 1, 'Başlangıç Paketi: +3.000 + Fikret');
  r = await pc(Iap.credit, 'p_c', 'baslangic', 'B-2', { at: T + 360000 }); ok(r.r && r.r.ok && r.r.gold === 0 && P.p_c.coins === 18000, 'paket ikinci kez: altın verilmez');
  r = await pc(Iap.refund, 'B-2'); ok(r.r && r.r.ok && P.p_c.coins === 18000 && P.p_c.owned.join() === 'c_fikret', 'boş ikinci paketin iadesi hiçbir şey almaz', JSON.stringify(r.r));
  r = await pc(Iap.credit, 'p_b', 'baslangic', 'B-3', { at: T + 420000 }); r = await pc(Iap.refund, 'B-3'); ok(P.p_b.coins === 5500 && P.p_b.owned.join() === 'c_fikret', 'Fikret önceden varken alınan paketin iadesi: Fikret kalır, altın geri alınır', JSON.stringify(P.p_b));
  P.p_c.coins = 100; r = await pc(Iap.refund, 'B-1'); ok(P.p_c.coins === 0 && P.p_c.owned.length === 0, 'harcanmış paketin iadesi: altın 0\'ın altına inmez, Fikret kaldırılır');
  r = await pc(Iap.refund, 'YOK-1'); ok(r.r && r.r.unknown, 'bilinmeyen işlemin iadesi yok sayılır');
  r = await pc(Iap.credit, 'p_yok', 'altin_kucuk', 'S-500', { at: T + 480000 }); ok(r.e && /bulunamadı/.test(r.e.message), 'bilinmeyen oyuncu: hata (kayıt oluşmaz)', r.e && r.e.message);
  ok((await DB.query("SELECT tx FROM purchases WHERE tx='S-500'")).rows.length === 0, 'başarısız işleme satın alma kaydı bırakmaz (yeniden denemede işlenebilir)');
  mk('p_yok', 0); r = await pc(Iap.credit, 'p_yok', 'altin_kucuk', 'S-500', { at: T + 480000 }); ok(r.r && r.r.ok && P.p_yok.coins === 5000, 'aynı bildirim yeniden gelince (oyuncu artık var) işlenir');
  // hatadan sonra sıra kilitlenmez; liste
  r = await pc(Iap.credit, 'p_a', 'olmayan_urun', 'S-600', {}); ok(r.e && /Bilinmeyen ürün/.test(r.e.message), 'tanımsız ürün reddedilir');
  r = await pc(Iap.credit, 'p_a', 'altin_kucuk', 'S-601', { at: T + 540000 }); ok(r.r && r.r.ok, 'hatalardan sonra sıra çalışmaya devam ediyor');
  const li = await pc(Iap.list); ok(!li.e && li.r.length >= 10 && li.r[0].at >= li.r[li.r.length - 1].at && li.r.some((x) => x.status === 'refunded'), 'yönetim listesi: yeni → eski, iadeler işaretli', li.e ? li.e.message : li.r.length + ' satır');
  // modülü yeniden yükle (sunucu yeniden başladı): kayıtlar veritabanında
  delete require.cache[require.resolve('/home/claude/okey/server/iap.js')]; const Iap2 = require('/home/claude/okey/server/iap.js'); await new Promise((res) => Iap2.init({ accounts: Accounts, db: DB }, () => res()));
  const before = P.p_a.coins; r = await pc(Iap2.credit, 'p_a', 'altin_orta', 'S-100', { at: T }); const r2 = await pc(Iap2.credit, 'p_a', 'altin_buyuk', 'GPA.300', { at: T + 120400 });
  ok(r.r && r.r.dup && r2.r && r2.r.dup && P.p_a.coins === before, 'yeniden başlatmadan sonra: işlenmiş ve iade edilmiş kayıtlar yeniden verilmez');
  await DB.query('DROP TABLE IF EXISTS purchases');
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL  (' + DB.n + ' sorgu)'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
