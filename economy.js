/* Döngü — ekonomi modülü (saf fonksiyonlar). Hem sunucuda (yetkili) hem istemcide (gösterim / deneme modu) çalışır.
   Bütün sayılar sürümlü CONFIG'dedir; oyun kuralları (engine.js) ile ilgisi yoktur. Para birimi: Altın (tam sayı). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Economy = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONFIG = {
    version: 'dongu-economy-1.2',           // belge "dongu-economy-1.1" + 12 El ve giriş merdiveni eklemeleri
    levelCap: 50,
    xp: { base: 100, perLevel: 25 },        // sonraki seviye için XP: 100 + 25·(L−1)
    welcomeGold: 1000,
    tutorial: { gold: 200, xp: 100 },       // eğitimi ilk tamamlama (bir kez)
    levelGold: 50,                          // 2–50 arası her yeni seviyede bir kez
    milestoneLevels: [5, 10, 20, 30, 40, 50],
    handGold: [120, 30, 10, 0],             // el sırasına göre (1. … 4.)
    handXp: [40, 36, 33, 30],
    matchBonus: { 6: { gold: 30, xp: 15 }, 12: { gold: 60, xp: 30 } }, // maçın bütün ellerine uygun katılana
    dailyBands: [[24, 1], [48, 0.25]],      // günün ilk 24 uygun insan eli tam, 25–48 %25, sonrası 0 (oyun sürer)
    humanCoef: { 2: 0.5, 3: 0.75, 4: 1 },   // masadaki uygun insan sayısı katsayısı; 1 insan = antrenman
    training: { handsPerDay: 5, gold: 4, xp: 10 }, // botlara karşı (tek insan) antrenman: günde ilk 5 el
    loginGold: 40,                          // günlük giriş (UTC günü)
    dailyQuests: [[2, 30, 30], [4, 40, 40], [6, 60, 50]],      // [uygun insan eli, altın, XP] — birikimli
    weeklyQuests: [[24, 200, 150], [48, 300, 200]],
    stakes: [                                // giriş altınlı masalar (el başına; maç = el sayısı × giriş)
      { id: 'sosyal', name: 'Sosyal', entry: 0, level: 1 },
      { id: 'bronz', name: 'Bronz', entry: 100, level: 5 },
      { id: 'gumus', name: 'Gümüş', entry: 300, level: 10 },
      { id: 'altin', name: 'Altın', entry: 1000, level: 20 },
      { id: 'platin', name: 'Platin', entry: 5000, level: 25 },
      { id: 'elmas', name: 'Elmas', entry: 25000, level: 30 },
      { id: 'usta', name: 'Usta', entry: 100000, level: 35, locked: true },
      { id: 'efsane', name: 'Efsane', entry: 500000, level: 40, locked: true }
    ],
    stakeFeeBps: 500,                       // havuzun %5'i sistem gideri
    stakePayoutBps: [6500, 3500, 0, 0],     // kalan havuz: 1. %65, 2. %35
    venue: {
      tiers: [
        { tier: 1, name: 'Mahalle kahvesi', price: 0, reputation: 0, tables: 2, slots: 0 },
        { tier: 2, name: 'Semt kıraathanesi', price: 4000, reputation: 100, tables: 3, slots: 0 },
        { tier: 3, name: 'Geniş kıraathane', price: 12000, reputation: 350, tables: 4, slots: 1 },
        { tier: 4, name: 'Modern kafe', price: 35000, reputation: 900, tables: 6, slots: 1 },
        { tier: 5, name: 'Premium kulüp', price: 90000, reputation: 2000, tables: 8, slots: 2 },
        { tier: 6, name: 'Büyük sosyal tesis', price: 220000, reputation: 4500, tables: 12, slots: 3 }
      ],
      hostGold: { 1: 20, 6: 80, 12: 140 },  // uygun maç başına kasa altını (12 El: belgede yok; doğrusal altı değer)
      hostDailyMax: 1000, hostDailyMatches: 20, hostReputation: 2, hostDailyReputationMax: 40,
      sameGroupMax: 3,                       // aynı insan grubunun günde ödüllü ilk 3 maçı
      openGift: { gold: 200, reputation: 20 },
      firstFriendMatch: { gold: 100, reputation: 20 },
      npcProfitDailyMax: [120, 140, 160, 180, 200, 240],
      recipes: { cay: { minutes: 20, servings: 10, inputCost: 10, price: 3, systemFee: 1, stockMax: 40, npcPerHour: 20 } },
      offlineHours: 8
    }
  };

  // ---------- kıraathane: eşya kataloğu, zemin ızgarası, yerleşim doğrulama (sunucu ve istemci aynı kuralı kullanır) ----------
  // footprint: [en, boy] hücre; wall: duvar eşyası (zemine değil, arka duvar şeridine); kind: 'table' oyun masası, 'station' üretim; price: kasa altını
  var VENUE_ITEMS = [
    { id: 'v_masa', name: 'Okey masası', cat: 'masa', price: 1500, footprint: [2, 2], kind: 'table', seats: 4, tier: 1, sprite: 'masa', desc: 'Dört kişilik oynanabilir masa; etrafındaki 4 hücre koltuk için boş kalır.' },
    { id: 'v_sandalye', name: 'Sandalye', cat: 'masa', price: 120, footprint: [1, 1], rot: true, tier: 1, sprite: 'sandalye', desc: 'Dekor sandalye (masanın koltukları otomatik gelir).' },
    { id: 'v_cayocagi', name: 'Çay ocağı', cat: 'uretim', price: 2500, footprint: [2, 1], kind: 'station', recipe: 'cay', tier: 1, sprite: 'cayocagi', desc: '20 dakikada 10 servis çay üretir (10 altın girdi).' },
    { id: 'v_tezgah', name: 'Servis tezgâhı', cat: 'uretim', price: 800, footprint: [3, 1], tier: 1, sprite: 'tezgah', desc: 'Servis alanı; yalnız görünüm.' },
    { id: 'v_hali', name: 'Kilim', cat: 'dekor', price: 400, footprint: [3, 2], floor: true, tier: 1, sprite: 'hali', desc: 'Zemine serilir; üstüne eşya konabilir.' },
    { id: 'v_lamba', name: 'Ayaklı lamba', cat: 'dekor', price: 350, footprint: [1, 1], tier: 1, sprite: 'lamba', desc: 'Sıcak ışık.' },
    { id: 'v_soba', name: 'Kuzine soba', cat: 'dekor', price: 900, footprint: [1, 1], tier: 1, sprite: 'soba', desc: 'Kış kahvesi havası.' },
    { id: 'v_radyo', name: 'Radyo', cat: 'dekor', price: 300, footprint: [1, 1], tier: 1, sprite: 'radyo', desc: 'Eski radyo.' },
    { id: 'v_fener', name: 'Fener', cat: 'dekor', price: 250, footprint: [1, 1], tier: 1, sprite: 'fener', desc: 'Küçük fener.' },
    { id: 'v_bitki', name: 'Saksı bitkisi', cat: 'dekor', price: 300, footprint: [1, 1], tier: 1, sprite: 'bitki', desc: 'Yeşillik.' },
    { id: 'v_kedi', name: 'Beyaz kedi', cat: 'dekor', price: 600, footprint: [1, 1], tier: 1, sprite: 'kedi', desc: 'Kahvenin kedisi.' },
    { id: 'v_saat', name: 'Duvar saati', cat: 'duvar', price: 300, footprint: [1, 1], wall: true, tier: 1, sprite: 'saat', desc: 'Arka duvara asılır.' },
    { id: 'v_tablo', name: 'Tablo', cat: 'duvar', price: 450, footprint: [1, 1], wall: true, tier: 1, sprite: 'tablo', desc: 'Manzara tablosu.' },
    { id: 'v_tv', name: 'Televizyon', cat: 'duvar', price: 1200, footprint: [1, 1], wall: true, tier: 2, sprite: 'tv', desc: 'Eski tüplü televizyon.' },
    { id: 'v_kahvemakinesi', name: 'Kahve makinesi', cat: 'uretim', price: 4000, footprint: [1, 1], kind: 'station', recipe: 'kahve', tier: 2, sprite: 'kahvemakinesi', desc: '30 dakikada 10 fincan kahve (20 altın girdi).' },
    { id: 'v_koltuk', name: 'Koltuk takımı', cat: 'dekor', price: 1800, footprint: [3, 2], tier: 2, sprite: 'koltuk', desc: 'Sosyal köşe.' },
    { id: 'v_slot', name: 'Slot makinesi', cat: 'eglence', price: 12000, footprint: [1, 1], tier: 3, sprite: 'slot', desc: 'Eğlence (ayrı özellik; henüz kapalı).', locked: true }
  ];
  var VENUE_STARTER = ['v_masa', 'v_cayocagi', 'v_sandalye', 'v_sandalye', 'v_hali']; // açılış paketi (bir kez)
  // zemin ızgarası: perspektifli yamuk; kapı alt kenar ortasında; duvar şeridi arka duvarda (wallCols sütun)
  var VENUE_GRID = { cols: 12, rows: 7, x0: 800, yTop: 330, yBot: 790, wTop: 980, wBot: 1440, wallY: 250, doorCols: [5, 6], serviceRow: 6 };
  function venueItem(id) { for (var i = 0; i < VENUE_ITEMS.length; i++) if (VENUE_ITEMS[i].id === id) return VENUE_ITEMS[i]; return null; }
  function venueTier(t) { return CONFIG.venue.tiers[Math.max(0, Math.min(5, (t || 1) - 1))]; }
  // hücre → sahne koordinatı (alt-orta çapa). gx: 0..cols-1, gy: 0..rows-1 (0 = en arka)
  function cellPos(gx, gy, G) {
    G = G || VENUE_GRID; var t = (gy + 1) / G.rows, w = G.wTop + (G.wBot - G.wTop) * t, cellW = w / G.cols;
    return { x: G.x0 - w / 2 + (gx + 0.5) * cellW, y: G.yTop + (G.yBot - G.yTop) * t, scale: w / G.wBot, cellW: cellW };
  }
  // sahne koordinatı → hücre (en yakın)
  function cellAt(x, y, G) {
    G = G || VENUE_GRID; var t = (y - G.yTop) / (G.yBot - G.yTop); if (t < 0 || t > 1) return null;
    var gy = Math.min(G.rows - 1, Math.max(0, Math.floor(t * G.rows))); var tt = (gy + 1) / G.rows, w = G.wTop + (G.wBot - G.wTop) * tt, cellW = w / G.cols;
    var gx = Math.floor((x - (G.x0 - w / 2)) / cellW); if (gx < 0 || gx >= G.cols) return null;
    return { gx: gx, gy: gy };
  }
  function footprintCells(item, p) { // yerleştirilmiş eşyanın kapladığı hücreler ({gx,gy} listesi); döndürme 1/3 = en-boy yer değiştirir
    var fw = item.footprint[0], fh = item.footprint[1]; if (p.rot === 1 || p.rot === 3) { var tmp = fw; fw = fh; fh = tmp; }
    var out = []; for (var dy = 0; dy < fh; dy++) for (var dx = 0; dx < fw; dx++) out.push({ gx: p.gx + dx, gy: p.gy + dy });
    return out;
  }
  function seatCells(item, p) { // masa koltukları: ayak izinin üst, alt, sol, sağ ortası
    var fw = item.footprint[0], fh = item.footprint[1];
    return [{ gx: p.gx, gy: p.gy - 1 }, { gx: p.gx + fw - 1, gy: p.gy + fh }, { gx: p.gx - 1, gy: p.gy }, { gx: p.gx + fw, gy: p.gy + fh - 1 }];
  }
  // yerleşim doğrulama: {ok, errors[], blocked:Set} — sınır, çakışma, kapı/servis yolu, masa erişimi (kapıdan yürüyerek ulaşılabilir)
  function validateLayout(placements, inventory, G) {
    G = G || VENUE_GRID; var errors = [], occ = {}, walls = {}, tables = [];
    function key(c) { return c.gx + ',' + c.gy; }
    var byIid = {}; (inventory || []).forEach(function (it) { byIid[it.iid] = it; });
    placements.forEach(function (p) {
      var inv = byIid[p.iid]; if (!inv) { errors.push('Envanterde olmayan eşya: ' + p.iid); return; }
      var item = venueItem(inv.item); if (!item) { errors.push('Bilinmeyen eşya: ' + inv.item); return; }
      if (item.wall) { if (p.gx < 0 || p.gx >= G.cols) errors.push(item.name + ' duvar dışında'); else if (walls[p.gx]) errors.push(item.name + ' başka duvar eşyasıyla çakışıyor'); walls[p.gx] = p.iid; return; }
      var cells = footprintCells(item, p);
      cells.forEach(function (c) {
        if (c.gx < 0 || c.gy < 0 || c.gx >= G.cols || c.gy >= G.rows) { errors.push(item.name + ' zemin dışında'); return; }
        if (G.doorCols.indexOf(c.gx) >= 0 && c.gy === G.rows - 1) errors.push(item.name + ' kapı önünü kapatıyor');
        if (!item.floor) { if (occ[key(c)] && !occ[key(c)].floor) errors.push(item.name + ' ile ' + occ[key(c)].name + ' çakışıyor'); occ[key(c)] = item; }
        else if (occ[key(c)] && occ[key(c)].floor) errors.push('İki kilim üst üste');
      });
      if (item.kind === 'table') tables.push({ p: p, item: item, iid: p.iid });
    });
    // koltuk hücreleri boş ve zemin içinde olmalı
    tables.forEach(function (t) { seatCells(t.item, t.p).forEach(function (c) { if (c.gx < 0 || c.gy < 0 || c.gx >= G.cols || c.gy >= G.rows) errors.push(t.item.name + ' koltuğu zemin dışında'); else if (occ[key(c)] && !occ[key(c)].floor) errors.push(t.item.name + ' koltuğu ' + occ[key(c)].name + ' ile kapanmış'); }); });
    // yürünebilir hücreler: dolu olmayan (kilim yürünebilir) hücreler; kapıdan BFS
    var walk = {}; for (var gy = 0; gy < G.rows; gy++) for (var gx = 0; gx < G.cols; gx++) { var k = gx + ',' + gy; walk[k] = !occ[k] || !!occ[k].floor; }
    var reach = {}, q = []; G.doorCols.forEach(function (gx) { var k = gx + ',' + (G.rows - 1); if (walk[k]) { reach[k] = true; q.push([gx, G.rows - 1]); } });
    while (q.length) { var c = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1], nk = nx + ',' + ny; if (nx < 0 || ny < 0 || nx >= G.cols || ny >= G.rows || reach[nk] || !walk[nk]) return; reach[nk] = true; q.push([nx, ny]); }); }
    tables.forEach(function (t) { var okSeat = seatCells(t.item, t.p).some(function (c) { return reach[c.gx + ',' + c.gy]; }); if (!okSeat) errors.push(t.item.name + ' kapıdan ulaşılamıyor (yol kapalı)'); });
    var stations = placements.filter(function (p) { var inv = byIid[p.iid]; var it = inv && venueItem(inv.item); return it && it.kind === 'station'; });
    stations.forEach(function (p) { var it = venueItem(byIid[p.iid].item); var cells = footprintCells(it, p); var near = false; cells.forEach(function (c) { [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { if (reach[(c.gx + d[0]) + ',' + (c.gy + d[1])]) near = true; }); }); if (!near) errors.push(it.name + ' önüne yürünemiyor'); });
    return { ok: errors.length === 0, errors: errors, reach: reach, walk: walk, occ: occ };
  }
  // yürüyüş yolu: BFS (dolu olmayan hücreler); hedef dolu ise hedefe komşu en yakın yürünebilir hücreye
  function findPath(fromC, toC, walk, G) {
    G = G || VENUE_GRID; var key = function (x, y) { return x + ',' + y; };
    if (!walk[key(toC.gx, toC.gy)]) { // hedef hücre dolu: komşulardan en yakın yürünebilir
      var best = null; [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (d) { var nx = toC.gx + d[0], ny = toC.gy + d[1]; if (nx < 0 || ny < 0 || nx >= G.cols || ny >= G.rows || !walk[key(nx, ny)]) return; var dd = Math.abs(nx - fromC.gx) + Math.abs(ny - fromC.gy); if (!best || dd < best.d) best = { gx: nx, gy: ny, d: dd }; });
      if (!best) return null; toC = best;
    }
    var prev = {}, q = [[fromC.gx, fromC.gy]], seen = {}; seen[key(fromC.gx, fromC.gy)] = true;
    while (q.length) {
      var c = q.shift(); if (c[0] === toC.gx && c[1] === toC.gy) break;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1], nk = key(nx, ny); if (nx < 0 || ny < 0 || nx >= G.cols || ny >= G.rows || seen[nk] || !walk[nk]) return; seen[nk] = true; prev[nk] = c; q.push([nx, ny]); });
    }
    if (!seen[key(toC.gx, toC.gy)]) return null;
    var path = [], cur = [toC.gx, toC.gy]; while (cur && !(cur[0] === fromC.gx && cur[1] === fromC.gy)) { path.unshift({ gx: cur[0], gy: cur[1] }); cur = prev[key(cur[0], cur[1])]; }
    return path;
  }
  // üretim / stok hesabı (sunucu zamanıyla): parti bitişleri, NPC satışı (saatlik talep, günlük kâr tavanı), 8 saat sınırı
  function settleProduction(v, now) {
    var pr = v.production || (v.production = {}), lines = [], R = CONFIG.venue.recipes;
    var last = pr.settledAt || v.created || now, from = Math.max(last, now - CONFIG.venue.offlineHours * 3600000), elapsed = Math.max(0, Math.min(now, now) - from);
    var cap = CONFIG.venue.npcProfitDailyMax[Math.max(0, Math.min(5, (v.tier || 1) - 1))], dk = dayKey(now);
    if (!pr.npc || pr.npc.day !== dk) pr.npc = { day: dk, profit: 0, sold: 0 };
    Object.keys(pr.stations || {}).forEach(function (sid) {
      var st = pr.stations[sid], rc = R[st.recipe]; if (!rc) return;
      if (st.batchEndsAt && st.batchEndsAt <= now) { st.stock = Math.min(rc.stockMax, (st.stock || 0) + rc.servings); st.batchEndsAt = 0; lines.push(st.recipe + ': parti bitti, stok ' + st.stock); }
      // NPC satışı: saatlik talep × geçen süre (en çok 8 saat), stok ve günlük kâr tavanı ile sınırlı
      var demand = Math.floor(rc.npcPerHour * elapsed / 3600000) - (st.demandUsed || 0); if (demand < 0) demand = 0;
      var unitProfit = rc.price - rc.systemFee - rc.inputCost / rc.servings, sold = 0;
      while (demand > 0 && (st.stock || 0) > 0 && pr.npc.profit + unitProfit <= cap) { st.stock--; demand--; sold++; pr.npc.profit += unitProfit; pr.npc.sold++; v.uncollected = (v.uncollected || 0) + (rc.price - rc.systemFee); }
      if (sold) lines.push(st.recipe + ': NPC ' + sold + ' servis aldı');
    });
    pr.settledAt = now;
    Object.keys(pr.stations || {}).forEach(function (sid) { pr.stations[sid].demandUsed = 0; });
    return lines;
  }

  // ---------- seviye ----------
  function xpNeed(level) { return CONFIG.xp.base + CONFIG.xp.perLevel * (level - 1); }
  function levelOf(totalXp) {
    var xp = Math.max(0, totalXp | 0), l = 1;
    while (l < CONFIG.levelCap && xp >= xpNeed(l)) { xp -= xpNeed(l); l++; }
    if (l >= CONFIG.levelCap) return { level: CONFIG.levelCap, into: xp, need: 0 };
    return { level: l, into: xp, need: xpNeed(l) };
  }
  function cumulativeXp(level) { var s = 0; for (var l = 1; l < level; l++) s += xpNeed(l); return s; } // L seviyesine ulaşmak için toplam XP

  // ---------- dönemler (UTC) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(ts) { var d = new Date(ts == null ? Date.now() : ts); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function weekKey(ts) { // ISO haftası: pazartesi 00.00 UTC
    var d = new Date(ts == null ? Date.now() : ts), t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    var dow = (new Date(t).getUTCDay() + 6) % 7; t -= dow * 86400000;
    var m = new Date(t); return m.getUTCFullYear() + '-' + pad(m.getUTCMonth() + 1) + '-' + pad(m.getUTCDate());
  }
  function nextDayAt(ts) { var d = new Date(ts == null ? Date.now() : ts); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); }

  // oyuncunun ekonomi sayaçları (hesapta saklanır); dönem değişince sıfırlanır
  function econOf(p, now) {
    if (!p.econ) p.econ = {};
    var e = p.econ, dk = dayKey(now), wk = weekKey(now);
    if (e.day !== dk) { e.day = dk; e.hands = 0; e.training = 0; e.dailyDone = []; e.login = false; }
    if (e.week !== wk) { e.week = wk; e.weekHands = 0; e.weeklyDone = []; }
    if (e.levelPaid == null) e.levelPaid = levelOf(p.xp || 0).level; // geçiş: geçmiş seviye altını yeniden ödenmez
    return e;
  }

  // ---------- el ödülü ----------
  function bandRate(dayHands) { // bu el günün kaçıncı uygun eli (1 tabanlı) → oran
    for (var i = 0; i < CONFIG.dailyBands.length; i++) if (dayHands <= CONFIG.dailyBands[i][0]) return CONFIG.dailyBands[i][1];
    return 0;
  }
  function humanCoef(humans) { return humans >= 4 ? 1 : (CONFIG.humanCoef[humans] || 0); }
  function fmt(n) { return String(n).replace('.', ','); } // Türkçe ondalık
  // eşit sıralar: bağlı konumların ödülleri ortalanır, aşağı yuvarlanır. ranks: [1..4] (eşitlikte aynı sayı)
  function rankShare(table, ranks, me) { // konum = kendisinden iyi sıradakilerin sayısı + 1; bağlı konumların ödülleri ortalanır
    var r = ranks[me], tied = 0, better = 0; for (var i = 0; i < ranks.length; i++) { if (ranks[i] === r) tied++; else if (ranks[i] < r) better++; }
    var sum = 0; for (var k = 0; k < tied; k++) sum += table[Math.min(3, better + k)];
    return Math.floor(sum / tied);
  }
  function handReward(opts) { // {ranks, me, humans, dayHands(1 tabanlı, bu el dahil)} → {gold, xp, coef, rate}
    var coef = humanCoef(opts.humans), rate = bandRate(opts.dayHands);
    var g = rankShare(CONFIG.handGold, opts.ranks, opts.me), x = rankShare(CONFIG.handXp, opts.ranks, opts.me);
    return { gold: Math.floor(g * coef * rate), xp: Math.floor(x * coef * rate), coef: coef, rate: rate, baseGold: g, baseXp: x };
  }
  function levelUps(p, e) { // XP değişiminden sonra: ödenmemiş seviyeler için altın; {from,to,gold}
    var lv = levelOf(p.xp || 0).level, gold = 0, from = e.levelPaid;
    while (e.levelPaid < lv) { e.levelPaid++; gold += CONFIG.levelGold; }
    if (gold) p.coins = (p.coins || 0) + gold;
    return lv > from ? { from: from, to: lv, gold: gold } : null;
  }
  function questCheck(e, p, lines) { // birikimli günlük/haftalık el görevleri; otomatik verilir
    var out = [];
    CONFIG.dailyQuests.forEach(function (q, i) { if (e.hands >= q[0] && e.dailyDone.indexOf(i) < 0) { e.dailyDone.push(i); p.coins += q[1]; p.xp += q[2]; out.push({ type: 'daily', idx: i, hands: q[0], gold: q[1], xp: q[2] }); lines.push('Günlük görev: ' + q[0] + ' el → +' + q[1] + ' altın · +' + q[2] + ' XP'); } });
    CONFIG.weeklyQuests.forEach(function (q, i) { if (e.weekHands >= q[0] && e.weeklyDone.indexOf(i) < 0) { e.weeklyDone.push(i); p.coins += q[1]; p.xp += q[2]; out.push({ type: 'weekly', idx: i, hands: q[0], gold: q[1], xp: q[2] }); lines.push('Haftalık görev: ' + q[0] + ' el → +' + q[1] + ' altın · +' + q[2] + ' XP'); } });
    return out;
  }
  // Uygun insan elini hesaba işle (sunucu: her gerçek oyuncu için). opts: {ranks, me, humans, won}
  function settleHand(p, opts, now) {
    var e = econOf(p, now), lines = [];
    if (opts.humans <= 1) return settleTraining(p, opts, now);
    e.hands++; e.weekHands++;
    var rw = handReward({ ranks: opts.ranks, me: opts.me, humans: opts.humans, dayHands: e.hands });
    p.coins = (p.coins || 0) + rw.gold; p.xp = (p.xp || 0) + rw.xp;
    var rankTxt = opts.ranks[opts.me] + '. sıra';
    lines.push('El ödülü (' + rankTxt + (rw.coef < 1 ? ', ' + opts.humans + ' insan ×' + fmt(rw.coef) : '') + (rw.rate < 1 ? (rw.rate ? ', günlük %25 bant' : ', günlük sınır doldu') : '') + '): +' + rw.gold + ' altın · +' + rw.xp + ' XP');
    var quests = questCheck(e, p, lines);
    var lu = levelUps(p, e); if (lu) lines.push('Seviye ' + lu.to + '! +' + lu.gold + ' altın');
    if (p.stats) { p.stats.hands = (p.stats.hands || 0) + 1; }
    return { gold: rw.gold, xp: rw.xp, coef: rw.coef, rate: rw.rate, dayHands: e.hands, quests: quests, levelUp: lu, lines: lines, training: false };
  }
  function settleTraining(p, opts, now) { // tek insan (botlara karşı): günde ilk 5 el 4 altın 10 XP; sıralama bonusu yok
    var e = econOf(p, now), lines = [], t = CONFIG.training, gold = 0, xp = 0;
    e.training++;
    if (e.training <= t.handsPerDay) { gold = t.gold; xp = t.xp; p.coins = (p.coins || 0) + gold; p.xp = (p.xp || 0) + xp; lines.push('Antrenman eli (' + e.training + '/' + t.handsPerDay + '): +' + gold + ' altın · +' + xp + ' XP'); }
    else lines.push('Antrenman eli: günlük ' + t.handsPerDay + ' el ödülü doldu');
    var lu = levelUps(p, e); if (lu) lines.push('Seviye ' + lu.to + '! +' + lu.gold + ' altın');
    if (p.stats) p.stats.hands = (p.stats.hands || 0) + 1;
    return { gold: gold, xp: xp, coef: 0, rate: e.training <= t.handsPerDay ? 1 : 0, dayHands: e.hands || 0, quests: [], levelUp: lu, lines: lines, training: true, trainingCount: e.training };
  }
  // maç tamamlama bonusu: maçın bütün ellerine uygun katılan; katsayı = ellerin katsayı×bant ortalaması
  function settleMatch(p, opts, now) { // {totalHands, eligibleHands, factors:[coef*rate...], rank, won}
    var e = econOf(p, now), lines = [], b = CONFIG.matchBonus[opts.totalHands];
    var out = { gold: 0, xp: 0, lines: lines, levelUp: null };
    if (b && opts.eligibleHands >= opts.totalHands && opts.factors && opts.factors.length) {
      var f = opts.factors.reduce(function (s, x) { return s + x; }, 0) / opts.factors.length;
      out.gold = Math.floor(b.gold * f); out.xp = Math.floor(b.xp * f);
      p.coins = (p.coins || 0) + out.gold; p.xp = (p.xp || 0) + out.xp;
      lines.push(opts.totalHands + ' el tamamlama bonusu: +' + out.gold + ' altın · +' + out.xp + ' XP');
    }
    if (p.stats) { p.stats.matches = (p.stats.matches || 0) + 1; if (opts.rank === 1) p.stats.wins = (p.stats.wins || 0) + 1; }
    out.levelUp = levelUps(p, e); if (out.levelUp) lines.push('Seviye ' + out.levelUp.to + '! +' + out.levelUp.gold + ' altın');
    return out;
  }
  function loginReward(p, now) { // günlük giriş: UTC günü başına bir kez
    var e = econOf(p, now); if (e.login) return null;
    e.login = true; p.coins = (p.coins || 0) + CONFIG.loginGold;
    return { gold: CONFIG.loginGold };
  }
  function tutorialReward(p, now) {
    if (p.tutorialRewarded) return null; p.tutorialRewarded = true;
    var e = econOf(p, now); p.coins = (p.coins || 0) + CONFIG.tutorial.gold; p.xp = (p.xp || 0) + CONFIG.tutorial.xp;
    var lu = levelUps(p, e);
    return { gold: CONFIG.tutorial.gold, xp: CONFIG.tutorial.xp, levelUp: lu };
  }
  function summary(p, now) { // arayüz: bugünkü durum
    var e = econOf(p, now), lv = levelOf(p.xp || 0);
    return { day: e.day, hands: e.hands, training: e.training, trainingMax: CONFIG.training.handsPerDay, weekHands: e.weekHands, login: !!e.login, dailyDone: e.dailyDone.slice(), weeklyDone: e.weeklyDone.slice(), bandNext: bandRate(e.hands + 1), fullHands: CONFIG.dailyBands[0][0], reducedHands: CONFIG.dailyBands[1][0], level: lv, nextDayAt: nextDayAt(now), version: CONFIG.version };
  }

  // ---------- giriş altınlı masa havuzu ----------
  function stakeOf(id) { for (var i = 0; i < CONFIG.stakes.length; i++) if (CONFIG.stakes[i].id === id) return CONFIG.stakes[i]; return CONFIG.stakes[0]; }
  // entries: 4 giriş tutarı (eşit), ranks: [1..4] (eşitlikte aynı sayı) → ödemeler (toplam = havuz − gider)
  function payoutPool(entry, ranks) {
    var total = entry * ranks.length, fee = Math.floor(total * CONFIG.stakeFeeBps / 10000), net = total - fee;
    var shares = [0, 0, 0, 0], bps = CONFIG.stakePayoutBps;
    // bağlı konumların bps'leri birleştirilip eşit bölünür
    var groups = {}; ranks.forEach(function (r, i) { (groups[r] = groups[r] || []).push(i); });
    var paid = 0, order = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; }), pos = 0;
    order.forEach(function (r) {
      var members = groups[r], sumBps = 0; for (var k = 0; k < members.length; k++) sumBps += bps[Math.min(3, pos + k)] || 0;
      pos += members.length;
      var amount = Math.floor(net * sumBps / 10000), each = Math.floor(amount / members.length), rem = amount - each * members.length;
      members.forEach(function (i, j) { shares[i] = each + (j < rem ? 1 : 0); paid += shares[i]; });
    });
    // yuvarlama kalanı en iyi sıraya (deterministik)
    var leftover = net - paid; if (leftover > 0) { var top = groups[order[0]]; shares[top[0]] += leftover; }
    return { total: total, fee: fee, net: net, shares: shares };
  }

  return { CONFIG: CONFIG, fmt: fmt, VENUE_ITEMS: VENUE_ITEMS, VENUE_STARTER: VENUE_STARTER, VENUE_GRID: VENUE_GRID, venueItem: venueItem, venueTier: venueTier, cellPos: cellPos, cellAt: cellAt, footprintCells: footprintCells, seatCells: seatCells, validateLayout: validateLayout, findPath: findPath, settleProduction: settleProduction, xpNeed: xpNeed, levelOf: levelOf, cumulativeXp: cumulativeXp, dayKey: dayKey, weekKey: weekKey, nextDayAt: nextDayAt, econOf: econOf, bandRate: bandRate, humanCoef: humanCoef, handReward: handReward, settleHand: settleHand, settleTraining: settleTraining, settleMatch: settleMatch, loginReward: loginReward, tutorialReward: tutorialReward, summary: summary, stakeOf: stakeOf, payoutPool: payoutPool, levelUps: levelUps };
}));
