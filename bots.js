// Döngü — gizli botlar (v10.09, K171). Hızlı Katıl masalarında (sosyal ve bahisli) boş koltuklara oturan botlar gerçek oyuncu gibi görünür:
// kalıcı bir "bot hesabı" (players tablosunda data.bot = true) — ad, karakter görünümü, seviye, maç/galibiyet sayısı. Profil kartı, arkadaş isteği
// ve şikâyet gerçek hesap gibi çalışır (istek hiç kabul edilmez). Botlar hiçbir ödül, lig puanı, altın almaz; liderlik tablosunda yer almaz.
// Arkadaş odası ("Botla başlat") ve kıraathane masasındaki açık botlar (Ali, Ayşe, Mehmet) ile bota karşı masa değişmedi.
'use strict';
var crypto = require('crypto');
var Accounts = null, Economy = null;
var POOL_MIN = 72;          // açılışta en az bu kadar bot hesabı (eksikse oluşturulur)
var pool = [];              // yüklenmiş bot hesapları (kopya; kalıcı kayıt Accounts'ta)
var ready = false;
var WEAK = 0.3; // bahisli masada zayıflık (0 normal … 1 en zayıf). Benzetim (6 El, 300 maç): normal güçte oyuncu %33 birinci, beklenen net +%13 giriş; 12 El +%6, 1 El ≈ 0 — 1,0'da %63 birinci ve +%87 (altın musluğu) olduğu için düşük tutuldu

var MALE = ['Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'İsmail', 'Osman', 'Yusuf', 'Murat', 'Ömer', 'Ramazan', 'Halil', 'Süleyman', 'Mahmut', 'Recep', 'Salih', 'Fatih', 'Kadir', 'Emre', 'Burak', 'Serkan', 'Hakan', 'Kemal', 'Erkan', 'Cengiz', 'Tuncay', 'Levent', 'Selim', 'Kerem', 'Can', 'Mert', 'Onur', 'Volkan', 'Orhan', 'Erdal', 'Sinan', 'Yasin', 'Cem', 'Barış', 'Tolga', 'Uğur', 'Gökhan', 'Ercan', 'Rıza', 'Nihat', 'Bayram', 'Ferhat', 'Sedat', 'Ufuk', 'Taner', 'Metin', 'Şükrü', 'Necati', 'Adem', 'Coşkun', 'Erol', 'Zafer', 'Yılmaz'];
var FEMALE = ['Ayşe', 'Fatma', 'Emine', 'Hatice', 'Zeynep', 'Elif', 'Meryem', 'Zehra', 'Sultan', 'Hanife', 'Merve', 'Özlem', 'Esra', 'Derya', 'Selin', 'Gül', 'Sevgi', 'Yasemin', 'Hülya', 'Filiz', 'Nur', 'Büşra', 'Ebru', 'Tuğba', 'Pınar', 'Aslı', 'Burcu', 'Gamze', 'Songül', 'Nermin', 'Sibel', 'Aysel', 'Leyla', 'Nesrin', 'Dilek', 'Serap', 'Gülay', 'Melek', 'Şule', 'Canan'];
var NICK_M = ['Okeyci', 'Usta', 'Taşçı', 'Kahveci', 'Reis', 'Kaptan', 'Hoca', 'Abi'];
var NICK_F = ['Okeyci', 'Abla', 'Hanım', 'Teyze'];
var SKINS = ['#f0c8a8', '#d7906f', '#d7906f', '#c07a55', '#c07a55', '#9a5f3c', '#7a4628', '#55301a'];
var HAIRC = ['#2a1c13', '#2a1c13', '#4b2e1a', '#4b2e1a', '#7a4a24', '#b3772e', '#d8b56a', '#8e2f24', '#9aa0ab', '#e8e2d6'];
// ücretli parçalar (katalog kimliği → avatar yuvası ve değeri); botun giydiği ücretli parça "sahip olunan" listesine de yazılır (profil kartı tutarlı olsun)
var PAID = {
  hair: [['h_dalgali', 'dalgali'], ['h_uzun', 'uzun'], ['dg24_sac-kivilcim-dalga', 'sac-kivilcim-dalga'], ['dg24_sac-bulut-bukle', 'sac-bulut-bukle'], ['dg24_sac-ayin-kesimi', 'sac-ayin-kesimi'], ['dg24_sac-orgu-taci', 'sac-orgu-taci'], ['dg24_sac-ruzgar-dugumu', 'sac-ruzgar-dugumu'], ['dg24_sac-girdap-topuz', 'sac-girdap-topuz']],
  beard: [['b_gur', 'gur'], ['dg24_sakal-kaptan-capa', 'sakal-kaptan-capa'], ['dg24_sakal-cene-hatti', 'sakal-cene-hatti']],
  moustache: [['dg24_biyik-kivrik-usta', 'biyik-kivrik-usta'], ['dg24_biyik-ince-imza', 'biyik-ince-imza']],
  outfit: [['o_deri', 'deri-ceket'], ['o_kapusonlu', 'kapusonlu'], ['dg24_ust-gunes-dikisi', 'ust-gunes-dikisi'], ['dg24_ust-gece-kimono', 'ust-gece-kimono'], ['dg24_ust-nane-atolye', 'ust-nane-atolye'], ['dg24_ust-mercan-ritim', 'ust-mercan-ritim']],
  pants: [['dg24_alt-duman-pile', 'alt-duman-pile'], ['dg24_alt-kanyon-kargo', 'alt-kanyon-kargo'], ['dg24_alt-gece-mozaik', 'alt-gece-mozaik'], ['dg24_alt-erik-akis', 'alt-erik-akis']],
  headwear: [['dg24_aks-erik-kasket', 'aks-erik-kasket'], ['dg24_aks-kagit-seyyah', 'aks-kagit-seyyah']],
  eyewear: [['dg24_aks-bal-petek', 'aks-bal-petek']],
  necklace: [['dg24_aks-gezgin-dugumu', 'aks-gezgin-dugumu']],
  necklaceF: [['dg24_aks-fular-lacivert', 'aks-fular-lacivert'], ['dg24_aks-fular-bordo', 'aks-fular-bordo']],
  earring: [['dg24_aks-iki-yorunge', 'aks-iki-yorunge']],
  wrist: [['dg24_aks-zaman-halkasi', 'aks-zaman-halkasi']],
  makeup: [['dg24_mak-ruj-kirmizi', 'mak-ruj-kirmizi'], ['dg24_mak-ruj-pembe', 'mak-ruj-pembe']],
  acc: [['a_pilot', 'pilotgozlugu'], ['a_bere', 'bere']]
};
var FULLS = [['c_fikret', 'fikret', 3], ['c_ordek', 'ordek', 5], ['c_pamuk', 'pamuk', 6], ['c_nine', 'nine', 8], ['c_muhtar', 'muhtar', 10], ['c_sakir', 'sakir', 12]]; // [katalog, değer, gereken seviye]

function rnd(a, b) { return a + Math.random() * (b - a); }
function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p) { return Math.random() < p; }
function lower(s) { return s.toLocaleLowerCase('tr-TR'); }
function ascii(s) { return lower(s).replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u'); }

function makeName(gender) { // gerçek oyuncu adları gibi: çoğu "Misafir 1234" (varsayılan ad), kalanı ad, ad + harf, ad + sayı, takma ad
  var first = pick(gender === 'kadin' ? FEMALE : MALE), x = Math.random(), n;
  if (x < 0.36) n = 'Misafir ' + ri(1000, 9999);
  else if (x < 0.54) n = first;
  else if (x < 0.64) n = first + ' ' + pick('ABCÇDEFGHİKLMNOÖPRSŞTUÜVYZ'.split('')) + '.';
  else if (x < 0.78) n = (chance(0.5) ? lower(first) : first) + (chance(0.5) ? ri(1, 81) : ri(60, 99));
  else if (x < 0.86) n = ascii(first) + '_' + pick(['k', 'tr', 'ist', 'izm', 'ank']) + (chance(0.4) ? ri(1, 9) : '');
  else if (x < 0.94) n = (gender === 'kadin' ? pick(NICK_F) : pick(NICK_M)) + ' ' + first;
  else n = first + ' ' + pick(gender === 'kadin' ? ['Hanım', 'Abla'] : ['Usta', 'Bey', 'Abi', 'Reis']);
  return n.slice(0, 14);
}
function levelPick(minLevel) { // çoğu düşük seviye; arena/bahisli masa için en az minLevel
  var x = Math.random(), L;
  if (x < 0.25) L = ri(1, 3); else if (x < 0.55) L = ri(4, 7); else if (x < 0.77) L = ri(8, 12); else if (x < 0.92) L = ri(13, 20); else L = ri(21, 34);
  if (minLevel && L < minLevel) L = ri(minLevel, Math.min(Economy.CONFIG.levelCap || 50, minLevel + 8));
  return L;
}
function makeAvatar(name, gender, level, owned) {
  var a = { v: 2, name: name, gender: gender, skin: pick(SKINS), hair: 'kisa', hairColor: pick(HAIRC), beard: 'yok', outfit: 'mont-mavi', acc: 'yok', full: 'yok', moustache: 'yok', pants: 'yok', headwear: 'yok', eyewear: 'yok', necklace: 'yok', earring: 'yok', wrist: 'yok', makeup: 'yok' };
  if (/^Misafir /.test(name) && chance(0.7)) { a.gender = 'erkek'; a.skin = '#d7906f'; a.hairColor = '#2a1c13'; return a; } // yeni misafir: hiç dokunulmamış varsayılan görünüm
  var wear = function (slot, list) { var it = pick(list); a[slot] = it[1]; if (owned.indexOf(it[0]) < 0) owned.push(it[0]); };
  var buyer = level >= 4 && chance(Math.min(0.85, 0.25 + level * 0.04)); // seviye arttıkça ücretli parça giyme olasılığı
  if (gender === 'kadin') { a.hair = chance(0.6) ? 'uzun' : 'kisa'; if (a.hair === 'uzun') owned.push('h_uzun'); }
  else { a.hair = chance(0.12) ? 'yok' : 'kisa'; a.beard = chance(0.45) ? 'kirli' : 'yok'; }
  if (buyer) {
    var k = ri(1, Math.min(5, 1 + Math.floor(level / 5)));
    var slots = ['hair', 'outfit', 'outfit', 'pants', 'headwear', 'eyewear', 'necklace', 'earring', 'wrist', 'acc'].concat(gender === 'kadin' ? ['makeup', 'makeup', 'necklaceF'] : ['beard', 'beard', 'moustache']);
    for (var i = 0; i < k; i++) { var s = pick(slots); if (s === 'necklaceF') wear('necklace', PAID.necklaceF); else wear(s, PAID[s]); }
    if (a.headwear !== 'yok' && a.acc === 'bere') a.acc = 'yok';
  }
  if (level >= 3 && chance(0.12)) { var f = pick(FULLS.filter(function (x) { return x[2] <= level; })); if (f) { a.full = f[1]; if (owned.indexOf(f[0]) < 0) owned.push(f[0]); } } // bazıları özel karakterle oturur
  return a;
}
function makeBot(minLevel) {
  var gender = chance(0.36) ? 'kadin' : 'erkek', name = makeName(gender), level = levelPick(minLevel), owned = [];
  var avatar = makeAvatar(name, gender, level, owned);
  var extra = ri(0, Math.floor(level / 4)); for (var i = 0; i < extra; i++) { var cat = pick(['hair', 'outfit', 'pants', 'acc']), it = pick(PAID[cat]); if (owned.indexOf(it[0]) < 0) owned.push(it[0]); }
  var xp = Economy.cumulativeXp(level) + ri(0, Math.max(0, Economy.xpNeed(level) - 1));
  var matches = Math.max(0, Math.round(level * rnd(3.5, 9) + rnd(-2, 6))), wins = Math.round(matches * rnd(0.17, 0.33));
  var now = Date.now();
  return { id: 'p_' + crypto.randomBytes(6).toString('hex'), token: crypto.randomBytes(18).toString('hex'), bot: true, name: name, avatar: avatar, xp: xp, coins: 0, owned: owned,
    stats: { matches: matches, wins: wins, hands: matches * ri(3, 8), real: matches * ri(3, 8) }, created: now - ri(1, 40) * 86400000, lastSeen: now };
}

function init(A, E, cb) {
  Accounts = A; Economy = E;
  A.listBots(function (e, list) {
    pool = (list || []).filter(function (p) { return p && p.bot && p.id; });
    var need = Math.max(0, POOL_MIN - pool.length), made = 0;
    var next = function () {
      if (made >= need) { ready = true; console.log('gizli botlar hazır: ' + pool.length + ' hesap' + (need ? ' (' + need + ' yeni)' : '')); if (cb) cb(null, pool.length); return; }
      var b = makeBot(0); pool.push(b); made++; A.save(b, function () { next(); });
    };
    next();
  });
}
function seatedIds(rooms) { var used = {}; Object.keys(rooms || {}).forEach(function (c) { (rooms[c].seats || []).forEach(function (s) { if (s && s.botId) used[s.botId] = true; }); }); return used; }
// boşta bir bot (başka masada oturmayan, isteğe göre en az seviye; aynı masadaki adlarla çakışmayan). Uygun yoksa yeni bot hesabı açılır.
function checkout(rooms, opts) {
  opts = opts || {}; var used = seatedIds(rooms), minL = opts.minLevel || 0, names = opts.names || [];
  var cands = pool.filter(function (p) { return !used[p.id] && names.indexOf(p.name) < 0 && Economy.levelOf(p.xp || 0).level >= minL; });
  var b = cands.length ? pick(cands) : null;
  if (!b) { b = makeBot(minL); pool.push(b); if (Accounts) Accounts.save(b, function () {}); }
  return b;
}
function profOf(p) {
  return { id: p.id, level: Economy.levelOf(p.xp || 0).level, matches: (p.stats && p.stats.matches) || 0, wins: (p.stats && p.stats.wins) || 0, owned: (p.owned || []).length, venue: null, venueTier: null,
    arenas: Economy.CONFIG.arenas.filter(function (a) { return Economy.arenaOpen(p, a.theme); }).length, lp: null };
}
// koltuk nesnesi: sunucu içinde bot (s.bot), dışarıya gerçek oyuncu gibi (seatInfo s.hidden'a bakar)
function seatFor(p, opts) {
  opts = opts || {};
  return { name: p.name, avatar: JSON.parse(JSON.stringify(p.avatar || {})), bot: true, hidden: true, botId: p.id, weak: opts.weak ? WEAK : 0, token: null, ws: null, prof: profOf(p), actions: [], joinedAt: Date.now() };
}
function afterMatch(botId, info) { // maç bitti: botun maç/galibiyet sayısı ve XP'si gerçek oyuncu gibi büyür (profil kartında tutarlı)
  if (!Accounts || !botId) return;
  Accounts.adminEdit(botId, function (p) {
    if (!p.bot) throw new Error('bot değil');
    p.stats = p.stats || {}; p.stats.matches = (p.stats.matches || 0) + 1; if (info && info.rank === 1) p.stats.wins = (p.stats.wins || 0) + 1;
    var hands = (info && info.hands) || 1; p.stats.hands = (p.stats.hands || 0) + hands; p.stats.real = (p.stats.real || 0) + hands;
    p.xp = (p.xp || 0) + hands * ri(30, 40);
    return {};
  }, function (e, out, p) { if (!e && p) { for (var i = 0; i < pool.length; i++) if (pool[i].id === p.id) { pool[i] = p; break; } } });
}
// insan gibi düşünme süresi (ms). kind: pickup | play | claim. Bahisli masadaki zayıf bot biraz daha yavaş değil, aynı.
function thinkMs(kind) {
  var long = chance(0.14);
  if (kind === 'claim') return Math.round(rnd(650, 1700) + (long ? rnd(400, 1400) : 0));
  if (kind === 'pickup') return Math.round(long ? rnd(2000, 3600) : rnd(700, 1900));
  return Math.round(long ? rnd(2600, 5200) : rnd(900, 2600));
}
module.exports = { init: init, checkout: checkout, seatFor: seatFor, afterMatch: afterMatch, thinkMs: thinkMs, profOf: profOf, count: function () { return pool.length; }, ready: function () { return ready; }, _makeBot: makeBot };
