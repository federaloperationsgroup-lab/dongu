
/* Döngü — ekonomi modülü (saf fonksiyonlar). Hem sunucuda (yetkili) hem istemcide (gösterim / deneme modu) çalışır.
   Bütün sayılar sürümlü CONFIG'dedir; oyun kuralları (engine.js) ile ilgisi yoktur. Para birimi: Altın (tam sayı). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Economy = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // v10.11: dil katmanı — istemcide window.__L (i18n.js), sunucuda Türkçe şablon doldurma (çıktı eskisiyle aynı)
  var __L = (typeof window !== 'undefined' && window.__L) || function (t, a) { if (t.indexOf('{') < 0 && t.indexOf('}') < 0) return t; return t.replace(/\{\{|\}\}|\{(\d+)\}/g, function (m, i) { if (m === '{{') return '{'; if (m === '}}') return '}'; var k = +i; return a && k < a.length ? String(a[k]) : m; }); };

  var CONFIG = {
    version: 'dongu-economy-2.0',           // 2.0 (v10.09, K171–K173): gizli botlu Hızlı Katıl tam ödül + her Sosyal maç lig maçı, ligde Bak serbest, günlük lig sınırı 20, 1 El/12 El lig çarpanı, antrenman XP 15;           // 1.2: belge 1.1 + 12 El ve giriş merdiveni; 1.2.1: kıraathane dekor eşyaları; 1.3: hükmen son / çıkma cezası / botlu bahisli masa havuzu (5 Ekim 2026 kararları); 1.4: mekân açılma kuralları + seviyeyle açılan kostümler (K107); 1.5: lig — Döngü Puanı, aylık sezon (K108; altın/XP değişmedi); 1.6: özel karakterler altın + seviye, karakter sahipliğiyle ücretsiz skinler, Çaktırmadan Bak kullanım paketleri (K110)
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
    training: { handsPerDay: 5, gold: 4, xp: 15 }, // botlara karşı (tek insan) antrenman: günde ilk 5 el — v10.09 (K173, K107-A): XP 10 → 15
    loginGold: 40,                          // günlük giriş (UTC günü)
    dailyQuests: [[2, 30, 30], [4, 40, 40], [6, 60, 50]],      // [uygun insan eli, altın, XP] — birikimli
    weeklyQuests: [[24, 200, 150], [48, 300, 200]],
    stakes: [                                // giriş altınlı masalar (el başına; maç = el sayısı × giriş)
      { id: 'sosyal', name: __L("Sosyal"), entry: 0, level: 1 },
      { id: 'bronz', name: __L("Bronz"), entry: 100, level: 5 },
      { id: 'gumus', name: __L("Gümüş"), entry: 300, level: 10 },
      { id: 'altin', name: __L("Altın"), entry: 1000, level: 20 },
      { id: 'platin', name: __L("Platin"), entry: 5000, level: 25 },
      { id: 'elmas', name: __L("Elmas"), entry: 25000, level: 30 },
      { id: 'usta', name: __L("Usta"), entry: 100000, level: 35, locked: true },
      { id: 'efsane', name: __L("Efsane"), entry: 500000, level: 40, locked: true }
    ],
    // v9.86 (K107, D6): mekânlar seviye + oynama hedefiyle açılır; açılan mekân hesapta kalır (eşik sonradan yükselse de kapanmaz).
    // hands: toplam oynanan el (bot masası dahil) · real: gerçek oyuncularla uygun el (masada en az 2 uygun insan; günlük görevlerdeki "uygun el" ile aynı)
    arenas: [
      { theme: 'koy', level: 1 },
      { theme: 'kahve', level: 2, hands: 6 },
      { theme: 'sokak', level: 3, hands: 12 },
      { theme: 'sanayi', level: 5, real: 6 },
      { theme: 'cinar', level: 7, real: 18 },
      { theme: 'soba', level: 9, real: 30 },
      { theme: 'apartman', level: 11, real: 48 },
      { theme: 'bag', level: 13, real: 72 },
      { theme: 'kor', level: 16, real: 100 },
      { theme: 'gok', level: 19, real: 140 },
      { theme: 'inci', level: 22, real: 190 },
      { theme: 'kok', level: 26, real: 250 },
      { theme: 'yildiz', level: 30, real: 320 }
    ],
    // v9.86 (K107): seviyeyle açılan kostümler — bu seviyeden önce satın alınamaz (fiyat aynı; önceden alınmış olan sende kalır)
    itemLevels: {
      'dg24_sac-kivilcim-dalga': 5, 'dg24_aks-erik-kasket': 5,
      'dg24_ust-gunes-dikisi': 10, 'dg24_sakal-kaptan-capa': 10,
      'dg24_sac-bulut-bukle': 15, 'dg24_alt-kanyon-kargo': 15,
      'dg24_ust-gece-kimono': 20, 'dg24_aks-gezgin-dugumu': 20,
      'dg24_sac-orgu-taci': 25, 'dg24_biyik-kivrik-usta': 25,
      'dg24_ust-mercan-ritim': 30, 'dg24_aks-zaman-halkasi': 30,
      'c_ordek': 5, 'c_palyaco': 15, 'c_fikret': 3, 'c_sakir': 12, 'c_pamuk': 6, 'c_nine': 8, 'c_muhtar': 10                      // v9.88 (K110): özel karakterler (aşağıdaki characters ile aynı)
    },
    // v9.88 (K110): özel karakter kataloğu — tek kaynak (mağaza, sunucu satın alma, haklar). Fiyat tahmini: G ≈ her gün 6 El oynayan oyuncunun
    // günlük altını ≈ 450 (economy kurallarından hesap, canlı veri değil) → Ördek ≈ 2G, Palyaço > 4 Masa Giriş Skininin toplamı (6.000) ≈ 14G.
    // grants: sahiplikle kalıcı ücretsiz Masa Giriş Skinleri (satın alınmış gibi; karakter kuşanılmasa da geçerli, haklar birleşir).
    // allSkins: mevcut bütün aksiyon skinleri ücretsiz + Çaktırmadan Bak her el en çok hak (bakMax). futureSkins: ileride eklenecek skinler dahil DEĞİL (katalog kararı).
    characters: [
      { id: 'c_ordek', level: 5, price: 900, grants: ['ortayi_kokla'], allSkins: false, futureSkins: false },
      { id: 'c_palyaco', level: 15, price: 6500, grants: ['tersten_el', 'ince_ayar', 'gosterissiz_numara', 'ortayi_kokla'], allSkins: true, futureSkins: false },
      { id: 'c_fikret', level: 3, price: 500, grants: ['cay_servisi'], allSkins: false, futureSkins: false }, // v9.90 (K115) Çaycı Fikret; v9.91 (K116): Çay Servisi ücretsiz
      { id: 'c_sakir', level: 12, price: 4000, grants: ['gosterissiz_numara', 'tos'], allSkins: false, futureSkins: false }, // v9.90 (K115) Keçi Şakir; v9.91 (K116): Tos ücretsiz
      { id: 'c_pamuk', level: 6, price: 1200, grants: ['patili'], allSkins: false, futureSkins: false }, // v9.92 (K117): Kedi Pamuk — Patili Dokunuş
      { id: 'c_nine', level: 8, price: 1800, grants: ['ince_ayar', 'nazar'], allSkins: false, futureSkins: false }, // v9.92 (K117): Dedikoducu Nine — İnce Ayar + Nazar Boncuğu
      { id: 'c_muhtar', level: 10, price: 2800, grants: ['tersten_el', 'muhur'], allSkins: false, futureSkins: false } // v9.92 (K117): Muhtar Bey — Tersten El + Mühür
    ],
    bakMaxCharges: 5,
    // v9.91 (K116): aksiyon skinleri — maç içi gösteri (bilgi vermez, derecelide serbest). Palyaço'nun allSkins'i yalnız Masa Giriş Skinlerini kapsar (K110: sonradan eklenenler dahil değil).
    actionSkins: [
      { id: 'cay_servisi', name: __L("Çay Servisi"), price: 1500, cat: 'prep', perHand: 1 },
      { id: 'muhur', name: __L("Mühür"), price: 1500, cat: 'open', perHand: 1 },
      { id: 'tos', name: __L("Tos"), price: 1500, cat: 'react', perHand: 2, windowMs: 5000 },
      { id: 'patili', name: __L("Patili Dokunuş"), price: 1500, cat: 'discard', perHand: 3 }, // v9.92 (K117): taş atınca pati izi (kendiliğinden)
      { id: 'nazar', name: __L("Nazar Boncuğu"), price: 1500, cat: 'guard', perHand: 1, blurMs: 2000 }, // v9.92: sana bakanın görüşü 2 sn bulanık (pasif)
      { id: 'yoklama', name: __L("Yoklama"), price: 1200, cat: 'info', perHand: 1, showMs: 4000, rankedOff: true }, // v9.92: rakibin renk dağılımı (bilgi; ligde kapalı)
      { id: 'zafer', name: __L("Zafer Turu"), price: 2000, cat: 'end', perHand: 1 } // v9.92: maç birincisine konfeti (kendiliğinden)
    ],                        // Çaktırmadan Bak: el başına en çok hak (K5)
    // Çaktırmadan Bak kullanım paketleri (tüketilebilir; hesapta skinUses.bak). Sıra: el hakkı (skin/karakter) → ücretsiz deneme → satın alınmış kullanım.
    skinUses: [
      { id: 'u_bak3', skin: 'bak', uses: 3, price: 180, name: __L("Çaktırmadan Bak · 3 kullanım") },
      { id: 'u_bak10', skin: 'bak', uses: 10, price: 500, name: __L("Çaktırmadan Bak · 10 kullanım") }
    ],
    // v9.87 (K108) lig — basit sürüm (K95): ayrı kuyruk yok; en az 3 gerçek oyunculu Hızlı Katıl (Sosyal, girişsiz) maçı "lig maçı"dır.
    // Maç sonu sıraya göre Döngü Puanı (1.–4.; hükmen/ayrılan 4.) × el sayısı katsayısı × rakip gücü; puan 0'ın altına düşmez; aylık sezon (UTC ayı).
    // Aynı oyuncu grubuyla günde en çok 3 maç puanlanır. Miktarlar ilk sürüm: canlı veriyle ayarlanacak. Altın/XP vermez (ekonomiye dokunmaz).
    league: {
      base: [20, 8, -8, -20],               // sıraya göre (6 El için)
      handsMult: { 1: 0.15, 6: 1, 12: 1.8 }, // v10.09 (K173): dakika başına yakın puan — 1 El: ±3/±1 · 6 El: ±20/±8 · 12 El: ±36/±14 (önce 1 El dakikada iki kat veriyordu)
      minHumans: 3,
      sameGroupDaily: 3,
      strength: { per: 200, slope: 0.25, min: 0.75, max: 1.25 }, // rakiplerin ortalaması 200 puan yüksekse kazanç ×1,25, kayıp ×0,75 (tersi de)
      peekOff: false,                       // v10.09 (K173, kullanıcı kararı): lig maçında Çaktırmadan Bak ve Yoklama serbest, puan sayılır (önce D7: kapalı)
      dailyMax: 20,                         // v10.09 (K173): günde en çok 20 lig maçı puanlanır (her Sosyal Hızlı Katıl maçı lig maçı olduğu için)
      top: 50, pastSeasons: 12
    },
    stakeFeeBps: 500,                       // havuzun %5'i sistem gideri
    stakePayoutBps: [6500, 3500, 0, 0],     // kalan havuz: 1. %65, 2. %35
    venue: {
      tiers: [
        { tier: 1, name: __L("Mahalle kahvesi"), price: 0, reputation: 0, tables: 2, slots: 0 },
        { tier: 2, name: __L("Semt kıraathanesi"), price: 4000, reputation: 100, tables: 3, slots: 0 },
        { tier: 3, name: __L("Geniş kıraathane"), price: 12000, reputation: 350, tables: 4, slots: 1 },
        { tier: 4, name: __L("Modern kafe"), price: 35000, reputation: 900, tables: 6, slots: 1 },
        { tier: 5, name: __L("Premium kulüp"), price: 90000, reputation: 2000, tables: 8, slots: 2 },
        { tier: 6, name: __L("Büyük sosyal tesis"), price: 220000, reputation: 4500, tables: 12, slots: 3 }
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
    { id: 'v_masa', name: __L("Okey masası"), cat: 'masa', price: 1500, footprint: [2, 2], kind: 'table', seats: 4, tier: 1, sprite: 'masa', desc: __L("Dört kişilik oynanabilir masa; etrafındaki 4 hücre koltuk için boş kalır.") },
    { id: 'v_sandalye', name: __L("Sandalye"), cat: 'masa', price: 120, footprint: [1, 1], rot: true, tier: 1, sprite: 'sandalye', kind: 'chair', desc: __L("Masanın koltuk hücresine konabilir; oyuncu sandalyenin yanına gelip oturur.") },
    { id: 'v_cayocagi', name: __L("Çay ocağı"), cat: 'uretim', price: 2500, footprint: [2, 1], kind: 'station', recipe: 'cay', tier: 1, sprite: 'cayocagi', desc: __L("20 dakikada 10 servis çay üretir (10 altın girdi).") },
    { id: 'v_tezgah', name: __L("Servis tezgâhı"), cat: 'uretim', price: 800, footprint: [3, 1], tier: 1, sprite: 'tezgah', desc: __L("Servis alanı; yalnız görünüm.") },
    { id: 'v_hali', name: __L("Kilim"), cat: 'dekor', price: 400, footprint: [3, 2], floor: true, tier: 1, sprite: 'hali', desc: __L("Zemine serilir; üstüne eşya konabilir.") },
    { id: 'v_lamba', name: __L("Ayaklı lamba"), cat: 'dekor', price: 350, footprint: [1, 1], tier: 1, sprite: 'lamba', desc: __L("Sıcak ışık.") },
    { id: 'v_soba', name: __L("Kuzine soba"), cat: 'dekor', price: 900, footprint: [1, 1], tier: 1, sprite: 'soba', desc: __L("Kış kahvesi havası.") },
    { id: 'v_radyo', name: __L("Radyo"), cat: 'dekor', price: 300, footprint: [1, 1], tier: 1, sprite: 'radyo', desc: __L("Eski radyo.") },
    { id: 'v_fener', name: __L("Fener"), cat: 'dekor', price: 250, footprint: [1, 1], tier: 1, sprite: 'fener', desc: __L("Küçük fener.") },
    { id: 'v_bitki', name: __L("Saksı bitkisi"), cat: 'dekor', price: 300, footprint: [1, 1], tier: 1, sprite: 'bitki', desc: __L("Yeşillik.") },
    { id: 'v_kedi', name: __L("Beyaz kedi"), cat: 'dekor', price: 600, footprint: [1, 1], tier: 1, sprite: 'kedi', desc: __L("Kahvenin kedisi.") },
    { id: 'v_saat', name: __L("Duvar saati"), cat: 'duvar', price: 300, footprint: [1, 1], wall: true, tier: 1, sprite: 'saat', desc: __L("Arka duvara asılır.") },
    { id: 'v_tablo', name: __L("Tablo"), cat: 'duvar', price: 450, footprint: [1, 1], wall: true, tier: 1, sprite: 'tablo', desc: __L("Manzara tablosu.") },
    { id: 'v_tv', name: __L("Televizyon"), cat: 'duvar', price: 1200, footprint: [1, 1], wall: true, tier: 2, sprite: 'tv', desc: __L("Eski tüplü televizyon.") },
    { id: 'v_kahvemakinesi', name: __L("Kahve makinesi"), cat: 'uretim', price: 4000, footprint: [1, 1], kind: 'station', recipe: 'kahve', tier: 2, sprite: 'kahvemakinesi', desc: __L("30 dakikada 10 fincan kahve (20 altın girdi).") },
    { id: 'v_koltuk', name: __L("Koltuk takımı"), cat: 'dekor', price: 1800, footprint: [3, 2], tier: 2, sprite: 'koltuk', desc: __L("Sosyal köşe.") },
    { id: 'v_koltuktek', name: __L("Tekli koltuk"), cat: 'dekor', price: 700, footprint: [1, 1], tier: 1, sprite: 'koltukyan', desc: __L("Deri tekli koltuk.") },
    { id: 'v_vitrin', name: __L("Vitrin"), cat: 'dekor', price: 900, footprint: [1, 1], tier: 1, sprite: 'vitrin', desc: __L("Camlı fincan vitrini.") },
    { id: 'v_buzdolabi', name: __L("Buzdolabı"), cat: 'dekor', price: 1500, footprint: [1, 1], tier: 2, sprite: 'buzdolabi', desc: __L("Eski tip buzdolabı (görünüm).") },
    { id: 'v_tost', name: __L("Tost tezgâhı"), cat: 'dekor', price: 1200, footprint: [2, 1], tier: 2, sprite: 'tost', desc: __L("Tost makineli tezgâh (görünüm; tost üretimi ileride).") },
    { id: 'v_muzik', name: __L("Müzik kutusu"), cat: 'dekor', price: 2500, footprint: [1, 1], tier: 2, sprite: 'muzik', desc: __L("Işıklı müzik kutusu.") },
    { id: 'v_slot', name: __L("Slot makinesi"), cat: 'eglence', price: 12000, footprint: [1, 1], tier: 3, sprite: 'slot', desc: __L("Eğlence (ayrı özellik; henüz kapalı)."), locked: true }
  ];
  var VENUE_STARTER = ['v_masa', 'v_cayocagi', 'v_sandalye', 'v_sandalye', 'v_hali']; // açılış paketi (bir kez)
  // zemin ızgarası: perspektifli yamuk; kapı alt kenar ortasında; duvar şeridi arka duvarda (wallCols sütun)
  // v9.68: oda 10×6 hücre (önce 12×7). 1 hücre = 0,70 m; ön sırada 150 px (önce 120). Arka duvar 1120 px genişliğinde (boyalı odaların duvar tabanıyla aynı), ön sıra 1500 px.
  // Böylece boyalı pencere/duvar/döşeme karaktere göre %25 küçülür: pencere eşiği ~1 m, döşeme taşı ~1 hücre; oda 7 × 4,2 m (önce 8,4 × 4,9).
  var VENUE_GRID = { cols: 10, rows: 6, x0: 800, yTop: 345, yBot: 790, wTop: 1120, wBot: 1500, wallY: 250, doorCols: [4, 5], serviceRow: 5, version: 2 };
  var VENUE_GRID_V1 = { cols: 12, rows: 7, x0: 800, yTop: 330, yBot: 790, wTop: 980, wBot: 1440, wallY: 250, doorCols: [5, 6], serviceRow: 6, version: 1 }; // eski kayıtların dönüşümü için
  function venueItem(id) { for (var i = 0; i < VENUE_ITEMS.length; i++) if (VENUE_ITEMS[i].id === id) return VENUE_ITEMS[i]; return null; }
  // Başlangıç / örnek yerleşim (10×6): masa ortada (4,2 → 4..5 × 2..3), kilim altında, sandalyeler masanın sol ve sağ koltuğunda (masaya dönük), çay ocağı arka sağ duvarda. Envanterdeki ilk uygun eşyalar kullanılır; olmayan atlanır.
  function starterLayout(inv) {
    var used = {}; var find = function (item) { for (var i = 0; i < inv.length; i++) if (inv[i].item === item && !used[inv[i].iid]) { used[inv[i].iid] = true; return inv[i].iid; } return null; };
    return [
      { iid: find('v_hali'), gx: 3, gy: 2, rot: 0 }, { iid: find('v_masa'), gx: 4, gy: 2, rot: 0 },
      { iid: find('v_sandalye'), gx: 3, gy: 2, rot: 1 }, { iid: find('v_sandalye'), gx: 6, gy: 3, rot: 3 },
      { iid: find('v_cayocagi'), gx: 7, gy: 0, rot: 0 }
    ].filter(function (p) { return p.iid; });
  }
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
      var inv = byIid[p.iid]; if (!inv) { errors.push(__L("Envanterde olmayan eşya: {0}", [(p.iid)])); return; }
      var item = venueItem(inv.item); if (!item) { errors.push(__L("Bilinmeyen eşya: {0}", [(inv.item)])); return; }
      if (item.wall) { if (p.gx < 0 || p.gx >= G.cols) errors.push(__L("{0} duvar dışında", [(item.name)])); else if (walls[p.gx]) errors.push(__L("{0} başka duvar eşyasıyla çakışıyor", [(item.name)])); walls[p.gx] = p.iid; return; }
      var cells = footprintCells(item, p);
      cells.forEach(function (c) {
        if (c.gx < 0 || c.gy < 0 || c.gx >= G.cols || c.gy >= G.rows) { errors.push(__L("{0} zemin dışında", [(item.name)])); return; }
        if (G.doorCols.indexOf(c.gx) >= 0 && c.gy === G.rows - 1) errors.push(__L("{0} kapı önünü kapatıyor", [(item.name)]));
        if (!item.floor) { if (occ[key(c)] && !occ[key(c)].floor) errors.push(__L("{0} ile {1} çakışıyor", [(item.name), (occ[key(c)].name)])); occ[key(c)] = item; }
        else if (occ[key(c)] && occ[key(c)].floor) errors.push(__L("İki kilim üst üste"));
      });
      if (item.kind === 'table') tables.push({ p: p, item: item, iid: p.iid });
    });
    // koltuk hücreleri boş ve zemin içinde olmalı
    // koltuk hücresi boş ya da sandalyeli olabilir (sandalye koltuğun kendisidir); başka eşya koltuğu kapatamaz
    tables.forEach(function (t) { seatCells(t.item, t.p).forEach(function (c) { if (c.gx < 0 || c.gy < 0 || c.gx >= G.cols || c.gy >= G.rows) errors.push(__L("{0} koltuğu zemin dışında", [(t.item.name)])); else if (occ[key(c)] && !occ[key(c)].floor && occ[key(c)].kind !== 'chair') errors.push(__L("{0} koltuğu {1} ile kapanmış", [(t.item.name), (occ[key(c)].name)])); }); });
    // yürünebilir hücreler: dolu olmayan (kilim yürünebilir) hücreler; kapıdan BFS
    var walk = {}; for (var gy = 0; gy < G.rows; gy++) for (var gx = 0; gx < G.cols; gx++) { var k = gx + ',' + gy; walk[k] = !occ[k] || !!occ[k].floor; }
    var reach = {}, q = []; G.doorCols.forEach(function (gx) { var k = gx + ',' + (G.rows - 1); if (walk[k]) { reach[k] = true; q.push([gx, G.rows - 1]); } });
    while (q.length) { var c = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1], nk = nx + ',' + ny; if (nx < 0 || ny < 0 || nx >= G.cols || ny >= G.rows || reach[nk] || !walk[nk]) return; reach[nk] = true; q.push([nx, ny]); }); }
    // masa erişimi: bir koltuk hücresine yürünebiliyorsa ya da sandalyeli koltuğun komşusuna yürünebiliyorsa
    tables.forEach(function (t) { var okSeat = seatCells(t.item, t.p).some(function (c) { var k = c.gx + ',' + c.gy; if (reach[k]) return true; if (occ[k] && occ[k].kind === 'chair') return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { return reach[(c.gx + d[0]) + ',' + (c.gy + d[1])]; }); return false; }); if (!okSeat) errors.push(__L("{0} kapıdan ulaşılamıyor (yol kapalı)", [(t.item.name)])); });
    var stations = placements.filter(function (p) { var inv = byIid[p.iid]; var it = inv && venueItem(inv.item); return it && it.kind === 'station'; });
    stations.forEach(function (p) { var it = venueItem(byIid[p.iid].item); var cells = footprintCells(it, p); var near = false; cells.forEach(function (c) { [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { if (reach[(c.gx + d[0]) + ',' + (c.gy + d[1])]) near = true; }); }); if (!near) errors.push(__L("{0} önüne yürünemiyor", [(it.name)])); });
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
      if (st.batchEndsAt && st.batchEndsAt <= now) { st.stock = Math.min(rc.stockMax, (st.stock || 0) + rc.servings); st.batchEndsAt = 0; lines.push(__L("{0}: parti bitti, stok {1}", [(st.recipe === 'kahve' ? __L("Kahve") : __L("Çay")), (st.stock)])); }
      // NPC satışı: saatlik talep × geçen süre (en çok 8 saat), stok ve günlük kâr tavanı ile sınırlı
      var demand = Math.floor(rc.npcPerHour * elapsed / 3600000) - (st.demandUsed || 0); if (demand < 0) demand = 0;
      var unitProfit = rc.price - rc.systemFee - rc.inputCost / rc.servings, sold = 0;
      while (demand > 0 && (st.stock || 0) > 0 && pr.npc.profit + unitProfit <= cap) { st.stock--; demand--; sold++; pr.npc.profit += unitProfit; pr.npc.sold++; v.uncollected = (v.uncollected || 0) + (rc.price - rc.systemFee); }
      if (sold) lines.push(__L("{0}: NPC {1} servis aldı", [(st.recipe === 'kahve' ? __L("Kahve") : __L("Çay")), (sold)]));
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
  function fmt(n) { return typeof window !== 'undefined' && window.__LOC === 'en-US' ? String(n) : String(n).replace('.', ','); } // Türkçe ondalık (İngilizcede nokta)
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
    CONFIG.dailyQuests.forEach(function (q, i) { if (e.hands >= q[0] && e.dailyDone.indexOf(i) < 0) { e.dailyDone.push(i); p.coins += q[1]; p.xp += q[2]; out.push({ type: 'daily', idx: i, hands: q[0], gold: q[1], xp: q[2] }); lines.push(__L("Günlük görev: {0} el → +{1} altın · +{2} XP", [(q[0]), (q[1]), (q[2])])); } });
    CONFIG.weeklyQuests.forEach(function (q, i) { if (e.weekHands >= q[0] && e.weeklyDone.indexOf(i) < 0) { e.weeklyDone.push(i); p.coins += q[1]; p.xp += q[2]; out.push({ type: 'weekly', idx: i, hands: q[0], gold: q[1], xp: q[2] }); lines.push(__L("Haftalık görev: {0} el → +{1} altın · +{2} XP", [(q[0]), (q[1]), (q[2])])); } });
    return out;
  }
  // Uygun insan elini hesaba işle (sunucu: her gerçek oyuncu için). opts: {ranks, me, humans, won}
  function settleHand(p, opts, now) {
    var e = econOf(p, now), lines = [];
    if (opts.humans <= 1) return settleTraining(p, opts, now);
    e.hands++; e.weekHands++;
    var rw = handReward({ ranks: opts.ranks, me: opts.me, humans: opts.humans, dayHands: e.hands });
    p.coins = (p.coins || 0) + rw.gold; p.xp = (p.xp || 0) + rw.xp;
    var rankTxt = __L("{0}. sıra", [(opts.ranks[opts.me])]);
    lines.push(__L("El ödülü ({0}{1}{2}): +{3} altın · +{4} XP", [(rankTxt), (rw.coef < 1 ? __L(", {0} insan ×{1}", [(opts.humans), (fmt(rw.coef))]) : ''), (rw.rate < 1 ? (rw.rate ? __L(", günlük %25 bant") : __L(", günlük sınır doldu")) : ''), (rw.gold), (rw.xp)]));
    var quests = questCheck(e, p, lines);
    var lu = levelUps(p, e); if (lu) lines.push(__L("Seviye {0}! +{1} altın", [(lu.to), (lu.gold)]));
    if (p.stats) { if (p.stats.real == null) p.stats.real = p.stats.hands || 0; p.stats.hands = (p.stats.hands || 0) + 1; p.stats.real += 1; } // real (v9.86): gerçek oyuncularla uygun el (mekân hedefi); eski kayıtta önce geçmiş eller sayılır
    var ar = syncArenas(p); ar.forEach(function (t) { lines.push(__L("Yeni mekân açıldı: {0}!", [(arenaName(t))])); });
    return { gold: rw.gold, xp: rw.xp, coef: rw.coef, rate: rw.rate, dayHands: e.hands, quests: quests, levelUp: lu, lines: lines, training: false, arenas: ar };
  }
  function settleTraining(p, opts, now) { // tek insan (botlara karşı): günde ilk 5 el 4 altın 10 XP; sıralama bonusu yok
    var e = econOf(p, now), lines = [], t = CONFIG.training, gold = 0, xp = 0;
    e.training++;
    if (e.training <= t.handsPerDay) { gold = t.gold; xp = t.xp; p.coins = (p.coins || 0) + gold; p.xp = (p.xp || 0) + xp; lines.push(__L("Antrenman eli ({0}/{1}): +{2} altın · +{3} XP", [(e.training), (t.handsPerDay), (gold), (xp)])); }
    else lines.push(__L("Antrenman eli: günlük {0} el ödülü doldu", [(t.handsPerDay)]));
    var lu = levelUps(p, e); if (lu) lines.push(__L("Seviye {0}! +{1} altın", [(lu.to), (lu.gold)]));
    if (p.stats) p.stats.hands = (p.stats.hands || 0) + 1;
    var ar = syncArenas(p); ar.forEach(function (th) { lines.push(__L("Yeni mekân açıldı: {0}!", [(arenaName(th))])); });
    return { gold: gold, xp: xp, coef: 0, rate: e.training <= t.handsPerDay ? 1 : 0, dayHands: e.hands || 0, quests: [], levelUp: lu, lines: lines, training: true, trainingCount: e.training, arenas: ar };
  }
  // maç tamamlama bonusu: maçın bütün ellerine uygun katılan; katsayı = ellerin katsayı×bant ortalaması
  function settleMatch(p, opts, now) { // {totalHands, eligibleHands, factors:[coef*rate...], rank, won}
    var e = econOf(p, now), lines = [], b = CONFIG.matchBonus[opts.totalHands];
    var out = { gold: 0, xp: 0, lines: lines, levelUp: null };
    if (b && !opts.forfeit && opts.eligibleHands >= opts.totalHands && opts.factors && opts.factors.length) {
      var f = opts.factors.reduce(function (s, x) { return s + x; }, 0) / opts.factors.length;
      out.gold = Math.floor(b.gold * f); out.xp = Math.floor(b.xp * f);
      p.coins = (p.coins || 0) + out.gold; p.xp = (p.xp || 0) + out.xp;
      lines.push(__L("{0} el tamamlama bonusu: +{1} altın · +{2} XP", [(opts.totalHands), (out.gold), (out.xp)]));
    }
    if (p.stats) { p.stats.matches = (p.stats.matches || 0) + 1; if (opts.rank === 1) p.stats.wins = (p.stats.wins || 0) + 1; }
    out.levelUp = levelUps(p, e); if (out.levelUp) lines.push(__L("Seviye {0}! +{1} altın", [(out.levelUp.to), (out.levelUp.gold)]));
    out.arenas = syncArenas(p); out.arenas.forEach(function (t) { lines.push(__L("Yeni mekân açıldı: {0}!", [(arenaName(t))])); });
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
    return { gold: CONFIG.tutorial.gold, xp: CONFIG.tutorial.xp, levelUp: lu, arenas: syncArenas(p) };
  }
  // ---------- mekânlar (v9.86, K107): seviye + oynama hedefi ----------
  var ARENA_NAMES = { koy: __L("Köy Meydanı"), kahve: __L("Köy Kahvesi"), sokak: __L("Ara Sokak"), sanayi: __L("Sanayi Çay Ocağı"), cinar: __L("Çınar Altı"), soba: __L("Sobalı Kış Kahvesi"), apartman: __L("Apartman Önü"), bag: __L("Bağ Evi Verandası"), kor: __L("Kor Sahanlığı"), gok: __L("Gök Köprüsü"), inci: __L("İnci Koyu"), kok: __L("Kök Çardağı"), yildiz: __L("Yıldız İskelesi") };
  function arenaName(theme) { return ARENA_NAMES[theme] || theme; }
  function arenaRule(theme) { for (var i = 0; i < CONFIG.arenas.length; i++) if (CONFIG.arenas[i].theme === theme) return CONFIG.arenas[i]; return null; }
  function arenaProgress(p, theme) { // {level, hands, real: {have, need}, met, open}; p: hesap kaydı ya da cihazdaki kayıt ({xp, stats, arenas})
    var r = arenaRule(theme), st = (p && p.stats) || {}, lv = levelOf((p && p.xp) || 0).level;
    if (!r) return { level: { have: lv, need: 1 }, hands: null, real: null, met: true, open: true };
    var o = { level: { have: lv, need: r.level || 1 }, hands: r.hands ? { have: st.hands || 0, need: r.hands } : null, real: r.real ? { have: st.real || 0, need: r.real } : null };
    o.met = o.level.have >= o.level.need && (!o.hands || o.hands.have >= o.hands.need) && (!o.real || o.real.have >= o.real.need);
    o.open = o.met || !!(p && p.arenas && p.arenas.indexOf(theme) >= 0);
    return o;
  }
  function arenaOpen(p, theme) { return arenaProgress(p, theme).open; }
  function syncArenas(p) { // koşulu sağlanan mekânlar hesaba yazılır (bir kez açılan kapanmaz); dönüş: yeni açılanlar
    if (!p) return [];
    if (!p.arenas) p.arenas = ['koy'];
    if (p.stats && p.stats.real == null) p.stats.real = p.stats.hands || 0; // v9.86 geçişi: eski kayıtlarda gerçek oyuncu eli ayrı tutulmuyordu → geçmiş eller sayılır
    var out = [];
    CONFIG.arenas.forEach(function (r) { if (p.arenas.indexOf(r.theme) < 0 && arenaProgress(p, r.theme).met) { p.arenas.push(r.theme); out.push(r.theme); } });
    return out;
  }
  function itemLevel(id) { return CONFIG.itemLevels[id] || 0; }
  // ---------- özel karakterler ve skin hakları (v9.88, K110) ----------
  function charOf(id) { for (var i = 0; i < CONFIG.characters.length; i++) if (CONFIG.characters[i].id === id) return CONFIG.characters[i]; return null; }
  function skinUseItem(id) { for (var i = 0; i < CONFIG.skinUses.length; i++) if (CONFIG.skinUses[i].id === id) return CONFIG.skinUses[i]; return null; }
  function isActionSkin(id) { return CONFIG.actionSkins.some(function (a) { return a.id === id; }); }
  function actionSkin(id) { for (var i = 0; i < CONFIG.actionSkins.length; i++) if (CONFIG.actionSkins[i].id === id) return CONFIG.actionSkins[i]; return null; }
  function charGrants(ownedIds) { // sahip olunan karakterlerin verdiği haklar: {intros: [Masa Giriş Skini…], actions: [aksiyon skini…], bakMax: bool, from: {skin: karakterId}}
    var out = { intros: [], actions: [], bakMax: false, from: {} }; ownedIds = ownedIds || [];
    CONFIG.characters.forEach(function (c) { if (ownedIds.indexOf(c.id) < 0) return; c.grants.forEach(function (sk) { var list = isActionSkin(sk) ? out.actions : out.intros; if (list.indexOf(sk) < 0) { list.push(sk); out.from[sk] = c.id; } }); if (c.allSkins) out.bakMax = true; });
    return out;
  }
  function bakCharges(ownedIntroCount, ownedIds) { // el başına Çaktırmadan Bak hakkı: sahip olunan + karakterle açılan Masa Giriş Skini sayısı (en çok 5); allSkins karakteri → en çok
    var g = charGrants(ownedIds); if (g.bakMax) return CONFIG.bakMaxCharges;
    return Math.min(CONFIG.bakMaxCharges, Math.max(0, ownedIntroCount || 0));
  }
  // ---------- lig (v9.87, K108): Döngü Puanı, aylık sezon ----------
  var AYLAR = [__L("Ocak"), __L("Şubat"), __L("Mart"), __L("Nisan"), __L("Mayıs"), __L("Haziran"), __L("Temmuz"), __L("Ağustos"), __L("Eylül"), __L("Ekim"), __L("Kasım"), __L("Aralık")];
  function seasonKey(ts) { var d = new Date(ts == null ? Date.now() : ts); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); }
  function seasonLabel(key) { var p = String(key || '').split('-'), m = parseInt(p[1], 10); return (AYLAR[m - 1] || '?') + ' ' + (p[0] || '?'); }
  function seasonEndsAt(ts) { var d = new Date(ts == null ? Date.now() : ts); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  function prevSeasonKey(ts) { var d = new Date(ts == null ? Date.now() : ts); return seasonKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); }
  function leagueOf(p, now) { // hesabın lig kaydı; sezon değişince eski sezon arşive (son 12), puan sıfırdan
    var sk = seasonKey(now);
    if (!p.league) p.league = { season: sk, points: 0, matches: 0, wins: 0, best: 0, past: [] };
    var L = p.league;
    if (L.season !== sk) {
      if (L.matches) L.past = (L.past || []).concat([{ season: L.season, points: L.points, matches: L.matches, wins: L.wins || 0 }]).slice(-CONFIG.league.pastSeasons);
      L.season = sk; L.points = 0; L.matches = 0; L.wins = 0; L.best = 0; L.groups = null;
    }
    if (!L.past) L.past = [];
    return L;
  }
  function leaguePoints(p, now) { var L = p && p.league; return L && L.season === seasonKey(now) ? (L.points || 0) : 0; } // okuma (kaydı değiştirmez)
  function leagueBase(ranks, me, forfeits) { // sıraya göre taban puan; eşit sırada konumların ortalaması; hükmen son her zaman 4.
    var B = CONFIG.league.base; forfeits = forfeits || [];
    if (forfeits[me]) return B[3];
    var r = ranks[me], tied = 0, better = 0;
    for (var i = 0; i < ranks.length; i++) { if (forfeits[i]) continue; if (ranks[i] === r) tied++; else if (ranks[i] < r) better++; }
    var sum = 0; for (var k = 0; k < tied; k++) sum += B[Math.min(3, better + k)];
    return sum / tied;
  }
  function leagueDelta(myPts, oppPts, base, totalHands) {
    var C = CONFIG.league, m = C.handsMult[totalHands] || 1, st = C.strength;
    var avg = oppPts && oppPts.length ? oppPts.reduce(function (s, x) { return s + (x || 0); }, 0) / oppPts.length : myPts;
    var diff = (avg - myPts) / st.per, f = base > 0 ? 1 + diff * st.slope : 1 - diff * st.slope;
    f = Math.max(st.min, Math.min(st.max, f));
    return { delta: Math.round(base * m * f), mult: m, factor: f };
  }
  // Lig maçı sonu (sunucu, her gerçek oyuncu için). opts: {ranks, me, forfeits, totalHands, oppPts:[rakip insanların puanı], group:'kimlikler'}
  // dönüş: {counted, delta, points, rank1, lines}
  function settleLeague(p, opts, now) {
    var L = leagueOf(p, now), day = dayKey(now), lines = [], C = CONFIG.league, lab = seasonLabel(L.season);
    if (!L.groups || L.groups.day !== day) L.groups = { day: day, n: {} };
    var g = String(opts.group || ''), used = L.groups.n[g] || 0, dayAll = L.groups.all || 0;
    if (C.dailyMax && dayAll >= C.dailyMax) { lines.push(__L("Lig: bugün {0} lig maçı puanlandı; sonraki maçlar yarın yine puan kazandırır ({1})", [(C.dailyMax), (lab)])); return { counted: false, delta: 0, points: L.points, lines: lines }; } // v10.09 (K173): günlük lig maçı sınırı
    if (used >= C.sameGroupDaily) { lines.push(__L("Lig: bu oyuncularla bugün {0} maç puanlandı; bu maç puansız ({1})", [(C.sameGroupDaily), (lab)])); return { counted: false, delta: 0, points: L.points, lines: lines }; }
    L.groups.n[g] = used + 1; L.groups.all = dayAll + 1;
    var ff = !!(opts.forfeits && opts.forfeits[opts.me]), base = leagueBase(opts.ranks, opts.me, opts.forfeits);
    var d = leagueDelta(L.points, opts.oppPts || [], base, opts.totalHands), before = L.points;
    L.points = Math.max(0, L.points + d.delta); L.matches = (L.matches || 0) + 1;
    var first = !ff && opts.ranks[opts.me] === 1; if (first) L.wins = (L.wins || 0) + 1;
    if (L.points > (L.best || 0)) L.best = L.points;
    var real = L.points - before;
    lines.push(__L("Döngü Puanı: {0}{1} → {2} ({3} sezonu{4})", [(real >= 0 ? '+' : '−'), (Math.abs(real)), (L.points), (lab), (ff ? __L(", hükmen son") : '')]));
    return { counted: true, delta: real, points: L.points, lines: lines };
  }
  function leagueSummary(p, now) { // arayüz: bu sezonun özeti (kaydı değiştirmez)
    var sk = seasonKey(now), L = p && p.league, cur = L && L.season === sk;
    var past = ((L && L.past) || []).slice(); if (L && !cur && L.matches) past.push({ season: L.season, points: L.points, matches: L.matches, wins: L.wins || 0 });
    return { season: sk, label: seasonLabel(sk), endsAt: seasonEndsAt(now), points: cur ? L.points || 0 : 0, matches: cur ? L.matches || 0 : 0, wins: cur ? L.wins || 0 : 0, best: cur ? L.best || 0 : 0, last: past.length ? past[past.length - 1] : null };
  }
  function summary(p, now) { // arayüz: bugünkü durum
    var e = econOf(p, now), lv = levelOf(p.xp || 0);
    return { day: e.day, hands: e.hands, training: e.training, trainingMax: CONFIG.training.handsPerDay, weekHands: e.weekHands, login: !!e.login, dailyDone: e.dailyDone.slice(), weeklyDone: e.weeklyDone.slice(), bandNext: bandRate(e.hands + 1), fullHands: CONFIG.dailyBands[0][0], reducedHands: CONFIG.dailyBands[1][0], level: lv, nextDayAt: nextDayAt(now), version: CONFIG.version };
  }

  // ---------- giriş altınlı masa havuzu ----------
  function stakeOf(id) { for (var i = 0; i < CONFIG.stakes.length; i++) if (CONFIG.stakes[i].id === id) return CONFIG.stakes[i]; return CONFIG.stakes[0]; }
  // entries: 4 giriş tutarı (eşit), ranks: [1..4] (eşitlikte aynı sayı) → ödemeler (toplam = havuz − gider)
  // Havuz dağıtımı. opts: { participants: [bool×4] girişi havuza giren koltuklar (botlar değil), forfeits: [bool×4] hükmen son (pay alamaz, girişi havuzda kalır), extra: cezalarla havuza eklenen altın }
  // Sıralama yalnız pay alabilen katılımcılar arasında; hükmen sonlar en sona. Dolmayan konumların payı 1. sıraya eklenir (havuzda altın kalmaz). Kimse alamıyorsa havuz dağıtılmaz.
  function payoutPool(entry, ranks, opts) {
    opts = opts || {}; var parts = opts.participants || ranks.map(function () { return true; }), forf = opts.forfeits || ranks.map(function () { return false; });
    var n = parts.filter(Boolean).length, total = entry * n + (opts.extra || 0), fee = Math.floor(total * CONFIG.stakeFeeBps / 10000), net = total - fee;
    var shares = [0, 0, 0, 0], bps = CONFIG.stakePayoutBps, paid = 0;
    var elig = []; ranks.forEach(function (r, i) { if (parts[i] && !forf[i]) elig.push(i); });
    if (!elig.length) return { total: total, fee: fee, net: net, shares: shares, undistributed: net };
    var groups = {}; elig.forEach(function (i) { (groups[ranks[i]] = groups[ranks[i]] || []).push(i); });
    var order = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; }), pos = 0, usedBps = 0;
    order.forEach(function (r) {
      var members = groups[r], sumBps = 0; for (var k = 0; k < members.length; k++) sumBps += bps[Math.min(3, pos + k)] || 0;
      pos += members.length; usedBps += sumBps;
      var amount = Math.floor(net * sumBps / 10000), each = Math.floor(amount / members.length), rem = amount - each * members.length;
      members.forEach(function (i, j) { shares[i] = each + (j < rem ? 1 : 0); paid += shares[i]; });
    });
    // dolmayan konumlar (örn. 2 katılımcıdan biri hükmen son) ve yuvarlama kalanı en iyi sıraya
    var leftover = net - paid; if (leftover > 0) { var top = groups[order[0]]; shares[top[0]] += leftover; }
    return { total: total, fee: fee, net: net, shares: shares, undistributed: 0 };
  }

  return { CONFIG: CONFIG, fmt: fmt, VENUE_ITEMS: VENUE_ITEMS, VENUE_STARTER: VENUE_STARTER, VENUE_GRID: VENUE_GRID, VENUE_GRID_V1: VENUE_GRID_V1, starterLayout: starterLayout, venueItem: venueItem, venueTier: venueTier, cellPos: cellPos, cellAt: cellAt, footprintCells: footprintCells, seatCells: seatCells, validateLayout: validateLayout, findPath: findPath, settleProduction: settleProduction, xpNeed: xpNeed, levelOf: levelOf, cumulativeXp: cumulativeXp, dayKey: dayKey, weekKey: weekKey, nextDayAt: nextDayAt, econOf: econOf, bandRate: bandRate, humanCoef: humanCoef, handReward: handReward, settleHand: settleHand, settleTraining: settleTraining, settleMatch: settleMatch, loginReward: loginReward, tutorialReward: tutorialReward, summary: summary, stakeOf: stakeOf, payoutPool: payoutPool, levelUps: levelUps, arenaName: arenaName, arenaRule: arenaRule, arenaProgress: arenaProgress, arenaOpen: arenaOpen, syncArenas: syncArenas, itemLevel: itemLevel, charOf: charOf, isActionSkin: isActionSkin, actionSkin: actionSkin, skinUseItem: skinUseItem, charGrants: charGrants, bakCharges: bakCharges, seasonKey: seasonKey, seasonLabel: seasonLabel, seasonEndsAt: seasonEndsAt, prevSeasonKey: prevSeasonKey, leagueOf: leagueOf, leaguePoints: leaguePoints, leagueBase: leagueBase, leagueDelta: leagueDelta, settleLeague: settleLeague, leagueSummary: leagueSummary };
}));

