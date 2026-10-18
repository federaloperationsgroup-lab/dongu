// Döngü satın alma modülü (v10.03, K140): mağaza satın almaları (Google Play faturalandırma / App Store IAP) RevenueCat üzerinden.
// Akış: uygulama (Capacitor) RevenueCat SDK ile satın alır → RevenueCat mağaza fişini doğrular → (a) webhook /api/iap/webhook ile sunucuya bildirir,
// (b) uygulama /api/iap/sync çağırır, sunucu RevenueCat REST'ten oyuncunun satın almalarını çeker; her işlem kimliği (tx) BİR KEZ işlenir.
// Ürün tanımı burada (altın miktarı / verilen ürünler); fiyatlar mağazalarda tanımlanır, istemci SDK'dan okur (priceHint yalnız gösterim yedeği).
// Kayıt: purchases (Postgres) ya da data/purchases.jsonl (dosya). Kayıtlar hesap silinse de yasal süre boyunca kalır (Gizlilik Politikası m. 5).
// Ortam: RC_SECRET_KEY (REST, sk_…), RC_WEBHOOK_SECRET (webhook Authorization: Bearer …), RC_API_BASE (test için), IAP_SANDBOX_OK=1 (test satın almalarını da işle).
'use strict';
var fs = require('fs'), path = require('path'), https = require('https'), http = require('http');

var ALL_CHARS = ['c_fikret', 'c_sakir', 'c_pamuk', 'c_nine', 'c_muhtar', 'c_ordek', 'c_palyaco'];
var PRODUCTS = {
  altin_kucuk: { name: 'Küçük Kese', gold: 5000, priceHint: '49,99 TL', kind: 'gold', desc: '5.000 altın' },
  altin_orta: { name: 'Orta Kese', gold: 16500, priceHint: '129,99 TL', kind: 'gold', desc: '15.000 + 1.500 bonus altın' },
  altin_buyuk: { name: 'Büyük Kese', gold: 48000, priceHint: '299,99 TL', kind: 'gold', desc: '40.000 + 8.000 bonus altın' },
  altin_dev: { name: 'Dev Kese', gold: 130000, priceHint: '649,99 TL', kind: 'gold', desc: '100.000 + 30.000 bonus altın' },
  baslangic: { name: 'Başlangıç Paketi', gold: 3000, items: ['c_fikret'], once: true, priceHint: '29,99 TL', kind: 'pack', desc: '3.000 altın + Çaycı Fikret (hesap başına bir kez)' },
  karakter_hepsi: { name: 'Karakter Koleksiyonu', items: ALL_CHARS, once: true, priceHint: '199,99 TL', kind: 'pack', desc: '7 özel karakter (Fikret, Şakir, Pamuk, Nine, Muhtar, Ördek, Palyaço)' }
};
var ORDER = ['baslangic', 'altin_kucuk', 'altin_orta', 'altin_buyuk', 'altin_dev', 'karakter_hepsi'];
var SECRET = process.env.RC_SECRET_KEY || '', WEBHOOK = process.env.RC_WEBHOOK_SECRET || '', API = process.env.RC_API_BASE || 'https://api.revenuecat.com', SANDBOX_OK = !!process.env.IAP_SANDBOX_OK;
var DB = null, Accounts = null, DATA = path.join(__dirname, 'data'), mem = [], byTx = {};

function now() { return Date.now(); }
function products() { return ORDER.map(function (id) { var p = PRODUCTS[id]; return { id: id, name: p.name, desc: p.desc, gold: p.gold || 0, items: p.items || [], once: !!p.once, kind: p.kind, priceHint: p.priceHint }; }); }
function init(opts, cb) {
  Accounts = opts.accounts; DB = opts.db || null;
  if (DB) return DB.query('CREATE TABLE IF NOT EXISTS purchases (id SERIAL PRIMARY KEY, tx TEXT UNIQUE NOT NULL, player TEXT NOT NULL, product TEXT NOT NULL, store TEXT, price NUMERIC, currency TEXT, at BIGINT NOT NULL, status TEXT NOT NULL DEFAULT \'ok\', raw JSONB)').then(function () { cb && cb(null, 'postgres'); }).catch(function (e) { DB = null; fileInit(); cb && cb(e, 'dosya'); });
  fileInit(); cb && cb(null, 'dosya');
}
function fileInit() { mem = []; byTx = {}; try { fs.readFileSync(path.join(DATA, 'purchases.jsonl'), 'utf8').split('\n').filter(Boolean).forEach(function (l) { try { var o = JSON.parse(l); if (o.refund) { if (byTx[o.refund]) byTx[o.refund].status = 'refunded'; } else { mem.push(o); byTx[o.tx] = o; } } catch (e) {} }); } catch (e) {} }
function appendFile(o) { try { fs.mkdirSync(DATA, { recursive: true }); fs.appendFileSync(path.join(DATA, 'purchases.jsonl'), JSON.stringify(o) + '\n'); } catch (e) {} }
function getTx(tx, cb) {
  if (DB) return DB.query('SELECT tx, player, product, store, price, currency, at, status FROM purchases WHERE tx=$1', [tx]).then(function (r) { cb(null, r.rows[0] || null); }).catch(cb);
  cb(null, byTx[tx] || null);
}
function record(o, cb) {
  if (DB) return DB.query('INSERT INTO purchases (tx, player, product, store, price, currency, at, status, raw) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (tx) DO NOTHING', [o.tx, o.player, o.product, o.store || null, o.price == null ? null : o.price, o.currency || null, o.at, 'ok', JSON.stringify(o.raw || null)]).then(function () { cb(null); }).catch(cb);
  o.status = 'ok'; mem.push(o); byTx[o.tx] = o; appendFile({ tx: o.tx, player: o.player, product: o.product, store: o.store, price: o.price, currency: o.currency, at: o.at, status: 'ok' }); cb(null);
}
function markRefund(tx, cb) {
  if (DB) return DB.query("UPDATE purchases SET status='refunded' WHERE tx=$1", [tx]).then(function () { cb(null); }).catch(cb);
  if (byTx[tx]) byTx[tx].status = 'refunded'; appendFile({ refund: tx, at: now() }); cb(null);
}
// Hesaba işle: altın + ürünler; aynı tx ikinci kez gelirse hiçbir şey yapılmaz (idempotent)
function credit(playerId, productId, tx, meta, cb) {
  var P = PRODUCTS[productId]; if (!P) return cb(new Error('Bilinmeyen ürün: ' + productId));
  if (!tx || typeof tx !== 'string') return cb(new Error('İşlem kimliği yok.'));
  getTx(tx, function (e, had) { if (e) return cb(e); if (had) return cb(null, { dup: true, tx: tx });
    Accounts.withLock(playerId, function (release) {
      Accounts.get(playerId, function (e2, p) {
        if (e2 || !p) { release(); return cb(e2 || new Error('Oyuncu bulunamadı: ' + playerId)); }
        var gold = P.gold || 0, given = [];
        p.iap = p.iap || {}; if (P.once && p.iap[productId]) { gold = 0; } // bir kerelik paket ikinci kez: altın tekrar verilmez (mağaza zaten izin vermez)
        p.coins = (p.coins || 0) + gold; (P.items || []).forEach(function (it) { if (p.owned.indexOf(it) < 0) { p.owned.push(it); given.push(it); } });
        p.iap[productId] = (p.iap[productId] || 0) + 1; p.iapGold = (p.iapGold || 0) + gold;
        Accounts.save(p, function (e3) { release(); if (e3) return cb(e3);
          var o = { tx: tx, player: playerId, product: productId, store: meta && meta.store || '', price: meta && meta.price, currency: meta && meta.currency, at: meta && meta.at || now(), raw: meta && meta.raw || null, gold: gold, items: given };
          record(o, function (e4) { if (e4) return cb(e4); console.log('satın alma: ' + playerId + ' ' + productId + ' (' + tx + ') +' + gold + ' altın' + (given.length ? ' + ' + given.join(',') : '')); cb(null, { ok: true, tx: tx, product: productId, gold: gold, items: given, player: Accounts.publicView(p) }); }); });
      });
    });
  });
}
function refund(tx, cb) { // iade: altın geri alınır (0'ın altına inmez), verilen ürünler kaldırılır
  getTx(tx, function (e, o) { if (e) return cb(e); if (!o) return cb(null, { unknown: true }); if (o.status === 'refunded') return cb(null, { dup: true });
    var P = PRODUCTS[o.product] || {};
    Accounts.withLock(o.player, function (release) { Accounts.get(o.player, function (e2, p) { if (e2 || !p) { release(); return markRefund(tx, function () { cb(null, { ok: true, noPlayer: true }); }); }
      p.coins = Math.max(0, (p.coins || 0) - (P.gold || 0)); (P.items || []).forEach(function (it) { var i = p.owned.indexOf(it); if (i >= 0) p.owned.splice(i, 1); if (p.avatar && p.avatar.full && 'c_' + p.avatar.full === it) p.avatar.full = 'yok'; });
      p.iap = p.iap || {}; if (p.iap[o.product]) p.iap[o.product]--; Accounts.save(p, function () { release(); markRefund(tx, function () { console.log('iade: ' + o.player + ' ' + o.product + ' (' + tx + ')'); cb(null, { ok: true }); }); }); }); });
  });
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
    return credit(pid, product, tx, { store: ev.store, price: ev.price, currency: ev.currency, at: ev.purchased_at_ms || now(), raw: { type: ev.type, env: ev.environment } }, function (e, r) { cb(e, r); });
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
    Object.keys(ns).forEach(function (pid) { var product = pid.replace(/^.*:/, ''); if (!PRODUCTS[product]) return; (ns[pid] || []).forEach(function (t) { if (!SANDBOX_OK && t.is_sandbox) return; list.push({ product: product, tx: String(t.id), at: Date.parse(t.purchase_date) || now(), store: t.store }); }); });
    list.sort(function (a, b) { return a.at - b.at; });
    var credited = [], i = 0;
    (function next() { if (i >= list.length) return cb(null, { credited: credited }); var t = list[i++]; credit(playerId, t.product, t.tx, { store: t.store, at: t.at, raw: { via: 'sync' } }, function (e2, r) { if (!e2 && r && !r.dup) credited.push({ product: t.product, gold: r.gold, items: r.items }); next(); }); })();
  });
}
function list(cb) {
  if (DB) return DB.query('SELECT tx, player, product, store, price, currency, at, status FROM purchases ORDER BY at DESC LIMIT 200').then(function (r) { cb(null, r.rows.map(function (x) { x.at = parseInt(x.at, 10); x.price = x.price == null ? null : parseFloat(x.price); return x; })); }).catch(cb);
  cb(null, mem.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 200));
}
function configured() { return { secret: !!SECRET, webhook: !!WEBHOOK }; }
module.exports = { PRODUCTS: PRODUCTS, products: products, init: init, credit: credit, refund: refund, webhook: webhook, sync: sync, list: list, configured: configured };
