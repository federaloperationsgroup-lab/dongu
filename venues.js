// Döngü — Kıraathane (oyuncunun kendi mekânı): kayıt, envanter, yerleşim, kasa, üretim, ev sahipliği ödülü.
// Depo: hesaplarla aynı (dosya data/venues.json ya da Postgres venues tablosu). Kurallar/sayılar Economy.CONFIG.venue ve VENUE_ITEMS'ta.
'use strict';

// Varsayılan mekân adı 24 karakteri aşmaz: '<ad> Kıraathanesi' sığmazsa '<ad> Kahvesi', o da sığmazsa ad kısaltılır (sessiz kesilme yok).
function defaultVenueName(n) { n = String(n || 'Misafir').trim(); var a = n + ' Kıraathanesi'; if (a.length <= 24) return a; var b = n + ' Kahvesi'; if (b.length <= 24) return b; return n.slice(0, 16).trim() + ' Kahvesi'; }
var crypto = require('crypto'), fs = require('fs'), path = require('path');
var Economy = require('./economy.js');
var Mod = require('./moderation.js'); // v10.11 (K178): ad süzgeci
var C = Economy.CONFIG.venue;

var DB = null, mem = {}, byCode = {}, FILE = path.join(__dirname, 'data', 'venues.json'), saveTimer = null, Accounts = null;
function init(opts, cb) {
  Accounts = opts.accounts; DB = opts.db || null;
  if (DB) { DB.query('CREATE TABLE IF NOT EXISTS venues (id TEXT PRIMARY KEY, code TEXT, data JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now())').then(function () { return DB.query('SELECT data FROM venues'); }).then(function (r) { r.rows.forEach(function (row) { mem[row.data.ownerId] = row.data; byCode[row.data.code] = row.data; }); fixAllNames(); cb && cb(null); }).catch(function (e) { DB = null; fileLoad(); fixAllNames(); cb && cb(e); }); return; }
  fileLoad(); fixAllNames(); cb && cb(null);
}
function fileLoad() { try { mem = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { mem = {}; } Object.keys(mem).forEach(function (k) { byCode[mem[k].code] = mem[k]; }); }
// K26 öncesi varsayılan ad 24 karakterde sessizce kesiliyordu ("Misafir 8762 Kıraathanes"): böyle bir kayıt bir kez düzeltilir ('<ad> Kahvesi' kuralıyla).
var NAME_SUFFIX = ' Kıraathanesi';
function fixLegacyName(v) {
  if (!v || v.nameFixed) return false;
  var n = String(v.name || ''); if (n.length !== 24) return false;
  for (var k = NAME_SUFFIX.length - 1; k >= 3; k--) { if (n.slice(-k) === NAME_SUFFIX.slice(0, k)) { var base = n.slice(0, 24 - k).trim(); if (base.length >= 2) { v.name = defaultVenueName(base); v.nameFixed = true; put(v); return true; } } }
  return false;
}
function fixAllNames() { Object.keys(mem).forEach(function (k) { fixLegacyName(mem[k]); }); }
function flush() { saveTimer = null; try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(mem)); } catch (e) {} }
function put(v) {
  v.updated = Date.now(); mem[v.ownerId] = v; byCode[v.code] = v;
  if (DB) DB.query('INSERT INTO venues (id, code, data, updated) VALUES ($1,$2,$3,now()) ON CONFLICT (id) DO UPDATE SET data=$3, code=$2, updated=now()', [v.ownerId, v.code, JSON.stringify(v)]).catch(function () {});
  else if (!saveTimer) saveTimer = setTimeout(flush, 500);
}
function remove(ownerId, cb) { // v10.01 (K134): hesap silinince kıraathanesi de silinir
  var v = mem[ownerId]; if (!v) return cb && cb(null, false);
  delete mem[ownerId]; if (v.code) delete byCode[v.code];
  if (DB) return DB.query('DELETE FROM venues WHERE id=$1', [ownerId]).then(function () { cb && cb(null, true); }).catch(function (e) { cb && cb(e); });
  if (!saveTimer) saveTimer = setTimeout(flush, 500); cb && cb(null, true);
}
function newCode() { var s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', c; do { c = ''; for (var i = 0; i < 5; i++) c += s[Math.floor(Math.random() * s.length)]; } while (byCode[c]); return c; }
function iid() { return 'i_' + crypto.randomBytes(4).toString('hex'); }
function ofOwner(id) { var v = mem[id] || null; if (v) migrateGrid(v); return v; }
function ofCode(code) { var v = byCode[String(code || '').toUpperCase()] || null; if (v) migrateGrid(v); return v; }

// Başlangıç yerleşimi (şablon) ortak kodda: Economy.starterLayout (10×6 oda; masa+sandalyeler+kilim bir grup, çay ocağı arka duvarda)
function starterLayout(inv) { return Economy.starterLayout(inv); }
// v9.68 oda ölçeği (12×7 → 10×6): eski kayıtlı yerleşim kendiliğinden yeni örnek düzene ÇEVRİLMEZ; yalnız yeni ızgaraya sığdırılır:
// her eşya oransal olarak yeni hücreye taşınır, çakışan/kural bozan eşya yakın boş hücreye alınır, yer bulunamazsa envantere düşer. Sahibine bir kez bildirilir (migrated).
function migrateGrid(v) {
  if (v.gridVersion === Economy.VENUE_GRID.version) return false;
  var G1 = Economy.VENUE_GRID_V1, G = Economy.VENUE_GRID, inv = v.inventory || [], byIid = {}; inv.forEach(function (it) { byIid[it.iid] = it; });
  var out = [], moved = 0, dropped = [];
  var order = (v.placements || []).slice().sort(function (a, b) { var ia = Economy.venueItem((byIid[a.iid] || {}).item) || {}, ib = Economy.venueItem((byIid[b.iid] || {}).item) || {}; var ra = ia.kind === 'table' ? 0 : ia.kind === 'station' ? 1 : ia.floor ? 3 : 2, rb = ib.kind === 'table' ? 0 : ib.kind === 'station' ? 1 : ib.floor ? 3 : 2; return ra - rb; });
  order.forEach(function (p) {
    var inv1 = byIid[p.iid], it = inv1 && Economy.venueItem(inv1.item); if (!it) return;
    var gx = Math.round(p.gx * (G.cols - 1) / (G1.cols - 1)), gy = it.wall ? 0 : Math.round(p.gy * (G.rows - 1) / (G1.rows - 1));
    var placed = false, cand = [];
    for (var r = 0; r <= 3 && !placed; r++) { for (var dy = -r; dy <= r && !placed; dy++) for (var dx = -r; dx <= r && !placed; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; var q = { iid: p.iid, gx: gx + dx, gy: it.wall ? 0 : gy + dy, rot: p.rot | 0 }; var test = out.concat([q]); if (Economy.validateLayout(test, inv).ok) { out.push(q); placed = true; if (dx || dy || q.gx !== p.gx || q.gy !== p.gy) moved++; } } }
    if (!placed) dropped.push(it.name);
  });
  v.placements = out; v.gridVersion = G.version; v.layoutVersion = (v.layoutVersion | 0) + 1;
  v.migrated = { at: Date.now(), moved: moved, dropped: dropped };
  syncStations(v); put(v); return true;
}
function create(p, body) {
  if (mem[p.id]) throw new Error('Zaten bir kıraathanen var.');
  var name = cleanName(body.name || defaultVenueName(p.name));
  var theme = ['koy', 'kahve', 'sokak', 'sanayi', 'cinar', 'soba', 'apartman', 'bag'].indexOf(body.theme) >= 0 ? body.theme : 'koy';
  var inv = Economy.VENUE_STARTER.map(function (item) { return { iid: iid(), item: item, since: Date.now() }; });
  var v = { ownerId: p.id, ownerName: p.name, code: newCode(), name: name, theme: theme, tier: 1, reputation: C.openGift.reputation, kasa: C.openGift.gold, uncollected: 0, layoutVersion: 1, inventory: inv, placements: [], visibility: 'public', production: { stations: {} }, stats: { visits: 0, matches: 0 }, quests: { firstFriend: false }, host: { day: '', matches: 0, gold: 0, rep: 0, groups: {} }, created: Date.now() };
  v.placements = starterLayout(inv); v.gridVersion = Economy.VENUE_GRID.version;
  syncStations(v);
  put(v); return v;
}
function cleanName(raw) { var name = String(raw || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim(); if (name.length < 3) throw new Error('Mekân adı en az 3 karakter olmalı.'); if (Mod.badName(name)) throw new Error('Bu ad kullanılamaz (topluluk kuralları): başka bir ad yaz.'); if (name.length > 24) throw new Error('Mekân adı en çok 24 karakter olabilir (' + name.length + ' yazdın).'); return name; }
function rename(v, body) { // sahibi mekân adını değiştirir (ücretsiz; aynı kurallar: 3–24 karakter)
  if (v.nameLockUntil && v.nameLockUntil > Date.now()) throw new Error('Kıraathanenin adı yönetici tarafından değiştirildi (topluluk kuralları); 24 saat yeniden değiştirilemez.'); // v10.11 (K178)
  var name = cleanName(body.name); if (name === v.name) throw new Error('Ad zaten bu.');
  v.name = name; v.nameFixed = true; put(v); return v;
}
function syncStations(v) { // yerleştirilmiş üretim istasyonları için üretim kaydı
  var st = v.production.stations || (v.production.stations = {});
  var placed = {}; v.placements.forEach(function (pl) { placed[pl.iid] = true; });
  v.inventory.forEach(function (it) { var item = Economy.venueItem(it.item); if (item && item.kind === 'station') { if (!st[it.iid]) st[it.iid] = { recipe: item.recipe, stock: 0, batchEndsAt: 0, demandUsed: 0 }; st[it.iid].active = !!placed[it.iid]; } });
}
function ownerView(v, now) { // sahibine tam görünüm
  Economy.settleProduction(v, now || Date.now());
  var t = Economy.venueTier(v.tier), next = Economy.CONFIG.venue.tiers[v.tier] || null;
  return { code: v.code, name: v.name, theme: v.theme, tier: v.tier, tierName: t.name, tables: t.tables, reputation: v.reputation, kasa: v.kasa, uncollected: v.uncollected || 0, layoutVersion: v.layoutVersion, inventory: v.inventory, placements: v.placements, production: v.production, stats: v.stats, host: v.host, quests: v.quests, next: next ? { tier: next.tier, name: next.name, price: next.price, reputation: next.reputation, tables: next.tables } : null, ownerName: v.ownerName, ownerId: v.ownerId, mine: true, migrated: v.migrated && !v.migrated.seen ? { moved: v.migrated.moved, dropped: v.migrated.dropped } : null, gridVersion: v.gridVersion };
}
function guestView(v, now) { // ziyaretçi görünümü: kasa/üretim ayrıntısı yok
  Economy.settleProduction(v, now || Date.now());
  var t = Economy.venueTier(v.tier);
  return { code: v.code, name: v.name, theme: v.theme, tier: v.tier, tierName: t.name, tables: t.tables, reputation: v.reputation, layoutVersion: v.layoutVersion, inventory: v.inventory.map(function (it) { return { iid: it.iid, item: it.item }; }), placements: v.placements, stats: v.stats, ownerName: v.ownerName, ownerId: v.ownerId, mine: false, stock: stockSummary(v) };
}
function stockSummary(v) { var s = {}; Object.keys(v.production.stations || {}).forEach(function (k) { var st = v.production.stations[k]; s[k] = { recipe: st.recipe, stock: st.stock || 0, active: !!st.active }; }); return s; }

// ---- işlemler (hepsi sahibine; p = doğrulanmış oyuncu) ----
function layout(v, body) {
  if ((body.version | 0) !== v.layoutVersion) throw new Error('Yerleşim başka bir cihazda değişti; güncel düzen yüklendi.');
  var pl = Array.isArray(body.placements) ? body.placements.map(function (x) { return { iid: String(x.iid), gx: x.gx | 0, gy: x.gy | 0, rot: (x.rot | 0) % 4 }; }) : [];
  var seen = {}; pl.forEach(function (x) { if (seen[x.iid]) throw new Error('Aynı eşya iki yere konamaz.'); seen[x.iid] = true; });
  // aktif maçı olan masa kaldırılamaz/taşınamaz (sunucu odaları)
  if (body._activeTables) { }
  var r = Economy.validateLayout(pl, v.inventory);
  if (!r.ok) throw new Error(r.errors[0]);
  var tables = pl.filter(function (x) { var inv = v.inventory.filter(function (i) { return i.iid === x.iid; })[0]; var it = inv && Economy.venueItem(inv.item); return it && it.kind === 'table'; }).length;
  if (tables > Economy.venueTier(v.tier).tables) throw new Error('Bu kademede en fazla ' + Economy.venueTier(v.tier).tables + ' masa yerleştirilebilir.');
  v.placements = pl; v.layoutVersion++; syncStations(v); put(v); return v;
}
function buy(v, p, body) {
  var item = Economy.venueItem(body.item); if (!item) throw new Error('Ürün bulunamadı.');
  if (item.locked) throw new Error(item.name + ' henüz satışta değil.');
  if (item.tier > v.tier) throw new Error(item.name + ' için kademe ' + item.tier + ' gerekir.');
  if (v.kasa < item.price) throw new Error('Kasada yeterli altın yok (' + item.price + ' gerekir, kasa ' + v.kasa + ').');
  v.kasa -= item.price; v.inventory.push({ iid: iid(), item: item.id, since: Date.now() }); syncStations(v); put(v); return v;
}
function deposit(v, p, body) {
  var amt = Math.floor(Number(body.amount) || 0); if (amt < 1) throw new Error('Tutar geçersiz.');
  if ((p.coins || 0) < amt) throw new Error('Yeterli kişisel altın yok.');
  p.coins -= amt; v.kasa += amt; put(v); return v;
}
function upgrade(v) {
  var next = Economy.CONFIG.venue.tiers[v.tier]; if (!next) throw new Error('En üst kademedesin.');
  if (v.reputation < next.reputation) throw new Error('İtibar yetersiz: ' + next.reputation + ' gerekir (sende ' + v.reputation + ').');
  if (v.kasa < next.price) throw new Error('Kasada yeterli altın yok: ' + next.price + ' gerekir.');
  v.kasa -= next.price; v.tier = next.tier; put(v); return v;
}
function produce(v, body, now) {
  Economy.settleProduction(v, now);
  var st = v.production.stations[body.iid]; if (!st || !st.active) throw new Error('Bu üretim noktası yerleştirilmemiş.');
  var rc = Economy.CONFIG.venue.recipes[st.recipe]; if (!rc) throw new Error('Tarif yok.');
  if (st.batchEndsAt && st.batchEndsAt > now) throw new Error('Parti sürüyor.');
  if ((st.stock || 0) + rc.servings > rc.stockMax) throw new Error('Stok dolu (' + rc.stockMax + ' servis). Önce satılsın.');
  if (v.kasa < rc.inputCost) throw new Error('Girdi için kasada ' + rc.inputCost + ' altın gerekir.');
  v.kasa -= rc.inputCost; st.batchEndsAt = now + rc.minutes * 60000; put(v); return v;
}
function collect(v, now) { Economy.settleProduction(v, now); var amt = v.uncollected || 0; v.uncollected = 0; v.kasa += amt; put(v); return amt; }
function serviceOrder(v, buyer, body, now) { // ziyaretçi servis alır: kişisel altından, kasaya net; sahip kendi dükkânından alamaz
  if (buyer.id === v.ownerId) throw new Error('Kendi dükkânından alamazsın.');
  Economy.settleProduction(v, now);
  var st = v.production.stations[body.iid]; if (!st || !st.active) throw new Error('Üretim noktası yok.');
  var rc = Economy.CONFIG.venue.recipes[st.recipe];
  if ((st.stock || 0) < 1) throw new Error('Stok yok.');
  if ((buyer.coins || 0) < rc.price) throw new Error('Yeterli altın yok.');
  buyer.coins -= rc.price; st.stock--; v.uncollected = (v.uncollected || 0) + (rc.price - rc.systemFee); v.stats.served = (v.stats.served || 0) + 1; put(v); return { price: rc.price, recipe: st.recipe };
}
// Ev sahipliği ödülü: oyun motorunun bitirdiği maç; uygunluk ve günlük tavanlar; kasaya altın + itibar
function hostReward(v, info, now) { // info: {totalHands, humans:[ids], durationMs, humanActs, eligibleCount}
  var dk = Economy.dayKey(now); if (v.host.day !== dk) v.host = { day: dk, matches: 0, gold: 0, rep: 0, groups: {} };
  var reasons = [];
  if (info.eligibleCount < 2) reasons.push('en az 2 uygun insan gerekir');
  if (!info.humans.some(function (id) { return id !== v.ownerId; })) reasons.push('sahip dışında insan yok');
  if (info.durationMs < 3 * 60000) reasons.push('maç 3 dakikadan kısa');
  if (info.humanActs < 8) reasons.push('8 doğrulanmış hamle yok');
  var gkey = info.humans.slice().sort().join('|'); if ((v.host.groups[gkey] || 0) >= C.sameGroupMax) reasons.push('aynı grup günde ' + C.sameGroupMax + ' ödüllü maç');
  if (v.host.matches >= C.hostDailyMatches || v.host.gold >= C.hostDailyMax) reasons.push('günlük ev sahipliği tavanı');
  if (reasons.length) { v.stats.matches = (v.stats.matches || 0) + 1; put(v); return { gold: 0, rep: 0, reasons: reasons }; }
  var gold = Math.min(C.hostGold[info.totalHands] || C.hostGold[1], C.hostDailyMax - v.host.gold), rep = Math.min(C.hostReputation, C.hostDailyReputationMax - v.host.rep);
  v.kasa += gold; v.reputation += rep; v.host.matches++; v.host.gold += gold; v.host.rep += rep; v.host.groups[gkey] = (v.host.groups[gkey] || 0) + 1; v.stats.matches = (v.stats.matches || 0) + 1;
  var lines = ['Ev sahipliği: kasaya +' + gold + ' altın, +' + rep + ' itibar'];
  if (!v.quests.firstFriend) { v.quests.firstFriend = true; v.kasa += C.firstFriendMatch.gold; v.reputation += C.firstFriendMatch.reputation; lines.push('İlk arkadaş maçı: kasaya +' + C.firstFriendMatch.gold + ' altın, +' + C.firstFriendMatch.reputation + ' itibar'); }
  put(v); return { gold: gold, rep: rep, lines: lines };
}
function briefOf(ownerId) { var v = mem[ownerId]; return v ? { name: v.name, tier: v.tier, theme: v.theme } : null; } // v10.06 (K151): arkadaş listesi için kısa bilgi
// v10.06 (K151): arkadaşın kıraathanesi — kod istemeden. Yalnız karşılıklı arkadaşlıkta ve iki yönde engel yokken; görünüm kodla girişle aynı (guestView).
// Erişim kodla girişten geniş değildir: kod herkese açık kıraathaneyi açar; burada ayrıca arkadaşlık + engel denetimi var. Kapalı (ileride) kıraathane açılmaz.
function friendVenue(p, fid, now, cb) {
  if (fid === p.id) { var mv = ofOwner(p.id); return cb(null, { venue: mv ? ownerView(mv, now) : null }); }
  var Social = null; try { Social = require('./social.js'); } catch (e) {}
  if (!Social || !Social.friendsBetween) return cb(new Error('Arkadaşlık sistemi şu an kapalı; kıraathaneye kodla girebilirsin.'));
  Social.friendsBetween(p.id, fid, function (e, ok, why) {
    if (e) return cb(e);
    if (!ok) return cb(new Error(why === 'notFriends' ? 'Bu oyuncu arkadaş listende değil; kıraathanesine kodla girebilirsin.' : why === 'blocked' ? 'Bu kişiyi engelledin; kıraathanesine gitmek için önce engeli kaldır.' : 'Bu oyuncunun kıraathanesine şu an giremezsin.'));
    var fv = ofOwner(fid);
    if (!fv) return cb(null, { venue: null, none: true });
    if (fv.visibility && fv.visibility !== 'public' && fv.visibility !== 'friends') return cb(new Error('Bu kıraathane şu an ziyarete kapalı.'));
    fv.stats.visits = (fv.stats.visits || 0) + 1; put(fv);
    cb(null, { venue: guestView(fv, now) });
  });
}
// ---- v10.11 (K178): Keşfet — herkese açık kıraathaneler (popüler / yeni); yönetici "keşfette gizle" diyebilir; kendi ve engellediklerin listelenmez ----
var liveCount = null; function setLiveCount(fn) { liveCount = fn; }
function discoverRow(v) { var t = Economy.venueTier(v.tier); return { code: v.code, name: v.name, theme: v.theme, tier: v.tier, tierName: t.name, tables: t.tables, ownerName: v.ownerName, reputation: v.reputation || 0, visits: (v.stats && v.stats.visits) || 0, matches: (v.stats && v.stats.matches) || 0, live: liveCount ? liveCount(v.code) : 0, created: v.created || 0 }; }
function discover(p, tab, blocked) {
  var rows = Object.keys(mem).map(function (k) { return mem[k]; }).filter(function (v) { return v.visibility === 'public' && !v.hiddenDiscover && v.ownerId !== p.id && (blocked || []).indexOf(v.ownerId) < 0; }).map(discoverRow);
  var score = function (x) { return x.reputation + Math.min(400, x.visits) * 0.5 + x.matches * 3 + (x.tier - 1) * 25 + x.live * 15; };
  if (tab === 'new') rows.sort(function (a, b) { return b.created - a.created; }); else rows.sort(function (a, b) { return score(b) - score(a) || b.created - a.created; });
  return rows.slice(0, 24);
}
function adminOp(ownerId, op, val) { // yönetim: kıraathane adını sıfırla (24 saat kilit) · keşfette gizle / göster · sahip adı; sonuç metni ya da null (kıraathane yok)
  var v = mem[ownerId]; if (!v) return null;
  if (op === 'mekan_ad') { var old = v.name; v.name = 'Kıraathane ' + v.code; v.nameFixed = true; v.nameLockUntil = Date.now() + 24 * 3600000; put(v); return { text: 'kıraathane adı sıfırlandı ("' + old + '" → "' + v.name + '", 24 saat kilitli)', name: v.name }; }
  if (op === 'kesif_gizle') { v.hiddenDiscover = true; put(v); return { text: 'kıraathane keşfette gizli (' + v.name + ')' }; }
  if (op === 'kesif_goster') { v.hiddenDiscover = false; put(v); return { text: 'kıraathane keşfette görünür (' + v.name + ')' }; }
  if (op === 'sahip_ad') { if (val) v.ownerName = String(val).slice(0, 14); put(v); return { text: 'kıraathane sahibi adı güncellendi' }; }
  return null;
}
function listPublic(limit) { return Object.keys(mem).map(function (k) { return mem[k]; }).filter(function (v) { return v.visibility === 'public'; }).sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }).slice(0, limit || 20).map(function (v) { return { code: v.code, name: v.name, theme: v.theme, tier: v.tier, ownerName: v.ownerName, reputation: v.reputation }; }); }

// HTTP uçları: POST /api/venue/<işlem>, gövde: {id, token, ...}
function handleHttp(url, body, cb) {
  if (url.indexOf('/api/venue/') !== 0) return false;
  var op = url.slice('/api/venue/'.length), now = Date.now();
  Accounts.withLock(body && body.id, function (release) { // v9.86: oyuncu kaydı hesap kilidi altında okunup yazılır (eşzamanlı ödül yazımı silinmesin)
  var cb0 = cb; cb = function (e, out) { release(); cb0(e, out); };
  Accounts.auth(body, function (e, p) {
    if (e) return cb(e);
    if (op === 'discover') { var Soc = null; try { Soc = require('./social.js'); } catch (e0) {} var tab = body.tab === 'new' ? 'new' : 'popular'; // v10.11 (K178)
      var fin = function (bl) { cb(null, { venues: discover(p, tab, bl), tab: tab, mine: !!ofOwner(p.id), player: Accounts.publicView(p) }); };
      if (Soc && Soc.blockedIds) return Soc.blockedIds(p.id, function (eb, bl) { fin(eb ? [] : bl); }); return fin([]); }
    if (op === 'get' && body.friend) return friendVenue(p, String(body.friend), now, function (e2, o2) { if (e2) return cb(e2); o2.player = Accounts.publicView(p); cb(null, o2); }); // v10.06 (K151)
    try {
      var v = ofOwner(p.id), out;
      switch (op) {
        case 'get': if (body.code) { var g = ofCode(body.code); if (!g) throw new Error('Kıraathane bulunamadı.'); g.stats.visits = (g.stats.visits || 0) + 1; put(g); out = { venue: g.ownerId === p.id ? ownerView(g, now) : guestView(g, now) }; } else out = { venue: v ? ownerView(v, now) : null }; break;
        case 'create': v = create(p, body); out = { venue: ownerView(v, now) }; break;
        case 'list': out = { venues: listPublic(20) }; break;
        case 'layout': if (!v) throw new Error('Kıraathanen yok.'); layout(v, body); out = { venue: ownerView(v, now) }; break;
        case 'buy': if (!v) throw new Error('Kıraathanen yok.'); buy(v, p, body); out = { venue: ownerView(v, now) }; break;
        case 'deposit': if (!v) throw new Error('Kıraathanen yok.'); deposit(v, p, body); out = { venue: ownerView(v, now) }; break;
        case 'upgrade': if (!v) throw new Error('Kıraathanen yok.'); upgrade(v); out = { venue: ownerView(v, now) }; break;
        case 'produce': if (!v) throw new Error('Kıraathanen yok.'); produce(v, body, now); out = { venue: ownerView(v, now) }; break;
        case 'collect': if (!v) throw new Error('Kıraathanen yok.'); var amt = collect(v, now); out = { venue: ownerView(v, now), collected: amt }; break;
        case 'migrated-seen': if (!v) throw new Error('Kıraathanen yok.'); if (v.migrated) { v.migrated.seen = true; put(v); } out = { venue: ownerView(v, now) }; break; // oda ölçeği dönüşüm bildirimi bir kez gösterilir
        case 'rename': if (!v) throw new Error('Kıraathanen yok.'); rename(v, body); out = { venue: ownerView(v, now) }; break;
        case 'order': var tv = ofCode(body.code); if (!tv) throw new Error('Kıraathane bulunamadı.'); out = { order: serviceOrder(tv, p, body, now), venue: guestView(tv, now) }; break;
        default: throw new Error('bilinmeyen işlem');
      }
      // oyuncu kaydı değiştiyse (deposit/order) kaydet
      Accounts.save(p, function () { out.player = Accounts.publicView(p); cb(null, out); });
    } catch (ex) { cb(ex); }
  });
  });
  return true;
}
module.exports = { setLiveCount: setLiveCount, adminOp: adminOp, discover: discover, /* v10.11 (K178) */ init: init, remove: remove, handleHttp: handleHttp, briefOf: briefOf, friendVenue: friendVenue, ofOwner: ofOwner, ofCode: ofCode, ownerView: ownerView, guestView: guestView, hostReward: hostReward, put: put, fixLegacyName: fixLegacyName, defaultVenueName: defaultVenueName };
