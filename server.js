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

function code() { var s = '', A = 'ABCDEFGHJKLMNPRSTUVYZ23456789'; for (var i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return (rooms[s] || foreign[s]) ? code() : s; } // v9.85: başka sunucu sürecinin kayıtlı odasının kodu da kullanılmaz
function token() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
function log(room, msg) { console.log('[' + room.code + '] ' + msg); }

function newRoom() {
  var r = { code: code(), seats: [null, null, null, null], host: null, g: null, timer: null, claimTimer: null, settings: { claimTime: CLAIM_TIMEOUT, jokerPenalty: 10, assist: true }, created: Date.now() };
  rooms[r.code] = r;
  return r;
}
// seat: { name, avatar, bot:boolean, token, ws|null, connected }
function seatInfo(r) {
  return r.seats.map(function (s, i) { return s ? { i: i, name: s.name, avatar: s.avatar, bot: !!s.bot, connected: !!(s.bot || (s.ws && s.ws.readyState === 1)), prof: s.prof || null, actions: s.actions || [] } : null; }); // actions (v9.91): koltuğun aksiyon skinleri (Mühür açılışta herkeste oynar) // prof (v9.74): seviye, maç/galibiyet, kostüm sayısı, kıraathane adı — profil kartı için
}
function freeSeat(r) { for (var i = 0; i < 4; i++) if (!r.seats[i]) return i; return -1; }
function transferHost(r) { // v9.75: kurucu başlamadan ayrıldı → yetki (bağlı olan) sıradaki insana; yoksa herhangi bir insana
  var pick = -1; for (var i = 0; i < 4 && pick < 0; i++) { var s = r.seats[i]; if (s && !s.bot && s.ws && s.ws.readyState === 1) pick = i; }
  if (pick < 0) for (var j = 0; j < 4 && pick < 0; j++) { if (r.seats[j] && !r.seats[j].bot) pick = j; }
  r.host = pick < 0 ? null : pick; if (pick >= 0) log(r, 'oda sahipliği ' + r.seats[pick].name + ' adlı oyuncuya geçti');
}
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
    econ: { humans: humanCount(r), coef: Economy.humanCoef(humanCount(r)), training: humanCount(r) <= 1, stake: r.settings.stake || 'sosyal', entry: r.settings.entry || 0, version: Economy.CONFIG.version },
    hostVenue: r.hostVenue ? Object.assign({}, r.hostVenue, { seat: r.hostVenue.seat == null ? null : rot(r.hostVenue.seat) }) : null, // v9.76 ev sahibi kartı
    moment: r.moment ? { text: r.moment.text, seat: r.moment.seat == null ? null : rot(r.moment.seat), kind: r.moment.kind } : null // v9.76 maçın anı (sunucu hesaplar, 4 ekranda aynı)
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
  var info = { t: 'room', code: r.code, seats: seatInfo(r), host: r.host, started: !!r.g, settings: r.settings, quick: !!r.quick, league: !!(r.g && r.league), venue: r.venue ? r.venue.code : null, startsIn: r.quick && !r.g && r.quickUntil ? Math.max(0, r.quickUntil - Date.now()) : null, rematchOf: (!r.g && r.rematchOf) ? r.rematchOf : null }; // v9.76: rövanş bekleme odası
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws) send(s.ws, Object.assign({ you: i }, info)); });
  markRoom(r); // v9.85: süren maç kaydı (koltuk değişiklikleri)
  venueTablesChanged(r); // v9.96 (K123)
}
function broadcastState(r, extra) {
  if (r.g && r.g.phase === 'handover') scheduleNext(r); // el bitti: geri sayım görünüme girsin
  if (r.g && r.g.finished && !r.moment) { try { r.moment = Okey.matchMoment(r.g); } catch (e) { r.moment = null; } } // v9.76: maçın anı son durum görünümüyle gitsin
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws) { var ex = Object.assign({}, extra || {}); if (ex.actor != null) ex.actor = rotateIdx(ex.actor, i); send(s.ws, Object.assign({ t: 'state', view: viewFor(r, i) }, ex)); } }); // actor alıcıya göre döndürülür (önce ham koltuk gidiyordu: 0 dışındaki koltuklarda "senin" olayları yanlış kişiye yazılıyordu)
  markRoom(r); // v9.85: süren maç kaydı (en geç 1 sn sonra yazılır)
}

// ---- oyun akışı ----
// ---- Rakibin eline bak / Tokat: haklar, hedef ve süreler sunucuda ----
var PEEK_MS = 8000, PREP_MS = parseInt(process.env.PREP_MS) || 15000, MAX_SKINS = 5;
var TURN_MS = parseInt(process.env.TURN_MS) || 30000; var DISC_GRACE_MS = parseInt(process.env.DISC_GRACE_MS) || 10000; // bağlantısı kopan (çıkmamış) insanın sırası: 10 sn tolerans (sayfa yenileme hamleyi kaybettirmesin), sonra sunucu oynar // hamle süresi (AFK): taş alma ve taş atma için ayrı ayrı 30 sn (v9.73; önce 45) // PREP_MS: el başı hazırlık/hazır olma süresi (test için kısaltılabilir)
var REMATCH_WAIT = parseInt(process.env.REMATCH_WAIT) || 60000; // v9.76 "Bu masayla devam et": maç sonunda oy süresi
var ROOM_GRACE_MS = parseInt(process.env.ROOM_GRACE_MS) || 10 * 60 * 1000; // v9.75: arkadaş odasında (başlamadan) bütün insanların bağlantısı kopsa da oda bu süre yaşar — kurucu kodu paylaşmak için uygulamadan çıkınca oda silinmesin
var NEXT_DELAY = parseInt(process.env.NEXT_DELAY) || 12000; // el bitince sonraki el kendiliğinden (ms); oda sahibi / hızlı masada herkes daha erken başlatabilir
var ALLOW_LOCKED_STAKES = process.env.ALLOW_LOCKED_STAKES === '1'; // Usta / Efsane masaları (100 bin+) bayrakla açılır
var TEST_RIG = process.env.TEST_RIG === '1'; // yalnız otomatik test: masayı kurgulama mesajı (canlıda tanımsız → kapalı)
var TEST_FAKE_HAND = parseInt(process.env.TEST_FAKE_HAND) || 0; // yalnız test ortamı: 12 El maçında garanti özel el (gösterge sahte okey) bu ele konur; canlıda tanımsız → etkisiz
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
function presentHumans(r) { return r.seats.filter(function (s) { return s && !s.bot && (!(r.g && r.g.finished) || (!s.left && s.ws && s.ws.readyState === 1)); }).length; } // v9.96 (K123): biten maçta koltuklar oda silinene kadar (30 dk) duruyor; masada "hâlâ oturan" = bağlı olan. Eskiden ayrılanlar da sayılıyordu → kıraathane masasında "1/4 oturdu" kalıyordu
function venueTables(code) { var out = {}; Object.keys(rooms).forEach(function (c) { var r = rooms[c]; if (!r.venue || r.venue.code !== code) return; out[r.venue.iid] = { code: r.code, seated: presentHumans(r), started: !!r.g, finished: !!(r.g && r.g.finished), totalHands: r.settings.totalHands }; }); return out; }
function venueTablesChanged(r) { if (!r || !r.venue || !live[r.venue.code]) return; venueBroadcast(r.venue.code, { t: 'vtables', tables: venueTables(r.venue.code) }); } // v9.96 (K123): masa durumu (oturan sayısı, maç sürüyor/bitti, oda kapandı) değişince mekândaki herkese anında gider — eskiden yalnız biri oturunca gidiyordu
function venueBroadcast(code, msg, exceptCid) { var lv = live[code]; if (!lv) return; Object.keys(lv.conns).forEach(function (cid) { if (cid !== exceptCid) send(lv.conns[cid].ws, msg); }); }
function venuePlayers(code) { var lv = live[code]; if (!lv) return []; return Object.keys(lv.conns).map(function (cid) { var c = lv.conns[cid]; return { cid: cid, id: c.acc ? c.acc.id : null, name: c.name, avatar: c.avatar, gx: c.gx, gy: c.gy }; }); }
function venueLeave(me) { var code = me.venue; if (!code) return; var lv = live[code]; if (lv && lv.conns[me.cid]) { delete lv.conns[me.cid]; venueBroadcast(code, { t: 'vleave', cid: me.cid }); if (!Object.keys(lv.conns).length) delete live[code]; } me.venue = null; }
function leavePenalty(r, i) { // bahisli maçtan bilerek çıkan: giriş havuzda kalır + giriş kadar ceza cüzdandan havuza (toplam 2×), hükmen son, geri dönemez (5 Ekim 2026 kararı 2)
  var s = r.seats[i], entry = r.settings.entry || 0; if (!s || !s.acc || !entry) return; s.penalty = 0;
  Accounts.grant(s.acc, function (p) { var pen = Math.min(entry, Math.max(0, p.coins || 0)); p.coins = (p.coins || 0) - pen; return { pen: pen }; }, function (e, out, view) {
    if (e) return; s.penalty = out.pen; r.poolExtra = (r.poolExtra || 0) + out.pen; markRoom(r);
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
  r.actUsed = [{}, {}, {}, {}]; r.lastSlap = {}; r.lastOpen = null; // v9.91 (K116): aksiyon skini el sayaçları ve tos pencereleri
  r.peeks = {}; r.prepDone = {};
  // Hazırlık/hazır olma aşaması: masada bağlı bir insan varsa her el başında en çok PREP_MS; bütün insanlar "Oyuna geç" deyince (prepDone) erken biter.
  // (v9.64: önceden yalnız bakış hakkı olan varsa açılıyordu; açıklama penceresi okunurken botlar oynamaya başlıyordu.)
  var humans = r.seats.some(function (s) { return s && !s.bot && s.ws && s.ws.readyState === 1; });
  r.prepUntil = humans ? Date.now() + PREP_MS : 0;
}
function seatFree(s, id) { return (s && s.free && s.free[id]) || 0; }
function seatPaid(s, id) { return (s && s.paid && s.paid[id]) || 0; } // v9.88: satın alınmış kullanım hakları (sanitizeSeat doldurur) // koltuğun hesaptan okunmuş ücretsiz skin hakları (sanitizeSeat doldurur)
function endPeek(r, from, reason) {
  var p = r.peeks[from]; if (!p) return; clearTimeout(p.timer); clearTimeout(p.botTimer); delete r.peeks[from];
  if ((r.charges[from] > 0 || seatFree(r.seats[from], 'bak') > 0 || seatPaid(r.seats[from], 'bak') > 0) && r.prepUntil) r.prepUntil = Math.max(r.prepUntil, Date.now() + 6000); // kalan hak için 6 sn ek süre
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws) send(s.ws, { t: 'peekEnd', from: rotateIdx(from, i), target: rotateIdx(p.target, i), reason: reason }); });
  log(r, r.seats[from].name + ' bakışı bitti: ' + reason);
}
function handlePeek(r, seat, m) {
  var g = r.g; if (!g) throw new Error('oyun başlamadı');
  if (r.league && Economy.CONFIG.league.peekOff) throw new Error('Lig maçında Çaktırmadan Bak kapalı: herkes eşit şartlarda oynar.'); // v9.87 (D7)
  if (!r.prepUntil || Date.now() >= r.prepUntil) throw new Error('Yetenek yalnızca el başındaki hazırlık aşamasında kullanılır.');
  if (r.peeks[seat]) throw new Error('Zaten bir rakibe bakıyorsun.');
  var me = r.seats[seat], usedFree = false, usedPaid = false;
  if (!(r.charges[seat] > 0) && !(seatFree(me, 'bak') > 0) && !(seatPaid(me, 'bak') > 0)) throw new Error('Bu elde kullanım hakkın kalmadı.');
  var target = (parseInt(m.target) + seat) % 4; // istemci döndürülmüş koltuk gönderir
  if (isNaN(target) || target === seat || target < 0 || target > 3) throw new Error('geçersiz hedef');
  if (r.charges[seat] > 0) r.charges[seat]--; // sıra (K110): el hakkı (skin/karakter) → ücretsiz deneme → satın alınmış kullanım
  else if (seatFree(me, 'bak') > 0) { // ücretsiz başlangıç hakkı: kullanım kabul edildiği anda hesaptan düşer (bir kez; yakalanınca geri gelmez)
    usedFree = true; me.free.bak--;
    Accounts.grant(me.acc, function (p) { Accounts.useFreeSkin(p, 'bak'); return {}; }, function (e, out, view) { if (!e && me.ws && me.ws.readyState === 1) send(me.ws, { t: 'me', player: view }); });
  } else { // v9.88: satın alınmış kullanım (mağaza paketi) — kabul edildiği anda hesaptan düşer
    usedPaid = true; me.paid.bak--;
    Accounts.grant(me.acc, function (p) { Accounts.usePaidSkin(p, 'bak'); return {}; }, function (e, out, view) { if (!e && me.ws && me.ws.readyState === 1) send(me.ws, { t: 'me', player: view }); });
  }
  var until = Date.now() + PEEK_MS, pk = { target: target, until: until };
  r.peeks[seat] = pk;
  if (r.prepUntil < until + 500) r.prepUntil = until + 500; // bakış sürerken oyun başlamaz
  pk.timer = setTimeout(function () { endPeek(r, seat, 'time'); }, PEEK_MS);
  var blur = 0, tg = r.seats[target], nz = Economy.actionSkin('nazar'); // v9.92 (K117) Nazar Boncuğu: hedef sahipse (ya da denemesi varsa) bakan ilk 2 sn bulanık görür; elde 1
  if (tg && !tg.bot && nz) { r.actUsed = r.actUsed || [{}, {}, {}, {}]; var nUsed = r.actUsed[target].nazar || 0, nOwn = (tg.actions || []).indexOf('nazar') >= 0, nTrial = !nOwn && seatFree(tg, 'nazar') > 0;
    if (nUsed < (nz.perHand || 1) && (nOwn || nTrial)) { blur = nz.blurMs || 2000; r.actUsed[target].nazar = nUsed + 1;
      if (nTrial) { tg.free.nazar = 0; if (tg.acc) Accounts.grant(tg.acc, function (p) { Accounts.useFreeSkin(p, 'nazar'); return {}; }, function (e, out, view) { if (!e && tg.ws && tg.ws.readyState === 1) send(tg.ws, { t: 'me', player: view }); }); }
      r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws && s.ws.readyState === 1) send(s.ws, { t: 'skinFx', skin: 'nazar', from: rotateIdx(target, i), target: null }); }); } }
  send(me.ws, { t: 'peek', target: rotateIdx(target, seat), charges: r.charges[seat], free: seatFree(me, 'bak'), paid: seatPaid(me, 'bak'), usedFree: usedFree, usedPaid: usedPaid, left: PEEK_MS, blur: blur, hand: g.players[target].hand.map(function (t) { return { c: t.c, n: t.n, fake: t.fake, id: t.id }; }) }); // taşlar sadece bakana
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws && i !== seat) send(s.ws, { t: 'peekAnim', from: rotateIdx(seat, i), target: rotateIdx(target, i), left: PEEK_MS }); });
  var ts = r.seats[target];
  if (ts.bot || !ts.ws || ts.ws.readyState !== 1) { if (Math.random() < 0.45) pk.botTimer = setTimeout(function () { if (r.peeks[seat] === pk) endPeek(r, seat, 'slap'); }, 1500 + Math.random() * 5000); }
  log(r, me.name + ' ' + ts.name + "'in eline bakıyor"); markRoom(r); // v9.85: kullanılan hak kayda geçsin
}
function handleSkinUse(r, seat, m) { // v9.91 (K116): aksiyon skini — sahiplik/deneme, aşama ve el sınırı sunucuda; kabul edilince herkese 'skinFx'
  var g = r.g; if (!g) throw new Error('oyun başlamadı');
  var id = String(m.skin || ''), def = Economy.actionSkin(id); if (!def) throw new Error('Bilinmeyen skin.');
  if (def.cat === 'open' || def.cat === 'discard' || def.cat === 'guard' || def.cat === 'end') throw new Error(def.name + ' kendiliğinden oynar.'); // v9.92: otomatik skinler istekle kullanılmaz
  var me = r.seats[seat]; r.actUsed = r.actUsed || [{}, {}, {}, {}]; var used = r.actUsed[seat][id] || 0;
  if (def.perHand && used >= def.perHand) throw new Error('Bu elde ' + def.name + ' hakkın bitti.');
  var owned = (me.actions || []).indexOf(id) >= 0, trial = !owned && seatFree(me, id) > 0;
  if (!owned && !trial) throw new Error(def.name + ' için hakkın yok: mağazadan al ya da karakterle aç.');
  var target = null, now = Date.now();
  if (def.cat === 'prep') { if (!r.prepUntil || now >= r.prepUntil) throw new Error('Çay Servisi yalnız el başı hazırlıkta.'); }
  var info = null;
  if (def.cat === 'info') { // v9.92 (K117) Yoklama: bilgi skini — hazırlıkta, ligde kapalı, yalnız isteyene renk dağılımı (okey/sahte okey sayılmaz)
    if (r.league && Economy.CONFIG.league.peekOff) throw new Error('Lig maçında Yoklama kapalı: herkes eşit şartlarda oynar.');
    if (!r.prepUntil || now >= r.prepUntil) throw new Error('Yoklama yalnız el başı hazırlıkta.');
    target = (parseInt(m.target) + seat) % 4; if (isNaN(target) || target === seat || target < 0 || target > 3) throw new Error('geçersiz hedef');
    var cnt = [0, 0, 0, 0]; g.players[target].hand.forEach(function (t) { if (t.fake || Okey.isJoker(t, g.ok)) return; cnt[t.c]++; }); info = cnt;
  }
  if (def.cat === 'react') {
    var slap = (r.lastSlap || {})[seat], open = r.lastOpen, win = def.windowMs || 5000, cands = [];
    if (slap && now - slap.at <= win) cands.push(slap.by); if (open && open.seat !== seat && now - open.at <= win) cands.push(open.seat);
    if (!cands.length) throw new Error('Tos için pencere kapalı: tokat yedikten ya da rakip açıldıktan sonra 5 sn.');
    target = m.target != null ? (parseInt(m.target) + seat) % 4 : cands[0];
    if (cands.indexOf(target) < 0) throw new Error('Tos hedefi: sana tokat atan ya da son açılan rakip.');
  }
  r.actUsed[seat][id] = used + 1;
  if (trial) { me.free[id] = 0; if (me.acc) Accounts.grant(me.acc, function (p) { Accounts.useFreeSkin(p, id); return {}; }, function (e, out, view) { if (!e && me.ws && me.ws.readyState === 1) send(me.ws, { t: 'me', player: view }); }); }
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws && s.ws.readyState === 1) send(s.ws, { t: 'skinFx', skin: id, from: rotateIdx(seat, i), target: (target != null && def.cat !== 'info') ? rotateIdx(target, i) : null, trial: trial && i === seat }); }); // bilgi skininde hedef herkese söylenmez
  if (info && me.ws && me.ws.readyState === 1) send(me.ws, { t: 'skinInfo', skin: id, target: rotateIdx(target, seat), counts: info }); // yalnız isteyene
  log(r, (me.name || '?') + ' ' + def.name + (target != null ? ' → ' + (r.seats[target] ? r.seats[target].name : target) : ''));
}
function handleSlap(r, seat, m) {
  var from = (parseInt(m.from) + seat) % 4, pk = r.peeks[from];
  if (!pk || pk.target !== seat) throw new Error('Sana bakan yok.');
  if (Date.now() >= pk.until) throw new Error('Süre doldu.');
  endPeek(r, from, 'slap');
  r.lastSlap = r.lastSlap || {}; r.lastSlap[from] = { by: seat, at: Date.now() }; // v9.91: tokat yiyen, 5 sn içinde tokatlayana tos atabilir
}
// Koltuğa oturan oyuncunun Masa Giriş Skini: yalnızca hesabında sahip olduğu skin herkese gösterilir (hesapsız istemcide skin yok)
function sanitizeSeat(r, s) { // koltuğun skin bilgisi hesaptan: Masa Giriş Skini sahipliği ve Çaktırmadan Bak hakkı istemcinin beyanına değil hesaba göre
  if (!s) return;
  if (!s.acc) { s.skins = 0; if (s.avatar) delete s.avatar.intro; return; }
  Accounts.auth(s.acc, function (e, p) {
    if (e || !p) { s.skins = 0; s.free = null; if (s.avatar) delete s.avatar.intro; broadcastRoom(r); return; }
    s.skins = Accounts.introCount(p); s.actions = Accounts.ownedActions(p); // v9.91 (K116)
    var vn = Venues.ofOwner(p.id); s.prof = { id: p.id, level: Accounts.levelOf(p.xp).level, matches: (p.stats && p.stats.matches) || 0, wins: (p.stats && p.stats.wins) || 0, owned: (p.owned || []).length, venue: vn ? vn.name : null, venueTier: vn ? vn.tier : null, arenas: Economy.CONFIG.arenas.filter(function (a) { return Economy.arenaOpen(p, a.theme); }).length, lp: Economy.leaguePoints(p, Date.now()) }; // v9.74 profil kartı (v9.86: açık mekân sayısı · v9.87: bu sezonun Döngü Puanı)
    s.venue = vn ? { code: vn.code, name: vn.name, tier: vn.tier, tierName: Economy.venueTier(vn.tier).name } : null; // v9.76 ev sahibi kartı için
    if (Accounts.ensureSkinGift(p)) Accounts.grant(s.acc, function (q) { Accounts.ensureSkinGift(q); return {}; }); // v9.86: yazma hesap kilidi altında (eşzamanlı ödülü silmesin)
    s.free = Object.assign({}, p.freeSkins || {}); // ücretsiz başlangıç hakları (Çaktırmadan Bak + Masa Giriş Skini denemesi); kullanımda hesaptan düşer
    s.paid = Object.assign({}, p.skinUses || {}); // v9.88: satın alınmış kullanım hakları
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
// ---- v9.76 "Bu masayla devam et" (sosyal rövanş, K-D1/A): maç bitince her insan koltuğu oy verir (REMATCH_WAIT); en az 2 "devam" → aynı oda bekleme odasına döner (yeni matchId), hayır/oysuz/kopuk koltuklar boşalır,
// boş koltuklar hızlı kuyruktan dolar (quick oda) ya da oyuncular açık onayla botla başlatır (v9.75 ilkesi). Bahisli masada "devam" oyu girişi yeniden emanete alır. ----
function rematchInfo(r) { var rm = r.rematch; return { t: 'rematch', votes: r.seats.map(function (s, i) { if (!s) return null; if (s.bot) return 'bot'; if (!rm) return null; return rm.votes[i] === true ? 'yes' : (rm.votes[i] === false ? 'no' : (s.ws && s.ws.readyState === 1 && !s.left ? 'wait' : 'gone')); }), names: r.seats.map(function (s) { return s ? s.name : null; }), left: rm ? Math.max(0, rm.until - Date.now()) : 0, entry: r.settings.entry || 0 }; }
function broadcastRematch(r, extra) { var info = Object.assign(rematchInfo(r), extra || {}); r.seats.forEach(function (s, i) { if (s && !s.bot && s.ws) send(s.ws, Object.assign({ you: i }, info)); }); }
function beginRematchVote(r) {
  if (r.rematch || !r.g || !r.g.finished) return;
  var live = r.seats.filter(function (s) { return s && !s.bot && !s.left && s.ws && s.ws.readyState === 1; }).length;
  if (live < 2) return; // tek insan: rövanş sorulmaz (yeni maçı lobiden kurar)
  r.rematch = { votes: {}, until: Date.now() + REMATCH_WAIT, timer: setTimeout(function () { resolveRematch(r); }, REMATCH_WAIT) };
  log(r, 'rövanş oylaması başladı (' + live + ' insan, ' + Math.round(REMATCH_WAIT / 1000) + ' sn)');
  broadcastRematch(r);
}
function rematchVote(r, seat, yes, ws) {
  var rm = r.rematch; if (!rm) throw new Error('Rövanş oylaması açık değil.');
  var s = r.seats[seat]; if (!s || s.bot) throw new Error('geçersiz hedef');
  if (rm.votes[seat] === true && yes) return;
  var finish = function () { rm.votes[seat] = !!yes; broadcastRematch(r); var pending = r.seats.some(function (x, i) { return x && !x.bot && !x.left && x.ws && x.ws.readyState === 1 && rm.votes[i] === undefined; }); if (!pending) resolveRematch(r); };
  if (yes && r.settings.entry) { // bahisli: giriş yeniden emanete (bakiye yoksa oy reddedilir)
    var entry = r.settings.entry; if (!s.acc) throw new Error('Giriş altınlı masa için hesap gerekir.');
    Accounts.grant(s.acc, function (p) { if (p.escrow) throw new Error('Zaten emanette girişin var (başka bir masa).'); if ((p.coins || 0) < entry) throw new Error('Yeterli altın yok: rövanş için ' + entry + ' altın gerekir.'); p.coins -= entry; p.escrow = { amount: entry, stake: r.settings.stake, at: Date.now() }; return { ok: true }; }, function (e, out, view) { if (e) { send(ws, { t: 'error', msg: e.message }); return; } s.escrow = entry; s.penalty = 0; send(ws, { t: 'me', player: view }); if (r.rematch === rm) finish(); else refundEscrow(s, 'rövanş iptal'); });
    return;
  }
  finish();
}
function resolveRematch(r) {
  var rm = r.rematch; if (!rm) return; clearTimeout(rm.timer); r.rematch = null;
  var stay = r.seats.map(function (s, i) { return !!(s && !s.bot && rm.votes[i] === true && !s.left && s.ws && s.ws.readyState === 1); });
  var n = stay.filter(Boolean).length;
  if (n < 2) { r.seats.forEach(function (s, i) { if (s && !s.bot && s.escrow && rm.votes[i] === true) refundEscrow(s, 'rövanş olmadı'); }); log(r, 'rövanş olmadı (' + n + ' devam oyu)'); broadcastRematch(r, { cancelled: true }); return; }
  var oldMatch = r.matchId;
  r.seats.forEach(function (s, i) { if (!s || stay[i]) return; if (!s.bot && s.ws && s.ws.readyState === 1) { send(s.ws, Object.assign(rematchInfo(r), { you: i, dropped: true })); if (s.ws._me) { s.ws._me.room = null; s.ws._me.seat = -1; } } if (!s.bot && s.escrow && !stay[i]) refundEscrow(s, 'rövanşa katılmadı'); r.seats[i] = null; });
  r.rematchOf = oldMatch; r.g = null; r.moment = null; r.pooled = false; r.hosted = false; r.rewarded = {}; r.forfeit = null; r.turnUntil = 0; r.peeks = {}; r.prepUntil = 0; r.emptySince = 0;
  clearTimeout(r.timer); clearTimeout(r.claimTimer); clearTimeout(r.nextTimer); r.nextTimer = null; r.nextAt = 0;
  r.seats.forEach(function (s) { if (s) { s.left = false; s.penalty = 0; s.pendingReward = null; s.pendingLeague = null; } });
  if (r.quick) { clearTimeout(r.quickTimer); r.quickTimer = null; r.quickUntil = 0; r.host = null; } // boş koltuklar Hızlı Katıl kuyruğundan dolar; dolunca kendiliğinden, yoksa oyuncular açık onayla botla başlatır
  else if (r.host == null || !r.seats[r.host]) transferHost(r);
  log(r, 'rövanş: ' + n + ' oyuncu devam ediyor, oda bekleme odasına döndü');
  broadcastRoom(r);
}
// ---- v9.76 ölçüm: el ve maç kayıtları (Accounts.logMatch → dosya ya da Postgres); lig ve arena eşikleri bu veriyle kararlaştırılacak ----
function roomKind(r) { return r.quick ? 'hizli' : (r.venue ? 'kiraathane' : 'arkadas'); }
function logHandRecord(r, now) {
  var g = r.g, ho = g.handOver; if (!g || !ho) return;
  try {
    var det = ho.detail || [], mult = 1; det.forEach(function (d) { if (d && d.mult > mult) mult = d.mult; });
    var opened = g.players.map(function (p) { return !!p.opened; });
    var openRounds = g.players.filter(function (p) { return p.opened && p.openedTurnNo != null; }).map(function (p) { return Math.floor(p.openedTurnNo / 4) + 1; });
    var acts = 0, botActs = 0, leftN = 0; r.seats.forEach(function (s, i) { if (!s || s.bot) return; var pt = partOf(r, i); acts += pt.acts; botActs += pt.botActs; if (s.left) leftN++; });
    var ws = ho.winner;
    Accounts.logMatch({ k: 'hand', match: r.matchId || null, room: roomKind(r), code: r.code, hand: g.hand, totalHands: g.totalHands, taskIdx: g.taskOrder ? g.taskOrder[g.currentHandIndex] : null, task: g.task ? g.task.text : null, stake: r.settings.stake || 'sosyal', entry: r.settings.entry || 0, theme: r.settings.theme || null, humans: humanCount(r), bots: 4 - humanCount(r), opened: opened, openedN: opened.filter(Boolean).length, openRounds: openRounds, turns: g.turnNo, secs: Math.round((now - (r.handStart || now)) / 1000), finish: ho.finishType, mult: mult, winnerSeat: ws, winnerHuman: ws != null ? !!(r.seats[ws] && !r.seats[ws].bot) : null, scores: ho.scores, ranks: ho.ranks, acts: acts, afkActs: botActs, leftN: leftN, finished: !!g.finished });
  } catch (e) { console.log('ölçüm kaydı yazılamadı: ' + e.message); }
}
function logMatchRecord(r, now, finished) {
  var g = r.g; if (!g || r.matchLogged) return; r.matchLogged = true;
  try { Accounts.logMatch({ k: 'match', match: r.matchId || null, room: roomKind(r), code: r.code, totalHands: g.totalHands, hands: g.hand, secs: Math.round((now - (r.matchStart || now)) / 1000), humansStart: r.humansStart != null ? r.humansStart : humanCount(r), humansEnd: r.seats.filter(function (s) { return s && !s.bot && !s.left && s.ws && s.ws.readyState === 1; }).length, finished: !!finished, forfeit: (r.forfeit || []).filter(Boolean).length, rematch: !!r.rematchOf, stake: r.settings.stake || 'sosyal', entry: r.settings.entry || 0, league: !!r.league }); } catch (e) { console.log('ölçüm kaydı yazılamadı: ' + e.message); }
}
// el / maç bitince hesaplara ödül yaz (yalnızca hesabı olan gerçek oyuncular); sonucu oyuncuya 'reward' mesajıyla bildir
function rewardIfOver(r) {
  var g = r.g; if (!g || g.phase !== 'handover') return;
  scheduleNext(r);
  if (!r.rewarded) r.rewarded = {};
  if (r.rewarded[g.hand]) return; r.rewarded[g.hand] = true;
  markRoom(r, true); // v9.85: el sonu hemen kaydedilir (ödül iki kez verilmesin); maç bittiyse kayıt silinir
  var now = Date.now(), ho = g.handOver;
  logHandRecord(r, now); // v9.76 ölçüm: el kaydı (kişisel veri yok)
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
  if (g.finished) { try { r.moment = Okey.matchMoment(g); } catch (e) { r.moment = null; } settlePool(r); venueHostReward(r, now); logMatchRecord(r, now, true); beginRematchVote(r); venueTablesChanged(r); }
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
  if (g.finished) settleLeagueForRoom(r, now); // v9.87: el ödülünden sonra (aynı hesabın yazmaları hesap kilidiyle sırayla)
}
function pickHostVenue(r) {
  if (r.venue) { var v = Venues.ofCode(r.venue.code); if (!v) return null; // v9.78 (B05): sahibi kendi kıraathane masasında oturuyorsa koltuğu işaretlenir → sahibine "Kıraathaneme git", diğerlerine "Ziyaret et"
    var os = null; for (var k = 0; k < 4; k++) { var sk = r.seats[k]; if (sk && !sk.bot && sk.acc && sk.acc.id === v.ownerId) { os = k; break; } }
    return { seat: os, code: v.code, name: v.name, tier: v.tier, tierName: Economy.venueTier(v.tier).name, owner: v.ownerName || null }; }
  for (var i = 0; i < 4; i++) { var s = r.seats[i]; if (s && !s.bot && s.venue) return { seat: i, code: s.venue.code, name: s.venue.name, tier: s.venue.tier, tierName: s.venue.tierName, owner: s.name }; }
  return null;
}
// ---- v9.87 lig (K108, basit sürüm): ayrı kuyruk yok. Lig maçı = Hızlı Katıl + Sosyal (girişsiz) + başlarken en az 3 gerçek oyuncu (hesaplı).
// Maç sonunda her gerçek oyuncuya sıraya göre Döngü Puanı (hükmen son 4.); rakip gücü = diğer insanların maç başındaki puanı. Altın/XP vermez. ----
function leagueEligible(r) {
  if (!r.quick || (r.settings.entry || 0) > 0) return false;
  return r.seats.filter(function (s) { return s && !s.bot && s.acc && s.prof; }).length >= Economy.CONFIG.league.minHumans; // s.prof: hesap sunucuda doğrulandı (sanitizeSeat)
}
function settleLeagueForRoom(r, now) {
  var g = r.g; if (!r.league || r.leagueDone || !g || !g.finished || !g.handOver) return; r.leagueDone = true;
  var ho = g.handOver, ff = r.forfeit || [false, false, false, false], hum = [];
  r.seats.forEach(function (s, i) { if (s && !s.bot && s.acc && s.prof) hum.push(i); });
  var group = hum.map(function (i) { return r.seats[i].acc.id; }).sort().join(','), pts = {};
  hum.forEach(function (i) { var s = r.seats[i]; pts[i] = (s.prof && s.prof.lp) || 0; });
  hum.forEach(function (i) {
    var s = r.seats[i], opp = hum.filter(function (j) { return j !== i; }).map(function (j) { return pts[j]; });
    Accounts.grant(s.acc, function (p) { return Economy.settleLeague(p, { ranks: ho.ranks, me: i, forfeits: ff, totalHands: g.totalHands || 12, oppPts: opp, group: group }, now); }, function (e, out, view) {
      if (e) { log(r, 'lig puanı yazılamadı (' + s.name + '): ' + e.message); return; }
      if (s.prof) s.prof.lp = out.points; Accounts.leagueChanged();
      var msg = { t: 'reward', reward: { hand: g.hand, league: true, gold: 0, xp: 0, lines: out.lines, leagueDelta: out.delta, leaguePoints: out.points, counted: out.counted }, player: view };
      if (s.ws && s.ws.readyState === 1) send(s.ws, msg); else s.pendingLeague = msg; // bağlantı o an kopuksa yeniden bağlanınca iletilir
    });
  });
  log(r, 'lig maçı bitti: ' + hum.length + ' oyuncu puanlandı');
}
function startGame(r) {
  fillBots(r);
  r.matchId = r.code + '-' + Date.now().toString(36); // Masa Giriş Skini gösterimi bu kimlikle bir kez (yeniden bağlanma yeni hak vermez)
  r.g = Okey.newGame({ names: r.seats.map(function (s) { return s.name; }), jokerCapturePenalty: r.settings.jokerPenalty, totalHands: r.settings.totalHands });
  if (TEST_FAKE_HAND && r.g.totalHands >= 12) r.g.guaranteedFakeIndicatorHand = TEST_FAKE_HAND;
  r.elig = null; r.factors = null; r.rewarded = {}; r.matchStart = Date.now(); r.humansStart = humanCount(r); r.matchLogged = false; r.moment = null; r.hosted = false; r.rematch = null;
  r.league = leagueEligible(r); r.leagueDone = false; // v9.87 (K108): lig maçı mı (başlarken karar verilir; maç boyunca değişmez)
  r.actsAll = [0, 0, 0, 0]; r.pooled = false; r.actsTot = null; r.botActsTot = null; r.forfeit = null; r.poolExtra = 0; // yeni maç: katılım ve ödül kayıtları sıfır (v9.76.1: v9.76'da bu satır yorumun içinde kalmıştı → ev sahipliği ödülü hamle sayamıyor, rövanşta ceza/sayaç taşınıyordu)
  r.hostVenue = pickHostVenue(r); // v9.76 görsel ev sahipliği (K-D2: oturma sırasında kıraathanesi olan ilk oyuncu; kıraathane masasında o kıraathane)
  Okey.startHand(r.g);
  beginPrep(r);
  consumeIntroTrials(r);
  log(r, 'oyun başladı' + (r.rematchOf ? ' (rövanş)' : ''));
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
    if (!s.bot && !s.left && r.part) { var discAt = partOf(r, a).discAt || Date.now(); delay = Math.max(delay, DISC_GRACE_MS - (Date.now() - discAt), (r.graceUntil || 0) - Date.now()); if (g.phase === 'claim') delay = Math.min(delay, r.settings.claimTime); } // v9.72: kopuk ama çıkmamış insan: kısa tolerans (yeniden bağlanırsa kendi oynar); v9.85: kayıttan geri yüklenen odada ilk RESTORE_GRACE_MS boyunca beklenir
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
    case 'lay': (m.groups || []).forEach(function (gr, i) { var kh = Array.isArray(m.kinds) ? m.kinds[i] : null; Okey.actLay(g, ids(gr), (kh === 'run' || kh === 'set') ? kh : undefined); }); break; // v9.82: iki türlü okunabilen perde (iki okey + tek taş) oyuncunun seçtiği tür; motor yalnız gerçekten belirsiz perde dikkate alır
    case 'add': Okey.actAdd(g, unrot(m.meld, seat, g), ids(m.tiles)); break;
    case 'swap': res = (Array.isArray(m.tiles) && m.tiles.length) ? Okey.actSwapJokers(g, unrot(m.meld, seat, g), ids(m.tiles)) : Okey.actSwapJoker(g, unrot(m.meld, seat, g), ids([m.tile])[0]); break; // v9.81: birden çok okey tek işlemde
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
var PKG_STATUS = ''; // v9.76: /durum'da paket parçası durumu ("Paket: v9.76, 8/8 parça" ya da eksik/eski parça uyarısı)
function zipComment(buf) { var e = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); if (e < 0) return ''; var n = buf.readUInt16LE(e + 20); return buf.slice(e + 22, e + 22 + n).toString('utf8').trim(); }
function unzipPublic() {
  if (fs.existsSync(path.join(PUBLIC, 'index.html'))) return;
  // v9.76: paket ~5 MB'lık parçalara bölünür (sohbetten indirme büyük dosyada takılıyordu). public.zip'in zip açıklaması parça listesini ve sürümü taşır;
  // her parçanın açıklaması aynı sürümle başlar. Eksik parça ya da başka sürümden kalmış (eski) parça açılmaz, log'a ve /durum'a yazılır.
  var base = path.join(__dirname, 'public.zip'), man = null;
  if (fs.existsSync(base)) { var m = /^dongu-paket (\S+) parcalar: (.+)$/.exec(zipComment(fs.readFileSync(base))); if (m) man = { ver: m[1], parts: m[2].split(/\s+/).filter(Boolean) }; }
  if (!man) { ['public.zip', 'assets.zip'].forEach(function (zname) { var zp = path.join(__dirname, zname); if (fs.existsSync(zp)) unzipInto(zp, zname); }); return; } // eski biçim (tek public.zip + assets.zip)
  var ok = 0, bad = [];
  man.parts.forEach(function (entry) { // v9.93: "assets.zip@k-…" → parça içerik etiketiyle doğrulanır (görseller değişmediyse eski assets.zip geçerli); etiketsiz girdi sürümle
    var at = entry.indexOf('@'), zname = at > 0 ? entry.slice(0, at) : entry, tag = at > 0 ? entry.slice(at + 1) : man.ver;
    if (!/^(public|assets)(-\d+)?\.zip$/.test(zname)) return;
    var zp = path.join(__dirname, zname);
    if (!fs.existsSync(zp)) { bad.push(zname + ' eksik'); console.log('EKSİK PARÇA: ' + zname + ' GitHub\'a yüklenmemiş; bazı görseller görünmeyebilir.'); return; }
    var buf = fs.readFileSync(zp), c = zipComment(buf);
    if (c.indexOf('dongu-paket ' + tag + ' ') !== 0) { bad.push(zname + ' eski'); console.log('ESKİ PARÇA: ' + zname + ' (' + (c || 'etiketsiz') + ') — ' + tag + ' bekleniyordu; açılmadı. Bu dosyayı yeni paketteki ile değiştir.'); return; }
    unzipInto(zp, zname, buf); ok++;
  });
  PKG_STATUS = 'Paket: ' + man.ver + ', ' + ok + '/' + man.parts.length + ' parça' + (bad.length ? ' (SORUN: ' + bad.join(', ') + ')' : '');
  console.log(PKG_STATUS);
}
function unzipInto(zipPath, zname, preBuf) {
  var zlib = require('zlib'), buf = preBuf || fs.readFileSync(zipPath), n = 0;
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
var Social = null; try { Social = require('./social.js'); } catch (e) { console.log('sosyal modül yüklenemedi (arkadaşlık/mesaj kapalı): ' + e.message); } // v9.93 (K118): dosya yoksa oyun yine çalışır
// ---- v9.85 kalıcı oda kaydı (K106) ----
// Başlamış ve bitmemiş maçlar Postgres'te "rooms" tablosunda (DATABASE_URL yoksa data/rooms.json dosyasında) tutulur. Sunucu yeniden kurulunca (deploy)
// ya da yeniden başlayınca oda geri yüklenir; oyuncuların uygulaması aynı oda kodu ve koltuk anahtarıyla kendiliğinden yeniden bağlanır, maç kaldığı yerden sürer.
// Sahiplik: bir oda satırını yalnız sahibi olan sunucu süreci (INSTANCE) yazar. Kapanırken (SIGTERM) son durum yazılır ve sahiplik bırakılır; yeni süreç
// bırakılan odayı hemen, sahibi ROOM_STALE_S sn ses vermeyen (çökmüş) odayı sonra devralır. Kurulumda eski ve yeni süreç kısa süre birlikte çalışırsa
// yeni süreç eskisinin odasına dokunmaz; o odaya bağlanmak isteyen uygulama "biraz sonra yeniden dene" kapanışı (1013) alır ve kendiliğinden yeniden dener.
var INSTANCE = 's' + token().slice(0, 10);
var ROOMS_FILE = path.join(__dirname, 'data', 'rooms.json');
var ROOM_STALE_S = parseInt(process.env.ROOM_STALE_S) || 45;          // sahibi bu kadar sn sessiz kalan oda devralınır
var RESTORE_GRACE_MS = parseInt(process.env.RESTORE_GRACE_MS) || 30000; // geri yüklenen odada kopuk insanın sırası için bekleme
var ESCROW_RELEASE_MS = parseInt(process.env.ESCROW_RELEASE_MS) || 90000; // açılıştan sonra yarım kalan emanetlerin iadesi (eski süreç kapanmış olsun)
var BEAT_MS = Math.max(1000, Math.min(15000, Math.floor(ROOM_STALE_S * 1000 / 3))); // nabız aralığı: sahiplik süresinin en çok üçte biri (aksi halde canlı sunucunun odası sessiz sanılır)
var SHUTTING = false, foreign = {}, restoredN = 0, listening = false;
var RS = { chain: Promise.resolve(), dirty: {}, timer: null };
var ROOM_SKIP = { g: 1, seats: 1, timer: 1, claimTimer: 1, quickTimer: 1, nextTimer: 1, peeks: 1, rematch: 1, prepDone: 1, persisted: 1 };
function persistable(r) { return !!(r && r.g && !r.g.finished && rooms[r.code] === r); }
function roomSnapshot(r) { // oda → JSON (bağlantılar ve zamanlayıcılar hariç; oyun motoru kendi serialize'ıyla; oyun günlüğünün yalnız son 20 satırı — ekrana son 12'si gider)
  var gl = r.g.log, gs; if (gl && gl.length > 20) r.g.log = gl.slice(-20);
  try { gs = Okey.serialize(r.g); } finally { r.g.log = gl; }
  var o = { v: 1, gs: gs };
  Object.keys(r).forEach(function (k) { if (!ROOM_SKIP[k]) o[k] = r[k]; });
  o.seats = r.seats.map(function (s) { if (!s) return null; var x = {}; Object.keys(s).forEach(function (k) { if (k !== 'ws') x[k] = s[k]; }); return x; });
  return JSON.stringify(o, function (k, v) { if (typeof v === 'string') return v.indexOf('\u0000') >= 0 ? v.replace(/\u0000/g, '') : v; return v && typeof v === 'object' && v.constructor && (v.constructor.name === 'Timeout' || v.constructor.name === 'WebSocket') ? undefined : v; });
}
function restoreRoom(o) { // kayıt → oda; herkes kopuk başlar (aynı kod + koltuk anahtarıyla dönünce koltuğuna oturur)
  if (typeof o === 'string') o = JSON.parse(o);
  if (!o || !o.code || !o.gs || rooms[o.code]) return null;
  var g = Okey.deserialize(o.gs); if (!g || g.finished) return null;
  var r = {}, now = Date.now(); Object.keys(o).forEach(function (k) { if (k !== 'gs' && k !== 'v') r[k] = o[k]; });
  r.g = g; r.seats = [0, 1, 2, 3].map(function (i) { var s = (o.seats || [])[i] || null; if (s) s.ws = null; return s; });
  r.timer = r.claimTimer = r.quickTimer = r.nextTimer = null; r.nextAt = 0; r.turnUntil = 0; r.peeks = {}; r.prepDone = {}; r.rematch = null; r.emptySince = 0;
  if (!(r.prepUntil > now)) r.prepUntil = 0;
  if (r.part) r.part.forEach(function (pt, i) { var s = r.seats[i]; if (pt && s && !s.bot && !pt.discAt) pt.discAt = now; }); // yeniden bağlanana kadar kopuk sayılır (sunucu kesintisi sayılmaz)
  r.restoredAt = now; r.graceUntil = now + RESTORE_GRACE_MS; r.persisted = true;
  rooms[r.code] = r; delete foreign[r.code]; restoredN++;
  log(r, 'oda kayıttan geri yüklendi: el ' + g.hand + '/' + g.totalHands + ', tur ' + g.turnNo + ', ' + humanCount(r) + ' insan');
  if (g.phase === 'handover') scheduleNext(r); else scheduleBots(r);
  return r;
}
function markRoom(r, now) { // oda değişti: en geç 1 sn sonra (now: hemen) yaz; artık kaydedilmeyecek odanın satırı silinir
  if (!r || !r.code || SHUTTING || !(persistable(r) || r.persisted)) return;
  RS.dirty[r.code] = true;
  if (now) { clearTimeout(RS.timer); RS.timer = null; flushRooms(); }
  else if (!RS.timer) RS.timer = setTimeout(function () { RS.timer = null; flushRooms(); }, 1000);
}
var ROOM_UPSERT = 'INSERT INTO rooms (code, data, owner, beat) VALUES ($1, $2::jsonb, $3, now()) ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, beat = now() WHERE rooms.owner = EXCLUDED.owner RETURNING code';
function flushRooms() { // tek sıra: aynı odanın yazma ve silme işlemleri sırayla gider; anlık durum yazma anında alınır
  var codes = Object.keys(RS.dirty); RS.dirty = {};
  var db = Accounts.db();
  if (!db) { if (codes.length) writeRoomsFile(); return RS.chain; }
  codes.forEach(function (c) {
    RS.chain = RS.chain.then(function () {
      var r = rooms[c];
      if (persistable(r)) return db.query(ROOM_UPSERT, [c, roomSnapshot(r), INSTANCE]).then(function (res) { r.persisted = true; if (!res.rows.length) dropLostRoom(r); });
      if (r) r.persisted = false;
      return db.query('DELETE FROM rooms WHERE code = $1 AND owner = $2', [c, INSTANCE]);
    }).catch(function (e) { console.log('oda kaydı yazılamadı (' + c + '): ' + e.message); });
  });
  return RS.chain;
}
function dropLostRoom(r) { // satırı başka bir sunucu süreci devralmış (bu süreç uzun süre veritabanına ulaşamadı): oda burada kapanır, oyuncular yeniden bağlanıp yeni sahibine geçer
  if (rooms[r.code] !== r) return; log(r, 'oda başka sunucu sürecine geçti; bu süreçte kapatılıyor, oyuncular yeniden bağlanacak');
  clearTimeout(r.timer); clearTimeout(r.claimTimer); clearTimeout(r.nextTimer); clearTimeout(r.quickTimer); if (r.rematch) clearTimeout(r.rematch.timer); Object.keys(r.peeks || {}).forEach(function (f) { clearTimeout(r.peeks[f].timer); clearTimeout(r.peeks[f].botTimer); });
  delete rooms[r.code]; r.persisted = false; foreign[r.code] = true;
  r.seats.forEach(function (s) { if (s && s.ws) { var w = s.ws; s.ws = null; if (w._me) { w._me.room = null; w._me.seat = -1; } try { w.close(1012, 'oda devredildi'); } catch (e) {} } });
}
function writeRoomsFile() { // dosya modu: süren bütün maçlar tek dosyada
  var out = { v: 1, at: Date.now(), rooms: {} };
  var n = 0; Object.keys(rooms).forEach(function (c) { if (persistable(rooms[c])) { out.rooms[c] = roomSnapshot(rooms[c]); rooms[c].persisted = true; n++; } else if (rooms[c].persisted) rooms[c].persisted = false; });
  try { fs.mkdirSync(path.dirname(ROOMS_FILE), { recursive: true }); fs.writeFileSync(ROOMS_FILE + '.tmp', JSON.stringify(out)); fs.renameSync(ROOMS_FILE + '.tmp', ROOMS_FILE); } catch (e) { console.log('oda kaydı dosyası yazılamadı: ' + e.message); }
  return n;
}
var ROOM_CLAIM = "UPDATE rooms SET owner = $1, beat = now() WHERE (owner IS NULL OR (owner <> $1 AND beat < now() - $2::int * interval '1 second'))";
function claimRooms(code) { // bırakılmış ya da sahibi sessiz kalmış satırları devral ve geri yükle (code: yalnız o oda); dönüş: geri yüklenen oda sayısı
  var db = Accounts.db(); if (!db || SHUTTING) return Promise.resolve(0);
  return db.query(ROOM_CLAIM + (code ? ' AND code = $3' : '') + ' RETURNING code, data', code ? [INSTANCE, ROOM_STALE_S, code] : [INSTANCE, ROOM_STALE_S]).then(function (res) {
    var n = 0; res.rows.forEach(function (row) { delete foreign[row.code]; if (rooms[row.code]) return; try { if (restoreRoom(row.data)) n++; } catch (e) { console.log('oda geri yüklenemedi (' + row.code + '): ' + e.message); } });
    return n;
  });
}
function claimOne(code) { // yeniden bağlanan oyuncunun odası bu süreçte yok: 'ok' (devralındı), 'busy' (başka canlı sürecin), 'none' (kayıt yok)
  var db = Accounts.db(); if (!db || SHUTTING) return Promise.resolve('none');
  return claimRooms(code).then(function () {
    if (rooms[code]) return 'ok';
    return db.query('SELECT owner FROM rooms WHERE code = $1', [code]).then(function (res) { if (res.rows.length && res.rows[0].owner !== INSTANCE) { foreign[code] = true; return 'busy'; } return 'none'; });
  }).catch(function (e) { console.log('oda devralma hatası (' + code + '): ' + e.message); return 'busy'; });
}
function loadRooms(cb) { // açılış: kayıtlı odaları oku, bırakılmış/sahibi sessiz olanları geri yükle
  var db = Accounts.db();
  if (!db) {
    var file = null; try { file = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8')); } catch (e) {}
    Object.keys((file && file.rooms) || {}).forEach(function (c) { try { restoreRoom(file.rooms[c]); } catch (e) { console.log('oda kaydı okunamadı (' + c + '): ' + e.message); } });
    return cb();
  }
  db.query('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data JSONB NOT NULL, owner TEXT, beat TIMESTAMPTZ DEFAULT now())')
    .then(function () { return db.query('SELECT code FROM rooms'); })
    .then(function (res) { res.rows.forEach(function (row) { foreign[row.code] = true; }); return claimRooms(); })
    .then(function () { cb(); }, function (e) { console.log('oda kayıtları okunamadı: ' + e.message); cb(); });
}
function releaseStaleEscrows() { // açılıştan ESCROW_RELEASE_MS sonra: hiçbir masada oturmayan hesabın yarım kalan emaneti iade edilir (geri yüklenen ya da başka süreçteki masadakiler korunur)
  var keep = {}, note = function (s) { if (s && !s.bot && s.acc && s.escrow) keep[s.acc.id] = true; };
  Object.keys(rooms).forEach(function (c) { rooms[c].seats.forEach(note); });
  var db = Accounts.db(), go = function () { Accounts.releaseEscrows(function (n) { if (n) console.log('yarım kalan emanet iade edildi: ' + n); }, keep); };
  if (!db) return go();
  db.query('SELECT data FROM rooms WHERE owner IS DISTINCT FROM $1', [INSTANCE]).then(function (res) { res.rows.forEach(function (row) { ((row.data && row.data.seats) || []).forEach(note); }); go(); }, function (e) { console.log('emanet iadesi yapılmadı (oda kayıtları okunamadı): ' + e.message); });
}
setInterval(function () { // nabız (yalnız gerektiğinde sorgu): sahip olunan satırlar canlı, artık kaydedilmeyecek satırlar silinir, bırakılmış/sahibi sessiz odalar devralınır
  var db = Accounts.db(); if (!db || SHUTTING || !listening) return;
  var mine = Object.keys(rooms).filter(function (c) { return persistable(rooms[c]); }), stale = Object.keys(rooms).some(function (c) { return rooms[c].persisted && !persistable(rooms[c]); });
  if (!mine.length && !stale && !Object.keys(foreign).length && !RS.owned) return;
  RS.chain = RS.chain.then(function () {
    mine = Object.keys(rooms).filter(function (c) { return persistable(rooms[c]); });
    return db.query('UPDATE rooms SET beat = now() WHERE owner = $1', [INSTANCE])
      .then(function () { return db.query('DELETE FROM rooms WHERE owner = $1 AND NOT (code = ANY($2::text[]))', [INSTANCE, mine]); })
      .then(function () { RS.owned = mine.length > 0; return db.query('SELECT code FROM rooms WHERE owner IS DISTINCT FROM $1', [INSTANCE]); })
      .then(function (res) { var f = {}; res.rows.forEach(function (row) { f[row.code] = true; }); foreign = f; return Object.keys(f).length ? claimRooms() : 0; });
  }).catch(function (e) { console.log('oda kaydı nabız hatası: ' + e.message); });
}, BEAT_MS);
function releaseRooms() { // kapanış: son durum yazılır, sahiplik bırakılır (yeni süreç hemen devralır)
  var db = Accounts.db();
  if (!db) { console.log('kapanış: ' + writeRoomsFile() + ' süren maç kaydedildi (dosya)'); return Promise.resolve(); }
  return RS.chain.then(function () {
    var codes = Object.keys(rooms).filter(function (c) { return persistable(rooms[c]); });
    return Promise.all(codes.map(function (c) { return db.query('INSERT INTO rooms (code, data, owner, beat) VALUES ($1, $2::jsonb, NULL, now()) ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, owner = NULL, beat = now() WHERE rooms.owner = $3', [c, roomSnapshot(rooms[c]), INSTANCE]); }))
      .then(function () { return db.query('DELETE FROM rooms WHERE owner = $1', [INSTANCE]); })
      .then(function () { console.log('kapanış: ' + codes.length + ' süren maç kaydedildi, sahiplik bırakıldı'); });
  });
}
function shutdown(sig) { // Render kurulumda / yeniden başlatmada SIGTERM gönderir
  if (SHUTTING) return; SHUTTING = true; console.log(sig + ': sunucu kapanıyor, süren maçlar kaydediliyor');
  Object.keys(rooms).forEach(function (c) { var r = rooms[c]; clearTimeout(r.timer); clearTimeout(r.claimTimer); clearTimeout(r.nextTimer); clearTimeout(r.quickTimer); if (r.rematch) clearTimeout(r.rematch.timer); Object.keys(r.peeks || {}).forEach(function (f) { clearTimeout(r.peeks[f].timer); clearTimeout(r.peeks[f].botTimer); }); });
  clearTimeout(RS.timer);
  var done = false, finish = function () { if (done) return; done = true; wss.clients.forEach(function (ws) { try { ws.close(1012, 'sunucu yenileniyor'); } catch (e) {} }); setTimeout(function () { process.exit(0); }, 300); };
  releaseRooms().then(finish, function (e) { console.log('kapanış kaydı hatası: ' + e.message); finish(); });
  setTimeout(finish, 8000);
}
process.on('SIGTERM', function () { shutdown('SIGTERM'); });
process.on('SIGINT', function () { shutdown('SIGINT'); });
function startListening() { if (listening) return; listening = true; server.listen(PORT, function () { console.log('Döngü sunucusu ' + PORT + ' portunda'); }); }
Accounts.init({ publicDir: PUBLIC }, function (e, mode) { setImmediate(function () { // v9.85: önce kayıtlı odalar geri yüklenir, sonra bağlantı kabul edilir
  console.log('hesap deposu: ' + mode + (e ? ' (' + e.message + ')' : ''));
  loadRooms(function () { if (restoredN) console.log('kayıttan geri yüklenen oda: ' + restoredN); startListening(); });
  setTimeout(releaseStaleEscrows, ESCROW_RELEASE_MS); // v9.85: önceden açılışta hemen iade ediliyordu (geri yüklenen bahisli maçın girişi de iade edilirdi)
  Venues.init({ accounts: Accounts, db: Accounts.db() }, function (e2) { console.log('kıraathane deposu hazır' + (e2 ? ' (' + e2.message + ')' : '')); });
  if (Social) Social.init(function (e3, smode) { console.log('sosyal depo: ' + (smode || '?') + (e3 ? ' (' + e3.message + ')' : '')); });
}); });
Accounts.route('/api/venue/', Venues.handleHttp);
if (Social) { Accounts.route('/api/social/', Social.handleHttp); Accounts.route('/api/dm/', Social.handleHttp); } // v9.93
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8' };
var server = http.createServer(function (req, res) {
  var url = (req.url || '/').split('?')[0];
  if (url === '/durum') { Accounts.count(function (n) { Accounts.matchCounts(function (mc) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Döngü sunucusu çalışıyor. Sürüm: v9.97. Ekonomi: ' + Economy.CONFIG.version + '. Mekânlar: ' + QUICK_THEMES.join(', ') + '. Odalar: ' + Object.keys(rooms).length + ' (kayıttan dönen ' + restoredN + ')' + '. Sosyal: ' + (Social ? Social.VERSION + ' (çevrim içi ' + Social.onlineCount() + ')' : 'kapalı') + '. Hesap deposu: ' + Accounts.modeName() + ', oyuncu: ' + n + '. Kayıt: ' + mc.hands + ' el / ' + mc.matches + ' maç' + (Accounts.lastWipe() ? '. Sıfırlama: ' + Accounts.lastWipe() + ' (yapıldı)' : '') + (PKG_STATUS ? '. ' + PKG_STATUS : '')); }); }); return; }
  if (url === '/olcum') { Accounts.matchSummary(function (e, out) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(out, null, 1)); }); return; } // v9.76: görev başına açılma, el uzunluğu, bitiş türleri, çarpan; maç tamamlama ve rövanş oranı
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
    ws.isAlive = true; if (SHUTTING) return; // v9.85: kapanırken gelen hamle işlenmez (son durum kaydedildi; yeni sunucuda yeniden yapılır)
    var m; try { m = JSON.parse(data); } catch (e) { return; }
    try { handle(ws, me, m); } catch (e) { send(ws, { t: 'error', msg: e.message }); }
  });
  ws.on('close', function (code, reason) {
    if (SHUTTING) return; // v9.85: kapanışta bağlantılar sunucu tarafından kapatılır; oda kayıttaki haliyle kalır
    venueLeave(me); if (Social) Social.detach(ws);
    var r = me.room; if (!r || me.seat < 0) return;
    var sc = r.seats[me.seat]; log(r, (sc ? sc.name : '?') + ' bağlantı kapandı (kod ' + code + (reason && reason.length ? ', ' + String(reason).slice(0, 60) : '') + (sc && sc.ws === ws ? '' : ', eski bağlantı') + ')'); // v9.73: kopma nedeni log'da
    var s = r.seats[me.seat]; if (s && s.ws === ws) { s.ws = null; if (r.g && r.part) { var pt = partOf(r, me.seat); if (!pt.discAt) pt.discAt = Date.now(); } if (!r.g && s.escrow) { refundEscrow(s, 'bağlantı koptu'); r.seats[me.seat] = null; } }
    broadcastRoom(r);
    if (r.rematch) { var pendV = r.seats.some(function (x, i) { return x && !x.bot && !x.left && x.ws && x.ws.readyState === 1 && r.rematch.votes[i] === undefined; }); broadcastRematch(r); if (!pendV) resolveRematch(r); } // v9.76: oylamada kopan oyuncu beklenmez
    if (r.g) scheduleBots(r); // kopan oyuncunun yerine sunucu oynar
    else if (!r.seats.some(function (x) { return x && !x.bot && x.ws; })) { if (r.quick || r.venue) { clearTimeout(r.timer); delete rooms[r.code]; venueTablesChanged(r); } else if (!r.emptySince) { r.emptySince = Date.now(); log(r, 'kimse bağlı değil; oda ' + Math.round(ROOM_GRACE_MS / 60000) + ' dk açık kalır'); } } // v9.75: arkadaş odası hemen silinmez (ROOM_GRACE_MS); hızlı/kıraathane masası eskisi gibi
  });
});
function arenaCheck(acc, theme, cb) { // v9.86 (K107): mekân kilidi sunucuda da denetlenir. cb(hata, açık mekânlar). Hesapsız ya da okunamayan hesap: yalnız Köy Meydanı
  var lockErr = function () { return new Error('Bu mekân henüz açık değil: ' + Economy.arenaName(theme) + '. Lobide kartına dokunup nasıl açılacağını görebilirsin.'); };
  var none = function () { cb(theme && theme !== 'koy' ? lockErr() : null, ['koy']); };
  if (!acc) return none();
  Accounts.auth(acc, function (e, p) {
    if (e || !p) return none();
    var open = Economy.CONFIG.arenas.map(function (a) { return a.theme; }).filter(function (t) { return QUICK_THEMES.indexOf(t) >= 0 && Economy.arenaOpen(p, t); });
    if (!open.length) open = ['koy'];
    cb(theme && open.indexOf(theme) < 0 ? lockErr() : null, open);
  });
}
function handle(ws, me, m) {
  var r;
  if (m.t === 'create') {
    r = newRoom(); var s0 = { name: (m.name || 'Oyuncu').slice(0, 14), avatar: m.avatar || null, skins: m.skins || 0, bot: false, token: token(), ws: ws, acc: accOf(m) };
    r.seats[0] = s0; r.host = 0; me.room = r; me.seat = 0; sanitizeSeat(r, s0);
    if (m.settings) Object.assign(r.settings, { claimTime: Math.max(3000, Math.min(20000, (m.settings.claimTime || 8) * 1000)), jokerPenalty: m.settings.jokerPenalty || 10, totalHands: m.settings.totalHands, theme: String(m.settings.theme || 'koy').slice(0, 24) }); // tema maç boyunca sabit, herkes aynı mekânı görür
    send(ws, { t: 'joined', code: r.code, seat: 0, token: s0.token });
    broadcastRoom(r); log(r, 'oda kuruldu: ' + s0.name);
    if (r.settings.theme && r.settings.theme !== 'koy') (function (room, th) { arenaCheck(s0.acc, th, function (err) { if (!err || room.g || room.settings.theme !== th) return; room.settings.theme = 'koy'; log(room, 'kurucunun mekânı kilitli (' + th + '): Köy Meydanı'); broadcastRoom(room); }); })(r, r.settings.theme); // v9.86: kurucu açmadığı mekânı seçemez (istemci zaten engeller)
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
      if (!r) { r = newRoom(); r.quick = true; r.host = null; r.settings.totalHands = th; r.settings.stake = stake.id; r.settings.entry = entry; r.settings.theme = wantTheme || (qs.open && qs.open.length ? qs.open[Math.floor(Math.random() * qs.open.length)] : 'koy'); /* v9.86: mekân seçilmediyse oyuncunun açık mekânlarından biri */ var waitMs = entry ? PAID_WAIT : QUICK_WAIT; r.quickUntil = Date.now() + waitMs; r.quickTimer = setTimeout(function () { if (r.g) return; var live = r.seats.filter(function (x) { return x && !x.bot && x.ws && x.ws.readyState === 1; }).length; if (entry) { if (live < 2) { cancelPaidRoom(r, 'Masa ' + Math.round(PAID_WAIT / 1000) + ' sn içinde en az 2 gerçek oyuncuya ulaşmadı; girişler iade edildi.'); return; } r.seats.forEach(function (x, i) { if (x && !x.bot && !(x.ws && x.ws.readyState === 1)) { refundEscrow(x, 'bağlantı kapandı'); r.seats[i] = null; } }); startGame(r); return; } if (live) startGame(r); }, waitMs); log(r, 'hızlı masa açıldı (' + th + ' el, ' + stake.name + ')'); }
      var qi = freeSeat(r); r.seats[qi] = qs; me.room = r; me.seat = qi; sanitizeSeat(r, qs);
      send(ws, { t: 'joined', code: r.code, seat: qi, token: qs.token, stake: stake.id, entry: entry });
      broadcastRoom(r); log(r, qs.name + ' hızlı katıldı' + (entry ? ' (giriş ' + entry + ')' : ''));
      if (freeSeat(r) < 0) { clearTimeout(r.quickTimer); startGame(r); } // 4 gerçek oyuncu → hemen
    };
    if (!entry) { arenaCheck(qs.acc, wantTheme, function (err, open) { if (err) { send(ws, { t: 'error', msg: err.message, fatal: true }); return; } qs.open = open; seatQuick(); }); return; } // v9.86: kilitli mekânın masasına oturulmaz
    // giriş altınlı masa: hesap şart, seviye ve bakiye kontrolü, emanet (altın hemen düşer; maç başlamazsa iade)
    if (!qs.acc) throw new Error('Giriş altınlı masa için hesap gerekir.');
    Accounts.grant(qs.acc, function (p) {
      var lv = Accounts.levelOf(p.xp).level;
      if (lv < stake.level) throw new Error(stake.name + ' masası için seviye ' + stake.level + ' gerekir (sen: ' + lv + ').');
      if (p.escrow) throw new Error('Zaten emanette girişin var (başka bir masa).');
      if ((p.coins || 0) < entry) throw new Error('Yeterli altın yok: bu masa için ' + entry + ' altın gerekir.');
      var open = Economy.CONFIG.arenas.map(function (a) { return a.theme; }).filter(function (t) { return QUICK_THEMES.indexOf(t) >= 0 && Economy.arenaOpen(p, t); }); if (!open.length) open = ['koy']; // v9.86: mekân kilidi
      if (wantTheme && open.indexOf(wantTheme) < 0) throw new Error('Bu mekân henüz açık değil: ' + Economy.arenaName(wantTheme) + '. Lobide kartına dokunup nasıl açılacağını görebilirsin.');
      qs.open = open;
      p.coins -= entry; p.escrow = { amount: entry, stake: stake.id, at: Date.now() };
      return { ok: true };
    }, function (e, out, view) {
      if (e) { send(ws, { t: 'error', msg: e.message, fatal: true }); return; }
      qs.escrow = entry; send(ws, { t: 'me', player: view });
      seatQuick();
    });
    return;
  }
  if (m.t === 'abandon') { // v9.75: istemci başka bir oda kurar/katılırken eski kaydındaki başlamamış koltuğu bırakır (hayalet koltuk kalmasın)
    var ar = rooms[(m.code || '').toUpperCase()]; if (!ar || ar.g || !m.token) return;
    ar.seats.forEach(function (sx, ai) { if (sx && !sx.bot && sx.token === m.token && !(sx.ws && sx.ws.readyState === 1 && sx.ws !== ws)) { if (sx.escrow) refundEscrow(sx, 'odadan ayrıldı'); ar.seats[ai] = null; if (ar.host === ai) transferHost(ar); log(ar, sx.name + ' eski odadaki koltuğunu bıraktı'); } });
    if (!ar.seats.some(function (x) { return x && !x.bot; })) { clearTimeout(ar.quickTimer); clearTimeout(ar.timer); delete rooms[ar.code]; } else broadcastRoom(ar);
    return;
  }
  if (m.t === 'join') {
    var jc = String(m.code || '').slice(0, 8).toUpperCase(); r = rooms[jc];
    if (!r && m.token && !m._claim && Accounts.db()) { // v9.85: oda bu süreçte yok ama kayıtlı olabilir (yeni kurulumdan sonra dönen oyuncu): önce devral, sonra katıl
      m._claim = true;
      claimOne(jc).then(function (st) { if (ws.readyState !== 1) return; if (st === 'busy') { try { ws.close(1013, 'oda devrediliyor'); } catch (e) {} return; } try { handle(ws, me, m); } catch (e) { send(ws, { t: 'error', msg: e.message }); } }); // busy: oda hâlâ eski süreçte; uygulama kendiliğinden yeniden dener
      return;
    }
    if (!r) throw new Error('Oda bulunamadı. Kodu kontrol et.');
    // yeniden bağlanma
    var back = -1;
    if (m.token) r.seats.forEach(function (s, i) { if (s && s.token === m.token) back = i; });
    if (back >= 0 && r.seats[back].left && r.settings.entry && r.g && !r.g.finished) throw new Error('Bu maçtan çıktın; bahisli masaya geri dönülemez.');
    if (back >= 0) {
      var old = r.seats[back].ws;
      if (old && old !== ws && old.readyState === 1) { send(old, { t: 'takeover' }); if (old._me) { old._me.room = null; old._me.seat = -1; } try { old.close(); } catch (e) {} log(r, r.seats[back].name + ': koltuk yeni bağlantıya devredildi (aynı hesap başka sekme/cihaz)'); } // tek etkin bağlantı: son açılan kazanır
      if (r.seats[back].left && !r.settings.entry && r.forfeit) r.forfeit[back] = false; // sosyal masada geri dönüş: bilerek çıkış bayrağı kalkar (K14 yarı-hamle kuralı maç sonunda yine uygulanır)
      r.seats[back].ws = ws; r.seats[back].left = false; me.room = r; me.seat = back; r.emptySince = 0; if (r.g && r.part) { var pb = partOf(r, back); if (pb.discAt) { pb.discMs += Date.now() - pb.discAt; pb.discAt = 0; } } send(ws, { t: 'joined', code: r.code, seat: back, token: m.token }); broadcastRoom(r); if (r.g) { send(ws, { t: 'state', view: viewFor(r, back), event: 'resync' }); scheduleBots(r); } if (r.seats[back].pendingReward) { send(ws, r.seats[back].pendingReward); r.seats[back].pendingReward = null; } if (r.seats[back].pendingLeague) { send(ws, r.seats[back].pendingLeague); r.seats[back].pendingLeague = null; } return; }
    if (r.g) throw new Error('Bu masada oyun başlamış.');
    var i = freeSeat(r); if (i < 0) throw new Error('Masa dolu.');
    var s = { name: (m.name || 'Oyuncu').slice(0, 14), avatar: m.avatar || null, skins: m.skins || 0, bot: false, token: token(), ws: ws, acc: accOf(m) };
    r.seats[i] = s; me.room = r; me.seat = i; sanitizeSeat(r, s); r.emptySince = 0;
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
    if (vr && vr.g && vr.g.finished) { if (presentHumans(vr) > 0) throw new Error('Bu masada maç yeni bitti; oyuncular kalkınca (ya da rövanş kararı verilince) oturabilirsin.'); delete rooms[vr.code]; vr = null; } // v9.96 (K123): sonuç ekranında/rövanş oyunda bekleyenlerin odası ziyaretçi oturunca silinmez
    if (!vr) { vr = newRoom(); vr.venue = { code: sv.code, iid: m.iid, key: key }; vr.host = 0; vr.settings.totalHands = (m.totalHands === 1 || m.totalHands === 6) ? m.totalHands : 12; vr.settings.theme = sv.theme; vr.seats[0] = seatSelf; me.room = vr; me.seat = 0; }
    else { var fsx = freeSeat(vr); if (fsx < 0) throw new Error('Masa dolu.'); vr.seats[fsx] = seatSelf; me.room = vr; me.seat = fsx; }
    sanitizeSeat(vr, seatSelf); venueLeave(me);
    send(ws, { t: 'joined', code: vr.code, seat: me.seat, token: seatSelf.token, venue: sv.code });
    broadcastRoom(vr); log(vr, seatSelf.name + ' kıraathane masasına oturdu (' + key + ')');
    venueBroadcast(sv.code, { t: 'vtables', tables: venueTables(sv.code) });
    return;
  }
  if (m.t === 'social') { if (!Social) throw new Error('Arkadaşlık sistemi bu sunucuda kapalı.'); Social.hello(ws, accOf(m), function (e, sm) { if (e) send(ws, { t: 'social', ev: 'denied', msg: e.message }); else send(ws, { t: 'social', ev: 'hello', requests: sm.requests, unread: sm.unread }); }); return; } // v9.93 (K118): sosyal soket (odasız): çevrim içi varlık + anlık bildirimler
  if (m.t === 'ping') { send(ws, { t: 'pong' }); return; } // v9.78: canlı tutma odasız bağlantıda da (kıraathane) — eskiden 25 sn'de bir "Önce bir odaya katılmalısın" uyarısı üretiyordu
  r = me.room; if (!r) throw new Error('önce odaya katıl');
  if (m.t === 'leave') { if (r.rematch && r.g && r.g.finished) { var lr = r.seats[me.seat]; if (lr) { lr.left = true; } r.rematch.votes[me.seat] = false; var pend = r.seats.some(function (x, i) { return x && !x.bot && !x.left && x.ws && x.ws.readyState === 1 && r.rematch.votes[i] === undefined; }); me.room = null; broadcastRematch(r); if (!pend) resolveRematch(r); venueTablesChanged(r); return; } var ls = r.seats[me.seat]; if (!r.g && ls && ls.escrow) refundEscrow(ls, 'masadan ayrıldı'); r.seats[me.seat] = r.g ? r.seats[me.seat] : null; if (r.g) { ls.ws = null; if (r.part) { var pl = partOf(r, me.seat); if (!pl.discAt) pl.discAt = Date.now(); } if (!r.g.finished) { ls.left = true; if (!r.forfeit) r.forfeit = [false, false, false, false]; r.forfeit[me.seat] = true; if (r.settings.entry && ls.acc && !ls.penalty) leavePenalty(r, me.seat); } } me.room = null; if (!r.g && r.host === me.seat) transferHost(r); if (!r.g && !r.seats.some(function (x) { return x && !x.bot; })) { clearTimeout(r.quickTimer); clearTimeout(r.timer); delete rooms[r.code]; venueTablesChanged(r); return; } broadcastRoom(r); if (r.g) scheduleBots(r); return; } // v9.75: kurucu başlamadan ayrılırsa yetki sıradaki insana geçer; insan kalmazsa oda kapanır // çıkan oyuncunun sırasıysa sunucu hemen devralır (önce AFK süresine kadar bekliyordu)
  if (m.t === 'avatar') { // v9.73: görünüm maç içinde değişince koltuğa yansır (Masa Giriş Skini değişmez; ücretli parçalar hesaptaki sahipliğe göre)
    var sa = r.seats[me.seat]; if (!sa || sa.bot) return;
    var av = Accounts.cleanAvatar(m.avatar); if (!av) return;
    var keepIntro = sa.avatar ? sa.avatar.intro : undefined; delete av.intro; if (keepIntro) av.intro = keepIntro;
    if (!sa.acc) { sa.avatar = av; broadcastRoom(r); return; }
    Accounts.auth(sa.acc, function (e, p) { if (e || !p || r.seats[me.seat] !== sa) return; sa.avatar = Accounts.cleanCosmetics(p, av); if (keepIntro) sa.avatar.intro = keepIntro; broadcastRoom(r); log(r, sa.name + ' görünümünü değiştirdi'); });
    return;
  }
  if (m.t === 'start') {
    if (!(r.quick && r.rematchOf) && me.seat !== r.host) throw new Error('Oyunu yalnızca oda sahibi başlatır.'); if (r.g) throw new Error('Oyun zaten başladı.');
    if (r.settings.entry && humanCount(r) < 2) throw new Error('Bahisli masa en az 2 gerçek oyuncuyla başlar.');
    var emptyN = r.seats.filter(function (x) { return !x; }).length;
    if (emptyN && !m.fill) throw new Error('Masada ' + emptyN + ' boş koltuk var. Botlarla başlatmak için onay ver ya da arkadaşlarını bekle.'); // v9.75: bot doldurma yalnız kurucunun açık seçimiyle
    log(r, 'kurucu başlattı (' + humanCount(r) + ' insan' + (emptyN ? ', ' + emptyN + ' koltuğa bot — onaylı' : '') + ')');
    startGame(r); return;
  }
  if (m.t === 'rematch') { rematchVote(r, me.seat, !!m.yes, ws); return; } // v9.76
  if (m.t === 'next') { if (!canStartNext(r, me.seat)) throw new Error('Sonraki eli oda sahibi başlatır.'); nextHand(r); return; }
  if (m.t === 'act') {
    if (r.prepUntil && Object.keys(r.peeks || {}).length) throw new Error('Bakış sürerken hamle yapılamaz.');
    var res = handleAct(r, me.seat, m);
    partOf(r, me.seat).acts++; if (r.actsAll) r.actsAll[me.seat]++;
    if (m.kind === 'open') r.lastOpen = { seat: me.seat, at: Date.now() }; // v9.91: rakipler 5 sn içinde tos atabilir
    broadcastState(r, { event: 'act', actor: me.seat, kind: m.kind, result: res });
    rewardIfOver(r);
    scheduleBots(r);
    return;
  }
  if (m.t === 'peek') { handlePeek(r, me.seat, m); return; }
  if (m.t === 'skinUse') { handleSkinUse(r, me.seat, m); return; } // v9.91 (K116)
  if (m.t === 'slap') { handleSlap(r, me.seat, m); return; }
  if (m.t === 'prepDone') { // bütün insan oyuncular "Oyuna geç" dediyse ve bakış yoksa hazırlık biter, botlar başlar
    if (!r.prepDone) r.prepDone = {}; r.prepDone[me.seat] = true;
    var allDone = r.seats.every(function (s, i) { return !s || s.bot || !s.ws || s.ws.readyState !== 1 || r.prepDone[i]; });
    if (allDone && r.prepUntil && !Object.keys(r.peeks || {}).length) { r.prepUntil = 0; broadcastState(r, { event: 'prepEnd' }); scheduleBots(r); }
    return;
  }
  if (m.t === 'state') { if (r.g) send(ws, { t: 'state', view: viewFor(r, me.seat), event: 'resync' }); else broadcastRoom(r); return; } // uygulama öne gelince taze durum (v9.73)
  if (m.t === 'testRig' && TEST_RIG && r.g) { // yalnız TEST_RIG=1 ortamında: eller, masa, sıra (mutlak koltuk) kurgulanır
    var gq = r.g, S = m.state || {}, mk = function (x) { return { id: x[0], c: x[1], n: x[2], fake: !!x[3] }; };
    if (S.ok) gq.ok = S.ok; if (S.task) gq.task = S.task;
    if (S.hands) Object.keys(S.hands).forEach(function (k) { gq.players[+k].hand = S.hands[k].map(mk); });
    if (S.opened) S.opened.forEach(function (o, i) { gq.players[i].opened = !!o; gq.players[i].openedThisTurn = false; gq.players[i].openedTurnNo = 0; });
    if (S.table) gq.table = S.table.map(function (mm) { return { kind: mm.kind, owner: mm.owner, tiles: mm.tiles.map(function (x) { var t = mk(x); if (x[4] != null) t.placedBy = x[4]; if (x[5] != null) t.rep = x[5]; return t; }) }; });
    if (S.cp != null) gq.cp = S.cp; if (S.phase) gq.phase = S.phase; if (S.turnNo != null) gq.turnNo = S.turnNo;
    gq.handPen = [0, 0, 0, 0]; r.turnUntil = 0; clearTimeout(r.timer); clearTimeout(r.claimTimer); broadcastState(r, { event: 'resync' }); scheduleBots(r); return;
  }
}
// boş odaları temizle
setInterval(function () { var now = Date.now(); Object.keys(rooms).forEach(function (c) { var r = rooms[c]; var alive = r.seats.some(function (s) { return s && !s.bot && s.ws && s.ws.readyState === 1; }); if (alive) { r.emptySince = 0; return; } if (!r.g && !r.quick && !r.venue) { if (!r.emptySince) r.emptySince = now; if (now - r.emptySince > ROOM_GRACE_MS) { clearTimeout(r.timer); delete rooms[c]; log(r, 'kimse dönmedi, oda kapandı'); } return; } if (now - r.created > 30 * 60 * 1000 && !(r.restoredAt && now - r.restoredAt < 5 * 60 * 1000)) { if (r.g && !r.g.finished) logMatchRecord(r, now, false); clearTimeout(r.timer); delete rooms[c]; venueTablesChanged(r); } }); }, 60000); // v9.75: başlamamış arkadaş odası ROOM_GRACE_MS boş kalınca kapanır; başlamış odalar 30 dk kuralı (v9.85: kayıttan geri yüklenen oda oyuncular dönebilsin diye en az 5 dk kalır)

setTimeout(startListening, 15000); // v9.85: hesap/oda deposu 15 sn içinde hazır olmazsa bağlantılar yine de kabul edilir
