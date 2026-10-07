/* Americano Okey — oyun motoru (kurallar). Hem tarayıcıda hem Node'da çalışır. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Okey = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLORS = ['Ateş', 'Yıldız', 'Su', 'Güneş']; // Döngü aileleri (klasik karşılıkları: kırmızı, siyah, mavi, sarı); sunucu ve istemci aynı adları kullanır
  var TASKS = [
    { text: 'Bir adet 3\'lü renkli', req: [['set', 3]] },
    { text: 'Bir adet 3\'lü seri', req: [['run', 3]] },
    { text: 'İki ayrı 3\'lü renkli', req: [['set', 3], ['set', 3]] },
    { text: 'İki ayrı 3\'lü seri', req: [['run', 3], ['run', 3]] },
    { text: 'Bir 3\'lü renkli + bir 3\'lü seri', req: [['set', 3], ['run', 3]] },
    { text: 'Bir adet 4\'lü renkli', req: [['set', 4]] },
    { text: 'Bir adet 4\'lü seri', req: [['run', 4]] },
    { text: 'İki ayrı 4\'lü renkli', req: [['set', 4], ['set', 4]] },
    { text: 'İki ayrı 4\'lü seri', req: [['run', 4], ['run', 4]] },
    { text: 'Bir 4\'lü seri + bir 4\'lü renkli', req: [['run', 4], ['set', 4]] },
    { text: 'Bir adet 5\'li seri', req: [['run', 5]] },
    { text: 'Kafa: yere açmadan elden bitiş', req: null }
  ];

  // ---------- rastgele ----------
  function makeRng(seed) {
    var s = seed >>> 0 || 123456789;
    function rng() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; rng.s = s; return s / 4294967296; }
    rng.s = s;
    return rng;
  }
  function serialize(g) { var o = {}; for (var k in g) if (k !== 'rng') o[k] = g[k]; o.rngS = g.rng.s; return JSON.stringify(o); }
  function deserialize(str) {
    var g = JSON.parse(str); g.rng = makeRng(g.rngS); delete g.rngS;
    if (g.phase === 'claim') g.claimTile = topDiscard(g);
    return g;
  }

  // ---------- taşlar ----------
  function buildSet() {
    var tiles = [], id = 0;
    for (var copy = 0; copy < 2; copy++)
      for (var c = 0; c < 4; c++)
        for (var n = 1; n <= 13; n++) tiles.push({ id: id++, c: c, n: n, fake: false });
    tiles.push({ id: id++, c: -1, n: 0, fake: true });
    tiles.push({ id: id++, c: -1, n: 0, fake: true });
    return tiles;
  }

  // okeyInfo: { fakeIsOkey, c, n }  (c,n = gerçek okey taşının değeri)
  function isJoker(t, ok) { return ok.fakeIsOkey ? t.fake : (!t.fake && t.c === ok.c && t.n === ok.n); }
  function effective(t, ok) { // joker olmayan taşın temsil ettiği değer
    if (t.fake && !ok.fakeIsOkey) return { c: ok.c, n: ok.n };
    return { c: t.c, n: t.n };
  }
  function tileValue(t, ok) {
    if (isJoker(t, ok)) return 50;
    if (t.fake) return 25;
    return t.n;
  }

  // ---------- grup kontrolü ----------
  // dönüş: null | 'set' | 'run' | 'any'
  function meldKind(tiles, ok) {
    var len = tiles.length;
    if (len < 3) return null;
    var E = [], j = 0;
    for (var i = 0; i < len; i++) {
      if (isJoker(tiles[i], ok)) j++; else E.push(effective(tiles[i], ok));
    }
    if (E.length === 0) return len <= 4 ? 'set' : null;
    var setOk = len <= 4, runOk = len <= 13;
    var seenC = {}, seenN = {}, mn = 99, mx = 0;
    for (i = 0; i < E.length; i++) {
      var e = E[i];
      if (e.n !== E[0].n || seenC[e.c]) setOk = false;
      seenC[e.c] = true;
      if (e.c !== E[0].c || seenN[e.n]) runOk = false;
      seenN[e.n] = true;
      if (e.n < mn) mn = e.n;
      if (e.n > mx) mx = e.n;
    }
    if (runOk) {
      var lo = Math.max(1, mx - len + 1), hi = Math.min(mn, 14 - len);
      if (lo > hi) runOk = false;
    }
    if (setOk && runOk) return 'any';
    if (setOk) return 'set';
    if (runOk) return 'run';
    return null;
  }

  // seriyi gösterim için sırala (jokerleri boşluklara/uçlara yerleştir)
  function layoutRun(tiles, ok) {
    var E = [], J = [];
    tiles.forEach(function (t) { if (isJoker(t, ok)) J.push(t); else E.push(t); });
    E.sort(function (a, b) { return effective(a, ok).n - effective(b, ok).n; });
    if (E.length === 0) return tiles.slice();
    var len = tiles.length;
    var mn = effective(E[0], ok).n, mx = effective(E[E.length - 1], ok).n;
    var start = Math.max(1, Math.min(mn, Math.min(mx - len + 1 + (len - (mx - mn + 1)), 14 - len)));
    // jokerleri önce iç boşluklara koy, kalanı sona, yer yoksa başa
    var out = [], ji = 0, pos = mn;
    var inner = [];
    for (var i = 0; i < E.length; i++) {
      var n = effective(E[i], ok).n;
      while (pos < n && ji < J.length) { inner.push(J[ji++]); pos++; }
      inner.push(E[i]); pos = n + 1;
    }
    out = inner;
    var rest = J.slice(ji);
    var room = 13 - mx;
    while (rest.length && room > 0) { out.push(rest.pop()); room--; }
    while (rest.length) out.unshift(rest.pop());
    return out;
  }
  function layoutMeld(meld, ok) {
    if (meld.kind === 'run') return layoutRun(meld.tiles, ok);
    var E = [], J = [];
    meld.tiles.forEach(function (t) { if (isJoker(t, ok)) J.push(t); else E.push(t); });
    E.sort(function (a, b) { return effective(a, ok).c - effective(b, ok).c; });
    return E.concat(J);
  }

  function groupsSatisfyTask(groups, task, ok) {
    if (!task.req) return false;
    if (groups.length !== task.req.length) return false;
    var kinds = groups.map(function (g) { return meldKind(g, ok); });
    if (kinds.some(function (k) { return !k; })) return false;
    function fits(gi, req) { // ilk açılışta per TAM görev uzunluğunda olmalı; fazlalık elde kalır
      return groups[gi].length === req[1] && (kinds[gi] === 'any' || kinds[gi] === req[0]);
    }
    function perm(used, ri) {
      if (ri === task.req.length) return true;
      for (var gi = 0; gi < groups.length; gi++) {
        if (used[gi] || !fits(gi, task.req[ri])) continue;
        used[gi] = true;
        if (perm(used, ri + 1)) return true;
        used[gi] = false;
      }
      return false;
    }
    return perm([], 0);
  }

  // ---------- grup üretimi / kaplama (bot ve kafa kontrolü için) ----------
  function allMelds(hand, ok, maxLen) {
    maxLen = maxLen || 5;
    var res = [], seen = {};
    var byKey = {}, J = [];
    hand.forEach(function (t, i) {
      if (isJoker(t, ok)) { J.push(i); return; }
      var e = effective(t, ok), k = e.c * 20 + e.n;
      (byKey[k] = byKey[k] || []).push(i);
    });
    function push(idx, kind) {
      idx = idx.slice().sort(function (a, b) { return a - b; });
      var key = idx.join(',');
      if (seen[key]) return;
      seen[key] = true;
      var tiles = idx.map(function (i) { return hand[i]; });
      var k = meldKind(tiles, ok);
      if (k) res.push({ idx: idx, kind: k, tiles: tiles });
    }
    // slots: dizi; her slot ya kopya listesi (indeksler) ya da null (yok). jokerler boş slotları doldurur.
    function expand(slots, kind) {
      var chosen = [], usedJ = [];
      function rec(si) {
        if (si === slots.length) {
          if (chosen.length >= 3 && usedJ.length < chosen.length) push(chosen, kind);
          return;
        }
        var copies = slots[si];
        if (copies) copies.forEach(function (ci) { chosen.push(ci); rec(si + 1); chosen.pop(); });
        for (var ji = 0; ji < J.length; ji++) {
          if (usedJ.indexOf(ji) >= 0 || (usedJ.length && ji < usedJ[usedJ.length - 1])) continue;
          usedJ.push(ji); chosen.push(J[ji]); rec(si + 1); chosen.pop(); usedJ.pop();
        }
      }
      rec(0);
    }
    // renkli gruplar
    for (var n = 1; n <= 13; n++) {
      var cols = [];
      for (var c = 0; c < 4; c++) if (byKey[c * 20 + n]) cols.push(c);
      if (cols.length + J.length < 3) continue;
      // renk alt kümeleri + joker sayısı
      for (var mask = 1; mask < 16; mask++) {
        var subset = [];
        for (c = 0; c < 4; c++) if (mask & (1 << c)) { if (cols.indexOf(c) < 0) { subset = null; break; } subset.push(c); }
        if (!subset) continue;
        for (var jk = 0; jk <= J.length && subset.length + jk <= 4; jk++) {
          if (subset.length + jk < 3) continue;
          var slots = subset.map(function (cc) { return byKey[cc * 20 + n]; });
          for (var z = 0; z < jk; z++) slots.push(null);
          expand(slots, 'set');
        }
      }
    }
    // seriler
    for (c = 0; c < 4; c++) {
      for (var L = 3; L <= maxLen; L++) for (var s = 1; s + L - 1 <= 13; s++) {
        var sl = [], missing = 0;
        for (var p = 0; p < L; p++) { var lst = byKey[c * 20 + s + p]; if (!lst) missing++; sl.push(lst || null); }
        if (missing > J.length || missing === L) continue;
        expand(sl, 'run');
      }
    }
    return res;
  }

  // hand'in tamamı (skip tane taş hariç) gruplara bölünebilir mi?
  function partition(hand, ok, skips) {
    var n = hand.length;
    if (n > 24) return null;
    var melds = allMelds(hand, ok, 5);
    var byLow = [];
    for (var i = 0; i < n; i++) byLow.push([]);
    melds.forEach(function (m) { byLow[m.idx[0]].push(m); });
    var memo = {};
    function rec(mask, sk) {
      if (mask === 0) return [];
      var key = mask + ':' + sk;
      if (key in memo) return memo[key];
      var low = 0; while (!(mask & (1 << low))) low++;
      var r = null;
      var list = byLow[low];
      for (var i = 0; i < list.length && !r; i++) {
        var m = list[i], mm = 0, okk = true;
        for (var j = 0; j < m.idx.length; j++) { var b = 1 << m.idx[j]; if (!(mask & b)) { okk = false; break; } mm |= b; }
        if (!okk) continue;
        var sub = rec(mask & ~mm, sk);
        if (sub) r = [m].concat(sub);
      }
      if (!r && sk > 0) { var sub2 = rec(mask & ~(1 << low), sk - 1); if (sub2) r = sub2; }
      memo[key] = r;
      return r;
    }
    return rec((1 << n) - 1, skips);
  }

  // en çok taşı kaplayan grup seçimi (maks kaplama)
  function maxCover(hand, ok) {
    var n = hand.length;
    if (n === 0) return { count: 0, melds: [] };
    if (n > 24) return { count: 0, melds: [] };
    var melds = allMelds(hand, ok, 5);
    var byLow = [];
    for (var i = 0; i < n; i++) byLow.push([]);
    melds.forEach(function (m) { byLow[m.idx[0]].push(m); });
    var memo = {};
    function rec(mask) {
      if (mask === 0) return { count: 0, melds: [] };
      if (memo[mask]) return memo[mask];
      var low = 0; while (!(mask & (1 << low))) low++;
      var best = rec(mask & ~(1 << low));
      var list = byLow[low];
      for (var i = 0; i < list.length; i++) {
        var m = list[i], mm = 0, okk = true;
        for (var j = 0; j < m.idx.length; j++) { var b = 1 << m.idx[j]; if (!(mask & b)) { okk = false; break; } mm |= b; }
        if (!okk) continue;
        var sub = rec(mask & ~mm);
        if (sub.count + m.idx.length > best.count) best = { count: sub.count + m.idx.length, melds: [m].concat(sub.melds) };
      }
      memo[mask] = best;
      return best;
    }
    return rec((1 << n) - 1);
  }

  // Tek türde (set/run) en iyi örtü: en çok taş, eşitlikte en az okey. Diz menüsü için. (n ≤ 24; daha büyük elde açgözlü)
  function bestCover(hand, ok, kind, maxLen) {
    var n = hand.length; if (!n) return { melds: [] };
    var melds = allMelds(hand, ok, maxLen || 13).filter(function (m) { return m.kind === kind || m.kind === 'any'; });
    melds.forEach(function (m) { m.jokers = m.tiles.filter(function (t) { return isJoker(t, ok); }).length; });
    if (n > 24) { // açgözlü: uzun ve okeysiz önce
      melds.sort(function (a, b) { return (b.idx.length - a.idx.length) || (a.jokers - b.jokers); });
      var usedG = {}, outG = [];
      melds.forEach(function (m) { if (m.idx.some(function (i) { return usedG[i]; })) return; m.idx.forEach(function (i) { usedG[i] = true; }); outG.push(m); });
      return { melds: outG };
    }
    var byLow = []; for (var i = 0; i < n; i++) byLow.push([]);
    melds.forEach(function (m) { byLow[m.idx[0]].push(m); });
    var memo = {};
    function rec(mask) {
      if (mask === 0) return { score: 0, melds: [] };
      if (memo[mask]) return memo[mask];
      var low = 0; while (!(mask & (1 << low))) low++;
      var best = rec(mask & ~(1 << low));
      var list = byLow[low];
      for (var i = 0; i < list.length; i++) {
        var m = list[i], mm = 0, okk = true;
        for (var j = 0; j < m.idx.length; j++) { var b = 1 << m.idx[j]; if (!(mask & b)) { okk = false; break; } mm |= b; }
        if (!okk) continue;
        var sub = rec(mask & ~mm), sc = sub.score + m.idx.length * 1000 - m.jokers * 10;
        if (sc > best.score) best = { score: sc, melds: [m].concat(sub.melds) };
      }
      memo[mask] = best; return best;
    }
    return rec((1 << n) - 1);
  }

  // görevi karşılayan grup kombinasyonu bul (eldeki taşlardan)
  function findTaskGroups(hand, ok, task) {
    if (!task.req) return null;
    var melds = allMelds(hand, ok, task.req.length === 1 ? 6 : 5);
    function fits(m, req) { return m.idx.length === req[1] && (m.kind === 'any' || m.kind === req[0]); }
    var best = null;
    if (task.req.length === 1) {
      melds.forEach(function (m) {
        if (fits(m, task.req[0]) && m.idx.length < hand.length && !best) best = [m];
      });
      return best;
    }
    var A = melds.filter(function (m) { return fits(m, task.req[0]); });
    var B = melds.filter(function (m) { return fits(m, task.req[1]); });
    for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) {
      var a = A[i], b = B[j];
      if (a === b) continue;
      var disjoint = true;
      for (var k = 0; k < a.idx.length && disjoint; k++) if (b.idx.indexOf(a.idx[k]) >= 0) disjoint = false;
      if (!disjoint) continue;
      var tot = a.idx.length + b.idx.length;
      if (tot >= hand.length) continue;
      if (!best) best = [a, b];
    }
    return best;
  }

  // ---------- oyun durumu ----------
  function newGame(opts) {
    opts = opts || {};
    var g = {
      rng: makeRng(opts.seed || (Date.now() & 0x7fffffff)),
      names: opts.names || ['Sen', 'Ali', 'Ayşe', 'Mehmet'],
      hand: 0, // 1..12
      totals: [0, 0, 0, 0],
      handsWon: [0, 0, 0, 0],
      penalties: [0, 0, 0, 0], // okey kaptırma cezaları (toplam)
      rules: { jokerCapturePenalty: opts.jokerCapturePenalty != null ? opts.jokerCapturePenalty : 10, playableDiscardPenalty: opts.playableDiscardPenalty != null ? opts.playableDiscardPenalty : 10, jokerLeftPenalty: opts.jokerLeftPenalty != null ? opts.jokerLeftPenalty : 10 },
      guaranteedFakeIndicatorHand: 0, // 12 El modunda startHand'de rng ile seçilir; kayda dahil
      totalHands: 12, taskOrder: null, currentHandIndex: -1, // oyun modu: 1 / 6 / 12 el
      history: [], // her el: {hand, scores:[..], winner, finishType}
      dealer: 3,
      log: [],
      finished: false
    };
    for (var w = 0; w < 10; w++) g.rng(); // xorshift ısınma: küçük tohumlarda ilk değerler yığılıyor
    var th = opts.totalHands === 1 || opts.totalHands === 6 ? opts.totalHands : 12;
    g.totalHands = th;
    g.taskOrder = makeTaskOrder(th, g.rng);
    return g;
  }

  // Görev sırası: 12 El klasik sıra; 1 / 6 El için ortak listenin KOPYASI Fisher–Yates ile karıştırılıp ilk n görev alınır (Kafa dahil, tekrar yok)
  function makeTaskOrder(totalHands, rng) {
    var ids = TASKS.map(function (_, i) { return i; });
    if (totalHands >= 12) return ids;
    shuffle(ids, rng);
    return ids.slice(0, totalHands);
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  function startHand(g) {
    g.hand++;
    if (!g.totalHands) g.totalHands = 12; // eski kayıt
    if (!g.taskOrder || !g.taskOrder.length) g.taskOrder = makeTaskOrder(12, g.rng);
    g.currentHandIndex = g.hand - 1;
    if (g.totalHands >= 12 && !g.guaranteedFakeIndicatorHand) g.guaranteedFakeIndicatorHand = g.hand + Math.floor(g.rng() * (13 - g.hand)); // hand..12 arası; sadece 12 El
    var deck = shuffle(buildSet(), g.rng);
    var ind;
    if (g.totalHands >= 12 && g.hand === g.guaranteedFakeIndicatorHand) { // garanti sahte okey göstergeli el: sahte taşı desteden ayır
      var fi = -1; for (var di = deck.length - 1; di >= 0; di--) if (deck[di].fake) { fi = di; break; }
      ind = deck.splice(fi, 1)[0];
    } else ind = deck.pop();
    var ok;
    if (ind.fake) ok = { fakeIsOkey: true, c: -1, n: 0 };
    else ok = { fakeIsOkey: false, c: ind.c, n: ind.n === 13 ? 1 : ind.n + 1 };
    g.indicator = ind;
    g.ok = ok;
    g.task = TASKS[g.taskOrder[g.currentHandIndex]]; // aktif görev el numarasından değil taskOrder'dan
    g.deck = deck;
    g.players = [];
    for (var p = 0; p < 4; p++) g.players.push({ hand: deck.splice(0, 14), opened: false, openedThisTurn: false, discards: [], thrown: {} }); // thrown: bu elde attığı taş kimlikleri (bot al-at döngüsünü keser)
    g.handPen = [0, 0, 0, 0]; // bu eldeki okey kaptırma cezaları
    g.handPenDisc = [0, 0, 0, 0]; // bu eldeki işlek taş atma cezaları
    if (!g.penalties) g.penalties = [0, 0, 0, 0];
    if (!g.rules) g.rules = { jokerCapturePenalty: 10 };
    if (g.rules.playableDiscardPenalty == null) g.rules.playableDiscardPenalty = 10;
    if (g.rules.jokerLeftPenalty == null) g.rules.jokerLeftPenalty = 10;
    g.table = []; // {tiles, kind, owner}
    g.dealer = (g.dealer + 1) % 4;
    g.cp = (g.dealer + 1) % 4;
    g.phase = 'pickup';
    g.claimQueue = [];
    g.claimTile = null;
    g.lastDiscarder = null;
    g.handOver = null;
    g.log = [];
    g.turnNo = 0;
  }

  function log(g, msg) { g.log.push(msg); if (g.log.length > 200) g.log.shift(); }

  function topDiscard(g) {
    if (g.lastDiscarder === null) return null;
    var d = g.players[g.lastDiscarder].discards;
    return d.length ? d[d.length - 1] : null;
  }

  function removeTile(hand, tile) {
    var i = hand.indexOf(tile);
    if (i < 0) throw new Error('taş elde yok');
    hand.splice(i, 1);
  }

  function handDetail(g, winner, mult, winScore, reason) {
    return g.players.map(function (pl, i) {
      var tiles = pl.hand.map(function (t) { return { c: t.c, n: t.n, fake: t.fake, id: t.id }; });
      var base = tiles.reduce(function (s, t) { return s + tileValue(t, g.ok); }, 0);
      var hp = (g.handPen && g.handPen[i]) || 0, hd = (g.handPenDisc && g.handPenDisc[i]) || 0;
      // elde kalan okey cezası: o el gerçekten joker olan her taş için +N (nasıl geldiği fark etmez; okey başına tek ceza)
      var jl = i === winner ? 0 : tiles.filter(function (t) { return isJoker(t, g.ok); }).length * ((g.rules && g.rules.jokerLeftPenalty != null) ? g.rules.jokerLeftPenalty : 10);
      var pen = hp + hd + jl;
      var hpr = []; if (hp) hpr.push('Okey kaptırma cezası: +' + hp); if (hd) hpr.push('İşlek taş atma cezası: +' + hd); if (jl) hpr.push('Elde okey bırakma cezası: +' + jl);
      if (i === winner) return { tiles: [], count: 0, base: 0, mult: 1, bonus: winScore, penalty: pen, jokerPen: hp, discardPen: hd, jokerLeftPen: 0, score: winScore + pen, reasons: ['Eli bitirdi: ' + winScore].concat(hpr) };
      var reasons = ['Kalan ' + tiles.length + ' taş: ' + base];
      if (mult > 1) reasons.push(reason + ' ×' + mult);
      return { tiles: tiles, count: tiles.length, base: base, mult: mult, bonus: 0, penalty: pen, jokerPen: hp, discardPen: hd, jokerLeftPen: jl, score: base * mult + pen, reasons: reasons.concat(hpr) };
    });
  }
  function endHandNoWinner(g) {
    var detail = handDetail(g, null, 1, 0, '');
    finishHand(g, detail.map(function (d) { return d.score; }), null, 'Taş bitti, kimse bitiremedi', detail);
  }

  function finishHand(g, scores, winner, finishType, detail) {
    for (var i = 0; i < 4; i++) g.totals[i] += scores[i];
    if (winner !== null) g.handsWon[winner]++;
    var totals = g.totals.slice(), won = g.handsWon.slice();
    var rank = [0, 1, 2, 3].sort(function (a, b) { return (totals[a] - totals[b]) || (won[b] - won[a]); });
    var ranks = []; rank.forEach(function (p, i) { ranks[p] = i + 1; });
    g.history.push({ hand: g.hand, scores: scores, winner: winner, finishType: finishType, detail: detail, totals: totals, ranks: ranks });
    g.handOver = { scores: scores, winner: winner, finishType: finishType, detail: detail, totals: totals, ranks: ranks };
    g.phase = 'handover';
    if (g.hand >= (g.totalHands || 12)) g.finished = true;
    log(g, finishType);
  }

  // --- aksiyonlar ---
  function canTakeDiscard(g) {
    return g.phase === 'pickup' && topDiscard(g) !== null;
  }

  function actDraw(g) {
    if (g.phase !== 'pickup') throw new Error('sıra çekme değil');
    var p = g.players[g.cp];
    if (g.deck.length === 0) { endHandNoWinner(g); return; }
    p.hand.push(g.deck.pop());
    log(g, g.names[g.cp] + ' ortadan çekti');
    // sırası olmayanlar atılan taşı isteyebilir
    g.claimTile = topDiscard(g);
    g.claimQueue = [];
    if (g.claimTile && g.deck.length > 0) {
      g.claimQueue = [(g.lastDiscarder + 2) % 4, (g.lastDiscarder + 3) % 4];
    }
    g.phase = g.claimQueue.length ? 'claim' : 'play';
  }

  function actTake(g) {
    if (!canTakeDiscard(g)) throw new Error('alınacak taş yok');
    var t = g.players[g.lastDiscarder].discards.pop();
    g.players[g.cp].hand.push(t);
    log(g, g.names[g.cp] + ' yandan ' + tileName(t) + ' aldı');
    g.phase = 'play';
  }

  function claimant(g) { return g.phase === 'claim' ? g.claimQueue[0] : null; }

  function actClaim(g, player, yes) {
    if (g.phase !== 'claim' || g.claimQueue[0] !== player) throw new Error('talep sırası değil');
    if (yes) {
      var t = g.players[g.lastDiscarder].discards.pop();
      var p = g.players[player];
      p.hand.push(t);
      p.hand.push(g.deck.pop());
      log(g, g.names[player] + ' sıra dışı ' + tileName(t) + ' aldı (+1 ortadan)');
      g.claimQueue = [];
    } else {
      g.claimQueue.shift();
    }
    if (g.claimQueue.length === 0) g.phase = 'play';
  }

  function actOpen(g, groups) { // groups: taş dizileri
    if (g.phase !== 'play') throw new Error('oynama sırası değil');
    var p = g.players[g.cp];
    if (p.opened) throw new Error('zaten açıldı');
    if (!g.task.req) throw new Error('kafa elinde açılmaz');
    if (g.turnNo < 4) throw new Error('İlk turda kimse açılamaz; herkes bir kez oynadıktan sonra açılabilirsin.');
    if (!groupsSatisfyTask(groups, g.task, g.ok)) throw new Error('Görev tam karşılanmıyor: ' + taskText(g.task));
    var seen = {}, used = 0;
    groups.forEach(function (gr) { gr.forEach(function (t) { if (seen[t.id]) throw new Error('aynı taş iki grupta kullanılamaz'); seen[t.id] = true; if (p.hand.indexOf(t) < 0) throw new Error('taş elinde değil'); }); used += gr.length; });
    if (used >= p.hand.length) throw new Error('atacak taş kalmalı');
    groups.forEach(function (gr) {
      gr.forEach(function (t) { removeTile(p.hand, t); });
      var k = meldKind(gr, g.ok);
      markPlaced(g, gr);
      g.table.push({ tiles: gr.slice(), kind: k === 'any' ? (gr.length > 4 ? 'run' : 'set') : k, owner: g.cp });
    });
    p.opened = true; p.openedThisTurn = true; p.openedTurnNo = g.turnNo; // açılış sırası kaydı: işleme izni sonraki kendi sırasında
    log(g, g.names[g.cp] + ' yere açıldı');
  }

  function lockedAfterOpen(g, p) { return p.openedThisTurn || p.openedTurnNo === g.turnNo; }
  function taskText(task) { return task.req.map(function (r) { return r[1] + (r[0] === 'set' ? "'lü renkli" : (r[1] === 5 ? "'li seri" : "'lü seri")); }).join(' + '); }
  function actLay(g, tiles) {
    if (g.phase !== 'play') throw new Error('oynama sırası değil');
    var p = g.players[g.cp];
    if (!p.opened || lockedAfterOpen(g, p)) throw new Error('Açıldığın sırada ek per indirilmez; bir sonraki sıranda indirebilirsin.');
    var k = meldKind(tiles, g.ok);
    if (!k) throw new Error('geçersiz grup');
    if (tiles.length >= p.hand.length) throw new Error('atacak taş kalmalı');
    checkInHand(p, tiles); // önce doğrula, sonra değiştir: yarım kalmış hamle olmasın
    tiles.forEach(function (t) { removeTile(p.hand, t); });
    markPlaced(g, tiles);
    g.table.push({ tiles: tiles.slice(), kind: k === 'any' ? (tiles.length > 4 ? 'run' : 'set') : k, owner: g.cp });
    log(g, g.names[g.cp] + ' yeni grup koydu');
  }
  function checkInHand(p, tiles) { // hepsi elde ve her taş bir kez
    var seen = {};
    tiles.forEach(function (t) { if (!t || seen[t.id]) throw new Error('aynı taş iki kez kullanılamaz'); seen[t.id] = true; if (p.hand.indexOf(t) < 0) throw new Error('taş elinde değil'); });
  }

  function canAddTo(g, meldIdx, tiles) {
    var m = g.table[meldIdx];
    var combined = m.tiles.concat(tiles);
    var k = meldKind(combined, g.ok);
    if (!k) return false;
    if (m.kind === 'set' && k === 'run') return false;
    if (m.kind === 'run' && k === 'set') return false;
    return true;
  }

  function actAdd(g, meldIdx, tiles) {
    if (g.phase !== 'play') throw new Error('oynama sırası değil');
    var p = g.players[g.cp];
    if (!p.opened || lockedAfterOpen(g, p)) throw new Error(p.opened ? 'Açıldığın sırada işleme yapılmaz; bir sonraki sıranda işleyebilirsin.' : 'önce açılmalı');
    if (!g.table[meldIdx]) throw new Error('per bulunamadı');
    if (!canAddTo(g, meldIdx, tiles)) throw new Error('bu gruba uymuyor');
    if (tiles.length >= p.hand.length) throw new Error('atacak taş kalmalı');
    checkInHand(p, tiles);
    tiles.forEach(function (t) { removeTile(p.hand, t); });
    markPlaced(g, tiles);
    var m = g.table[meldIdx];
    m.tiles = m.tiles.concat(tiles);
    log(g, g.names[g.cp] + ' masaya taş işledi');
  }

  // ---------- masadaki okeyi gerçek taşla alma ----------
  function markPlaced(g, tiles) { tiles.forEach(function (t) { if (isJoker(t, g.ok)) t.placedBy = g.cp; }); }
  // perdeki bir okeyin temsil ettiği değer(ler): {n, colors:[...]} ; run'da tek renk, set'te eksik renkler
  function jokerMeaning(g, meldIdx, joker) {
    var m = g.table[meldIdx], ok = g.ok;
    if (m.kind === 'run') {
      var lay = layoutRun(m.tiles, ok), ji = lay.indexOf(joker), ri = -1;
      for (var i = 0; i < lay.length; i++) if (!isJoker(lay[i], ok)) { ri = i; break; }
      if (ji < 0 || ri < 0) return null;
      var e = effective(lay[ri], ok), n = e.n + (ji - ri);
      if (n < 1 || n > 13) return null;
      return { n: n, colors: [e.c] };
    }
    // Renkli grup: okey ancak grup ÜÇ farklı renk + okey iken, eksik dördüncü renkle alınabilir.
    // İki renk + okey'li üçlüye üçüncü renk gelince grup genişler (okey masada kalır), okey verilmez.
    var real = m.tiles.filter(function (t) { return !isJoker(t, ok); });
    if (real.length < 3) return null;
    var n0 = effective(real[0], ok).n, have = {};
    real.forEach(function (t) { have[effective(t, ok).c] = true; });
    var missing = [0, 1, 2, 3].filter(function (c) { return !have[c]; });
    if (missing.length !== 1) return null;
    return { n: n0, colors: missing };
  }
  function findSwapJoker(g, meldIdx, tile) {
    var m = g.table[meldIdx], ok = g.ok;
    if (!m || isJoker(tile, ok)) return null;
    var e = effective(tile, ok);
    for (var i = 0; i < m.tiles.length; i++) {
      var j = m.tiles[i]; if (!isJoker(j, ok)) continue;
      var mean = jokerMeaning(g, meldIdx, j);
      if (mean && mean.n === e.n && mean.colors.indexOf(e.c) >= 0) return j;
    }
    return null;
  }
  function canSwapJoker(g, meldIdx, tile) {
    if (g.phase !== 'play') return false;
    var p = g.players[g.cp];
    if (!p.opened || lockedAfterOpen(g, p)) return false;
    if (p.hand.indexOf(tile) < 0) return false;
    return !!findSwapJoker(g, meldIdx, tile);
  }
  // gerçek taşı koy, okeyi al; okeyi masaya koyana ceza (tek işlem)
  function actSwapJoker(g, meldIdx, tile) {
    if (g.phase !== 'play') throw new Error('oynama sırası değil');
    var p = g.players[g.cp];
    if (!p.opened || lockedAfterOpen(g, p)) throw new Error('Okey almak için açılmış olmalısın; açıldığın sırada yapılamaz.');
    if (p.hand.indexOf(tile) < 0) throw new Error('taş elinde değil');
    var joker = findSwapJoker(g, meldIdx, tile);
    if (!joker) throw new Error('Bu taş, perdeki okeyin yerine geçmiyor.');
    var m = g.table[meldIdx], idx = m.tiles.indexOf(joker);
    // doğrulama: değişim sonrası per geçerli kalmalı
    var trial = m.tiles.slice(); trial[idx] = tile;
    var k = meldKind(trial, g.ok);
    if (!k || (m.kind === 'run' && k === 'set') || (m.kind === 'set' && k === 'run')) throw new Error('Değişim perin geçerliliğini bozuyor.');
    removeTile(p.hand, tile);
    m.tiles[idx] = tile; markPlaced(g, [tile]);
    var victim = joker.placedBy != null ? joker.placedBy : m.owner; // okeyi masaya EN SON koyan sorumlu
    delete joker.placedBy;
    p.hand.push(joker);
    var self = victim === g.cp, pen = self ? 0 : (g.rules.jokerCapturePenalty || 0), msg;
    if (self) msg = g.names[g.cp] + ' kendi okeyini geri aldı. Ceza yok.';
    else { g.penalties[victim] += pen; g.handPen[victim] += pen; msg = g.names[g.cp] + ', ' + g.names[victim] + "'in okeyini aldı. " + g.names[victim] + ' +' + pen + ' ceza puanı.'; }
    log(g, msg);
    return { victim: victim, penalty: pen, self: self, message: msg };
  }

  // atılacak taş masaya işlenebiliyor mu? (pere ekleme veya okeyin yerine koyma). Açılmış-açılmamış herkes için geçerli (7 Ekim 2026 kararı);
  // tek muafiyet: açıldığı turda işleme hakkı olmayan oyuncu. Bitiş taşı için ceza actDiscard'da ayrıca muaf tutulur.
  function discardIsPlayable(g, p, tile) {
    if (p.opened && lockedAfterOpen(g, p)) return false;
    for (var i = 0; i < g.table.length; i++) {
      if (canAddTo(g, i, [tile])) return true;
      if (findSwapJoker(g, i, tile)) return true;
    }
    return false;
  }
  function actDiscard(g, tile) {
    if (g.phase !== 'play') throw new Error('oynama sırası değil');
    var p = g.players[g.cp];
    var isKafa = !g.task.req;
    var finishing = false;
    if (isKafa) {
      var rest = p.hand.filter(function (t) { return t !== tile; });
      if (partition(rest, g.ok, 0)) finishing = true;
    } else if (p.hand.length === 1) {
      if (!p.opened) throw new Error('açılmadan bitilmez');
      finishing = true;
    }
    var discPen = 0;
    if (!finishing && discardIsPlayable(g, p, tile)) { // işlek taş atma cezası (bir atış için tek ceza)
      discPen = g.rules.playableDiscardPenalty != null ? g.rules.playableDiscardPenalty : 10;
      if (!g.handPenDisc) g.handPenDisc = [0, 0, 0, 0];
      g.handPenDisc[g.cp] += discPen;
    }
    removeTile(p.hand, tile);
    p.discards.push(tile);
    if (!p.thrown) p.thrown = {};
    p.thrown[tile.id] = 1;
    p.openedThisTurn = false;
    g.lastDiscarder = g.cp;
    g.turnNo++;
    log(g, g.names[g.cp] + ' ' + tileName(tile) + ' attı');
    if (discPen) log(g, g.names[g.cp] + ' masaya işlenebilen bir taş attı: +' + discPen + ' ceza puanı');
    if (finishing) {
      var mult = 1, winScore = -10, type = 'Normal bitiş';
      if (isJoker(tile, g.ok)) {
        if (g.ok.fakeIsOkey) { mult = 4; winScore = -40; type = 'Sahte okey ile bitiş (×4)'; }
        else { mult = 2; winScore = -20; type = 'Okeyle bitiş (×2)'; }
      }
      if (isKafa) p.hand = []; // kafa: kalan taşlar gruplar halinde bitti
      var detail = handDetail(g, g.cp, mult, winScore, type);
      finishHand(g, detail.map(function (d) { return d.score; }), g.cp, g.names[g.cp] + ' bitirdi — ' + type, detail);
      return { playablePenalty: 0 };
    }
    g.cp = (g.cp + 1) % 4;
    g.phase = 'pickup';
    if (g.deck.length === 0 && !topDiscard(g)) endHandNoWinner(g);
    return { playablePenalty: discPen, message: discPen ? 'Masaya işlenebilen bir taş attın: +' + discPen + ' ceza puanı' : '' };
  }

  function roundNo(g) { return Math.floor(g.turnNo / 4) + 1; }

  function tileName(t) {
    if (t.fake) return 'Sahte Okey';
    return COLORS[t.c] + ' ' + t.n;
  }

  // ---------- bot ----------
  function neighborScore(hand, ok) {
    var s = 0;
    for (var i = 0; i < hand.length; i++) {
      if (isJoker(hand[i], ok)) { s += 3; continue; }
      var a = effective(hand[i], ok);
      for (var j = i + 1; j < hand.length; j++) {
        if (isJoker(hand[j], ok)) continue;
        var b = effective(hand[j], ok);
        if (a.n === b.n && a.c !== b.c) s += 1;
        else if (a.c === b.c && Math.abs(a.n - b.n) === 1) s += 1;
        else if (a.c === b.c && Math.abs(a.n - b.n) === 2) s += 0.5;
      }
    }
    return s;
  }
  function handScore(hand, ok, task) {
    var cov = maxCover(hand, ok).count;
    var s = 3 * cov + neighborScore(hand, ok);
    if (task && task.req && findTaskGroups(hand, ok, task)) s += 10;
    return s;
  }

  function botChooseDiscard(g, p) {
    var hand = p.hand, best = null, bestS = -1e9;
    var ok = g.ok;
    for (var i = 0; i < hand.length; i++) {
      var t = hand[i];
      var rest = hand.slice(0, i).concat(hand.slice(i + 1));
      var s = handScore(rest, ok, p.opened ? null : g.task);
      s += tileValue(t, ok) * 0.05; // yüksek taşı atmayı tercih
      if (isJoker(t, ok)) s -= 100;
      if (discardIsPlayable(g, p, t)) s -= (p.opened ? 40 : 15); // işlek taş atma cezasından kaçın (açılmamışken ceza 10 puan: el planını bozmaktan daha ucuz olabilir)
      if (s > bestS) { bestS = s; best = t; }
    }
    return best;
  }

  function botWantsTile(g, player, tile, outOfTurn) {
    var p = g.players[player];
    var ok = g.ok;
    if (!outOfTurn && p.thrown && p.thrown[tile.id]) return false; // bu elde kendi attığı taşı yandan geri almaz (al-at döngüsünü keser; alınan taş yığından çıktığı için kalıcı kayıt)
    var before = handScore(p.hand, ok, p.opened ? null : g.task);
    var after = handScore(p.hand.concat([tile]), ok, p.opened ? null : g.task);
    if (p.opened && !outOfTurn) {
      for (var i = 0; i < g.table.length; i++) if (canAddTo(g, i, [tile])) return true;
    }
    if (outOfTurn) return after - before >= 9; // bir grup tamamlıyor / görev açıyor
    return after - before >= 2;
  }

  // bot bir tam tur oynar (pickup -> play -> discard); claim fazlarını da çözer
  function botPickup(g) {
    var cp = g.cp;
    var td = topDiscard(g);
    if (td && botWantsTile(g, cp, td, false)) actTake(g); else actDraw(g);
  }

  function botClaim(g) {
    var cl = claimant(g);
    actClaim(g, cl, botWantsTile(g, cl, g.claimTile, true));
  }

  function botPlay(g) {
    var cp = g.cp, p = g.players[cp], ok = g.ok;
    if (!g.task.req) { // kafa
      var fin = null;
      for (var i = 0; i < p.hand.length; i++) {
        var rest = p.hand.slice(0, i).concat(p.hand.slice(i + 1));
        if (rest.length && partition(rest, ok, 0)) { if (!fin || isJoker(p.hand[i], ok)) fin = p.hand[i]; }
      }
      actDiscard(g, fin || botChooseDiscard(g, p));
      return;
    }
    if (!p.opened) {
      var grs = g.turnNo >= 4 ? findTaskGroups(p.hand, ok, g.task) : null;
      if (grs) actOpen(g, grs.map(function (m) { return m.tiles; }));
      actDiscard(g, botChooseDiscard(g, p));
      return;
    }
    // açılmış: olabildiğince yere koy / işle, 1 taş kalsın
    var guard = 0;
    while (guard++ < 30 && p.hand.length > 1) {
      // önce jokersiz gruplar (jokeri son taş olarak atmak için sakla)
      var nonJ = p.hand.filter(function (t) { return !isJoker(t, ok); });
      var cover = maxCover(nonJ, ok);
      if (cover.count === 0) cover = maxCover(p.hand, ok);
      if (cover.count > 0 && cover.melds[0].tiles.length < p.hand.length) { actLay(g, cover.melds[0].tiles); continue; }
      // masadaki okeyi gerçek taşla al (varsa)
      var swapped = false;
      for (var sh = 0; sh < p.hand.length && !swapped; sh++) {
        for (var smi = 0; smi < g.table.length; smi++) { if (canSwapJoker(g, smi, p.hand[sh])) { actSwapJoker(g, smi, p.hand[sh]); swapped = true; break; } }
      }
      if (swapped) continue;
      // masaya işle
      var added = false;
      for (var h = 0; h < p.hand.length && !added; h++) {
        var t = p.hand[h];
        if (isJoker(t, ok) && nonJ.length > 0) continue;
        for (var mi = 0; mi < g.table.length; mi++) {
          if (canAddTo(g, mi, [t])) { actAdd(g, mi, [t]); added = true; break; }
        }
      }
      if (!added) break;
    }
    actDiscard(g, botChooseDiscard(g, p));
  }

  function botStep(g) { // bir adım
    if (g.phase === 'pickup') botPickup(g);
    else if (g.phase === 'claim') botClaim(g);
    else if (g.phase === 'play') botPlay(g);
  }

  return {
    COLORS: COLORS, TASKS: TASKS,
    buildSet: buildSet, isJoker: isJoker, effective: effective, tileValue: tileValue, tileName: tileName,
    meldKind: meldKind, layoutMeld: layoutMeld, groupsSatisfyTask: groupsSatisfyTask,
    partition: partition, maxCover: maxCover, bestCover: bestCover, findTaskGroups: findTaskGroups,
    newGame: newGame, startHand: startHand, makeTaskOrder: makeTaskOrder, serialize: serialize, deserialize: deserialize, makeRng: makeRng, topDiscard: topDiscard, claimant: claimant,
    canTakeDiscard: canTakeDiscard, canAddTo: canAddTo, roundNo: roundNo,
    actDraw: actDraw, actTake: actTake, actClaim: actClaim, actOpen: actOpen, actLay: actLay, actAdd: actAdd, actDiscard: actDiscard, canSwapJoker: canSwapJoker, actSwapJoker: actSwapJoker, discardIsPlayable: discardIsPlayable, handDetail: handDetail, jokerMeaning: jokerMeaning,
    botStep: botStep, botWantsTile: botWantsTile
  };
}));
