// Döngü (Americano Okey) — çevrim içi oda sunucusu
// Node.js 18+ ve "ws" paketi. Kural motoru (engine.js) sunucuda çalışır; her oyuncuya yalnızca kendi taşları gönderilir.
// Çalıştırma: node server.js   (PORT ortam değişkeni ile port seçilir, varsayılan 8080)
'use strict';
var http = require('http');
var WebSocketServer = require('ws').WebSocketServer;
var Okey = require('./engine.js');
var Accounts = require('./accounts.js');

var PORT = process.env.PORT || 8080;
var BOT_DELAY = parseInt(process.env.BOT_DELAY) || 900;        // bot hamle gecikmesi (ms)
var CLAIM_TIMEOUT = 8000;   // Al / Geç süresi (ms)
var BOT_NAMES = ['Ali', 'Ayşe', 'Mehmet'];
var BOT_AVATARS = { Ali: { bot: 'ali' }, 'Ayşe': { bot: 'ayse' }, Mehmet: { bot: 'mehmet' } };

var rooms = {}; // code -> room
var QUICK_WAIT = parseInt(process.env.QUICK_WAIT) || 20000; // Hızlı Katıl bekleme süresi (ms); dolmazsa botlar oturur
var QUICK_THEMES = ['koy', 'kahve', 'sokak', 'sanayi', 'cinar', 'soba', 'apartman', 'bag'];
var ALL_THEMES = QUICK_THEMES.slice(); // istemcinin isteyebileceği mekânlar // hızlı masalar: ücretsiz mekân // hızlı masalarda sunucunun seçtiği mekân havuzu

function code() { var s = '', A = 'ABCDEFGHJKLMNPRSTUVYZ23456789'; for (var i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return rooms[s] ? code() : s; }
function token() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
function log(room, msg) { console.log('[' + room.code + '] ' + msg); }

function newRoom() {
  var r = { code: code(), seats: [null, null, null, null], host: null, g: null, timer: null, claimTimer: null, settings: { claimTime: CLAIM_TIMEOUT, jokerPenalty: 10, assist: true }, created: Date.now() };
  rooms[r.code] = r;
  return r;
}
// seat: { name, avatar, bot:boolean, token, ws|null, connected }
function seatInfo(r) {
  return r.seats.map(function (s, i) { return s ? { i: i, name: s.name, avatar: s.avatar, bot: !!s.bot, connected: !!(s.bot || (s.ws && s.ws.readyState === 1)) } : null; });
}
function freeSeat(r) { for (var i = 0; i < 4; i++) if (!r.seats[i]) return i; return -1; }
function fillBots(r) {
  var used = r.seats.filter(Boolean).map(function (s) { return s.name; });
  var names = BOT_NAMES.filter(function (n) { return used.indexOf(n) < 0; });
  for (var i = 0; i < 4; i++) if (!r.seats[i]) { var n = names.shift() || ('Bot ' + (i + 1)); r.seats[i] = { name: n, avatar: BOT_AVATARS[n] || { bot: 'ali' }, bot: true, token: null, ws: null }; }
}

// ---- oyuncuya özel görünüm: koltuklar döndürülür (alıcı her zaman 0), diğer eller gizlenir ----
function rotateIdx(i, seat) { return i == null ? i : (i - seat + 4) % 4; }
function hideTile() { return null; }
function viewFor(r, seat) {
  var g = r.g; if (!g) return null;
  var rot = function (i) { return rotateIdx(i, seat); };
  var arr4 = function (a) { var o = [0, 0, 0, 0]; for (var i = 0; i < 4; i++) o[rot(i)] = a[i]; return o; };
  var v = {
    online: true, seat: seat, hand: g.hand, task: g.task, phase: g.phase, finished: g.finished, turnNo: g.turnNo, matchId: r.matchId || null,
    ok: g.ok, indicator: g.indicator, deck: new Array(g.deck.length), log: g.log.slice(-12),
    cp: rot(g.cp), lastDiscarder: rot(g.lastDiscarder), claimQueue: g.claimQueue.map(rot), claimTile: g.claimTile,
    totals: arr4(g.totals), handsWon: arr4(g.handsWon), penalties: arr4(g.penalties || [0, 0, 0, 0]), handPen: arr4(g.handPen || [0, 0, 0, 0]),
    rules: g.rules, names: arr4(g.names), players: [], table: [], history: [], handOver: null,
    totalHands: g.totalHands, currentHandIndex: g.currentHandIndex, handPenDisc: arr4(g.handPenDisc || [0, 0, 0, 0]),
    prepLeft: (r.prepUntil && Date.now() < r.prepUntil) ? r.prepUntil - Date.now() : 0, charges: (r.charges || [0, 0, 0, 0])[seat] || 0
  };
  for (var i = 0; i < 4; i++) {
    var p = g.players[i], mine = i === seat;
    v.players[rot(i)] = { hand: mine ? p.hand : new Array(p.hand.length), opened: p.opened, openedThisTurn: p.openedThisTurn, openedTurnNo: p.openedTurnNo, discards: p.discards };
  }
  v.table = g.table.map(function (m) { return { tiles: m.tiles.map(function (t) { var c = Object.assign({}, t); if (c.placedBy != null) c.placedBy = rot(c.placedBy); return c; }), kind: m.kind, owner: rot(m.owner) }; });
  var ho = function (h) { return h ? { hand: h.hand, scores: arr4(h.scores), winner: rot(h.winner), finishType: h.finishType, detail: h.detail ? arr4(h.detail) : null, totals: arr4(h.totals), ranks: arr4(h.ranks) } : null; };
  v.history = g.history.map(ho);
  v.handOver = ho(g.handOver);
  return v;
}
function send(ws, msg) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); } catch (e) {} }
function broadcastRoom(r) {
  var info = { t: 'room', code: r.code, seats: seatInfo(r), host: r.host, started: !!r.g, settings: r.settings, quick: !!r.quick, startsIn: r.quick && !r.g && r.quickUntil ? Math.max(0, r.quickUntil - Date.now()) : null };
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws) send(s.ws, Object.assign({ you: i }, info)); });
}
function broadcastState(r, extra) {
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws) send(s.ws, Object.assign({ t: 'state', view: viewFor(r, i) }, extra || {})); });
}

// ---- oyun akışı ----
// ---- Rakibin eline bak / Tokat: haklar, hedef ve süreler sunucuda ----
var PEEK_MS = 8000, PREP_MS = 15000, MAX_SKINS = 5;
function beginPrep(r) {
  r.charges = r.seats.map(function (s) { return s && !s.bot ? Math.min(MAX_SKINS, Math.max(0, parseInt(s.skins) || 0)) : 0; }); // her elde yenilenir, birikmez
  r.peeks = {}; r.prepDone = {};
  var any = r.charges.some(function (c) { return c > 0; });
  r.prepUntil = any ? Date.now() + PREP_MS : 0;
}
function endPeek(r, from, reason) {
  var p = r.peeks[from]; if (!p) return; clearTimeout(p.timer); clearTimeout(p.botTimer); delete r.peeks[from];
  if (r.charges[from] > 0 && r.prepUntil) r.prepUntil = Math.max(r.prepUntil, Date.now() + 6000); // kalan hak için 6 sn ek süre
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws) send(s.ws, { t: 'peekEnd', from: rotateIdx(from, i), target: rotateIdx(p.target, i), reason: reason }); });
  log(r, r.seats[from].name + ' bakışı bitti: ' + reason);
}
function handlePeek(r, seat, m) {
  var g = r.g; if (!g) throw new Error('oyun başlamadı');
  if (!r.prepUntil || Date.now() >= r.prepUntil) throw new Error('Yetenek yalnızca el başındaki hazırlık aşamasında kullanılır.');
  if (r.peeks[seat]) throw new Error('Zaten bir rakibe bakıyorsun.');
  if (!(r.charges[seat] > 0)) throw new Error('Bu elde kullanım hakkın kalmadı.');
  var target = (parseInt(m.target) + seat) % 4; // istemci döndürülmüş koltuk gönderir
  if (isNaN(target) || target === seat || target < 0 || target > 3) throw new Error('geçersiz hedef');
  r.charges[seat]--;
  var until = Date.now() + PEEK_MS, pk = { target: target, until: until };
  r.peeks[seat] = pk;
  if (r.prepUntil < until + 500) r.prepUntil = until + 500; // bakış sürerken oyun başlamaz
  pk.timer = setTimeout(function () { endPeek(r, seat, 'time'); }, PEEK_MS);
  var me = r.seats[seat];
  send(me.ws, { t: 'peek', target: rotateIdx(target, seat), charges: r.charges[seat], left: PEEK_MS, hand: g.players[target].hand.map(function (t) { return { c: t.c, n: t.n, fake: t.fake, id: t.id }; }) }); // taşlar sadece bakana
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws && i !== seat) send(s.ws, { t: 'peekAnim', from: rotateIdx(seat, i), target: rotateIdx(target, i), left: PEEK_MS }); });
  var ts = r.seats[target];
  if (ts.bot || !ts.ws || ts.ws.readyState !== 1) { if (Math.random() < 0.45) pk.botTimer = setTimeout(function () { if (r.peeks[seat] === pk) endPeek(r, seat, 'slap'); }, 1500 + Math.random() * 5000); }
  log(r, me.name + ' ' + ts.name + "'in eline bakıyor");
}
function handleSlap(r, seat, m) {
  var from = (parseInt(m.from) + seat) % 4, pk = r.peeks[from];
  if (!pk || pk.target !== seat) throw new Error('Sana bakan yok.');
  if (Date.now() >= pk.until) throw new Error('Süre doldu.');
  endPeek(r, from, 'slap');
}
// Koltuğa oturan oyuncunun Masa Giriş Skini: yalnızca hesabında sahip olduğu skin herkese gösterilir (hesapsız istemcide skin yok)
function sanitizeSeat(r, s) {
  if (!s || !s.avatar || !s.avatar.intro) return;
  if (!s.acc) { delete s.avatar.intro; return; }
  Accounts.auth(s.acc, function (e, p) { if (e || !p || !Accounts.ownsIntro(p, s.avatar.intro)) { if (s.avatar) delete s.avatar.intro; broadcastRoom(r); } });
}
function accOf(m) { return m.acc && typeof m.acc.id === 'string' && typeof m.acc.token === 'string' ? { id: m.acc.id.slice(0, 40), token: m.acc.token.slice(0, 80) } : null; }
// el / maç bitince hesaplara ödül yaz (yalnızca hesabı olan gerçek oyuncular); sonucu oyuncuya 'reward' mesajıyla bildir
function rewardIfOver(r) {
  var g = r.g; if (!g || g.phase !== 'handover') return;
  if (!r.rewarded) r.rewarded = {};
  if (r.rewarded[g.hand]) return; r.rewarded[g.hand] = true;
  var ho = g.handOver, humans = r.seats.filter(function (s) { return s && !s.bot && s.acc; }).length;
  if (humans < 1) return;
  r.seats.forEach(function (s, i) {
    if (!s || s.bot || !s.acc) return;
    Accounts.grant(s.acc, function (p) {
      var out = { hand: g.hand };
      out.handXp = Accounts.applyHand(p, ho && ho.winner === i, 1);
      if (g.finished && ho && ho.ranks) { var m = Accounts.applyMatch(p, ho.ranks[i], g.totalHands || 12, 1); out.matchXp = m.xp; out.coins = m.coins; out.rank = ho.ranks[i]; }
      return out;
    }, function (e, out, view) { if (!e && s.ws && s.ws.readyState === 1) send(s.ws, { t: 'reward', reward: out, player: view }); });
  });
}
function startGame(r) {
  fillBots(r);
  r.matchId = r.code + '-' + Date.now().toString(36); // Masa Giriş Skini gösterimi bu kimlikle bir kez (yeniden bağlanma yeni hak vermez)
  r.g = Okey.newGame({ names: r.seats.map(function (s) { return s.name; }), jokerCapturePenalty: r.settings.jokerPenalty, totalHands: r.settings.totalHands });
  Okey.startHand(r.g);
  beginPrep(r);
  log(r, 'oyun başladı');
  broadcastRoom(r);
  broadcastState(r, { event: 'handStart' });
  scheduleBots(r);
}
function nextHand(r) {
  if (!r.g || r.g.phase !== 'handover' || r.g.finished) return;
  Okey.startHand(r.g);
  beginPrep(r);
  broadcastState(r, { event: 'handStart' });
  scheduleBots(r);
}
function actorOf(g) { return g.phase === 'claim' ? Okey.claimant(g) : g.cp; }
function scheduleBots(r) {
  clearTimeout(r.timer); clearTimeout(r.claimTimer);
  var g = r.g; if (!g || g.phase === 'handover') return;
  if (r.prepUntil && Date.now() < r.prepUntil) { r.timer = setTimeout(function () { scheduleBots(r); }, r.prepUntil - Date.now() + 50); return; } // hazırlık aşaması: botlar bekler
  r.prepUntil = 0;
  var a = actorOf(g), s = r.seats[a];
  if (s.bot || !s.ws || s.ws.readyState !== 1) { // bot ya da bağlantısı kopan oyuncu: sunucu oynar
    r.timer = setTimeout(function () {
      try { Okey.botStep(g); } catch (e) { log(r, 'bot hatası ' + e.message); g.phase = 'play'; }
      broadcastState(r, { event: 'bot', actor: a });
      rewardIfOver(r);
      scheduleBots(r);
    }, g.phase === 'claim' ? Math.min(BOT_DELAY, 500) : BOT_DELAY);
    return;
  }
  if (g.phase === 'claim') { // insan talep süresi
    r.claimTimer = setTimeout(function () {
      if (r.g && r.g.phase === 'claim' && Okey.claimant(r.g) === a) { try { Okey.actClaim(r.g, a, false); } catch (e) {} broadcastState(r, { event: 'claimTimeout', actor: a }); rewardIfOver(r); scheduleBots(r); }
    }, r.settings.claimTime);
  }
}
function tileById(g, seat, id) { var h = g.players[seat].hand; for (var i = 0; i < h.length; i++) if (h[i].id === id) return h[i]; return null; }
function handleAct(r, seat, m) {
  var g = r.g; if (!g) throw new Error('oyun başlamadı');
  if (g.phase === 'handover') throw new Error('el bitti');
  var actor = actorOf(g);
  if (actor !== seat) throw new Error('Sıra sende değil.');
  var ids = function (arr) { return (arr || []).map(function (id) { var t = tileById(g, seat, id); if (!t) throw new Error('taş elinde değil'); return t; }); };
  var res = null;
  switch (m.kind) {
    case 'draw': Okey.actDraw(g); break;
    case 'take': Okey.actTake(g); break;
    case 'claim': Okey.actClaim(g, seat, true); break;
    case 'pass': Okey.actClaim(g, seat, false); break;
    case 'open': Okey.actOpen(g, (m.groups || []).map(ids)); break;
    case 'lay': (m.groups || []).forEach(function (gr) { Okey.actLay(g, ids(gr)); }); break;
    case 'add': Okey.actAdd(g, unrot(m.meld, seat, g), ids(m.tiles)); break;
    case 'swap': res = Okey.actSwapJoker(g, unrot(m.meld, seat, g), ids([m.tile])[0]); break;
    case 'discard': res = Okey.actDiscard(g, ids([m.tile])[0]); break;
    default: throw new Error('bilinmeyen hamle');
  }
  return res;
}
function unrot(meldIdx, seat, g) { return meldIdx; } // per indeksleri döndürülmez (tablo sırası aynı)

// ---- bağlantı ----
// ---- statik dosyalar: oyunun kendisi (public/) aynı adresten sunulur; PWA olarak ana ekrana eklenebilir ----
var fs = require('fs'), path = require('path');
var PUBLIC = path.join(__dirname, 'public');
// public.zip varsa ve public/ yoksa açılışta çıkar (GitHub'a klasör yüklemeden tek dosyayla kurulum)
function unzipPublic() {
  var zipPath = path.join(__dirname, 'public.zip');
  if (!fs.existsSync(zipPath) || fs.existsSync(path.join(PUBLIC, 'index.html'))) return;
  var zlib = require('zlib'), buf = fs.readFileSync(zipPath), n = 0;
  var eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); if (eocd < 0) { console.log('public.zip okunamadı'); return; }
  var count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16), p = cdOff;
  for (var i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    var method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    var nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    var name = buf.slice(p + 46, p + 46 + nlen).toString('utf8'); p += 46 + nlen + elen + clen;
    if (name.indexOf('..') >= 0 || name.indexOf(':') >= 0) continue;
    var rel = name.replace(/^public\//, ''); if (!rel || name.indexOf('public/') !== 0) continue;
    var out = path.join(PUBLIC, rel);
    if (name.slice(-1) === '/') { fs.mkdirSync(out, { recursive: true }); continue; }
    var lnlen = buf.readUInt16LE(lho + 26), lelen = buf.readUInt16LE(lho + 28), dataOff = lho + 30 + lnlen + lelen;
    var data = buf.slice(dataOff, dataOff + csize);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, method === 8 ? zlib.inflateRawSync(data) : data); n++;
  }
  console.log('public.zip açıldı: ' + n + ' dosya');
}
try { unzipPublic(); } catch (e) { console.log('public.zip hatası: ' + e.message); }
Accounts.init({ publicDir: PUBLIC }, function (e, mode) { console.log('hesap deposu: ' + mode + (e ? ' (' + e.message + ')' : '')); });
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8' };
var server = http.createServer(function (req, res) {
  var url = (req.url || '/').split('?')[0];
  if (url === '/durum') { Accounts.count(function (n) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Döngü sunucusu çalışıyor. Sürüm: v9.50. Mekânlar: ' + QUICK_THEMES.join(', ') + '. Odalar: ' + Object.keys(rooms).length + '. Hesap deposu: ' + Accounts.modeName() + ', oyuncu: ' + n); }); return; }
  if (url === '/api/masalar') { // lobi: bekleyen hızlı masalar (mekân, el sayısı, oyuncu sayısı)
    var list = []; Object.keys(rooms).forEach(function (c) { var q = rooms[c]; if (q.quick && !q.g) list.push({ theme: q.settings.theme, totalHands: q.settings.totalHands, players: q.seats.filter(function (x) { return x && !x.bot && x.ws && x.ws.readyState === 1; }).length }); });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ rooms: list, online: wss ? wss.clients.size : 0 })); return;
  }
  if (Accounts.handleHttp(req, res, url)) return;
  if (url === '/') url = '/index.html';
  var file = path.normalize(path.join(PUBLIC, url));
  if (file.indexOf(PUBLIC) !== 0) { res.writeHead(403); res.end(); return; }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('bulunamadı'); return; }
    var ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || ext === '.js' ? 'no-cache' : 'public, max-age=86400' });
    fs.createReadStream(file).pipe(res);
  });
});
var wss = new WebSocketServer({ server: server });
wss.on('connection', function (ws) {
  var me = { room: null, seat: -1 };
  ws.on('message', function (data) {
    var m; try { m = JSON.parse(data); } catch (e) { return; }
    try { handle(ws, me, m); } catch (e) { send(ws, { t: 'error', msg: e.message }); }
  });
  ws.on('close', function () {
    var r = me.room; if (!r || me.seat < 0) return;
    var s = r.seats[me.seat]; if (s && s.ws === ws) { s.ws = null; }
    broadcastRoom(r);
    if (r.g) scheduleBots(r); // kopan oyuncunun yerine sunucu oynar
    else if (!r.seats.some(function (x) { return x && !x.bot && x.ws; })) { clearTimeout(r.timer); delete rooms[r.code]; }
  });
});
function handle(ws, me, m) {
  var r;
  if (m.t === 'create') {
    r = newRoom(); var s0 = { name: (m.name || 'Oyuncu').slice(0, 14), avatar: m.avatar || null, skins: m.skins || 0, bot: false, token: token(), ws: ws, acc: accOf(m) };
    r.seats[0] = s0; r.host = 0; me.room = r; me.seat = 0; sanitizeSeat(r, s0);
    if (m.settings) Object.assign(r.settings, { claimTime: Math.max(3000, Math.min(20000, (m.settings.claimTime || 8) * 1000)), jokerPenalty: m.settings.jokerPenalty || 10, totalHands: m.settings.totalHands, theme: String(m.settings.theme || 'koy').slice(0, 24) }); // tema maç boyunca sabit, herkes aynı mekânı görür
    send(ws, { t: 'joined', code: r.code, seat: 0, token: s0.token });
    broadcastRoom(r); log(r, 'oda kuruldu: ' + s0.name);
    return;
  }
  if (m.t === 'quick') { // Hızlı Katıl: ortak kuyruk (aynı el modu), 4 kişi olunca ya da QUICK_WAIT sonra botla doldurup başlar
    var th = m.settings && (m.settings.totalHands === 1 || m.settings.totalHands === 6) ? m.settings.totalHands : 12;
    var wantTheme = m.settings && ALL_THEMES.indexOf(m.settings.theme) >= 0 ? m.settings.theme : null; // oda = mekân: istenen mekândaki bekleyen masaya oturur
    r = null; Object.keys(rooms).forEach(function (c) { var q = rooms[c]; if (!r && q.quick && !q.g && q.settings.totalHands === th && (!wantTheme || q.settings.theme === wantTheme) && freeSeat(q) >= 0) r = q; });
    if (!r) { r = newRoom(); r.quick = true; r.host = null; r.settings.totalHands = th; r.settings.theme = wantTheme || QUICK_THEMES[Math.floor(Math.random() * QUICK_THEMES.length)]; r.quickUntil = Date.now() + QUICK_WAIT; r.quickTimer = setTimeout(function () { if (!r.g && r.seats.some(function (x) { return x && !x.bot && x.ws && x.ws.readyState === 1; })) startGame(r); }, QUICK_WAIT); log(r, 'hızlı masa açıldı (' + th + ' el)'); }
    var qi = freeSeat(r), qs = { name: (m.name || 'Oyuncu').slice(0, 14), avatar: m.avatar || null, skins: m.skins || 0, bot: false, token: token(), ws: ws, acc: accOf(m) };
    r.seats[qi] = qs; me.room = r; me.seat = qi; sanitizeSeat(r, qs);
    send(ws, { t: 'joined', code: r.code, seat: qi, token: qs.token });
    broadcastRoom(r); log(r, qs.name + ' hızlı katıldı');
    if (freeSeat(r) < 0) { clearTimeout(r.quickTimer); startGame(r); } // 4 gerçek oyuncu → hemen
    return;
  }
  if (m.t === 'join') {
    r = rooms[(m.code || '').toUpperCase()]; if (!r) throw new Error('Oda bulunamadı. Kodu kontrol et.');
    // yeniden bağlanma
    var back = -1;
    if (m.token) r.seats.forEach(function (s, i) { if (s && s.token === m.token) back = i; });
    if (back >= 0) { r.seats[back].ws = ws; me.room = r; me.seat = back; send(ws, { t: 'joined', code: r.code, seat: back, token: m.token }); broadcastRoom(r); if (r.g) { send(ws, { t: 'state', view: viewFor(r, back), event: 'resync' }); scheduleBots(r); } return; }
    if (r.g) throw new Error('Bu masada oyun başlamış.');
    var i = freeSeat(r); if (i < 0) throw new Error('Masa dolu.');
    var s = { name: (m.name || 'Oyuncu').slice(0, 14), avatar: m.avatar || null, skins: m.skins || 0, bot: false, token: token(), ws: ws, acc: accOf(m) };
    r.seats[i] = s; me.room = r; me.seat = i; sanitizeSeat(r, s);
    send(ws, { t: 'joined', code: r.code, seat: i, token: s.token });
    broadcastRoom(r); log(r, s.name + ' katıldı');
    return;
  }
  r = me.room; if (!r) throw new Error('önce odaya katıl');
  if (m.t === 'leave') { r.seats[me.seat] = r.g ? r.seats[me.seat] : null; if (r.g) r.seats[me.seat].ws = null; me.room = null; broadcastRoom(r); if (r.quick && !r.g && !r.seats.some(function (x) { return x && !x.bot; })) { clearTimeout(r.quickTimer); delete rooms[r.code]; } return; }
  if (m.t === 'start') { if (me.seat !== r.host) throw new Error('Oyunu yalnızca oda sahibi başlatır.'); if (r.g) throw new Error('zaten başladı'); startGame(r); return; }
  if (m.t === 'next') { if (me.seat !== r.host) throw new Error('Sonraki eli oda sahibi başlatır.'); nextHand(r); return; }
  if (m.t === 'act') {
    if (r.prepUntil && Object.keys(r.peeks || {}).length) throw new Error('Bakış sürerken hamle yapılamaz.');
    var res = handleAct(r, me.seat, m);
    broadcastState(r, { event: 'act', actor: me.seat, kind: m.kind, result: res });
    rewardIfOver(r);
    scheduleBots(r);
    return;
  }
  if (m.t === 'peek') { handlePeek(r, me.seat, m); return; }
  if (m.t === 'slap') { handleSlap(r, me.seat, m); return; }
  if (m.t === 'prepDone') { // bütün insan oyuncular "Oyuna geç" dediyse ve bakış yoksa hazırlık biter, botlar başlar
    if (!r.prepDone) r.prepDone = {}; r.prepDone[me.seat] = true;
    var allDone = r.seats.every(function (s, i) { return !s || s.bot || !s.ws || s.ws.readyState !== 1 || r.prepDone[i]; });
    if (allDone && r.prepUntil && !Object.keys(r.peeks || {}).length) { r.prepUntil = 0; broadcastState(r, { event: 'prepEnd' }); scheduleBots(r); }
    return;
  }
  if (m.t === 'ping') { send(ws, { t: 'pong' }); return; }
}
// boş odaları temizle
setInterval(function () { var now = Date.now(); Object.keys(rooms).forEach(function (c) { var r = rooms[c]; var alive = r.seats.some(function (s) { return s && !s.bot && s.ws && s.ws.readyState === 1; }); if (!alive && now - r.created > 30 * 60 * 1000) { clearTimeout(r.timer); delete rooms[c]; } }); }, 60000);

server.listen(PORT, function () { console.log('Döngü sunucusu ' + PORT + ' portunda'); });
