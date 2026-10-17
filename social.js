// Döngü sosyal modülü (v9.93, K118): arkadaşlık (istek / kabul / ret / geri çek / çıkar), engelleme, şikâyet kaydı ve 1:1 özel mesaj.
// Depo: hesap deposu Postgres ise tablolar social_rel, social_block, dm, reports; dosya modunda data/social.json, data/dm.json, data/reports.jsonl.
// Bütün kurallar sunucuda: gönderen oturumdan (id + token) doğrulanır; her gönderimde arkadaşlık ve engel denetlenir; geçmişi yalnız taraflar okur;
// hız sınırları sunucuda; yanıtlarda e-posta/parola/token yoktur (hesaplar misafir: ad, görünüm, seviye).
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var Accounts = require('./accounts.js');

var VERSION = 'sosyal-1';
var MSG_MAX = 500, NOTE_MAX = 300, PAGE = 30, PAGE_MAX = 60, OUT_MAX = 30, LIST_MAX = 200;
var REASONS = { hakaret: 'Hakaret / taciz', spam: 'Spam / reklam', hile: 'Hile şüphesi', diger: 'Diğer' };
var DB = null, DATA = path.join(__dirname, 'data'), S = { rels: {}, blocks: {}, dm: { seq: 0, msgs: [] } }, saveTimer = null;
var online = {}; // hesap kimliği → ws listesi (sosyal soket; çoklu cihaz)

function now() { return Date.now(); }
function pairKey(x, y) { return x < y ? x + '|' + y : y + '|' + x; }
function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(id); }
function logErr(where, e) { console.log('sosyal ' + where + ': ' + (e && e.message ? e.message : e)); }

// ---------- depo ----------
function init(cb) {
  DB = Accounts.db();
  if (DB) {
    DB.query('CREATE TABLE IF NOT EXISTS social_rel (a TEXT NOT NULL, b TEXT NOT NULL, state TEXT NOT NULL, by TEXT NOT NULL, at BIGINT NOT NULL, PRIMARY KEY (a, b))')
      .then(function () { return DB.query('CREATE TABLE IF NOT EXISTS social_block (blocker TEXT NOT NULL, blocked TEXT NOT NULL, at BIGINT NOT NULL, PRIMARY KEY (blocker, blocked))'); })
      .then(function () { return DB.query('CREATE TABLE IF NOT EXISTS dm (id BIGSERIAL PRIMARY KEY, conv TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, cid TEXT NOT NULL, body TEXT NOT NULL, at BIGINT NOT NULL, read BOOLEAN NOT NULL DEFAULT false, UNIQUE (conv, sender, cid))'); })
      .then(function () { return DB.query('CREATE INDEX IF NOT EXISTS dm_conv_id ON dm (conv, id)'); })
      .then(function () { return DB.query('CREATE INDEX IF NOT EXISTS dm_unread ON dm (recipient, read)'); })
      .then(function () { return DB.query('CREATE TABLE IF NOT EXISTS reports (id SERIAL PRIMARY KEY, at BIGINT NOT NULL, reporter TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, note TEXT, context JSONB)'); })
      .then(function () { cb(null, 'postgres'); })
      .catch(function (e) { DB = null; logErr('tablolar kurulamadı, dosya moduna düşüldü', e); fileInit(cb); });
  } else fileInit(cb);
}
function fileInit(cb) {
  try { var s = JSON.parse(fs.readFileSync(path.join(DATA, 'social.json'), 'utf8')); S.rels = s.rels || {}; S.blocks = s.blocks || {}; } catch (e) {}
  try { var d = JSON.parse(fs.readFileSync(path.join(DATA, 'dm.json'), 'utf8')); S.dm = { seq: d.seq || 0, msgs: d.msgs || [] }; } catch (e) {}
  cb(null, 'dosya');
}
function flush() { saveTimer = null; try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'social.json'), JSON.stringify({ rels: S.rels, blocks: S.blocks })); fs.writeFileSync(path.join(DATA, 'dm.json'), JSON.stringify(S.dm)); } catch (e) { logErr('dosya yazılamadı', e); } }
function dirty() { if (!DB && !saveTimer) saveTimer = setTimeout(flush, 300); }

function getRel(x, y, cb) {
  var a = x < y ? x : y, b = x < y ? y : x;
  if (DB) return DB.query('SELECT a, b, state, by, at FROM social_rel WHERE a=$1 AND b=$2', [a, b]).then(function (r) { cb(null, r.rows[0] ? row2rel(r.rows[0]) : null); }).catch(cb);
  cb(null, S.rels[a + '|' + b] || null);
}
function row2rel(r) { return { a: r.a, b: r.b, state: r.state, by: r.by, at: parseInt(r.at, 10) }; }
function setRel(rel, cb) {
  if (DB) return DB.query('INSERT INTO social_rel (a, b, state, by, at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (a, b) DO UPDATE SET state=$3, by=$4, at=$5', [rel.a, rel.b, rel.state, rel.by, rel.at]).then(function () { cb(null); }).catch(cb);
  S.rels[rel.a + '|' + rel.b] = rel; dirty(); cb(null);
}
function delRel(x, y, cb) {
  var a = x < y ? x : y, b = x < y ? y : x;
  if (DB) return DB.query('DELETE FROM social_rel WHERE a=$1 AND b=$2', [a, b]).then(function () { cb(null); }).catch(cb);
  delete S.rels[a + '|' + b]; dirty(); cb(null);
}
function listRels(id, cb) {
  if (DB) return DB.query('SELECT a, b, state, by, at FROM social_rel WHERE a=$1 OR b=$1 ORDER BY at DESC LIMIT $2', [id, LIST_MAX]).then(function (r) { cb(null, r.rows.map(row2rel)); }).catch(cb);
  var out = []; Object.keys(S.rels).forEach(function (k) { var r = S.rels[k]; if (r.a === id || r.b === id) out.push(r); }); out.sort(function (p, q) { return q.at - p.at; }); cb(null, out.slice(0, LIST_MAX));
}
function blocksBetween(x, y, cb) { // {xy: x y'yi engelledi, yx: y x'i engelledi}
  if (DB) return DB.query('SELECT blocker, blocked FROM social_block WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)', [x, y]).then(function (r) { var o = { xy: false, yx: false }; r.rows.forEach(function (w) { if (w.blocker === x) o.xy = true; else o.yx = true; }); cb(null, o); }).catch(cb);
  cb(null, { xy: !!S.blocks[x + '|' + y], yx: !!S.blocks[y + '|' + x] });
}
function addBlock(x, y, cb) {
  if (DB) return DB.query('INSERT INTO social_block (blocker, blocked, at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [x, y, now()]).then(function () { cb(null); }).catch(cb);
  S.blocks[x + '|' + y] = now(); dirty(); cb(null);
}
function delBlock(x, y, cb) {
  if (DB) return DB.query('DELETE FROM social_block WHERE blocker=$1 AND blocked=$2', [x, y]).then(function (r) { cb(null, r.rowCount > 0); }).catch(cb);
  var had = !!S.blocks[x + '|' + y]; delete S.blocks[x + '|' + y]; dirty(); cb(null, had);
}
function listBlocks(x, cb) {
  if (DB) return DB.query('SELECT blocked, at FROM social_block WHERE blocker=$1 ORDER BY at DESC LIMIT $2', [x, LIST_MAX]).then(function (r) { cb(null, r.rows.map(function (w) { return w.blocked; })); }).catch(cb);
  var out = []; Object.keys(S.blocks).forEach(function (k) { var p = k.split('|'); if (p[0] === x) out.push(p[1]); }); cb(null, out.slice(0, LIST_MAX));
}
function addMsg(m, cb) { // aynı (conv, sender, cid) ikinci kez gelirse kayıtlı olan döner (yeniden gönderme / yeniden bağlanma kopya üretmez)
  if (DB) return DB.query('INSERT INTO dm (conv, sender, recipient, cid, body, at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (conv, sender, cid) DO NOTHING RETURNING id, read', [m.conv, m.sender, m.recipient, m.cid, m.body, m.at]).then(function (r) {
    if (r.rows[0]) { m.id = parseInt(r.rows[0].id, 10); m.read = false; return cb(null, m, false); }
    return DB.query('SELECT id, conv, sender, recipient, cid, body, at, read FROM dm WHERE conv=$1 AND sender=$2 AND cid=$3', [m.conv, m.sender, m.cid]).then(function (r2) { cb(null, r2.rows[0] ? row2msg(r2.rows[0]) : null, true); });
  }).catch(cb);
  for (var i = S.dm.msgs.length - 1; i >= 0; i--) { var x = S.dm.msgs[i]; if (x.conv === m.conv && x.sender === m.sender && x.cid === m.cid) return cb(null, x, true); }
  m.id = ++S.dm.seq; m.read = false; S.dm.msgs.push(m); if (S.dm.msgs.length > 200000) S.dm.msgs.splice(0, 1000); dirty(); cb(null, m, false);
}
function row2msg(r) { return { id: parseInt(r.id, 10), conv: r.conv, sender: r.sender, recipient: r.recipient, cid: r.cid, body: r.body, at: parseInt(r.at, 10), read: !!r.read }; }
function history(conv, before, limit, cb) { // en yeni limit mesaj (before verilirse ondan eskiler), artan sırada; more: daha eskisi var
  if (DB) { var q = before ? DB.query('SELECT id, conv, sender, recipient, cid, body, at, read FROM dm WHERE conv=$1 AND id<$2 ORDER BY id DESC LIMIT $3', [conv, before, limit + 1]) : DB.query('SELECT id, conv, sender, recipient, cid, body, at, read FROM dm WHERE conv=$1 ORDER BY id DESC LIMIT $2', [conv, limit + 1]);
    return q.then(function (r) { var rows = r.rows.map(row2msg); var more = rows.length > limit; if (more) rows.length = limit; cb(null, rows.reverse(), more); }).catch(cb); }
  var out = []; for (var i = S.dm.msgs.length - 1; i >= 0 && out.length < limit + 1; i--) { var x = S.dm.msgs[i]; if (x.conv === conv && (!before || x.id < before)) out.push(x); }
  var more = out.length > limit; if (more) out.length = limit; cb(null, out.reverse(), more);
}
function markRead(conv, reader, cb) { // okuyana gelen okunmamışlar okundu
  if (DB) return DB.query('UPDATE dm SET read=true WHERE conv=$1 AND recipient=$2 AND read=false RETURNING id', [conv, reader]).then(function (r) { cb(null, r.rows.map(function (w) { return parseInt(w.id, 10); })); }).catch(cb);
  var ids = []; S.dm.msgs.forEach(function (x) { if (x.conv === conv && x.recipient === reader && !x.read) { x.read = true; ids.push(x.id); } }); if (ids.length) dirty(); cb(null, ids);
}
function unreadBy(id, cb) { // gönderen → okunmamış sayısı
  if (DB) return DB.query('SELECT sender, count(*)::int AS n FROM dm WHERE recipient=$1 AND read=false GROUP BY sender', [id]).then(function (r) { var o = {}; r.rows.forEach(function (w) { o[w.sender] = w.n; }); cb(null, o); }).catch(cb);
  var o = {}; S.dm.msgs.forEach(function (x) { if (x.recipient === id && !x.read) o[x.sender] = (o[x.sender] || 0) + 1; }); cb(null, o);
}
function addReport(rec, cb) {
  if (DB) return DB.query('INSERT INTO reports (at, reporter, target, reason, note, context) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [rec.at, rec.reporter, rec.target, rec.reason, rec.note, JSON.stringify(rec.context || null)]).then(function (r) { cb(null, parseInt(r.rows[0].id, 10)); }).catch(cb);
  try { fs.mkdirSync(DATA, { recursive: true }); rec.id = now(); fs.appendFileSync(path.join(DATA, 'reports.jsonl'), JSON.stringify(rec) + '\n'); cb(null, rec.id); } catch (e) { cb(e); }
}
function reportCount(cb) { // /durum için
  if (DB) return DB.query('SELECT count(*)::int AS n FROM reports').then(function (r) { cb(r.rows[0].n); }).catch(function () { cb(0); });
  try { cb(fs.readFileSync(path.join(DATA, 'reports.jsonl'), 'utf8').split('\n').filter(Boolean).length); } catch (e) { cb(0); }
}

// ---------- hız sınırı (sunucu örneği başına, bellekte) ----------
var hits = {};
function rate(key, limit, windowMs) { var t = now(), arr = hits[key] || (hits[key] = []); while (arr.length && t - arr[0] > windowMs) arr.shift(); if (arr.length >= limit) return false; arr.push(t); return true; }
setInterval(function () { var t = now(); Object.keys(hits).forEach(function (k) { if (!hits[k].length || t - hits[k][hits[k].length - 1] > 600000) delete hits[k]; }); }, 300000).unref();

// ---------- çevrim içi soketler ve anlık bildirim ----------
function attach(id, ws) { var l = online[id] || (online[id] = []), first = !l.length; if (l.indexOf(ws) < 0) l.push(ws); ws._socialId = id; if (first) presence(id, true); }
function detach(ws) { var id = ws && ws._socialId; if (!id || !online[id]) return; online[id] = online[id].filter(function (w) { return w !== ws; }); if (!online[id].length) { delete online[id]; presence(id, false); } ws._socialId = null; }
function presence(id, on) { // arkadaşlara çevrim içi/dışı bildirimi (liste ve açık sohbet başlığı güncellenir)
  listRels(id, function (e, rels) { if (e) return; rels.forEach(function (r) { if (r.state === 'friends') push(other(r, id), { ev: 'presence', id: id, online: on }); }); });
}
function isOnline(id) { return !!(online[id] && online[id].some(function (w) { return w.readyState === 1; })); }
function push(id, obj, except) { var l = online[id]; if (!l) return; var s = JSON.stringify(Object.assign({ t: 'social' }, obj)); l.forEach(function (w) { if (w !== except && w.readyState === 1) { try { w.send(s); } catch (e) {} } }); }
function hello(ws, acc, cb) { // sosyal soket: hesap doğrulanır, çevrim içi sayılır; cevap: bekleyen istek ve okunmamış sayıları
  if (!acc || !validId(acc.id)) return cb(new Error('Hesap bulunamadı; yeniden giriş gerekli.'));
  Accounts.auth(acc, function (e, p) { if (e || !p) return cb(e || new Error('Hesap bulunamadı; yeniden giriş gerekli.')); attach(p.id, ws); summary(p.id, function (e2, sm) { cb(null, sm || { requests: 0, unread: 0 }); }); });
}
function summary(id, cb) { // rozet için: gelen istek sayısı + okunmamış mesaj toplamı
  listRels(id, function (e, rels) { if (e) return cb(e); var reqs = rels.filter(function (r) { return r.state === 'pending' && r.by !== id; }).length;
    unreadBy(id, function (e2, u) { if (e2) return cb(e2); var tot = 0; Object.keys(u).forEach(function (k) { tot += u[k]; }); cb(null, { requests: reqs, unread: tot }); }); });
}

// ---------- oyuncu özeti (yanıtlarda yalnız ad, görünüm, seviye) ----------
function brief(p) { return { id: p.id, name: p.name, avatar: Accounts.cleanAvatar(p.avatar), level: Accounts.levelOf(p.xp || 0).level }; }
function briefs(ids, cb) { var out = {}, left = ids.length; if (!left) return cb(null, out); ids.forEach(function (id) { Accounts.get(id, function (e, p) { if (!e && p) out[id] = brief(p); if (--left === 0) cb(null, out); }); }); }
function other(rel, me) { return rel.a === me ? rel.b : rel.a; }
function relState(rel, me) { if (!rel) return 'none'; if (rel.state === 'friends') return 'friends'; return rel.by === me ? 'out' : 'in'; }

// ---------- işlemler ----------
function targetOf(body, me, cb) { // hedef: geçerli, var olan, kendisi olmayan hesap
  var t = body && typeof body.target === 'string' ? body.target.trim() : '';
  if (!validId(t)) return cb(new Error('Geçersiz oyuncu kodu.'));
  if (t === me.id) return cb(new Error('Kendine istek gönderemezsin.'));
  Accounts.get(t, function (e, p) { if (e) return cb(e); if (!p) return cb(new Error('Oyuncu bulunamadı: kodu kontrol et.')); cb(null, p); });
}
function friendsBetween(me, peer, cb) { // mesaj izni: arkadaş ve iki yönde engel yok
  getRel(me, peer, function (e, rel) { if (e) return cb(e); blocksBetween(me, peer, function (e2, bl) { if (e2) return cb(e2);
    if (bl.xy) return cb(null, false, 'blocked', 'Bu kişiyi engelledin. Mesaj için önce engeli kaldır.');
    if (bl.yx) return cb(null, false, 'blockedBy', 'Bu kişiye şu anda mesaj gönderemezsin.');
    if (!rel || rel.state !== 'friends') return cb(null, false, 'notFriends', 'Mesaj için arkadaş olmalısınız. Arkadaşlık yeniden kabul edilince sohbet açılır.');
    cb(null, true, 'ok', ''); }); });
}
function opMe(me, body, cb) {
  listRels(me.id, function (e, rels) { if (e) return cb(e);
    listBlocks(me.id, function (e2, blocked) { if (e2) return cb(e2);
      unreadBy(me.id, function (e3, unread) { if (e3) return cb(e3);
        var ids = {}; rels.forEach(function (r) { ids[other(r, me.id)] = 1; }); blocked.forEach(function (b) { ids[b] = 1; });
        briefs(Object.keys(ids), function (e4, B) { if (e4) return cb(e4);
          var friends = [], inn = [], out = [];
          rels.forEach(function (r) { var o = other(r, me.id), b = B[o]; if (!b) return; var row = Object.assign({}, b, { at: r.at }); if (r.state === 'friends') { row.online = isOnline(o); row.unread = unread[o] || 0; friends.push(row); } else if (r.by === me.id) out.push(row); else inn.push(row); });
          friends.sort(function (p, q) { return (q.unread - p.unread) || ((q.online ? 1 : 0) - (p.online ? 1 : 0)) || p.name.localeCompare(q.name, 'tr'); });
          var tot = 0; Object.keys(unread).forEach(function (k) { tot += unread[k]; });
          cb(null, { version: VERSION, me: brief(me), friends: friends, in: inn, out: out, blocked: blocked.map(function (b) { return B[b] || { id: b, name: 'Oyuncu', avatar: null, level: 0 }; }), unreadTotal: tot, requests: inn.length });
        }); }); }); });
}
function opState(me, body, cb) {
  targetOf(body, me, function (e, p) { if (e) { if (/Kendine/.test(e.message)) return cb(null, { state: 'self' }); return cb(e); }
    getRel(me.id, p.id, function (e2, rel) { if (e2) return cb(e2); blocksBetween(me.id, p.id, function (e3, bl) { if (e3) return cb(e3);
      var st = bl.xy ? 'blocked' : relState(rel, me.id); // karşı tarafın engeli söylenmez ('none' görünür; istek genel hatayla reddedilir)
      unreadBy(me.id, function (e4, u) { cb(null, { state: st, target: brief(p), online: st === 'friends' ? isOnline(p.id) : undefined, unread: st === 'friends' ? ((u || {})[p.id] || 0) : 0 }); }); }); }); });
}
function opRequest(me, body, cb) {
  if (!rate('req:' + me.id, 10, 60000)) return cb(new Error('Çok sık istek gönderdin; biraz bekle.'));
  targetOf(body, me, function (e, p) { if (e) return cb(e);
    blocksBetween(me.id, p.id, function (e2, bl) { if (e2) return cb(e2);
      if (bl.xy) return cb(new Error('Bu kişiyi engelledin. Önce engeli kaldır.'));
      if (bl.yx) return cb(new Error('Bu kişiye şu anda istek gönderilemiyor.'));
      getRel(me.id, p.id, function (e3, rel) { if (e3) return cb(e3);
        if (rel && rel.state === 'friends') return cb(new Error('Zaten arkadaşsınız.'));
        if (rel && rel.by === me.id) return cb(new Error('İstek zaten gönderildi; cevap bekleniyor.'));
        if (rel && rel.by === p.id) { // karşılıklı istek: iki taraf da istemiş → arkadaş (tek kayıt, tutarlı)
          var fr = { a: rel.a, b: rel.b, state: 'friends', by: me.id, at: now() };
          return setRel(fr, function (e4) { if (e4) return cb(e4); push(p.id, { ev: 'accept', from: brief(me) }); cb(null, { state: 'friends', target: brief(p) }); });
        }
        listRels(me.id, function (e5, rels) { if (e5) return cb(e5);
          if (rels.filter(function (r) { return r.state === 'pending' && r.by === me.id; }).length >= OUT_MAX) return cb(new Error('Bekleyen istek sayısı sınırda (' + OUT_MAX + '). Önce bazılarını geri çek.'));
          var a = me.id < p.id ? me.id : p.id, b = me.id < p.id ? p.id : me.id;
          setRel({ a: a, b: b, state: 'pending', by: me.id, at: now() }, function (e6) { if (e6) return cb(e6); push(p.id, { ev: 'request', from: brief(me) }); cb(null, { state: 'out', target: brief(p) }); });
        });
      });
    });
  });
}
function opAccept(me, body, cb) {
  targetOf(body, me, function (e, p) { if (e) return cb(e);
    getRel(me.id, p.id, function (e2, rel) { if (e2) return cb(e2);
      if (!rel || rel.state !== 'pending' || rel.by !== p.id) return cb(new Error('Bu kişiden bekleyen istek yok.'));
      blocksBetween(me.id, p.id, function (e3, bl) { if (e3) return cb(e3); if (bl.xy || bl.yx) return cb(new Error('Bu istek artık kabul edilemez.'));
        setRel({ a: rel.a, b: rel.b, state: 'friends', by: me.id, at: now() }, function (e4) { if (e4) return cb(e4); push(p.id, { ev: 'accept', from: brief(me) }); cb(null, { state: 'friends', target: brief(p) }); }); }); }); });
}
function opReject(me, body, cb) {
  targetOf(body, me, function (e, p) { if (e) return cb(e);
    getRel(me.id, p.id, function (e2, rel) { if (e2) return cb(e2);
      if (!rel || rel.state !== 'pending' || rel.by !== p.id) return cb(new Error('Bu kişiden bekleyen istek yok.'));
      delRel(me.id, p.id, function (e3) { if (e3) return cb(e3); push(p.id, { ev: 'sync' }); cb(null, { state: 'none', target: brief(p) }); }); }); });
}
function opCancel(me, body, cb) {
  targetOf(body, me, function (e, p) { if (e) return cb(e);
    getRel(me.id, p.id, function (e2, rel) { if (e2) return cb(e2);
      if (!rel || rel.state !== 'pending' || rel.by !== me.id) return cb(new Error('Geri çekilecek istek yok.'));
      delRel(me.id, p.id, function (e3) { if (e3) return cb(e3); push(p.id, { ev: 'sync' }); cb(null, { state: 'none', target: brief(p) }); }); }); });
}
function opUnfriend(me, body, cb) {
  targetOf(body, me, function (e, p) { if (e) return cb(e);
    getRel(me.id, p.id, function (e2, rel) { if (e2) return cb(e2);
      if (!rel || rel.state !== 'friends') return cb(new Error('Bu kişiyle arkadaş değilsiniz.'));
      delRel(me.id, p.id, function (e3) { if (e3) return cb(e3); push(p.id, { ev: 'unfriend', from: { id: me.id } }); cb(null, { state: 'none', target: brief(p) }); }); }); });
}
function opBlock(me, body, cb) { // engel: arkadaşlık ve bekleyen istek silinir, yeni istek ve mesaj iki yönde durur; engeli kaldırmak arkadaşlığı geri getirmez
  targetOf(body, me, function (e, p) { if (e) return cb(e);
    addBlock(me.id, p.id, function (e2) { if (e2) return cb(e2);
      delRel(me.id, p.id, function (e3) { if (e3) return cb(e3); push(p.id, { ev: 'sync' }); cb(null, { state: 'blocked', target: brief(p) }); }); }); });
}
function opUnblock(me, body, cb) {
  targetOf(body, me, function (e, p) { if (e) return cb(e);
    delBlock(me.id, p.id, function (e2, had) { if (e2) return cb(e2); if (!had) return cb(new Error('Bu kişi engelli değil.')); push(p.id, { ev: 'sync' }); cb(null, { state: 'none', target: brief(p) }); }); });
}
function opReport(me, body, cb) { // şikâyet kaydı: sebep + not + son 20 mesaj (varsa) — inceleme arayüzü yok, kayıt sunucuda (reports)
  if (!rate('rep:' + me.id, 5, 600000)) return cb(new Error('Çok sık şikâyet gönderdin; biraz bekle.'));
  targetOf(body, me, function (e, p) { if (e) return cb(e);
    var reason = String(body.reason || ''); if (!REASONS[reason]) return cb(new Error('Şikâyet sebebi seç.'));
    var note = cleanText(body.note, NOTE_MAX);
    history(pairKey(me.id, p.id), null, 20, function (e2, msgs) { if (e2) msgs = [];
      var rec = { at: now(), reporter: me.id, target: p.id, reason: reason, note: note, context: { reporterName: me.name, targetName: p.name, where: String(body.where || '').slice(0, 40), messages: (msgs || []).map(function (m) { return { id: m.id, from: m.sender, at: m.at, body: m.body }; }) } };
      addReport(rec, function (e3, id) { if (e3) return cb(e3); console.log('şikâyet kaydı #' + id + ': ' + me.name + ' → ' + p.name + ' (' + reason + ')'); cb(null, { ok: true, id: id, reasonText: REASONS[reason] }); }); }); });
}
function cleanText(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max); }
function opSend(me, body, cb) {
  var to = body && typeof body.to === 'string' ? body.to.trim() : ''; if (!validId(to) || to === me.id) return cb(new Error('Geçersiz alıcı.'));
  var text = cleanText(body.body, MSG_MAX + 1); if (!text) return cb(new Error('Boş mesaj gönderilemez.')); if (text.length > MSG_MAX) return cb(new Error('Mesaj en çok ' + MSG_MAX + ' karakter.'));
  var cid = typeof body.cid === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(body.cid) ? body.cid : crypto.randomBytes(8).toString('hex');
  Accounts.get(to, function (e, p) { if (e) return cb(e); if (!p) return cb(new Error('Oyuncu bulunamadı.'));
    friendsBetween(me.id, to, function (e2, ok, why, text2) { if (e2) return cb(e2); if (!ok) { var er = new Error(text2); er.code = why; return cb(er); }
      var conv = pairKey(me.id, to), m = { conv: conv, sender: me.id, recipient: to, cid: cid, body: text, at: now() };
      addMsg(m, function (e3, stored, dup) { if (e3) return cb(e3); if (!stored) return cb(new Error('Mesaj kaydedilemedi.'));
        if (dup) return cb(null, { msg: stored, dup: true });
        // hız sınırı kayıttan sonra ölçülür ki aynı cid ile yeniden gönderme (kopya) sınıra takılmasın; aşan yeni mesaj silinir
        if (!rate('dm:' + me.id, 20, 60000) || !rate('dmb:' + me.id, 1, 300)) { return dropMsg(stored, function () { cb(new Error('Çok hızlı yazıyorsun; biraz bekle.')); }); }
        push(to, { ev: 'dm', msg: stored, fromName: me.name }); push(me.id, { ev: 'dm', msg: stored }); // alıcının bütün cihazları + gönderenin diğer cihazları
        cb(null, { msg: stored, dup: false, delivered: isOnline(to) }); }); }); });
}
function dropMsg(m, cb) {
  if (DB) return DB.query('DELETE FROM dm WHERE id=$1', [m.id]).then(function () { cb(); }).catch(function () { cb(); });
  S.dm.msgs = S.dm.msgs.filter(function (x) { return x.id !== m.id; }); dirty(); cb();
}
function opHistory(me, body, cb) { // yalnız taraflar: sohbet anahtarı isteyenin kimliğinden türetilir; başkasının sohbetine erişim yolu yok
  var peer = body && typeof body.peer === 'string' ? body.peer.trim() : ''; if (!validId(peer) || peer === me.id) return cb(new Error('Geçersiz sohbet.'));
  var before = parseInt(body.before, 10) || null, limit = Math.max(1, Math.min(PAGE_MAX, parseInt(body.limit, 10) || PAGE));
  Accounts.get(peer, function (e, p) { if (e) return cb(e); if (!p) return cb(new Error('Oyuncu bulunamadı.'));
    history(pairKey(me.id, peer), before, limit, function (e2, msgs, more) { if (e2) return cb(e2);
      friendsBetween(me.id, peer, function (e3, ok, why, text) { if (e3) return cb(e3);
        blocksBetween(me.id, peer, function (e4, bl) { cb(null, { peer: brief(p), msgs: msgs, more: more, canSend: ok, why: why, whyText: text, blocked: !!(bl && bl.xy), online: ok ? isOnline(peer) : false }); }); }); }); });
}
function opRead(me, body, cb) { // sohbet açılınca gelenler okundu; karşı tarafa 'read' bildirimi (okundu işareti)
  var peer = body && typeof body.peer === 'string' ? body.peer.trim() : ''; if (!validId(peer) || peer === me.id) return cb(new Error('Geçersiz sohbet.'));
  markRead(pairKey(me.id, peer), me.id, function (e, ids) { if (e) return cb(e); if (ids.length) { push(peer, { ev: 'read', by: me.id, ids: ids }); push(me.id, { ev: 'readSelf', peer: peer }); } cb(null, { ok: true, n: ids.length }); });
}

// ---------- HTTP ----------
var OPS = { '/api/social/me': opMe, '/api/social/state': opState, '/api/social/request': opRequest, '/api/social/accept': opAccept, '/api/social/reject': opReject, '/api/social/cancel': opCancel, '/api/social/unfriend': opUnfriend, '/api/social/block': opBlock, '/api/social/unblock': opUnblock, '/api/social/report': opReport, '/api/dm/send': opSend, '/api/dm/history': opHistory, '/api/dm/read': opRead };
function handleHttp(url, body, cb) {
  var fn = OPS[url]; if (!fn) return cb(new Error('yok'));
  if (!body || !validId(body.id)) return cb(new Error('Hesap bulunamadı; yeniden giriş gerekli.'));
  Accounts.auth(body, function (e, p) { if (e || !p) return cb(e || new Error('Hesap bulunamadı; yeniden giriş gerekli.'));
    try { fn(p, body, function (e2, out) { if (e2) cb(e2); else cb(null, out); }); } catch (ex) { cb(ex); } });
}
function onlineCount() { return Object.keys(online).length; }
function stats(cb) { reportCount(function (n) { cb({ online: Object.keys(online).length, reports: n }); }); }

module.exports = { VERSION: VERSION, onlineCount: onlineCount, REASONS: REASONS, init: init, handleHttp: handleHttp, hello: hello, detach: detach, isOnline: isOnline, summary: summary, stats: stats, pairKey: pairKey, _store: { history: history, unreadBy: unreadBy } };
