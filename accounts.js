// Döngü hesap sistemi: misafir hesabı, seviye / tecrübe puanı (XP), jeton, dolap, günlük bonus.
// Depo: DATABASE_URL varsa Postgres (Neon vb.), yoksa yerel JSON dosyası (data/players.json — Render'da her kurulumda sıfırlanır).
'use strict';
var crypto = require('crypto'), fs = require('fs'), path = require('path');

var START_COINS = 1000, BONUS_BASE = 200, BONUS_PER_LEVEL = 25, BONUS_GAP = 20 * 3600 * 1000;
var MAX_LEVEL = 99;
function xpNeed(level) { return 100 + 100 * level; } // bu seviyeden sonrakine geçmek için gereken XP (1→2: 200, 2→3: 300 …)
function levelOf(xp) { var l = 1; while (l < MAX_LEVEL && xp >= xpNeed(l)) { xp -= xpNeed(l); l++; } return { level: l, into: xp, need: xpNeed(l) }; }
// ödüller (12 el için; el sayısına göre orantılanır). Bota karşı tek oyuncu maçlarında yarısı.
var HAND_XP = 10, HAND_WIN_XP = 15, MATCH_XP = [60, 35, 20, 10], MATCH_COINS = [300, 150, 75, 30];

var DB = null, mem = {}, FILE = path.join(__dirname, 'data', 'players.json'), saveTimer = null, mode = 'dosya';
var catalog = {}; // ürün kimliği → fiyat (public/catalog.json'dan)

function loadCatalog(publicDir) {
  try { var arr = JSON.parse(fs.readFileSync(path.join(publicDir, 'catalog.json'), 'utf8')); catalog = {}; arr.forEach(function (c) { catalog[c.id] = c; }); } catch (e) { catalog = {}; }
  return Object.keys(catalog).length;
}
function init(opts, cb) {
  loadCatalog(opts.publicDir);
  if (process.env.DATABASE_URL) {
    var Pool;
    try { Pool = require('pg').Pool; } catch (e) { return fileMode(cb, 'pg paketi yok'); }
    DB = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
    DB.query('CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now())')
      .then(function () { mode = 'postgres'; cb(null, mode); })
      .catch(function (e) { DB = null; fileMode(cb, e.message); });
  } else fileMode(cb, null);
}
function fileMode(cb, why) {
  mode = 'dosya';
  try { mem = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { mem = {}; }
  cb(why ? new Error(why) : null, mode);
}
function flushFile() { saveTimer = null; try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(mem)); } catch (e) {} }
function get(id, cb) {
  if (!id || typeof id !== 'string' || id.length > 40) return cb(null, null);
  if (DB) DB.query('SELECT data FROM players WHERE id=$1', [id]).then(function (r) { cb(null, r.rows[0] ? r.rows[0].data : null); }).catch(function (e) { cb(e); });
  else cb(null, mem[id] || null);
}
function put(p, cb) {
  p.lastSeen = Date.now();
  if (DB) DB.query('INSERT INTO players (id, data, updated) VALUES ($1,$2,now()) ON CONFLICT (id) DO UPDATE SET data=$2, updated=now()', [p.id, JSON.stringify(p)]).then(function () { cb && cb(null); }).catch(function (e) { cb && cb(e); });
  else { mem[p.id] = p; if (!saveTimer) saveTimer = setTimeout(flushFile, 500); cb && cb(null); }
}
function newId() { return 'p_' + crypto.randomBytes(6).toString('hex'); }
function newToken() { return crypto.randomBytes(18).toString('hex'); }
function cleanName(n) { n = String(n || 'Oyuncu').replace(/[<>]/g, '').trim().slice(0, 14); return n || 'Oyuncu'; }
function cleanAvatar(a) { if (!a || typeof a !== 'object') return null; var o = {}; Object.keys(a).slice(0, 20).forEach(function (k) { var v = a[k]; if (typeof v === 'string') o[k] = v.slice(0, 40); else if (typeof v === 'number' || typeof v === 'boolean') o[k] = v; }); return o; }

function publicView(p) {
  var lv = levelOf(p.xp);
  return { id: p.id, name: p.name, avatar: p.avatar, coins: p.coins, xp: p.xp, level: lv.level, xpInto: lv.into, xpNeed: lv.need, owned: p.owned, stats: p.stats, bonusReady: Date.now() - (p.lastBonus || 0) >= BONUS_GAP, bonusIn: Math.max(0, BONUS_GAP - (Date.now() - (p.lastBonus || 0))), mode: mode };
}
function create(body, cb) {
  var p = { id: newId(), token: newToken(), name: cleanName(body.name), avatar: cleanAvatar(body.avatar), coins: START_COINS, xp: 0, owned: [], lastBonus: 0, stats: { hands: 0, matches: 0, wins: 0 }, created: Date.now(), lastSeen: Date.now() };
  // cihazdaki eski dolap (prototipten geçiş): yalnızca ücretsiz ya da zaten var olan ürünler aktarılır, jeton aktarılmaz
  if (Array.isArray(body.owned)) body.owned.slice(0, 60).forEach(function (id) { var c = catalog[id]; if (typeof id === 'string' && c && (c.free || !c.price) && p.owned.indexOf(id) < 0) p.owned.push(id); });
  put(p, function (e) { if (e) return cb(e); cb(null, { id: p.id, token: p.token, player: publicView(p) }); });
}
function auth(body, cb) { // id + token doğrulaması
  get(body && body.id, function (e, p) {
    if (e) return cb(e);
    if (!p || !body.token || p.token !== body.token) return cb(new Error('Hesap bulunamadı; yeniden giriş gerekli.'), null);
    cb(null, p);
  });
}
function me(body, cb) {
  auth(body, function (e, p) {
    if (e) return cb(e);
    var changed = false;
    if (body.name) { var n = cleanName(body.name); if (n !== p.name) { p.name = n; changed = true; } }
    if (body.avatar) { p.avatar = cleanAvatar(body.avatar); changed = true;
      if (p.avatar && p.avatar.intro) { // Masa Giriş Skini: yalnızca sahip olunan kuşanılabilir
        var okIntro = Object.keys(catalog).some(function (id) { var c = catalog[id]; return c.cat === 'intro' && c.val === p.avatar.intro && p.owned.indexOf(id) >= 0; });
        if (!okIntro) delete p.avatar.intro;
      }
    }
    if (changed) put(p);
    cb(null, publicView(p));
  });
}
function bonus(body, cb) {
  auth(body, function (e, p) {
    if (e) return cb(e);
    if (Date.now() - (p.lastBonus || 0) < BONUS_GAP) return cb(new Error('Günlük bonus henüz hazır değil.'));
    var lv = levelOf(p.xp), amount = BONUS_BASE + BONUS_PER_LEVEL * (lv.level - 1);
    p.coins += amount; p.lastBonus = Date.now();
    put(p, function (e2) { if (e2) return cb(e2); cb(null, { amount: amount, player: publicView(p) }); });
  });
}
function buy(body, cb) {
  auth(body, function (e, p) {
    if (e) return cb(e);
    var c = catalog[body.item]; if (!c) return cb(new Error('Ürün bulunamadı.'));
    if (p.owned.indexOf(c.id) >= 0) return cb(null, { player: publicView(p), already: true });
    var price = c.free ? 0 : (c.price || 0);
    if (p.coins < price) return cb(new Error('Yeterli jeton yok.'));
    p.coins -= price; p.owned.push(c.id);
    put(p, function (e2) { if (e2) return cb(e2); cb(null, { player: publicView(p) }); });
  });
}
// ödül uygulama: maç içi (sunucu odaları doğrudan çağırır) ya da bota karşı maç sonucu (istemci bildirir, yarım ödül)
function applyHand(p, won, scale) { var xp = Math.round((HAND_XP + (won ? HAND_WIN_XP : 0)) * scale); p.xp += xp; p.stats.hands++; return xp; }
function applyMatch(p, rank, totalHands, scale) {
  var f = Math.max(1, totalHands) / 12, i = Math.min(3, Math.max(0, rank - 1));
  var xp = Math.round(MATCH_XP[i] * f * scale), coins = Math.max(1, Math.round(MATCH_COINS[i] * f * scale));
  p.xp += xp; p.coins += coins; p.stats.matches++; if (rank === 1) p.stats.wins++;
  return { xp: xp, coins: coins };
}
function levelReward(before, p) { // seviye atlayınca jeton ödülü
  var after = levelOf(p.xp).level, got = 0;
  for (var l = before + 1; l <= after; l++) got += 100 * l;
  p.coins += got; return { from: before, to: after, coins: got };
}
function grant(acc, fn, cb) { // sunucu içi: oyuncuyu doğrula (id+token), fn ile değiştir, kaydet
  auth(acc, function (e, p) { if (e || !p) return cb && cb(e || new Error('yok')); var before = levelOf(p.xp).level; var out = fn(p) || {}; var lr = levelReward(before, p); if (lr.to > lr.from) out.levelUp = lr; put(p, function (e2) { cb && cb(e2, out, publicView(p)); }); });
}
function result(body, cb) { // bota karşı tek oyuncu maç sonucu (istemci bildirir): sınırlı güven, yarım ödül, 2 dk'da en fazla bir maç
  auth(body, function (e, p) {
    if (e) return cb(e);
    var th = [1, 6, 12].indexOf(body.totalHands) >= 0 ? body.totalHands : 12, rank = Math.min(4, Math.max(1, parseInt(body.rank) || 4));
    var hands = Math.min(th, Math.max(1, parseInt(body.hands) || th)), wins = Math.min(hands, Math.max(0, parseInt(body.handWins) || 0));
    var minGap = Math.min(hands, th) * 30 * 1000; // el başına en az 30 sn geçmiş olmalı
    if (Date.now() - (p.lastResult || 0) < minGap) return cb(new Error('Çok hızlı maç bildirimi.'));
    var before = levelOf(p.xp).level;
    var hx = 0; for (var i = 0; i < hands; i++) hx += applyHand(p, i < wins, 0.5);
    var got = applyMatch(p, rank, th, 0.5); got.handXp = hx;
    var lr = levelReward(before, p); if (lr.to > lr.from) got.levelUp = lr;
    p.lastResult = Date.now();
    put(p, function (e2) { if (e2) return cb(e2); cb(null, { reward: got, player: publicView(p) }); });
  });
}
// HTTP: POST /api/... JSON gövde
function handleHttp(req, res, url) {
  if (url.indexOf('/api/') !== 0) return false;
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return true; }
  var chunks = [], size = 0;
  req.on('data', function (c) { size += c.length; if (size > 20000) { req.destroy(); return; } chunks.push(c); });
  req.on('end', function () {
    var body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) {}
    var fn = { '/api/guest': create, '/api/me': me, '/api/bonus': bonus, '/api/buy': buy, '/api/result': result }[url];
    if (!fn) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"yok"}'); return; }
    fn(body, function (e, out) {
      res.writeHead(e ? 400 : 200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(e ? { error: e.message } : out));
    });
  });
  return true;
}
function ownsIntro(p, val) { return Object.keys(catalog).some(function (id) { var c = catalog[id]; return c.cat === 'intro' && c.val === val && p.owned.indexOf(id) >= 0; }); }
module.exports = { init: init, handleHttp: handleHttp, auth: auth, ownsIntro: ownsIntro, grant: grant, applyHand: applyHand, applyMatch: applyMatch, levelOf: levelOf, publicView: publicView, modeName: function () { return mode; }, count: function (cb) { if (DB) DB.query('SELECT count(*)::int AS n FROM players').then(function (r) { cb(r.rows[0].n); }).catch(function () { cb(-1); }); else cb(Object.keys(mem).length); } };
