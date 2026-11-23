// Döngü satın alma modülü. v10.20 (23 Kasım 2026, kullanıcı kararı): aracı hizmet (RevenueCat) çıkarıldı; satın alma DOĞRUDAN mağazayla doğrulanır.
// Akış (Google Play): uygulama (Capacitor; kendi DonguStore eklentimiz, Google Play Faturalandırma) satın alır → satın alma belirtecini (purchaseToken)
// /api/iap/sync ile sunucuya yollar → sunucu Google Play Developer API'ye sorar (purchases.products.get) → ödenmişse hesaba işler → satın almayı tüketir;
// uygulamaya da "bitir" der (uygulama Google Play'de tüketir; ürün yeniden alınabilir). Oyuncu verisi başka hiçbir şirkete gitmez.
// Her satın alma BİR KEZ işlenir: kimlik (tx) = Google sipariş numarası, ikinci kimlik (alt) = belirtecin özeti (belirtecin kendisi saklanmaz).
// İade: Google'ın geçersiz kılınan satın almalar listesi düzenli taranır (purchases.voidedpurchases.list); o satın almada GERÇEKTE verilen geri alınır.
// Ürün tanımı burada (altın miktarı / verilen ürünler); fiyatlar mağazada tanımlanır, uygulama mağazadan okur (priceHint yalnız gösterim yedeği).
// Kayıt: purchases (Postgres) ya da data/purchases.jsonl (dosya). Kayıtlar hesap silinse de yasal süre boyunca kalır (Gizlilik Politikası).
// Ortam: GP_SERVICE_ACCOUNT (Google hizmet hesabı JSON'u) ya da GP_SERVICE_ACCOUNT_FILE (dosya yolu); GP_PACKAGE / ANDROID_PACKAGE (varsayılan app.dongu.okey);
//        IAP_SANDBOX_OK=1 (lisans testçisi satın almalarını da işle); GP_VOIDED_MS (iade taraması aralığı, varsayılan 30 dk; 0 = kapalı);
//        GP_API_BASE, GP_TOKEN_URL (yalnız test). Hizmet hesabı tanımlı değilse satın alma kapalıdır (uygulamada "mağaza hazır değil").
// DİKKAT: iç test ve lisans testçisi satın almaları "deneme" olarak gelir; bu dönemde IAP_SANDBOX_OK=1 olmalı, herkese açık yayında kapatılmalı.
// iOS (App Store) doğrulaması bu sürümde yok; ayrı sürümde eklenecek.
'use strict';
var fs = require('fs'), path = require('path'), https = require('https'), http = require('http'), crypto = require('crypto');

var PRODUCTS = {
  altin_kucuk: { name: 'Küçük Kese', gold: 5000, priceHint: '49,99 TL', kind: 'gold', desc: '5.000 altın' },
  altin_orta: { name: 'Orta Kese', gold: 16500, priceHint: '129,99 TL', kind: 'gold', desc: '15.000 + 1.500 bonus altın' },
  altin_buyuk: { name: 'Büyük Kese', gold: 48000, priceHint: '299,99 TL', kind: 'gold', desc: '40.000 + 8.000 bonus altın' },
  altin_dev: { name: 'Dev Kese', gold: 130000, priceHint: '649,99 TL', kind: 'gold', desc: '100.000 + 30.000 bonus altın' },
  baslangic: { name: 'Başlangıç Paketi', gold: 3000, items: ['c_fikret'], once: true, priceHint: '29,99 TL', kind: 'pack', desc: '3.000 altın + Çaycı Fikret (hesap başına bir kez)' }
}; // v10.15 (3 Kasım 2026, kullanıcı kararı): Karakter Koleksiyonu paketi kaldırıldı; karakterler yalnız oyun içi altınla
var ORDER = ['baslangic', 'altin_kucuk', 'altin_orta', 'altin_buyuk', 'altin_dev'];
var SANDBOX_OK = !!process.env.IAP_SANDBOX_OK;
var PKG = process.env.GP_PACKAGE || process.env.ANDROID_PACKAGE || 'app.dongu.okey';
var GP_API = process.env.GP_API_BASE || 'https://androidpublisher.googleapis.com';
var VOIDED_MS = process.env.GP_VOIDED_MS != null && process.env.GP_VOIDED_MS !== '' ? (parseInt(process.env.GP_VOIDED_MS, 10) || 0) : 30 * 60000;
function loadSA() { // Google hizmet hesabı: yalnız sunucuda durur (ortam değişkeni ya da dosya); depoya ve sohbete yazılmaz
  var raw = process.env.GP_SERVICE_ACCOUNT || '';
  if (!raw && process.env.GP_SERVICE_ACCOUNT_FILE) { try { raw = fs.readFileSync(process.env.GP_SERVICE_ACCOUNT_FILE, 'utf8'); } catch (e) { console.log('satın alma: hizmet hesabı dosyası okunamadı (' + e.code + ')'); } }
  if (!raw) return null;
  try { var j = JSON.parse(raw); if (j && typeof j.client_email === 'string' && typeof j.private_key === 'string') return j; } catch (e) {}
  console.log('satın alma: hizmet hesabı bilgisi geçersiz (JSON değil ya da client_email / private_key yok)'); return null;
}
var SA = loadSA();
var GP_TOKEN_URL = process.env.GP_TOKEN_URL || 'https://oauth2.googleapis.com/token';
var DB = null, Accounts = null, DATA = path.join(__dirname, 'data'), mem = [], byTx = {};

function now() { return Date.now(); }
function playReady() { return !!SA; }
function products() { return ORDER.map(function (id) { var p = PRODUCTS[id]; return { id: id, name: p.name, desc: p.desc, gold: p.gold || 0, items: p.items || [], once: !!p.once, kind: p.kind, priceHint: p.priceHint }; }); }
function init(opts, cb) {
  Accounts = opts.accounts; DB = opts.db || null;
  var timers = function () { if (VOIDED_MS > 0 && playReady() && !init.timer) { init.timer = setInterval(function () { voidedPoll(); }, VOIDED_MS); if (init.timer.unref) init.timer.unref(); var t = setTimeout(function () { voidedPoll(); }, Math.min(VOIDED_MS, 20000)); if (t.unref) t.unref(); } };
  if (DB) return DB.query('CREATE TABLE IF NOT EXISTS purchases (id SERIAL PRIMARY KEY, tx TEXT UNIQUE NOT NULL, player TEXT NOT NULL, product TEXT NOT NULL, store TEXT, price NUMERIC, currency TEXT, at BIGINT NOT NULL, status TEXT NOT NULL DEFAULT \'ok\', raw JSONB)')
    .then(function () { return DB.query('ALTER TABLE purchases ADD COLUMN IF NOT EXISTS alt TEXT'); }) // v10.18: aynı satın almanın ikinci kimliği (v10.20: belirteç özeti)
    .then(function () { timers(); cb && cb(null, 'postgres'); }).catch(function (e) { DB = null; fileInit(); timers(); cb && cb(e, 'dosya'); });
  fileInit(); timers(); cb && cb(null, 'dosya');
}
function fileInit() { mem = []; byTx = {}; try { fs.readFileSync(path.join(DATA, 'purchases.jsonl'), 'utf8').split('\n').filter(Boolean).forEach(function (l) { try { var o = JSON.parse(l);
  if (o.refund) { if (byTx[o.refund]) byTx[o.refund].status = 'refunded'; }
  else if (o.alias) { if (byTx[o.of]) { byTx[o.of].alt = o.alias; byTx[o.alias] = byTx[o.of]; } }
  else { mem.push(o); byTx[o.tx] = o; if (o.alt) byTx[o.alt] = o; } } catch (e) {} }); } catch (e) {} }
function appendFile(o) { try { fs.mkdirSync(DATA, { recursive: true }); fs.appendFileSync(path.join(DATA, 'purchases.jsonl'), JSON.stringify(o) + '\n'); } catch (e) {} }
function row(x) { if (!x) return null; x.at = parseInt(x.at, 10); var raw = x.raw; if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } } x.raw = raw || null; if (raw && raw.gold != null) x.gold = raw.gold; if (raw && Array.isArray(raw.items)) x.items = raw.items; return x; }
var COLS = 'tx, alt, player, product, store, price, currency, at, status, raw';
function getTx(tx, cb) { // işlem kimliğiyle ya da ikinci kimlikle (alt) kayıt
  if (DB) return DB.query('SELECT ' + COLS + ' FROM purchases WHERE tx=$1 OR alt=$1 LIMIT 1', [tx]).then(function (r) { cb(null, row(r.rows[0])); }).catch(cb);
  cb(null, byTx[tx] || null);
}
function setAlt(o, alt, cb) { // var olan kayda ikinci kimliği yaz (sonradan o kimlikle gelen iade bulunabilsin)
  if (!alt || o.alt || alt === o.tx) return cb(null);
  if (DB) return DB.query('UPDATE purchases SET alt=$2 WHERE tx=$1 AND alt IS NULL', [o.tx, alt]).then(function () { cb(null); }).catch(function () { cb(null); });
  var rec = byTx[o.tx]; if (rec) { rec.alt = alt; byTx[alt] = rec; appendFile({ alias: alt, of: o.tx, at: now() }); } cb(null);
}
function record(o, cb) {
  var raw = Object.assign({}, o.raw || {}, { gold: o.gold || 0, items: o.items || [] }); // gerçekte verilen altın/ürünler kayıtta (iade tam bunu geri alır)
  if (DB) return DB.query('INSERT INTO purchases (tx, alt, player, product, store, price, currency, at, status, raw) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tx) DO NOTHING', [o.tx, o.alt || null, o.player, o.product, o.store || null, o.price == null ? null : o.price, o.currency || null, o.at, 'ok', JSON.stringify(raw)]).then(function () { cb(null); }).catch(cb);
  o.status = 'ok'; mem.push(o); byTx[o.tx] = o; if (o.alt) byTx[o.alt] = o; appendFile({ tx: o.tx, alt: o.alt || undefined, player: o.player, product: o.product, store: o.store, price: o.price, currency: o.currency, at: o.at, status: 'ok', gold: o.gold || 0, items: o.items || [] }); cb(null);
}
function markRefund(tx, cb) {
  if (DB) return DB.query("UPDATE purchases SET status='refunded' WHERE tx=$1", [tx]).then(function () { cb(null); }).catch(cb);
  if (byTx[tx]) byTx[tx].status = 'refunded'; appendFile({ refund: tx, at: now() }); cb(null);
}
// Satın alma işlemleri (hesaba işleme, iade) TEK SIRADA yürür: aynı satın alma aynı anda birkaç istekle gelse de (çift dokunma, açılıştaki kurtarma + düğme) bir kez işlenir.
var QUEUE = [], BUSY = false;
function serial(run, cb) { QUEUE.push([run, cb]); pump(); }
function pump() { if (BUSY) return; var job = QUEUE.shift(); if (!job) return; BUSY = true; var fin = false;
  var done = function (e, r) { if (fin) return; fin = true; BUSY = false; try { job[1](e, r); } finally { pump(); } };
  try { job[0](done); } catch (e) { done(e); } }
// Hesaba işle: altın + ürünler. Aynı satın alma ikinci kez gelirse hiçbir şey yapılmaz. "Aynı" iki yoldan anlaşılır: (1) işlem kimliği (tx), (2) ikinci kimlik (meta.alt).
// v10.20: "aynı oyuncu + ürün + an" eşleşmesi kaldırıldı (RevenueCat'in iki ayrı kimlik kaynağı içindi; tek kaynakta gerekmez ve art arda iki gerçek satın almayı tek sayabilirdi).
function credit(playerId, productId, tx, meta, cb) {
  var P = PRODUCTS[productId]; if (!P) return cb(new Error('Bilinmeyen ürün: ' + productId));
  if (!tx || typeof tx !== 'string') return cb(new Error('İşlem kimliği yok.'));
  meta = meta || {}; var alt = meta.alt && meta.alt !== tx ? String(meta.alt) : '';
  serial(function (done) {
    getTx(tx, function (e, had) { if (e) return done(e); if (had) return setAlt(had, alt, function () { done(null, { dup: true, tx: tx }); });
      var give = function () {
        Accounts.withLock(playerId, function (release) {
          Accounts.get(playerId, function (e2, p) {
            if (e2 || !p) { release(); return done(e2 || new Error('Oyuncu bulunamadı: ' + playerId)); }
            var gold = P.gold || 0, given = [];
            p.iap = p.iap || {}; if (P.once && p.iap[productId]) { gold = 0; } // bir kerelik paket ikinci kez: altın tekrar verilmez (uygulama düğmeyi zaten gizler)
            p.coins = (p.coins || 0) + gold; (P.items || []).forEach(function (it) { if (p.owned.indexOf(it) < 0) { p.owned.push(it); given.push(it); } });
            p.iap[productId] = (p.iap[productId] || 0) + 1; p.iapGold = (p.iapGold || 0) + gold;
            Accounts.save(p, function (e3) { if (e3) { release(); return done(e3); }
              var o = { tx: tx, alt: alt || undefined, player: playerId, product: productId, store: meta.store || '', price: meta.price, currency: meta.currency, at: meta.at > 0 ? meta.at : now(), raw: meta.raw || null, gold: gold, items: given };
              record(o, function (e4) { release(); if (e4) return done(e4); console.log('satın alma: ' + playerId + ' ' + productId + ' (' + tx + ') +' + gold + ' altın' + (given.length ? ' + ' + given.join(',') : '')); done(null, { ok: true, tx: tx, product: productId, gold: gold, items: given, player: Accounts.publicView(p) }); }); });
          });
        });
      };
      if (!alt) return give();
      getTx(alt, function (e0, had2) { if (e0) return done(e0); if (had2) return done(null, { dup: true, tx: tx, same: had2.tx }); give(); });
    });
  }, cb);
}
function refund(tx, cb) { // iade: o satın almada GERÇEKTE verilen altın geri alınır (0'ın altına inmez), verilen ürünler kaldırılır
  serial(function (done) {
    getTx(tx, function (e, o) { if (e) return done(e); if (!o) return done(null, { unknown: true }); if (o.status === 'refunded') return done(null, { dup: true });
      var P = PRODUCTS[o.product] || {}, gold = o.gold != null ? o.gold : (P.gold || 0), items = Array.isArray(o.items) ? o.items : (P.items || []); // eski kayıtlarda (v10.18 öncesi) verilen miktar yok → ürün tanımı
      Accounts.withLock(o.player, function (release) { Accounts.get(o.player, function (e2, p) { if (e2 || !p) { release(); return markRefund(o.tx, function () { done(null, { ok: true, noPlayer: true }); }); }
        p.coins = Math.max(0, (p.coins || 0) - gold); items.forEach(function (it) { var i = p.owned.indexOf(it); if (i >= 0) p.owned.splice(i, 1); if (p.avatar && p.avatar.full && 'c_' + p.avatar.full === it) p.avatar.full = 'yok'; });
        p.iap = p.iap || {}; if (p.iap[o.product]) p.iap[o.product]--; p.iapGold = Math.max(0, (p.iapGold || 0) - gold);
        Accounts.save(p, function (e3) { if (e3) { release(); return done(e3); } markRefund(o.tx, function () { release(); console.log('iade: ' + o.player + ' ' + o.product + ' (' + o.tx + ') −' + gold + ' altın' + (items.length ? ' − ' + items.join(',') : '')); done(null, { ok: true, gold: gold, items: items }); }); }); }); });
    });
  }, cb);
}
// ---------- Google Play Developer API (hizmet hesabıyla; yalnız Node'un kendi kitaplıkları) ----------
function request(method, url, headers, body, cb) {
  var u; try { u = new URL(url); } catch (e) { return cb(e); }
  var mod = u.protocol === 'http:' ? http : https, fin = false, done = function (e, st, text) { if (fin) return; fin = true; cb(e, st, text); };
  var h = Object.assign({}, headers || {}); if (body != null) h['Content-Length'] = Buffer.byteLength(body);
  var req = mod.request({ hostname: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443), path: u.pathname + u.search, method: method, headers: h }, function (r) {
    var b = ''; r.setEncoding('utf8'); r.on('data', function (c) { if (b.length < 2000000) b += c; }); r.on('end', function () { done(null, r.statusCode, b); }); r.on('error', function (e) { done(e); }); });
  req.on('error', function (e) { done(e); }); req.setTimeout(10000, function () { req.destroy(new Error('Google Play zaman aşımı')); });
  if (body != null) req.end(body); else req.end();
}
var TOK = { v: '', exp: 0, wait: null };
function b64u(x) { return Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function gpToken(cb) { // erişim anahtarı (1 saat geçerli; bellekte tutulur, aynı anda tek istek)
  if (!SA) return cb(new Error('Google hizmet hesabı tanımlı değil'));
  if (TOK.v && TOK.exp - 60000 > now()) return cb(null, TOK.v);
  if (TOK.wait) { TOK.wait.push(cb); return; }
  TOK.wait = [cb];
  var fin = function (e, v) { var w = TOK.wait || []; TOK.wait = null; w.forEach(function (f) { try { f(e, v); } catch (x) {} }); };
  var iat = Math.floor(now() / 1000), jwt;
  try {
    var head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), claim = b64u(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: GP_TOKEN_URL, iat: iat, exp: iat + 3600 }));
    jwt = head + '.' + claim + '.' + b64u(crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(SA.private_key));
  } catch (e) { return fin(new Error('Google hizmet hesabı anahtarı kullanılamadı')); }
  request('POST', GP_TOKEN_URL, { 'Content-Type': 'application/x-www-form-urlencoded' }, 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(jwt), function (e, st, text) {
    if (e) return fin(e); var j = null; try { j = JSON.parse(text); } catch (x) {}
    if (st !== 200 || !j || !j.access_token) return fin(new Error('Google yetkilendirme ' + st + (j && j.error ? ' (' + String(j.error).slice(0, 60) + ')' : '')));
    TOK.v = String(j.access_token); TOK.exp = now() + (parseInt(j.expires_in, 10) || 3600) * 1000; fin(null, TOK.v);
  });
}
function gpCall(method, pathq, cb, retried) {
  gpToken(function (e, tok) { if (e) return cb(e);
    request(method, GP_API + pathq, { Authorization: 'Bearer ' + tok, Accept: 'application/json' }, method === 'POST' ? '' : null, function (e2, st, text) {
      if (e2) return cb(e2);
      if (st === 401 && !retried) { TOK.v = ''; TOK.exp = 0; return gpCall(method, pathq, cb, true); } // anahtar süresi dolmuş: bir kez yenile
      var j = null; try { j = text ? JSON.parse(text) : {}; } catch (x) {}
      cb(null, st, j);
    });
  });
}
function gpPath(product, token, verb) { return '/androidpublisher/v3/applications/' + encodeURIComponent(PKG) + '/purchases/products/' + encodeURIComponent(product) + '/tokens/' + encodeURIComponent(token) + (verb ? ':' + verb : ''); }
function tokenAlt(token) { return 'gpt:' + crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 40); }
// Bir Google Play satın almasını doğrula ve hesaba işle. Sonuç: { state, finish } — state: ok | dup | pending | cancelled | invalid | sandbox | foreign | unknown;
// finish: uygulama bu satın almayı Google Play'de tüketsin mi (yalnız hesaba işlenmiş satın almalarda).
function playVerify(playerId, product, token, cb) {
  if (!PRODUCTS[product]) return cb(null, { state: 'unknown', finish: false });
  if (typeof token !== 'string' || token.length < 16 || token.length > 4000 || /[^A-Za-z0-9._~:+\/=\-]/.test(token)) return cb(null, { state: 'invalid', finish: false });
  var alt = tokenAlt(token);
  getTx(alt, function (e, had) { if (e) return cb(e);
    if (had) return cb(null, { state: 'dup', finish: true }); // zaten işlenmiş: Google'a yeniden sorulmaz
    gpCall('GET', gpPath(product, token), function (e2, st, p) {
      if (e2) return cb(e2);
      if (st === 400 || st === 404 || st === 410) return cb(null, { state: 'invalid', finish: false });
      if (st !== 200 || !p) return cb(new Error('Google Play doğrulaması yapılamadı (HTTP ' + st + ')'));
      var ps = Number(p.purchaseState);
      if (ps === 2) return cb(null, { state: 'pending', finish: false }); // bekleyen ödeme: onaylanınca işlenir
      if (ps !== 0) return cb(null, { state: 'cancelled', finish: false });
      var test = p.purchaseType != null && Number(p.purchaseType) === 0; // lisans testçisi / deneme satın alması
      if (test && !SANDBOX_OK) return cb(null, { state: 'sandbox', finish: false });
      var owner = p.obfuscatedExternalAccountId ? String(p.obfuscatedExternalAccountId) : '';
      if (owner && owner !== playerId) return cb(null, { state: 'foreign', finish: false }); // başka hesabın satın alması
      if (Number(p.quantity) > 1) console.log('satın alma: çoklu adet (' + p.quantity + ') bir kez işlendi: ' + playerId + ' ' + product);
      var tx = p.orderId ? String(p.orderId) : alt, at = parseInt(p.purchaseTimeMillis, 10) || 0;
      credit(playerId, product, tx, { store: 'PLAY_STORE', at: at, alt: alt, raw: { via: 'play', env: test ? 'test' : 'prod', region: p.regionCode || undefined } }, function (e3, r) {
        if (e3) return cb(e3);
        var out = r.dup ? { state: 'dup', finish: true } : { state: 'ok', finish: true, gold: r.gold, items: r.items };
        if (Number(p.consumptionState) === 1) return cb(null, out);
        gpCall('POST', gpPath(product, token, 'consume'), function (e4, st4) { if (e4 || st4 < 200 || st4 > 299) console.log('satın alma: Google Play tüketme isteği başarısız (' + (e4 ? e4.message : 'HTTP ' + st4) + '); uygulama tüketecek'); cb(null, out); });
      });
    });
  });
}
// Uygulamanın eşitleme çağrısı: purchases = [{ store: 'play', product, token }]. Hesaba işlenmemiş olanlar doğrulanıp işlenir.
var RATE = {}, RATE_N = 40, RATE_MS = 10 * 60000; // oyuncu başına 10 dakikada en çok 40 doğrulama (Google kotası ve kötüye kullanım)
function limited(playerId, n) { var t = now(), r = RATE[playerId]; if (!r || t - r.t > RATE_MS) r = RATE[playerId] = { t: t, n: 0 }; if (r.n + n > RATE_N) return true; r.n += n; return false; }
function sync(playerId, purchases, cb) {
  var list = Array.isArray(purchases) ? purchases.filter(function (x) { return x && typeof x === 'object'; }).slice(0, 10) : [];
  if (!playReady()) return cb(null, { credited: [], finish: [], results: [], off: true });
  if (!list.length) return cb(null, { credited: [], finish: [], results: [] });
  if (limited(playerId, list.length)) return cb(new Error('Çok fazla deneme; birkaç dakika sonra tekrar dene.'));
  var credited = [], finish = [], results = [], i = 0;
  (function next() {
    if (i >= list.length) return cb(null, { credited: credited, finish: finish, results: results });
    var it = list[i++], product = String(it.product || ''), store = String(it.store || 'play');
    if (store !== 'play') { results.push({ product: product, state: 'unsupported' }); return next(); }
    playVerify(playerId, product, it.token, function (e, r) {
      if (e) { console.log('satın alma doğrulanamadı: ' + playerId + ' ' + product + ': ' + e.message); results.push({ product: product, state: 'error' }); return next(); }
      if (r.finish) finish.push(it.token);
      if (r.state === 'ok') credited.push({ product: product, gold: r.gold, items: r.items });
      else if (r.state !== 'dup' && r.state !== 'pending') console.log('satın alma işlenmedi: ' + playerId + ' ' + product + ' → ' + r.state);
      results.push({ product: product, state: r.state }); next();
    });
  })();
}
// İade taraması: Google'ın geçersiz kılınan satın almalar listesi (iade, geri ödeme, iptal). İlk taramada son 29 gün, sonrakilerde son 3 gün (iade yinelenirse değişmez).
var VOIDED = { ok: 0, at: 0, err: '', n: 0, first: true, busy: false };
function voidedPoll(cb) {
  if (!playReady()) return cb && cb(null, { off: true });
  if (VOIDED.busy) return cb && cb(null, { busy: true });
  VOIDED.busy = true;
  var since = now() - (VOIDED.first ? 29 : 3) * 86400000, seen = 0, done = 0;
  var end = function (e, r) { VOIDED.busy = false; VOIDED.at = now(); if (e) { VOIDED.err = e.message; console.log('satın alma: iade listesi alınamadı (' + e.message + ')'); } else { VOIDED.err = ''; VOIDED.ok = now(); VOIDED.first = false; VOIDED.n += done; } if (cb) cb(e, r); };
  var page = function (tok) {
    gpCall('GET', '/androidpublisher/v3/applications/' + encodeURIComponent(PKG) + '/purchases/voidedpurchases?maxResults=1000' + (tok ? '&token=' + encodeURIComponent(tok) : '&startTime=' + since), function (e, st, j) {
      if (e) return end(e); if (st !== 200 || !j) return end(new Error('HTTP ' + st));
      var arr = Array.isArray(j.voidedPurchases) ? j.voidedPurchases : [], k = 0;
      (function each() {
        if (k >= arr.length) { var nx = j.tokenPagination && j.tokenPagination.nextPageToken; if (nx) return page(String(nx)); return end(null, { seen: seen, refunded: done }); }
        var v = arr[k++] || {}, ids = []; seen++;
        if (v.orderId) ids.push(String(v.orderId)); if (v.purchaseToken) ids.push(tokenAlt(v.purchaseToken));
        (function tryId(n) { if (n >= ids.length) return each(); refund(ids[n], function (e2, r) { if (!e2 && r && r.ok) { done++; return each(); } if (!e2 && r && r.dup) return each(); tryId(n + 1); }); })(0);
      })();
    });
  };
  page('');
}
function list(cb) {
  if (DB) return DB.query('SELECT tx, player, product, store, price, currency, at, status FROM purchases ORDER BY at DESC LIMIT 200').then(function (r) { cb(null, r.rows.map(function (x) { x.at = parseInt(x.at, 10); x.price = x.price == null ? null : parseFloat(x.price); return x; })); }).catch(cb);
  cb(null, mem.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 200));
}
function store() { return { play: playReady(), sandbox: SANDBOX_OK }; } // uygulamaya verilen özet (iç ayrıntı yok)
function configured() { return { play: playReady(), sandbox: SANDBOX_OK, pkg: PKG, voidedMs: VOIDED_MS, voidedOk: VOIDED.ok, voidedErr: VOIDED.err, refunds: VOIDED.n }; }
module.exports = { PRODUCTS: PRODUCTS, products: products, init: init, credit: credit, refund: refund, sync: sync, voidedPoll: voidedPoll, list: list, store: store, configured: configured };
