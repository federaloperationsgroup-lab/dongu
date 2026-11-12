// Döngü ödüllü reklam modülü (v10.19, K208): uygulamada (AdMob) bir reklamı sonuna kadar izleyen oyuncuya altın.
// Akış: uygulama POST /api/ads/start ile tek kullanımlık bir "nonce" alır → reklamı yükler (Google doğrulaması için userId = oyuncu kimliği,
// customData = nonce) → reklam bittiğinde ödül iki yoldan biriyle işlenir:
//   (a) ADS_SSV=1 (canlı için önerilen): Google kendi sunucusundan GET /api/ads/ssv?…&signature=…&key_id=… çağırır (yanıt her zaman 200; yalnız geçici
//       hatada — anahtar listesi alınamadı, kayıt yazılamadı — 503 dönülür ki Google yeniden denesin); imza Google'ın açık anahtarıyla
//       (ECDSA P-256 / SHA-256) denetlenir, ödül işlenir. Uygulama POST /api/ads/claim ile yalnız "işlendi mi" diye sorar.
//   (b) ADS_SSV yoksa (deneme / test reklamları): uygulama POST /api/ads/claim {nonce} ile bildirir; nonce tek kullanımlıktır ve en az ADS_MIN_MS
//       (5 sn) önce alınmış olmalıdır. Bu yol uygulamanın beyanına güvenir; kötüye kullanım günlük sınırla sınırlıdır.
// Kurallar ekonomi modülünde: CONFIG.ads { gold, dailyMax, cooldownMs }; gün = UTC günü (günlük girişle aynı). Her ödül bir kez (transaction_id / nonce).
// POST /api/ads/status: pencere açılırken taze hak / bekleme süresi (yan etkisiz).
// Ortam: ADS_SSV=1, ADS_OFF=1 (reklam ödülü kapalı; oyuncu görünümünde ads olmaz → uygulamada düğme çıkmaz), ADS_KEYS_URL / ADS_KEYS_MIN_MS / ADS_MIN_MS / ADS_COOLDOWN_MS (test).
'use strict';
var crypto = require('crypto'), https = require('https'), http = require('http');
var Economy = require('./economy.js');
var Accounts = null;
var SSV_ON = process.env.ADS_SSV === '1', OFF = process.env.ADS_OFF === '1';
var KEYS_URL = process.env.ADS_KEYS_URL || 'https://gstatic.com/admob/reward/verifier-keys.json';
var MIN_MS = process.env.ADS_MIN_MS != null ? (parseInt(process.env.ADS_MIN_MS, 10) || 0) : 5000, MAX_MS = 15 * 60000, KEYS_TTL = 12 * 3600000;
var KEYS_MIN = process.env.ADS_KEYS_MIN_MS != null ? (parseInt(process.env.ADS_KEYS_MIN_MS, 10) || 0) : 60000, SSV_MAX_AGE = 24 * 3600000; // bilinmeyen anahtar kimliğinde liste en çok dakikada bir yenilenir; bir günden eski bildirim işlenmez
var keys = null, keysAt = 0, stats = { start: 0, claim: 0, ssv: 0, ssvBad: 0 };

function init(opts) { Accounts = opts.accounts; if (process.env.ADS_COOLDOWN_MS != null) Economy.CONFIG.ads.cooldownMs = parseInt(process.env.ADS_COOLDOWN_MS, 10) || 0; } // ADS_COOLDOWN_MS: test
function configured() { return { off: OFF, ssv: SSV_ON, gold: Economy.CONFIG.ads.gold, dailyMax: Economy.CONFIG.ads.dailyMax, stats: stats }; }
function acc(body) { return { id: body && body.id, token: body && body.token }; }

// POST /api/ads/status {id, token} → {ads, coins}: oyuncu kaydı yazılmaz, tek seferlik bildirim bayrakları (rozet, hediye) düşmez
function status(body, cb) {
  Accounts.auth(acc(body), function (e, p) { if (e || !p) return cb(e || new Error('Hesap bulunamadı; yeniden giriş gerekli.')); cb(null, { ads: OFF ? null : Economy.adSummary(p, Date.now()), coins: p.coins || 0 }); });
}
// POST /api/ads/start {id, token} → {nonce, ssv, ads}
function start(body, cb) {
  if (OFF) return cb(new Error('Reklam ödülü şu an kapalı.'));
  var out = null;
  Accounts.grant(acc(body), function (p) {
    var now = Date.now(), s = Economy.adSummary(p, now);
    if (s.left <= 0) throw new Error('Bugünkü reklam hakkın bitti; yarın (03.00) yenilenir.');
    if (s.waitMs > 0) throw new Error('Bir sonraki reklam için ' + Math.ceil(s.waitMs / 1000) + ' sn bekle.');
    p.adNonce = { v: crypto.randomBytes(12).toString('hex'), at: now }; out = { nonce: p.adNonce.v, ssv: SSV_ON };
    return out;
  }, function (e, o, view) { if (e) return cb(e); stats.start++; cb(null, { nonce: out.nonce, ssv: out.ssv, ads: view.ads }); });
}
// POST /api/ads/claim {id, token, nonce} → {ok, gold, player} | {pending: true}
function claim(body, cb) {
  if (OFF) return cb(new Error('Reklam ödülü şu an kapalı.'));
  var nonce = String(body && body.nonce || ''), res = null;
  Accounts.grant(acc(body), function (p) {
    var now = Date.now(), n = p.adNonce;
    if (!n || n.v !== nonce) throw new Error('Bu reklam oturumu geçersiz; yeniden dene.');
    if (n.done) { res = { ok: true, gold: n.gold || 0, already: true }; return res; } // Google doğrulaması (ya da önceki istek) ödülü işlemiş
    if (SSV_ON) { res = { pending: true }; return res; }                             // ödülü Google'ın bildirimi işler; uygulama bekler
    if (now - n.at < MIN_MS) throw new Error('Reklam bitmeden ödül alınamaz.');
    if (now - n.at > MAX_MS) throw new Error('Bu reklam oturumunun süresi doldu; yeniden dene.');
    var r = Economy.adReward(p, now); if (!r) throw new Error('Bugünkü reklam hakkın bitti; yarın (03.00) yenilenir.');
    n.done = true; n.gold = r.gold; res = { ok: true, gold: r.gold };
    return res;
  }, function (e, o, view) { if (e) return cb(e); if (res.ok && !res.already) { stats.claim++; console.log('reklam ödülü: ' + body.id + ' +' + res.gold + ' altın (uygulama bildirimi)'); } cb(null, Object.assign({ player: view }, res)); });
}

// ---- Google sunucu doğrulaması (SSV) ----
function fetchKeys(cb) {
  var u; try { u = new URL(KEYS_URL); } catch (e) { return cb(e); } var mod = u.protocol === 'http:' ? http : https;
  var req = mod.get({ hostname: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443), path: u.pathname + u.search }, function (r) { var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () {
    if (r.statusCode !== 200) return cb(new Error('anahtar listesi ' + r.statusCode));
    try { var j = JSON.parse(b), m = {}; (j.keys || []).forEach(function (k) { if (k && k.keyId != null && k.pem) m[String(k.keyId)] = k.pem; }); if (!Object.keys(m).length) return cb(new Error('anahtar listesi boş')); keys = m; keysAt = Date.now(); cb(null, m); } catch (e) { cb(e); } }); });
  req.on('error', cb); req.setTimeout(8000, function () { req.destroy(new Error('anahtar listesi zaman aşımı')); });
}
function keyFor(id, cb) { // 12 saatte bir yenilenir; bilinmeyen anahtar kimliğinde yeniden çekilir (Google anahtarları döndürür) — ama en çok KEYS_MIN'de bir (sahte isteklerle dışarıya istek yağdırılamaz)
  var age = Date.now() - keysAt, fresh = keys && age < KEYS_TTL;
  if (fresh && keys[id]) return cb(null, keys[id]);
  if (fresh && age < KEYS_MIN) return cb(null, null);
  fetchKeys(function (e, m) { if (e) return (keys && keys[id]) ? cb(null, keys[id]) : cb(e); cb(null, m[id] || null); });
}
function b64url(s) { s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Buffer.from(s, 'base64'); }
// rawQuery: istek adresindeki '?' sonrasının HAM hâli (imza, sıra ve kaçışlar değiştirilmeden bunun üstünden denetlenir)
function ssv(rawQuery, cb) {
  var q = String(rawQuery || ''), i = q.indexOf('&signature=');
  if (i < 0) return cb(null, { ignored: 'imza yok' }); // 200: AdMob panelindeki "URL'yi doğrula" denemesi ve boş yoklamalar takılmasın; imzasız istek hiçbir şey vermez
  var content = q.slice(0, i), tail = new URLSearchParams(q.slice(i + 1)), sig = tail.get('signature'), keyId = tail.get('key_id');
  if (!sig || !keyId) return cb(null, { ignored: 'imza yok' });
  keyFor(keyId, function (e, pem) {
    if (e) return cb(Object.assign(new Error('anahtar alınamadı: ' + e.message), { status: 503 })); // Google yeniden dener
    var good = false; try { good = !!pem && crypto.createVerify('SHA256').update(Buffer.from(content, 'utf8')).verify(pem, b64url(sig)); } catch (ex) { good = false; }
    if (!good) { stats.ssvBad++; return cb(null, { ignored: 'imza geçersiz' }); } // 200 + işlem yok (yeniden denemenin yararı yok); sayaç /durum'da görünür
    var p0 = new URLSearchParams(content), uid = p0.get('user_id') || '', tx = p0.get('transaction_id') || '', nonce = p0.get('custom_data') || '';
    if (OFF) return cb(null, { ignored: 'kapalı' });
    if (!uid || !tx) return cb(null, { ignored: 'kullanıcı ya da işlem kimliği yok' });
    var ts = parseInt(p0.get('timestamp') || '', 10); if (ts && Date.now() - ts > SSV_MAX_AGE) return cb(null, { ignored: 'eski bildirim' }); // Google saniyeler içinde bildirir ve yeniden dener; günler sonra gelen aynı adres yeniden ödül vermez
    var out = null;
    Accounts.adminEdit(uid, function (p) {
      p.adTx = p.adTx || []; if (p.adTx.indexOf(tx) >= 0) { out = { dup: true }; return; }
      var now = Date.now(), r = Economy.adReward(p, now);
      p.adTx.push(tx); if (p.adTx.length > 30) p.adTx = p.adTx.slice(-30);
      if (!r) { out = { ignored: 'günlük sınır' }; return; }
      if (p.adNonce && p.adNonce.v === nonce) { p.adNonce.done = true; p.adNonce.gold = r.gold; }
      out = { ok: true, gold: r.gold };
    }, function (e2) {
      if (e2) return /bulunamadı|kimlik/.test(e2.message || '') ? cb(null, { ignored: 'oyuncu yok' }) : cb(Object.assign(new Error('kayıt hatası'), { status: 503 })); // bilinmeyen oyuncu: yeniden denemenin yararı yok; kayıt hatasında Google yeniden dener
      if (out && out.ok) { stats.ssv++; console.log('reklam ödülü: ' + uid + ' +' + out.gold + ' altın (Google doğrulaması ' + tx + ')'); }
      cb(null, out || { ignored: '?' });
    });
  });
}
module.exports = { init: init, configured: configured, status: status, start: start, claim: claim, ssv: ssv };
