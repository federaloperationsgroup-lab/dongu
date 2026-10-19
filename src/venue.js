/* Döngü — Kıraathanem (oyuncunun kendi mekânı): cephe, iç mekân, dokun-yürü karakter, ızgara editörü, mağaza, üretim, davet, çok oyunculu görünürlük.
   Görseller: web/assets/k/ (5 Ekim 2026 paketleri: 7 tema cephe/iç mekân, 27 eşya/efekt; 7 Ekim 2026 son karakter paketi: 6 karakter duruş + 6 kareli yürüyüş, 120 giysi/saç/sakal/aksesuar katmanı + 36 bere uyumlu saç, ten maskeleri).
   Kamera (v9.63): iç mekân dünyası kapta büyütülür ve oyuncuyu izler (telefonda ~1,45×, büyük ekranda 1,2×); düzenlemede tam görünüm. */
(function () {
  'use strict';
  var A = window.DonguApp, E = window.Economy, GRID = E.VENUE_GRID, $ = A.$;
  function P(gx, gy) { return E.cellPos(gx, gy, GRID); }
  var V = { venue: null, mine: false, inside: false, edit: false, me: null, others: {}, cid: null, draft: null, sel: null, ghost: null, raf: 0, tables: {}, pointer: null, canvas: null, modeHands: null };
  window.Venue = V;

  // ---------- ölçü sistemi ve görseller (7 Ekim 2026) ----------
  // Dünya birimi: 1 zemin hücresi = ön sırada 120 px = 0,70 m. Karakter 1,75 m = 2,5 hücre = 300 px (CHAR_SCALE × 512 px kare).
  // Eşya görselleri alfa kutusuna kırpılmıştır (çevrelerinde şeffaf boşluk yok; orijinaller archive/items-uncropped/); w = görünen genişlik (hücre),
  // yükseklik görselin kendi oranından gelir. Hedef oranlar (karakter boyuna göre): sandalye ~%55, masa üstü kalça hizası, çay ocağı/buzdolabı/vitrin ~%90.
  // Ayak izi (hücre) ile görsel genişliği aynı ölçekte: 1×1 eşya ≤ ~1,2 hücre, 2×1 ≤ 2, 3×1 ≤ 3. Dokunma alanı = görsel kutusu; çarpışma/yol = ayak izi.
  var UNIT = { cellM: 0.7, charM: 1.75, cellPx: 150 }, CHAR_SCALE = (UNIT.charM / UNIT.cellM) * UNIT.cellPx / 512; // ≈ 0,732 (v9.68: hücre 150 px; oda 10×6 — boyalı mekân karaktere göre %25 küçüldü)
  // w: eşyanın görünen genişliği (hücre); wall: duvar eşyası; floor: zemin katmanı; views: yön başına ayrı görsel (rot 0 ön, 1 sağ yan, 2 arka, 3 sol yan = sağ yan aynalı)
  var K = 'assets/k/';
  var SPRITES = {
    masa: { src: K + 'okey-masasi.webp', w: 1.9 },                 // 1,33 m geniş okey masası; 2×2 ayak izi (koltuk hücreleri dışarıda)
    sandalye: { src: K + 'sandalye-on.webp', w: 1.0, views: [K + 'sandalye-on.webp', K + 'sandalye-yan.webp', K + 'sandalye-arka.webp', K + 'sandalye-yan.webp'] }, // boy ≈ karakterin %53'ü
    cayocagi: { src: K + 'cay-ocagi.webp', w: 2.0, steam: K + 'cay-buhar.webp' }, // semaverli tezgâh, 2×1
    tezgah: { src: K + 'tezgah.webp', w: 3.0 },                     // 3×1 bar tezgâhı
    hali: { src: K + 'hali-1.webp', w: 3.0, floor: true },         // 3×2 kilim (yürünebilir)
    lamba: { src: K + 'lamba.webp', w: 0.75, halo: K + 'lamba-isik.webp' }, // 1,6 m lambader
    soba: { src: K + 'soba.webp', w: 1.0 },
    radyo: { src: K + 'radyo.webp', w: 0.7 },
    fener: { src: 'assets/fener.webp', w: 0.6 },
    bitki: { src: K + 'bitki-1.webp', w: 0.85 },
    kedi: { src: 'assets/beyaz-kedi.webp', w: 0.55 },
    saat: { src: K + 'saat.webp', w: 0.8, wall: true },
    tablo: { src: K + 'tablo-1.webp', w: 1.0, wall: true },
    tv: { src: K + 'tv.webp', w: 1.3, wall: true },
    kahvemakinesi: { src: K + 'kahve-makinesi.webp', w: 0.8 },
    koltuk: { src: K + 'koltuk-on.webp', w: 3.0 },                 // 3×2 üçlü koltuk
    koltukyan: { src: K + 'koltuk-yan.webp', w: 1.05 },            // tekli koltuk 1×1
    buzdolabi: { src: K + 'buzdolabi.webp', w: 1.15 },              // 1,7 m buzdolabı
    tost: { src: K + 'tost-tezgahi.webp', w: 1.9 },                // 2×1
    vitrin: { src: K + 'vitrin.webp', w: 1.2 },                     // 1,8 m vitrin
    muzik: { src: K + 'muzik-kutusu.webp', w: 1.15 },
    slot: { src: K + 'slot-makinesi.webp', w: 1.2 }
  };
  // tema başına mekân görselleri: cephe (gündüz/akşam), temiz iç mekân, kapı dokunma alanı, tabela konumu, iç mekân ızgara ince ayarı (yalnız görsel; hücre kuralları ortak)
  var THEME_ART = {
    koy: { door: { x: 690, y: 370, w: 210, h: 290 }, sign: { y: 292, w: 300 }, grid: { yTop: 340, wallY: 230 } },
    sokak: { door: { x: 690, y: 240, w: 210, h: 360 }, sign: { y: 150 } },
    sanayi: { door: { x: 610, y: 290, w: 270, h: 290 }, sign: { y: 130 }, grid: { yTop: 345 } },
    cinar: { door: { x: 700, y: 290, w: 220, h: 290 }, sign: { y: 170 } },
    soba: { door: { x: 640, y: 300, w: 250, h: 300 }, sign: { y: 180 }, grid: { yTop: 365 } },
    apartman: { door: { x: 640, y: 210, w: 240, h: 350 }, sign: { y: 130 } },
    bag: { door: { x: 690, y: 290, w: 210, h: 290 }, sign: { y: 170 } }
  };
  var VENUE_THEMES = ['koy', 'sokak', 'sanayi', 'cinar', 'soba', 'apartman', 'bag']; // 'kahve' teması köy setini kullanır (eski kayıtlar için)
  function artTheme(t) { return THEME_ART[t] ? t : 'koy'; }
  function isEvening() { if (V.timeOverride) return V.timeOverride === 'aksam'; var h = new Date().getHours(); return h >= 18 || h < 6; }
  function exteriorBg(theme) { return K + artTheme(theme) + '-cephe-' + (isEvening() ? 'aksam' : 'gunduz') + '.webp'; }
  function interiorBg(theme) { return K + artTheme(theme) + '-ic-temiz.webp'; }
  function exteriorThumb(theme) { return K + artTheme(theme) + '-cephe-' + (isEvening() ? 'aksam' : 'gunduz') + '-kucuk.webp'; } // v10.11 (K178): Keşfet listesi (320×180)
  function gridFor(theme) { var o = THEME_ART[artTheme(theme)].grid; if (!o) return E.VENUE_GRID; var g = {}; Object.keys(E.VENUE_GRID).forEach(function (k) { g[k] = E.VENUE_GRID[k]; }); Object.keys(o).forEach(function (k) { g[k] = o[k]; }); return g; }
  // karakter: tam boy duruş (256×512) ve yürüyüş şeridi (6 × 256×512), ayak çapası (128,480); duruş ve yürüyüş karelerinde ayak çizgisi aynı (y=479), yön değişince karakter yerinden oynamaz. Hazır karakterler tek parça; gövde (erkek/kadın) katmanlarla giydirilir.
  var FULL_KEYS = { palyaco: 'bal-palyaco', ordek: 'katil-ordek-yavrusu', fikret: 'cayci-fikret', sakir: 'keci-sakir', pamuk: 'kedi-pamuk', nine: 'dedikoducu-nine', muhtar: 'muhtar-bey' }; // v9.90 / v9.92 // Fişek Kurye ve Egoliçe 7 Ekim 2026'da kaldırıldı (görseller archive/k/)
  function charKey(av) { av = A.normAvatar(av || {}); if (av.full && FULL_KEYS[av.full]) return FULL_KEYS[av.full]; return av.gender === 'kadin' ? 'govde-kadin' : 'govde-erkek'; }
  function charSrc(key, anim, dir) { return K + 'ch-' + key + '-' + anim + '-' + (dir === 'sol' ? 'yan' : dir) + '.webp'; }
  // Kendi karakter (gövde + 2. tur katmanları): gövde → üst → sakal → saç (bere varsa bere-uyumlu saç) → aksesuar. Saç/sakal nötr gri → saç rengi rampası (masadaki karakterle aynı yöntem).
  // Ten rengi: ten-<cinsiyet>-<animasyon>-<yön>.webp maskesi (yüz + eller; 7 Ekim paketi) ile gövde, masadaki karakterle aynı oran yöntemiyle boyanır.
  var compCache = {}, imgCache = {}, BASE_SKIN = [215, 144, 111];
  function tintSkin(im, maskIm, w, h, color) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'); x.drawImage(im, 0, 0);
    if (!maskIm) return c;
    var mc = document.createElement('canvas'); mc.width = w; mc.height = h; var mx = mc.getContext('2d'); mx.drawImage(maskIm, 0, 0);
    var d = x.getImageData(0, 0, w, h), px = d.data, md = mx.getImageData(0, 0, w, h).data, rgb = hexRGB(color), r = [rgb[0] / BASE_SKIN[0], rgb[1] / BASE_SKIN[1], rgb[2] / BASE_SKIN[2]];
    for (var i = 0, n = px.length; i < n; i += 4) { var m = md[i + 3] / 255; if (!m || !px[i + 3]) continue; for (var ch = 0; ch < 3; ch++) { var v = px[i + ch] * r[ch]; if (v > 255) v = 255; px[i + ch] = px[i + ch] + (v - px[i + ch]) * m; } }
    x.putImageData(d, 0, 0); return c;
  }
  function loadImg(src) { if (!imgCache[src]) imgCache[src] = new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); return imgCache[src]; }
  function hexRGB(h) { var n = parseInt(String(h).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function tintHair(im, w, h, color) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'); x.drawImage(im, 0, 0);
    var d = x.getImageData(0, 0, w, h), px = d.data, rgb = hexRGB(color), dark = rgb.map(function (v) { return v * .35; }), light = rgb.map(function (v) { return v + (255 - v) * .45; });
    for (var i = 0, n = px.length; i < n; i += 4) { if (!px[i + 3]) continue; var t = px[i] / 255; for (var ch = 0; ch < 3; ch++) px[i + ch] = t < .55 ? dark[ch] + (rgb[ch] - dark[ch]) * (t / .55) : rgb[ch] + (light[ch] - rgb[ch]) * ((t - .55) / .45); }
    x.putImageData(d, 0, 0); return c;
  }
  // Kıraathane katmanları (duruş 256×512 / yürüyüş 1536×512). Gardırop ürünleri: <cinsiyet>-<id>-<anim>-<yön>.webp (+ -rear, erase-…); eski ürünler p-… adlarıyla.
  // Sıra: arka parçalar → gövde (ten + silme maskeleri) → alt → üst → boyun → küpe → sakal → bıyık → saç → gözlük → eski aksesuar → şapka → bilek (masadaki karakterle aynı kurallar: A.effectiveAvatar)
  function walkLayers(av, anim, dir) {
    av = A.effectiveAvatar(av);
    var g = av.gender === 'kadin' ? 'kadin' : 'erkek', sfx = '-' + anim + '-' + dir + '.webp', erase = [], rear = [], L = [];
    var gp = function (slot) { var v = av[slot], it = A.gardrop(slot, v); if (!it) return null; if (it.erase) erase.push(K + 'erase-' + g + '-' + v + sfx); if (it.rear.indexOf(anim + '/' + dir) >= 0) rear.push({ src: K + g + '-' + v + '-' + anim + '-' + dir + '-rear.webp', hair: !!it.tint }); return { src: K + g + '-' + v + sfx, hair: !!it.tint }; };
    var pants = gp('pants'), outfit = gp('outfit'), neck = gp('necklace'), ear = gp('earring'), beard = gp('beard'), mous = gp('moustache'), hair = gp('hair'), eye = gp('eyewear'), head = gp('headwear'), wrist = gp('wrist'), mak = gp('makeup');
    L.push({ src: K + 'ch-govde-' + g + sfx, skin: true, mask: K + 'ten-' + g + sfx, erase: erase });
    if (mak && dir !== 'arka') L.push(mak); // v9.96: makyaj (ruj) tenin üstünde
    if (pants) L.push(pants);
    L.push(outfit || { src: K + 'p-' + g + '-ust-' + av.outfit + sfx });
    if (neck) L.push(neck);
    if (ear) L.push(ear);
    if (beard) L.push(beard); else if (av.beard !== 'yok' && dir !== 'arka') L.push({ src: K + 'p-' + g + '-sakal-' + av.beard + sfx, hair: true });
    if (mous) L.push(mous);
    if (hair) L.push(hair); else if (av.hair !== 'yok') L.push({ src: K + 'p-' + g + (av.acc === 'bere' || av.hatHair ? '-bere-sac-' : '-sac-') + av.hair + sfx, hair: true }); // v9.94: gardırop şapkası altında temel saç (bere uyumlu saç görseli) — masadaki karakterle aynı kural
    if (eye) L.push(eye);
    if (av.acc !== 'yok') L.push({ src: K + 'p-' + g + '-aks-' + av.acc + sfx });
    if (head) L.push(head);
    if (wrist) L.push(wrist);
    return rear.concat(L);
  }
  function composeWalk(av, anim, dir) { // Promise<url>; önbellekli (avatar + animasyon + yön)
    av = A.normAvatar(av || {}); dir = dir === 'sol' ? 'yan' : dir;
    var key = [A.GARDROP_VERSION, av.gender, av.skin, av.hair, av.hairColor, av.beard, av.outfit, av.acc, av.moustache, av.pants, av.headwear, av.eyewear, av.necklace, av.earring, av.wrist, av.makeup, anim, dir].join('|');
    if (compCache[key]) return compCache[key];
    var layers = walkLayers(av, anim, dir), w = anim === 'yuru' ? 1536 : 256, h = 512;
    compCache[key] = Promise.all(layers.map(function (l) { return Promise.all([loadImg(l.src), l.mask ? loadImg(l.mask) : null, Promise.all((l.erase || []).map(loadImg))]); })).then(function (trips) {
      var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d');
      trips.forEach(function (trip, i) { var im = trip[0]; if (!im) return; if (layers[i].hair) x.drawImage(tintHair(im, w, h, av.hairColor), 0, 0); else if (layers[i].skin) { var bc = tintSkin(im, trip[1], w, h, av.skin), masks = trip[2] || []; if (masks.length) { var bx = bc.getContext('2d'); bx.globalCompositeOperation = 'destination-out'; masks.forEach(function (m) { if (m) bx.drawImage(m, 0, 0); }); bx.globalCompositeOperation = 'source-over'; } x.drawImage(bc, 0, 0); } else x.drawImage(im, 0, 0, w, h); });
      return new Promise(function (res) { if (c.toBlob) c.toBlob(function (b) { res(b ? URL.createObjectURL(b) : c.toDataURL('image/png')); }, 'image/png'); else res(c.toDataURL('image/png')); });
    });
    return compCache[key];
  }

  // ---------- yardımcılar ----------
  function vapi(op, body, cb) { A.api('/api/venue/' + op, A.accBody(body || {}), function (e, r) { if (e) { A.toast(e.message, 'warn'); if (cb) cb(e); return; } if (r.player) A.accApply(r.player); if (r.venue) { V.venue = r.venue; V.mine = !!r.venue.mine; if (r.venue.migrated && r.venue.mine) migratedNotice(r.venue.migrated); } if (cb) cb(null, r); }); }
  // v9.68 oda ölçeği dönüşümü: sahibine bir kez açıklanır (kayıtlı yerleşim yeni ızgaraya sığdırıldı; isterse Düzenle → Örnek düzen)
  function migratedNotice(m) { var txt = __L("Kıraathane odası yeni ölçeğe geçti (daha kompakt oda, karakterle orantılı duvar ve eşyalar). Kayıtlı yerleşimin korundu{0}{1}. İstersen Düzenle → \"Örnek düzen\" ile hazır yerleşimi uygulayabilirsin.", [(m.moved ? __L("; {0} eşya en yakın uygun hücreye kaydırıldı", [(m.moved)]) : ''), (m.dropped && m.dropped.length ? __L("; yer bulunamayan {0} envantere alındı", [(m.dropped.join(', '))]) : '')]); setTimeout(function () { A.overlay(__L("<h2>Oda ölçeği yenilendi</h2><p class=\"vintro\">{0}</p><div class=\"row\"><button class=\"primary\" id=\"vMigOk\">Tamam</button></div>", [(esc(txt))])); $('vMigOk').onclick = function () { A.overlay(null); }; }, 300); vapi('migrated-seen', {}, function () {}); }
  function invItem(iid) { var inv = V.venue.inventory; for (var i = 0; i < inv.length; i++) if (inv[i].iid === iid) return inv[i]; return null; }
  function itemOf(iid) { var inv = invItem(iid); return inv ? E.venueItem(inv.item) : null; }
  function placements() { return V.edit ? V.draft : V.venue.placements; }
  function walkMap() { return E.validateLayout(placements(), V.venue.inventory, GRID).walk; }
  function fmtTime(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function tierName() { return __L("{0} (kıraathane seviyesi {1})", [(V.venue.tierName), (V.venue.tier)]); }
  // Kavram adları (arayüz genelinde aynı): Oyuncu seviyesi (profil XP) · Kıraathane seviyesi (mekânın aşaması; masa kapasitesi ve eşyalar) · İtibar (harcanmaz, yükseltme şartı) · Cüzdanım (kişisel altın) · Kıraathane kasası (işletme altını).

  // ---------- akış ----------
  V.open = function () { if (!A.ACC.on) { A.toast(__L("Kıraathane yalnız oyunun sunucu adresinde (hesapla) açılır; prototipte yok."), 'warn'); return; } vapi('get', {}, function (e, r) { if (e) return; if (!r.venue) showCreate(); else showExterior(); }); };
  V.visit = function (code) { vapi('get', { code: code }, function (e) { if (e) return; showExterior(); }); };
  // v10.06 (K151): arkadaşın kıraathanesine kodsuz giriş (Arkadaşlar → arkadaş → "Kıraathanesine Git"). Sunucu arkadaşlığı ve erişimi doğrular; kod istenmez.
  // Yanıt 12 sn içinde gelmezse açık uyarı (belirsiz bekleme yok); arkadaşın kıraathanesi yoksa açıklama; başka engelde sunucunun nedeni yazılır.
  V.visitFriend = function (id, name) {
    var my = (V.fseq = (V.fseq || 0) + 1), done = false;
    A.toast(__L("{0}kıraathaneye bağlanılıyor…", [(name ? name + ': ' : '')]), '', 1600);
    var tm = setTimeout(function () { if (done || my !== V.fseq) return; done = true; A.toast(__L("Kıraathaneye ulaşılamadı: sunucu yanıt vermedi ya da bağlantı yok. Biraz sonra yeniden dene."), 'warn', 4200); }, 12000);
    A.api('/api/venue/get', A.accBody({ friend: id }), function (e, r) {
      clearTimeout(tm); if (done || my !== V.fseq) return; done = true;
      if (e) { A.toast(/fetch|network|noServer|bağlantı|connection/i.test(e.message || '') ? __L("Kıraathaneye ulaşılamadı: bağlantını kontrol et ve yeniden dene.") : e.message, 'warn', 4200); return; }
      if (r && r.player) A.accApply(r.player);
      if (!r || !r.venue) { A.toast(__L("Bu arkadaşın henüz kıraathanesi yok."), 'warn', 3600); return; }
      V.venue = r.venue; V.mine = !!r.venue.mine; A.overlay(null); showExterior();
    });
  };
  // ---------- v10.11 (K178): Keşfet — popüler / yeni açılan herkese açık kıraathaneler; kodla git ----------
  V.discover = function (tab) {
    if (!A.ACC.on) { A.toast(__L("Keşfet yalnız oyunun sunucu adresinde (hesapla) açılır."), 'warn'); return; }
    tab = tab === 'new' ? 'new' : 'popular'; V.discTab = tab;
    A.overlay(__L("<h2>Kıraathaneleri keşfet</h2><div class=\"soctabs\" id=\"vdTabs\"><button class=\"stab{0}\" data-tab=\"popular\">🔥 Popüler</button><button class=\"stab{1}\" data-tab=\"new\">✨ Yeni açılan</button></div><div class=\"socbody vdbody\" id=\"vdBody\"><p class=\"note\">Yükleniyor…</p></div><div class=\"row left vdcode\"><input type=\"text\" id=\"vdCode\" placeholder=\"KIRAATHANE KODU\" maxlength=\"5\" autocomplete=\"off\" autocapitalize=\"characters\" spellcheck=\"false\"><button class=\"soft\" id=\"vdGo\">Kodla git</button></div><div class=\"row\"><button class=\"primary\" id=\"vdClose\">Kapat</button></div>", [(tab === 'popular' ? ' on' : ''), (tab === 'new' ? ' on' : '')]), 'socwin vdwin');
    Array.prototype.forEach.call($('vdTabs').querySelectorAll('.stab'), function (b) { b.onclick = function () { V.discover(b.dataset.tab); }; });
    $('vdClose').onclick = function () { A.overlay(null); if (A.state() !== 'VENUE') A.showLobby(); };
    $('vdGo').onclick = function () { var c = ($('vdCode').value || '').trim().toUpperCase(); if (c.length !== 5) { A.toast(__L("5 harfli kıraathane kodunu yaz."), 'warn'); return; } A.overlay(null); V.visit(c); };
    $('vdCode').onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('vdGo').click(); } };
    var my = (V.discSeq = (V.discSeq || 0) + 1);
    A.api('/api/venue/discover', A.accBody({ tab: tab }), function (e, r) {
      var el = $('vdBody'); if (!el || my !== V.discSeq) return;
      if (e) { el.innerHTML = __L("<p class=\"note\">Liste alınamadı: {0}. Biraz sonra yeniden dene.</p>", [(esc(e.message || __L("bağlantı yok")))]); return; }
      if (r.player) A.accApply(r.player);
      var rows = r.venues || [];
      if (!rows.length) { el.innerHTML = __L("<p class=\"note\">{0} Kendi kıraathaneni aç: arkadaşların kodla ya da buradan gelir.</p>", [(tab === 'new' ? __L("Yeni açılan kıraathane yok.") : __L("Henüz listelenecek kıraathane yok."))]); return; }
      el.innerHTML = rows.map(function (x) {
        var sub = __L("{0} · {1} · itibar {2}{3}", [(esc(x.tierName)), (esc(x.ownerName)), (x.reputation), (x.matches ? __L(" · {0} maç", [(x.matches)]) : '')]);
        return __L("<div class=\"srow vdrow\" data-code=\"{0}\"><div class=\"vdth\"><img src=\"{1}\" alt=\"\" loading=\"lazy\" draggable=\"false\"></div><div class=\"sinfo\"><b>{2}</b><span class=\"note\">{3}{4}</span></div><div class=\"sbtns\"><button class=\"primary mini\" data-go=\"{5}\">Git</button></div></div>", [(esc(x.code)), (exteriorThumb(x.theme)), (esc(x.name)), (x.live ? __L("<i class=\"on\"></i>şu an {0} kişi · ", [(x.live)]) : ''), (sub), (esc(x.code))]);
      }).join('');
      Array.prototype.forEach.call(el.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { var c = b.dataset.go; A.overlay(null); V.visit(c); }; });
      Array.prototype.forEach.call(el.querySelectorAll('.vdrow .vdth, .vdrow .sinfo'), function (x) { x.classList.add('tapme'); x.onclick = function () { var c = x.closest('.vdrow').dataset.code; A.overlay(null); V.visit(c); }; });
    });
  };
  function reportVenue() { // v10.11 (K178): ziyaret edilen kıraathaneyi şikâyet et (sebep "Uygunsuz ad" seçili gelir); kayıt yönetim sayfasında kıraathane koduyla
    var v = V.venue; if (!v || V.mine || !A.socReport) return;
    A.overlay(__L("<h2>Kıraathaneyi şikâyet et</h2><p class=\"note\"><b>{0}</b> · sahibi {1} · kod {2}</p><div class=\"row\"><button class=\"soft\" id=\"vrClose\">Kapat</button></div>", [(esc(v.name)), (esc(v.ownerName)), (esc(v.code))]), 'socwin');
    A.socReport(v.ownerId, __L("{0} (kıraathane)", [(v.name)]), 'kiraathane:' + v.code, 'ad');
    $('vrClose').onclick = function () { A.overlay(null); };
  }
  V.returnAfterMatch = function (code) { vapi('get', { code: code }, function (e) { if (e) { A.showLobby(); return; } showInterior(); }); };
  function showCreate() {
    A.stopSession(); A.setState('VENUE');
    var themes = VENUE_THEMES;
    A.screen(__L("<div class=\"lobbybg\"><img class=\"bg\" src=\"{0}lobi-arkaplan.webp\" alt=\"\"></div>", [(A.UI)]), 'lobby');
    A.overlay(__L("<h2>Kıraathaneni aç</h2><p class=\"note\">Küçük bir mahalle kahvesiyle başlarsın: bir okey masası, çay ocağı, iki sandalye ve kilim hazır. Kasana 200 altın ve 20 itibar yazılır. Arkadaşların kodla gelip masanda oynar; işletme gelirin kasada birikir.</p><div class=\"opt\"><label>Mekân adı (3–24)</label><input type=\"text\" id=\"vName\" maxlength=\"24\" value=\"{0}\"></div><div class=\"opt\"><label>Tema</label><div class=\"seg\" id=\"vTheme\">{1}</div></div><div class=\"row\"><button class=\"soft\" id=\"vCancel\">Vazgeç</button><button class=\"soft\" id=\"vDiscC\" title=\"Başkalarının kıraathanelerini gez\">🔎 Önce gez</button><button class=\"primary big\" id=\"vCreate\">Kıraathaneyi aç</button></div>", [(esc(defaultVenueName(A.avatar().name))), (themes.map(function (t) { return __L("<button data-t=\"{0}\"{1}>{2}</button>", [(t), (t === 'koy' ? ' class="on"' : ''), (A.THEMES[t] ? A.THEMES[t].name : t)]); }).join(''))]));
    $('vDiscC').onclick = function () { V.discover('popular'); }; // v10.11 (K178)
    var theme = 'koy';
    Array.prototype.forEach.call($('vTheme').querySelectorAll('button'), function (b) { b.onclick = function () { theme = b.dataset.t; Array.prototype.forEach.call($('vTheme').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); }); }; });
    $('vCancel').onclick = function () { A.overlay(null); A.showLobby(); };
    $('vCreate').onclick = function () { A.guard(function () { vapi('create', { name: $('vName').value, theme: theme }, function (e) { if (e) return; A.overlay(null); A.sfx('place'); A.toast(__L("Kıraathanen açıldı! Kod: {0}", [(V.venue.code)]), ''); showExterior(); }); }); };
  }

  // ---------- cephe ----------
  function showExterior() {
    A.stopSession(); A.setState('VENUE'); V.inside = false; V.edit = false; stopLoop(); leavePresence();
    var v = V.venue, art = THEME_ART[artTheme(v.theme)], d = art.door, sg = art.sign;
    A.screen(__L("<div class=\"venue ext\"><img class=\"bg\" src=\"{0}\" alt=\"\"><div class=\"sign{1}\" style=\"top:{2}px{3}\"><b style=\"font-size:{4}px\">{5}</b><span>{6} · {7} · itibar {8}</span></div><button class=\"door\" id=\"vDoor\" title=\"İçeri gir\" style=\"left:{9}px;top:{10}px;width:{11}px;height:{12}px\"><span>İçeri gir</span></button><div class=\"vhud top\"><button class=\"back\" id=\"vBack\">‹ Lobi</button><span class=\"code\">Kod: <b>{13}</b></span><button class=\"soft\" id=\"vDisc\" title=\"Başka kıraathaneleri keşfet\">🔎 Keşfet</button>{14}</div>{15}</div>", [(exteriorBg(v.theme)), (sg.box ? ' box' : ''), (sg.y), (sg.w ? ';max-width:' + sg.w + 'px' : ''), (signSize(v.name)), (esc(v.name)), (esc(v.tierName)), (esc(v.ownerName)), (v.reputation), (d.x), (d.y), (d.w), (d.h), (v.code), (V.mine ? '' : __L("<button class=\"soft\" id=\"vReport\" title=\"Kıraathaneyi şikâyet et\">⚑</button>")), (V.mine ? __L("<div class=\"vhud bottom\"><span class=\"kasa\">Kasa: <b>{0}</b> altın{1}</span>{2}<button class=\"soft\" id=\"vUpgrade\">Gelişim</button></div>", [(v.kasa.toLocaleString(window.__LOC || 'tr-TR')), (v.uncollected ? __L(" · toplanmamış <b>{0}</b>", [(v.uncollected)]) : ''), (v.uncollected ? __L("<button class=\"good\" id=\"vCollect\">Topla</button>") : '')]) : '')]), 'venue');
    preloadChar(A.avatar()); // kapıdan girince karakter ilk kareden hazır olsun
    $('vDoor').onclick = function () { A.guard(function () { A.sfx('tap'); doorTransition(function () { showInterior(); }); }); };
    $('vBack').onclick = function () { A.guard(function () { A.showLobby(); }); };
    $('vDisc').onclick = function () { V.discover(V.discTab || 'popular'); }; if ($('vReport')) $('vReport').onclick = reportVenue; // v10.11 (K178)
    if ($('vCollect')) $('vCollect').onclick = function () { vapi('collect', {}, function (e, r) { if (e) return; A.sfx('place'); A.toast(__L("Kasaya {0} altın toplandı.", [(r.collected)]), ''); showExterior(); }); };
    if ($('vUpgrade')) $('vUpgrade').onclick = function () { showProgress(); };
  }
  // içeri giriş geçişi: kamera kapıya doğru yaklaşır (cephe %15 büyür) ve kararır. (Paketteki kapı kareleri her temanın kendi kapısıyla eşleşmediği için cephe üstüne bindirilmiyor.)
  function doorTransition(then) {
    var root = document.querySelector('.venue.ext'), btn = $('vDoor'); if (!root) { then(); return; }
    var bg = root.querySelector('.bg'); bg.style.transformOrigin = (btn.offsetLeft + btn.offsetWidth / 2) + 'px ' + (btn.offsetTop + btn.offsetHeight / 2) + 'px';
    root.classList.add('entering'); var dim = document.createElement('div'); dim.className = 'vdim'; root.appendChild(dim); setTimeout(then, 380);
  }
  function preloadChar(av) { var key = charKey(av); ['durus', 'yuru'].forEach(function (anim) { ['on', 'yan', 'arka'].forEach(function (dir) { loadImg(charSrc(key, anim, dir)); if (key.indexOf('govde-') === 0) composeWalk(av, anim, dir); }); }); }
  function defaultVenueName(n) { n = String(n || __L("Misafir")).trim(); var a = __L("{0} Kıraathanesi", [(n)]); if (a.length <= 24) return a; var b = __L("{0} Kahvesi", [(n)]); if (b.length <= 24) return b; return __L("{0} Kahvesi", [(n.slice(0, 16).trim())]); } // sunucuyla aynı kural
  function signSize(name) { var n = String(name || '').length; return n <= 10 ? 44 : n <= 14 ? 36 : n <= 18 ? 30 : 24; } // tabela yazısı uzunluğa göre küçülür, gerekirse 2 satır
  function esc(t) { return String(t == null ? '' : t).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

  // ---------- iç mekân ----------
  function showInterior() {
    A.stopSession(); A.setState('VENUE'); V.inside = true; V.edit = false; V.sel = null; V.ghost = null; V.draft = null; V.others = {}; V.camFollow = false;
    var v = V.venue; GRID = gridFor(v.theme); V.grid = GRID; var door = GRID.doorCols[0];
    V.me = { gx: door, gy: GRID.rows - 1, x: 0, y: 0, path: [], facing: 1, dir: 'on', moving: false, sit: null, key: charKey(A.avatar()), avatar: A.avatar() };
    var mePos = P(V.me.gx, V.me.gy); V.me.x = mePos.x; V.me.y = mePos.y;
    V.cam = camTarget(); // ilk boyamada kamera hazır olsun (dönüşüm satır içi)
    A.screen(__L("<div class=\"venue in\" id=\"vRoot\"><div class=\"vworld\" id=\"vWorld\" style=\"transform:{0}\"><img class=\"bg\" src=\"{1}\" alt=\"\"><canvas id=\"vGrid\" width=\"1600\" height=\"900\"></canvas><div id=\"vItems\"></div><div id=\"vChars\"></div></div><div class=\"vhud top\"><button class=\"back\" id=\"vOut\">‹ Dışarı</button><span class=\"vt\"><b>{2}</b> · {3}</span><span class=\"code\">Kod: <b>{4}</b></span></div><div class=\"vhud bottom\" id=\"vBar\">{5}<button class=\"soft q\" id=\"vGuide\" title=\"Kıraathane nasıl çalışır?\">?</button><span class=\"note\" id=\"vHint\">Zemine dokun: yürü · Masaya dokun: otur · Eşyaya dokun: bak</span></div><div class=\"vedit\" id=\"vEditBar\" hidden><button class=\"soft\" id=\"veInv\">Envanter</button><span id=\"veSel\" class=\"note\">Eşya seç: taşı, döndür, kaldır</span><button class=\"soft\" id=\"veRot\" disabled>Döndür</button><button class=\"soft\" id=\"veMove\" disabled>Taşı</button><button class=\"soft\" id=\"veRemove\" disabled>Kaldır</button><button class=\"soft\" id=\"veSample\" title=\"Masa, sandalyeler, kilim ve çay ocağını hazır örnek düzene taşır\">Örnek düzen</button><button class=\"soft\" id=\"veCancel\">Vazgeç</button><button class=\"primary\" id=\"veSave\">Kaydet</button></div><div class=\"vpop\" id=\"vPop\" hidden></div></div>", [(camCss(V.cam)), (interiorBg(v.theme)), (esc(v.name)), (esc(v.tierName)), (v.code), (V.mine ? __L("<span class=\"kasa\">Kasa <b id=\"vKasa\">{0}</b></span><button class=\"soft\" id=\"vEdit\">Düzenle</button><button class=\"soft\" id=\"vShop\">Mağaza</button><button class=\"soft\" id=\"vProd\">İşletme</button><button class=\"soft\" id=\"vProg\">Gelişim</button>", [(v.kasa.toLocaleString(window.__LOC || 'tr-TR'))]) : __L("<span class=\"kasa\">{0}'in kıraathanesi</span>", [(esc(v.ownerName))]))]), 'venue');
    V.canvas = $('vGrid');
    camReset();
    renderItems(); renderChars(); drawGrid();
    bindPointer();
    $('vOut').onclick = function () { A.guard(function () { if (V.edit) { A.toast(__L("Önce düzenlemeyi kaydet ya da vazgeç."), 'warn'); return; } showExterior(); }); };
    if ($('vEdit')) $('vEdit').onclick = function () { A.guard(enterEdit); };
    if ($('vShop')) $('vShop').onclick = function () { A.guard(showShop); };
    if ($('vProd')) $('vProd').onclick = function () { A.guard(showProduction); };
    if ($('vProg')) $('vProg').onclick = function () { A.guard(function () { showProgress(); }); };
    $('vGuide').onclick = function () { A.guard(function () { showIntro(0, true); }); };
    if (V.mine && !A.settings.venueIntroDone) setTimeout(function () { if (V.inside && V.mine) showIntro(0, false); }, 600); // ilk girişte 3 adımlı tanıtım (atlanabilir; ? ile yeniden açılır)
    $('veInv').onclick = showInventory; $('veCancel').onclick = cancelEdit; $('veSave').onclick = saveEdit; $('veSample').onclick = applySample;
    $('veRot').onclick = function () { if (V.sel) { var p = draftOf(V.sel); var it = itemOf(V.sel); var sp = it && SPRITES[it.sprite]; if (sp && sp.views) p.rot = (p.rot + 1) % 4; else p.rot = p.rot === 2 ? 0 : 2; renderItems(); drawGrid(); } };
    $('veMove').onclick = function () { if (V.sel) { var p = draftOf(V.sel); V.draft = V.draft.filter(function (x) { return x.iid !== V.sel; }); V.ghost = { iid: V.sel, rot: p.rot, gx: p.gx, gy: p.gy }; V.sel = null; renderItems(); drawGrid(); updateEditBar(); } };
    $('veRemove').onclick = function () { if (V.sel) { V.draft = V.draft.filter(function (x) { return x.iid !== V.sel; }); V.sel = null; renderItems(); drawGrid(); updateEditBar(); A.toast(__L("Eşya envantere kaldırıldı."), ''); } };
    joinPresence();
    startLoop();
  }
  function draftOf(iid) { for (var i = 0; i < V.draft.length; i++) if (V.draft[i].iid === iid) return V.draft[i]; return null; }

  // eşyalar: derinlik sırası alt kenara göre (gy), zemin eşyaları (kilim) en altta
  function renderItems() {
    var root = $('vItems'); if (!root) return; root.innerHTML = '';
    var list = placements().slice();
    if (V.ghost) list.push({ iid: V.ghost.iid, gx: V.ghost.gx, gy: V.ghost.gy, rot: V.ghost.rot, ghost: true });
    list.forEach(function (p) {
      var it = itemOf(p.iid); if (!it) return; var sp = SPRITES[it.sprite]; if (!sp) return;
      var fw = it.footprint[0], fh = it.footprint[1]; if (p.rot === 1 || p.rot === 3) { var t = fw; fw = fh; fh = t; }
      var el = document.createElement('div'); el.className = 'vitem' + (p.ghost ? ' ghost' : '') + (V.sel === p.iid ? ' sel' : '') + (it.kind === 'table' ? ' table' : '') + (it.wall ? ' wall' : '') + (it.floor ? ' floor' : '');
      el.dataset.iid = p.iid;
      var pos, scale;
      if (it.wall) { var c0 = P(p.gx, 0); pos = { x: c0.x, y: GRID.wallY }; scale = c0.scale; el.style.zIndex = 1; }
      else { var base = P(p.gx + (fw - 1) / 2, p.gy + fh - 1); pos = { x: base.x, y: base.y + base.cellW * (it.floor ? 0.02 : 0.12) }; scale = base.scale; el.style.zIndex = it.floor ? 2 : 10 + Math.round(pos.y); }
      var cellW = GRID.wBot / GRID.cols * scale, w = cellW * sp.w;
      var src = sp.src, mir = false;
      if (sp.views) { src = sp.views[p.rot % 4]; mir = p.rot === 3; } else { mir = p.rot === 2; }
      el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px'; el.style.width = w + 'px';
      var running = it.kind === 'station' && !p.ghost && V.venue.production && V.venue.production.stations && V.venue.production.stations[p.iid] && V.venue.production.stations[p.iid].batchEndsAt > Date.now();
      el.innerHTML = __L("{0}<img src=\"{1}\" alt=\"\" draggable=\"false\"{2}>{3}", [(sp.halo ? __L("<img class=\"halo\" src=\"{0}\" alt=\"\" draggable=\"false\">", [(sp.halo)]) : ''), (src), (mir ? ' class="mir"' : ''), (sp.steam && running ? __L("<img class=\"steam\" src=\"{0}\" alt=\"\" draggable=\"false\">", [(sp.steam)]) : '')]);
      if (it.kind === 'table' && !p.ghost) { var tb = V.tables[p.iid]; el.innerHTML += '<span class="tag">' + (tb && tb.started && !tb.finished ? __L("Maç sürüyor") : (tb && tb.seated ? tb.seated + '/4 oturdu' : __L("Boş masa"))) + '</span>'; }
      if (it.kind === 'station' && !p.ghost && V.venue.production && V.venue.production.stations && V.venue.production.stations[p.iid]) { var st = V.venue.production.stations[p.iid]; el.innerHTML += '<span class="tag">' + (st.batchEndsAt > Date.now() ? __L("demleniyor") : __L("stok {0}", [(st.stock || 0)])) + '</span>'; }
      root.appendChild(el);
    });
  }
  function charHTML(av, name, mine) { return '<i class="shadow"></i><div class="fig"></div><span class="nm">' + esc(name) + (mine ? __L(" (sen)") : '') + '</span>'; }
  function renderChars() {
    var root = $('vChars'); if (!root) return;
    var want = {}; want.me = true; Object.keys(V.others).forEach(function (c) { want[c] = true; });
    Array.prototype.forEach.call(root.querySelectorAll('.vchar'), function (el) { if (!want[el.dataset.cid]) el.remove(); });
    function ensure(cid, av, name, mine) { var el = root.querySelector('.vchar[data-cid="' + cid + '"]'); if (!el) { el = document.createElement('div'); el.className = 'vchar' + (mine ? ' me' : ''); el.dataset.cid = cid; el.innerHTML = charHTML(av, name, mine); root.appendChild(el); } return el; }
    if (V.me) { var me = ensure('me', A.avatar(), A.avatar().name, true); placeChar(me, V.me); }
    Object.keys(V.others).forEach(function (cid) { var o = V.others[cid]; var el = ensure(cid, o.avatar, o.name, false); placeChar(el, o); });
  }
  function placeChar(el, ch) {
    var sc = P(ch.gx, ch.gy).scale, key = ch.key || charKey(ch.avatar), dir = ch.dir || 'on', anim = ch.moving ? 'yuru' : 'durus';
    el.style.left = ch.x + 'px'; el.style.top = ch.y + 'px'; el.style.zIndex = 10 + Math.round(ch.y); el.style.transform = 'scale(' + (CHAR_SCALE * sc) + ')';
    var fig = el.querySelector('.fig'), src = charSrc(key, anim, dir), st = anim + '|' + src + '|' + (dir === 'sol');
    if (fig.dataset.st !== st) {
      fig.dataset.st = st; fig.classList.toggle('walk', anim === 'yuru'); fig.classList.toggle('flip', dir === 'sol');
      if (key.indexOf('govde-') === 0) { // kendi karakter: giydirilmiş birleşik görsel (hazır olana kadar düz gövde)
        var want = st; fig.dataset.want = want; fig.style.backgroundImage = 'url(' + src + ')';
        composeWalk(ch.avatar, anim, dir).then(function (url) { if (fig.dataset.want === want && url) fig.style.backgroundImage = 'url(' + url + ')'; });
      } else fig.style.backgroundImage = 'url(' + src + ')';
    }
    var nm = el.querySelector('.nm'); if (nm) nm.style.transform = __L("translateX(-50%) scale({0})", [((1 / (CHAR_SCALE * sc)).toFixed(3))]);
  }
  function drawGrid() {
    var cv = V.canvas; if (!cv) return; var ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 1600, 900);
    if (!V.edit) return;
    var val = E.validateLayout(V.draft, V.venue.inventory, GRID);
    for (var gy = 0; gy < GRID.rows; gy++) for (var gx = 0; gx < GRID.cols; gx++) cellPoly(ctx, gx, gy, (GRID.doorCols.indexOf(gx) >= 0 && gy === GRID.rows - 1) ? 'rgba(255,200,80,.35)' : (val.walk[gx + ',' + gy] ? 'rgba(120,220,140,.14)' : 'rgba(255,255,255,.06)'), 'rgba(255,255,255,.25)');
    if (V.ghost && V.pointer) { var it = itemOf(V.ghost.iid); if (it && !it.wall) { var ok = ghostValid(); E.footprintCells(it, V.ghost).forEach(function (c) { cellPoly(ctx, c.gx, c.gy, ok ? 'rgba(90,220,120,.45)' : 'rgba(230,70,70,.5)', '#fff'); }); } }
    if (V.sel) { var sit = itemOf(V.sel), sp = draftOf(V.sel); if (sit && sp && !sit.wall) E.footprintCells(sit, sp).forEach(function (c) { cellPoly(ctx, c.gx, c.gy, 'rgba(255,220,100,.35)', '#ffd36b'); }); }
  }
  function cellPoly(ctx, gx, gy, fill, stroke) {
    var a = corner(gx, gy), b = corner(gx + 1, gy), c = corner(gx + 1, gy + 1), d = corner(gx, gy + 1);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  }
  function corner(gx, gy) { var t = gy / GRID.rows, w = GRID.wTop + (GRID.wBot - GRID.wTop) * t; return { x: GRID.x0 - w / 2 + gx * (w / GRID.cols), y: GRID.yTop + (GRID.yBot - GRID.yTop) * t }; }
  function ghostValid() { if (!V.ghost) return false; var test = V.draft.concat([{ iid: V.ghost.iid, gx: V.ghost.gx, gy: V.ghost.gy, rot: V.ghost.rot }]); return E.validateLayout(test, V.venue.inventory, GRID).ok; }

  // ---------- kamera ----------
  // İç mekân "dünya"sı (1600×900) bir kapta büyütülür ve kamera oyuncuyu izler: telefonda yüz/kıyafet/yürüyüş seçilsin diye yakınlaşır,
  // büyük ekranda oda neredeyse bütün görünür. Oranlar değişmez (eşya ve karakter aynı dünyada, aynı ölçekte büyür). Düzenle modunda tam görünüm.
  var CAM = { min: 1.1, max: 1.2, charPx: 200, charH: CHAR_SCALE * 512, lift: 150 }; // v9.68: oranlar hücre 150 px ile kuruldu; kamera masaüstünde 1,1 (oda neredeyse tam), yatay telefonda 1,25 (ön sırada karakter ~200 CSS px); lift: kamera karakterin gövde ortasına bakar
  function stageScale() { var st = document.getElementById('stage'); if (!st) return 1; var r = st.getBoundingClientRect(); return r.width ? r.width / 1600 : 1; }
  function camZoom() { if (V.edit) return 1; if (V.zoomOverride) return V.zoomOverride; var s = stageScale(); return Math.max(CAM.min, Math.min(CAM.max, CAM.charPx / (CAM.charH * s))); }
  function camTarget() {
    var z = camZoom(), vw = 1600 / z, vh = 900 / z, me = V.me || { x: 800, y: 600 }, x, y;
    if (!V.camFollow) { x = GRID.x0 - vw / 2; y = GRID.yBot + 60 - vh; } // giriş kadrajı: alt kenar kapı sırasının 60 px altı (kapıdaki karakter ve kapı sırası alt HUD'un üstünde kalır), üstte arka duvar/çay ocağı görünür; ilk yürüyüşte karakteri izlemeye geçer
    else { x = me.x - vw / 2; y = me.y - CAM.lift - vh / 2; }
    return { z: z, x: Math.max(0, Math.min(1600 - vw, x)), y: Math.max(0, Math.min(900 - vh, y)) };
  }
  function camReset() { V.cam = camTarget(); applyCam(); }
  function updateCam(dt) { var t = camTarget(), c = V.cam || t, k = 1 - Math.exp(-dt / 220); c.z += (t.z - c.z) * k; c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; if (Math.abs(t.z - c.z) < 0.001) c.z = t.z; V.cam = c; applyCam(); }
  function camCss(c) { return __L("translate({0}px,{1}px) scale({2})", [((-c.x * c.z).toFixed(2)), ((-c.y * c.z).toFixed(2)), (c.z.toFixed(4))]); }
  function applyCam() { var w = $('vWorld'); if (!w || !V.cam) return; w.style.transform = camCss(V.cam); }
  V.composeWalk = composeWalk; // mağaza/gardırop tam boy önizlemesi (duruş)
  V.walkTo = function (gx, gy) { if (V.inside && V.me && !V.edit) walkTo({ gx: gx, gy: gy }, null); }; // test/önizleme için
  V.worldToStage = function (x, y) { var c = V.cam || { x: 0, y: 0, z: 1 }; return { x: (x - c.x) * c.z, y: (y - c.y) * c.z }; };
  V.stageToWorld = function (x, y) { var c = V.cam || { x: 0, y: 0, z: 1 }; return { x: x / c.z + c.x, y: y / c.z + c.y }; };

  // ---------- dokunma / yürüme ----------
  function stagePoint(ev) { var st = document.getElementById('stage'), r = st.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * 1600, y: (ev.clientY - r.top) / r.height * 900 }; }
  function worldPoint(ev) { var p = stagePoint(ev); return V.stageToWorld(p.x, p.y); }
  function bindPointer() {
    var root = $('vRoot');
    root.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.vhud') || ev.target.closest('.vedit') || ev.target.closest('.vpop')) return;
      var pt = worldPoint(ev), itemEl = ev.target.closest('.vitem'), charEl = ev.target.closest('.vchar');
      if (V.edit) { editTap(pt, itemEl); return; }
      if (charEl && charEl.dataset.cid !== 'me') { var o = V.others[charEl.dataset.cid]; if (o) A.toast(o.name + ' burada.', ''); return; }
      if (itemEl) { interact(itemEl.dataset.iid); return; }
      var c = E.cellAt(pt.x, pt.y, GRID); if (!c) { if (pt.y < GRID.wallY + 60) return; var cw = GRID.wBot / GRID.cols; c = { gx: Math.max(0, Math.min(GRID.cols - 1, Math.floor((pt.x - (GRID.x0 - GRID.wBot / 2)) / cw))), gy: GRID.rows - 1 }; }
      walkTo(c, null);
    });
    root.addEventListener('pointermove', function (ev) { if (!V.edit || !V.ghost) return; var pt = worldPoint(ev); V.pointer = pt; var c = E.cellAt(pt.x, pt.y, GRID); var it = itemOf(V.ghost.iid); if (it && it.wall) { if (pt.y < GRID.yTop + 40) { V.ghost.gx = Math.max(0, Math.min(GRID.cols - 1, Math.floor((pt.x - (GRID.x0 - GRID.wTop / 2)) / (GRID.wTop / GRID.cols)))); V.ghost.gy = 0; } } else if (c) { var fw = it.footprint[0], fh = it.footprint[1]; if (V.ghost.rot % 2) { var t = fw; fw = fh; fh = t; } V.ghost.gx = Math.max(0, Math.min(GRID.cols - fw, c.gx - Math.floor(fw / 2))); V.ghost.gy = Math.max(0, Math.min(GRID.rows - fh, c.gy - (fh - 1))); } renderItems(); drawGrid(); });
  }
  function walkTo(c, then) {
    V.camFollow = true;
    var walk = walkMap(), from = { gx: V.me.gx, gy: V.me.gy };
    var path = E.findPath(from, c, walk); if (!path) { A.toast(__L("Oraya yol yok."), ''); return; }
    V.me.path = path; V.me.then = then; V.me.moving = path.length > 0; if (!path.length && then) then();
  }
  var lastSent = 0;
  function startLoop() { stopLoop(); var last = performance.now(); function frame(now) { var dt = Math.min(50, now - last); last = now; step(V.me, dt, true); Object.keys(V.others).forEach(function (cid) { step(V.others[cid], dt, false); }); renderChars(); updateCam(dt); V.raf = requestAnimationFrame(frame); } V.raf = requestAnimationFrame(frame); }
  function stopLoop() { if (V.raf) cancelAnimationFrame(V.raf); V.raf = 0; }
  function step(ch, dt, mine) {
    if (!ch || !ch.path || !ch.path.length) { if (ch && ch.moving) { ch.moving = false; if (mine && ch.then) { var f = ch.then; ch.then = null; f(); } } return; }
    var target = P(ch.path[0].gx, ch.path[0].gy), speed = 0.28 * dt * (0.6 + 0.4 * target.scale); // px/ms
    var dx = target.x - ch.x, dy = target.y - ch.y, d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(dx) > 2) ch.facing = dx < 0 ? -1 : 1;
    if (Math.abs(dx) >= Math.abs(dy) * 1.2) ch.dir = dx < 0 ? 'sol' : 'yan'; else if (Math.abs(dy) > 1) ch.dir = dy < 0 ? 'arka' : 'on';
    if (d <= speed) { ch.x = target.x; ch.y = target.y; ch.gx = ch.path[0].gx; ch.gy = ch.path[0].gy; ch.path.shift(); if (mine) sendPos(); }
    else { ch.x += dx / d * speed; ch.y += dy / d * speed; }
    ch.moving = true;
  }
  function sendPos() { var now = Date.now(); if (now - lastSent < 90) return; lastSent = now; A.NET.send({ t: 'vmove', gx: V.me.gx, gy: V.me.gy }); }

  // ---------- etkileşim ----------
  function nearCell(iid) { var p = null; placements().forEach(function (x) { if (x.iid === iid) p = x; }); var it = itemOf(iid); if (!p || !it) return null; if (it.wall) return { gx: p.gx, gy: 0 }; var cells = E.footprintCells(it, p), walk = walkMap(), best = null; cells.forEach(function (c) { [[0, 1], [1, 0], [-1, 0], [0, -1]].forEach(function (d) { var nx = c.gx + d[0], ny = c.gy + d[1]; if (nx < 0 || ny < 0 || nx >= GRID.cols || ny >= GRID.rows || !walk[nx + ',' + ny]) return; var dd = Math.abs(nx - V.me.gx) + Math.abs(ny - V.me.gy); if (!best || dd < best.d) best = { gx: nx, gy: ny, d: dd }; }); }); return best; }
  function interact(iid) {
    var it = itemOf(iid); if (!it) return; var near = nearCell(iid);
    var go = function (fn) { if (!near) { fn(); return; } if (near.gx === V.me.gx && near.gy === V.me.gy) fn(); else walkTo(near, fn); };
    if (it.kind === 'table') go(function () { showTablePop(iid); });
    else if (it.kind === 'station') go(function () { if (V.mine) showProduction(iid); else showOrderPop(iid); });
    else go(function () { A.toast(it.name + ': ' + it.desc, ''); });
  }
  function pop(html) { var p = $('vPop'); p.hidden = false; p.innerHTML = html + '<button class="x" id="vPopX">✕</button>'; $('vPopX').onclick = function () { p.hidden = true; }; }
  function showTablePop(iid) {
    var tb = V.tables[iid], mode = V.modeHands || A.settings.mode || 1;
    if (tb && tb.started && !tb.finished) { pop(__L("<b>Masa</b><p>Bu masada maç sürüyor ({0} oyuncu). Bitince oturabilirsin.</p>", [(tb.seated)])); return; }
    if (tb && tb.finished && tb.seated) { pop(__L("<b>Masa</b><p>Bu masada maç yeni bitti; {0} oyuncu hâlâ masada (rövanş kararı bekleniyor olabilir). Kalkınca oturabilirsin.</p>", [(tb.seated)])); return; } // v9.96 (K123)
    pop(__L("<b>Okey masası</b><p>{0} Oturunca oda açılır; arkadaşların aynı masaya dokunarak ya da oda koduyla katılır. Boş koltuklar kurucunun onayıyla botla dolar.</p><div class=\"seg\" id=\"vMode\">{1}</div><div class=\"row\"><button class=\"primary\" id=\"vSit\">Masaya otur</button></div>", [(tb && tb.seated ? __L("{0}/4 oyuncu oturdu, oyun başlamadı.", [(tb.seated)]) : __L("Masa boş.")), ([1, 6, 12].map(function (m) { return __L("<button data-m=\"{0}\"{1}>{2} El</button>", [(m), (m === mode ? ' class="on"' : ''), (m)]); }).join(''))]));
    Array.prototype.forEach.call($('vMode').querySelectorAll('button'), function (b) { b.onclick = function () { V.modeHands = parseInt(b.dataset.m); Array.prototype.forEach.call($('vMode').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); }); }; });
    $('vSit').onclick = function () { A.guard(function () { sit(iid, V.modeHands || mode); }); };
  }
  function sit(iid, hands) {
    $('vPop').hidden = true; var av = A.matchAvatar ? A.matchAvatar() : A.avatar(); // masaya oturma: deneme Masa Giriş Skini de gider
    A.settings.mode = hands; A.saveSettings();
    var send = function () { A.NET.send({ t: 'vsit', code: V.venue.code, iid: iid, totalHands: hands, name: av.name, avatar: av, skins: A.skinCount(), acc: A.ACC.auth }); };
    if (A.NET.ws && A.NET.ws.readyState === 1) send(); else A.NET.connect(A.settings.server || (A.srvHost ? A.srvHost() : location.host), send);
  }
  function showOrderPop(iid) {
    var st = V.venue.stock && V.venue.stock[iid], rc = E.CONFIG.venue.recipes[st ? st.recipe : 'cay'];
    pop(__L("<b>Çay ocağı</b><p>{0}</p>{1}", [(st && st.stock ? __L("Stokta {0} servis. Bir {1} {2} altın.", [(st.stock), (st.recipe === 'kahve' ? __L("kahve") : __L("çay")), (rc.price)]) : __L("Stok yok; sahibi parti demlemeli.")), (st && st.stock ? __L("<div class=\"row\"><button class=\"primary\" id=\"vOrder\">Çay al ({0} altın)</button></div>", [(rc.price)]) : '')]));
    if ($('vOrder')) $('vOrder').onclick = function () { vapi('order', { code: V.venue.code, iid: iid }, function (e, r) { if (e) return; A.sfx('place'); A.toast(__L("Afiyet olsun! {0} altın ödendi.", [(r.order.price)]), ''); $('vPop').hidden = true; renderItems(); }); };
  }

  // ---------- editör ----------
  function enterEdit() { if (!V.mine) return; V.edit = true; V.draft = V.venue.placements.map(function (p) { return { iid: p.iid, gx: p.gx, gy: p.gy, rot: p.rot || 0 }; }); V.sel = null; V.ghost = null; $('vEditBar').hidden = false; $('vBar').hidden = true; $('vPop').hidden = true; renderItems(); drawGrid(); updateEditBar(); A.toast(__L("Düzenleme: eşyaya dokun → taşı/döndür/kaldır; Envanter → yerleştir."), ''); }
  function exitEdit() { V.edit = false; V.draft = null; V.sel = null; V.ghost = null; V.pointer = null; $('vEditBar').hidden = true; $('vBar').hidden = false; renderItems(); drawGrid(); }
  function cancelEdit() { exitEdit(); A.toast(__L("Değişiklikler geri alındı."), ''); }
  // Örnek düzen: başlangıç şablonu (masa ortada, sandalyeler koltuklarda, kilim altında, çay ocağı arka duvarda). Kayıtlı yerleşim yalnız Kaydet'e basınca değişir; şablon dışındaki eşyalar envantere alınır.
  function applySample() {
    if (!V.edit) return;
    var sample = E.starterLayout(V.venue.inventory), inSample = {}; sample.forEach(function (p) { inSample[p.iid] = true; });
    var others = V.draft.filter(function (p) { return !inSample[p.iid]; }).length;
    if (!confirm(__L("Örnek düzen uygulanacak: masa, sandalyeler, kilim ve çay ocağı hazır yerlerine taşınır{0}. Kaydet'e basana kadar kalıcı olmaz. Devam?", [(others ? __L("; diğer {0} eşya envantere alınır (sonra yeniden yerleştirebilirsin)", [(others)]) : '')]))) return;
    V.draft = sample.map(function (p) { return { iid: p.iid, gx: p.gx, gy: p.gy, rot: p.rot }; }); V.sel = null; V.ghost = null; renderItems(); drawGrid(); updateEditBar();
    A.toast(__L("Örnek düzen yüklendi. Beğendiysen Kaydet."), '');
  }
  function updateEditBar() { var on = !!V.sel; $('veRot').disabled = !on; $('veMove').disabled = !on; $('veRemove').disabled = !on; $('veSel').textContent = V.ghost ? __L("Yerleştir: zemine dokun (yeşil = uygun). {0}", [((itemOf(V.ghost.iid) || {}).name)]) : (on ? __L("{0} seçili", [((itemOf(V.sel) || {}).name)]) : __L("Eşya seç: taşı, döndür, kaldır")); }
  function editTap(pt, itemEl) {
    if (V.ghost) { var it = itemOf(V.ghost.iid); var c = E.cellAt(pt.x, pt.y, GRID); if (it && (it.wall || c)) { V.pointer = pt; if (!it.wall && c) { var fw = it.footprint[0], fh = it.footprint[1]; if (V.ghost.rot % 2) { var t = fw; fw = fh; fh = t; } V.ghost.gx = Math.max(0, Math.min(GRID.cols - fw, c.gx - Math.floor(fw / 2))); V.ghost.gy = Math.max(0, Math.min(GRID.rows - fh, c.gy - (fh - 1))); } if (ghostValid()) { V.draft.push({ iid: V.ghost.iid, gx: V.ghost.gx, gy: V.ghost.gy, rot: V.ghost.rot }); A.sfx('place'); V.ghost = null; V.pointer = null; } else { var r = E.validateLayout(V.draft.concat([{ iid: V.ghost.iid, gx: V.ghost.gx, gy: V.ghost.gy, rot: V.ghost.rot }]), V.venue.inventory, GRID); A.toast(r.errors[0] || __L("Buraya konamaz."), 'warn'); } } renderItems(); drawGrid(); updateEditBar(); return; }
    if (itemEl && !itemEl.classList.contains('ghost')) { V.sel = itemEl.dataset.iid; } else V.sel = null;
    renderItems(); drawGrid(); updateEditBar();
  }
  function showInventory() {
    var placed = {}; V.draft.forEach(function (p) { placed[p.iid] = true; });
    var free = V.venue.inventory.filter(function (i) { return !placed[i.iid]; });
    pop(__L("<b>Envanter (yerleşmemiş)</b>{0}", [(free.length ? '<div class="vlist">' + free.map(function (i) { var it = E.venueItem(i.item); return __L("<button class=\"vrow\" data-iid=\"{0}\"><img src=\"{1}\" alt=\"\"><span>{2}<small>{3}×{4}{5}</small></span></button>", [(i.iid), ((SPRITES[it.sprite] || {}).src), (esc(it.name)), (it.footprint[0]), (it.footprint[1]), (it.wall ? __L(" · duvar") : '')]); }).join('') + '</div>' : __L("<p>Boş. Mağazadan eşya al.</p>"))]));
    Array.prototype.forEach.call($('vPop').querySelectorAll('.vrow'), function (b) { b.onclick = function () { var it = itemOf(b.dataset.iid); V.ghost = { iid: b.dataset.iid, gx: Math.floor(GRID.cols / 2), gy: it.wall ? 0 : 3, rot: 0 }; V.sel = null; $('vPop').hidden = true; V.pointer = { x: 800, y: 500 }; renderItems(); drawGrid(); updateEditBar(); }; });
  }
  function saveEdit() {
    if (V.ghost) { A.toast(__L("Önce elindeki eşyayı yerleştir ya da Vazgeç."), 'warn'); return; }
    var r = E.validateLayout(V.draft, V.venue.inventory, GRID); if (!r.ok) { A.toast(r.errors[0], 'warn'); return; }
    vapi('layout', { placements: V.draft, version: V.venue.layoutVersion }, function (e) { if (e) { if (/başka bir cihazda/.test(e.message)) vapi('get', {}, function () { exitEdit(); }); return; } A.sfx('place'); A.toast(__L("Yerleşim kaydedildi."), ''); exitEdit(); if (V.me) { var walk = walkMap(); if (!walk[V.me.gx + ',' + V.me.gy]) { var d = GRID.doorCols[0]; V.me.gx = d; V.me.gy = GRID.rows - 1; var pp = P(d, GRID.rows - 1); V.me.x = pp.x; V.me.y = pp.y; } } });
  }

  // ---------- mağaza / işletme / yükseltme ----------
  function showShop() {
    var v = V.venue, cats = { masa: __L("Masa"), uretim: __L("Üretim"), dekor: __L("Dekor"), duvar: __L("Duvar"), eglence: __L("Eğlence") };
    var owned = {}; v.inventory.forEach(function (i) { owned[i.item] = (owned[i.item] || 0) + 1; });
    var rows = E.VENUE_ITEMS.map(function (it) { var sp = SPRITES[it.sprite] || {}; var lock = it.locked ? __L("Yakında") : (it.tier > v.tier ? __L("Kıraathane seviyesi {0} gerekir", [(it.tier)]) : ''); var short = !lock && v.kasa < it.price ? it.price - v.kasa : 0; return __L("<div class=\"vrow shop{0}\"><img src=\"{1}\" alt=\"\"><span><b>{2}</b> <small>{3} · {4}×{5}{6}</small><small>{7}</small>{8}</span><em>{9} altın</em>{10}</div>", [(lock ? ' locked' : ''), (sp.src), (esc(it.name)), (cats[it.cat]), (it.footprint[0]), (it.footprint[1]), (owned[it.id] ? __L(" · sende {0}", [(owned[it.id])]) : ''), (esc(it.desc)), (short ? __L("<small class=\"warn\">Kasada {0} altın eksik: çay satışı/ev sahipliği geliri ya da \"Kasaya yatır\".</small>", [(short.toLocaleString(window.__LOC || 'tr-TR'))]) : ''), (it.price.toLocaleString(window.__LOC || 'tr-TR')), (lock ? '<i>' + lock + '</i>' : __L("<button class=\"primary\" data-buy=\"{0}\"{1}>Al</button>", [(it.id), (short ? __L(" disabled title=\"Kasada yeterli altın yok\"") : '')]))]); }).join('');
    A.overlay(__L("<div class=\"row\" style=\"justify-content:space-between;align-items:center\"><h2 style=\"margin:0\">Kıraathane mağazası</h2><span class=\"coins\"><i></i>kasa {0}</span></div><p class=\"note\">Eşyalar <b>kıraathane kasasından</b> alınır ve envantere girer; \"Düzenle\" ile yerleştirilir. Cüzdanından kasaya aktarım <b>tek yönlüdür</b> (kasadan cüzdana geri çekilemez).</p><div class=\"vlist\">{1}</div><div class=\"row left\"><input type=\"number\" id=\"vDep\" min=\"1\" placeholder=\"Kasaya yatır (altın)\" style=\"width:200px\"><button class=\"soft\" id=\"vDepBtn\">Kasaya yatır</button><span class=\"note\">Cüzdanım: {2} altın</span></div><div class=\"row\"><button class=\"soft\" id=\"vShopX\">Kapat</button></div>", [(v.kasa.toLocaleString(window.__LOC || 'tr-TR')), (rows), (A.wardrobe.coins.toLocaleString(window.__LOC || 'tr-TR'))]));
    $('vShopX').onclick = function () { A.overlay(null); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-buy]'), function (b) { b.onclick = function () { A.guard(function () { vapi('buy', { item: b.dataset.buy }, function (e) { if (e) return; A.sfx('place'); A.toast(__L("Alındı; Düzenle → Envanter ile yerleştir."), ''); showShop(); refreshHud(); }); }); }; });
    $('vDepBtn').onclick = function () { var amt = parseInt($('vDep').value); if (!(amt > 0)) return; if (!confirm(__L("{0} altın cüzdanından kıraathane kasasına aktarılacak. Aktarım tek yönlüdür: kasadaki altın cüzdana geri çekilemez, yalnız eşya, üretim ve yükseltmede kullanılır. Onaylıyor musun?", [(amt)]))) return; vapi('deposit', { amount: amt }, function (e) { if (e) return; A.sfx('place'); A.toast(__L("Kasaya {0} altın aktarıldı (cüzdandan düştü).", [(amt)]), ''); showShop(); refreshHud(); }); };
  }
  function refreshHud() { if ($('vKasa') && V.venue) $('vKasa').textContent = V.venue.kasa.toLocaleString(window.__LOC || 'tr-TR'); renderItems(); }
  function showProduction(focusIid) {
    var v = V.venue, st = v.production.stations || {}, keys = Object.keys(st).filter(function (k) { return st[k].active; }), now = Date.now();
    var rows = keys.map(function (k) { var s = st[k], rc = E.CONFIG.venue.recipes[s.recipe]; var running = s.batchEndsAt > now; return __L("<div class=\"vrow\"><span><b>{0}</b><small>Stok {1}/{2} servis · satış {3} altın (kasaya {4}) · NPC talebi saatte {5}</small><small>{6}</small></span>{7}</div>", [(s.recipe === 'cay' ? __L("Çay ocağı") : __L("Kahve makinesi")), (s.stock || 0), (rc.stockMax), (rc.price), (rc.price - rc.systemFee), (rc.npcPerHour), (running ? __L("Parti demleniyor: {0} kaldı", [(fmtTime(s.batchEndsAt - now))]) : __L("Parti: {0} dk, {1} servis, girdi {2} altın", [(rc.minutes), (rc.servings), (rc.inputCost)])), (running ? __L("<i>demleniyor</i>") : __L("<button class=\"primary\" data-prod=\"{0}\">Parti başlat</button>", [(k)]))]); }).join('');
    var cap = E.CONFIG.venue.npcProfitDailyMax[v.tier - 1], npc = v.production.npc || { profit: 0, sold: 0 }, rcc = E.CONFIG.venue.recipes.cay, net = rcc.price - rcc.systemFee;
    var cycle = __L("<div class=\"vcycle\"><span><b>1 · Hazırla</b><small>{0} altın girdi (kasadan) · {1} dk · {2} servis</small></span><i>→</i><span><b>2 · Satış</b><small>ziyaretçiler ve mahalleli alır: servis {3} altın, {4} altın sistem payı → kasaya {5}</small></span><i>→</i><span><b>3 · Topla</b><small>biriken geliri \"Topla\" ile kasaya geçir</small></span></div><p class=\"note\">Bir parti beklenen: {6} × {7} = {8} altın gelir, girdi {9} → net <b>+{10} altın</b>. Mahalleli (NPC) satışı saatte en çok {11} servis ve günde en çok <b>{12} altın kâr</b> (kıraathane seviyesine göre artar); çevrimdışıyken en çok {13} saat işler. Ziyaretçi alımları bu sınıra girmez.</p>", [(rcc.inputCost), (rcc.minutes), (rcc.servings), (rcc.price), (rcc.systemFee), (net), (rcc.servings), (net), (rcc.servings * net), (rcc.inputCost), (rcc.servings * net - rcc.inputCost), (rcc.npcPerHour), (cap), (E.CONFIG.venue.offlineHours)]);
    A.overlay(__L("<h2>İşletme</h2>{0}<p class=\"note\">Kıraathane kasası <b>{1}</b> · toplanmamış gelir <b>{2}</b> · bugün mahalleli kârı {3}/{4} altın ({5} servis).</p><div class=\"vlist\">{6}</div><div class=\"row\"><button class=\"good\" id=\"vCol\"{7}>Topla ({8})</button><button class=\"soft\" id=\"vUp\">Gelişim</button><button class=\"soft\" id=\"vProdX\">Kapat</button></div>", [(cycle), (v.kasa.toLocaleString(window.__LOC || 'tr-TR')), (v.uncollected || 0), (Math.round(npc.profit)), (cap), (npc.sold), (rows || __L("<p>Yerleştirilmiş üretim noktası yok: Düzenle → Envanter ile çay ocağını zemine koy.</p>")), (v.uncollected ? '' : ' disabled'), (v.uncollected || 0)]));
    $('vProdX').onclick = function () { A.overlay(null); };
    $('vUp').onclick = function () { showProgress(); };
    $('vCol').onclick = function () { vapi('collect', {}, function (e, r) { if (e) return; A.sfx('place'); A.toast(__L("Kasaya {0} altın toplandı.", [(r.collected)]), ''); showProduction(); refreshHud(); }); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-prod]'), function (b) { b.onclick = function () { A.guard(function () { vapi('produce', { iid: b.dataset.prod }, function (e) { if (e) return; A.sfx('place'); A.toast(__L("Parti başladı: {0} altın kasadan düştü; {1} dk sonra {2} servis stoğa girer.", [(rcc.inputCost), (rcc.minutes), (rcc.servings)]), ''); showProduction(); refreshHud(); }); }); }; });
  }
  // ---------- Kıraathane Gelişimi: seviye, masa kapasitesi, itibar/kasa ilerlemesi, açılacaklar, sıradaki adım ----------
  function placedTables() { var n = 0; (V.venue.placements || []).forEach(function (p) { var it = itemOf(p.iid); if (it && it.kind === 'table') n++; }); return n; }
  function unplacedItem(kind) { var placed = {}; (V.venue.placements || []).forEach(function (p) { placed[p.iid] = true; }); var hit = null; (V.venue.inventory || []).forEach(function (i) { var it = E.venueItem(i.item); if (!placed[i.iid] && it && it.kind === kind && !hit) hit = i; }); return hit; }
  function nextUnlocks(nextTier) { return E.VENUE_ITEMS.filter(function (it) { return it.tier === nextTier && !it.locked; }).map(function (it) { return it.name; }); }
  // Sıradaki adım: duruma göre tek öneri {title, gain, btn, go}
  function nextStep() {
    var v = V.venue, n = v.next, st = v.production.stations || {}, keys = Object.keys(st).filter(function (k) { return st[k].active; }), now = Date.now();
    var hg = E.CONFIG.venue.hostGold, rep = E.CONFIG.venue.hostReputation, rc = E.CONFIG.venue.recipes.cay;
    if (v.uncollected > 0) return { title: __L("Geliri topla"), gain: __L("{0} altın kasaya girer", [(v.uncollected)]), btn: __L("Topla"), go: function () { vapi('collect', {}, function (e, r) { if (e) return; A.sfx('place'); A.toast(__L("Kasaya {0} altın toplandı.", [(r.collected)]), ''); showProgress(); refreshHud(); }); } };
    if (!keys.length) { var inv = unplacedItem('station'); if (inv) return { title: __L("Çay ocağını yerleştir"), gain: __L("Üretim başlayabilir: parti başına net +{0} altın", [(rc.servings * (rc.price - rc.systemFee) - rc.inputCost)]), btn: __L("Düzenle"), go: function () { A.overlay(null); if (!V.inside) { showInterior(); } enterEdit(); } }; }
    var idle = keys.filter(function (k) { return !(st[k].batchEndsAt > now) && (st[k].stock || 0) === 0; });
    if (idle.length && v.kasa >= rc.inputCost) return { title: __L("İlk çay partini hazırla"), gain: __L("{0} dk sonra {1} servis; satılınca kasaya {2} altın (girdi {3})", [(rc.minutes), (rc.servings), (rc.servings * (rc.price - rc.systemFee)), (rc.inputCost)]), btn: __L("İşletme"), go: function () { showProduction(); } };
    if (placedTables() === 0) { var t = unplacedItem('table'); if (t) return { title: __L("Masanı yerleştir"), gain: __L("Arkadaşların masanda oynar; uygun maçlar itibar ve kasaya altın getirir"), btn: __L("Düzenle"), go: function () { A.overlay(null); enterEdit(); } }; var mp = (E.venueItem('v_masa') || {}).price || 0; if (v.kasa >= mp) return { title: __L("Kıraathanende bir masa aç"), gain: __L("Okey masası {0} kasa altını; her uygun maç +{1} itibar ve kasaya {2}/{3}/{4} altın (1/6/12 El)", [(mp.toLocaleString(window.__LOC || 'tr-TR')), (rep), (hg[1]), (hg[6]), (hg[12])]), btn: __L("Mağaza"), go: function () { showShop(); } }; }
    if (n && v.reputation < n.reputation) return { title: __L("Bir sonraki seviye için itibar kazan"), gain: __L("{0} itibar eksik. Masanda en az 2 gerçek oyuncuyla (biri sen olmayan), 3 dakikadan uzun süren ve biten her maç +{1} itibar ve kasaya {2}/{3}/{4} altın (günde en çok {5} maç, {6} itibar). İlk arkadaş maçı bir kez +{7} itibar.", [(n.reputation - v.reputation), (rep), (hg[1]), (hg[6]), (hg[12]), (E.CONFIG.venue.hostDailyMatches), (E.CONFIG.venue.hostDailyReputationMax), (E.CONFIG.venue.firstFriendMatch.reputation)]), btn: __L("Kodu göster"), go: function () { A.toast(__L("Arkadaşların lobiden Kıraathanem → kodla ziyaret: {0} (koda dokunarak masana otururlar).", [(v.code)]), ''); } };
    if (n && v.kasa < n.price) return { title: __L("Yükseltme için kasayı doldur"), gain: __L("{0} altın eksik. Çay satışı ve ev sahipliği geliri kasaya işler; cüzdanından aktarım da yapabilirsin (tek yönlü).", [((n.price - v.kasa).toLocaleString(window.__LOC || 'tr-TR'))]), btn: __L("Mağaza"), go: function () { showShop(); } };
    if (n) return { title: __L("Kıraathaneni yükselt"), gain: __L("{0}: en çok {1} masa{2}", [(n.name), (n.tables), (nextUnlocks(n.tier).length ? __L(", yeni eşyalar: {0}", [(nextUnlocks(n.tier).join(', '))]) : '')]), btn: __L("Yükselt"), go: function () { doUpgrade(); } };
    return { title: __L("En üst seviyedesin"), gain: __L("Arkadaşlarınla oynamaya ve işletmeyi büyütmeye devam et"), btn: __L("İşletme"), go: function () { showProduction(); } };
  }
  function bar(cur, max) { var pct = max > 0 ? Math.max(0, Math.min(100, Math.round(cur / max * 100))) : 100; return __L("<div class=\"pbar\"><i style=\"width:{0}%\"></i><b>{1} / {2}</b></div>", [(pct), (cur.toLocaleString(window.__LOC || 'tr-TR')), (max.toLocaleString(window.__LOC || 'tr-TR'))]); }
  function showProgress() {
    var v = V.venue, n = v.next, used = placedTables(), step = nextStep();
    var canUp = n && v.reputation >= n.reputation && v.kasa >= n.price;
    var missing = n ? [v.reputation < n.reputation ? (n.reputation - v.reputation) + ' itibar' : null, v.kasa < n.price ? __L("{0} kasa altını", [((n.price - v.kasa).toLocaleString(window.__LOC || 'tr-TR'))]) : null].filter(Boolean).join(' · ') : '';
    var html = __L("<h2>Kıraathane Gelişimi</h2><div class=\"vrow\"><span><b>{0}</b><small>Kıraathane seviyesi {1} · {2}</small><small>Masalar: {3} / {4} kapasite{5}</small></span><button class=\"soft\" id=\"vRenBtn\">Adı değiştir</button></div><div class=\"vrow\" id=\"vRenRow\" hidden><span><small>Yeni ad (3–24 karakter; ücretsiz)</small><input type=\"text\" id=\"vRenIn\" maxlength=\"24\" value=\"{6}\" style=\"width:100%;max-width:320px\"></span><button class=\"primary\" id=\"vRenOk\">Kaydet</button></div><div class=\"vrow step\"><span><b>Sıradaki adım: {7}</b><small>{8}</small></span><button class=\"primary\" id=\"vStepGo\">{9}</button></div>{10}<p class=\"note\"><b>Kavramlar:</b> Oyuncu seviyesi = profilinin XP ile ilerleyen seviyesi · Kıraathane seviyesi = mekânının aşaması (masa kapasitesi, eşyalar) · İtibar = yükseltme için gereken, uygun ev sahipliği maçlarıyla kazanılan ve harcanmayan birikim · Cüzdanım = kişisel altının · Kıraathane kasası = eşya, üretim ve yükseltme altını (cüzdandan tek yönlü aktarılır).</p><div class=\"row\"><button class=\"soft\" id=\"vProgGuide\">Nasıl çalışır?</button><button class=\"soft\" id=\"vUpX\">Kapat</button></div>", [(esc(v.name)), (v.tier), (esc(v.tierName)), (used), (v.tables), (used < v.tables ? __L(" ({0} masa daha açabilirsin)", [(v.tables - used)]) : __L(" (kapasite dolu; yükseltince artar)")), (esc(v.name)), (esc(step.title)), (esc(step.gain)), (esc(step.btn)), (n ? __L("<div class=\"vrow\"><span><b>Sonraki seviye: {0}</b><small>İtibar (harcanmaz; uygun maçlarla birikir)</small>{1}<small>Yükseltme bedeli (kıraathane kasasından)</small>{2}<small>Yükseltince: en çok {3} masa{4}</small>{5}</span><button class=\"primary\" id=\"vUpGo\"{6}>Yükselt</button></div>", [(esc(n.name)), (bar(v.reputation, n.reputation)), (bar(v.kasa, n.price)), (n.tables), (nextUnlocks(n.tier).length ? __L(" · açılan eşyalar: {0}", [(esc(nextUnlocks(n.tier).join(', ')))]) : ''), (canUp ? '' : __L("<small class=\"warn\">Eksik: {0}</small>", [(missing)])), (canUp ? '' : ' disabled')]) : __L("<div class=\"vrow\"><span><b>En üst seviyedesin.</b></span></div>"))]);
    A.overlay(html);
    $('vUpX').onclick = function () { A.overlay(null); };
    $('vProgGuide').onclick = function () { showIntro(0, true); };
    $('vRenBtn').onclick = function () { var r = $('vRenRow'); r.hidden = !r.hidden; if (!r.hidden) { $('vRenIn').focus(); $('vRenIn').select(); } };
    $('vRenOk').onclick = function () { var nm = $('vRenIn').value.replace(/\s+/g, ' ').trim(); if (nm.length < 3) { A.toast(__L("Mekân adı en az 3 karakter olmalı."), 'bad'); return; } if (nm.length > 24) { A.toast(__L("Mekân adı en çok 24 karakter olabilir."), 'bad'); return; } A.guard(function () { vapi('rename', { name: nm }, function (e) { if (e) return; A.sfx('place'); A.toast(__L("Mekân adı değişti: {0}", [(V.venue.name)]), ''); A.overlay(null); if (V.inside) showInterior(); else showExterior(); }); }); };
    $('vStepGo').onclick = function () { A.guard(function () { step.go(); }); };
    if ($('vUpGo')) $('vUpGo').onclick = function () { A.guard(doUpgrade); };
  }
  function doUpgrade() {
    var before = V.venue.tables;
    vapi('upgrade', {}, function (e) { if (e) return; A.sfx('place'); var v = V.venue; A.toast(__L("Tebrikler: {0}! Masa kapasitesi {1} → {2}{3}.", [(v.tierName), (before), (v.tables), (nextUnlocks(v.tier).length ? __L(" · açılan eşyalar: {0}", [(nextUnlocks(v.tier).join(', '))]) : '')]), ''); A.overlay(null); if (V.inside) showInterior(); else showExterior(); });
  }
  function showUpgrade() { showProgress(); }
  // ---------- ilk giriş tanıtımı: Mekânını tanı → Geliştir → Arkadaşlarınla oyna (atlanabilir; ? ile yeniden) ----------
  function showIntro(i, manual) {
    var v = V.venue, rc = E.CONFIG.venue.recipes.cay, hg = E.CONFIG.venue.hostGold, rep = E.CONFIG.venue.hostReputation, n = v.next;
    var steps = [
      { t: __L("1 · Mekânını tanı"), b: __L("Burası senin kıraathanen: kendi mekânını kur, zevkine göre döşe, arkadaşlarınla aynı masada oyna.<br>Zemine dokun → yürü · Masaya dokun → otur (oda açılır) · <b>Düzenle</b> → eşyaları taşı/döndür · <b>Mağaza</b> → yeni eşya (kıraathane kasasıyla)."), hl: ['vEdit', 'vShop'] },
      { t: __L("2 · Geliştir"), b: __L("<b>İşletme:</b> çay ocağında parti hazırla ({0} altın, {1} dk, {2} servis) → ziyaretçiler ve mahalleli çay alır → geliri <b>Topla</b>, kasaya girer.<br><b>Kıraathane kasası</b> eşya, üretim ve yükseltme içindir; <b>cüzdanından</b> kasaya aktarım tek yönlüdür.", [(rc.inputCost), (rc.minutes), (rc.servings)]), hl: ['vProd'] },
      { t: __L("3 · Arkadaşlarınla oyna, seviye atla"), b: __L("Kodun <b>{0}</b>. Masanda en az 2 gerçek oyuncuyla biten uygun maçlar <b>+{1} itibar</b> ve kasaya {2}/{3}/{4} altın (1/6/12 El) getirir. İtibar harcanmaz; <b>kıraathane seviyesi</b> için gerekir{5}. Durumunu <b>Gelişim</b>'de izle.", [(v.code), (rep), (hg[1]), (hg[6]), (hg[12]), (n ? __L(" (sonraki: {0} → {1} itibar + {2} kasa altını, en çok {3} masa{4})", [(n.name), (n.reputation), (n.price.toLocaleString(window.__LOC || 'tr-TR')), (n.tables), (nextUnlocks(n.tier).length ? __L(", yeni eşyalar") : '')]) : '')]), hl: ['vProg'] }
    ];
    var st = steps[i], last = i === steps.length - 1;
    A.overlay(__L("<h2>Kıraathanem — {0}</h2><p class=\"vintro\">{1}</p><div class=\"dots\">{2}</div><div class=\"row\"><button class=\"soft\" id=\"viSkip\">{3}</button>{4}</div>", [(st.t), (st.b), (steps.map(function (_, k) { return '<i' + (k === i ? ' class="on"' : '') + '></i>'; }).join('')), (last ? __L("Kapat") : __L("Atla")), (last ? __L("<button class=\"primary\" id=\"viGo\">Gelişim'i aç</button>") : __L("<button class=\"primary\" id=\"viNext\">İleri</button>"))]));
    document.querySelectorAll('.vhud .glow').forEach(function (b) { b.classList.remove('glow'); });
    st.hl.forEach(function (id) { var b = $(id); if (b) b.classList.add('glow'); });
    var done = function () { A.settings.venueIntroDone = true; A.saveSettings(); document.querySelectorAll('.vhud .glow').forEach(function (b) { b.classList.remove('glow'); }); };
    $('viSkip').onclick = function () { done(); A.overlay(null); };
    if ($('viNext')) $('viNext').onclick = function () { showIntro(i + 1, manual); };
    if ($('viGo')) $('viGo').onclick = function () { done(); showProgress(); };
  }

  // ---------- çok oyunculu görünürlük ----------
  function joinPresence() { var av = A.avatar(); var send = function () { A.NET.send({ t: 'vjoin', code: V.venue.code, name: av.name, avatar: av, acc: A.ACC.auth }); }; if (A.NET.ws && A.NET.ws.readyState === 1) send(); else A.NET.connect(A.settings.server || location.host, send); }
  function leavePresence() { if (A.NET.ws && A.NET.ws.readyState === 1) A.NET.send({ t: 'vleave' }); V.others = {}; }
  V.onMessage = function (m) {
    if (!V.inside) return;
    if (m.t === 'vstate') { V.cid = m.you; V.others = {}; (m.players || []).forEach(function (p) { if (p.cid !== m.you) addOther(p); }); V.tables = m.tables || {}; renderItems(); renderChars(); return; }
    if (m.t === 'vjoin') { if (m.player && m.player.cid !== V.cid) addOther(m.player); renderChars(); return; }
    if (m.t === 'vleave') { delete V.others[m.cid]; renderChars(); return; }
    if (m.t === 'vmove') { var o = V.others[m.cid]; if (!o) return; var walk = walkMap(); var path = E.findPath({ gx: o.gx, gy: o.gy }, { gx: m.gx, gy: m.gy }, walk); if (path && path.length <= 3) o.path = (o.path || []).concat(path); else { o.path = [{ gx: m.gx, gy: m.gy }]; } return; }
    if (m.t === 'vtables') { V.tables = m.tables || {}; renderItems(); return; }
    if (m.t === 'venue') { if (m.venue) { V.venue = m.venue; V.mine = !!m.venue.mine; } if (m.lines) m.lines.forEach(function (l) { A.toast(l, ''); }); refreshHud(); return; }
  };
  function addOther(p) { var pos = P(p.gx, p.gy); V.others[p.cid] = { cid: p.cid, name: p.name, avatar: p.avatar, key: charKey(p.avatar), gx: p.gx, gy: p.gy, x: pos.x, y: pos.y, path: [], facing: 1, dir: 'on', moving: false }; }
})();

