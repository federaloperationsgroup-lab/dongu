// Döngü satın alma modülü (v10.03, K140): mağaza satın almaları (Google Play faturalandırma / App Store IAP) RevenueCat üzerinden.
// Akış: uygulama (Capacitor) RevenueCat SDK ile satın alır → RevenueCat mağaza fişini doğrular → (a) webhook /api/iap/webhook ile sunucuya bildirir,
// (b) uygulama /api/iap/sync çağırır, sunucu RevenueCat REST'ten oyuncunun satın almalarını çeker; her işlem kimliği (tx) BİR KEZ işlenir.
// v10.18: işlemler tek sırada yürür (bildirim + eşitleme aynı anda gelse de çift verme olmaz); bildirim mağaza işlem kimliğiyle, eşitleme RevenueCat iç kimliğiyle
// gelebildiği için aynı satın alma üç yoldan tanınır (kimlik, ikinci kimlik, aynı oyuncu + ürün + an); iade o satın almada gerçekte verileni geri alır.
// Ürün tanımı burada (altın miktarı / verilen ürünler); fiyatlar mağazalarda tanımlanır, istemci SDK'dan okur (priceHint yalnız gösterim yedeği).
// Kayıt: purchases (Postgres) ya da data/purchases.jsonl (dosya). Kayıtlar hesap silinse de yasal süre boyunca kalır (Gizlilik Politikası m. 5).
// Ortam: RC_SECRET_KEY (REST, sk_…), RC_WEBHOOK_SECRET (webhook Authorization: Bearer …), RC_API_BASE (test için), IAP_SANDBOX_OK=1 (test satın almalarını da işle).
// DİKKAT: TestFlight / iç test ve Apple incelemesi satın almaları "sandbox" olarak gelir; bu dönemlerde IAP_SANDBOX_OK=1 olmalı, yoksa inceleyen kişi altını alamaz.
'use strict';
var fs = require('fs'), path = require('path'), https = require('https'), http = require('http');


var PRODUCTS = {
  altin_kucuk: { name: 'Küçük Kese', gold: 5000, priceHint: '49,99 TL', kind: 'gold', desc: '5.000 altın' },
  altin_orta: { name: 'Orta Kese', gold: 16500, priceHint: '129,99 TL', kind: 'gold', desc: '15.000 + 1.500 bonus altın' },
  altin_buyuk: { name: 'Büyük Kese', gold: 48000, priceHint: '299,99 TL', kind: 'gold', desc: '40.000 + 8.000 bonus altın' },
  altin_dev: { name: 'Dev Kese', gold: 130000, priceHint: '649,99 TL', kind: 'gold', desc: '100.000 + 30.000 bonus altın' },
  baslangic: { name: 'Başlangıç Paketi', gold: 3000, items: ['c_fikret'], once: true, priceHint: '29,99 TL', kind: 'pack', desc: '3.000 altın + Çaycı Fikret (hesap başına bir kez)' }
}; // v10.15 (3 Kasım 2026, kullanıcı kararı): Karakter Koleksiyonu paketi kaldırıldı; karakterler yalnız oyun içi altınla
var ORDER = ['baslangic', 'altin_kucuk', 'altin_orta', 'altin_buyuk', 'altin_dev'];
var SECRET = process.env.RC_SECRET_KEY || '', WEBHOOK = process.env.RC_WEBHOOK_SECRET || '', API = process.env.RC_API_BASE || 'https://api.revenuecat.com', SANDBOX_OK = !!process.env.IAP_SANDBOX_OK;
var DB = null, Accounts = null, DATA = path.join(__dirname, 'data'), mem = [], byTx = {};

function now() { return Date.now(); }
function products() { return ORDER.map(function (id) { var p = PRODUCTS[id]; return { id: id, name: p.name, desc: p.desc, gold: p.gold || 0, items: p.items || [], once: !!p.once, kind: p.kind, priceHint: p.priceHint }; }); }
function init(opts, cb) {
  Accounts = opts.accounts; DB = opts.db || null;
  if (DB) return DB.query('CREATE TABLE IF NOT EXISTS purchases (id SERIAL PRIMARY KEY, tx TEXT UNIQUE NOT NULL, player TEXT NOT NULL, product TEXT NOT NULL, store TEXT, price NUMERIC, currency TEXT, at BIGINT NOT NULL, status TEXT NOT NULL DEFAULT \'ok\', raw JSONB)')
    .then(function () { return DB.query('ALTER TABLE purchases ADD COLUMN IF NOT EXISTS alt TEXT'); }) // v10.18: aynı satın almanın ikinci kimliği (RevenueCat iç kimliği / mağaza işlem kimliği)
    .then(function () { cb && cb(null, 'postgres'); }).catch(function (e) { DB = null; fileInit(); cb && cb(e, 'dosya'); });
  fileInit(); cb && cb(null, 'dosya');
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
var SAME_MS = 5000; // aynı oyuncu + aynı ürün + aynı satın alma anı (±5 sn) = aynı satın alma (kimlikler farklı gelse de)
function findSame(player, product, at, cb) {
  if (!(at > 0)) return cb(null, null);
  if (DB) return DB.query('SELECT ' + COLS + ' FROM purchases WHERE player=$1 AND product=$2 AND at BETWEEN $3 AND $4 ORDER BY at LIMIT 1', [player, product, at - SAME_MS, at + SAME_MS]).then(function (r) { cb(null, row(r.rows[0])); }).catch(cb);
  var hit = null; mem.forEach(function (o) { if (!hit && o.player === player && o.product === product && Math.abs(o.at - at) <= SAME_MS) hit = o; }); cb(null, hit);
}
function setAlt(o, alt, cb) { // var olan kayda ikinci kimliği yaz (sonradan o kimlikle gelen iade bulunabilsin)
  if (!alt || o.alt || alt === o.tx) return cb(null);
  if (DB) return DB.query('UPDATE purchases SET alt=$2 WHERE tx=$1 AND alt IS NULL', [o.tx, alt]).then(function () { cb(null); }).catch(function () { cb(null); });
  var rec = byTx[o.tx]; if (rec) { rec.alt = alt; byTx[alt] = rec; appendFile({ alias: alt, of: o.tx, at: now() }); } cb(null);
}
function record(o, cb) {
  var raw = Object.assign({}, o.raw || {}, { gold: o.gold || 0, items: o.items || [] }); // v10.18: gerçekte verilen altın/ürünler kayıtta (iade tam bunu geri alır)
  if (DB) return DB.query('INSERT INTO purchases (tx, alt, player, product, store, price, currency, at, status, raw) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tx) DO NOTHING', [o.tx, o.alt || null, o.player, o.product, o.store || null, o.price == null ? null : o.price, o.currency || null, o.at, 'ok', JSON.stringify(raw)]).then(function () { cb(null); }).catch(cb);
  o.status = 'ok'; mem.push(o); byTx[o.tx] = o; if (o.alt) byTx[o.alt] = o; appendFile({ tx: o.tx, alt: o.alt || undefined, player: o.player, product: o.product, store: o.store, price: o.price, currency: o.currency, at: o.at, status: 'ok', gold: o.gold || 0, items: o.items || [] }); cb(null);
}
function markRefund(tx, cb) {
  if (DB) return DB.query("UPDATE purchases SET status='refunded' WHERE tx=$1", [tx]).then(function () { cb(null); }).catch(cb);
  if (byTx[tx]) byTx[tx].status = 'refunded'; appendFile({ refund: tx, at: now() }); cb(null);
}
// v10.18: satın alma işlemleri (hesaba işleme, iade) TEK SIRADA yürür. Ödeme bitince RevenueCat bildirimi (webhook) ile uygulamanın eşitleme
// çağrısı aynı anda gelir; sıra olmadan ikisi de "kayıt yok" görüp aynı satın almayı iki kez işleyebiliyordu. Satın alma seyrek bir olaydır, sıra beklemesi fark edilmez.
var QUEUE = [], BUSY = false;
function serial(run, cb) { QUEUE.push([run, cb]); pump(); }
function pump() { if (BUSY) return; var job = QUEUE.shift(); if (!job) return; BUSY = true; var fin = false;
  var done = function (e, r) { if (fin) return; fin = true; BUSY = false; try { job[1](e, r); } finally { pump(); } };
  try { job[0](done); } catch (e) { done(e); } }
// Hesaba işle: altın + ürünler. Aynı satın alma ikinci kez gelirse hiçbir şey yapılmaz. "Aynı" üç yoldan anlaşılır:
// (1) işlem kimliği (tx), (2) ikinci kimlik (meta.alt), (3) aynı oyuncu + ürün + satın alma anı (kimlikler iki kaynaktan farklı gelirse).
function credit(playerId, productId, tx, meta, cb) {
  var P = PRODUCTS[productId]; if (!P) return cb(new Error('Bilinmeyen ürün: ' + productId));
  if (!tx || typeof tx !== 'string') return cb(new Error('İşlem kimliği yok.'));
  meta = meta || {}; var alt = meta.alt && meta.alt !== tx ? String(meta.alt) : '';
  serial(function (done) {
    getTx(tx, function (e, had) { if (e) return done(e); if (had) return setAlt(had, alt, function () { done(null, { dup: true, tx: tx }); });
      var afterAlt = function () {
        findSame(playerId, productId, meta.at, function (e1, same) { if (e1) return done(e1);
          if (same) return setAlt(same, tx, function () { console.log('satın alma: ' + playerId + ' ' + productId + ' (' + tx + ') zaten işlenmiş: ' + same.tx); done(null, { dup: true, tx: tx, same: same.tx }); });
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
        });
      };
      if (!alt) return afterAlt();
      getTx(alt, function (e0, had2) { if (e0) return done(e0); if (had2) return done(null, { dup: true, tx: tx, same: had2.tx }); afterAlt(); });
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
// ---------- RevenueCat webhook ----------
function webhook(authHeader, body, cb) {
  if (!WEBHOOK) return cb(Object.assign(new Error('kapalı'), { status: 404 }));
  if (String(authHeader || '') !== 'Bearer ' + WEBHOOK && String(authHeader || '') !== WEBHOOK) return cb(Object.assign(new Error('yetkisiz'), { status: 401 }));
  var ev = body && body.event; if (!ev || !ev.type) return cb(null, { ignored: 'event yok' });
  var tx = String(ev.transaction_id || ev.id || ''), pid = String(ev.app_user_id || ev.original_app_user_id || ''), product = String(ev.product_id || '').replace(/^.*:/, '');
  if (!SANDBOX_OK && ev.environment === 'SANDBOX') return cb(null, { ignored: 'sandbox' });
  if (ev.type === 'NON_RENEWING_PURCHASE' || ev.type === 'INITIAL_PURCHASE') {
    if (!PRODUCTS[product]) return cb(null, { ignored: 'ürün tanımsız: ' + product });
    return credit(pid, product, tx, { store: ev.store, price: ev.price_in_purchased_currency != null ? ev.price_in_purchased_currency : ev.price, currency: ev.currency, at: ev.purchased_at_ms, raw: { type: ev.type, env: ev.environment, via: 'webhook' } }, function (e, r) { cb(e, r); });
  }
  if (ev.type === 'CANCELLATION' || ev.type === 'REFUND') return refund(tx, cb);
  cb(null, { ignored: ev.type });
}
// ---------- RevenueCat REST (eşitleme): oyuncunun bütün tek seferlik satın almaları → işlenmemişler işlenir ----------
function fetchSubscriber(id, cb) {
  var u = new URL(API + '/v1/subscribers/' + encodeURIComponent(id)); var mod = u.protocol === 'http:' ? http : https;
  var req = mod.request({ hostname: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443), path: u.pathname, method: 'GET', headers: { Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json' } }, function (r) { var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { if (r.statusCode !== 200) return cb(new Error('RevenueCat ' + r.statusCode)); try { cb(null, JSON.parse(b)); } catch (e) { cb(e); } }); });
  req.on('error', cb); req.setTimeout(8000, function () { req.destroy(new Error('RevenueCat zaman aşımı')); }); req.end();
}
function sync(playerId, cb) {
  if (!SECRET) return cb(null, { credited: [], off: true });
  fetchSubscriber(playerId, function (e, j) { if (e) return cb(e);
    var ns = (j && j.subscriber && j.subscriber.non_subscriptions) || {}, list = [];
    Object.keys(ns).forEach(function (pid) { var product = pid.replace(/^.*:/, ''); if (!PRODUCTS[product]) return; (ns[pid] || []).forEach(function (t) { if (!SANDBOX_OK && t.is_sandbox) return; var sid = t.store_transaction_id ? String(t.store_transaction_id) : ''; list.push({ product: product, tx: sid || String(t.id), alt: sid ? String(t.id) : '', at: Date.parse(t.purchase_date) || 0, store: t.store }); }); }); // v10.18: bildirim (webhook) mağaza işlem kimliğiyle gelir; aynı kimlik kullanılır, RevenueCat iç kimliği ikinci kimlik olur
    list.sort(function (a, b) { return a.at - b.at; });
    var credited = [], i = 0;
    (function next() { if (i >= list.length) return cb(null, { credited: credited }); var t = list[i++]; credit(playerId, t.product, t.tx, { store: t.store, at: t.at, alt: t.alt, raw: { via: 'sync' } }, function (e2, r) { if (!e2 && r && !r.dup) credited.push({ product: t.product, gold: r.gold, items: r.items }); next(); }); })();
  });
}
function list(cb) {
  if (DB) return DB.query('SELECT tx, player, product, store, price, currency, at, status FROM purchases ORDER BY at DESC LIMIT 200').then(function (r) { cb(null, r.rows.map(function (x) { x.at = parseInt(x.at, 10); x.price = x.price == null ? null : parseFloat(x.price); return x; })); }).catch(cb);
  cb(null, mem.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 200));
}
function configured() { return { secret: !!SECRET, webhook: !!WEBHOOK, sandbox: SANDBOX_OK }; }
module.exports = { PRODUCTS: PRODUCTS, products: products, init: init, credit: credit, refund: refund, webhook: webhook, sync: sync, list: list, configured: configured };
