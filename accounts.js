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
      .then(function () { return DB.query('CREATE TABLE IF NOT EXISTS match_log (id SERIAL PRIMARY KEY, at TIMESTAMPTZ DEFAULT now(), data JSONB NOT NULL)'); }) // v9.76 ölçüm: el/maç kayıtları
      .then(function () { mode = 'postgres'; wipeIfRequested(function () { cb(null, mode); }); })
      .catch(function (e) { DB = null; fileMode(cb, e.message); });
  } else fileMode(cb, null);
}
function fileMode(cb, why) {
  mode = 'dosya';
  wipeIfRequested(function () {
    try { mem = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { mem = {}; }
    cb(why ? new Error(why) : null, mode);
  });
}
// ---- v9.87.1 sıfırlama (SIFIRLA ortam değişkeni): açılışta bütün oyuncular, kıraathaneler, süren maçlar ve ölçüm kayıtları BİR KEZ silinir.
// Yapılan sıfırlamanın değeri meta tablosuna (dosya modunda data/meta.json) yazılır; aynı değerle sonraki açılışlarda tekrar silinmez.
// Yeni bir sıfırlama için değeri değiştirmek yeter (ör. tarih). Değişken yoksa hiçbir şey yapılmaz. Cihazlardaki eski misafir hesapları
// "Hesap bulunamadı" alır ve uygulama kendiliğinden yeni misafir hesabı açar. ----
var META_FILE = path.join(__dirname, 'data', 'meta.json'), WIPE_TAG = String(process.env.SIFIRLA || '').trim().slice(0, 60), lastWipe = null;
var SQL_PLAYERS = 'CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now())';
var SQL_MATCHLOG = 'CREATE TABLE IF NOT EXISTS match_log (id SERIAL PRIMARY KEY, at TIMESTAMPTZ DEFAULT now(), data JSONB NOT NULL)';
function readMeta(cb) {
  if (DB) { DB.query('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)').then(function () { return DB.query("SELECT v FROM meta WHERE k='sifirla'"); }).then(function (r) { cb(null, r.rows[0] ? r.rows[0].v : null); }).catch(function (e) { cb(e); }); return; }
  var m = {}; try { m = JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch (e) {} cb(null, m.sifirla || null);
}
function writeMeta(v, cb) {
  if (DB) { DB.query("INSERT INTO meta (k, v) VALUES ('sifirla', $1) ON CONFLICT (k) DO UPDATE SET v=$1", [v]).then(function () { cb(null); }).catch(function (e) { cb(e); }); return; }
  var m = {}; try { m = JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch (e) {} m.sifirla = v;
  try { fs.mkdirSync(path.dirname(META_FILE), { recursive: true }); fs.writeFileSync(META_FILE, JSON.stringify(m)); cb(null); } catch (e) { cb(e); }
}
function wipeIfRequested(cb) {
  readMeta(function (e, done) {
    if (e) { console.log('sıfırlama işareti okunamadı: ' + e.message); return cb(); }
    lastWipe = done || null;
    if (!WIPE_TAG) return cb();
    if (done === WIPE_TAG) { console.log('sıfırlama daha önce yapılmış (SIFIRLA=' + WIPE_TAG + '); veriler korunuyor'); return cb(); }
    var fin = function (err) {
      if (err) { console.log('SIFIRLAMA BAŞARISIZ: ' + err.message + ' — veriler olduğu gibi kaldı'); return cb(); }
      writeMeta(WIPE_TAG, function (e2) { if (e2) console.log('sıfırlama işareti yazılamadı: ' + e2.message); lastWipe = WIPE_TAG; mem = {}; mcount = { hands: 0, matches: 0 }; mcountReady = false; console.log('SIFIRLAMA YAPILDI (SIFIRLA=' + WIPE_TAG + '): bütün oyuncu hesapları, kıraathaneler, süren maçlar ve ölçüm kayıtları silindi'); cb(); });
    };
    if (DB) { DB.query('DROP TABLE IF EXISTS players, venues, rooms, match_log').then(function () { return DB.query(SQL_PLAYERS); }).then(function () { return DB.query(SQL_MATCHLOG); }).then(function () { fin(null); }).catch(fin); return; }
    try { ['players.json', 'venues.json', 'rooms.json', 'rooms.json.tmp', 'matches.jsonl'].forEach(function (f) { try { fs.unlinkSync(path.join(__dirname, 'data', f)); } catch (e) {} }); fin(null); } catch (ex) { fin(ex); }
  });
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
// v9.86 hesap kilidi: aynı hesabın oku → değiştir → yaz işlemleri sırayla yürür. Postgres modunda her okuma ayrı bir kopya
// döndürdüğü için aynı anda çalışan iki işlemden birinin yazdığı silinebiliyordu (ör. bahisli maç sonunda havuz payı ile el ödülü).
// Dosya modunda okuma/yazma zaten anlık: davranış değişmez. LOCK_MAX_MS: takılan bir veritabanı işlemi kuyruğu sonsuza dek tutmasın.
var locks = {}, LOCK_MAX_MS = 10000;
function withLock(id, task) { // task(release): işin sonunda (yazma bittikten sonra) release() bir kez çağrılır
  if (!id || typeof id !== 'string') return task(function () {});
  var q = locks[id] || (locks[id] = []); q.push(task); if (q.length === 1) runLock(id, q);
}
function runLock(id, q) {
  var task = q[0], done = false, guard = null;
  var release = function () { if (done) return; done = true; clearTimeout(guard); q.shift(); if (q.length) setImmediate(function () { runLock(id, q); }); else if (locks[id] === q) delete locks[id]; };
  guard = setTimeout(function () { console.log('hesap kilidi süre aşımı: ' + id); release(); }, LOCK_MAX_MS);
  try { task(release); } catch (e) { release(); throw e; }
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
  Object.keys(catalog).forEach(function (id) { var c = catalog[id]; if (!c || !c.k || c.cat === 'intro' || c.cat === 'tiles' || c.cat === 'theme' || c.cat === 'uses') return; if (av[c.k] === c.val && !c.free && (c.price || 0) > 0 && p.owned.indexOf(id) < 0) av[c.k] = SLOT_DEFAULT[c.k] || 'yok'; });
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
  return { id: p.id, name: p.name, avatar: p.avatar, coins: p.coins, xp: p.xp, level: lv.level, xpInto: lv.into, xpNeed: lv.need, owned: p.owned, stats: p.stats, econ: ec, bonusReady: !ec.login, bonusIn: ec.login ? Math.max(0, ec.nextDayAt - now) : 0, tutorialRewarded: !!p.tutorialRewarded, mode: mode, economyVersion: Economy.CONFIG.version, freeSkins: p.freeSkins || {}, skinGiftNew: !!p.skinGiftNew, arenas: (p.arenas || ['koy']).slice(), league: Economy.leagueSummary(p, now), skinUses: p.skinUses || {}, grants: Economy.charGrants(p.owned) }; // skinUses/grants (v9.88): satın alınmış kullanım hakları, karakter sahipliğiyle ücretsiz skinler // arenas (v9.86): açılmış mekânlar · league (v9.87): bu sezonun Döngü Puanı özeti
}
function takeView(p) { var v = publicView(p); if (p.skinGiftNew) { delete p.skinGiftNew; return { view: v, dirty: true }; } return { view: v, dirty: false }; } // hoş geldin bildirimi bir kez: bayrak ilk görünümle düşer (kayıt çağıranın tek yazmasıyla)
function create(body, cb) {
  var p = { id: newId(), token: newToken(), name: cleanName(body.name), avatar: cleanAvatar(body.avatar), coins: START_COINS, xp: 0, owned: [], lastBonus: 0, stats: { hands: 0, matches: 0, wins: 0 }, created: Date.now(), lastSeen: Date.now() };
  // cihazdaki eski dolap (prototipten geçiş): yalnızca ücretsiz ya da zaten var olan ürünler aktarılır, jeton aktarılmaz
  if (Array.isArray(body.owned)) body.owned.slice(0, 60).forEach(function (id) { var c = catalog[id]; if (typeof id === 'string' && c && (c.free || !c.price) && p.owned.indexOf(id) < 0) p.owned.push(id); });
  p.charMig = 1; // v9.88: yeni hesap ücretsiz dönemi görmedi; geçiş temizliği uygulanmaz (ilk /api/me satın alınmış karakteri silmesin)
  ensureSkinGift(p); Economy.syncArenas(p);
  var tv = takeView(p);
  put(p, function (e) { if (e) return cb(e); cb(null, { id: p.id, token: p.token, player: tv.view }); });
}
function auth(body, cb) { // id + token doğrulaması
  get(body && body.id, function (e, p) {
    if (e) return cb(e);
    if (!p || !body.token || p.token !== body.token) return cb(new Error('Hesap bulunamadı; yeniden giriş gerekli.'), null);
    cb(null, p);
  });
}
// HTTP uçları için: hesap kilidi altında doğrula → work(p, finish); finish(hata, sonuç, yaz) — yaz=true ise kayıt bitince yanıt döner, kilit sonra açılır
function lockedAuth(body, cb, work) {
  withLock(body && body.id, function (release) {
    auth(body, function (e, p) {
      if (e) { release(); return cb(e); }
      var fin = function (err, out, save) {
        if (err || !save) { release(); return cb(err || null, out); }
        put(p, function (e2) { release(); if (e2) return cb(e2); cb(null, typeof out === 'function' ? out() : out); });
      };
      try { work(p, fin); } catch (ex) { release(); cb(ex); }
    });
  });
}
function me(body, cb) {
  lockedAuth(body, cb, function (p, fin) {
    var changed = ensureSkinGift(p); // eski hesaplar da ilk girişte bir kez alır (yalnız bir kerelik hak; alımlar değişmez)
    if (!p.charMig) { p.charMig = 1; changed = true; Economy.CONFIG.characters.forEach(function (c) { var i = p.owned.indexOf(c.id); if (i >= 0) p.owned.splice(i, 1); }); } // v9.88 geçişi (bir kez): özel karakterler ücretsiz dönemde dolaba 0 altınla girmişti; artık satın alınır (altın + seviye). Giyiliyse cleanCosmetics kendi karaktere döndürür.
    var hadArenas = !!p.arenas; if (Economy.syncArenas(p).length || !hadArenas) changed = true; // v9.86: koşulu sağlanan mekânlar hesaba yazılır (eski hesap: ilk girişte)
    if (body.name) { var n = cleanName(body.name); if (n !== p.name) { p.name = n; changed = true; } }
    if (body.avatar) { p.avatar = cleanCosmetics(p, cleanAvatar(body.avatar)); changed = true;
      if (p.avatar && p.avatar.intro) { // Masa Giriş Skini: yalnızca sahip olunan kuşanılabilir (deneme hakkı koltuğa oturulurken ayrıca değerlendirilir)
        var okIntro = ownsIntro(p, p.avatar.intro); // v9.88: karakter sahipliğiyle açılan skin de kuşanılabilir
        if (!okIntro) delete p.avatar.intro;
      }
    }
    var tv = takeView(p);
    fin(null, tv.view, changed || tv.dirty);
  });
}
function skinUse(body, cb) { // bot masasında (istemci tarafı antrenman maçı) ücretsiz skin kullanımı: hesaptan 1 düşer; çevrim içi masada sunucu kendisi düşer
  lockedAuth(body, cb, function (p, fin) {
    var id = String(body.skin || ''); if (skinIds().indexOf(id) < 0) return fin(new Error('Bilinmeyen skin.')); // v9.88: skin kimliği body.skin (body.id hesap kimliğidir; eski istemci ikisini karıştırıyordu, istek hiç geçmiyordu)
    ensureSkinGift(p);
    if (body.paid) { // v9.88: satın alınmış kullanım hakkı (bot masasında istemci bildirir; çevrim içi masada sunucu kendisi düşer)
      if (!usePaidSkin(p, id)) return fin(new Error('Bu skin için satın alınmış kullanım hakkın yok.'));
      var tv2 = takeView(p); return fin(null, { player: tv2.view, left: paidLeft(p, id), paid: true }, true);
    }
    if (!useFreeSkin(p, id)) return fin(new Error('Bu skin için ücretsiz kullanım hakkın kalmadı.'));
    var tv = takeView(p);
    fin(null, { player: tv.view, left: freeLeft(p, id) }, true);
  });
}
function bonus(body, cb) { // günlük giriş ödülü (UTC günü başına bir kez)
  lockedAuth(body, cb, function (p, fin) {
    var r = Economy.loginReward(p, Date.now());
    if (!r) return fin(new Error('Günlük giriş ödülü bugün alındı; yarın (03.00) yenilenir.'));
    fin(null, function () { return { amount: r.gold, player: publicView(p) }; }, true);
  });
}
function tutorial(body, cb) { // eğitimi ilk tamamlama ödülü (bir kez)
  lockedAuth(body, cb, function (p, fin) {
    var r = Economy.tutorialReward(p, Date.now());
    fin(null, function () { return { reward: r, already: !r, player: publicView(p) }; }, true);
  });
}
function buy(body, cb) {
  lockedAuth(body, cb, function (p, fin) {
    var c = catalog[body.item]; if (!c) return fin(new Error('Ürün bulunamadı.'));
    var tx = typeof body.tx === 'string' ? body.tx.slice(0, 40) : ''; // v9.88: işlem kimliği — çift dokunma / yanıt kaybolup yeniden deneme ikinci tahsilat yapmaz
    if (tx && (p.txs || []).indexOf(tx) >= 0) return fin(null, { player: publicView(p), repeated: true });
    var pack = Economy.skinUseItem(c.id);
    if (pack) { // tüketilebilir kullanım paketi: sahiplik yok, tekrar alınabilir; hesaba kullanım eklenir
      if (p.coins < (c.price || 0)) return fin(new Error('Yeterli altın yok.'));
      p.coins -= (c.price || 0); p.skinUses = p.skinUses || {}; p.skinUses[pack.skin] = (p.skinUses[pack.skin] || 0) + pack.uses;
      if (tx) p.txs = (p.txs || []).concat([tx]).slice(-20);
      return fin(null, function () { return { player: publicView(p), uses: p.skinUses[pack.skin] }; }, true);
    }
    if (p.owned.indexOf(c.id) >= 0) return fin(null, { player: publicView(p), already: true });
    var needLv = Economy.itemLevel(c.id), myLv = levelOf(p.xp).level; if (needLv && myLv < needLv) return fin(new Error(c.name + ' seviye ' + needLv + ' olunca açılır (sen: seviye ' + myLv + ').')); // v9.86: seviyeyle açılan kostüm
    var price = c.free ? 0 : (c.price || 0);
    if (p.coins < price) return fin(new Error('Yeterli jeton yok.'));
    p.coins -= price; p.owned.push(c.id); if (tx) p.txs = (p.txs || []).concat([tx]).slice(-20); if (Economy.charOf(c.id)) p.charMig = 1; // v9.88: satın alınmış karakteri geçiş temizliği asla silmez
    fin(null, function () { return { player: publicView(p) }; }, true);
  });
}
function grant(acc, fn, cb) { // sunucu içi: oyuncuyu doğrula (id+token), fn ile değiştir (Economy.* çağrıları fn içinde), kaydet; fn hata atarsa kayıt değişmez. v9.86: hesap kilidi altında
  withLock(acc && acc.id, function (release) {
    auth(acc, function (e, p) {
      if (e || !p) { release(); return cb && cb(e || new Error('yok')); }
      var out; try { out = fn(p) || {}; } catch (ex) { release(); return cb && cb(ex); }
      put(p, function (e2) { release(); cb && cb(e2, out, publicView(p)); });
    });
  });
}
function releaseEscrows(cb, keep) { // sunucu açılışı: yarım kalan emanetler iade edilir (v9.85: keep — kayıttan geri yüklenen ya da süren masada oturan hesaplar — hariç). v9.86: her hesap kilit altında yeniden okunur
  var n = 0; keep = keep || {};
  var refund = function (ids) {
    var left = ids.length; if (!left) return cb && cb(0);
    ids.forEach(function (id) {
      withLock(id, function (release) {
        get(id, function (e, p) {
          var fin = function () { release(); if (--left === 0) cb && cb(n); };
          if (e || !p || !p.escrow || keep[id]) return fin();
          p.coins = (p.coins || 0) + p.escrow.amount; delete p.escrow; n++; put(p, fin);
        });
      });
    });
  };
  if (DB) { DB.query("SELECT data->>'id' AS id FROM players WHERE data ? 'escrow'").then(function (r) { refund(r.rows.map(function (x) { return x.id; }).filter(function (id) { return id && !keep[id]; })); }).catch(function () { cb && cb(-1); }); return; }
  refund(Object.keys(mem).filter(function (id) { var p = mem[id]; return p && p.escrow && !keep[id]; }));
}
function result(body, cb) { // botlara karşı tek oyuncu (antrenman) sonucu: istemci bildirir; her el için antrenman ödülü (günde ilk 5), sıralama bonusu yok
  lockedAuth(body, cb, function (p, fin) {
    var hands = Math.min(12, Math.max(1, parseInt(body.hands) || 1)), now = Date.now();
    var minGap = hands * RESULT_GAP; // el başına en az 30 sn geçmiş olmalı (hızlı sahte bildirim engeli)
    if (now - (p.lastResult || 0) < minGap) return fin(new Error('Çok hızlı maç bildirimi.'));
    var gold = 0, xp = 0, lines = [], lu = null;
    for (var i = 0; i < hands; i++) { var r = Economy.settleTraining(p, { ranks: [1, 2, 3, 4], me: 0, humans: 1 }, now); gold += r.gold; xp += r.xp; if (r.levelUp) lu = r.levelUp; lines = lines.concat(r.lines); }
    p.lastResult = now;
    fin(null, function () { return { reward: { handXp: xp, coins: gold, levelUp: lu, lines: lines, training: true }, player: publicView(p) }; }, true);
  });
}
// ---- v9.87 lig (K108): liderlik tablosu. Bu sezon en az bir lig maçı olan hesaplar; 20 sn önbellek (lig maçı bitince sunucu tazeler).
// Yanıtta hesap kimliği yok (yalnız ad, seviye, puan); istek sahibinin satırı "me" ile işaretlenir. ----
var LB_TTL = parseInt(process.env.LEAGUE_CACHE_MS) || 20000, lbCache = { at: 0, season: null, rows: null, prev: null, prevSeason: null };
function leagueChanged() { lbCache.at = 0; }
function leagueRows(cb) {
  var now = Date.now(), sk = Economy.seasonKey(now), pk = Economy.prevSeasonKey(now);
  if (lbCache.rows && lbCache.season === sk && now - lbCache.at < LB_TTL) return cb(null, lbCache);
  var build = function (list) {
    var cur = [], prev = [];
    list.forEach(function (x) {
      var L = x.league; if (!L || typeof L !== 'object') return;
      if (L.season === sk && L.matches > 0) cur.push({ id: x.id, name: x.name || 'Oyuncu', level: levelOf(x.xp).level, points: L.points || 0, matches: L.matches || 0, wins: L.wins || 0 });
      var pe = L.season === pk ? L : (L.past || []).filter(function (q) { return q && q.season === pk; })[0];
      if (pe && pe.matches > 0) prev.push({ id: x.id, name: x.name || 'Oyuncu', points: pe.points || 0, matches: pe.matches || 0, wins: pe.wins || 0 });
    });
    var cmp = function (a, b) { return (b.points - a.points) || (b.wins - a.wins) || (a.matches - b.matches) || String(a.name).localeCompare(String(b.name), 'tr'); };
    cur.sort(cmp); prev.sort(cmp);
    lbCache = { at: now, season: sk, prevSeason: pk, rows: cur, prev: prev };
    cb(null, lbCache);
  };
  if (DB) DB.query("SELECT data->>'id' AS id, data->>'name' AS name, data->>'xp' AS xp, data->'league' AS league FROM players WHERE data ? 'league'").then(function (r) { build(r.rows.map(function (x) { var L = x.league; if (typeof L === 'string') { try { L = JSON.parse(L); } catch (e) { L = null; } } return { id: x.id, name: x.name, xp: +x.xp || 0, league: L }; })); }).catch(function (e) { cb(e); });
  else build(Object.keys(mem).map(function (k) { return mem[k]; }).filter(function (p) { return p && p.league; }));
}
function leaderboard(body, cb) { // POST /api/lig {id, token}: bu sezonun ilk 50'si + isteyenin sırası + geçen sezonun ilk 3'ü
  leagueRows(function (e, lb) {
    if (e) return cb(e);
    var now = Date.now(), C = Economy.CONFIG.league;
    var finish = function (myId) {
      var top = lb.rows.slice(0, C.top).map(function (x, i) { var o = { rank: i + 1, name: x.name, level: x.level, points: x.points, matches: x.matches, wins: x.wins }; if (myId && x.id === myId) o.me = true; return o; });
      var mine = null; if (myId) for (var i = 0; i < lb.rows.length; i++) if (lb.rows[i].id === myId) { var m = lb.rows[i]; mine = { rank: i + 1, points: m.points, matches: m.matches, wins: m.wins }; break; }
      var prev = lb.prev.length ? { season: lb.prevSeason, label: Economy.seasonLabel(lb.prevSeason), total: lb.prev.length, top: lb.prev.slice(0, 3).map(function (x, i) { var o = { rank: i + 1, name: x.name, points: x.points, matches: x.matches }; if (myId && x.id === myId) o.me = true; return o; }) } : null;
      cb(null, { season: lb.season, label: Economy.seasonLabel(lb.season), endsAt: Economy.seasonEndsAt(now), total: lb.rows.length, top: top, me: mine, prev: prev });
    };
    if (body && body.id && body.token) auth(body, function (e2, p) { finish(!e2 && p ? p.id : null); }); else finish(null);
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
    var fn = { '/api/guest': create, '/api/me': me, '/api/bonus': bonus, '/api/buy': buy, '/api/result': result, '/api/tutorial': tutorial, '/api/skinuse': skinUse, '/api/lig': leaderboard }[url];
    if (!fn) { for (var i = 0; i < routes.length; i++) if (url.indexOf(routes[i].prefix) === 0) { try { routes[i].fn(url, body, done); } catch (ex) { done(ex); } return; } res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"yok"}'); return; }
    fn(body, done);
  });
  return true;
}
// ---- Maç kaydı (v9.76 ölçüm): el başına ve maç başına bir satır; dosya modunda data/matches.jsonl, Postgres'te match_log. Kişisel veri yok (hesap kimliği yazılmaz). ----
var MLOG = path.join(__dirname, 'data', 'matches.jsonl'), mcount = { hands: 0, matches: 0 }, mcountReady = false;
function logMatch(rec, cb) {
  rec.at = new Date().toISOString();
  if (rec.k === 'hand') mcount.hands++; else if (rec.k === 'match') mcount.matches++;
  if (DB) { DB.query('INSERT INTO match_log (data) VALUES ($1)', [JSON.stringify(rec)]).then(function () { cb && cb(null); }).catch(function (e) { cb && cb(e); }); return; }
  try { fs.mkdirSync(path.dirname(MLOG), { recursive: true }); fs.appendFile(MLOG, JSON.stringify(rec) + '\n', function (e) { cb && cb(e || null); }); } catch (e) { cb && cb(e); }
}
function matchCounts(cb) { // /durum için: el ve maç sayısı
  if (mcountReady) { cb(mcount); return; }
  var fin = function () { mcountReady = true; cb(mcount); };
  if (DB) { DB.query("SELECT count(*) FILTER (WHERE data->>'k' = 'hand')::int AS h, count(*) FILTER (WHERE data->>'k' = 'match')::int AS m FROM match_log").then(function (r) { mcount = { hands: r.rows[0].h, matches: r.rows[0].m }; fin(); }).catch(function () { fin(); }); return; }
  try { var lines = fs.readFileSync(MLOG, 'utf8').split('\n'); var h = 0, m = 0; lines.forEach(function (l) { if (l.indexOf('"k":"hand"') >= 0) h++; else if (l.indexOf('"k":"match"') >= 0) m++; }); mcount = { hands: h, matches: m }; } catch (e) {}
  fin();
}
function matchRecords(limit, cb) { // son kayıtlar (özet için); en çok limit satır
  if (DB) { DB.query('SELECT data FROM match_log ORDER BY id DESC LIMIT $1', [limit]).then(function (r) { cb(null, r.rows.map(function (x) { return typeof x.data === 'string' ? JSON.parse(x.data) : x.data; })); }).catch(function (e) { cb(e, []); }); return; }
  try { var lines = fs.readFileSync(MLOG, 'utf8').trim().split('\n'); var out = []; for (var i = lines.length - 1; i >= 0 && out.length < limit; i--) { try { out.push(JSON.parse(lines[i])); } catch (e) {} } cb(null, out); } catch (e) { cb(null, []); }
}
function matchSummary(cb) { // /olcum: görev başına açılma, el uzunluğu, bitiş türleri, çarpanlar; maç tamamlama ve rövanş oranı
  matchRecords(5000, function (e, recs) {
    var byTask = {}, tot = { hands: 0, matches: 0, matchesFinished: 0, rematches: 0, leagueMatches: 0, humansHands: 0, leftHands: 0, afkHands: 0 };
    recs.forEach(function (r) {
      if (r.k === 'match') { tot.matches++; if (r.finished) tot.matchesFinished++; if (r.rematch) tot.rematches++; if (r.league) tot.leagueMatches++; return; }
      if (r.k !== 'hand') return; tot.hands++;
      var t = byTask[r.task] || (byTask[r.task] = { hands: 0, openedN: 0, openRound: 0, openRoundN: 0, turns: 0, secs: 0, finish: {}, mult2: 0, mult4: 0, deckOut: 0 });
      t.hands++; t.openedN += r.openedN || 0; (r.openRounds || []).forEach(function (x) { t.openRound += x; t.openRoundN++; }); t.turns += r.turns || 0; t.secs += r.secs || 0;
      var f = (r.finish || '').split(' — ').pop().replace(/\s*\(.*$/, ''); /* "Mehmet bitirdi — Normal bitiş" → "Normal bitiş" */ t.finish[f] = (t.finish[f] || 0) + 1; if (r.mult === 2) t.mult2++; if (r.mult === 4) t.mult4++; if (r.winnerSeat == null) t.deckOut++;
      if (r.humans >= 2) tot.humansHands++; if (r.leftN) tot.leftHands++; if (r.afkActs) tot.afkHands++;
    });
    var out = { toplam: tot, gorevler: {} };
    Object.keys(byTask).forEach(function (k) { var t = byTask[k]; out.gorevler[k] = { el: t.hands, acilanOyuncuOrt: +(t.openedN / t.hands).toFixed(2), acilmaDevriOrt: t.openRoundN ? +(t.openRound / t.openRoundN).toFixed(1) : null, elTurOrt: +(t.turns / t.hands).toFixed(1), elSnOrt: Math.round(t.secs / t.hands), x2: t.mult2, x4: t.mult4, desteBitti: t.deckOut, bitis: t.finish }; });
    cb(null, out);
  });
}
function ownedIntroVals(p) { var g = Economy.charGrants(p.owned || []), vals = g.intros.slice(); Object.keys(catalog).forEach(function (id) { var c = catalog[id]; if (c.cat === 'intro' && p.owned.indexOf(id) >= 0 && vals.indexOf(c.val) < 0) vals.push(c.val); }); return vals; } // sahip olunan + karakterle açılan Masa Giriş Skinleri (v9.88)
function introCount(p) { return Economy.bakCharges(ownedIntroVals(p).length, p.owned || []); } // Çaktırmadan Bak el hakkı: sahip olunan/karakterle açılan Masa Giriş Skini sayısı, en çok 5; allSkins karakteri → en çok (K5 + K110)
function paidLeft(p, id) { return (p && p.skinUses && p.skinUses[id]) || 0; }
function usePaidSkin(p, id) { if (!(paidLeft(p, id) > 0)) return false; p.skinUses[id]--; return true; }
function ownsIntro(p, val) { return ownedIntroVals(p).indexOf(val) >= 0; } // satın alınmış ya da karakter sahipliğiyle açılmış
module.exports = { lastWipe: function () { return lastWipe; }, withLock: withLock, leagueChanged: leagueChanged, leaderboard: leaderboard, logMatch: logMatch, matchCounts: matchCounts, matchSummary: matchSummary, cleanCosmetics: cleanCosmetics, cleanAvatar: cleanAvatar, ensureSkinGift: ensureSkinGift, freeLeft: freeLeft, useFreeSkin: useFreeSkin, skinIds: skinIds, init: init, handleHttp: handleHttp, route: route, save: put, db: function () { return DB; }, auth: auth, ownsIntro: ownsIntro, introCount: introCount, paidLeft: paidLeft, usePaidSkin: usePaidSkin, grant: grant, releaseEscrows: releaseEscrows, levelOf: levelOf, publicView: publicView, Economy: Economy, modeName: function () { return mode; }, count: function (cb) { if (DB) DB.query('SELECT count(*)::int AS n FROM players').then(function (r) { cb(r.rows[0].n); }).catch(function () { cb(-1); }); else cb(Object.keys(mem).length); } };
