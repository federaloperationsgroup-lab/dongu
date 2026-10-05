// Döngü — Kıraathane (oyuncunun kendi mekânı): kayıt, envanter, yerleşim, kasa, üretim, ev sahipliği ödülü.
// Depo: hesaplarla aynı (dosya data/venues.json ya da Postgres venues tablosu). Kurallar/sayılar Economy.CONFIG.venue ve VENUE_ITEMS'ta.
'use strict';
var crypto = require('crypto'), fs = require('fs'), path = require('path');
var Economy = require('./economy.js');
var C = Economy.CONFIG.venue;

var DB = null, mem = {}, byCode = {}, FILE = path.join(__dirname, 'data', 'venues.json'), saveTimer = null, Accounts = null;
function init(opts, cb) {
  Accounts = opts.accounts; DB = opts.db || null;
  if (DB) { DB.query('CREATE TABLE IF NOT EXISTS venues (id TEXT PRIMARY KEY, code TEXT, data JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now())').then(function () { return DB.query('SELECT data FROM venues'); }).then(function (r) { r.rows.forEach(function (row) { mem[row.data.ownerId] = row.data; byCode[row.data.code] = row.data; }); cb && cb(null); }).catch(function (e) { DB = null; fileLoad(); cb && cb(e); }); return; }
  fileLoad(); cb && cb(null);
}
function fileLoad() { try { mem = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { mem = {}; } Object.keys(mem).forEach(function (k) { byCode[mem[k].code] = mem[k]; }); }
function flush() { saveTimer = null; try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(mem)); } catch (e) {} }
function put(v) {
  v.updated = Date.now(); mem[v.ownerId] = v; byCode[v.code] = v;
  if (DB) DB.query('INSERT INTO venues (id, code, data, updated) VALUES ($1,$2,$3,now()) ON CONFLICT (id) DO UPDATE SET data=$3, code=$2, updated=now()', [v.ownerId, v.code, JSON.stringify(v)]).catch(function () {});
  else if (!saveTimer) saveTimer = setTimeout(flush, 500);
}
function newCode() { var s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', c; do { c = ''; for (var i = 0; i < 5; i++) c += s[Math.floor(Math.random() * s.length)]; } while (byCode[c]); return c; }
function iid() { return 'i_' + crypto.randomBytes(4).toString('hex'); }
function ofOwner(id) { return mem[id] || null; }
function ofCode(code) { return byCode[String(code || '').toUpperCase()] || null; }

// Başlangıç yerleşimi (şablon): masa ortada, çay ocağı arka sol, kilim masanın altında, sandalyeler dekor
function starterLayout(inv) {
  var find = function (item, n) { var k = 0; for (var i = 0; i < inv.length; i++) if (inv[i].item === item && k++ === n) return inv[i].iid; return null; };
  return [
    { iid: find('v_hali', 0), gx: 4, gy: 2, rot: 0 }, { iid: find('v_masa', 0), gx: 5, gy: 2, rot: 0 },
    { iid: find('v_cayocagi', 0), gx: 0, gy: 0, rot: 0 }, { iid: find('v_sandalye', 0), gx: 10, gy: 1, rot: 0 }, { iid: find('v_sandalye', 1), gx: 11, gy: 1, rot: 0 }
  ].filter(function (p) { return p.iid; });
}
function create(p, body) {
  if (mem[p.id]) throw new Error('Zaten bir kıraathanen var.');
  var name = String(body.name || (p.name + ' Kıraathanesi')).replace(/[<>]/g, '').trim().slice(0, 24); if (name.length < 3) throw new Error('Mekân adı en az 3 karakter olmalı.');
  var theme = ['koy', 'kahve', 'sokak', 'sanayi', 'cinar', 'soba', 'apartman', 'bag'].indexOf(body.theme) >= 0 ? body.theme : 'koy';
  var inv = Economy.VENUE_STARTER.map(function (item) { return { iid: iid(), item: item, since: Date.now() }; });
  var v = { ownerId: p.id, ownerName: p.name, code: newCode(), name: name, theme: theme, tier: 1, reputation: C.openGift.reputation, kasa: C.openGift.gold, uncollected: 0, layoutVersion: 1, inventory: inv, placements: [], visibility: 'public', production: { stations: {} }, stats: { visits: 0, matches: 0 }, quests: { firstFriend: false }, host: { day: '', matches: 0, gold: 0, rep: 0, groups: {} }, created: Date.now() };
  v.placements = starterLayout(inv);
  syncStations(v);
  put(v); return v;
}
function syncStations(v) { // yerleştirilmiş üretim istasyonları için üretim kaydı
  var st = v.production.stations || (v.production.stations = {});
  var placed = {}; v.placements.forEach(function (pl) { placed[pl.iid] = true; });
  v.inventory.forEach(function (it) { var item = Economy.venueItem(it.item); if (item && item.kind === 'station') { if (!st[it.iid]) st[it.iid] = { recipe: item.recipe, stock: 0, batchEndsAt: 0, demandUsed: 0 }; st[it.iid].active = !!placed[it.iid]; } });
}
function ownerView(v, now) { // sahibine tam görünüm
  Economy.settleProduction(v, now || Date.now());
  var t = Economy.venueTier(v.tier), next = Economy.CONFIG.venue.tiers[v.tier] || null;
  return { code: v.code, name: v.name, theme: v.theme, tier: v.tier, tierName: t.name, tables: t.tables, reputation: v.reputation, kasa: v.kasa, uncollected: v.uncollected || 0, layoutVersion: v.layoutVersion, inventory: v.inventory, placements: v.placements, production: v.production, stats: v.stats, host: v.host, quests: v.quests, next: next ? { tier: next.tier, name: next.name, price: next.price, reputation: next.reputation, tables: next.tables } : null, ownerName: v.ownerName, ownerId: v.ownerId, mine: true };
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
function listPublic(limit) { return Object.keys(mem).map(function (k) { return mem[k]; }).filter(function (v) { return v.visibility === 'public'; }).sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }).slice(0, limit || 20).map(function (v) { return { code: v.code, name: v.name, theme: v.theme, tier: v.tier, ownerName: v.ownerName, reputation: v.reputation }; }); }

// HTTP uçları: POST /api/venue/<işlem>, gövde: {id, token, ...}
function handleHttp(url, body, cb) {
  if (url.indexOf('/api/venue/') !== 0) return false;
  var op = url.slice('/api/venue/'.length), now = Date.now();
  Accounts.auth(body, function (e, p) {
    if (e) return cb(e);
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
        case 'order': var tv = ofCode(body.code); if (!tv) throw new Error('Kıraathane bulunamadı.'); out = { order: serviceOrder(tv, p, body, now), venue: guestView(tv, now) }; break;
        default: throw new Error('bilinmeyen işlem');
      }
      // oyuncu kaydı değiştiyse (deposit/order) kaydet
      Accounts.save(p, function () { out.player = Accounts.publicView(p); cb(null, out); });
    } catch (ex) { cb(ex); }
  });
  return true;
}
module.exports = { init: init, handleHttp: handleHttp, ofOwner: ofOwner, ofCode: ofCode, ownerView: ownerView, guestView: guestView, hostReward: hostReward, put: put };
