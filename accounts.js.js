// Döngü hesap sistemi: misafir hesabı, seviye / tecrübe puanı (XP), jeton, dolap, günlük bonus.
// Depo: DATABASE_URL varsa Postgres (Neon vb.), yoksa yerel JSON dosyası (data/players.json — Render'da her kurulumda sıfırlanır).
'use strict';
var crypto = require('crypto'), fs = require('fs'), path = require('path');
var Economy = require('./economy.js'); // ödül, seviye, görev, günlük giriş, havuz: tek ekonomi modülü (sürümlü CONFIG)

var START_COINS = Economy.CONFIG.welcomeGold;
var RESULT_GAP = parseInt(process.env.RESULT_GAP_MS) || 30000; // antrenman eli bildirimi arası en az süre
function levelOf(xp) { return Economy.levelOf(xp || 0); }

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
// Avatar şeması (v9.69): açık alan listesi; bilinmeyen alanlar düşer. Kozmetik yuvalar: hair, beard, outfit, acc, full + gardırop yuvaları (moustache, pants, headwear, eyewear, necklace, earring, wrist)
var AVATAR_KEYS = ['v', 'name', 'gender', 'skin', 'hair', 'hairColor', 'beard', 'outfit', 'acc', 'full', 'intro', 'moustache', 'pants', 'headwear', 'eyewear', 'necklace', 'earring', 'wrist'];
var SLOT_DEFAULT = { hair: 'kisa', beard: 'yok', outfit: 'mont-mavi', acc: 'yok', full: 'yok', moustache: 'yok', pants: 'yok', headwear: 'yok', eyewear: 'yok', necklace: 'yok', earring: 'yok', wrist: 'yok' };
function cleanAvatar(a) { if (!a || typeof a !== 'object') return null; var o = {}; AVATAR_KEYS.forEach(function (k) { var v = a[k]; if (typeof v === 'string') o[k] = v.slice(0, 40); else if (typeof v === 'number' || typeof v === 'boolean') o[k] = v; }); return o; }
// Sahip olunmayan ücretli kozmetik giyilemez: katalogdaki (k, val) eşleşmesi ücretliyse ve hesapta yoksa yuva varsayılana döner (intro ayrıca denetlenir)
function cleanCosmetics(p, av) {
  if (!av) return av;
  Object.keys(catalog).forEach(function (id) { var c = catalog[id]; if (!c || !c.k || c.cat === 'intro' || c.cat === 'tiles' || c.cat === 'theme') return; if (av[c.k] === c.val && !c.free && (c.price || 0) > 0 && p.owned.indexOf(id) < 0) av[c.k] = SLOT_DEFAULT[c.k] || 'yok'; });
  return av;
}

// Skin hediyesi (8 Ekim 2026): her hesaba BİR KEZ, her skinden 1 ücretsiz kullanım — Çaktırmadan Bak ('bak') + katalogdaki Masa Giriş Skinleri (val).
// Satın alımları, dolabı ve K5 hak kuralını (sahip olunan skin → el başına hak) değiştirmez; yalnız bir kerelik ek haktır. Giriş/yenileme/yeniden açılış tekrar vermez (skinGift damgası).
function skinIds() { var ids = ['bak']; Object.keys(catalog).forEach(function (id) { var c = catalog[id]; if (c.cat === 'intro' && ids.indexOf(c.val) < 0) ids.push(c.val); }); return ids; }
function ensureSkinGift(p) { if (p.skinGift) return false; p.freeSkins = {}; skinIds().forEach(function (id) { p.freeSkins[id] = 1; }); p.skinGift = Date.now(); p.skinGiftNew = true; return true; }
function freeLeft(p, id) { return (p && p.freeSkins && p.freeSkins[id]) || 0; }
function useFreeSkin(p, id) { if (!(freeLeft(p, id) > 0)) return false; p.freeSkins[id]--; p.freeUsed = p.freeUsed || {}; p.freeUsed[id] = Date.now(); return true; }
function publicView(p) {
  var now = Date.now(), lv = levelOf(p.xp), ec = Economy.summary(p, now);
  return { id: p.id, name: p.name, avatar: p.avatar, coins: p.coins, xp: p.xp, level: lv.level, xpInto: lv.into, xpNeed: lv.need, owned: p.owned, stats: p.stats, econ: ec, bonusReady: !ec.login, bonusIn: ec.login ? Math.max(0, ec.nextDayAt - now) : 0, tutorialRewarded: !!p.tutorialRewarded, mode: mode, economyVersion: Economy.CONFIG.version, freeSkins: p.freeSkins || {}, skinGiftNew: !!p.skinGiftNew };
}
function viewOnce(p) { var v = publicView(p); if (p.skinGiftNew) { delete p.skinGiftNew; put(p); } return v; } // hoş geldin bildirimi bir kez: bayrak ilk görünümle düşer
function create(body, cb) {
  var p = { id: newId(), token: newToken(), name: cleanName(body.name), avatar: cleanAvatar(body.avatar), coins: START_COINS, xp: 0, owned: [], lastBonus: 0, stats: { hands: 0, matches: 0, wins: 0 }, created: Date.now(), lastSeen: Date.now() };
  // cihazdaki eski dolap (prototipten geçiş): yalnızca ücretsiz ya da zaten var olan ürünler aktarılır, jeton aktarılmaz
  if (Array.isArray(body.owned)) body.owned.slice(0, 60).forEach(function (id) { var c = catalog[id]; if (typeof id === 'string' && c && (c.free || !c.price) && p.owned.indexOf(id) < 0) p.owned.push(id); });
  ensureSkinGift(p);
  put(p, function (e) { if (e) return cb(e); cb(null, { id: p.id, token: p.token, player: viewOnce(p) }); });
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
    var changed = ensureSkinGift(p); // eski hesaplar da ilk girişte bir kez alır (yalnız bir kerelik hak; alımlar değişmez)
    if (body.name) { var n = cleanName(body.name); if (n !== p.name) { p.name = n; changed = true; } }
    if (body.avatar) { p.avatar = cleanCosmetics(p, cleanAvatar(body.avatar)); changed = true;
      if (p.avatar && p.avatar.intro) { // Masa Giriş Skini: yalnızca sahip olunan kuşanılabilir (deneme hakkı koltuğa oturulurken ayrıca değerlendirilir)
        var okIntro = Object.keys(catalog).some(function (id) { var c = catalog[id]; return c.cat === 'intro' && c.val === p.avatar.intro && p.owned.indexOf(id) >= 0; });
        if (!okIntro) delete p.avatar.intro;
      }
    }
    if (changed) put(p);
    cb(null, viewOnce(p));
  });
}
function skinUse(body, cb) { // bot masasında (istemci tarafı antrenman maçı) ücretsiz skin kullanımı: hesaptan 1 düşer; çevrim içi masada sunucu kendisi düşer
  auth(body, function (e, p) {
    if (e) return cb(e);
    var id = String(body.id || ''); if (skinIds().indexOf(id) < 0) return cb(new Error('Bilinmeyen skin.'));
    ensureSkinGift(p);
    if (!useFreeSkin(p, id)) return cb(new Error('Bu skin için ücretsiz kullanım hakkın kalmadı.'));
    put(p, function (e2) { if (e2) return cb(e2); cb(null, { player: viewOnce(p), left: freeLeft(p, id) }); });
  });
}
function bonus(body, cb) { // günlük giriş ödülü (UTC günü başına bir kez)
  auth(body, function (e, p) {
    if (e) return cb(e);
    var r = Economy.loginReward(p, Date.now());
    if (!r) return cb(new Error('Günlük giriş ödülü bugün alındı; yarın (03.00) yenilenir.'));
    put(p, function (e2) { if (e2) return cb(e2); cb(null, { amount: r.gold, player: publicView(p) }); });
  });
}
function tutorial(body, cb) { // eğitimi ilk tamamlama ödülü (bir kez)
  auth(body, function (e, p) {
    if (e) return cb(e);
    var r = Economy.tutorialReward(p, Date.now());
    put(p, function (e2) { if (e2) return cb(e2); cb(null, { reward: r, already: !r, player: publicView(p) }); });
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
function grant(acc, fn, cb) { // sunucu içi: oyuncuyu doğrula (id+token), fn ile değiştir (Economy.* çağrıları fn içinde), kaydet; fn hata atarsa kayıt değişmez
  auth(acc, function (e, p) { if (e || !p) return cb && cb(e || new Error('yok')); var out; try { out = fn(p) || {}; } catch (ex) { return cb && cb(ex); } put(p, function (e2) { cb && cb(e2, out, publicView(p)); }); });
}
function releaseEscrows(cb) { // sunucu açılışı: odalar bellekte olduğundan yarım kalan emanetler iade edilir
  var n = 0;
  if (DB) { DB.query("SELECT data FROM players WHERE data ? 'escrow'").then(function (r) { r.rows.forEach(function (row) { var p = row.data; if (p.escrow) { p.coins = (p.coins || 0) + p.escrow.amount; delete p.escrow; n++; put(p); } }); cb && cb(n); }).catch(function () { cb && cb(-1); }); return; }
  Object.keys(mem).forEach(function (id) { var p = mem[id]; if (p && p.escrow) { p.coins = (p.coins || 0) + p.escrow.amount; delete p.escrow; n++; put(p); } });
  cb && cb(n);
}
function result(body, cb) { // botlara karşı tek oyuncu (antrenman) sonucu: istemci bildirir; her el için antrenman ödülü (günde ilk 5), sıralama bonusu yok
  auth(body, function (e, p) {
    if (e) return cb(e);
    var hands = Math.min(12, Math.max(1, parseInt(body.hands) || 1)), now = Date.now();
    var minGap = hands * RESULT_GAP; // el başına en az 30 sn geçmiş olmalı (hızlı sahte bildirim engeli)
    if (now - (p.lastResult || 0) < minGap) return cb(new Error('Çok hızlı maç bildirimi.'));
    var gold = 0, xp = 0, lines = [], lu = null;
    for (var i = 0; i < hands; i++) { var r = Economy.settleTraining(p, { ranks: [1, 2, 3, 4], me: 0, humans: 1 }, now); gold += r.gold; xp += r.xp; if (r.levelUp) lu = r.levelUp; lines = lines.concat(r.lines); }
    p.lastResult = now;
    put(p, function (e2) { if (e2) return cb(e2); cb(null, { reward: { handXp: xp, coins: gold, levelUp: lu, lines: lines, training: true }, player: publicView(p) }); });
  });
}
var routes = []; // ek modüller (kıraathane vb.): {prefix, fn(url, body, cb)}
function route(prefix, fn) { routes.push({ prefix: prefix, fn: fn }); }
// HTTP: POST /api/... JSON gövde
function handleHttp(req, res, url) {
  if (url.indexOf('/api/') !== 0) return false;
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return true; }
  var chunks = [], size = 0;
  req.on('data', function (c) { size += c.length; if (size > 20000) { req.destroy(); return; } chunks.push(c); });
  req.on('end', function () {
    var body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) {}
    var done = function (e, out) {
      res.writeHead(e ? 400 : 200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(e ? { error: e.message } : out));
    };
    var fn = { '/api/guest': create, '/api/me': me, '/api/bonus': bonus, '/api/buy': buy, '/api/result': result, '/api/tutorial': tutorial, '/api/skinuse': skinUse }[url];
    if (!fn) { for (var i = 0; i < routes.length; i++) if (url.indexOf(routes[i].prefix) === 0) { try { routes[i].fn(url, body, done); } catch (ex) { done(ex); } return; } res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"yok"}'); return; }
    fn(body, done);
  });
  return true;
}
function introCount(p) { var n = 0; Object.keys(catalog).forEach(function (id) { var c = catalog[id]; if (c.cat === 'intro' && p.owned.indexOf(id) >= 0) n++; }); return n; } // Çaktırmadan Bak hakkı: sahip olunan Masa Giriş Skini sayısı (5 Ekim 2026 kararı)
function ownsIntro(p, val) { return Object.keys(catalog).some(function (id) { var c = catalog[id]; return c.cat === 'intro' && c.val === val && p.owned.indexOf(id) >= 0; }); }
module.exports = { cleanCosmetics: cleanCosmetics, cleanAvatar: cleanAvatar, ensureSkinGift: ensureSkinGift, freeLeft: freeLeft, useFreeSkin: useFreeSkin, skinIds: skinIds, init: init, handleHttp: handleHttp, route: route, save: put, db: function () { return DB; }, auth: auth, ownsIntro: ownsIntro, introCount: introCount, grant: grant, releaseEscrows: releaseEscrows, levelOf: levelOf, publicView: publicView, Economy: Economy, modeName: function () { return mode; }, count: function (cb) { if (DB) DB.query('SELECT count(*)::int AS n FROM players').then(function (r) { cb(r.rows[0].n); }).catch(function () { cb(-1); }); else cb(Object.keys(mem).length); } };
