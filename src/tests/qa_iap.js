// Satın alma (v10.20): aracı hizmet yok; sunucu satın almayı DOĞRUDAN Google Play'e sorar. Bu test sahte bir Google kurar:
// yetkilendirme (hizmet hesabı JWT'si gerçek RSA imzasıyla denetlenir) + Play Developer API (ürün satın alması, tüketme, geçersiz kılınanlar listesi).
// Para işi olduğu için her yol ayrı denenir: belirteç bir kez; aynı anda gelen istekler; bekleyen / iptal / deneme / başkasının satın alması;
// Başlangıç Paketi bir kez; iade (gerçekte verilen kadar, 0'ın altına inmez, sipariş numarasıyla ya da belirteçle); Google kapalıyken; anahtar yenileme;
// sınır; yeniden başlatma; hizmet hesabı yokken kapalı. PORT 8771, sahte Google 8772.
const S = require('./qa_srv.js'); const http = require('http'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { spawn } = require('child_process');
const PORT = 8771, GP = 8772, KEY = 'test-anahtar-71', LOG = '/tmp/qa_iap.srv.log', PKG = 'app.dongu.okey';
const PUR = path.join(S.SRVDIR, 'data', 'purchases.jsonl');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', client_email: 'dongu-test@proje.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const TOKEN_URL = 'http://127.0.0.1:' + GP + '/token';
const ENV = (extra) => Object.assign({ ADMIN_KEY: KEY, GP_SERVICE_ACCOUNT: JSON.stringify(SA), GP_SERVICE_ACCOUNT_FILE: '', GP_API_BASE: 'http://127.0.0.1:' + GP, GP_TOKEN_URL: TOKEN_URL, GP_VOIDED_MS: '0', IAP_SANDBOX_OK: '', ANDROID_PACKAGE: PKG, GP_PACKAGE: '' }, extra || {});
let CLOCK = Date.now() - 3600000; const tick = () => (CLOCK += 60000); // her satın alma 1 dk arayla
// ---- sahte Google
const G = { p: {}, voided: [], tokenHits: 0, gets: 0, consumes: 0, lists: 0, fail: 0, expire: 0, forbid: false, claims: null, badJwt: 0, access: [], page: 0, since: [] };
let seq = 0;
const buy = (player, product, o) => { seq++; const token = 'aaaa' + crypto.randomBytes(40).toString('base64url') + '.AO-J1O' + seq; G.p[token] = Object.assign({ kind: 'androidpublisher#productPurchase', productId: product, orderId: 'GPA.3300-' + (1000 + seq) + '-' + (20000 + seq), purchaseState: 0, consumptionState: 0, acknowledgementState: 0, purchaseTimeMillis: String(tick()), regionCode: 'TR' }, player ? { obfuscatedExternalAccountId: player } : {}, o || {}); return token; };
const voidIt = (token, o) => { const p = G.p[token]; G.voided.push(Object.assign({ kind: 'androidpublisher#voidedPurchase', purchaseToken: token, orderId: p.orderId, purchaseTimeMillis: p.purchaseTimeMillis, voidedTimeMillis: String(Date.now()), voidedSource: 0, voidedReason: 1 }, o || {})); };
const gp = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); let body = ''; q.on('data', (c) => (body += c)); q.on('end', () => {
    const send = (st, j) => { r.writeHead(st, { 'Content-Type': 'application/json' }); r.end(j == null ? '' : JSON.stringify(j)); };
    if (u.pathname === '/token') { G.tokenHits++;
      const f = new URLSearchParams(body), parts = (f.get('assertion') || '').split('.'); let okSig = false, claims = null;
      try { okSig = crypto.createVerify('RSA-SHA256').update(parts[0] + '.' + parts[1]).verify(publicKey, Buffer.from(parts[2], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); } catch (e) {}
      G.claims = claims; if (q.method !== 'POST' || f.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || !okSig) { G.badJwt++; return send(400, { error: 'invalid_grant' }); }
      const t = 'ya29.test-' + G.tokenHits; G.access.push(t); return send(200, { access_token: t, expires_in: 3600, token_type: 'Bearer' }); }
    if (G.expire > 0) { G.expire--; return send(401, { error: { code: 401 } }); } // erişim anahtarının süresi dolmuş
    if (!G.access.length || (q.headers.authorization || '') !== 'Bearer ' + G.access[G.access.length - 1]) return send(401, { error: { code: 401 } });
    if (G.forbid) return send(403, { error: { code: 403, message: 'yetki yok' } });
    if (G.fail > 0) { G.fail--; return send(500, { error: { code: 500 } }); }
    const m = u.pathname.match(/^\/androidpublisher\/v3\/applications\/([^/]+)\/purchases\/products\/([^/]+)\/tokens\/([^/:]+)(:consume)?$/);
    if (m) { const p = G.p[decodeURIComponent(m[3])];
      if (decodeURIComponent(m[1]) !== PKG || !p) return send(404, { error: { code: 404 } });
      if (p.productId !== decodeURIComponent(m[2])) return send(400, { error: { code: 400 } });
      if (m[4]) { if (q.method !== 'POST') return send(405, null); G.consumes++; p.consumptionState = 1; return send(204, null); }
      G.gets++; return send(200, p); }
    if (u.pathname === '/androidpublisher/v3/applications/' + PKG + '/purchases/voidedpurchases') { G.lists++;
      const tok = u.searchParams.get('token'), st = Number(u.searchParams.get('startTime') || 0); if (!tok) G.since.push(st);
      const all = G.voided.filter((v) => Number(v.voidedTimeMillis) >= (tok ? 0 : st)); if (!G.page) return send(200, { voidedPurchases: all });
      const from = tok ? parseInt(tok, 10) : 0, part = all.slice(from, from + G.page), out = { voidedPurchases: part }; if (from + G.page < all.length) out.tokenPagination = { nextPageToken: String(from + G.page) }; return send(200, out); }
    send(404, { error: { code: 404 } });
  });
});
// yeniden başlatma: S.start hesap dosyalarını siler; burada veriler KORUNARAK aynı klasörde yeni süreç açılır
const restart = (env) => { const out = fs.openSync(LOG, 'a'); const p = spawn('node', ['server.js'], { cwd: S.SRVDIR, env: Object.assign({}, process.env, { PORT: String(PORT), NODE_PATH: '/opt/npm-tools/node_modules' }, env), stdio: ['ignore', out, out] }); process.on('exit', () => { try { if (p.exitCode == null) p.kill('SIGKILL'); } catch (e) {} }); return p; };
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); };
  try { fs.unlinkSync(PUR); } catch (e) {}
  await new Promise((r) => gp.listen(GP, '127.0.0.1', r));
  let srv = S.start(PORT, ENV(), LOG); await S.up(PORT, LOG, true);
  const me = async (acc) => { const j = (await S.post(PORT, '/api/me', { id: acc.id, token: acc.token })).json; return j && j.player ? j.player : j; };
  const sync = async (acc, list, raw) => { const r = await S.post(PORT, '/api/iap/sync', Object.assign({ id: acc.id, token: acc.token }, list === undefined ? {} : { purchases: list })); return raw ? r : (r.json || {}); };
  const one = async (acc, product, token) => { const j = await sync(acc, [{ store: 'play', product, token }]); j.state = j.results && j.results[0] ? j.results[0].state : ''; return j; };
  const tara = async () => { const r = await S.get(PORT, '/yonetim/iade-tara?key=' + KEY); let j = null; try { j = JSON.parse(r.body); } catch (e) {} return { status: r.status, json: j || {} }; };
  const A = await S.guest(PORT, 'Alici'), B = await S.guest(PORT, 'Baska'), C = await S.guest(PORT, 'Ucuncu'), D = await S.guest(PORT, 'Dorduncu'); ok(A && A.id && B && B.id && C && C.id && D && D.id, 'dört misafir hesap');
  const c0 = (await me(A)).coins;
  // ---- ürün listesi ve mağaza özeti
  const pr = (await S.post(PORT, '/api/iap/products', {})).json; const ids = (pr && pr.products || []).map((p) => p.id).join(',');
  ok(ids === 'baslangic,altin_kucuk,altin_orta,altin_buyuk,altin_dev', 'ürün listesi: 5 ürün, Başlangıç Paketi başta', ids);
  const byId = {}; (pr.products || []).forEach((p) => (byId[p.id] = p));
  ok(byId.altin_kucuk.gold === 5000 && byId.altin_orta.gold === 16500 && byId.altin_buyuk.gold === 48000 && byId.altin_dev.gold === 130000 && byId.baslangic.gold === 3000 && byId.baslangic.once && byId.baslangic.items.join() === 'c_fikret', 'altın miktarları ve Başlangıç Paketi içeriği (K190)');
  ok(pr.store && pr.store.play === true && pr.store.sandbox === false && Object.keys(pr.store).sort().join() === 'play,sandbox', 'mağaza özeti: Google Play doğrulaması açık, deneme ret; iç ayrıntı verilmiyor', JSON.stringify(pr.store));
  // ---- hesap denetimi ve boş / bozuk istekler
  let r = await S.post(PORT, '/api/iap/sync', { purchases: [] }); ok(r.status === 400, 'eşitleme: hesap bilgisi yok → reddedilir', r.status + ' ' + r.body);
  r = await S.post(PORT, '/api/iap/sync', { id: A.id, token: 'yanlis', purchases: [{ store: 'play', product: 'altin_kucuk', token: buy(A.id, 'altin_kucuk') }] }); ok(r.status === 400 && (await me(A)).coins === c0, 'eşitleme: yanlış hesap anahtarı reddedilir, altın verilmez', r.body);
  let g0 = G.gets; r = await sync(A, []); ok(Array.isArray(r.credited) && !r.credited.length && Array.isArray(r.finish) && !r.finish.length && G.gets === g0, 'boş liste: bir şey işlenmez, Google\'a sorulmaz', JSON.stringify(r).slice(0, 120));
  r = await sync(A); ok(Array.isArray(r.credited) && !r.credited.length && !r.off, 'satın alma listesi olmayan istek (eski uygulama biçimi) hata vermez', JSON.stringify(r).slice(0, 120));
  r = await one(A, 'altin_kucuk', 'hic-olmamis-bir-belirtec-0123456789'); ok(r.state === 'invalid' && !r.finish.length && (await me(A)).coins === c0, 'Google\'ın tanımadığı belirteç: geçersiz, altın yok, tüketilmez', JSON.stringify(r.results));
  g0 = G.gets; r = await one(A, 'altin_kucuk', 'boşluklu "bozuk" belirteç <x>'); ok(r.state === 'invalid' && G.gets === g0, 'bozuk biçimli belirteç Google\'a sorulmadan reddedilir', JSON.stringify(r.results));
  r = await one(A, 'altin_yok', buy(A.id, 'altin_kucuk')); ok(r.state === 'unknown' && G.gets === g0 && (await me(A)).coins === c0, 'tanımsız ürün: Google\'a sorulmaz, altın yok', JSON.stringify(r.results));
  r = await sync(A, [{ store: 'apple', product: 'altin_kucuk', token: 'x'.repeat(40) }]); ok(r.results && r.results[0] && r.results[0].state === 'unsupported' && (await me(A)).coins === c0, 'App Store satın alması bu sürümde işlenmez (ayrı sürüm)', JSON.stringify(r.results));
  // ---- satın alma: doğrulanır, bir kez işlenir, tüketilir
  const T1 = buy(A.id, 'altin_kucuk'); r = await one(A, 'altin_kucuk', T1);
  ok(r.state === 'ok' && r.credited.length === 1 && r.credited[0].gold === 5000 && r.finish.join() === T1 && r.player && r.player.coins === c0 + 5000, 'Küçük Kese: +5.000, uygulamaya "bitir" denir', JSON.stringify(r).slice(0, 160));
  ok((await me(A)).coins === c0 + 5000, 'altın hesaba işlendi');
  ok(G.consumes === 1 && G.p[T1].consumptionState === 1, 'satın alma Google Play\'de tüketildi (ürün yeniden alınabilir)');
  const cl = G.claims || {}; ok(G.badJwt === 0 && cl.iss === SA.client_email && cl.scope === 'https://www.googleapis.com/auth/androidpublisher' && cl.aud === TOKEN_URL && cl.exp - cl.iat === 3600, 'hizmet hesabı JWT\'si: imza geçerli, kapsam yalnız androidpublisher', JSON.stringify(cl));
  const file1 = fs.readFileSync(PUR, 'utf8'), rec1 = JSON.parse(file1.split('\n').filter(Boolean).pop());
  ok(rec1.tx === G.p[T1].orderId && /^gpt:[0-9a-f]{40}$/.test(rec1.alt) && rec1.store === 'PLAY_STORE' && rec1.gold === 5000 && file1.indexOf(T1) < 0, 'kayıt: kimlik = Google sipariş numarası, ikinci kimlik = belirteç özeti; belirtecin kendisi saklanmaz', JSON.stringify(rec1).slice(0, 200));
  g0 = G.gets; r = await one(A, 'altin_kucuk', T1); ok(r.state === 'dup' && !r.credited.length && r.finish.join() === T1 && (await me(A)).coins === c0 + 5000 && G.gets === g0, 'aynı belirteç ikinci kez: altın verilmez, Google\'a yeniden sorulmaz', JSON.stringify(r.results));
  // ---- aynı anda gelen istekler: tek işleme
  const T2 = buy(A.id, 'altin_orta'); const many = await Promise.all([1, 2, 3, 4, 5, 6].map(() => one(A, 'altin_orta', T2)));
  const cRace = (await me(A)).coins; ok(cRace === c0 + 5000 + 16500, 'aynı anda 6 istek (aynı satın alma): altın bir kez verildi', 'beklenen ' + (c0 + 21500) + ', hesap ' + cRace + ' · ' + many.map((m) => m.state).join(','));
  ok(many.filter((m) => m.state === 'ok').length === 1 && many.every((m) => m.finish.join() === T2), 'altı istekten biri "işlendi", ötekiler "zaten işlenmiş"; hepsi "bitir" dedi');
  // ---- aynı üründen art arda gerçek satın almalar
  const T3 = buy(A.id, 'altin_kucuk'); r = await one(A, 'altin_kucuk', T3); ok(r.state === 'ok' && (await me(A)).coins === cRace + 5000, 'aynı üründen ikinci gerçek satın alma (1 dk sonra) verilir');
  const tSame = tick(), T4 = buy(A.id, 'altin_kucuk', { purchaseTimeMillis: String(tSame) }), T5 = buy(A.id, 'altin_kucuk', { purchaseTimeMillis: String(tSame) });
  r = await sync(A, [{ store: 'play', product: 'altin_kucuk', token: T4 }, { store: 'play', product: 'altin_kucuk', token: T5 }]);
  ok(r.credited.length === 2 && (await me(A)).coins === cRace + 15000 && r.finish.length === 2, 'aynı ana düşen iki AYRI satın alma (ayrı sipariş) ikisi de verilir (eski "aynı an" kuralı kaldırıldı)', JSON.stringify(r.results));
  const cA = cRace + 15000;
  // ---- ürün uyuşmazlığı, bekleyen, iptal, deneme
  r = await one(A, 'altin_dev', buy(A.id, 'altin_kucuk')); ok(r.state === 'invalid' && (await me(A)).coins === cA, 'ucuz ürünün belirteci pahalı ürün diye gönderilirse reddedilir', JSON.stringify(r.results));
  const TP = buy(A.id, 'altin_orta', { purchaseState: 2 }); r = await one(A, 'altin_orta', TP); ok(r.state === 'pending' && !r.finish.length && (await me(A)).coins === cA, 'bekleyen ödeme: altın verilmez, tüketilmez', JSON.stringify(r.results));
  G.p[TP].purchaseState = 0; r = await one(A, 'altin_orta', TP); ok(r.state === 'ok' && (await me(A)).coins === cA + 16500, 'bekleyen ödeme onaylanınca işlenir');
  r = await one(A, 'altin_dev', buy(A.id, 'altin_dev', { purchaseState: 1 })); ok(r.state === 'cancelled' && !r.finish.length && (await me(A)).coins === cA + 16500, 'iptal edilmiş satın alma: altın yok', JSON.stringify(r.results));
  const TS = buy(A.id, 'altin_dev', { purchaseType: 0 }); r = await one(A, 'altin_dev', TS); ok(r.state === 'sandbox' && !r.finish.length && (await me(A)).coins === cA + 16500, 'deneme (lisans testçisi) satın alması canlı ayarda altın vermez', JSON.stringify(r.results));
  // ---- başkasının satın alması
  const cb0 = (await me(B)).coins, TF = buy(A.id, 'altin_buyuk'); r = await one(B, 'altin_buyuk', TF);
  ok(r.state === 'foreign' && !r.finish.length && (await me(B)).coins === cb0, 'başka hesabın satın alması: reddedilir, altın yok', JSON.stringify(r.results));
  r = await one(A, 'altin_buyuk', TF); ok(r.state === 'ok' && (await me(A)).coins === cA + 16500 + 48000, 'aynı satın alma sahibinin hesabına işlenir');
  const cA2 = cA + 64500;
  r = await one(B, 'altin_buyuk', TF); ok(r.state === 'dup' && (await me(B)).coins === cb0, 'işlenmiş satın alma başka hesaba ikinci kez verilmez', JSON.stringify(r.results));
  const TN = buy('', 'altin_kucuk'); r = await one(B, 'altin_kucuk', TN); ok(r.state === 'ok' && (await me(B)).coins === cb0 + 5000, 'hesap etiketi olmayan satın alma, gönderen hesaba işlenir');
  const cons0 = G.consumes, TC = buy(B.id, 'altin_kucuk', { consumptionState: 1 }); r = await one(B, 'altin_kucuk', TC); ok(r.state === 'ok' && (await me(B)).coins === cb0 + 10000 && G.consumes === cons0, 'Google\'da zaten tüketilmiş ama hesaba işlenmemiş satın alma verilir; yeniden tüketme istenmez');
  // ---- Başlangıç Paketi: bir kez
  const c1 = (await me(A)).coins; const P1 = buy(A.id, 'baslangic'); r = await one(A, 'baslangic', P1); let v = await me(A);
  ok(r.state === 'ok' && r.credited[0].gold === 3000 && r.credited[0].items.join() === 'c_fikret' && v.coins === c1 + 3000 && v.owned.indexOf('c_fikret') >= 0, 'Başlangıç Paketi: +3.000 altın + Çaycı Fikret', JSON.stringify(r.credited));
  const P2 = buy(A.id, 'baslangic'); r = await one(A, 'baslangic', P2); v = await me(A);
  ok(r.state === 'ok' && r.credited[0].gold === 0 && !r.credited[0].items.length && v.coins === c1 + 3000 && v.owned.filter((x) => x === 'c_fikret').length === 1, 'Başlangıç Paketi ikinci kez: altın tekrar verilmez, Fikret tek', JSON.stringify(r.credited));
  // ---- Google'a ulaşılamazsa / anahtar süresi / yetki
  const TE = buy(A.id, 'altin_kucuk'); G.fail = 1; r = await one(A, 'altin_kucuk', TE); ok(r.state === 'error' && !r.finish.length && (await me(A)).coins === c1 + 3000, 'Google hata verirse: altın verilmez, satın alma tüketilmez (yeniden denenebilir)', JSON.stringify(r.results));
  r = await one(A, 'altin_kucuk', TE); ok(r.state === 'ok' && (await me(A)).coins === c1 + 8000, 'yeniden denenince işlenir');
  ok(G.tokenHits === 1, 'bu ana kadarki bütün sorular tek erişim anahtarıyla yapıldı (anahtar bellekte tutulur)', 'yetkilendirme isteği: ' + G.tokenHits);
  const TX = buy(A.id, 'altin_kucuk'); G.expire = 1; r = await one(A, 'altin_kucuk', TX); ok(r.state === 'ok' && G.tokenHits === 2 && (await me(A)).coins === c1 + 13000, 'erişim anahtarının süresi dolmuşsa bir kez yenilenir ve satın alma işlenir', r.state + ' · yetkilendirme isteği: ' + G.tokenHits);
  const TY = buy(A.id, 'altin_kucuk'); G.forbid = true; r = await one(A, 'altin_kucuk', TY); G.forbid = false; ok(r.state === 'error' && (await me(A)).coins === c1 + 13000, 'hizmet hesabının yetkisi yoksa (403): altın verilmez', JSON.stringify(r.results));
  r = await one(A, 'altin_kucuk', TY); ok(r.state === 'ok' && (await me(A)).coins === c1 + 18000, 'yetki gelince aynı satın alma işlenir');
  const c2 = c1 + 18000;
  // ---- iade: Google'ın geçersiz kılınanlar listesi → o satın almada gerçekte verilen geri alınır
  voidIt(P2); let t = await tara(); v = await me(A); ok(t.status === 200 && t.json.seen === 1 && t.json.refunded === 1 && v.coins === c2 && v.owned.indexOf('c_fikret') >= 0, 'hiçbir şey vermemiş ikinci paketin iadesi altın/karakter almaz', JSON.stringify(t.json) + ' altın ' + v.coins);
  voidIt(P1); t = await tara(); v = await me(A); ok(v.coins === c2 - 3000 && v.owned.indexOf('c_fikret') < 0, 'Başlangıç Paketi iadesi: 3.000 altın ve Fikret geri alındı', 'altın ' + v.coins + ' ' + JSON.stringify(t.json));
  voidIt(T1); t = await tara(); v = await me(A); ok(v.coins === c2 - 8000, 'Küçük Kese iadesi: −5.000', 'altın ' + v.coins);
  t = await tara(); ok(t.json.seen === 3 && t.json.refunded === 0 && (await me(A)).coins === c2 - 8000, 'aynı iade listesi yeniden taranınca değişmez', JSON.stringify(t.json));
  voidIt(T3, { orderId: undefined }); t = await tara(); ok(t.json.refunded === 1 && (await me(A)).coins === c2 - 13000, 'sipariş numarası olmayan iade kaydı belirteç özetiyle bulunur', JSON.stringify(t.json));
  G.voided.push({ purchaseToken: 'bilinmeyen-belirtec-000000000000', orderId: 'GPA.0000-0000-00000', voidedTimeMillis: String(Date.now()) }); t = await tara(); ok(t.status === 200 && t.json.seen === 5 && t.json.refunded === 0 && (await me(A)).coins === c2 - 13000, 'bizde kaydı olmayan iade yok sayılır', JSON.stringify(t.json));
  G.page = 2; voidIt(T4); t = await tara(); G.page = 0; ok(t.json.seen === 6 && t.json.refunded === 1 && (await me(A)).coins === c2 - 18000, 'iade listesi sayfalıysa bütün sayfalar okunur', JSON.stringify(t.json) + ' liste isteği ' + G.lists);
  ok(G.since.length >= 2 && Date.now() - G.since[0] > 28 * 86400000 && Date.now() - G.since[G.since.length - 1] < 4 * 86400000, 'ilk tarama son 29 günü, sonrakiler son 3 günü ister', G.since.map((x) => Math.round((Date.now() - x) / 86400000)).join(','));
  await S.admin(PORT, KEY, A.id, 'altin', -((await me(A)).coins - 100)); voidIt(T2); t = await tara(); v = await me(A); ok(v.coins === 0, 'harcanmış altının iadesi: bakiye 0\'ın altına inmez', 'altın ' + v.coins);
  G.fail = 1; t = await tara(); let du = (await S.get(PORT, '/durum')).body; ok(t.status === 502 && /iade taraması HATA/.test(du), 'iade listesi alınamazsa hata bildirilir ve /durum\'da görünür', t.status + ' ' + (du.match(/Satın alma:[^.]*/) || [''])[0]);
  t = await tara(); du = (await S.get(PORT, '/durum')).body; ok(t.status === 200 && /Google Play doğrulaması açık, deneme satın alması ret, iade taraması çalışıyor/.test(du), '/durum: Google Play doğrulaması açık, iade taraması çalışıyor', (du.match(/Satın alma:[^.]*/) || [''])[0]);
  // ---- Başka'da Fikret önceden varsa paket iadesi Fikret'i silmez
  await S.admin(PORT, KEY, B.id, 'hediye', 'c_fikret'); let vb = await me(B); ok(vb.owned.indexOf('c_fikret') >= 0, '(hazırlık) Baska\'da Fikret önceden var');
  const cb1 = vb.coins, P3 = buy(B.id, 'baslangic'); r = await one(B, 'baslangic', P3); vb = await me(B); ok(r.state === 'ok' && vb.coins === cb1 + 3000 && !r.credited[0].items.length, 'Fikret\'i olan oyuncuya paket: +3.000, karakter yeniden verilmez', JSON.stringify(r.credited));
  voidIt(P3); await tara(); vb = await me(B); ok(vb.coins === cb1 && vb.owned.indexOf('c_fikret') >= 0, 'o paketin iadesi: altın geri alınır, önceden sahip olunan Fikret kalır');
  // ---- sınırlar
  const eleven = []; for (let i = 0; i < 11; i++) eleven.push({ store: 'play', product: 'altin_kucuk', token: buy(C.id, 'altin_kucuk') });
  const cc0 = (await me(C)).coins; r = await sync(C, eleven); ok(r.credited.length === 10 && (await me(C)).coins === cc0 + 50000, 'tek istekte en çok 10 satın alma işlenir (11.si sonraki eşitlemede)', 'işlenen ' + (r.credited || []).length);
  let lim = null; for (let i = 0; i < 8 && !lim; i++) { const rr = await sync(D, [1, 2, 3, 4, 5, 6].map((k) => ({ store: 'play', product: 'altin_kucuk', token: 'olmayan-belirtec-' + i + '-' + k + '-0123456789' })), true); if (rr.status === 400) lim = rr; }
  ok(lim && /Çok fazla deneme/.test(lim.body), 'oyuncu başına doğrulama sınırı: art arda geçersiz belirteç gönderen durdurulur', lim ? lim.body : 'sınır devreye girmedi');
  // ---- kaldırılan adres, yönetim sayfası
  r = await S.post(PORT, '/api/iap/webhook', { event: { type: 'NON_RENEWING_PURCHASE', app_user_id: A.id, product_id: 'altin_dev', transaction_id: 'eski' } }); ok(r.status !== 200 && (await me(A)).coins === 0, 'eski RevenueCat bildirim adresi kapalı, altın vermez', r.status + ' ' + r.body);
  ok((await S.get(PORT, '/yonetim/satinalmalar')).status !== 200 && (await S.get(PORT, '/yonetim/iade-tara')).status !== 200, 'yönetim sayfaları anahtarsız açılmaz');
  const adm = await S.get(PORT, '/yonetim/satinalmalar?key=' + KEY); ok(adm.status === 200 && /Google Play doğrulaması açık/.test(adm.body) && adm.body.indexOf(G.p[T1].orderId) > 0 && /iade/.test(adm.body) && !/RevenueCat/.test(adm.body), 'yönetim: satın alma listesi (sipariş numarası, iade durumu, Google Play özeti)');
  // ---- yeniden başlatma: kayıt dosyadan geri gelir
  await S.stop(srv); srv = restart(ENV({ IAP_SANDBOX_OK: '1', GP_VOIDED_MS: '300' })); await S.up(PORT, LOG, true);
  const ck = (await me(C)).coins; r = await one(C, 'altin_kucuk', eleven[0].token); ok(r.state === 'dup' && (await me(C)).coins === ck, 'yeniden başlatmadan sonra aynı satın alma yeniden verilmez', JSON.stringify(r.results));
  r = await one(C, 'altin_kucuk', eleven[10].token); ok(r.state === 'ok' && (await me(C)).coins === ck + 5000, 'ilk istekte işlenmeyen 11. satın alma sonraki eşitlemede işlenir');
  const ca0 = (await me(A)).coins; r = await one(A, 'altin_dev', TS); ok(r.state === 'ok' && (await me(A)).coins === ca0 + 130000, 'IAP_SANDBOX_OK=1 iken deneme satın alması işlenir (iç test dönemi)', JSON.stringify(r.results));
  ok((await S.post(PORT, '/api/iap/products', {})).json.store.sandbox === true, 'mağaza özeti: deneme kabul');
  voidIt(eleven[10].token); let auto = false; for (let i = 0; i < 40 && !auto; i++) { await S.sleep(150); auto = (await me(C)).coins === ck; }
  ok(auto, 'iade taraması kendiliğinden çalışır (GP_VOIDED_MS): yönetici tetiklemeden altın geri alındı', 'altın ' + (await me(C)).coins + ' beklenen ' + ck);
  // ---- hizmet hesabı yokken / bozukken: satın alma kapalı, sunucu çalışır
  await S.stop(srv); srv = restart(ENV({ GP_SERVICE_ACCOUNT: '' })); await S.up(PORT, LOG, true);
  const off = (await S.post(PORT, '/api/iap/products', {})).json; g0 = G.gets; r = await one(A, 'altin_kucuk', buy(A.id, 'altin_kucuk'));
  ok(off.store.play === false && off.products.length === 5 && r.off === true && !r.credited.length && G.gets === g0 && /Google Play doğrulaması KAPALI/.test((await S.get(PORT, '/durum')).body), 'hizmet hesabı tanımlı değilse satın alma kapalı: ürünler listelenir, hiçbir şey işlenmez', JSON.stringify(off.store) + ' ' + JSON.stringify(r).slice(0, 80));
  await S.stop(srv); srv = restart(ENV({ GP_SERVICE_ACCOUNT: '{bozuk json' })); await S.up(PORT, LOG, true);
  ok((await S.post(PORT, '/api/iap/products', {})).json.store.play === false && /hizmet hesabı bilgisi geçersiz/.test(fs.readFileSync(LOG, 'utf8')), 'bozuk hizmet hesabı bilgisi: sunucu açılır, satın alma kapalı kalır, günlüğe yazılır');
  const SAF = '/tmp/qa_iap.sa.json'; fs.writeFileSync(SAF, JSON.stringify(SA)); await S.stop(srv); srv = restart(ENV({ GP_SERVICE_ACCOUNT: '', GP_SERVICE_ACCOUNT_FILE: SAF })); await S.up(PORT, LOG, true);
  const cd0 = (await me(B)).coins; r = await one(B, 'altin_orta', buy(B.id, 'altin_orta')); ok(r.state === 'ok' && (await me(B)).coins === cd0 + 16500, 'hizmet hesabı dosyadan da okunur (GP_SERVICE_ACCOUNT_FILE)', JSON.stringify(r.results));
  const logAll = fs.readFileSync(LOG, 'utf8'); ok(logAll.indexOf('PRIVATE KEY') < 0 && logAll.indexOf('ya29.') < 0 && logAll.indexOf(T1) < 0, 'sunucu günlüğünde özel anahtar, erişim anahtarı ya da satın alma belirteci yok');
  try { fs.unlinkSync(SAF); } catch (e) {}
  await S.stop(srv); gp.close();
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
