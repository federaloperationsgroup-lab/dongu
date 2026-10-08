// Döngü (Americano Okey) — çevrim içi oda sunucusu
// Node.js 18+ ve "ws" paketi. Kural motoru (engine.js) sunucuda çalışır; her oyuncuya yalnızca kendi taşları gönderilir.
// Çalıştırma: node server.js   (PORT ortam değişkeni ile port seçilir, varsayılan 8080)
'use strict';
var http = require('http');
var WebSocketServer = require('ws').WebSocketServer;
var Okey = require('./engine.js');
var Accounts = require('./accounts.js');
var Economy = require('./economy.js');

var PORT = process.env.PORT || 8080;
var BOT_DELAY = parseInt(process.env.BOT_DELAY) || 900;        // bot hamle gecikmesi (ms)
var CLAIM_TIMEOUT = 8000;   // Al / Geç süresi (ms)
var BOT_NAMES = ['Ali', 'Ayşe', 'Mehmet'];
var BOT_AVATARS = { Ali: { bot: 'ali' }, 'Ayşe': { bot: 'ayse' }, Mehmet: { bot: 'mehmet' } };

var rooms = {}; // code -> room
var QUICK_WAIT = parseInt(process.env.QUICK_WAIT) || 20000; // Hızlı Katıl bekleme süresi (ms); dolmazsa botlar oturur
var PAID_WAIT = parseInt(process.env.PAID_WAIT) || 60000;    // bahisli masa bekleme süresi (ms): dolmazsa en az 2 gerçek oyuncuyla botlar oturur, tek kişiyse iade (5 Ekim 2026 kararı)
var QUICK_THEMES = ['koy', 'kahve', 'sokak', 'sanayi', 'cinar', 'soba', 'apartman', 'bag', 'kor', 'gok', 'inci', 'kok', 'yildiz']; // v9.67: 5 arena mekânı (Balıkçı Barınağı kaldırıldı)
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
  return r.seats.map(function (s, i) { return s ? { i: i, name: s.name, avatar: s.avatar, bot: !!s.bot, connected: !!(s.bot || (s.ws && s.ws.readyState === 1)), prof: s.prof || null } : null; }); // prof (v9.74): seviye, maç/galibiyet, kostüm sayısı, kıraathane adı — profil kartı için
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
    prepLeft: (r.prepUntil && Date.now() < r.prepUntil) ? r.prepUntil - Date.now() : 0, charges: (r.charges || [0, 0, 0, 0])[seat] || 0, freeBak: seatFree(r.seats[seat], 'bak'),
    peeks: Object.keys(r.peeks || {}).map(function (f) { var pk = r.peeks[f], o = { from: rot(parseInt(f)), target: rot(pk.target), left: Math.max(0, pk.until - Date.now()) }; if (parseInt(f) === seat) o.hand = g.players[pk.target].hand.map(function (t) { return { c: t.c, n: t.n, fake: t.fake, id: t.id }; }); return o; }), // süren bakışlar (yeniden bağlanınca animasyon ve tokat düğmesi kalan süreyle geri gelir; taşlar yalnız bakanın kendi görünümünde)
    nextIn: (g.phase === 'handover' && !g.finished && r.nextAt) ? Math.max(0, r.nextAt - Date.now()) : 0, canNext: canStartNext(r, seat),
    turnLeft: (r.turnUntil && Date.now() < r.turnUntil && g.phase !== 'claim' && g.phase !== 'handover') ? r.turnUntil - Date.now() : 0, turnMs: TURN_MS,
    econ: { humans: humanCount(r), coef: Economy.humanCoef(humanCount(r)), training: humanCount(r) <= 1, stake: r.settings.stake || 'sosyal', entry: r.settings.entry || 0, version: Economy.CONFIG.version }
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
  var info = { t: 'room', code: r.code, seats: seatInfo(r), host: r.host, started: !!r.g, settings: r.settings, quick: !!r.quick, venue: r.venue ? r.venue.code : null, startsIn: r.quick && !r.g && r.quickUntil ? Math.max(0, r.quickUntil - Date.now()) : null };
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws) send(s.ws, Object.assign({ you: i }, info)); });
}
function broadcastState(r, extra) {
  if (r.g && r.g.phase === 'handover') scheduleNext(r); // el bitti: geri sayım görünüme girsin
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws) { var ex = Object.assign({}, extra || {}); if (ex.actor != null) ex.actor = rotateIdx(ex.actor, i); send(s.ws, Object.assign({ t: 'state', view: viewFor(r, i) }, ex)); } }); // actor alıcıya göre döndürülür (önce ham koltuk gidiyordu: 0 dışındaki koltuklarda "senin" olayları yanlış kişiye yazılıyordu)
}

// ---- oyun akışı ----
// ---- Rakibin eline bak / Tokat: haklar, hedef ve süreler sunucuda ----
var PEEK_MS = 8000, PREP_MS = parseInt(process.env.PREP_MS) || 15000, MAX_SKINS = 5;
var TURN_MS = parseInt(process.env.TURN_MS) || 30000; var DISC_GRACE_MS = parseInt(process.env.DISC_GRACE_MS) || 10000; // bağlantısı kopan (çıkmamış) insanın sırası: 10 sn tolerans (sayfa yenileme hamleyi kaybettirmesin), sonra sunucu oynar // hamle süresi (AFK): taş alma ve taş atma için ayrı ayrı 30 sn (v9.73; önce 45) // PREP_MS: el başı hazırlık/hazır olma süresi (test için kısaltılabilir)
var NEXT_DELAY = parseInt(process.env.NEXT_DELAY) || 12000; // el bitince sonraki el kendiliğinden (ms); oda sahibi / hızlı masada herkes daha erken başlatabilir
var ALLOW_LOCKED_STAKES = process.env.ALLOW_LOCKED_STAKES === '1'; // Usta / Efsane masaları (100 bin+) bayrakla açılır
function humanCount(r) { return r.seats.filter(function (s) { return s && !s.bot; }).length; }
function refundEscrow(seat, why) { // emanetteki girişi iade et (maç başlamadı / iptal)
  if (!seat || !seat.escrow || !seat.acc) return; var amt = seat.escrow; seat.escrow = 0;
  Accounts.grant(seat.acc, function (p) { if (p.escrow) { p.coins = (p.coins || 0) + p.escrow.amount; delete p.escrow; } return { refund: amt }; }, function (e, out, view) { if (!e && seat.ws && seat.ws.readyState === 1) send(seat.ws, { t: 'me', player: view }); });
}
function cancelPaidRoom(r, msg) { // ücretli hızlı masa dolmadı: herkese iade, oda kapanır
  r.seats.forEach(function (s) { if (!s || s.bot) return; refundEscrow(s, 'masa dolmadı'); if (s.ws && s.ws.readyState === 1) send(s.ws, { t: 'cancel', msg: msg }); });
  clearTimeout(r.quickTimer); delete rooms[r.code]; log(r, 'ücretli masa iptal: ' + msg);
}
function venueHostReward(r, now) { // kıraathane masası: maç bitti → sahibin kasasına ev sahipliği ödülü (uygunluk + tavanlar venues.js)
  if (!r.venue || r.hosted) return; r.hosted = true;
  var v = Venues.ofCode(r.venue.code); if (!v) return;
  var th = r.g.totalHands || 12, need = Math.ceil(th * 0.7), humans = [], elig = 0, acts = 0;
  r.seats.forEach(function (s, i) { if (!s || s.bot || !s.acc) return; humans.push(s.acc.id); if ((r.elig ? r.elig[i] : 0) >= need) elig++; acts += (r.actsAll ? r.actsAll[i] : 0); });
  var out = Venues.hostReward(v, { totalHands: th, humans: humans, eligibleCount: elig, durationMs: now - (r.matchStart || now), humanActs: acts }, now);
  log(r, 'ev sahipliği: ' + (out.gold ? '+' + out.gold : 'yok (' + (out.reasons || []).join('; ') + ')'));
  r.seats.forEach(function (s) { if (s && !s.bot && s.acc && s.acc.id === v.ownerId && s.ws && s.ws.readyState === 1) send(s.ws, { t: 'reward', reward: { hand: r.g.hand, gold: 0, xp: 0, lines: out.gold ? out.lines : ['Ev sahipliği ödülü yok: ' + out.reasons.join(', ')] }, player: null }); });
  var lv = live[r.venue.code]; if (lv) Object.keys(lv.conns).forEach(function (cid) { var c = lv.conns[cid]; if (c.acc && c.acc.id === v.ownerId) send(c.ws, { t: 'venue', venue: Venues.ownerView(v, now), lines: out.gold ? out.lines : null }); });
}
// ---- kıraathane canlı varlık (presence): mekânda dolaşan oyuncular ----
var live = {}; // code → {conns: {cid: {ws, acc, name, avatar, gx, gy, at}}}
var cidSeq = 1;
function venueTables(code) { var out = {}; Object.keys(rooms).forEach(function (c) { var r = rooms[c]; if (!r.venue || r.venue.code !== code) return; out[r.venue.iid] = { code: r.code, seated: r.seats.filter(function (s) { return s && !s.bot; }).length, started: !!r.g, finished: !!(r.g && r.g.finished), totalHands: r.settings.totalHands }; }); return out; }
function venueBroadcast(code, msg, exceptCid) { var lv = live[code]; if (!lv) return; Object.keys(lv.conns).forEach(function (cid) { if (cid !== exceptCid) send(lv.conns[cid].ws, msg); }); }
function venuePlayers(code) { var lv = live[code]; if (!lv) return []; return Object.keys(lv.conns).map(function (cid) { var c = lv.conns[cid]; return { cid: cid, id: c.acc ? c.acc.id : null, name: c.name, avatar: c.avatar, gx: c.gx, gy: c.gy }; }); }
function venueLeave(me) { var code = me.venue; if (!code) return; var lv = live[code]; if (lv && lv.conns[me.cid]) { delete lv.conns[me.cid]; venueBroadcast(code, { t: 'vleave', cid: me.cid }); if (!Object.keys(lv.conns).length) delete live[code]; } me.venue = null; }
function leavePenalty(r, i) { // bahisli maçtan bilerek çıkan: giriş havuzda kalır + giriş kadar ceza cüzdandan havuza (toplam 2×), hükmen son, geri dönemez (5 Ekim 2026 kararı 2)
  var s = r.seats[i], entry = r.settings.entry || 0; if (!s || !s.acc || !entry) return; s.penalty = 0;
  Accounts.grant(s.acc, function (p) { var pen = Math.min(entry, Math.max(0, p.coins || 0)); p.coins = (p.coins || 0) - pen; return { pen: pen }; }, function (e, out, view) {
    if (e) return; s.penalty = out.pen; r.poolExtra = (r.poolExtra || 0) + out.pen;
    log(r, s.name + ' maçtan çıktı: hükmen son, ceza ' + out.pen + ' havuza eklendi');
    r.seats.forEach(function (x) { if (x && !x.bot && x.ws && x.ws.readyState === 1 && x !== s) send(x.ws, { t: 'reward', reward: { hand: r.g ? r.g.hand : 0, gold: 0, xp: 0, lines: [s.name + ' maçtan çıktı: hükmen son sıra; girişi ve ' + out.pen + ' altın cezası havuza eklendi.'] }, player: null }); });
  });
}
function settlePool(r) { // maç bitti: havuz (4 × giriş) sıralamaya göre dağıtılır; %5 gider; emanet kapanır
  var g = r.g, entry = r.settings.entry || 0; if (!entry || r.pooled) return; r.pooled = true;
  var ranks = g.handOver.ranks, parts = r.seats.map(function (s) { return !!(s && !s.bot && s.acc); }), forf = r.forfeit || [false, false, false, false];
  var pool = Economy.payoutPool(entry, ranks, { participants: parts, forfeits: forf, extra: r.poolExtra || 0 });
  r.seats.forEach(function (s, i) {
    if (!parts[i]) return;
    Accounts.grant(s.acc, function (p) { if (p.escrow) delete p.escrow; p.coins = (p.coins || 0) + pool.shares[i]; return { share: pool.shares[i] }; }, function (e, out, view) {
      if (e) return; var net = pool.shares[i] - entry - (s.penalty || 0);
      var line = forf[i] ? 'Hükmen son: havuzdan pay yok; giriş ' + entry + (s.penalty ? ' + ceza ' + s.penalty : '') + ' havuzda kaldı (net −' + (entry + (s.penalty || 0)) + ')' : 'Havuz: ' + pool.total + ' altın (gider ' + pool.fee + (r.poolExtra ? ', cezalar ' + r.poolExtra : '') + ') → payın ' + pool.shares[i] + ' altın; giriş ' + entry + ' → net ' + (net >= 0 ? '+' : '') + net;
      var msg = { t: 'reward', reward: { hand: g.hand, pool: true, gold: 0, xp: 0, lines: [line] }, player: view };
      if (s.ws && s.ws.readyState === 1) send(s.ws, msg); else s.pendingReward = msg;
    });
  });
  log(r, 'havuz dağıtıldı: ' + pool.shares.join('/') + (r.poolExtra ? ' (cezalar ' + r.poolExtra + ')' : '') + ' hükmen: ' + forf.map(function (f) { return f ? 1 : 0; }).join(''));
}
function beginHandStats(r) { // katılım ölçümü (el başına): insan hamlesi, bot devralma hamlesi, kopuk süre
  var now = Date.now();
  r.handStart = now; r.part = r.seats.map(function (s) { return { acts: 0, botActs: 0, discMs: 0, discAt: (s && !s.bot && (!s.ws || s.ws.readyState !== 1)) ? now : 0 }; });
  if (!r.elig) { r.elig = [0, 0, 0, 0]; r.factors = [[], [], [], []]; }
}
function partOf(r, i) { if (!r.part) beginHandStats(r); return r.part[i]; }
function seatEligible(r, i, now) { // uygun insan eli: bağlı süre ≥ %70 ve kendi hamlelerinin en az yarısını insan yapmış
  var s = r.seats[i]; if (!s || s.bot) return false;
  var pt = partOf(r, i), disc = pt.discMs + (pt.discAt ? now - pt.discAt : 0), dur = Math.max(1, now - (r.handStart || now));
  return disc <= dur * 0.3 && pt.acts >= pt.botActs;
}
function beginPrep(r) {
  beginHandStats(r);
  r.charges = r.seats.map(function (s) { return s && !s.bot ? Math.min(MAX_SKINS, Math.max(0, parseInt(s.skins) || 0)) : 0; }); // her elde yenilenir, birikmez
  r.peeks = {}; r.prepDone = {};
  // Hazırlık/hazır olma aşaması: masada bağlı bir insan varsa her el başında en çok PREP_MS; bütün insanlar "Oyuna geç" deyince (prepDone) erken biter.
  // (v9.64: önceden yalnız bakış hakkı olan varsa açılıyordu; açıklama penceresi okunurken botlar oynamaya başlıyordu.)
  var humans = r.seats.some(function (s) { return s && !s.bot && s.ws && s.ws.readyState === 1; });
  r.prepUntil = humans ? Date.now() + PREP_MS : 0;
}
function seatFree(s, id) { return (s && s.free && s.free[id]) || 0; } // koltuğun hesaptan okunmuş ücretsiz skin hakları (sanitizeSeat doldurur)
function endPeek(r, from, reason) {
  var p = r.peeks[from]; if (!p) return; clearTimeout(p.timer); clearTimeout(p.botTimer); delete r.peeks[from];
  if ((r.charges[from] > 0 || seatFree(r.seats[from], 'bak') > 0) && r.prepUntil) r.prepUntil = Math.max(r.prepUntil, Date.now() + 6000); // kalan hak için 6 sn ek süre
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws) send(s.ws, { t: 'peekEnd', from: rotateIdx(from, i), target: rotateIdx(p.target, i), reason: reason }); });
  log(r, r.seats[from].name + ' bakışı bitti: ' + reason);
}
function handlePeek(r, seat, m) {
  var g = r.g; if (!g) throw new Error('oyun başlamadı');
  if (!r.prepUntil || Date.now() >= r.prepUntil) throw new Error('Yetenek yalnızca el başındaki hazırlık aşamasında kullanılır.');
  if (r.peeks[seat]) throw new Error('Zaten bir rakibe bakıyorsun.');
  var me = r.seats[seat], usedFree = false;
  if (!(r.charges[seat] > 0) && !(seatFree(me, 'bak') > 0)) throw new Error('Bu elde kullanım hakkın kalmadı.');
  var target = (parseInt(m.target) + seat) % 4; // istemci döndürülmüş koltuk gönderir
  if (isNaN(target) || target === seat || target < 0 || target > 3) throw new Error('geçersiz hedef');
  if (r.charges[seat] > 0) r.charges[seat]--;
  else { // ücretsiz başlangıç hakkı: kullanım kabul edildiği anda hesaptan düşer (bir kez; yakalanınca geri gelmez)
    usedFree = true; me.free.bak--;
    Accounts.grant(me.acc, function (p) { Accounts.useFreeSkin(p, 'bak'); return {}; }, function (e, out, view) { if (!e && me.ws && me.ws.readyState === 1) send(me.ws, { t: 'me', player: view }); });
  }
  var until = Date.now() + PEEK_MS, pk = { target: target, until: until };
  r.peeks[seat] = pk;
  if (r.prepUntil < until + 500) r.prepUntil = until + 500; // bakış sürerken oyun başlamaz
  pk.timer = setTimeout(function () { endPeek(r, seat, 'time'); }, PEEK_MS);
  send(me.ws, { t: 'peek', target: rotateIdx(target, seat), charges: r.charges[seat], free: seatFree(me, 'bak'), usedFree: usedFree, left: PEEK_MS, hand: g.players[target].hand.map(function (t) { return { c: t.c, n: t.n, fake: t.fake, id: t.id }; }) }); // taşlar sadece bakana
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
function sanitizeSeat(r, s) { // koltuğun skin bilgisi hesaptan: Masa Giriş Skini sahipliği ve Çaktırmadan Bak hakkı istemcinin beyanına değil hesaba göre
  if (!s) return;
  if (!s.acc) { s.skins = 0; if (s.avatar) delete s.avatar.intro; return; }
  Accounts.auth(s.acc, function (e, p) {
    if (e || !p) { s.skins = 0; s.free = null; if (s.avatar) delete s.avatar.intro; broadcastRoom(r); return; }
    s.skins = Accounts.introCount(p);
    var vn = Venues.ofOwner(p.id); s.prof = { level: Accounts.levelOf(p.xp).level, matches: (p.stats && p.stats.matches) || 0, wins: (p.stats && p.stats.wins) || 0, owned: (p.owned || []).length, venue: vn ? vn.name : null }; // v9.74 profil kartı
    if (Accounts.ensureSkinGift(p)) Accounts.save(p);
    s.free = Object.assign({}, p.freeSkins || {}); // ücretsiz başlangıç hakları (Çaktırmadan Bak + Masa Giriş Skini denemesi); kullanımda hesaptan düşer
    if (s.avatar) {
      var before = JSON.stringify(s.avatar); s.avatar = Accounts.cleanCosmetics(p, Accounts.cleanAvatar(s.avatar)); s.introTrial = null;
      if (s.avatar.intro && !Accounts.ownsIntro(p, s.avatar.intro)) { if (Accounts.freeLeft(p, s.avatar.intro) > 0) s.introTrial = s.avatar.intro; else delete s.avatar.intro; } // sahip değil: ücretsiz deneme hakkı varsa bu maç için kalır (maç başında düşer), yoksa kalkar
      if (JSON.stringify(s.avatar) !== before) broadcastRoom(r);
    } // masadaki görünüm hesaptaki sahipliğe göre (ücretli kozmetik + Masa Giriş Skini)
  });
}
function consumeIntroTrials(r) { // maç başladı (1. el): deneme olarak kuşanılmış Masa Giriş Skini herkese bir kez oynar; hak bu anda düşer (sayfa yenileme / yeniden bağlanma yeni gösterim vermez: matchId)
  r.seats.forEach(function (s) {
    if (!s || s.bot || !s.introTrial || !s.acc) return;
    var id = s.introTrial; s.introTrial = null; if (s.free && s.free[id] > 0) s.free[id]--;
    Accounts.grant(s.acc, function (p) { Accounts.useFreeSkin(p, id); return {}; }, function (e, out, view) { if (!e && s.ws && s.ws.readyState === 1) send(s.ws, { t: 'me', player: view, introTrialUsed: id }); });
    log(r, s.name + ' Masa Giriş Skini denemesi: ' + id);
  });
}
function accOf(m) { return m.acc && typeof m.acc.id === 'string' && typeof m.acc.token === 'string' ? { id: m.acc.id.slice(0, 40), token: m.acc.token.slice(0, 80) } : null; }
// el / maç bitince hesaplara ödül yaz (yalnızca hesabı olan gerçek oyuncular); sonucu oyuncuya 'reward' mesajıyla bildir
function rewardIfOver(r) {
  var g = r.g; if (!g || g.phase !== 'handover') return;
  scheduleNext(r);
  if (!r.rewarded) r.rewarded = {};
  if (r.rewarded[g.hand]) return; r.rewarded[g.hand] = true;
  var now = Date.now(), ho = g.handOver;
  // uygunluk ve katsayı: bu elde uygun insan sayısı (bot koltuğu sayılmaz)
  var elig = r.seats.map(function (s, i) { return seatEligible(r, i, now); });
  if (!r.actsTot) { r.actsTot = [0, 0, 0, 0]; r.botActsTot = [0, 0, 0, 0]; }
  r.seats.forEach(function (s, i) { if (!s || s.bot) return; var pt = partOf(r, i); r.actsTot[i] += pt.acts; r.botActsTot[i] += pt.botActs; });
  if (g.finished) { // hükmen son: bilerek çıktı, maç bittiğinde bağlı değil ya da hamlelerinin yarısından fazlasını bot yaptı (5 Ekim 2026 kararı 1c)
    if (!r.forfeit) r.forfeit = [false, false, false, false];
    r.seats.forEach(function (s, i) { if (!s || s.bot) return; if (s.left || !(s.ws && s.ws.readyState === 1) || r.botActsTot[i] > r.actsTot[i]) r.forfeit[i] = true; });
  }
  var humans = elig.filter(Boolean).length, coef = Economy.humanCoef(humans);
  r.lastHandEcon = { humans: humans, coef: coef, elig: elig.slice() };
  if (!r.elig) { r.elig = [0, 0, 0, 0]; r.factors = [[], [], [], []]; }
  elig.forEach(function (e, i) { if (e) r.elig[i]++; });
  if (g.finished) { settlePool(r); venueHostReward(r, now); }
  r.seats.forEach(function (s, i) {
    if (!s || s.bot || !s.acc) return;
    if (!elig[i]) { if (s.ws && s.ws.readyState === 1) send(s.ws, { t: 'reward', reward: { lines: ['Bu el ödül dışı: bağlantı/katılım yetersiz'], gold: 0, xp: 0 }, player: null }); return; }
    Accounts.grant(s.acc, function (p) {
      var out = Economy.settleHand(p, { ranks: ho.ranks, me: i, humans: humans, won: ho.winner === i }, now);
      r.factors[i].push(out.training ? 0 : out.coef * out.rate);
      var res = { hand: g.hand, gold: out.gold, xp: out.xp, lines: out.lines.slice(), levelUp: out.levelUp, training: out.training, coef: out.coef, rate: out.rate, dayHands: out.dayHands };
      if (g.finished) { var ff = !!(r.forfeit && r.forfeit[i]); var mb = Economy.settleMatch(p, { totalHands: g.totalHands || 12, eligibleHands: r.elig[i], factors: r.factors[i], rank: ff ? 4 : ho.ranks[i], forfeit: ff }, now); res.matchGold = mb.gold; res.matchXp = mb.xp; res.lines = res.lines.concat(mb.lines); if (ff) res.lines.push('Hükmen son sıra: maç bonusu yok' + (r.settings.entry ? ', havuzdan pay yok' : '')); if (mb.levelUp) res.levelUp = mb.levelUp; res.rank = ff ? 4 : ho.ranks[i]; }
      return res;
    }, function (e, out, view) { if (e) return; var msg = { t: 'reward', reward: out, player: view }; if (s.ws && s.ws.readyState === 1) send(s.ws, msg); else s.pendingReward = msg; }); // bağlantı o an kopuksa yeniden bağlanınca iletilir
  });
}
function startGame(r) {
  fillBots(r);
  r.matchId = r.code + '-' + Date.now().toString(36); // Masa Giriş Skini gösterimi bu kimlikle bir kez (yeniden bağlanma yeni hak vermez)
  r.g = Okey.newGame({ names: r.seats.map(function (s) { return s.name; }), jokerCapturePenalty: r.settings.jokerPenalty, totalHands: r.settings.totalHands });
  r.elig = null; r.factors = null; r.rewarded = {}; r.matchStart = Date.now(); r.actsAll = [0, 0, 0, 0]; r.pooled = false; r.actsTot = null; r.botActsTot = null; r.forfeit = null; r.poolExtra = 0; // yeni maç: katılım ve ödül kayıtları sıfır
  Okey.startHand(r.g);
  beginPrep(r);
  consumeIntroTrials(r);
  log(r, 'oyun başladı');
  broadcastRoom(r);
  broadcastState(r, { event: 'handStart' });
  scheduleBots(r);
}
function scheduleNext(r) { // el bitti: NEXT_DELAY sonra sonraki el kendiliğinden başlar (oda sahibi kopsa ya da hızlı masada sahip olmasa da maç takılmaz)
  var g = r.g; if (!g || g.phase !== 'handover' || g.finished || r.nextTimer) return;
  r.nextAt = Date.now() + NEXT_DELAY;
  r.nextTimer = setTimeout(function () { r.nextTimer = null; r.nextAt = 0; nextHand(r); }, NEXT_DELAY);
}
function canStartNext(r, seat) { // oda sahibi; sahip yoksa (hızlı masa) ya da sahibin bağlantısı koptuysa oturan her gerçek oyuncu
  if (r.host == null) return true;
  if (seat === r.host) return true;
  var h = r.seats[r.host]; return !h || h.bot || !h.ws || h.ws.readyState !== 1;
}
function nextHand(r) {
  if (!r.g || r.g.phase !== 'handover' || r.g.finished) return;
  clearTimeout(r.nextTimer); r.nextTimer = null; r.nextAt = 0;
  Okey.startHand(r.g);
  beginPrep(r);
  broadcastState(r, { event: 'handStart' });
  scheduleBots(r);
}
function actorOf(g) { return g.phase === 'claim' ? Okey.claimant(g) : g.cp; }
function scheduleBots(r) {
  clearTimeout(r.timer); clearTimeout(r.claimTimer);
  var g = r.g; r.turnUntil = 0; if (!g || g.phase === 'handover') return;
  if (r.prepUntil && Date.now() < r.prepUntil) { r.timer = setTimeout(function () { scheduleBots(r); }, r.prepUntil - Date.now() + 50); return; } // hazırlık aşaması: botlar bekler
  r.prepUntil = 0;
  var a = actorOf(g), s = r.seats[a];
  if (s.bot || !s.ws || s.ws.readyState !== 1) { // bot ya da bağlantısı kopan oyuncu: sunucu oynar (AFK sayacı yok)
    var delay = g.phase === 'claim' ? Math.min(BOT_DELAY, 500) : BOT_DELAY;
    if (!s.bot && !s.left && r.part) { var discAt = partOf(r, a).discAt || Date.now(); delay = Math.max(delay, DISC_GRACE_MS - (Date.now() - discAt)); if (g.phase === 'claim') delay = Math.min(delay, r.settings.claimTime); } // v9.72: kopuk ama çıkmamış insan: kısa tolerans (yeniden bağlanırsa kendi oynar)
    r.timer = setTimeout(function () {
      try { Okey.botStep(g); } catch (e) { log(r, 'bot hatası ' + e.message); g.phase = 'play'; }
      if (!s.bot) partOf(r, a).botActs++; // kopuk insan yerine sunucu oynadı: katılım sayacına yazılır
      broadcastState(r, { event: 'bot', actor: a });
      rewardIfOver(r);
      scheduleBots(r);
    }, delay);
    return;
  }
  if (g.phase === 'claim') { // insan talep süresi
    r.turnUntil = 0;
    r.claimTimer = setTimeout(function () {
      if (r.g && r.g.phase === 'claim' && Okey.claimant(r.g) === a) { try { Okey.actClaim(r.g, a, false); } catch (e) {} broadcastState(r, { event: 'claimTimeout', actor: a }); rewardIfOver(r); scheduleBots(r); }
    }, r.settings.claimTime);
    return;
  }
  // Hamle süresi (AFK, 8 Ekim 2026): bağlı insan her hamle (taş alma / taş atma) için TURN_MS içinde oynamazsa sunucu onun yerine oynar;
  // bot hamlesi sayılır (hamlelerinin yarısından fazlası botsa hükmen son — K14 kuralı). Süre her hamleyle yeniden başlar; görünümde turnLeft ile herkese gider.
  r.turnUntil = Date.now() + TURN_MS;
  r.seats.forEach(function (x, i) { if (x && !x.bot && x.ws) send(x.ws, { t: 'turn', actor: rotateIdx(a, i), left: TURN_MS, phase: g.phase }); }); // sayaç herkese: kimin sırası, kaç sn (görünüm zaten gönderildi)
  r.timer = setTimeout(function () {
    if (!r.g || r.g.phase === 'handover' || actorOf(r.g) !== a || r.g.phase === 'claim') return;
    try { Okey.botStep(r.g); } catch (e) { log(r, 'AFK hamle hatası ' + e.message); r.g.phase = 'play'; }
    partOf(r, a).botActs++; r.turnUntil = 0;
    log(r, s.name + ' süre doldu: sunucu yerine oynadı');
    broadcastState(r, { event: 'afk', actor: a });
    rewardIfOver(r);
    scheduleBots(r);
  }, TURN_MS);
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
// public.zip (oyun) ve assets.zip (büyük görseller) varsa ve public/ yoksa açılışta çıkar (GitHub'a klasör yüklemeden kurulum; GitHub web yüklemesi dosya başına 25 MB sınırı için ikiye bölünmüştür)
function unzipPublic() {
  if (fs.existsSync(path.join(PUBLIC, 'index.html'))) return;
  ['public.zip', 'assets.zip'].forEach(function (zname) { var zp = path.join(__dirname, zname); if (fs.existsSync(zp)) unzipInto(zp, zname); });
}
function unzipInto(zipPath, zname) {
  var zlib = require('zlib'), buf = fs.readFileSync(zipPath), n = 0;
  var eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); if (eocd < 0) { console.log(zname + ' okunamadı'); return; }
  var count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16), p = cdOff;
  for (var i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    var method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    var nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    var name = buf.slice(p + 46, p + 46 + nlen).toString('utf8'); p += 46 + nlen + elen + clen;
    if (name.indexOf('..') >= 0 || name.indexOf(':') >= 0 || name.indexOf('__MACOSX') >= 0) continue;
    var rel = name.indexOf('public/') === 0 ? name.slice(7) : name.replace(/^\.\//, ''); // "public/index.html" ya da "index.html": iki biçim de olur
    if (!rel) continue;
    var out = path.join(PUBLIC, rel);
    if (name.slice(-1) === '/') { fs.mkdirSync(out, { recursive: true }); continue; }
    var lnlen = buf.readUInt16LE(lho + 26), lelen = buf.readUInt16LE(lho + 28), dataOff = lho + 30 + lnlen + lelen;
    var data = buf.slice(dataOff, dataOff + csize);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, method === 8 ? zlib.inflateRawSync(data) : data); n++;
  }
  console.log(zname + ' açıldı: ' + n + ' dosya');
}
try { unzipPublic(); } catch (e) { console.log('zip açma hatası: ' + e.message); }
var Venues = require('./venues.js');
Accounts.init({ publicDir: PUBLIC }, function (e, mode) { console.log('hesap deposu: ' + mode + (e ? ' (' + e.message + ')' : '')); Accounts.releaseEscrows(function (n) { if (n) console.log('yarım kalan emanet iade edildi: ' + n); }); Venues.init({ accounts: Accounts, db: Accounts.db() }, function (e2) { console.log('kıraathane deposu hazır' + (e2 ? ' (' + e2.message + ')' : '')); }); });
Accounts.route('/api/venue/', Venues.handleHttp);
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8' };
var server = http.createServer(function (req, res) {
  var url = (req.url || '/').split('?')[0];
  if (url === '/durum') { Accounts.count(function (n) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Döngü sunucusu çalışıyor. Sürüm: v9.74. Ekonomi: ' + Economy.CONFIG.version + '. Mekânlar: ' + QUICK_THEMES.join(', ') + '. Odalar: ' + Object.keys(rooms).length + '. Hesap deposu: ' + Accounts.modeName() + ', oyuncu: ' + n); }); return; }
  if (url === '/api/masalar') { // lobi: bekleyen hızlı masalar (mekân, el sayısı, oyuncu sayısı)
    var list = []; Object.keys(rooms).forEach(function (c) { var q = rooms[c]; if (q.quick && !q.g) list.push({ theme: q.settings.theme, totalHands: q.settings.totalHands, stake: q.settings.stake || 'sosyal', entry: q.settings.entry || 0, players: q.seats.filter(function (x) { return x && !x.bot && x.ws && x.ws.readyState === 1; }).length }); });
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
// v9.73: canlı tutma — 30 sn'de bir ping; cevap vermeyen bağlantı bir sonraki turda kapatılır (boşta kalan soketi aracı sunucular kesiyordu; istemci de 25 sn'de bir ping yollar)
setInterval(function () { wss.clients.forEach(function (ws) { if (ws.isAlive === false) { try { ws.terminate(); } catch (e) {} return; } ws.isAlive = false; try { ws.ping(); } catch (e) {} }); }, 30000);
wss.on('connection', function (ws) {
  var me = { room: null, seat: -1 }; ws._me = me; ws.isAlive = true;
  ws.on('pong', function () { ws.isAlive = true; });
  ws.on('message', function (data) {
    ws.isAlive = true;
    var m; try { m = JSON.parse(data); } catch (e) { return; }
    try { handle(ws, me, m); } catch (e) { send(ws, { t: 'error', msg: e.message }); }
  });
  ws.on('close', function (code, reason) {
    venueLeave(me);
    var r = me.room; if (!r || me.seat < 0) return;
    var sc = r.seats[me.seat]; log(r, (sc ? sc.name : '?') + ' bağlantı kapandı (kod ' + code + (reason && reason.length ? ', ' + String(reason).slice(0, 60) : '') + (sc && sc.ws === ws ? '' : ', eski bağlantı') + ')'); // v9.73: kopma nedeni log'da
    var s = r.seats[me.seat]; if (s && s.ws === ws) { s.ws = null; if (r.g && r.part) { var pt = partOf(r, me.seat); if (!pt.discAt) pt.discAt = Date.now(); } if (!r.g && s.escrow) { refundEscrow(s, 'bağlantı koptu'); r.seats[me.seat] = null; } }
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
  if (m.t === 'quick') { // Hızlı Katıl: ortak kuyruk (aynı el modu + aynı giriş), 4 kişi olunca ya da QUICK_WAIT sonra (sosyal masada botla doldurup) başlar
    var th = m.settings && (m.settings.totalHands === 1 || m.settings.totalHands === 6) ? m.settings.totalHands : 12;
    var wantTheme = m.settings && ALL_THEMES.indexOf(m.settings.theme) >= 0 ? m.settings.theme : null; // oda = mekân: istenen mekândaki bekleyen masaya oturur
    var stake = Economy.stakeOf(m.settings && m.settings.stake), entry = stake.entry * th; // kişi başı toplam giriş (maç için)
    if (stake.locked && !ALLOW_LOCKED_STAKES) throw new Error(stake.name + ' masası henüz açık değil.');
    var qs = { name: (m.name || 'Oyuncu').slice(0, 14), avatar: m.avatar || null, skins: m.skins || 0, bot: false, token: token(), ws: ws, acc: accOf(m) };
    var seatQuick = function () {
      if (ws.readyState !== 1) { if (entry) refundEscrow(qs, 'bağlantı kapandı'); return; }
      r = null; Object.keys(rooms).forEach(function (c) { var q = rooms[c]; if (!r && q.quick && !q.g && q.settings.totalHands === th && (q.settings.stake || 'sosyal') === stake.id && (!wantTheme || q.settings.theme === wantTheme) && freeSeat(q) >= 0) r = q; });
      if (!r) { r = newRoom(); r.quick = true; r.host = null; r.settings.totalHands = th; r.settings.stake = stake.id; r.settings.entry = entry; r.settings.theme = wantTheme || QUICK_THEMES[Math.floor(Math.random() * QUICK_THEMES.length)]; var waitMs = entry ? PAID_WAIT : QUICK_WAIT; r.quickUntil = Date.now() + waitMs; r.quickTimer = setTimeout(function () { if (r.g) return; var live = r.seats.filter(function (x) { return x && !x.bot && x.ws && x.ws.readyState === 1; }).length; if (entry) { if (live < 2) { cancelPaidRoom(r, 'Masa ' + Math.round(PAID_WAIT / 1000) + ' sn içinde en az 2 gerçek oyuncuya ulaşmadı; girişler iade edildi.'); return; } r.seats.forEach(function (x, i) { if (x && !x.bot && !(x.ws && x.ws.readyState === 1)) { refundEscrow(x, 'bağlantı kapandı'); r.seats[i] = null; } }); startGame(r); return; } if (live) startGame(r); }, waitMs); log(r, 'hızlı masa açıldı (' + th + ' el, ' + stake.name + ')'); }
      var qi = freeSeat(r); r.seats[qi] = qs; me.room = r; me.seat = qi; sanitizeSeat(r, qs);
      send(ws, { t: 'joined', code: r.code, seat: qi, token: qs.token, stake: stake.id, entry: entry });
      broadcastRoom(r); log(r, qs.name + ' hızlı katıldı' + (entry ? ' (giriş ' + entry + ')' : ''));
      if (freeSeat(r) < 0) { clearTimeout(r.quickTimer); startGame(r); } // 4 gerçek oyuncu → hemen
    };
    if (!entry) { seatQuick(); return; }
    // giriş altınlı masa: hesap şart, seviye ve bakiye kontrolü, emanet (altın hemen düşer; maç başlamazsa iade)
    if (!qs.acc) throw new Error('Giriş altınlı masa için hesap gerekir.');
    Accounts.grant(qs.acc, function (p) {
      var lv = Accounts.levelOf(p.xp).level;
      if (lv < stake.level) throw new Error(stake.name + ' masası için seviye ' + stake.level + ' gerekir (sen: ' + lv + ').');
      if (p.escrow) throw new Error('Zaten emanette girişin var (başka bir masa).');
      if ((p.coins || 0) < entry) throw new Error('Yeterli altın yok: bu masa için ' + entry + ' altın gerekir.');
      p.coins -= entry; p.escrow = { amount: entry, stake: stake.id, at: Date.now() };
      return { ok: true };
    }, function (e, out, view) {
      if (e) { send(ws, { t: 'error', msg: e.message, fatal: true }); return; }
      qs.escrow = entry; send(ws, { t: 'me', player: view });
      seatQuick();
    });
    return;
  }
  if (m.t === 'join') {
    r = rooms[(m.code || '').toUpperCase()]; if (!r) throw new Error('Oda bulunamadı. Kodu kontrol et.');
    // yeniden bağlanma
    var back = -1;
    if (m.token) r.seats.forEach(function (s, i) { if (s && s.token === m.token) back = i; });
    if (back >= 0 && r.seats[back].left && r.settings.entry && r.g && !r.g.finished) throw new Error('Bu maçtan çıktın; bahisli masaya geri dönülemez.');
    if (back >= 0) {
      var old = r.seats[back].ws;
      if (old && old !== ws && old.readyState === 1) { send(old, { t: 'takeover' }); if (old._me) { old._me.room = null; old._me.seat = -1; } try { old.close(); } catch (e) {} log(r, r.seats[back].name + ': koltuk yeni bağlantıya devredildi (aynı hesap başka sekme/cihaz)'); } // tek etkin bağlantı: son açılan kazanır
      if (r.seats[back].left && !r.settings.entry && r.forfeit) r.forfeit[back] = false; // sosyal masada geri dönüş: bilerek çıkış bayrağı kalkar (K14 yarı-hamle kuralı maç sonunda yine uygulanır)
      r.seats[back].ws = ws; r.seats[back].left = false; me.room = r; me.seat = back; if (r.g && r.part) { var pb = partOf(r, back); if (pb.discAt) { pb.discMs += Date.now() - pb.discAt; pb.discAt = 0; } } send(ws, { t: 'joined', code: r.code, seat: back, token: m.token }); broadcastRoom(r); if (r.g) { send(ws, { t: 'state', view: viewFor(r, back), event: 'resync' }); scheduleBots(r); } if (r.seats[back].pendingReward) { send(ws, r.seats[back].pendingReward); r.seats[back].pendingReward = null; } return; }
    if (r.g) throw new Error('Bu masada oyun başlamış.');
    var i = freeSeat(r); if (i < 0) throw new Error('Masa dolu.');
    var s = { name: (m.name || 'Oyuncu').slice(0, 14), avatar: m.avatar || null, skins: m.skins || 0, bot: false, token: token(), ws: ws, acc: accOf(m) };
    r.seats[i] = s; me.room = r; me.seat = i; sanitizeSeat(r, s);
    send(ws, { t: 'joined', code: r.code, seat: i, token: s.token });
    broadcastRoom(r); log(r, s.name + ' katıldı');
    return;
  }
  if (m.t === 'vjoin') { // kıraathaneye gir (sosyal salon)
    var vv = Venues.ofCode(m.code); if (!vv) throw new Error('Kıraathane bulunamadı.');
    venueLeave(me); me.venue = vv.code; me.cid = me.cid || ('c' + (cidSeq++));
    var lv = live[vv.code] || (live[vv.code] = { conns: {} });
    var G = Economy.VENUE_GRID; lv.conns[me.cid] = { ws: ws, acc: accOf(m), name: (m.name || 'Oyuncu').slice(0, 14), avatar: Accounts.cleanAvatar(m.avatar) || null, gx: G.doorCols[0], gy: G.rows - 1, at: 0 };
    send(ws, { t: 'vstate', code: vv.code, you: me.cid, players: venuePlayers(vv.code), tables: venueTables(vv.code) });
    venueBroadcast(vv.code, { t: 'vjoin', player: venuePlayers(vv.code).filter(function (x) { return x.cid === me.cid; })[0] }, me.cid);
    // kıraathanedeki görünüm de hesaptaki sahipliğe göre (ücretli kozmetik beyana göre giyilemez)
    (function (code, cid, acc) { if (!acc) return; Accounts.auth(acc, function (e, p) { var c = live[code] && live[code].conns[cid]; if (e || !p || !c || !c.avatar) return; var before = JSON.stringify(c.avatar); c.avatar = Accounts.cleanCosmetics(p, c.avatar); if (JSON.stringify(c.avatar) !== before) venueBroadcast(code, { t: 'vjoin', player: venuePlayers(code).filter(function (x) { return x.cid === cid; })[0] }, null); }); })(vv.code, me.cid, accOf(m));
    return;
  }
  if (m.t === 'vmove') { var lvm = me.venue && live[me.venue]; var cm = lvm && lvm.conns[me.cid]; if (!cm) return; var tnow = Date.now(); if (tnow - cm.at < 80) return; cm.at = tnow; cm.gx = m.gx | 0; cm.gy = m.gy | 0; venueBroadcast(me.venue, { t: 'vmove', cid: me.cid, gx: cm.gx, gy: cm.gy }, me.cid); return; }
  if (m.t === 'vleave') { venueLeave(me); return; }
  if (m.t === 'vsit') { // kıraathane masasına otur: masa = kodlu oda (ilk oturan oda sahibi; bitince mekâna dönülür)
    var sv = Venues.ofCode(m.code); if (!sv) throw new Error('Kıraathane bulunamadı.');
    var placed = sv.placements.some(function (pl) { return pl.iid === m.iid; }); var invIt = sv.inventory.filter(function (i) { return i.iid === m.iid; })[0]; var itemDef = invIt && Economy.venueItem(invIt.item);
    if (!placed || !itemDef || itemDef.kind !== 'table') throw new Error('Bu masa oynanabilir değil.');
    var key = sv.code + ':' + m.iid, vr = null; Object.keys(rooms).forEach(function (c) { if (rooms[c].venue && rooms[c].venue.key === key) vr = rooms[c]; });
    var seatSelf = { name: (m.name || 'Oyuncu').slice(0, 14), avatar: m.avatar || null, skins: m.skins || 0, bot: false, token: token(), ws: ws, acc: accOf(m) };
    if (vr && vr.g && !vr.g.finished) throw new Error('Bu masada maç sürüyor; bitince oturabilirsin.');
    if (vr && vr.g && vr.g.finished) { delete rooms[vr.code]; vr = null; }
    if (!vr) { vr = newRoom(); vr.venue = { code: sv.code, iid: m.iid, key: key }; vr.host = 0; vr.settings.totalHands = (m.totalHands === 1 || m.totalHands === 6) ? m.totalHands : 12; vr.settings.theme = sv.theme; vr.seats[0] = seatSelf; me.room = vr; me.seat = 0; }
    else { var fsx = freeSeat(vr); if (fsx < 0) throw new Error('Masa dolu.'); vr.seats[fsx] = seatSelf; me.room = vr; me.seat = fsx; }
    sanitizeSeat(vr, seatSelf); venueLeave(me);
    send(ws, { t: 'joined', code: vr.code, seat: me.seat, token: seatSelf.token, venue: sv.code });
    broadcastRoom(vr); log(vr, seatSelf.name + ' kıraathane masasına oturdu (' + key + ')');
    venueBroadcast(sv.code, { t: 'vtables', tables: venueTables(sv.code) });
    return;
  }
  r = me.room; if (!r) throw new Error('önce odaya katıl');
  if (m.t === 'leave') { var ls = r.seats[me.seat]; if (!r.g && ls && ls.escrow) refundEscrow(ls, 'masadan ayrıldı'); r.seats[me.seat] = r.g ? r.seats[me.seat] : null; if (r.g) { ls.ws = null; if (r.part) { var pl = partOf(r, me.seat); if (!pl.discAt) pl.discAt = Date.now(); } if (!r.g.finished) { ls.left = true; if (!r.forfeit) r.forfeit = [false, false, false, false]; r.forfeit[me.seat] = true; if (r.settings.entry && ls.acc && !ls.penalty) leavePenalty(r, me.seat); } } me.room = null; broadcastRoom(r); if (r.g) scheduleBots(r); if (r.quick && !r.g && !r.seats.some(function (x) { return x && !x.bot; })) { clearTimeout(r.quickTimer); delete rooms[r.code]; } return; } // çıkan oyuncunun sırasıysa sunucu hemen devralır (önce AFK süresine kadar bekliyordu)
  if (m.t === 'avatar') { // v9.73: görünüm maç içinde değişince koltuğa yansır (Masa Giriş Skini değişmez; ücretli parçalar hesaptaki sahipliğe göre)
    var sa = r.seats[me.seat]; if (!sa || sa.bot) return;
    var av = Accounts.cleanAvatar(m.avatar); if (!av) return;
    var keepIntro = sa.avatar ? sa.avatar.intro : undefined; delete av.intro; if (keepIntro) av.intro = keepIntro;
    if (!sa.acc) { sa.avatar = av; broadcastRoom(r); return; }
    Accounts.auth(sa.acc, function (e, p) { if (e || !p || r.seats[me.seat] !== sa) return; sa.avatar = Accounts.cleanCosmetics(p, av); if (keepIntro) sa.avatar.intro = keepIntro; broadcastRoom(r); log(r, sa.name + ' görünümünü değiştirdi'); });
    return;
  }
  if (m.t === 'start') { if (me.seat !== r.host) throw new Error('Oyunu yalnızca oda sahibi başlatır.'); if (r.g) throw new Error('zaten başladı'); startGame(r); return; }
  if (m.t === 'next') { if (!canStartNext(r, me.seat)) throw new Error('Sonraki eli oda sahibi başlatır.'); nextHand(r); return; }
  if (m.t === 'act') {
    if (r.prepUntil && Object.keys(r.peeks || {}).length) throw new Error('Bakış sürerken hamle yapılamaz.');
    var res = handleAct(r, me.seat, m);
    partOf(r, me.seat).acts++; if (r.actsAll) r.actsAll[me.seat]++;
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
  if (m.t === 'state') { if (r.g) send(ws, { t: 'state', view: viewFor(r, me.seat), event: 'resync' }); else broadcastRoom(r); return; } // uygulama öne gelince taze durum (v9.73)
}
// boş odaları temizle
setInterval(function () { var now = Date.now(); Object.keys(rooms).forEach(function (c) { var r = rooms[c]; var alive = r.seats.some(function (s) { return s && !s.bot && s.ws && s.ws.readyState === 1; }); if (!alive && now - r.created > 30 * 60 * 1000) { clearTimeout(r.timer); delete rooms[c]; } }); }, 60000);

server.listen(PORT, function () { console.log('Döngü sunucusu ' + PORT + ' portunda'); });
