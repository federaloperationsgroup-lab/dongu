// Satın alma (v10.18): RevenueCat bildirimi (webhook) + eşitleme (sahte RevenueCat REST). Para işi olduğu için her yol ayrı denenir:
// işlem kimliği bir kez; aynı anda gelen çift bildirim; bildirim ve eşitleme FARKLI kimlikle gelse de tek işleme (mağaza kimliği / RevenueCat iç kimliği / aynı an);
// Başlangıç Paketi bir kez; iade (gerçekte verilen kadar geri alınır, 0'ın altına inmez, ikinci kimlikle de bulunur); sandbox süzme; ürün listesi; yeniden başlatma.
// PORT 8771, sahte REST 8772.
const S = require('./qa_srv.js'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const PORT = 8771, RC = 8772, KEY = 'test-anahtar-71', WH = 'wh-test-71', LOG = '/tmp/qa_iap.srv.log';
const PUR = path.join(S.SRVDIR, 'data', 'purchases.jsonl');
const ENV = { ADMIN_KEY: KEY, RC_WEBHOOK_SECRET: WH, RC_SECRET_KEY: 'sk-test-71', RC_API_BASE: 'http://127.0.0.1:' + RC, IAP_SANDBOX_OK: '' };
function hook(body, auth) { return new Promise((res) => { const d = JSON.stringify(body); const h = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) }; if (auth !== null) h.Authorization = auth === undefined ? 'Bearer ' + WH : auth;
  const q = http.request({ host: '127.0.0.1', port: PORT, path: '/api/iap/webhook', method: 'POST', headers: h }, (r) => { let b = ''; r.on('data', (x) => (b += x)); r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} res({ status: r.statusCode, json: j, body: b }); }); }); q.on('error', () => res({ status: 0, json: null, body: '' })); q.end(d); }); }
let CLOCK = Date.now() - 3600000; const tick = () => (CLOCK += 60000); // her satın alma 1 dk arayla (gerçekte aynı ürün aynı saniyede iki kez alınamaz)
const ev = (type, player, product, tx, at, extra) => ({ event: Object.assign({ type, app_user_id: player, product_id: product, transaction_id: tx, store: 'APP_STORE', price: 1, currency: 'TRY', environment: 'PRODUCTION', purchased_at_ms: at || tick() }, extra || {}) });
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z'); // RevenueCat REST saniye duyarlıklı verir
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); };
  try { fs.unlinkSync(PUR); } catch (e) {}
  // sahte RevenueCat REST: /v1/subscribers/<id> → SUBS[id]
  const SUBS = {}; let rcHits = 0, rcAuth = '';
  const rc = http.createServer((q, r) => { rcHits++; rcAuth = q.headers.authorization || ''; const id = decodeURIComponent(q.url.split('/').pop()); r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ subscriber: { non_subscriptions: SUBS[id] || {} } })); }); await new Promise((r) => rc.listen(RC, '127.0.0.1', r));
  let srv = S.start(PORT, ENV, LOG); await S.up(PORT, LOG, true);
  const me = async (acc) => { const j = (await S.post(PORT, '/api/me', { id: acc.id, token: acc.token })).json; return j && j.player ? j.player : j; };
  const sync = async (acc) => (await S.post(PORT, '/api/iap/sync', { id: acc.id, token: acc.token })).json;
  const A = await S.guest(PORT, 'Alici'), B = await S.guest(PORT, 'Baska'), C = await S.guest(PORT, 'Ucuncu'); ok(A && A.id && B && B.id && C && C.id, 'üç misafir hesap');
  const c0 = (await me(A)).coins;
  // ---- ürün listesi
  const pr = (await S.post(PORT, '/api/iap/products', {})).json; const ids = (pr && pr.products || []).map((p) => p.id).join(',');
  ok(ids === 'baslangic,altin_kucuk,altin_orta,altin_buyuk,altin_dev', 'ürün listesi: 5 ürün, Başlangıç Paketi başta', ids);
  const byId = {}; (pr.products || []).forEach((p) => (byId[p.id] = p));
  ok(byId.altin_kucuk.gold === 5000 && byId.altin_orta.gold === 16500 && byId.altin_buyuk.gold === 48000 && byId.altin_dev.gold === 130000 && byId.baslangic.gold === 3000 && byId.baslangic.once && byId.baslangic.items.join() === 'c_fikret', 'altın miktarları ve Başlangıç Paketi içeriği (K190)');
  ok(pr.store && pr.store.secret && pr.store.webhook, 'RevenueCat REST ve webhook açık görünüyor', JSON.stringify(pr.store));
  // ---- yetkisiz bildirim
  ok((await hook(ev('NON_RENEWING_PURCHASE', A.id, 'altin_kucuk', 'x0'), null)).status === 401, 'bildirim: Authorization yok → 401');
  ok((await hook(ev('NON_RENEWING_PURCHASE', A.id, 'altin_kucuk', 'x0'), 'Bearer yanlis')).status === 401, 'bildirim: yanlış anahtar → 401');
  ok((await me(A)).coins === c0, 'yetkisiz bildirim altın vermedi');
  // ---- satın alma + aynı işlem ikinci kez
  let r = await hook(ev('NON_RENEWING_PURCHASE', A.id, 'altin_kucuk', 'T1')); ok(r.status === 200 && r.json && r.json.ok && r.json.gold === 5000, 'Küçük Kese: +5.000', r.body.slice(0, 120));
  ok((await me(A)).coins === c0 + 5000, 'altın hesaba işlendi');
  r = await hook(ev('NON_RENEWING_PURCHASE', A.id, 'altin_kucuk', 'T1')); ok(r.status === 200 && r.json && r.json.dup && (await me(A)).coins === c0 + 5000, 'aynı işlem kimliği ikinci kez: altın verilmez', r.body);
  // ---- aynı anda gelen çift bildirim: tek işleme
  const tRace = tick(); const many = await Promise.all([1, 2, 3, 4, 5, 6].map(() => hook(ev('NON_RENEWING_PURCHASE', A.id, 'altin_orta', 'T2', tRace))));
  const cRace = (await me(A)).coins; ok(cRace === c0 + 5000 + 16500, 'aynı anda 6 bildirim (aynı işlem): altın bir kez verildi', 'beklenen ' + (c0 + 21500) + ', hesap ' + cRace + ' · ' + many.map((m) => m.json && (m.json.dup ? 'dup' : m.json.ok ? 'ok' : '?')).join(','));
  // ---- aynı üründen 1 dk arayla iki gerçek satın alma: ikisi de verilir
  r = await hook(ev('INITIAL_PURCHASE', A.id, 'app.dongu.okey:altin_kucuk', 'T3')); ok(r.json && r.json.ok && (await me(A)).coins === cRace + 5000, 'aynı üründen ikinci gerçek satın alma (1 dk sonra, ön ekli ürün kimliği) verilir', r.body.slice(0, 120));
  r = await hook(ev('NON_RENEWING_PURCHASE', A.id, 'altin_yok', 'T4')); ok(r.status === 200 && r.json && r.json.ignored && (await me(A)).coins === cRace + 5000, 'tanımsız ürün yok sayılır', r.body);
  r = await hook(ev('NON_RENEWING_PURCHASE', A.id, 'altin_dev', 'T5', 0, { environment: 'SANDBOX' })); ok(r.json && r.json.ignored === 'sandbox' && (await me(A)).coins === cRace + 5000, 'deneme (sandbox) satın alması canlı ayarda altın vermez', r.body);
  r = await hook(ev('NON_RENEWING_PURCHASE', 'p_yok_boyle_biri', 'altin_kucuk', 'T6')); ok(r.status >= 400, 'bilinmeyen oyuncu: hata döner (RevenueCat yeniden dener)', r.status + ' ' + r.body);
  // ---- Başlangıç Paketi: bir kez
  const c1 = (await me(A)).coins; r = await hook(ev('NON_RENEWING_PURCHASE', A.id, 'baslangic', 'P1')); let v = await me(A);
  ok(r.json && r.json.ok && v.coins === c1 + 3000 && v.owned.indexOf('c_fikret') >= 0, 'Başlangıç Paketi: +3.000 altın + Çaycı Fikret', r.body.slice(0, 120));
  r = await hook(ev('NON_RENEWING_PURCHASE', A.id, 'baslangic', 'P2')); v = await me(A);
  ok(v.coins === c1 + 3000 && v.owned.filter((x) => x === 'c_fikret').length === 1, 'Başlangıç Paketi ikinci kez: altın tekrar verilmez, Fikret tek', r.body.slice(0, 120));
  // ---- iade: o satın almada gerçekte verilen kadar geri alınır
  r = await hook(ev('CANCELLATION', A.id, 'baslangic', 'P2')); v = await me(A); ok(r.json && r.json.ok && v.coins === c1 + 3000 && v.owned.indexOf('c_fikret') >= 0, 'hiçbir şey vermemiş ikinci paketin iadesi altın/karakter almaz', 'altın ' + v.coins + ' ' + r.body.slice(0, 80));
  r = await hook(ev('CANCELLATION', A.id, 'baslangic', 'P1')); v = await me(A); ok(v.coins === c1 && v.owned.indexOf('c_fikret') < 0, 'Başlangıç Paketi iadesi: 3.000 altın ve Fikret geri alındı', 'altın ' + v.coins);
  r = await hook(ev('REFUND', A.id, 'altin_kucuk', 'T1')); v = await me(A); ok(v.coins === c1 - 5000, 'Küçük Kese iadesi: −5.000');
  r = await hook(ev('REFUND', A.id, 'altin_kucuk', 'T1')); ok(r.json && r.json.dup && (await me(A)).coins === c1 - 5000, 'aynı iade ikinci kez: değişmez', r.body);
  const two = await Promise.all([hook(ev('CANCELLATION', A.id, 'altin_kucuk', 'T3')), hook(ev('CANCELLATION', A.id, 'altin_kucuk', 'T3')), hook(ev('CANCELLATION', A.id, 'altin_kucuk', 'T3'))]);
  ok((await me(A)).coins === c1 - 10000, 'aynı anda 3 iade bildirimi: altın bir kez geri alındı', 'hesap ' + (await me(A)).coins + ' · ' + two.map((m) => m.json && (m.json.dup ? 'dup' : m.json.ok ? 'ok' : '?')).join(','));
  await S.admin(PORT, KEY, A.id, 'altin', -((await me(A)).coins - 100)); r = await hook(ev('CANCELLATION', A.id, 'altin_orta', 'T2')); v = await me(A); ok(v.coins === 0, 'harcanmış altının iadesi: bakiye 0\'ın altına inmez', 'altın ' + v.coins);
  r = await hook(ev('REFUND', A.id, 'altin_kucuk', 'HIC')); ok(r.status === 200 && r.json && r.json.unknown, 'bilinmeyen işlemin iadesi yok sayılır', r.body);
  // ---- Fikret'i altınla almış oyuncu: paket karakteri "vermez", iade de almaz
  await S.admin(PORT, KEY, B.id, 'hediye', 'c_fikret'); let vb = await me(B); const cb0 = vb.coins;
  ok(vb.owned.indexOf('c_fikret') >= 0, '(hazırlık) Baska\'da Fikret önceden var');
  r = await hook(ev('NON_RENEWING_PURCHASE', B.id, 'baslangic', 'P3')); vb = await me(B); ok(vb.coins === cb0 + 3000, 'Fikret zaten varken paket: yalnız altın verilir');
  await hook(ev('CANCELLATION', B.id, 'baslangic', 'P3')); vb = await me(B); ok(vb.coins === cb0 && vb.owned.indexOf('c_fikret') >= 0, 'o paketin iadesi: altın geri alınır, Fikret oyuncuda kalır', 'altın ' + vb.coins);
  // ---- eşitleme (RevenueCat REST)
  const tS1 = tick(); SUBS[B.id] = { altin_buyuk: [{ id: 'rc_S1', store_transaction_id: 'S1', purchase_date: iso(tS1), store: 'app_store', is_sandbox: false }], altin_dev: [{ id: 'rc_S2', store_transaction_id: 'S2', purchase_date: iso(tick()), store: 'app_store', is_sandbox: true }], bilinmeyen: [{ id: 'rc_S3', purchase_date: iso(tick()) }] };
  const cb1 = (await me(B)).coins; let sy = await sync(B);
  ok(sy && sy.credited && sy.credited.length === 1 && sy.credited[0].product === 'altin_buyuk' && sy.player && sy.player.coins === cb1 + 48000, 'eşitleme: işlenmemiş Büyük Kese işlendi (+48.000); sandbox ve tanımsız ürün atlandı', JSON.stringify(sy && sy.credited));
  ok(/^Bearer sk-test-71$/.test(rcAuth) && rcHits >= 1, 'RevenueCat REST gizli anahtarla çağrıldı');
  sy = await sync(B); ok(sy && sy.credited && sy.credited.length === 0 && (await me(B)).coins === cb1 + 48000, 'ikinci eşitleme: yeniden verilmez');
  r = await hook(ev('NON_RENEWING_PURCHASE', B.id, 'altin_buyuk', 'S1', tS1 + 400)); ok(r.json && r.json.dup && (await me(B)).coins === cb1 + 48000, 'eşitlemeyle işlenen satın alma, bildirim mağaza kimliğiyle gelince yeniden verilmez', r.body);
  const bad = await S.post(PORT, '/api/iap/sync', { id: B.id, token: 'yanlis' }); ok(bad.status >= 400 || (bad.json && bad.json.error), 'eşitleme: yanlış hesap anahtarı reddedilir', bad.status + ' ' + bad.body.slice(0, 80));
  // ---- eşitleme ve bildirim aynı anda (gerçek akış: ödeme biter bitmez ikisi birden gelir)
  const tS9 = tick(); SUBS[B.id].altin_kucuk = [{ id: 'rc_S9', store_transaction_id: 'S9', purchase_date: iso(tS9), store: 'play_store', is_sandbox: false }];
  const cb2 = (await me(B)).coins; await Promise.all([sync(B), hook(ev('NON_RENEWING_PURCHASE', B.id, 'altin_kucuk', 'S9', tS9 + 250)), sync(B), hook(ev('NON_RENEWING_PURCHASE', B.id, 'altin_kucuk', 'S9', tS9 + 250))]);
  ok((await me(B)).coins === cb2 + 5000, 'eşitleme ve bildirim aynı anda: Küçük Kese bir kez verildi', 'beklenen ' + (cb2 + 5000) + ', hesap ' + (await me(B)).coins);
  // ---- KİMLİKLER FARKLI: eşitleme yalnız RevenueCat iç kimliğini verir, bildirim mağaza kimliğiyle gelir
  const cc0 = (await me(C)).coins; const tK1 = tick(); SUBS[C.id] = { altin_orta: [{ id: 'rc_K1', purchase_date: iso(tK1), store: 'play_store', is_sandbox: false }] };
  sy = await sync(C); ok(sy.credited.length === 1 && (await me(C)).coins === cc0 + 16500, 'eşitleme önce (yalnız iç kimlik): +16.500');
  r = await hook(ev('NON_RENEWING_PURCHASE', C.id, 'altin_orta', 'GPA.1111-K1', tK1 + 700)); ok(r.json && r.json.dup && (await me(C)).coins === cc0 + 16500, 'aynı satın alma bildirimle FARKLI kimlikle gelince yeniden verilmez (aynı oyuncu + ürün + an)', r.body);
  r = await hook(ev('CANCELLATION', C.id, 'altin_orta', 'GPA.1111-K1')); ok(r.json && r.json.ok && (await me(C)).coins === cc0, 'o satın almanın iadesi mağaza kimliğiyle gelir: kayıt bulunur, altın geri alınır', r.body + ' altın ' + (await me(C)).coins);
  const tK2 = tick(); r = await hook(ev('NON_RENEWING_PURCHASE', C.id, 'altin_buyuk', 'GPA.2222-K2', tK2)); ok(r.json && r.json.ok && (await me(C)).coins === cc0 + 48000, 'bildirim önce (mağaza kimliği): +48.000');
  SUBS[C.id].altin_buyuk = [{ id: 'rc_K2', purchase_date: iso(tK2), store: 'play_store', is_sandbox: false }]; sy = await sync(C);
  ok(sy.credited.length === 0 && (await me(C)).coins === cc0 + 48000, 'aynı satın alma eşitlemede FARKLI (iç) kimlikle görününce yeniden verilmez', JSON.stringify(sy.credited));
  SUBS[C.id].altin_buyuk.push({ id: 'rc_K3', purchase_date: iso(tick()), store: 'play_store', is_sandbox: false }); sy = await sync(C);
  ok(sy.credited.length === 1 && (await me(C)).coins === cc0 + 96000, 'aynı üründen sonradan yapılan ayrı satın alma eşitlemede verilir', JSON.stringify(sy.credited));
  // ---- yönetim sayfası
  const pg = await S.get(PORT, '/yonetim/satinalmalar?key=' + KEY); ok(pg.status === 200 && /Küçük Kese/.test(pg.body) && /Başlangıç Paketi/.test(pg.body), 'yönetim satın alma listesi açılıyor');
  ok((await S.get(PORT, '/yonetim/satinalmalar')).status !== 200, 'yönetim listesi anahtarsız açılmaz');
  // ---- sunucu yeniden başlayınca (hesaplar ve satın alma kaydı yerinde): çift verme yok, ikinci kimlik hatırlanır
  await S.stop(srv); const out = fs.openSync(LOG, 'a');
  srv = spawn('node', ['server.js'], { cwd: S.SRVDIR, env: Object.assign({}, process.env, { PORT: String(PORT), NODE_PATH: '/opt/npm-tools/node_modules' }, ENV), stdio: ['ignore', out, out] });
  process.on('exit', () => { try { srv.kill('SIGKILL'); } catch (e) {} }); await S.up(PORT);
  const cc1 = (await me(C)).coins; r = await hook(ev('NON_RENEWING_PURCHASE', C.id, 'altin_buyuk', 'GPA.2222-K2', tK2)); ok(r.json && r.json.dup && (await me(C)).coins === cc1, 'yeniden başlatmadan sonra aynı işlem yeniden verilmez', r.body);
  r = await hook(ev('NON_RENEWING_PURCHASE', C.id, 'altin_buyuk', 'rc_K2', tick())); ok(r.json && r.json.dup && (await me(C)).coins === cc1, 'ikinci kimlik de yeniden başlatmadan sonra hatırlanır', r.body);
  r = await hook(ev('CANCELLATION', C.id, 'altin_orta', 'rc_K1')); ok(r.json && r.json.dup, 'iade durumu yeniden başlatmadan sonra hatırlanır (ikinci kez geri alınmaz)', r.body);
  const lg = fs.readFileSync(LOG, 'utf8'); ok(!/TypeError|ReferenceError|UnhandledPromise|uncaught/i.test(lg), 'sunucu günlüğünde hata yok', (lg.match(/.*(TypeError|ReferenceError|Unhandled).*/) || [''])[0]);
  await S.stop(srv); rc.close(); try { fs.unlinkSync(PUR); } catch (e) {}
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
