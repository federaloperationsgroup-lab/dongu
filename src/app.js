(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  // Döngü aileleri (Ateş/Yıldız/Su/Güneş) motorun varsayılanıdır (v9.64); sunucu mesajları da aynı adları kullanır.
  // v10.11: İngilizcede aile adları ekranda İngilizce (motor bu adları yalnız gösterimde kullanır; sunucudan gelen Türkçe günlük satırları dil katmanı çevirir)
  if (window.DonguI18n && DonguI18n.en && window.Okey && Okey.COLORS) Okey.COLORS.splice(0, 4, 'Fire', 'Star', 'Water', 'Sun');
  var SC = 1; // sahne ölçeği (1600×900 -> ekran)
  var ME = 0;
  var VERSION = '10.14';
  var INVITE_ON = true; // v10.10 (K177): masa daveti / "Bu grupla yeniden" / arkadaşla "Oyna" — sunucu desteğiyle birlikte açılır
  // v10.02 (K139): mağaza uygulaması (Capacitor, Android + iOS) — sayfa paketten (capacitor://localhost / https://localhost) açılır, sunucu sabit dongu.app
  var NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var SERVER_HOST = NATIVE ? 'dongu.app' : location.host, SERVER_ORIGIN = NATIVE ? 'https://dongu.app' : '';
  function srvHost() { return SERVER_HOST; }
  var CONSENT_V = '1.1'; // v10.01 (K134): Gizlilik Politikası / Kullanım Koşulları metin sürümü — değişince onay yeniden alınır (sunucudaki CONSENT_VERSION ile aynı)
  var reduceMotion = window.matchMedia && window.matchMedia(__L("(prefers-reduced-motion: reduce)")).matches;

  // ---------- kalıcı ayarlar ----------
  function load(key, def) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  var settings = load('ao.settings', { hints: true, speed: 'normal', tutorialDone: false, sound: true, assist: true, claimTime: 8 });
  if (settings.mode !== 1 && settings.mode !== 6 && settings.mode !== 12) settings.mode = 1; // oyun modu: 1 / 6 / 12 el. v9.89 (K112): yeni oyuncuda varsayılan 1 El (ilk maç kısa); kayıtlı mod korunur
  if (!settings.theme) settings.theme = 'koy'; // mekân (varsayılan: Köy Meydanı — ilk oda)
  var MODES = [[1, __L("1 El"), __L("Tek el oyna")], [6, __L("6 El"), __L("Kısa maç")], [12, __L("12 El"), __L("Klasik maç")]];
  function modeName(n) { for (var i = 0; i < MODES.length; i++) if (MODES[i][0] === n) return MODES[i][2]; return __L("{0} El", [(n)]); }
  function TH() { return (G && G.totalHands) || 12; }
  if (settings.sound === undefined) settings.sound = true;
  if (settings.assist === undefined) settings.assist = true;
  if (!settings.claimTime) settings.claimTime = 8;
  if (settings.jokerPenalty === undefined) settings.jokerPenalty = 10;
  if (settings.reduceMotion === undefined) settings.reduceMotion = false;
  if (settings.focus === undefined) settings.focus = true; // v9.89 (K113): masa odağı — oyun sırasında arka plan/dekor kısılır, taşlar ve sıra öne çıkar
  if (settings.focus) document.documentElement.classList.add('focus');
  if (settings.reduceMotion) document.documentElement.classList.add('reduce');
  function assistOn() { return settings.assist || !!tutorial; }
  function saveSettings() { store('ao.settings', settings); }
  var SPEEDS = { slow: 1300, normal: 750, fast: 350 };

  // ---------- karakter (katmanlı resim sistemi, paket 2 B+C) ----------
  // Katman sırası: gövde (ten boyalı) -> üst -> sakal -> saç -> aksesuar. Hepsi aynı kare, (0,0), %100.
  var AV = {
    gender: [['erkek', __L("Erkek")], ['kadin', __L("Kadın")]],
    skin: ['#f0c8a8', '#d7906f', '#c07a55', '#9a5f3c', '#7a4628', '#55301a'],
    hair: [['kisa', __L("Kısa")], ['dalgali', __L("Dalgalı")], ['uzun', __L("Uzun")], ['yok', __L("Yok")]],
    hairColor: ['#2a1c13', '#4b2e1a', '#7a4a24', '#b3772e', '#d8b56a', '#8e2f24', '#9aa0ab', '#e8e2d6'],
    beard: [['yok', __L("Yok")], ['kirli', __L("Kirli sakal")], ['gur', __L("Gür sakal")]],
    outfit: [['mont-mavi', __L("Kürklü mont")], ['kapusonlu', __L("Kapüşonlu kazak")], ['deri-ceket', __L("Deri ceket")]],
    acc: [['yok', __L("Yok")], ['pilotgozlugu', __L("Pilot gözlüğü")], ['bere', __L("Bere")]],
    full: [['yok', __L("Kendi karakterim")], ['palyaco', __L("Bal Palyaço")], ['ordek', __L("Katil Ördek Yavrusu")], ['fikret', __L("Çaycı Fikret")], ['sakir', __L("Keçi Şakir")], ['pamuk', __L("Kedi Pamuk")], ['nine', __L("Dedikoducu Nine")], ['muhtar', __L("Muhtar Bey")]] // Fişek Kurye ve Egoliçe 7 Ekim 2026'da oyundan kaldırıldı (görseller archive/ klasöründe); eski kayıtlarda seçiliyse normAvatar 'yok'a döndürür
  };
  // Özgün Gardırop 01 (7 Ekim 2026, ChatGPT): 24 parçalı kozmetik. Dosyalar: oturan assets/ch/<cinsiyet>-<id>-<yön>.webp (+ -rear, erase-…), kıraathane assets/k/<cinsiyet>-<id>-<durus|yuru>-<yön>.webp. Fiyat sınıfları katalog-2 ile aynı (saç 250, sakal/bıyık/aksesuar 200, üst/alt 500).
  var GARDROP_VERSION = 'g2'; // v9.96 (K125): üretim 03 — Kaptan Çapa ve İnce İmza yeniden çizildi (önbellek anahtarı), 2 ruj (makyaj yuvası) + 2 fular (yalnız kadın gövde)
  var GARDROP = {
    'sac-kivilcim-dalga': { name: __L("Kıvılcım Dalga"), slot: 'hair', cat: 'hair', price: 250, tint: true, rear: [], erase: false },
    'sac-bulut-bukle': { name: __L("Bulut Bukle"), slot: 'hair', cat: 'hair', price: 250, tint: true, rear: [], erase: false },
    'sac-ayin-kesimi': { name: __L("Ayın Kesimi"), slot: 'hair', cat: 'hair', price: 250, tint: true, rear: ["durus/on", "durus/yan", "masa/on", "masa/yan", "yuru/on", "yuru/yan"], erase: false },
    'sac-orgu-taci': { name: __L("Örgü Tacı"), slot: 'hair', cat: 'hair', price: 250, tint: true, rear: [], erase: false },
    'sac-ruzgar-dugumu': { name: __L("Rüzgâr Düğümü"), slot: 'hair', cat: 'hair', price: 250, tint: true, rear: [], erase: false },
    'sac-girdap-topuz': { name: __L("Girdap Topuz"), slot: 'hair', cat: 'hair', price: 250, tint: true, rear: [], erase: false },
    'sakal-kaptan-capa': { name: __L("Kaptan Çapa"), slot: 'beard', cat: 'beard', price: 200, tint: true, rear: [], erase: false },
    'sakal-cene-hatti': { name: __L("Çene Hattı"), slot: 'beard', cat: 'beard', price: 200, tint: true, rear: [], erase: false },
    'biyik-kivrik-usta': { name: __L("Kıvrık Usta"), slot: 'moustache', cat: 'beard', price: 200, tint: true, rear: [], erase: false },
    'biyik-ince-imza': { name: __L("İnce İmza"), slot: 'moustache', cat: 'beard', price: 200, tint: true, rear: [], erase: false },
    'ust-gunes-dikisi': { name: __L("Güneş Dikişi"), slot: 'outfit', cat: 'outfit', price: 500, tint: false, rear: [], erase: true },
    'ust-gece-kimono': { name: __L("Gece Kimono"), slot: 'outfit', cat: 'outfit', price: 500, tint: false, rear: [], erase: true },
    'ust-nane-atolye': { name: __L("Nane Atölye"), slot: 'outfit', cat: 'outfit', price: 500, tint: false, rear: [], erase: true },
    'ust-mercan-ritim': { name: __L("Mercan Ritim"), slot: 'outfit', cat: 'outfit', price: 500, tint: false, rear: [], erase: true },
    'alt-duman-pile': { name: __L("Duman Pile"), slot: 'pants', cat: 'pants', price: 500, tint: false, rear: [], erase: true },
    'alt-kanyon-kargo': { name: __L("Kanyon Kargo"), slot: 'pants', cat: 'pants', price: 500, tint: false, rear: [], erase: true },
    'alt-gece-mozaik': { name: __L("Gece Mozaik"), slot: 'pants', cat: 'pants', price: 500, tint: false, rear: [], erase: true },
    'alt-erik-akis': { name: __L("Erik Akış"), slot: 'pants', cat: 'pants', price: 500, tint: false, rear: [], erase: true },
    'aks-erik-kasket': { name: __L("Erik Kasket"), slot: 'headwear', cat: 'acc', price: 200, tint: false, rear: [], erase: false },
    'aks-kagit-seyyah': { name: __L("Kâğıt Seyyah"), slot: 'headwear', cat: 'acc', price: 200, tint: false, rear: [], erase: false },
    'aks-bal-petek': { name: __L("Bal Petek"), slot: 'eyewear', cat: 'acc', price: 200, tint: false, rear: [], erase: false },
    'aks-gezgin-dugumu': { name: __L("Gezgin Düğümü"), slot: 'necklace', cat: 'acc', price: 200, tint: false, rear: [], erase: false },
    'aks-iki-yorunge': { name: __L("İki Yörünge"), slot: 'earring', cat: 'acc', price: 200, tint: false, rear: [], erase: false },
    'aks-zaman-halkasi': { name: __L("Zaman Halkası"), slot: 'wrist', cat: 'acc', price: 200, tint: false, rear: [], erase: true },
    // v9.96 (K125, üretim 03): yalnız kadın gövde dosyaları var (gender) — erkek karakterde çizilmez, yaratıcıda listelenmez
    'mak-ruj-kirmizi': { name: __L("Kırmızı Ruj"), slot: 'makeup', cat: 'face', price: 150, tint: false, rear: [], erase: false, gender: 'kadin' },
    'mak-ruj-pembe': { name: __L("Pembe Ruj"), slot: 'makeup', cat: 'face', price: 150, tint: false, rear: [], erase: false, gender: 'kadin' },
    'aks-fular-lacivert': { name: __L("Lacivert Fular"), slot: 'necklace', cat: 'acc', price: 200, tint: false, rear: [], erase: false, gender: 'kadin' },
    'aks-fular-bordo': { name: __L("Bordo Fular"), slot: 'necklace', cat: 'acc', price: 200, tint: false, rear: [], erase: false, gender: 'kadin' }
  };
  var GARDROP_SLOTS = ['hair', 'beard', 'moustache', 'outfit', 'pants', 'headwear', 'eyewear', 'necklace', 'earring', 'wrist', 'makeup']; // v9.96: makyaj yuvası
  function gardrop(slot, val) { var p = GARDROP[val]; return p && p.slot === slot ? p : null; }
  var AV_BASE = {}; Object.keys(AV).forEach(function (k) { AV_BASE[k] = AV[k].slice(); }); // rastgele karakter yalnız temel (ücretsiz/eski) seçeneklerden
  // Gardırop ürünleri seçenek listelerine eklenir (yeni yuvalar: bıyık, alt giyim, şapka, gözlük, boyun, küpe, bilek)
  AV.moustache = [['yok', __L("Yok")]]; AV.pants = [['yok', __L("Kot (varsayılan)")]]; AV.headwear = [['yok', __L("Yok")]]; AV.eyewear = [['yok', __L("Yok")]]; AV.necklace = [['yok', __L("Yok")]]; AV.earring = [['yok', __L("Yok")]]; AV.wrist = [['yok', __L("Yok")]]; AV.makeup = [['yok', __L("Yok")]];
  Object.keys(GARDROP).forEach(function (id) { AV[GARDROP[id].slot].push([id, GARDROP[id].name]); });
  // Tek parça özel karakterler: seçilince gövde + bütün parçaların yerine geçer
  var FULL_CHARS = { palyaco: { name: __L("Bal Palyaço"), file: 'palyaco' }, ordek: { name: __L("Katil Ördek Yavrusu"), file: 'ordek' }, fikret: { name: __L("Çaycı Fikret"), file: 'cayci-fikret' }, sakir: { name: __L("Keçi Şakir"), file: 'keci-sakir' }, pamuk: { name: __L("Kedi Pamuk"), file: 'kedi-pamuk' }, nine: { name: __L("Dedikoducu Nine"), file: 'dedikoducu-nine' }, muhtar: { name: __L("Muhtar Bey"), file: 'muhtar-bey' } }; // v9.92 (K117): üretim paketi 02 // v9.90 (K115): Fikret ve Şakir (ChatGPT üretim paketi 01). Hepsinin -portre/-ikon dosyası var
  function charPortrait(full) { return FULL_CHARS[full] ? 'assets/ch/' + FULL_CHARS[full].file + '-portre.webp' : null; } // mağaza portresi 512
  function charIcon(full) { return FULL_CHARS[full] ? 'assets/ch/' + FULL_CHARS[full].file + '-ikon.webp' : null; } // profil simgesi 128
  var DEFAULT_AV = { v: 2, name: 'Sen', gender: 'erkek', skin: '#d7906f', hair: 'kisa', hairColor: '#2a1c13', beard: 'yok', outfit: 'mont-mavi', acc: 'yok', full: 'yok', moustache: 'yok', pants: 'yok', headwear: 'yok', eyewear: 'yok', necklace: 'yok', earring: 'yok', wrist: 'yok', makeup: 'yok' };
  var BASE_SKIN = [215, 144, 111];
  var PRESET = { m: { gender: 'erkek', hair: 'kisa', beard: 'kirli' }, f: { gender: 'kadin', hair: 'dalgali', beard: 'yok' } };
  // Mağaza kataloğu: benzersiz kimlik, kategori, avatar parçası, ad, fiyat (fiyatlar örnek; gerçek ödeme sonraki aşamada)
  var CATALOG_VERSION = 'katalog-2'; // 5 Ekim 2026: ekonomi 1.2 fiyatları (kıyafet 500, saç/sakal/aksesuar 200–250, Masa Giriş Skini 1.500); eski alımlar geçerli
  var CATALOG = [
    { id: 'c_ordek', cat: 'character', k: 'full', val: 'ordek', name: __L("Katil Ördek Yavrusu"), price: 900, isNew: true }, // v9.88 (K110): fiyat/seviye/haklar Economy.CONFIG.characters'tan (aşağıda eşitlenir)
    { id: 'c_palyaco', cat: 'character', k: 'full', val: 'palyaco', name: __L("Bal Palyaço"), price: 6500, isNew: true },
    { id: 'c_fikret', cat: 'character', k: 'full', val: 'fikret', name: __L("Çaycı Fikret"), price: 500, isNew: true }, // v9.90 (K115)
    { id: 'c_sakir', cat: 'character', k: 'full', val: 'sakir', name: __L("Keçi Şakir"), price: 4000, isNew: true },
    { id: 'c_pamuk', cat: 'character', k: 'full', val: 'pamuk', name: __L("Kedi Pamuk"), price: 1200, isNew: true }, // v9.92 (K117)
    { id: 'c_nine', cat: 'character', k: 'full', val: 'nine', name: __L("Dedikoducu Nine"), price: 1800, isNew: true },
    { id: 'c_muhtar', cat: 'character', k: 'full', val: 'muhtar', name: __L("Muhtar Bey"), price: 2800, isNew: true },
    { id: 't_klasik', cat: 'tiles', k: 'tileSkin', val: 'klasik', name: __L("Klasik Taşlar"), price: 0, free: true, isNew: true },
    { id: 'o_deri', cat: 'outfit', k: 'outfit', val: 'deri-ceket', name: __L("Deri ceket"), price: 500, isNew: true },
    { id: 'o_kapusonlu', cat: 'outfit', k: 'outfit', val: 'kapusonlu', name: __L("Kapüşonlu kazak"), price: 500 },
    { id: 'h_dalgali', cat: 'hair', k: 'hair', val: 'dalgali', name: __L("Dalgalı saç"), price: 250 },
    { id: 'h_uzun', cat: 'hair', k: 'hair', val: 'uzun', name: __L("Uzun saç"), price: 250 },
    { id: 'b_gur', cat: 'beard', k: 'beard', val: 'gur', name: __L("Gür sakal"), price: 200 },
    { id: 'a_bere', cat: 'acc', k: 'acc', val: 'bere', name: __L("Bere"), price: 200, isNew: true },
    { id: 'a_pilot', cat: 'acc', k: 'acc', val: 'pilotgozlugu', name: __L("Pilot gözlüğü"), price: 200 },
    // Masa Giriş Skinleri: oyuncunun masada istediği an (Skinler → Kullan) bütün oyunculara oynattığı karakter gösterisi (kalıcı sahiplik; v10.06 K159 — eskiden maç başında kendiliğinden)
    // Özgün Gardırop 01 ürünleri CATALOG'a aşağıda (CATALOG tanımından sonra) eklenir: id 'dg24_<ürün>', k = yuva, val = ürün kimliği
    { id: 'i_tersten', cat: 'intro', k: 'intro', val: 'tersten_el', name: __L("Tersten El"), price: 1500, isNew: true },
    { id: 'i_inceayar', cat: 'intro', k: 'intro', val: 'ince_ayar', name: __L("İnce Ayar"), price: 1500, isNew: true },
    { id: 'i_numara', cat: 'intro', k: 'intro', val: 'gosterissiz_numara', name: __L("Gösterişsiz Numara"), price: 1500, isNew: true },
    { id: 'i_kokla', cat: 'intro', k: 'intro', val: 'ortayi_kokla', name: __L("Ortayı Kokla"), price: 1500, isNew: true }
  ];
  var INTRO_SKINS = {
    tersten_el: { name: __L("Tersten El"), ms: 1200, desc: __L("Taşı iki parmağı arasında tersten tutar, bileğini çevirip önüne kendinden emin bırakır, rakiplere hafifçe kafa sallar.") },
    ince_ayar: { name: __L("İnce Ayar"), ms: 1400, desc: __L("Istakasına eğilir, taşların üst kenarına iki küçük dokunuşla hizalar, son dokunuşta memnun kafa sallar.") },
    gosterissiz_numara: { name: __L("Gösterişsiz Numara"), ms: 1000, desc: __L("Taşı rahatça bırakır, elini çekerken parmak şıklatır; parmaklarının yanında sıcak sarı bir Döngü halkası belirir.") },
    ortayi_kokla: { name: __L("Ortayı Kokla"), ms: 1600, desc: __L("Öne eğilip elini desteye uzatır, kısa bir tereddüt, havayı koklar gibi esprili bir mimik; temsili taşı kendine çeker.") }
  };
  // v9.89 (K112): skin kartları birbirinden ayrılsın — skin başına renk + amblem (özgün SVG) + 3 adımlık hareket özeti (başlangıç → hareket → bitiş)
  var INTRO_ART = {
    tersten_el: { color: '#ffb347', steps: [__L("Taşı iki parmağının arasında tersten tutar"), __L("Bileğini çevirip taşı döndürür"), __L("Önüne kendinden emin bırakır, kafa sallar")],
      svg: '<svg viewBox="0 0 48 48"><rect x="14" y="10" width="20" height="28" rx="4" fill="#fff5dc" stroke="#7a4a12" stroke-width="2" transform="rotate(-18 24 24)"/><path d="M8 40 Q24 48 40 40" fill="none" stroke="#7a4a12" stroke-width="3" stroke-linecap="round"/><path d="M36 36 l4 4 l-6 1" fill="none" stroke="#7a4a12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    ince_ayar: { color: '#7fd3ff', steps: [__L("Istakasına doğru eğilir"), __L("Taşların üst kenarına iki küçük dokunuş"), __L("Memnun kafa sallar")],
      svg: '<svg viewBox="0 0 48 48"><rect x="6" y="22" width="10" height="16" rx="2" fill="#fff5dc" stroke="#123a5a" stroke-width="2"/><rect x="19" y="22" width="10" height="16" rx="2" fill="#fff5dc" stroke="#123a5a" stroke-width="2"/><rect x="32" y="22" width="10" height="16" rx="2" fill="#fff5dc" stroke="#123a5a" stroke-width="2"/><circle cx="24" cy="12" r="4" fill="#fff" stroke="#123a5a" stroke-width="2"/><circle cx="37" cy="12" r="4" fill="#fff" stroke="#123a5a" stroke-width="2"/></svg>' },
    gosterissiz_numara: { color: '#ffe08a', steps: [__L("Taşı rahatça bırakır"), __L("Elini çekerken parmak şıklatır"), __L("Parmaklarının yanında sıcak sarı Döngü halkası belirir")],
      svg: '<svg viewBox="0 0 48 48"><circle cx="30" cy="18" r="11" fill="none" stroke="#8a5a00" stroke-width="3" stroke-dasharray="6 4"/><circle cx="30" cy="18" r="4" fill="#8a5a00"/><path d="M8 40 L18 26 M12 42 L22 30" stroke="#8a5a00" stroke-width="3" stroke-linecap="round"/></svg>' },
    ortayi_kokla: { color: '#b9f08a', steps: [__L("Öne eğilip elini desteye uzatır"), __L("Kısa tereddüt, havayı koklar gibi mimik"), __L("Temsili taşı kendine çeker")],
      svg: '<svg viewBox="0 0 48 48"><path d="M20 10 Q14 24 22 30 Q26 32 28 28" fill="none" stroke="#2f5a12" stroke-width="3" stroke-linecap="round"/><path d="M30 12 q4 4 0 8 q-4 4 0 8" fill="none" stroke="#2f5a12" stroke-width="2.5" stroke-linecap="round"/><path d="M37 10 q4 4 0 8 q-4 4 0 8" fill="none" stroke="#2f5a12" stroke-width="2.5" stroke-linecap="round"/><rect x="8" y="34" width="14" height="9" rx="2" fill="#fff5dc" stroke="#2f5a12" stroke-width="2"/></svg>' }
  };
  // v9.91 (K116): aksiyon skinleri — maç içi gösteri; bilgi vermez; derecelide serbest. Haklar: sahiplik (satın alma / karakter) sınırsız (el başına sınır), yoksa 1 ücretsiz deneme.
  var ACTION_SKINS = {
    cay_servisi: { name: __L("Çay Servisi"), icon: '🍵', cat: 'prep', fx: 'fx-tepsi', color: '#f0b26b', desc: __L("El başı hazırlıkta herkese çay ısmarlarsın: tepsi gelir, dört koltuğa birer bardak iner, bardaklar 10 saniye tüter. Yalnız gösteri."), when: __L("El başı hazırlık · elde 1"), sfx: 'cayting', steps: [__L("Tepsi masanın ortasına gelir"), __L("Dört bardak koltuklara iner"), __L("Bardaklar 10 sn tüter")] },
    muhur: { name: __L("Mühür"), icon: '📮', cat: 'open', fx: 'fx-muhur', color: '#e35b5b', desc: __L("Perini açtığın anda masaya kırmızı mühür iner, toz kalkar; iz birkaç saniye kalır. Kendiliğinden oynar, hak harcamaz."), when: __L("Açılış anı · kendiliğinden"), sfx: 'muhurtak', steps: [__L("Mühür yukarıdan iner"), __L("Çarpar: kırmızı iz + toz"), __L("Mühür kalkar, iz solar")] },
    tos: { name: __L("Tos"), icon: '🐐', cat: 'react', fx: 'fx-tos', color: '#9bc77a', desc: __L("Tokat yedikten ya da bir rakip per açtıktan sonra 5 saniye içinde masaya tos atarsın: hedefin taşları zıplar (görsel; dizilim değişmez)."), when: __L("Tokat / rakip açılışı sonrası 5 sn · elde 2"), sfx: 'tostok', steps: [__L("Başını geri alır"), __L("Masaya tos!"), __L("Hedefin taşları zıplar")] },
    // v9.92 (K117)
    patili: { name: __L("Patili Dokunuş"), icon: '🐾', cat: 'discard', fx: 'fx-pati', color: '#f4a6c8', desc: __L("Taş atarken atma yerine pembe bir pati izi iner ve solar. Kendiliğinden oynar, hak harcamaz."), when: __L("Taş atışı · kendiliğinden · elde 3"), sfx: 'patipat', steps: [__L("Pati iner"), __L("İz belirir"), __L("İz solar")] },
    nazar: { name: __L("Nazar Boncuğu"), icon: '🧿', cat: 'guard', fx: 'fx-nazar', color: '#5b8de3', desc: __L("Sana Çaktırmadan Bak kullanan rakibin görüşü ilk 2 saniye bulanık kalır; senin üstünde nazar boncuğu parlar. Kendiliğinden çalışır (elde 1)."), when: __L("Sana bakıldığında · kendiliğinden · elde 1"), sfx: 'nazarcin', steps: [__L("Boncuk belirir"), __L("Parlar (bakan 2 sn bulanık görür)"), __L("Söner")] },
    yoklama: { name: __L("Yoklama"), icon: '👂', cat: 'info', fx: 'fx-kulak', color: '#e8c36b', desc: __L("El başı hazırlıkta seçtiğin rakibin elinde hangi renkten kaç taş olduğunu 4 sn görürsün — sayıları değil, yalnız renk dağılımını. Bilgi skini; lig maçında da kullanılabilir."), when: __L("El başı hazırlık · elde 1"), sfx: 'yoklamahmm', steps: [__L("Kulağını masaya dayar"), __L("Renk sayıları belirir (4 sn)"), __L("Söner")] },
    zafer: { name: __L("Zafer Turu"), icon: '🎉', cat: 'end', fx: 'fx-konfeti', color: '#ff7f7f', desc: __L("Maçı birinci bitirince koltuğuna taş konfetisi yağar, tef çalar. Kendiliğinden oynar."), when: __L("Maç sonu · yalnız birinci · kendiliğinden"), sfx: 'zafertef', steps: [__L("Konfeti patlar"), __L("Taşlar ve kurdeleler dağılır"), __L("Söner")] }
  };
  window.ACTION_SKINS_REF = ACTION_SKINS;
  var FX_DEF = { 'fx-tepsi': { frames: 8, w: 256, h: 256, fps: 12 }, 'fx-cay': { frames: 6, w: 128, h: 128, fps: 8, loop: true }, 'fx-muhur': { frames: 8, w: 256, h: 256, fps: 15 }, 'fx-tos': { frames: 6, w: 256, h: 128, fps: 15 }, 'fx-nazar': { frames: 8, w: 128, h: 128, fps: 12 }, 'fx-kulak': { frames: 6, w: 256, h: 256, fps: 10 }, 'fx-pati': { frames: 6, w: 128, h: 128, fps: 12 }, 'fx-konfeti': { frames: 8, w: 256, h: 256, fps: 12 } };
  Object.keys(ACTION_SKINS).forEach(function (id) { var a = Economy.actionSkin(id); CATALOG.push({ id: 'a_' + id, cat: 'action', k: 'action', val: id, name: ACTION_SKINS[id].name, price: a ? a.price : 1500, isNew: true }); });
  function fxSpriteHTML(name, scale, cls) { var d = FX_DEF[name]; if (!d) return ''; var sc = scale || 1; return __L("<i class=\"fxs {0}\" style=\"width:{1}px;height:{2}px;background-image:url(assets/fx/{3}.webp);background-size:{4}px {5}px;--fxf:{6};--fxw:{7}px;--fxd:{8}s;animation-iteration-count:infinite\"></i>", [(cls || ''), (d.w * sc), (d.h * sc), (name), (d.frames * d.w * sc), (d.h * sc), (d.frames), (d.frames * d.w * sc), (d.frames / d.fps)]); } // mağaza önizlemesi: hep döngülü
  function fxSpriteFit(name, box, cls) { var d = FX_DEF[name]; if (!d) return ''; var sc = Math.min(box / d.w, box / d.h) * 0.9; return fxSpriteHTML(name, sc, cls); } // v9.94: tek oranla kutuya sığdır (önce 256 px kare 84 px kutuda flex ile sıkışıp kırpılıyordu)
  function introArtHTML(val) { var a = INTRO_ART[val]; return a ? __L("<i class=\"introEmblem\" style=\"background:{0}\">{1}</i>", [(a.color), (a.svg)]) : ''; }
  function introStepsHTML(val) { var a = INTRO_ART[val]; return a ? '<ol class="introSteps">' + a.steps.map(function (t, i) { return '<li><b>' + [__L("Başlangıç"), __L("Hareket"), __L("Bitiş")][i] + '</b><span>' + t + '</span></li>'; }).join('') + '</ol>' : ''; }
  Object.keys(GARDROP).forEach(function (id) { var g = GARDROP[id]; CATALOG.push({ id: 'dg24_' + id, cat: g.cat, k: g.slot, val: id, name: g.name, price: g.price, isNew: true, gardrop: true }); });
  // v9.88 (K110): özel karakterlerin fiyatı tek kaynaktan (economy.js) ve Çaktırmadan Bak kullanım paketleri (tüketilebilir ürün)
  CATALOG.forEach(function (c) { var ch = Economy.charOf(c.id); if (ch) { c.price = ch.price; c.free = false; } });
  Economy.CONFIG.skinUses.forEach(function (u) { CATALOG.push({ id: u.id, cat: 'uses', k: 'uses', val: u.id, name: u.name, price: u.price, uses: u.uses, skin: u.skin, isNew: true }); });
  var CAT_NAMES = { character: __L("Karakter"), outfit: __L("Üst"), pants: __L("Alt giyim"), face: __L("Yüz"), hair: __L("Saç"), beard: __L("Sakal & bıyık"), acc: __L("Aksesuar"), tiles: __L("Taş seti"), theme: __L("Mekân"), intro: __L("Masa Girişi"), uses: __L("Kullanım paketi"), action: __L("Aksiyon skini") };
  var CHAR_INFO = { ordek: { walk: 'assets/k/ch-katil-ordek-yavrusu-yuru-on.webp', blurb: __L("Sevimli görünür, öyle değildir. Masada ördek tepkileri verir.") }, palyaco: { walk: 'assets/k/ch-bal-palyaco-yuru-on.webp', blurb: __L("Döngü'nün en üst karakteri: kendine özgü giriş, bekleme hareketi ve sesler.") }, fikret: { walk: 'assets/k/ch-cayci-fikret-yuru-on.webp', blurb: __L("Kıraathanenin çaycısı: tepsisi hep yukarıda, çayı hep sıcak. \"Buyrun!\"") }, sakir: { walk: 'assets/k/ch-keci-sakir-yuru-on.webp', blurb: __L("Keçi kostümlü köy delikanlısı: her şeyi yer, sinirlenince tos atar. \"Meee!\"") }, pamuk: { walk: 'assets/k/ch-kedi-pamuk-yuru-on.webp', blurb: __L("Kahvenin kedisi: sessiz adımlar, pati selamı, \"mırr\".") }, nine: { walk: 'assets/k/ch-dedikoducu-nine-yuru-on.webp', blurb: __L("Gözlüğünün üstünden bakar, örgüsünü bırakmaz, her şeyi duyar. \"Hıh!\"") }, muhtar: { walk: 'assets/k/ch-muhtar-bey-yuru-on.webp', blurb: __L("Resmî ama şakacı köy muhtarı: her şeyi mühürler. \"Öhöm.\"") } }; // v9.90 / v9.92
  function skinNameOf(val) { return INTRO_SKINS[val] ? INTRO_SKINS[val].name : (window.ACTION_SKINS_REF && ACTION_SKINS_REF[val] ? ACTION_SKINS_REF[val].name : (val === 'bak' ? __L("Çaktırmadan Bak") : val)); }
  function grantsOf(ownedIds) { return Economy.charGrants(ownedIds || wardrobe.owned); } // sahip olunan karakterlerin verdiği skin hakları
  function grantedBy(val) { var g = grantsOf(); return g.from[val] || null; } // (Masa Giriş ya da aksiyon skini) // bu Masa Giriş Skini hangi karakterle ücretsiz (yoksa null)
  // Taş seti (görünüm): 'dongu' altıgen (varsayılan) / 'klasik' dikdörtgen okey taşı. Kurallar değişmez.
  // ---------- Mekânlar (temalar) ----------
  // Sahne şablonu sabittir (1600×900; masa 300,150 1000×650; koltuklar alt 800,760 / üst 800,120 / sol 120,320 / sağ 1480,320;
  // per alanı x 420–1180 y 270–600; ıstaka x 370–1230 y 610–900). Tema yalnızca katmanları değiştirir: arka plan, masa, dekorlar (+animasyon), ortam sesi.
  var ARENA_LAYOUT = { meldY: 268, meldH: 358, disc: { 0: { x: 1236, y: 536 }, 1: { x: 1192, y: 182 }, 2: { x: 344, y: 182 }, 3: { x: 300, y: 536 } } }; // arena masaları: dikdörtgen yüzey, per alanı köy düzeni yüksekliğinde, atma köşeleri köşelerde
  var THEMES = {
    koy: { name: __L("Köy Meydanı"), desc: __L("Karlı köy meydanı, fenerler ve sıcak ışık — Döngü'nün ilk masası."), layout: { meldY: 268, meldH: 358, topX0: 80, topX1: 760, disc: { 0: { x: 1226, y: 536 }, 1: { x: 976, y: 200 }, 2: { x: 560, y: 200 }, 3: { x: 310, y: 536 } } }, bg: 'assets/arkaplan-koy.webp', table: 'assets/masa.webp', preview: 'assets/tema-koy.webp',
      back: [{ src: 'assets/kardan-adam.webp', x: 1010, y: 150, w: 90, rim: 1 }, { src: 'assets/fener.webp', x: 470, y: 140, w: 90, anim: 'flicker', rim: 1 }, { src: 'assets/fener.webp', x: 1060, y: 140, w: 90, anim: 'flicker', rim: 1 }], // rim: masanın uzak kenarında (telefonda masayla birlikte kayar)
      front: [{ src: 'assets/fener.webp', x: 30, y: 430, w: 140 }, { src: 'assets/beyaz-kedi.webp', x: 0, y: 560, w: 120 }, { src: 'assets/kupa.webp', x: 1440, y: 470, w: 90 }, { src: 'assets/kurabiye-tabagi.webp', x: 1500, y: 640, w: 110 }, { src: 'assets/fener.webp', x: 1440, y: 720, w: 140 }, { src: 'assets/kar-yigini-01.webp', x: 1240, y: 830, w: 300 }, { src: 'assets/kar-yigini-03.webp', x: 246, y: 612, w: 112 }] },
    sokak: { name: __L("Ara Sokak"), desc: __L("Demir kapılar, parmaklıklı pencereler, ipte çamaşırlar; akşam sokak lambası."), bg: 'assets/sokak-arkaplan.webp', table: 'assets/sokak-masa.webp', preview: 'assets/tema-sokak.webp',
      back: [{ src: 'assets/sokak-camasir.webp', x: 300, y: 70, w: 120, anim: 'sway' }],
      front: [{ src: 'assets/sokak-dekor-1.webp', x: 436, y: 158, w: 78 }, { src: 'assets/sokak-dekor-2.webp', x: 262, y: 548, w: 26 }, { src: 'assets/sokak-dekor-3.webp', x: 40, y: 468, w: 110 }, { src: 'assets/sokak-dekor-4.webp', x: 255, y: 798, w: 100 }] },
    sanayi: { name: __L("Sanayi Çay Ocağı"), desc: __L("Tamirhane kepengi, formika masa, dönen vantilatör ve arada geçen çaycı."), bg: 'assets/sanayi-arkaplan.webp', table: 'assets/sanayi-masa.webp', preview: 'assets/tema-sanayi.webp',
      back: [{ src: 'assets/sanayi-cayci.webp', x: 330, y: 78, w: 80, anim: 'walk' }],
      front: [{ src: 'assets/sanayi-dekor-1.webp', x: 430, y: 160, w: 90 }, { src: 'assets/sanayi-dekor-2.webp', x: 256, y: 594, w: 42 }, { src: 'assets/sanayi-dekor-3.webp', x: 1330, y: 548, w: 120 }, { src: 'assets/sanayi-pervane.webp', x: 266, y: 775, w: 92, anim: 'spin' }, { src: 'assets/sanayi-dekor-4.webp', x: 262, y: 770, w: 100 }] },
    cinar: { name: __L("Çınar Altı"), desc: __L("Koca çınarın gölgesinde kalın ahşap masa, hasır oturaklar, köy çeşmesi."), bg: 'assets/cinar-arkaplan.webp', table: 'assets/cinar-masa.webp', preview: 'assets/tema-cinar.webp',
      back: [{ src: 'assets/cinar-yaprak.webp', x: 240, y: 90, w: 48, anim: 'leaf' }],
      front: [{ src: 'assets/cinar-dekor-1.webp', x: 436, y: 160, w: 76 }, { src: 'assets/cinar-dekor-2.webp', x: 258, y: 588, w: 38 }, { src: 'assets/cinar-dekor-3.webp', x: 252, y: 792, w: 105 }, { src: 'assets/cinar-dekor-4.webp', x: 1335, y: 545, w: 90 }] },
    soba: { name: __L("Sobalı Kış Kahvesi"), desc: __L("Dışarıda kar, içeride soba sıcağı; minderli sandalyeler, çaydanlık buharı, közlenmiş kestane."), bg: 'assets/soba-arkaplan.webp', table: 'assets/soba-masa.webp', preview: 'assets/tema-soba.webp',
      back: [{ src: 'assets/soba-kar.webp', x: 0, y: 0, w: 270, h: 270, tile: true, anim: 'snow', clip: __L("polygon(0px 27px, 59px 29px, 59px 244px, 0px 258px)") }, { src: 'assets/soba-kar.webp', x: 0, y: 0, w: 270, h: 270, tile: true, anim: 'snow', clip: __L("polygon(89px 34px, 161px 38px, 161px 219px, 89px 237px)") }, { src: 'assets/soba-kar.webp', x: 0, y: 0, w: 270, h: 270, tile: true, anim: 'snow', clip: __L("polygon(190px 42px, 249px 46px, 249px 199px, 190px 215px)") }],
      front: [{ src: 'assets/soba-dekor-1.webp', x: 436, y: 158, w: 76 }, { src: 'assets/soba-dekor-2.webp', x: 256, y: 598, w: 42 }, { src: 'assets/soba-dekor-3.webp', x: 256, y: 788, w: 112 }, { src: 'assets/soba-dekor-4.webp', x: 1250, y: 608, w: 70 }] },
    apartman: { name: __L("Apartman Önü"), desc: __L("Kapı lambasının ışığında katlanır masa, plastik sandalyeler, posta kutuları ve fesleğen kokusu."), bg: 'assets/apartman-arkaplan.webp', table: 'assets/apartman-masa.webp', preview: 'assets/tema-apartman.webp',
      back: [{ src: 'assets/apartman-kelebek.webp', x: 476, y: 99, w: 32, h: 32, anim: 'hover' }],
      front: [{ src: 'assets/apartman-dekor-1.webp', x: 440, y: 158, w: 76 }, { src: 'assets/apartman-dekor-2.webp', x: 266, y: 556, w: 26 }, { src: 'assets/apartman-dekor-3.webp', x: 248, y: 772, w: 100 }, { src: 'assets/apartman-dekor-4.webp', x: 1252, y: 608, w: 66 }] },
    bag: { name: __L("Bağ Evi Verandası"), desc: __L("Gün batımına bakan taş ev verandası; asma yaprakları, üzüm kasaları ve toprak testi."), bg: 'assets/bag-arkaplan.webp', table: 'assets/bag-masa.webp', preview: 'assets/tema-bag.webp',
      back: [{ src: 'assets/bag-asma.webp', x: 485, y: 12, w: 150, anim: 'sway' }],
      front: [{ src: 'assets/bag-dekor-1.webp', x: 436, y: 160, w: 74 }, { src: 'assets/bag-dekor-2.webp', x: 258, y: 592, w: 40 }, { src: 'assets/bag-dekor-3.webp', x: 252, y: 762, w: 100 }, { src: 'assets/bag-dekor-4.webp', x: 1250, y: 608, w: 68 }] },
    kahve: { name: __L("Köy Kahvesi"), desc: __L("Badanalı duvarlar, çay ocağı, yapraklı takvim; sıcak bir köy kahvesi."), bg: 'assets/kahve-arkaplan.webp', table: 'assets/kahve-masa.webp', preview: 'assets/tema-kahve.webp',
      back: [{ src: 'assets/kahve-buhar.webp', x: 1515, y: 310, w: 70, h: 105, anim: 'steam' }],
      front: [{ src: 'assets/kahve-dekor-1.webp', x: 430, y: 160, w: 100 }, { src: 'assets/kahve-dekor-2.webp', x: 258, y: 590, w: 40 }, { src: 'assets/kahve-dekor-3.webp', x: 1450, y: 651, w: 126 }, { src: 'assets/kahve-dekor-4.webp', x: 1250, y: 608, w: 72 }] },
    // Arena mekânları (7 Ekim 2026 görsel paketi): dikdörtgen masa; per alanı 380,268 840×358; atma köşeleri masa yüzeyinde. tiles: o mekânda görünen taş malzemesi (yalnız altıgen Döngü taşı; klasik sette uygulanmaz).
    // masa görselleri GEÇİCİ: teslim edilen masaların oyun yüzeyi uzatılarak 1100×700'e göre düzenlendi; yeniden üretilenler gelince assets/arena/<id>-masa.webp değiştirilir.
    kor: { name: __L("Kor Sahanlığı"), desc: __L("Lav ırmaklarının ortasında süzülen obsidyen levha; korlu kayalar ve sıcak ışık."), layout: ARENA_LAYOUT, bg: 'assets/arena/kor-arkaplan.webp', table: 'assets/arena/kor-masa.webp', preview: 'assets/arena/tema-kor.webp', tiles: 'lav', back: [], front: [] },
    gok: { name: __L("Gök Köprüsü"), desc: __L("Bulutların üstünde pirinç köprüler, ufukta dönen fırtına; şimşek mavisi masa."), layout: ARENA_LAYOUT, bg: 'assets/arena/gok-arkaplan.webp', table: 'assets/arena/gok-masa.webp', preview: 'assets/arena/tema-gok.webp', tiles: 'firtina', back: [], front: [] },
    inci: { name: __L("İnci Koyu"), desc: __L("Dalgaların kıvrıldığı sığ koy; cam masa, inci köşeler ve gün batımı."), layout: ARENA_LAYOUT, bg: 'assets/arena/inci-arkaplan.webp', table: 'assets/arena/inci-masa.webp', preview: 'assets/arena/tema-inci.webp', tiles: 'gelgit', back: [], front: [] },
    kok: { name: __L("Kök Çardağı"), desc: __L("Kadim köklerin sardığı orman çardağı; kristaller, fenerler ve mantar ışıkları."), layout: ARENA_LAYOUT, bg: 'assets/arena/kok-arkaplan.webp', table: 'assets/arena/kok-masa.webp', preview: 'assets/arena/tema-kok.webp', tiles: 'kok', back: [], front: [] },
    yildiz: { name: __L("Yıldız İskelesi"), desc: __L("Asteroit kuşağına bakan uzay iskelesi; mor bulutsu ve neon ışıklı masa."), layout: ARENA_LAYOUT, bg: 'assets/arena/yildiz-arkaplan.webp', table: 'assets/arena/yildiz-masa.webp', preview: 'assets/arena/tema-yildiz.webp', tiles: 'yildiz', back: [], front: [] }
  };
  function themeOwned(id) { var t = THEMES[id]; return !!t && !t.soon && (!t.price || owns(t.item)); }
  function themeOf(id) { return themeOwned(id) ? THEMES[id] : THEMES.koy; }
  var appliedTheme = null; // v9.73: aynı tema yeniden uygulanmaz (oda mesajı her gelişinde dekorlar silinip kuruluyor, lambalar "gidip geliyordu")
  function applyTheme(id, force) {
    if (!force && appliedTheme === id) return; appliedTheme = id;
    if (!themeOwned(id) && settings.theme === id) { settings.theme = 'koy'; saveSettings(); } // sahip olunmayan mekân seçili kalmaz
    var t = themeOf(id), root = document.documentElement.style;
    root.setProperty('--theme-bg', 'url(' + t.bg + ')'); root.setProperty('--theme-table', 'url(' + t.table + ')');
    var rk = ['kor', 'gok', 'inci', 'kok', 'yildiz'].indexOf(id) >= 0 ? id : null; // v10.09 (K175): arena mekânlarında mekâna göre rakip ıstakası (renk/malzeme)
    root.setProperty('--rack-top', 'url(' + (rk ? 'assets/arena/istaka-rakip-yatay-' + rk + '.webp' : 'assets/istaka-rakip-yatay.webp') + ')'); root.setProperty('--rack-side', 'url(' + (rk ? 'assets/arena/istaka-rakip-dikey-' + rk + '.webp' : 'assets/istaka-rakip-dikey.webp') + ')');
    var L = t.layout || {}; // masa biçimine göre açık per alanı, orta grup (deste+gösterge) ve köşe atma alanları (varsayılan: yamuk masa)
    var mY = L.meldY || 240, mB = mY + (L.meldH || 386); if (PHONE) mY = Math.min(mY, 240); // v9.77 (K86): telefonda per alanı üstte 240'tan başlar (köy/arena 268 → 240; alt kenar 626 aynı)
    root.setProperty('--meld-y', mY + 'px'); root.setProperty('--meld-h', (mB - mY) + 'px'); // v9.74: telefonda da tam yükseklik (ıstaka 626'da kalır; önce 36 px kısaltılmıştı, kalabalık masada taşma yapıyordu)
    // v9.77 (K86): telefonda masa çevresi yatayda kx kadar açılır (merkez x = 800). Masaüstünde kx = 1: bütün değerler eskisiyle birebir aynı.
    var kx = PHONE ? PHG.kx : 1, M = PHONE ? PHG.M : 0, mapX = function (x) { return 800 + (x - 800) * kx; }, px = function (v) { return Math.round(v) + 'px'; };
    root.setProperty('--table-x', px(800 - 550 * kx)); root.setProperty('--table-w', px(1100 * kx));
    root.setProperty('--meld-x', px(800 - 420 * kx)); root.setProperty('--meld-w', px(840 * kx));
    zoneCfg = { topX0: Math.round((L.topX0 || 38) * kx), topX1: Math.round((L.topX1 || 802) * kx) }; // üst bölgenin yatay sınırı (#melds içi; köşe atma alanlarına değmez, yuvarlak masada daha dar)
    var D = L.disc || {}; // koltuk → kendi sağındaki köşe: 0 ben (sağ alt), 1 Ali (sağ üst), 2 Ayşe (sol üst), 3 Mehmet (sol alt) — hepsi per alanının (#melds) dışında
    var tz0 = 800 - 420 * kx + zoneCfg.topX0, tz1 = 800 - 420 * kx + zoneCfg.topX1; // üst bölgenin sahne x aralığı
    [[0, 1236, 540], [1, 1192, 182], [2, 344, 182], [3, 300, 540]].forEach(function (d) { var o = D[d[0]] || {}, x = mapX((o.x || d[1]) + 32) - 32, y = o.y || d[2];
      if (PHONE && (d[0] === 1 || d[0] === 2) && x < tz1 && x + 76 > tz0) y = Math.min(y, mY - 78); // üst köşe atma alanı üst bölgenin üstündeyse per alanıyla birlikte yukarı (köy masası)
      root.setProperty('--disc' + d[0] + '-x', px(x)); root.setProperty('--disc' + d[0] + '-y', y + 'px'); });
    var zw = PHONE ? 56 : 44, orrR = mapX(1315) + 115;
    root.setProperty('--zoom-x', px(mapX(1258) - zw / 2)); root.setProperty('--orl-x', px(mapX(285) - 115)); root.setProperty('--orr-x', px(mapX(1315) - 115));
    root.setProperty('--chl-x', px(Math.max(4 - M, mapX(149) - 115))); root.setProperty('--chr-x', px(Math.min(1600 + M - 234, mapX(1451) - 115))); // yan rakipler (telefonda 230 px) görünür bantta kalır
    root.setProperty('--sidebtn-x', px(Math.max(1500, Math.min(1600 + M - 92, orrR + 8)))); // Puanlar / Skinler: sağ rakibin ıstakasının dışında
    if (G && built && G.phase === 'claim') renderClaim();
    if (G && built) renderMelds();
    // v9.77 (K86): telefonda masaya bağlı süsler (öndekiler + 'rim' işaretli arkadakiler) masayla birlikte dışa kayar; görünür bandın dışına taşan gizlenir. Arka plana hizalı süsler yerinde kalır.
    var decoX = function (d, front) { if (!PHONE || !(front || d.rim)) return d.x; return Math.round(mapX(d.x + d.w / 2) - d.w / 2); };
    var decoHidden = function (d, x) { return PHONE && (x + d.w * 0.7 < -M || x + d.w * 0.3 > 1600 + M); };
    function fill(el, list, front) { el.innerHTML = ''; (list || []).forEach(function (d) { var dx = decoX(d, front); if (decoHidden(d, dx)) return; var im; if (d.tile) { im = document.createElement('div'); im.style.backgroundImage = 'url(' + d.src + ')'; im.style.backgroundSize = __L("{0}px auto", [(d.w)]); im.style.backgroundRepeat = 'repeat-y'; if (d.clip) im.style.clipPath = d.clip; } else { im = document.createElement('img'); im.src = d.src; im.alt = ''; } im.className = 'deco' + (d.anim ? ' anim-' + d.anim : '') + (d.tile ? ' tile' : ''); im.style.left = dx + 'px'; im.style.top = d.y + 'px'; im.style.width = d.w + 'px'; if (d.h) im.style.height = d.h + 'px'; el.appendChild(im); }); }
    fill($('decorBack'), t.back, false); fill($('decorFront'), t.front, true);
    document.documentElement.dataset.theme = themeOwned(id) ? id : 'koy';
    if (t.tiles) document.documentElement.dataset.tileMaterial = t.tiles; else delete document.documentElement.dataset.tileMaterial; // mekâna özel taş malzemesi (CSS: html[data-tile-material])
  }
  function themePickerHTML(cur) {
    var order = ['koy'].concat(Object.keys(THEMES).filter(function (k) { return k !== 'koy'; }));
    return '<div class="themes" id="lThemes">' + order.map(function (k) { var t = THEMES[k], locked = t.price && !owns(t.item); return __L("<button data-theme=\"{0}\" class=\"{1}{2}{3}\"{4}>{5}<b>{6}</b><small>{7}</small></button>", [(k), (k === cur ? 'on' : ''), (t.soon ? ' soon' : ''), (locked ? ' locked' : ''), (t.soon ? ' disabled' : ''), (t.preview ? __L("<img src=\"{0}\" alt=\"\">", [(t.preview)]) : '<div style="height:84px;display:flex;align-items:center;justify-content:center;font-size:30px">🏠</div>'), (t.name), (locked ? __L("🔒 {0} jeton — mağazadan al", [(t.price.toLocaleString(window.__LOC || 'tr-TR'))]) : t.desc)]); }).join('') + '</div>';
  }
  function applyTileSkin() { document.documentElement.classList.toggle('skin-klasik', settings.tileSkin === 'klasik'); if (G && built) renderRack(); }
  function tilePreviewHTML(skin) {
    var d = document.createElement('div'); d.className = 'tilepv' + (skin === 'klasik' ? ' skin-klasik' : '');
    [{ c: 0, n: 7 }, { c: 1, n: 7 }, { c: 2, n: 7 }, { c: 3, n: 7 }].forEach(function (t) { t.fake = false; t.id = -1; var e = tileEl(t); e.classList.remove('joker'); d.appendChild(e); });
    var f = tileEl({ c: 0, n: 0, fake: true, id: -1 }); f.classList.remove('joker'); d.appendChild(f);
    return d.outerHTML;
  }
  function previewPose(it) { return it && it.k === 'pants' ? 'stand' : it && it.cat === 'outfit' ? 'on' : 'bust'; } // mağaza/gardırop/karakter önizleme pozu (v9.94: bilek de oturan pozda, bileğe yakın kadraj)
  function previewCls(it) { var p = previewPose(it); return p === 'stand' ? 'stand' : p === 'on' ? 'body' : 'bust'; }
  // v9.94 (K120): önizleme kadrajı ürün türüne göre — 480×480 oturan tuvalde gösterilecek bölge (cx: yatay merkez, y0: üst satır, h: yükseklik).
  // Baş + şapka + saç tepesi görünür (önceden şapkalar ve saç tepesi kartın üst kenarında kesiliyordu; çerçeve alna oturuyor sanılıyordu).
  var PV_FRAME = { bust: { cx: 240, y0: 0, h: 256 }, face: { cx: 240, y0: 36, h: 196 }, ear: { cx: 240, y0: 84, h: 142 }, neck: { cx: 240, y0: 60, h: 222 }, wrist: { cx: 352, y0: 328, h: 132 }, body: { cx: 240, y0: 0, h: 404 } };
  function pvFrame(it) { if (!it) return PV_FRAME.bust; var k = it.k; if (k === 'beard' || k === 'moustache' || k === 'makeup') return PV_FRAME.face; if (k === 'earring') return PV_FRAME.ear; if (k === 'necklace') return PV_FRAME.neck; if (k === 'wrist') return PV_FRAME.wrist; if (it.cat === 'outfit') return PV_FRAME.body; return PV_FRAME.bust; }
  function pvStyle(it, boxH) { var f = pvFrame(it), sc = boxH / f.h, w = Math.round(480 * sc * 10) / 10; return 'position:absolute;left:calc(50% - ' + Math.round(f.cx * sc * 10) / 10 + 'px);top:' + (-Math.round(f.y0 * sc * 10) / 10) + 'px;width:' + w + 'px;height:' + w + 'px;max-width:none;transform:none'; }
  function pvAvatar(base, it) { var va = Object.assign({}, base); va[it.k] = it.val; var gi = it.gardrop ? GARDROP[it.val] : null; if (gi && gi.gender && va.gender !== gi.gender) { va.gender = gi.gender; if (va.gender === 'kadin') va.beard = 'yok'; } return va; } // v9.96: yalnız kadın gövdesi olan ürün erkek avatarla kadın gövdede önizlenir
  function pvImgHTML(a, it, boxH) { if (previewPose(it) === 'stand') return charImgHTML(a, 'stand', 'stand'); if (it && it.k === 'earring') { a = Object.assign({}, a); a.showcaseEar = true; } return charImgHTML(a, previewPose(it), previewCls(it) + ' framed', pvStyle(it, boxH)); }
  function catItem(k, val) { for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].k === k && CATALOG[i].val === val) return CATALOG[i]; return null; }
  var wardrobe = load('ao.wardrobe', { coins: Economy.CONFIG.welcomeGold, owned: [] });
  if (wardrobe.coins == null) wardrobe.coins = Economy.CONFIG.welcomeGold; if (!wardrobe.owned) wardrobe.owned = []; if (!wardrobe.stats) wardrobe.stats = { hands: 0, matches: 0, wins: 0 };
  Economy.syncArenas(wardrobe); // v9.86: cihazdaki (hesapsız) kayıtta koşulu zaten sağlanan mekânlar sessizce yazılır (ilk elde "yeni açıldı" denmesin)
  function saveWardrobe() { store('ao.wardrobe', wardrobe); }
  localGift(); // skin hediyesi (hesapsız kullanım için cihazda; hesap varsa sunucudaki hak esastır)
  // Deneme modu (claude.ai prototipi / sunucusuz): aynı ekonomi formülleri yerelde; sunucu hesabı varsa (ACC.on) yerel sayılar yalnız kopyadır
  var OPEN_ALL = false; // v9.86 (K107, D6): mekân kilitleri açık — seviye + oynama hedefi (Economy.CONFIG.arenas); 4 Ekim 2026'daki geçici "hepsi açık" kaldırıldı
  if (!wardrobe.charMig) { wardrobe.charMig = 1; Economy.CONFIG.characters.forEach(function (c) { var i = wardrobe.owned.indexOf(c.id); if (i >= 0) wardrobe.owned.splice(i, 1); }); saveWardrobe(); } // v9.88 geçişi (cihaz kopyası): ücretsiz dönemde alınan özel karakterler dolaptan düşer (sunucu da aynı geçişi yapar)
  function owns(id) { if (OPEN_ALL && /^th_/.test(id)) return true; if (wardrobe.owned.indexOf(id) >= 0) return true; var it = null; for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) it = CATALOG[i]; return !!(it && (it.cat === 'intro' || it.cat === 'action') && grantedBy(it.val)); } // v9.88: karakter sahipliğiyle açılan Masa Giriş / aksiyon skini sahip olunmuş sayılır
  // ---------- Hesap (sunucu): misafir hesabı, seviye/XP, jeton; yalnızca kendi sunucumuzdan açıldığında ----------
  var ACC = { on: false, player: null, auth: load('ao.auth', null), tried: false };
  function api(path, body, cb) {
    try {
      fetch(SERVER_ORIGIN + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
        .then(function (r) { return r.json().then(function (j) { locData(j); cb(r.ok ? null : new Error(j.error || __L("Sunucu hatası")), j); }, function () { cb(new Error('noServer')); }); })
        .catch(function (e) { cb(e || new Error(__L("bağlantı yok"))); });
    } catch (e) { cb(e); }
  }
  // v10.11: İngilizcede sunucudan gelen gösterim adları (kıraathane kademe adı, kademe nesnesi, mağaza ürünü) — kullanıcı içeriği (oyuncu / kıraathane adı) çevrilmez
  function locData(o, d) {
    if (!window.DonguI18n || !DonguI18n.en || !o || typeof o !== 'object' || (d = d || 0) > 6) return o;
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) if (o[i] && typeof o[i] === 'object') locData(o[i], d + 1); return o; }
    if (typeof o.tierName === 'string') o.tierName = DonguI18n.rt(o.tierName);
    var pr = o.price != null || o.priceHint != null;
    if (typeof o.name === 'string' && o.code == null && ((o.tier != null && o.tables != null) || (pr && (o.gold != null || o.desc != null)))) o.name = DonguI18n.rt(o.name);
    if (typeof o.desc === 'string' && pr) o.desc = DonguI18n.rt(o.desc);
    if (typeof o.name === 'string' && o.code != null && / (Kıraathanesi|Kahvesi)$/.test(o.name)) o.name = DonguI18n.rt(o.name); // varsayılan kıraathane adı ("Ali Kıraathanesi" → "Ali's Coffeehouse")
    for (var k in o) if (o[k] && typeof o[k] === 'object') locData(o[k], d + 1);
    return o;
  }
  function accBody(extra) { var b = Object.assign({ id: ACC.auth ? ACC.auth.id : '', token: ACC.auth ? ACC.auth.token : '' }, extra || {}); var c = load('ao.consent', null); if (c && c.v && !b.consent) b.consent = c; return b; }
  // ---------- v10.01 (K134): ilk açılışta 18+ ve yasal metin onayı; yönetici uyarıları; veri indirme; hesap silme ----------
  function consentOk() { var c = load('ao.consent', null); return !!(c && c.v === CONSENT_V); }
  function legalLinks() { return __L("<a href=\"{0}/gizlilik\" target=\"_blank\" rel=\"noopener\">Gizlilik Politikası</a> · <a href=\"{1}/kosullar\" target=\"_blank\" rel=\"noopener\">Kullanım Koşulları</a>", [(SERVER_ORIGIN), (SERVER_ORIGIN)]); }
  function showConsent(next) {
    var prev = load('ao.consent', null);
    overlay(__L("<h2>Başlamadan önce</h2><p>{0}</p><p class=\"note\">Oyunu kullanarak <b>{1}</b> metinlerini kabul etmiş olursun. Oyun içi altın gerçek para değildir; bahisli masalar yalnız sanal altınla oynanır.</p><label class=\"consent\"><input type=\"checkbox\" id=\"cAdult\"> 18 yaşından büyüğüm; Gizlilik Politikası'nı ve Kullanım Koşulları'nı okudum, kabul ediyorum.</label><div class=\"row\"><button class=\"primary\" id=\"cGo\" disabled>Kabul et ve devam</button></div>", [(prev ? __L("Gizlilik Politikası ve Kullanım Koşulları güncellendi; devam etmek için yeni metni kabul etmen gerekir.") : __L("Döngü 18 yaş ve üzeri oyuncular içindir. Oyun misafir hesabıyla çalışır: e-posta, telefon veya parola istemez; hesabın bu cihazdaki anahtarla tanınır.")), (legalLinks())]), 'consentwin');
    var cb = $('cAdult'), go = $('cGo'); cb.onchange = function () { go.disabled = !cb.checked; };
    go.onclick = function () { if (!cb.checked) return; store('ao.consent', { v: CONSENT_V, at: Date.now(), adult: true }); overlay(null); next(); };
  }
  // ---------- v10.03 (K140): mağaza satın almaları (Google Play / App Store, RevenueCat) ----------
  var CFG = window.DONGU_CONFIG || {}; // prepare-www.sh paketleme sırasında app-config.json'dan yazar (herkese açık SDK anahtarları)
  var IAP = { products: [], prices: {}, ready: false, configuredFor: null, plugin: null, store: null };
  function iapPlugin() { try { return NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases || null; } catch (e) { return null; } }
  function iapKey() { var pf = ''; try { pf = window.Capacitor.getPlatform(); } catch (e) {} return pf === 'ios' ? (CFG.rcIos || '') : pf === 'android' ? (CFG.rcAndroid || '') : ''; }
  function iapInit() { // hesap belli olunca: SDK'yı oyuncu kimliğiyle kur, mağaza fiyatlarını oku
    var P = iapPlugin(), key = iapKey(); if (!P || !key || !ACC.auth) return;
    if (IAP.configuredFor === ACC.auth.id) return; IAP.configuredFor = ACC.auth.id;
    var done = function () { P.getOfferings().then(function (o) { var cur = o && o.current; var pk = cur ? (cur.availablePackages || []) : []; var all = o && o.all ? Object.keys(o.all).reduce(function (a, k) { return a.concat(o.all[k].availablePackages || []); }, []) : pk; (pk.length ? pk : all).forEach(function (pkg) { var pr = pkg.product || pkg.storeProduct; if (pr && pr.identifier) { IAP.prices[pr.identifier] = pr.priceString; IAP.store = IAP.store || {}; IAP.store[pr.identifier] = pr; } }); IAP.ready = true; if ($('sGrid') && $('sTabs') && $('sTabs').querySelector('button.on') && /Altın|Gold/.test($('sTabs').querySelector('button.on').textContent)) showStore('altin'); }).catch(function () {}); };
    try { P.configure({ apiKey: key, appUserID: ACC.auth.id }).then(done, function () { IAP.configuredFor = null; }); } catch (e) { IAP.configuredFor = null; }
  }
  function iapSync(cb) { api('/api/iap/sync', accBody(), function (e, r) { if (e) { if (cb) cb(e); return; } if (r.player) accApply(r.player); if (cb) cb(null, r); }); }
  function iapBuy(prod, btn) {
    var P = iapPlugin(); if (!P || !IAP.ready) { toast(__L("Satın alma yalnız Google Play / App Store uygulamasında."), 'warn'); return; }
    var sp = IAP.store && IAP.store[prod.id]; if (!sp) { toast(__L("Bu ürün mağazada henüz tanımlı değil."), 'warn'); return; }
    btn.disabled = true;
    P.purchaseStoreProduct({ product: sp }).then(function () { toast(__L("Ödeme alındı, hesabına işleniyor…"), ''); iapSync(function (e, r) { btn.disabled = false; if (e) { toast(__L("Ödeme alındı ama hesaba işlenemedi; \"Satın almaları geri yükle\" ile tekrar dene."), 'warn'); return; } var c = (r && r.credited) || []; if (c.length) { sfx('place'); toast(__L("{0} alındı: {1}{2}", [(prod.name), (c[0].gold ? __L("+{0} altın", [(c[0].gold.toLocaleString(window.__LOC || 'tr-TR'))]) : ''), (c[0].items && c[0].items.length ? __L(" · {0} karakter", [(c[0].items.length)]) : '')]), '', 5000); } else toast(__L("Satın alma kaydedildi; altın birazdan hesabında görünür."), ''); showStore('altin'); }); })
      .catch(function (e) { btn.disabled = false; if (e && (e.userCancelled || /cancel/i.test(e.message || ''))) return; toast(__L("Satın alma tamamlanamadı: {0}", [((e && e.message) || __L("mağaza hatası"))]), 'warn'); });
  }
  function iapRestore(btn) { var P = iapPlugin(); if (!P) return; btn.disabled = true; P.restorePurchases().then(function () { iapSync(function (e, r) { btn.disabled = false; var n = r && r.credited ? r.credited.length : 0; toast(n ? __L("{0} satın alma hesabına işlendi.", [(n)]) : __L("Eksik satın alma bulunamadı."), ''); showStore('altin'); }); }).catch(function () { btn.disabled = false; toast(__L("Geri yükleme başarısız."), 'warn'); }); }
  function iapProducts(cb) { if (IAP.products.length) return cb(IAP.products); api('/api/iap/products', {}, function (e, r) { if (!e && r && r.products) IAP.products = r.products; cb(IAP.products); }); }
  function renderGoldStore(grid) {
    grid.innerHTML = __L("<p class=\"note\">Yükleniyor…</p>");
    iapProducts(function (list) {
      var native = !!iapPlugin(), ready = native && IAP.ready;
      grid.innerHTML = '';
      if (!list.length) { grid.innerHTML = __L("<p class=\"note\">Ürün listesi alınamadı.</p>"); return; }
      list.forEach(function (pr) { var ownedOnce = pr.once && pr.items && pr.items.length && pr.items.every(function (it) { return owns(it); }); var d = document.createElement('div'); d.className = 'item gold' + (pr.kind === 'pack' ? ' pack' : '');
        d.innerHTML = '<div class="pv"><div class="goldPv">' + (pr.kind === 'pack' ? '🎁' : '🪙') + (pr.gold ? '<b>' + pr.gold.toLocaleString(window.__LOC || 'tr-TR') + '</b>' : '<b>' + pr.items.length + ' karakter</b>') + '</div></div><div class="nm">' + esc(pr.name) + '</div><div class="note">' + esc(pr.desc) + '</div>' +
          (ownedOnce ? __L("<span class=\"have\">Sende</span>") : '<button class="primary buy">' + esc(IAP.prices[pr.id] || pr.priceHint) + (ready ? '' : __L(" · uygulamada")) + '</button>');
        var b = d.querySelector('button'); if (b) b.onclick = function () { if (ready) iapBuy(pr, b); else toast(native ? __L("Mağaza bağlantısı henüz hazır değil; biraz sonra tekrar dene.") : __L("Altın satın alma Google Play / App Store uygulamasında; web sürümünde altın yalnız oyundan kazanılır."), ''); };
        grid.appendChild(d); });
      var foot = document.createElement('p'); foot.className = 'note gnote'; foot.innerHTML = (native ? __L("Ödeme {0} üzerinden alınır; fiyatlar vergiler dâhildir. Satın alınan altın oyunda kazanılan altınla aynıdır, paraya çevrilemez.", [(/ios/.test((function () { try { return window.Capacitor.getPlatform(); } catch (e) { return ''; } })()) ? __L("App Store") : __L("Google Play"))]) : __L("Satın alma Google Play / App Store uygulamasında yapılır; web sürümünde altın yalnız maçlardan ve görevlerden kazanılır.")) + (native ? __L(" <button class=\"soft mini\" id=\"iapRestore\">Satın almaları geri yükle</button>") : '');
      grid.appendChild(foot); if ($('iapRestore')) $('iapRestore').onclick = function () { iapRestore(this); };
    });
  }
  var noticesShown = 0;
  function showNotices(list) { // yönetici uyarıları (şikâyet sonucu): bir kez gösterilir, "Anladım" sunucuya bildirir
    if (!list || !list.length || noticesShown) return; noticesShown = 1;
    overlay(__L("<h2>Yönetici bildirimi</h2>{0}<p class=\"note\">Bu karara itiraz etmek için Kullanım Koşulları'ndaki iletişim adresine 30 gün içinde yazabilirsin.</p><div class=\"row\"><button class=\"primary\" id=\"ntOk\">Anladım</button></div>", [(list.map(function (n) { return '<p class="noticeTxt"><small>' + esc(new Date(n.at).toLocaleString(window.__LOC || 'tr-TR')) + '</small><br>' + esc(n.text) + '</p>'; }).join(''))]));
    $('ntOk').onclick = function () { overlay(null); api('/api/me', accBody({ ackNotices: true }), function (e, p) { noticesShown = 0; if (!e && p) { ACC.player = p; } if (APP.state === 'LOBBY') showLobby(); }); };
  }
  function exportMyData() {
    if (!ACC.on) { toast(__L("Çevrim dışı: sunucu hesabı yok."), 'warn'); return; }
    api('/api/social/export', accBody(), function (e, out) { if (e) { toast(e.message, 'warn'); return; }
      try { var blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dongu-verilerim-' + ACC.auth.id + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000); toast(__L("Verilerin indirildi ({0} mesaj).", [((out.mesajlar || []).length)]), ''); } catch (ex) { toast(__L("İndirme başarısız: {0}", [(ex.message)]), 'warn'); } });
  }
  function showDeleteAccount() {
    if (!ACC.on) { toast(__L("Çevrim dışı: sunucu hesabı yok."), 'warn'); return; }
    overlay(__L("<h2>Hesabımı sil</h2><p><b>Geri alınamaz.</b> Hesabın (ad, karakter, altın, seviye, sahip olduğun ürünler, istatistikler), arkadaşlık ve engel listen, bütün özel mesajların ve kıraathanen silinir. Hakkındaki şikâyet kayıtlarında kimliğin anonimleştirilir. Satın alınmış ürünler hesapla birlikte silinir ve iade edilmez; satın alma kayıtları yasal süre boyunca ayrı tutulur.</p><p class=\"note\">Oyuncu kimliğin: <code>{0}</code>. Silmeden önce \"Verilerimi indir\" ile verilerini alabilirsin.</p><div class=\"row\"><button class=\"soft\" id=\"delNo\">Vazgeç</button><button class=\"primary danger\" id=\"delYes\">Evet, hesabımı sil</button></div>", [(esc(ACC.auth.id))]));
    $('delNo').onclick = function () { showHelp('settings'); };
    $('delYes').onclick = function () { $('delYes').disabled = true; api('/api/social/delete', accBody({ confirm: 'SIL' }), function (e) { if (e) { toast(e.message, 'warn'); $('delYes').disabled = false; return; }
      try { if (SOC.ws) { SOC.ws.onclose = null; SOC.ws.close(); } } catch (ex) {} try { localStorage.clear(); } catch (ex) {} ACC.auth = null; ACC.on = false; ACC.player = null; ACC.tried = false;
      overlay(__L("<h2>Hesabın silindi</h2><p>Hesabın ve verilerin silindi; bu cihazdaki oyun verileri de temizlendi. Teşekkürler, yine bekleriz.</p><div class=\"row\"><button class=\"primary\" id=\"delDone\">Tamam</button></div>"));
      $('delDone').onclick = function () { location.reload(); }; }); };
  }
  function accApply(p) { // sunucu kayıt yetkili: jeton ve dolap sunucudan gelir
    if (!p) return; ACC.player = p; ACC.on = true; setTimeout(socConnect, 0); /* v9.93: sosyal soket */
    wardrobe.coins = p.coins; wardrobe.owned = p.owned.slice(); saveWardrobe(); dropUnownedChar(); // v9.88: sunucu dolabına göre giyili özel karakter denetimi
    if (p.skinGiftNew) giftPending = true; // hoş geldin bildirimi (sunucu bayrağı ilk görünümde düşürür: bir kez)
    if (p.notices && p.notices.length) setTimeout(function () { showNotices(p.notices); }, 900); // v10.01: yönetici uyarısı
    if (p.nameFix && p.nameFix.name) { var avF = normAvatar(myAvatar || DEFAULT_AV); if (avF.name !== p.nameFix.name) { avF.name = p.nameFix.name; myAvatar = avF; store('ao.avatar', myAvatar); } if (p.nameFix.why) { var wf = p.nameFix.why; setTimeout(function () { toast(wf, 'warn', 6000); }, 500); } } // v10.11 (K178): sunucu adı kabul etmediyse (süzgeç, yönetici sıfırlaması, kilit) cihazdaki ad sunucununkine döner
    if (p.badgeNew && p.badgeNew.season) setTimeout(function () { toast(__L("🏆 Tebrikler! {0} liginde {1}. oldun — rozetin profilinde.", [(Economy.seasonLabel(p.badgeNew.season)), (p.badgeNew.rank)]), '', 8000); }, 1500); // v10.09 (K174): sezon sonu ilk 3 rozeti (bir kez)
    setTimeout(iapInit, 50); // v10.03: mağaza satın alma SDK'sı (yalnız uygulamada)
    if (APP.state === 'LOBBY') showLobby();
  }
  // ---------- Skin hediyesi (8 Ekim 2026): her oyuncuya BİR KEZ, her skinden 1 ücretsiz kullanım ----------
  // Çaktırmadan Bak ('bak') + 4 Masa Giriş Skini. Sunucu hesabı varsa hak hesapta (player.freeSkins; çevrim içi masada sunucu düşer, bot masasında /api/skinuse),
  // hesapsız prototipte cihazda (wardrobe.freeSkins). Eğitim denemeleri (PEEK.tut / PEEK.trial) bu hakları hiç kullanmaz. Satın alımlar ve K5 hak kuralı değişmez.
  var giftPending = false;
  function skinIds() { return ['bak', 'tersten_el', 'ince_ayar', 'gosterissiz_numara', 'ortayi_kokla']; }
  function localGift() { if (wardrobe.skinGift) return; wardrobe.freeSkins = {}; skinIds().forEach(function (id) { wardrobe.freeSkins[id] = 1; }); wardrobe.skinGift = Date.now(); wardrobe.skinGiftNew = true; saveWardrobe(); }
  function freeSkins() { return ACC.on ? ((ACC.player && ACC.player.freeSkins) || {}) : (wardrobe.freeSkins || {}); }
  function freeLeft(id) { return freeSkins()[id] || 0; }
  function paidUses() { return ACC.on ? ((ACC.player && ACC.player.skinUses) || {}) : (wardrobe.skinUses || {}); } // v9.88: satın alınmış kullanım hakları (mağaza paketi)
  function paidLeft(id) { return paidUses()[id] || 0; }
  function usePaidSkin(id, cb) { // bot masasında satın alınmış kullanım: hesaptan 1 düşer (çevrim içi masada sunucu kendisi düşer)
    if (ACC.on) { if (ACC.player && ACC.player.skinUses && ACC.player.skinUses[id] > 0) ACC.player.skinUses[id]--; api('/api/skinuse', accBody({ skin: id, paid: 1 }), function (e, r) { if (!e && r && r.player) accApply(r.player); if (cb) cb(); }); return; }
    if (wardrobe.skinUses && wardrobe.skinUses[id] > 0) { wardrobe.skinUses[id]--; saveWardrobe(); }
    if (cb) cb();
  }
  var PAID_NOTE = __L("Satın alınmış kullanım hakkından 1 düştü.");
  function useFreeSkin(id, cb) { // kullanım oyun tarafından kabul edildi: hak düşer (bot masası). Çevrim içi masada sunucu kendisi düşer ('peek' cevabı usedFree / maç başı introTrialUsed).
    if (ACC.on) { if (ACC.player && ACC.player.freeSkins && ACC.player.freeSkins[id] > 0) ACC.player.freeSkins[id]--; api('/api/skinuse', accBody({ skin: id }), function (e, r) { if (!e && r && r.player) accApply(r.player); if (cb) cb(); }); return; } // v9.88: skin kimliği 'skin' alanında (eski 'id' hesap kimliğini eziyordu → sunucu hak düşmüyordu)
    if (wardrobe.freeSkins && wardrobe.freeSkins[id] > 0) { wardrobe.freeSkins[id]--; saveWardrobe(); }
    if (cb) cb();
  }
  function giftToastIfPending() { // lobide bir kez: oyuncu görsün diye giriş geçişinde değil lobide gösterilir
    if (!ACC.on && wardrobe.skinGiftNew) { delete wardrobe.skinGiftNew; saveWardrobe(); giftPending = true; }
    if (!giftPending) return; giftPending = false;
    setTimeout(function () { toast(__L("Hoş geldin! Her skinden 1 ücretsiz kullanım hakkı kazandın. Skinlerini sağdaki panelden deneyebilirsin."), '', 4500); }, 500);
  }
  function accProfile() { var a = normAvatar(myAvatar || DEFAULT_AV); return { name: a.name, avatar: a, prefs: { skins: settings.skins !== false } }; } // v10.12 (K181): skin tercihi hesapta (sunucu hedefli skinleri buna göre reddeder)
  function matchAvatar() { // masaya oturulurken gönderilen görünüm: Masa Giriş Skini = sahip olunan aktif skin; yoksa ücretsiz deneme olarak seçilen skin (sunucu hak var mı diye doğrular, maç başında düşer)
    var a = normAvatar(myAvatar || DEFAULT_AV), it = catItem('intro', a.intro);
    if (!(it && owns(it.id))) delete a.intro; // v10.06 (K159): maç başı deneme kuyruğu kalktı
    return a;
  }
  function accBoot(cb) { // girişte: hesap varsa eşitle, yoksa misafir hesabı aç; cb her durumda çağrılır
    cb = cb || function () {};
    if (!selfHosted() || ACC.tried) { cb(); return; } ACC.tried = true;
    var noServer = function (e) { return e && /json|unexpected token|noServer/i.test(e.message || ''); }; // yanıt JSON değil: bu adreste hesap sunucusu yok (sessizce çevrim dışı)
    if (ACC.auth && ACC.auth.id) api('/api/me', accBody(accProfile()), function (e, p) {
      if (!e) { accApply(p); cb(); return; }
      if (/bulunamadı/.test(e.message)) { ACC.auth = null; store('ao.auth', null); ACC.tried = false; accBoot(cb); } // sunucu sıfırlandıysa yeni misafir
      else { if (!noServer(e)) toast(__L("Sunucuya ulaşılamadı, çevrim dışı devam."), 'warn'); cb(); }
    });
    else api('/api/guest', Object.assign(accProfile(), { owned: wardrobe.owned, consent: load('ao.consent', null) || undefined }), function (e, r) { if (e) { if (!noServer(e)) toast(__L("Sunucuya ulaşılamadı, çevrim dışı devam."), 'warn'); cb(); return; } ACC.auth = { id: r.id, token: r.token }; store('ao.auth', ACC.auth); accApply(r.player); cb(); });
  }
  function accSync() { if (ACC.on) api('/api/me', accBody(accProfile()), function (e, p) { if (!e) { ACC.player = p; } }); } // isim/avatar değişince
  function accBuy(item, cb, tx) { api('/api/buy', accBody({ item: item.id, tx: tx || ('tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)) }), function (e, r) { if (e) { toast(e.message, 'warn'); if (cb) cb(e); return; } accApply(r.player); if (r.repeated) { toast(__L("Bu işlem zaten yapılmıştı; ikinci kez altın düşmedi."), ''); } cb(null, r); }); } // v9.88: işlem kimliği — çift dokunma / yeniden deneme ikinci tahsilat yapmaz
  function accBonus() {
    api('/api/bonus', accBody(), function (e, r) { if (e) { toast(e.message, 'warn'); return; } accApply(r.player); sfx('place'); toast(__L("Günlük giriş ödülü: +{0} altın!", [(r.amount)]), ''); });
  }
  // Botlara karşı (antrenman) el bitti: sunucu hesabı varsa sunucuya bildirilir, yoksa aynı formül yerelde uygulanır. Eğitimde ve çevrim içinde çağrılmaz.
  function settleTrainingHand(g) {
    if (!g || g.tutorial || NET.online || g.phase !== 'handover' || !g.handOver) return;
    var key = (g.matchId || 'L') + ':' + g.hand; if (!g.settled) g.settled = {}; if (g.settled[key]) return; g.settled[key] = true; saveGame();
    if (ACC.on) { api('/api/result', accBody({ hands: 1 }), function (e, r) { if (e) { if (!/hızlı/.test(e.message)) toast(e.message, 'warn'); return; } accApply(r.player); showRewardLines(g.hand, r.reward); }); return; }
    var out = Economy.settleTraining(wardrobe, { ranks: g.handOver.ranks, me: ME, humans: 1 }, Date.now()); saveWardrobe();
    showRewardLines(g.hand, { gold: out.gold, xp: out.xp, lines: out.lines, levelUp: out.levelUp, training: true });
  }
  var rewardByHand = {}; // el → ödül satırları (defterde gösterilir)
  function showRewardLines(hand, rw) {
    if (!rw) return;
    var prev = rewardByHand[hand];
    if (prev && prev !== rw) rw = { gold: (prev.gold || 0) + (rw.gold || 0), xp: (prev.xp || 0) + (rw.xp || 0), lines: (prev.lines || []).concat(rw.lines || []), levelUp: rw.levelUp || prev.levelUp, training: prev.training }; // aynı el için birden çok ödül mesajı (el ödülü + havuz) birleşir
    rewardByHand[hand] = rw;
    var box = $('lgReward'); if (box && G && G.hand === hand) box.innerHTML = rewardHTML(rw); else rewardToast(rw);
    if (rw.levelUp && rw.levelUp.to > rw.levelUp.from) setTimeout(function () { var lu = rw.levelUp, opened = CATALOG.filter(function (c) { var n = Economy.itemLevel(c.id); return n > lu.from && n <= lu.to; }).map(function (c) { return c.name; }); toast(__L("Seviye atladın! Seviye {0} · +{1} altın{2}", [(lu.to), (lu.gold), (opened.length ? __L(" · Mağazada açıldı: {0}", [(opened.join(', '))]) : '')]), '', opened.length ? 5000 : 3000); confetti(); }, 900); // v9.86: seviyeyle açılan kostümler de söylenir
    var newA = (rw.lines || []).filter(function (l) { return /^(Yeni mekân açıldı|New venue unlocked)/.test(l); }); if (newA.length) setTimeout(function () { toast(__L("{0} Lobide seçebilirsin.", [(newA.join(' '))]), '', 4500); confetti(); }, rw.levelUp ? 2600 : 1200); // v9.86
  }
  function rewardHTML(rw) { var lines = rw.lines && rw.lines.length ? rw.lines : [__L("Ödül: +{0} altın · +{1} XP", [(rw.gold || rw.coins || 0), (rw.xp || rw.handXp || 0)])]; return __L("<div class=\"rwbox\"><b>Ödül</b>{0}</div>", [(lines.map(function (l) { return '<div>' + l + '</div>'; }).join(''))]); }
  function rewardToast(rw) {
    if (!rw) return; var xp = (rw.xp || 0) + (rw.handXp || 0) + (rw.matchXp || 0), gold = (rw.gold || 0) + (rw.coins || 0) + (rw.matchGold || 0), parts = [];
    if (gold) parts.push(__L("+{0} altın", [(gold)])); if (xp) parts.push(__L("+{0} XP", [(xp)]));
    if (parts.length) toast(__L("Ödül: {0}", [(parts.join(' · '))]), ''); else if (rw.lines && rw.lines.length) toast(rw.lines[0], '');
  }
  function levelHTML() {
    var p = levelInfo(); if (!p) return '';
    var pct = p.need ? Math.round(100 * p.into / p.need) : 100;
    return __L("<div class=\"lvl\"><b>Seviye {0}</b><div class=\"bar\"><i style=\"width:{1}%\"></i></div><small>{2}</small></div>", [(p.level), (pct), (p.need ? __L("{0} / {1} XP", [(p.into), (p.need)]) : __L("en üst seviye"))]);
  }
  function normAvatar(a) {
    a = a || {};
    if (a.v !== 2) { // eski vektör profilinden geçiş
      var old = a; a = Object.assign({}, DEFAULT_AV, { name: old.name || 'Sen' });
      if (old.outfit === 'blouse' || old.outfit === 'dress' || old.hair === 'long' || old.hair === 'bob' || old.hair === 'pony' || old.hair === 'bun') { a.gender = 'kadin'; a.hair = 'dalgali'; }
      if (old.hairColor && /^#[0-9a-f]{6}$/i.test(old.hairColor)) a.hairColor = old.hairColor;
    }
    var o = Object.assign({}, DEFAULT_AV, a);
    Object.keys(AV).forEach(function (k) {
      var ok = AV[k].some(function (opt) { return (typeof opt === 'string' ? opt : opt[0]) === o[k]; });
      if (!ok) o[k] = DEFAULT_AV[k];
    });
    o.v = 2;
    if (o.intro && !INTRO_SKINS[o.intro]) delete o.intro;
    return o;
  }
  function randomAvatar() {
    var pick = function (arr) { var x = arr[Math.floor(Math.random() * arr.length)]; return typeof x === 'string' ? x : x[0]; };
    var a = Object.assign({}, DEFAULT_AV);
    Object.keys(AV_BASE).forEach(function (k) { // yeni yuvalar varsayılan 'yok' kalır; yalnız ücretsiz ya da sahip olunan seçenekler (ücretli ürün sahiplik olmadan rastgele giyilmez — sunucu zaten soyar, görünüm tutarsız olmasın)
      var opts = AV_BASE[k].filter(function (opt) { var v = typeof opt === 'string' ? opt : opt[0], it = catItem(k, v); return !it || it.free || owns(it.id); });
      a[k] = pick(opts.length ? opts : AV_BASE[k]);
    });
    if (a.gender === 'kadin') a.beard = 'yok';
    return a;
  }
  function hexRGB(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  // Çizim için etkin görünüm (çakışma kuralları; kayıtlı seçim değişmez): şapka varsa saç gizlenir ve eski bere çizilmez; yeni gözlük varsa eski pilot gözlüğü çizilmez;
  // sakal bıyık içeriyorsa (gür/kirli/Kaptan Çapa) ayrı bıyık çizilmez; eski bere yalnız eski saçlarla (bere uyumlu saç dosyası var) birlikte kullanılır.
  function effectiveAvatar(a) {
    var e = Object.assign({}, a);
    if (e.headwear !== 'yok') { if (e.acc === 'bere') e.acc = 'yok'; if (e.hair === 'kisa' || e.hair === 'dalgali' || e.hair === 'uzun') e.hatHair = true; else e.hair = 'yok'; } // v9.94: temel saçlar şapka altında kalır (bere-sac görseli); gardırop saçları şapkayla çakıştığı için kalkar
    if (e.eyewear !== 'yok' && e.acc === 'pilotgozlugu') e.acc = 'yok';
    if (e.acc === 'bere' && gardrop('hair', e.hair)) e.hair = 'yok';
    if (e.beard === 'gur' || e.beard === 'kirli' || e.beard === 'sakal-kaptan-capa') e.moustache = 'yok';
    GARDROP_SLOTS.forEach(function (k) { var it = gardrop(k, e[k]); if (it && it.gender && it.gender !== e.gender) e[k] = 'yok'; }); // v9.96: yalnız kadın gövdesi çizilmiş ürünler (ruj, fular) erkek karakterde çizilmez
    return e;
  }
  // katman listesi (oturan karakter, 480×480). Sıra: arka parçalar → gövde (ten + silme maskeleri) → alt → üst → boyun → küpe → sakal → bıyık → saç → gözlük → şapka → bilek
  function charLayers(a, pose) {
    a = effectiveAvatar(normAvatar(a)); var g = a.gender, p = pose === 'left' || pose === 'right' ? 'yan' : pose === 'front' || pose === 'on' ? 'on' : pose === 'back' || pose === 'arka' ? 'arka' : pose;
    var L = [], erase = [], rear = [];
    var gp = function (slot) { var v = a[slot], it = gardrop(slot, v); if (!it) return null; var base = 'assets/ch/' + g + '-' + v + '-' + p + '.webp'; if (it.erase) erase.push('assets/ch/erase-' + g + '-' + v + '-' + p + '.webp'); if (it.rear.indexOf('masa/' + p) >= 0) rear.push({ src: 'assets/ch/' + g + '-' + v + '-' + p + '-rear.webp', kind: it.tint ? 'hair' : null, color: a.hairColor, slot: slot, rear: true }); return { src: base, kind: it.tint ? 'hair' : null, color: a.hairColor, slot: slot }; }; // v10.13: slot etiketi (gardırop rig'i katmanları kemiklere dağıtır)
    var pants = gp('pants'), outfit = gp('outfit'), neck = gp('necklace'), ear = gp('earring'), beard = gp('beard'), mous = gp('moustache'), hair = gp('hair'), eye = gp('eyewear'), head = gp('headwear'), wrist = gp('wrist'), mak = gp('makeup');
    L.push({ src: 'assets/ch/govde-' + g + '-' + p + '.webp', kind: 'skin', mask: 'assets/ch/ten-maske-' + g + '-' + p + '.webp', color: a.skin, erase: erase, slot: 'skin' });
    if (mak && p !== 'arka') L.push(mak); // v9.96: makyaj (ruj) tenin üstünde, giysi/saçın altında
    if (pants) L.push(pants);
    L.push(outfit || { src: 'assets/ch/' + g + '-ust-' + a.outfit + '-' + p + '.webp', slot: 'outfit' });
    if (neck) L.push(neck);
    if (ear && !a.showcaseEar) L.push(ear);
    if (beard) L.push(beard); else if (a.beard !== 'yok' && p !== 'arka') L.push({ src: 'assets/ch/' + g + '-sakal-' + a.beard + '-' + p + '.webp', kind: 'hair', color: a.hairColor, slot: 'beard' });
    if (mous) L.push(mous);
    if (hair) L.push(hair); else if (a.hair !== 'yok') L.push({ src: (a.acc === 'bere' || a.hatHair ? 'assets/ch/bere-sac-' : 'assets/ch/' + g + '-sac-') + a.hair + '-' + p + '.webp', kind: 'hair', color: a.hairColor, slot: 'hair' });
    if (ear && a.showcaseEar) L.push(ear); // v9.94: mağaza önizlemesinde küpe saçın önünde (uzun saç küpeyi örtüyordu; kuşanınca normal katman sırası)
    if (eye) L.push(eye);
    if (a.acc !== 'yok') L.push({ src: 'assets/ch/' + g + '-aks-' + a.acc + '-' + p + '.webp', slot: 'acc', acc: a.acc });
    if (head) L.push(head);
    if (wrist) L.push(wrist);
    return rear.concat(L);
  }
  var imgCache = {};
  function loadImg(src) {
    if (imgCache[src]) return imgCache[src];
    imgCache[src] = new Promise(function (res, rej) { var im = new Image(); im.crossOrigin = 'anonymous'; im.onload = function () { res(im); }; im.onerror = function () { rej(src); }; im.src = src; });
    return imgCache[src];
  }
  var CS = 480, compCache = {};
  function tintCanvas(im, kind, color, maskIm) {
    var c = document.createElement('canvas'); c.width = CS; c.height = CS; var x = c.getContext('2d');
    x.drawImage(im, 0, 0, CS, CS);
    var d = x.getImageData(0, 0, CS, CS), px = d.data, rgb = hexRGB(color), i, n = px.length;
    if (kind === 'hair') { // gri -> koyu/ana/açık ton rampası
      var dark = rgb.map(function (v) { return v * .35; }), light = rgb.map(function (v) { return v + (255 - v) * .45; });
      for (i = 0; i < n; i += 4) {
        if (!px[i + 3]) continue;
        var t = px[i] / 255;
        for (var ch = 0; ch < 3; ch++) px[i + ch] = t < .55 ? dark[ch] + (rgb[ch] - dark[ch]) * (t / .55) : rgb[ch] + (light[ch] - rgb[ch]) * ((t - .55) / .45);
      }
    } else if (kind === 'skin' && maskIm) {
      var mc = document.createElement('canvas'); mc.width = CS; mc.height = CS; var mx = mc.getContext('2d'); mx.drawImage(maskIm, 0, 0, CS, CS);
      var md = mx.getImageData(0, 0, CS, CS).data;
      var r = [rgb[0] / BASE_SKIN[0], rgb[1] / BASE_SKIN[1], rgb[2] / BASE_SKIN[2]];
      for (i = 0; i < n; i += 4) {
        var m = md[i + 3] / 255; if (!m || !px[i + 3]) continue;
        for (var c2 = 0; c2 < 3; c2++) { var v = px[i + c2] * r[c2]; if (v > 255) v = 255; px[i + c2] = px[i + c2] + (v - px[i + c2]) * m; }
      }
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  // composeChar: katmanları birleştirip dataURL verir (önbellekli)
  function composeChar(a, pose) {
    a = normAvatar(a);
    if (pose === 'stand') { if (window.Venue && window.Venue.composeWalk && (a.full === 'yok' || !FULL_CHARS[a.full])) return window.Venue.composeWalk(a, 'durus', 'on'); pose = 'on'; } // tam boy duruş (alt giyim / bilek önizlemesi)
    if (a.full !== 'yok' && FULL_CHARS[a.full]) { var fp = pose === 'front' ? 'on' : pose === 'left' || pose === 'right' ? 'yan' : pose === 'back' ? 'arka' : pose; return Promise.resolve('assets/ch/' + FULL_CHARS[a.full].file + '-' + fp + '.webp'); }
    if (pose === 'bust') pose = 'on';
    var key = [GARDROP_VERSION, a.gender, pose, a.skin, a.hair, a.hairColor, a.beard, a.outfit, a.acc, a.moustache, a.pants, a.headwear, a.eyewear, a.necklace, a.earring, a.wrist, a.makeup, a.showcaseEar ? 'se' : ''].join('|');
    if (compCache[key]) return compCache[key];
    var layers = charLayers(a, pose);
    compCache[key] = Promise.all(layers.map(function (l) { return Promise.all([loadImg(l.src).catch(function () { return null; }), l.mask ? loadImg(l.mask).catch(function () { return null; }) : null, Promise.all((l.erase || []).map(function (u) { return loadImg(u).catch(function () { return null; }); }))]); })).then(function (ims) {
      var c = document.createElement('canvas'); c.width = CS; c.height = CS; var x = c.getContext('2d');
      ims.forEach(function (trip, i) {
        var im = trip[0]; if (!im) return; var l = layers[i];
        if (l.kind === 'skin') { // ten boyalı gövde; yeni giysilerin silme maskeleri yalnız gövdeye uygulanır (destination-out), eller/yüz korunur
          var bc = tintCanvas(im, 'skin', l.color, trip[1]); var masks = trip[2] || [];
          if (masks.length) { var bx = bc.getContext('2d'); bx.globalCompositeOperation = 'destination-out'; masks.forEach(function (m) { if (m) bx.drawImage(m, 0, 0, CS, CS); }); bx.globalCompositeOperation = 'source-over'; }
          x.drawImage(bc, 0, 0);
        } else if (l.kind === 'hair') x.drawImage(tintCanvas(im, 'hair', l.color, null), 0, 0); else x.drawImage(im, 0, 0, CS, CS);
      });
      return c.toDataURL('image/png');
    });
    return compCache[key];
  }
  // ---------- v10.13 (üretim 08-A/B/C, K167): oyuncunun kendi karakteri parçalı — ten gövdesi rig'i + giysi parçaları + mevcut saç/sakal/aksesuar katmanları kemiklere bağlı ----------
  var RIG_OUTFITS = ['mont-mavi', 'deri-ceket', 'kapusonlu', 'gunes-dikisi', 'gece-kimono', 'nane-atolye', 'mercan-ritim']; // 08-B'de parçalanan 7 üst giysi; dg24 üstler ve özel karakterler eski tek resim
  var GRIG = { cache: {}, order: [], MAX: 10 };
  function rigOutfit(a) { var o = String(a.outfit || '').replace(/^ust-/, ''); return RIG_OUTFITS.indexOf(o) >= 0 ? o : null; } // 'mont-mavi' (temel) ya da 'ust-gunes-dikisi' (gardırop ürünü) → 08-B dosya kökü
  function canGardropRig(a) { a = effectiveAvatar(normAvatar(a)); return !!(window.Rig && window.Rig.register && (!a.full || a.full === 'yok' || !FULL_CHARS[a.full]) && rigOutfit(a) && !settings.noRig); }
  function alphaUnion(ims) { var c = document.createElement('canvas'); c.width = CS; c.height = CS; var x = c.getContext('2d'); ims.forEach(function (im) { if (im) x.drawImage(im, 0, 0, CS, CS); }); return c; }
  function alphaBox(im) { var c = document.createElement('canvas'); c.width = CS; c.height = CS; var x = c.getContext('2d'); x.drawImage(im, 0, 0, CS, CS); var d = x.getImageData(0, 0, CS, CS).data; return d; }
  function overlapScore(da, db) { var n = 0; for (var i = 3; i < da.length; i += 16) if (da[i] > 40 && db[i] > 40) n++; return n; } // iki alfa kanalının örtüşmesi (4 pikselde bir örnek)
  function toBlobUrl(c, urls) { return new Promise(function (res) { if (!c.toBlob) { res(c.toDataURL('image/png')); return; } c.toBlob(function (b) { if (!b) { res(c.toDataURL('image/png')); return; } var u = URL.createObjectURL(b); urls.push(u); res(u); }, 'image/png'); }); }
  function gardropRig(a0, view) { // → Promise<rig adı | null>; aynı görünüm için bir kez üretilir (blob), en çok GRIG.MAX ayrı karakter bellekte
    a0 = effectiveAvatar(normAvatar(a0)); if (!canGardropRig(a0)) return Promise.resolve(null);
    var a = a0, g = a.gender, p = view === 'yan' || view === 'left' || view === 'right' ? 'yan' : view === 'on' || view === 'front' ? 'on' : null; if (!p) return Promise.resolve(null); // arka görünüm yok (08'de istenmedi)
    var key = ['g1', g, p, a.skin, a.hair, a.hairColor, a.beard, a.outfit, a.acc, a.moustache, a.pants, a.headwear, a.eyewear, a.necklace, a.earring, a.wrist, a.makeup].join('|');
    if (GRIG.cache[key]) return GRIG.cache[key];
    var name = 'gardrop:' + key.length + ':' + Math.abs(key.split('').reduce(function (h, ch) { return (h * 31 + ch.charCodeAt(0)) | 0; }, 7)).toString(36) + ':' + p;
    var pr = Rig.load('ten-' + g).then(function (def) {
      if (!def || !def.gorunumler || !def.gorunumler[p]) return null;
      var V = def.gorunumler[p], base = 'assets/rig/ten-' + g + '/', GB = 'assets/rig/gardrop/' + g + '-ust-' + rigOutfit(a) + '-' + p + '-';
      var bones = {}; V.parcalar.forEach(function (x) { bones[x.ad] = x; });
      var armNames = p === 'on' ? ['ustkol-sol', 'ustkol-sag', 'onkol-sol', 'onkol-sag'] : ['ustkol-on', 'ustkol-arka', 'onkol-on', 'onkol-arka'];
      var handNames = p === 'on' ? ['el-sol', 'el-sag'] : ['el-on', 'el-arka'];
      var all = charLayers(a, p), skinL = all.filter(function (l) { return l.slot === 'skin'; })[0], eraseSrc = (skinL && skinL.erase) || []; // dg24 üstlerin silme maskeleri: eski tek resimde gövdeyi giysi dışında siliyordu; rig'de beyaz içliğe uygulanır
      var layers = all.filter(function (l) { return l.slot && l.slot !== 'skin' && l.slot !== 'outfit'; });
      var urls = [], jobs = [];
      var L = function (src) { return loadImg(src).catch(function () { return null; }); };
      // yükle: ten gövdesi + baş varyantları + eller + giysi parçaları + statik katmanlar
      var need = { govde: L(base + bones.govde.dosya), bas: L(base + bones.bas.dosya) };
      Object.keys(bones.bas.varyant || {}).forEach(function (k) { need['bas:' + k] = L(base + bones.bas.varyant[k]); });
      handNames.forEach(function (h) { need[h] = L(base + bones[h].dosya); Object.keys(bones[h].varyant || {}).forEach(function (k) { need[h + ':' + k] = L(base + bones[h].varyant[k]); }); });
      armNames.forEach(function (n) { need['giysi:' + n] = L(GB + n + '.webp'); need['ten:' + n] = L(base + bones[n].dosya); }); need['giysi:govde'] = L(GB + 'govde.webp');
      layers.forEach(function (l, i) { need['lay:' + i] = L(l.src); }); eraseSrc.forEach(function (u, i) { need['erase:' + i] = L(u); });
      var keys = Object.keys(need);
      return Promise.all(keys.map(function (k) { return need[k]; })).then(function (ims) {
        var im = {}; keys.forEach(function (k, i) { im[k] = ims[i]; });
        if (!im.govde || !im.bas || !im['giysi:govde']) return null;
        var parts = [], out = {}, extra = [];
        var tint = function (i2) { return tintCanvas(i2, 'skin', a.skin, i2); };
        // gövde: beyaz içlik yalnız giysinin örtmediği yerde (08-C notu: nötr birleşik giysi alfasının tersi), altında pantolon, üstünde giysi gövdesi
        var gc = document.createElement('canvas'); gc.width = CS; gc.height = CS; var gx = gc.getContext('2d'); gx.drawImage(im.govde, 0, 0, CS, CS);
        var union = alphaUnion([im['giysi:govde']].concat(armNames.map(function (n) { return im['giysi:' + n]; })));
        gx.globalCompositeOperation = 'destination-out'; gx.drawImage(union, 0, 0); eraseSrc.forEach(function (u, i) { if (im['erase:' + i]) gx.drawImage(im['erase:' + i], 0, 0, CS, CS); }); gx.globalCompositeOperation = 'source-over';
        layers.forEach(function (l, i) { if (l.slot === 'pants' && im['lay:' + i]) gx.drawImage(im['lay:' + i], 0, 0, CS, CS); });
        gx.drawImage(im['giysi:govde'], 0, 0, CS, CS);
        jobs.push(toBlobUrl(gc, urls).then(function (u) { out.govde = u; }));
        jobs.push(toBlobUrl(tint(im.bas), urls).then(function (u) { out.bas = u; }));
        Object.keys(bones.bas.varyant || {}).forEach(function (k) { if (im['bas:' + k]) jobs.push(toBlobUrl(tint(im['bas:' + k]), urls).then(function (u) { out['bas:' + k] = u; })); });
        handNames.forEach(function (h) { if (im[h]) jobs.push(toBlobUrl(tint(im[h]), urls).then(function (u) { out[h] = u; })); Object.keys(bones[h].varyant || {}).forEach(function (k) { if (im[h + ':' + k]) jobs.push(toBlobUrl(tint(im[h + ':' + k]), urls).then(function (u) { out[h + ':' + k] = u; })); }); });
        // el astarı (08-C notu): tut/açık el pozları manşet altını dinlenme eli kadar örtmez → dinlenme elinin manşet kenarını saran şeridi (giysi ön kol alfası 8 px genişletilmiş) elin ve manşetin altına konur
        handNames.forEach(function (h) { var hb = bones[h]; if (!im[h] || !hb.varyant || Object.keys(hb.varyant).length < 2) return; var fore = hb.ebeveyn, gi = im['giysi:' + fore]; if (!gi) return;
          var mc = document.createElement('canvas'); mc.width = CS; mc.height = CS; var mx = mc.getContext('2d'); for (var dx = -8; dx <= 8; dx += 4) for (var dy = -8; dy <= 8; dy += 4) mx.drawImage(gi, dx, dy, CS, CS);
          var lc = tint(im[h]); var lx = lc.getContext('2d'); lx.globalCompositeOperation = 'destination-in'; lx.drawImage(mc, 0, 0); lx.globalCompositeOperation = 'source-over';
          jobs.push(toBlobUrl(lc, urls).then(function (u) { extra.push({ ad: h + '-astar', pivot: hb.pivot, ebeveyn: h, dosya: u, z: Math.min(hb.z, bones[fore].z) - 0.5, boyut: [CS, CS] }); })); });
        // statik katmanlar → kemik grupları
        var groups = { basArka: [], basOn: [], basMakyaj: [], govdeUst: [] }, wristL = [];
        layers.forEach(function (l, i) { var ii = im['lay:' + i]; if (!ii) return; var e = { im: ii, l: l };
          if (l.rear) groups.basArka.push(e);
          else if (l.slot === 'makeup') groups.basMakyaj.push(e);
          else if (l.slot === 'necklace' || (l.slot === 'acc' && l.acc === 'fular')) groups.govdeUst.push(e);
          else if (l.slot === 'wrist') wristL.push(e);
          else if (l.slot !== 'pants') groups.basOn.push(e); });
        var bake = function (list) { var c = document.createElement('canvas'); c.width = CS; c.height = CS; var x = c.getContext('2d'); list.forEach(function (e) { if (e.l.kind === 'hair') x.drawImage(tintCanvas(e.im, 'hair', e.l.color, null), 0, 0); else x.drawImage(e.im, 0, 0, CS, CS); }); return c; };
        var addStatic = function (nm, list, parent, z) { if (!list.length) return; var c = bake(list); jobs.push(toBlobUrl(c, urls).then(function (u) { extra.push({ ad: nm, pivot: bones[parent].pivot, ebeveyn: parent, dosya: u, z: z, boyut: [CS, CS] }); })); };
        addStatic('sac-arka', groups.basArka, 'bas', -1); addStatic('makyaj', groups.basMakyaj, 'bas', bones.bas.z + 0.1); addStatic('bas-ust', groups.basOn, 'bas', 20); addStatic('govde-ust', groups.govdeUst, 'govde', 15);
        if (wristL.length) { // bilek: hangi ön kol / elle örtüşüyorsa ona bağlanır (en üstte çizilir)
          var wd = alphaBox(wristL[0].im), best = null, bs = -1; armNames.slice(2).concat(handNames).forEach(function (n) { var ii = im['ten:' + n] || im[n]; if (!ii) return; var sc = overlapScore(wd, alphaBox(ii)); if (sc > bs) { bs = sc; best = n; } });
          addStatic('bilek', wristL, best || 'govde', 30); }
        return Promise.all(jobs).then(function () {
          V.parcalar.forEach(function (x) { var q = { ad: x.ad, pivot: x.pivot, ebeveyn: x.ebeveyn, z: x.z, boyut: x.boyut, dosya: null, varyant: null }; delete q.varyant;
            if (x.ad === 'govde') q.dosya = out.govde;
            else if (x.ad === 'bas') { q.dosya = out.bas; q.varyant = {}; Object.keys(x.varyant || {}).forEach(function (k) { if (out['bas:' + k]) q.varyant[k] = out['bas:' + k]; }); }
            else if (handNames.indexOf(x.ad) >= 0) { q.dosya = out[x.ad]; q.varyant = {}; Object.keys(x.varyant || {}).forEach(function (k) { if (out[x.ad + ':' + k]) q.varyant[k] = out[x.ad + ':' + k]; }); if (x.varyant_tutma) q.varyant_tutma = x.varyant_tutma; if (x.tutma) q.tutma = x.tutma; }
            else if (armNames.indexOf(x.ad) >= 0) q.dosya = im['giysi:' + x.ad] ? GB + x.ad + '.webp' : base + x.dosya; // giysi kolu ten kolunun yerine (aynı pivot); giysi parçası yoksa beyaz içlik kolu
            else q.dosya = base + x.dosya;
            if (!q.dosya) return; parts.push(q); });
          var nd = { surum: 1, karakter: name, tuval: CS, varsayilan_ifade: def.varsayilan_ifade, varsayilan_el: def.varsayilan_el, varsayilan_prop_gorunur: false, gorunumler: {}, _urls: urls };
          nd.gorunumler[p] = { parcalar: parts.concat(extra), proplar: [] };
          Rig.register(name, nd);
          GRIG.order.push(name); var inUse = {}; Rig.instances().forEach(function (i) { inUse[i.char] = 1; }); // ekranda kurulu olanlar atılmaz; en eski boştakiler atılır
          for (var oi = 0; oi < GRIG.order.length && GRIG.order.length > GRIG.MAX; ) { var old = GRIG.order[oi]; if (inUse[old]) { oi++; continue; } GRIG.order.splice(oi, 1); Rig.unregister(old); Object.keys(GRIG.cache).forEach(function (k) { if (GRIG.cache[k]._name === old) delete GRIG.cache[k]; }); }
          return name;
        });
      });
    }).catch(function () { return null; });
    pr._name = name; GRIG.cache[key] = pr; return pr;
  }
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  // <img class="av"> döndürür; hazır olunca kaynağı dolar
  function charImg(a, pose, cls) {
    var im = document.createElement('img'); im.className = 'av ' + (cls || ''); im.alt = ''; im.draggable = false; im.src = BLANK;
    composeChar(a, pose).then(function (url) { im.src = url; });
    return im;
  }
  function charImgHTML(a, pose, cls, style) { // innerHTML ile kullanmak için: yer tutucu + sonradan doldurma (style: v9.94 kadraj)
    var id = 'ci' + Math.random().toString(36).slice(2, 9);
    composeChar(a, pose).then(function (url) { var e = document.getElementById(id); if (e) e.src = url; });
    return __L("<img id=\"{0}\" class=\"av {1}\" alt=\"\" draggable=\"false\" src=\"{2}\"{3}>", [(id), (cls || ''), (BLANK), (style ? ' style="' + style + '"' : '')]);
  }
  var myAvatar = load('ao.avatar', null);
  function dropUnownedChar() { if (!myAvatar || !myAvatar.full || myAvatar.full === 'yok') return false; var fit = catItem('full', myAvatar.full); if (fit && !fit.free && !owns(fit.id)) { myAvatar.full = 'yok'; store('ao.avatar', myAvatar); return true; } return false; } // v9.88: sahip olunmayan özel karakter giyili kalmaz (sunucu da denetler)
  if (!load('ao.auth', null)) dropUnownedChar(); // hesapsız: yerel dolap kesin. Hesaplı: sunucu görünümü gelince (accApply) — başka cihazda alınmış karakter yerel dolapta henüz yoktur
  if (myAvatar) myAvatar = normAvatar(myAvatar);

  // ---------- taş ----------
  function tileEl(t, cls) {
    var d = document.createElement('div');
    d.className = 't' + (cls ? ' ' + cls : '');
    if (t.fake) d.classList.add('fake');
    else { d.classList.add('c' + t.c); var n = document.createElement('b'); n.className = 'n'; n.textContent = t.n; d.appendChild(n); var ic = document.createElement('i'); ic.className = 'ic'; d.appendChild(ic); }
    if (G && G.ok && Okey.isJoker(t, G.ok)) d.classList.add('joker');
    d.dataset.id = t.id;
    d.title = Okey.tileName(t);
    return d;
  }
  function backEl() { var d = document.createElement('div'); d.className = 't back'; return d; }
  function toast(msg, cls, ms) {
    var old = document.querySelector('.toast:not(.hint):not(.soc)'); if (old) old.remove(); /* v9.93: sosyal bildirim ayrı */
    var d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.textContent = msg; document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, ms || 2600);
  }

  // ---------- taş sesleri (WebAudio ile üretilir, dosya yok) ----------
  var AC = null;
  // v9.89 (K114): ses dosyaları — skin/karakter sesleri assets/sfx/<ad>.ogg'dan çalar (yüklenemezse sentez yedek kalır). Dosyalar ilk ses bağlamında bir kez yüklenir (küçük: ~10 KB/dosya).
  var SFX_FILES = { sniff: 'kokla', whoosh: 'tersten', tick: 'ince-ayar', snap: 'siklat', peekfx: 'bakis', slap: 'tokat', quack: 'ordek-vak', honk: 'palyaco-korna', buyrun: 'fikret-buyrun', mee: 'sakir-mee', cayting: 'cay-ting', tostok: 'tos-tok', muhurtak: 'muhur-tak', mirr: 'pamuk-mirr', hih: 'nine-hih', sis: 'nine-sis', oksuruk: 'muhtar-oksuruk', patipat: 'pati-pat', nazarcin: 'nazar-cin', yoklamahmm: 'yoklama-hmm', zafertef: 'zafer-tef' }, /* v9.90 (K115): ChatGPT üretim paketi 01 — gerçek kayıt/sentez dosyaları (lisans notları kontrol.txt) */ SFX_GAIN = { slap: 0.9, honk: 0.7, quack: 0.75 }, sfxBuf = {}, sfxLoaded = false;
  function loadSfxFiles() {
    if (sfxLoaded || !AC || typeof fetch !== 'function') return; sfxLoaded = true;
    Object.keys(SFX_FILES).forEach(function (k) { var f = SFX_FILES[k]; fetch('assets/sfx/' + f + '.ogg').then(function (r) { if (!r.ok) throw new Error(f); return r.arrayBuffer(); }).then(function (ab) { return new Promise(function (res, rej) { AC.decodeAudioData(ab, res, rej); }); }).then(function (buf) { sfxBuf[f] = buf; }).catch(function () {}); });
  }
  function audio() { if (!settings.sound) return null; try { if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); loadSfxFiles(); } if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
  function noise(ctx, dur) { var n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2); return b; }
  function sfx(kind) {
    var ctx = audio(); if (!ctx) return;
    var fn = SFX_FILES[kind]; if (fn && sfxBuf[fn]) { var fs = ctx.createBufferSource(); fs.buffer = sfxBuf[fn]; var fg = ctx.createGain(); fg.gain.value = SFX_GAIN[kind] || 0.8; fs.connect(fg); fg.connect(ctx.destination); fs.start(ctx.currentTime); return; } // dosya varsa dosya (v9.89), yoksa aşağıdaki sentez
    var t = ctx.currentTime, g = ctx.createGain(); g.connect(ctx.destination);
    var src = ctx.createBufferSource(); var f = ctx.createBiquadFilter(); src.connect(f); f.connect(g);
    if (kind === 'tap') { src.buffer = noise(ctx, .05); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.2; g.gain.setValueAtTime(.35, t); }
    else if (kind === 'place') { src.buffer = noise(ctx, .09); f.type = 'lowpass'; f.frequency.value = 1400; g.gain.setValueAtTime(.55, t); var o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(140, t + .08); og.gain.setValueAtTime(.18, t); og.gain.exponentialRampToValueAtTime(.001, t + .09); o.connect(og); og.connect(ctx.destination); o.start(t); o.stop(t + .1); }
    else if (kind === 'slide') { src.buffer = noise(ctx, .16); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = .7; g.gain.setValueAtTime(.16, t); }
    else if (kind === 'draw') { src.buffer = noise(ctx, .07); f.type = 'highpass'; f.frequency.value = 1800; g.gain.setValueAtTime(.25, t); }
    else if (kind === 'snap') { src.buffer = noise(ctx, .03); f.type = 'highpass'; f.frequency.value = 3200; g.gain.setValueAtTime(.5, t); var o3 = ctx.createOscillator(), og3 = ctx.createGain(); o3.type = 'square'; o3.frequency.setValueAtTime(1900, t); o3.frequency.exponentialRampToValueAtTime(600, t + .05); og3.gain.setValueAtTime(.12, t); og3.gain.exponentialRampToValueAtTime(.001, t + .07); o3.connect(og3); og3.connect(ctx.destination); o3.start(t); o3.stop(t + .08); }
    else if (kind === 'turn') { src.buffer = noise(ctx, .01); g.gain.setValueAtTime(.001, t); [660, 880].forEach(function (fr, i) { var ot = ctx.createOscillator(), gt = ctx.createGain(); ot.type = 'sine'; ot.frequency.setValueAtTime(fr, t + i * .12); gt.gain.setValueAtTime(.0001, t + i * .12); gt.gain.exponentialRampToValueAtTime(.35, t + i * .12 + .02); gt.gain.exponentialRampToValueAtTime(.001, t + i * .12 + .25); ot.connect(gt); gt.connect(ctx.destination); ot.start(t + i * .12); ot.stop(t + i * .12 + .3); }); } // sıran geldi: iki notalı çan
    else if (kind === 'click') { src.buffer = noise(ctx, .025); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 2; g.gain.setValueAtTime(.4, t); }
    else if (kind === 'cloth') { src.buffer = noise(ctx, .22); f.type = 'lowpass'; f.frequency.value = 650; g.gain.setValueAtTime(.14, t); }
    else if (kind === 'slap') { src.buffer = noise(ctx, .12); f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(.9, t); var o2 = ctx.createOscillator(), og2 = ctx.createGain(); o2.type = 'triangle'; o2.frequency.setValueAtTime(260, t); o2.frequency.exponentialRampToValueAtTime(90, t + .18); og2.gain.setValueAtTime(.3, t); og2.gain.exponentialRampToValueAtTime(.001, t + .2); o2.connect(og2); og2.connect(ctx.destination); o2.start(t); o2.stop(t + .22); }
    // v9.88 (K110) skin sesleri — sentezlenmiş yer tutucular (gerçek ses dosyaları gelince aynı adlarla değiştirilir); kısa, üst üste binmez
    else if (kind === 'sniff') { src.buffer = noise(ctx, .16); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(2200, t + .14); f.Q.value = 2.5; g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.4, t + .03); g.gain.exponentialRampToValueAtTime(.2, t + .09); g.gain.exponentialRampToValueAtTime(.45, t + .12); }
    else if (kind === 'whoosh') { src.buffer = noise(ctx, .28); f.type = 'bandpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2600, t + .22); f.Q.value = 1.1; g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.35, t + .1); }
    else if (kind === 'tick') { src.buffer = noise(ctx, .02); f.type = 'bandpass'; f.frequency.value = 3400; f.Q.value = 3; g.gain.setValueAtTime(.45, t); var ot = ctx.createOscillator(), gt = ctx.createGain(); ot.type = 'square'; ot.frequency.setValueAtTime(2400, t); gt.gain.setValueAtTime(.08, t); gt.gain.exponentialRampToValueAtTime(.001, t + .04); ot.connect(gt); gt.connect(ctx.destination); ot.start(t); ot.stop(t + .05); }
    else if (kind === 'peekfx') { src.buffer = noise(ctx, .01); g.gain.setValueAtTime(.001, t); [520, 390].forEach(function (fr, i) { var o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(fr, t + i * .11); og.gain.setValueAtTime(.001, t + i * .11); og.gain.exponentialRampToValueAtTime(.18, t + i * .11 + .02); og.gain.exponentialRampToValueAtTime(.001, t + i * .11 + .12); o.connect(og); og.connect(ctx.destination); o.start(t + i * .11); o.stop(t + i * .11 + .14); }); }
    else if (kind === 'quack') { src.buffer = noise(ctx, .01); g.gain.setValueAtTime(.001, t); var oq = ctx.createOscillator(), gq = ctx.createGain(), fq = ctx.createBiquadFilter(); oq.type = 'sawtooth'; oq.frequency.setValueAtTime(330, t); oq.frequency.exponentialRampToValueAtTime(240, t + .16); fq.type = 'lowpass'; fq.frequency.value = 1400; gq.gain.setValueAtTime(.001, t); gq.gain.exponentialRampToValueAtTime(.22, t + .02); gq.gain.exponentialRampToValueAtTime(.001, t + .2); oq.connect(fq); fq.connect(gq); gq.connect(ctx.destination); oq.start(t); oq.stop(t + .22); }
    else if (kind === 'honk') { src.buffer = noise(ctx, .01); g.gain.setValueAtTime(.001, t); [196, 247].forEach(function (fr, i) { var o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(fr, t + i * .13); og.gain.setValueAtTime(.001, t + i * .13); og.gain.exponentialRampToValueAtTime(.12, t + i * .13 + .02); og.gain.exponentialRampToValueAtTime(.001, t + i * .13 + .14); o.connect(og); og.connect(ctx.destination); o.start(t + i * .13); o.stop(t + i * .13 + .16); }); }
    g.gain.exponentialRampToValueAtTime(.001, t + (kind === 'whoosh' ? .3 : .2));
    src.start(t);
  }
  var SKIN_SFX = { tersten_el: 'whoosh', ince_ayar: 'tick', gosterissiz_numara: 'snap', ortayi_kokla: 'sniff' }; // Masa Giriş Skini → ses (herkese görünen gösteri: herkes duyar)
  var CHAR_SFX = { ordek: 'quack', palyaco: 'honk', fikret: 'buyrun', sakir: 'mee', pamuk: 'mirr', nine: 'hih', muhtar: 'oksuruk' }; // v9.90: Fikret ve Şakir motifleri (dosya) // karaktere özgü kısa motif (gösteriden sonra)
  var sfxLast = {}; function sfxOnce(kind, key, gapMs) { var k = key || kind, now = Date.now(); if (now - (sfxLast[k] || 0) < (gapMs || 400)) return; sfxLast[k] = now; sfx(kind); } // aynı olay üst üste çalmasın

  // ---------- oyun ----------
  var G = null, sel = [], botTimer = null, tutorial = null, lastActor = null, lastTurnKey = null;
  var rack = [];
  var RACK_ROWS = 2;
  function names() { if (NET.online && G && G.names) return G.names; return [myAvatar ? myAvatar.name : 'Sen', __L("Ali"), __L("Ayşe"), __L("Mehmet")]; }
  function tileById(id) {
    var me = G.players[ME];
    for (var i = 0; i < me.hand.length; i++) if (me.hand[i].id === id) return me.hand[i];
    return null;
  }

  function saveGame() {
    if (G && NET.online && !G.tutorial) saveNetRack();
    if (!G || G.tutorial || NET.online) return; // eğitim ve çevrim içi maç yerelde kaydedilmez, puana/bakiyeye yansımaz
    if (G.finished) { try { localStorage.removeItem('ao.game'); } catch (e) {} return; } // biten maç devam ettirilmez; kayıt temizlenir
    store('ao.game', { g: Okey.serialize(G), rack: rack });
  }
  function restoreGame() {
    var s = load('ao.game', null);
    if (!s || !s.g) return false;
    try {
      G = Okey.deserialize(s.g);
      G.names = names();
      rack = s.rack || [];
      sel = [];
      return !G.finished;
    } catch (e) { return false; }
  }

  function newGame(withTutorial, tutKind, noIntro) {
    rewardByHand = {}; // yeni maç: eski ödül satırları karışmasın
    clearTimeout(botTimer); screen(null); TRIAL = null;
    G = Okey.newGame({ names: names(), jokerCapturePenalty: settings.jokerPenalty, totalHands: withTutorial ? 12 : settings.mode });
    if (!withTutorial && settings.mode === 1 && !settings.firstBotMatch) { G.taskOrder = [Math.random() < 0.5 ? 0 : 1]; settings.firstBotMatch = true; saveSettings(); } // v9.89 (K112): ilk bot masası maçında kolay görev (3'lü renkli / 3'lü seri); yalnız yerel masa
    G.tutorial = !!withTutorial; G.tutGame = withTutorial ? (tutKind || 'basic') : null; G.botCalm = !!withTutorial; G.matchId = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); // v9.89: eğitim botları eli bitirmez (K111)
    rack = []; sel = []; built = false; // v10.06 (K158): her yeni maçta masa (koltuklar, karakterler) yeniden kurulur
    tutorial = null; listeners = listeners.filter(function (f) { return f !== onTutEvent; });
    APP.state = withTutorial ? 'TUTORIAL' : 'GAME';
    nextHand(withTutorial, tutKind, noIntro);
  }
  function nextHand(withTutorial, tutKind, noIntro) {
    Okey.startHand(G); zonePrev = { 0: null, 1: null, 2: null, 3: null }; meldPos = {};
    rack = []; sel = [];
    if (withTutorial) { if (tutKind === 'isleme') rigIsleme(); else rigTutorialHand(); }
    syncRack(true);
    if (withTutorial && tutKind !== 'isleme') scrambleRack();
    saveGame();
    if (withTutorial && (noIntro || tutKind === 'isleme')) { built = false; render(); startTutorial(); return; }
    showHandIntro(withTutorial);
  }
  // İşleme ve Okey senaryosu: açılmış oyuncu, sıra onda; masada okeyli seri, iki renk + okeyli renkli per ve düz bir seri; elinde tam uyan taşlar
  function rigIsleme() {
    if (G.ok.fakeIsOkey) { // sahte okey göstergeli elde ikinci joker olmaz: göstergeyi desteden normal bir taşla değiştir
      var di = -1; for (var k = G.deck.length - 1; k >= 0; k--) if (!G.deck[k].fake) { di = k; break; }
      if (di >= 0) { var ind = G.deck[di]; G.deck[di] = G.indicator; G.indicator = ind; G.ok = { fakeIsOkey: false, c: ind.c, n: ind.n === 13 ? 1 : ind.n + 1 }; }
    }
    var ok = G.ok, me = G.players[ME];
    G.dealer = 3; G.cp = 0; G.phase = 'play'; G.turnNo = 12; G.claimQueue = [];
    var pool = G.deck.slice(); G.players.forEach(function (p) { pool = pool.concat(p.hand); p.hand = []; p.discards = []; });
    function take(c, n) { for (var i = 0; i < pool.length; i++) { var t = pool[i]; if (!t.fake && t.c === c && t.n === n && !Okey.isJoker(t, ok)) return pool.splice(i, 1)[0]; } return null; }
    function takeJoker() { for (var i = 0; i < pool.length; i++) if (Okey.isJoker(pool[i], ok)) return pool.splice(i, 1)[0]; return null; }
    var oc = ok.fakeIsOkey ? 0 : ok.c, on = ok.fakeIsOkey ? 0 : ok.n;
    var ca = (oc + 1) % 4, cb1 = (oc + 1) % 4, cb2 = (oc + 2) % 4, cb3 = (oc + 3) % 4, cb4 = oc, cc = (oc + 2) % 4;
    var nb = on === 12 ? 11 : 12; tutNb = nb;
    var A = [take(ca, 3), take(ca, 4), takeJoker(), take(ca, 6)], B = [take(cb1, nb), take(cb2, nb), takeJoker()], C = [take(cc, 7), take(cc, 8), take(cc, 9)];
    var mine = [take(cc, 10), take(ca, 5), take(cb3, nb)];
    var cand = [[cb3, 1], [cb3, 2], [oc, 4], [oc, 8], [cb3, 9], [oc, 10], [cb3, 4]], fill = [];
    cand.forEach(function (x) { if (fill.length >= 4) return; if (x[0] === oc && x[1] === on) return; var t = take(x[0], x[1]); if (t) fill.push(t); });
    var okTiles = A.concat(B, C, mine, fill).every(function (t) { return !!t; });
    if (!okTiles) { // beklenmedik durum: olağan eğitim eline dön
      G.deck = pool.concat(A, B, C, mine, fill).filter(function (t) { return !!t; }); G.players.forEach(function (p) { p.hand = G.deck.splice(0, 14); }); rigTutorialHand(); return;
    }
    A[2].placedBy = 3; B[2].placedBy = 1;
    G.table = [{ tiles: A, kind: 'run', owner: 3 }, { tiles: B, kind: 'set', owner: 1 }, { tiles: C, kind: 'run', owner: 2 }];
    me.hand = mine.concat(fill); me.opened = true; me.openedThisTurn = false; me.openedTurnNo = 4;
    [1, 2, 3].forEach(function (p) { var pl = G.players[p]; pl.opened = true; pl.openedThisTurn = false; pl.openedTurnNo = p; pl.hand = pool.splice(0, 10); });
    G.players[3].discards.push(pool.pop()); G.lastDiscarder = 3;
    G.deck = pool;
    var nm = function (c, n) { return Okey.tileName({ c: c, n: n, fake: false }); };
    tutRig = { c10: nm(cc, 10), c7: nm(cc, 7), c9: nm(cc, 9), a3: nm(ca, 3), a4: nm(ca, 4), a5: nm(ca, 5), a6: nm(ca, 6), b1: nm(cb1, nb), b2: nm(cb2, nb), b3: nm(cb3, nb), b4: nm(cb4, nb), ids: { c10: mine[0].id, a5: mine[1].id, b3: mine[2].id } };
  }

  // eğitim için: oyuncu başlar; elinde üç renkte N (renkli per) ve bir renkte ardışık üç taş (seri per) olur
  var tutN = 7, tutRunColor = 2;
  function rigTutorialHand(keepTurn) {
    if (!keepTurn) { G.dealer = 3; G.cp = 0; }
    var ok = G.ok;
    tutN = (!ok.fakeIsOkey && ok.n === 7) ? 8 : 7;
    tutRunColor = (!ok.fakeIsOkey && ok.c === 2 && ok.n >= 3 && ok.n <= 7) ? 3 : 2;
    var want = [[0, tutN], [1, tutN], [2, tutN], [tutRunColor, 4], [tutRunColor, 5], [tutRunColor, 6]];
    var me = G.players[ME];
    var pools = [G.deck].concat(G.players.slice(1).map(function (p) { return p.hand; }));
    var isWanted = function (t) { return !t.fake && want.some(function (w) { return w[0] === t.c && w[1] === t.n; }); };
    want.forEach(function (w) {
      if (me.hand.some(function (t) { return !t.fake && t.c === w[0] && t.n === w[1]; })) return;
      for (var pi = 0; pi < pools.length; pi++) {
        var pool = pools[pi];
        for (var i = 0; i < pool.length; i++) {
          var t = pool[i];
          if (!t.fake && t.c === w[0] && t.n === w[1] && !Okey.isJoker(t, ok)) {
            var gi = -1;
            for (var k = me.hand.length - 1; k >= 0; k--) { var h = me.hand[k]; if (h.fake || Okey.isJoker(h, ok) || isWanted(h)) continue; gi = k; break; }
            if (gi < 0) return;
            pool[i] = me.hand[gi]; me.hand[gi] = t;
            return;
          }
        }
      }
    });
  }

  function scrambleRack() {
    var ids = G.players[ME].hand.map(function (t) { return t.id; });
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = ids[i]; ids[i] = ids[j]; ids[j] = x; }
    var cols = Math.max(minCols(ids.length), Math.ceil((ids.length + Math.floor(ids.length / 3)) / RACK_ROWS));
    rack = []; for (var k = 0; k < cols * RACK_ROWS; k++) rack.push(null);
    var pos = 0;
    ids.forEach(function (id, i) { if (i && i % 3 === 0) pos++; rack[pos++] = id; });
  }

  // ---------- ıstaka modeli ----------
  function rackCols() { return Math.ceil(rack.length / RACK_ROWS); }
  var RACK_MIN_COLS = 8;
  // el + 2 yedek hücre; az sütun = büyük taş. Klasik (dikdörtgen) taşta hücreler taş genişliğinde olduğundan raf boyunca sığan sütun kadar hücre açılır (taş rafın ucuna kadar gidebilsin).
  var CLASSIC_FIT_COLS = 14; // 912px raf / (58px taş + 2px)
  function minCols(n) { var base = Math.max(RACK_MIN_COLS, Math.ceil((n + 2) / RACK_ROWS)); if (document.documentElement.classList.contains('skin-klasik')) base = Math.max(base, CLASSIC_FIT_COLS); return base; }
  // Sütun sayısını satır/sütun konumlarını koruyarak değiştir (düz dizide satır = floor(i/cols) olduğundan doğrudan push edilemez)
  function setCols(newCols) {
    var cols = rackCols(); if (newCols === cols) return;
    var out = []; for (var i = 0; i < newCols * RACK_ROWS; i++) out.push(null);
    for (var r = 0; r < RACK_ROWS; r++) for (var c = 0; c < cols; c++) { var id = rack[r * cols + c]; if (id === null || id === undefined) continue; var cc = c < newCols ? c : -1; if (cc < 0) { cc = out.indexOf(null); out[cc] = id; } else out[r * newCols + cc] = id; }
    rack = out;
  }
  var newTiles = {}; // yeni gelen taş kısa süre vurgulanır
  function netRackKey() { return NET.online && G ? NET.code + ':' + G.hand : null; }
  function saveNetRack() { var k = netRackKey(); if (!k) return; store('ao.rack', { key: k, rack: rack.slice() }); } // çevrim içi: ıstaka düzeni oda+el için saklanır (yenileme / yeniden bağlanma sonrası taş kimliğiyle geri gelir)
  function syncRack(sortNew) {
    var hand = G.players[ME].hand;
    var ids = {}; hand.forEach(function (t) { ids[t.id] = true; });
    if (NET.online && (!rack.length || rack.every(function (x) { return x === null; }))) { // yeniden bağlanma: aynı oda ve elin kayıtlı düzeni varsa (taş kimlikleri), onu temel al; elde olmayanlar düşer, yeni taşlar aşağıda eklenir
      var sv = load('ao.rack', null); if (sv && sv.key === netRackKey() && Array.isArray(sv.rack)) { rack = sv.rack.map(function (id) { return id !== null && ids[id] ? id : null; }); if (rack.some(function (x) { return x !== null; })) sortNew = false; }
    }
    var inRack = {};
    for (var i = 0; i < rack.length; i++) { if (rack[i] !== null && !ids[rack[i]]) rack[i] = null; if (rack[i] !== null) inRack[rack[i]] = true; }
    if (!rack.length || (sortNew && rack.every(function (x) { return x === null; }))) {
      // ilk dağıtım: klasik okey gibi soldan sağa, yan yana, boşluksuz; sıra dağıtım sırası (rastgele)
      var cols0 = minCols(hand.length); rack = []; for (var k = 0; k < cols0 * RACK_ROWS; k++) rack.push(null);
      hand.forEach(function (t, i) { rack[i] = t.id; });
      return;
    }
    var missing = hand.filter(function (t) { return !inRack[t.id]; });
    if (missing.length && PULL_DEST) missing = pullPlace(missing); // v9.80: sürükleyerek çekilen taş önce bırakılan hücreye; diğer yeni taşlar (Al'daki kapalı taş) sonra
    missing.forEach(function (t) {
      // mevcut düzeni bozmadan: son dolu hücreden sonraki ilk boşluk; yoksa herhangi bir boşluk; o da yoksa sütun ekle
      var last = -1; for (var j = rack.length - 1; j >= 0; j--) if (rack[j] !== null) { last = j; break; }
      var e = -1; for (var j2 = last + 1; j2 < rack.length; j2++) if (rack[j2] === null) { e = j2; break; }
      if (e < 0) e = rack.indexOf(null);
      if (e < 0) { setCols(rackCols() + 1); e = rackCols() - 1; } // yeni sütun: 1. satırın sonu
      rack[e] = t.id; newTiles[t.id] = Date.now();
    });
    // gereksiz boş sütunları kırp (per indirince taşlar yeniden büyür); oyuncunun bıraktığı boşluklar korunur
    var cols = rackCols(), maxC = -1;
    for (var r = 0; r < RACK_ROWS; r++) for (var c = 0; c < cols; c++) if (rack[r * cols + c] !== null) maxC = Math.max(maxC, c);
    var want = Math.max(minCols(hand.length), maxC + 1);
    if (want !== cols) setCols(want); // kırp ya da (klasik raf / büyüyen el) genişlet
  }
  // Diz: 'run' = SAYIYA GÖRE (aynı renkte ardışık sayılar → seri perler), 'set' = RENGE GÖRE (aynı sayının farklı renkleri → renkli perler).
  // Sıra: görevi karşılayan perler → en çok taşı kullanan (eşitlikte en az okeyli) perler → eksik ikililer → kalanlar → kullanılmayan jokerler.
  // Her taş bir kez kullanılır (kimlikle). Sahte okey joker değilse temsil ettiği taş gibi değerlendirilir. Aynı ele aynı düğme → aynı sonuç.
  // v10.06 (K152, tester videosu): görev henüz tamamlanmıyorsa "Göreve Göre Diz" her şart için EN YAKIN grubu öne alır — okey önce bir şartı tamamlamaya gider,
  // kalan şart için en çok gerçek taşlı aday (ör. iki 3'lü renkli: 7-7-OK tam, 8-8 eksik). Eski kod iki şartlı görevde kalanları hep seri sanıp 8-9-OK-11 serisi kuruyordu (Hazır 1/2 → 0/2).
  var TSORT = null; // son görev dizmesinin sonucu (bildirim metni için): { done, need, miss: [{req, have}] }
  function taskPlan(hand, ok, reqs) {
    var J = hand.filter(function (t) { return Okey.isJoker(t, ok); }), R = hand.filter(function (t) { return !Okey.isJoker(t, ok); });
    function cands(req, avoid) { // şart için adaylar: gerçek taş listeleri (en çok şart boyu kadar); avoid: başka şartın aldığı taşlar
      var out = [], size = req[1], free = R.filter(function (t) { return !avoid[t.id]; });
      if (req[0] === 'set') { var byN = {}; free.forEach(function (t) { var e = Okey.effective(t, ok); var m = byN[e.n] || (byN[e.n] = {}); if (!m[e.c]) m[e.c] = t; }); Object.keys(byN).forEach(function (n) { var ts = Object.keys(byN[n]).map(function (c) { return byN[n][c]; }).slice(0, size); out.push(ts); }); }
      else { var byC = {}; free.forEach(function (t) { var e = Okey.effective(t, ok); var m = byC[e.c] || (byC[e.c] = {}); if (!m[e.n]) m[e.n] = t; }); Object.keys(byC).forEach(function (c) { for (var a = 1; a + size - 1 <= 13; a++) { var ts = []; for (var n = a; n < a + size; n++) if (byC[c][n]) ts.push(byC[c][n]); if (ts.length) out.push(ts); } }); }
      return out;
    }
    var best = null;
    function consider(pick) { // pick: [{req, tiles}] → okeyler eksiği en az olandan başlayarak tamamlamaya; puan: tamamlanan şart > gerçek taş > az okey
      var jl = J.length, order = pick.map(function (p, i) { return i; }).sort(function (x, y) { return (pick[x].req[1] - pick[x].tiles.length) - (pick[y].req[1] - pick[y].tiles.length); });
      var done = 0, jUsed = 0, plan = pick.map(function (p) { return { req: p.req, tiles: p.tiles.slice(), full: false }; });
      order.forEach(function (i) { var p = plan[i], need = p.req[1] - p.tiles.length; if (need <= jl) { for (var k = 0; k < need; k++) p.tiles.push(J[jUsed + k]); jUsed += need; jl -= need; p.full = true; done++; } });
      var real = pick.reduce(function (s, p) { return s + p.tiles.length; }, 0), used = plan.reduce(function (s, p) { return s + p.tiles.length; }, 0);
      if (used >= hand.length) return; // açılışta en az bir taş elde kalmalı
      var sc = done * 1000 + real * 10 - jUsed;
      if (!best || sc > best.sc) best = { sc: sc, plan: plan, done: done };
    }
    if (reqs.length === 1) cands(reqs[0], {}).forEach(function (a) { consider([{ req: reqs[0], tiles: a }]); });
    else cands(reqs[0], {}).forEach(function (a) { var av = {}; a.forEach(function (t) { av[t.id] = true; }); var bs = cands(reqs[1], av); if (!bs.length) consider([{ req: reqs[0], tiles: a }]); bs.forEach(function (b) { consider([{ req: reqs[0], tiles: a }, { req: reqs[1], tiles: b }]); }); });
    return best;
  }
  function autoSort(mode) { // mode: 'run' | 'set' | 'task' (v9.89: göreve göre — görev perleri başa, kalan sayıya göre). Dönüş: görev perleri bulundu mu
    var ok = G.ok, me = G.players[ME];
    var hand = me.hand.slice().sort(function (a, b) { return a.id - b.id; });
    var used = {}, groups = [], taskGroups = [], taskMode = mode === 'task';
    if (taskMode) mode = (G.task.req && G.task.req.every(function (r) { return r[0] === 'set'; })) ? 'set' : 'run'; // kalan taşlar: görev türüne uygun dizilir (v10.06: iki renkli şartlı görev de 'set')
    TSORT = null;
    function take(tiles, kind, front) { tiles.forEach(function (t) { used[t.id] = true; }); var g = Okey.layoutMeld({ tiles: tiles.slice(), kind: kind || mode }, ok); if (front) taskGroups.push(g); else groups.push(g); }
    // 1) görev perleri: findTaskGroups per NESNESİ ({idx, kind, tiles}) döndürür (v9.89 düzeltmesi: eski kod nesneyi taş listesi sanıyordu, bu adım hiç çalışmıyordu — canlı bulgu 3)
    var found = false;
    if (G.task.req && !me.opened) {
      var tg = Okey.findTaskGroups(hand, ok, G.task);
      if (tg) tg.forEach(function (g) { var tiles = g.tiles || g, k = g.kind || Okey.meldKind(tiles, ok); if ((taskMode || k === mode || k === 'any') && !tiles.some(function (t) { return used[t.id]; })) { take(tiles, k === 'any' ? mode : k, true); found = true; } });
      if (taskMode && !found) { // v10.06 (K152): şart şart en yakın gruplar
        var tp = taskPlan(hand, ok, G.task.req);
        if (tp) {
          tp.plan.forEach(function (p) {
            if (p.full) { take(p.tiles, p.req[0], true); return; }
            if (p.tiles.length < 2) return; // tek taş grup sayılmaz
            p.tiles.forEach(function (t) { used[t.id] = true; });
            var srt = p.tiles.slice().sort(function (x, y) { var a = Okey.effective(x, ok), b = Okey.effective(y, ok); return p.req[0] === 'set' ? a.c - b.c : a.n - b.n; });
            taskGroups.push(srt);
          });
          TSORT = { done: tp.done, need: G.task.req.length, miss: tp.plan.filter(function (p) { return !p.full; }).map(function (p) { return { req: p.req, have: p.tiles.length }; }) };
        }
      }
    }
    // 2) kalan taşlarda en iyi örtü
    var rest = hand.filter(function (t) { return !used[t.id]; });
    Okey.bestCover(rest, ok, mode).melds.forEach(function (m) { take(m.tiles); });
    // per sırası: görev perleri en başa (bulunduğu sırayla), sonra seri → aile, başlangıç sayısı; renkli → sayı
    function key(g) { var real = g.filter(function (t) { return !Okey.isJoker(t, ok); }); if (!real.length) return 999; var e = Okey.effective(real[0], ok); return mode === 'run' ? e.c * 100 + e.n : e.n * 10 + e.c; }
    groups.sort(function (a, b) { return key(a) - key(b) || a[0].id - b[0].id; });
    groups = taskGroups.concat(groups);
    // 3) eksik ikililer (per değil; sadece yan yana tutulur)
    var left = hand.filter(function (t) { return !used[t.id] && !Okey.isJoker(t, ok); });
    var ev = function (t) { return Okey.effective(t, ok); };
    left.sort(function (a, b) { var x = ev(a), y = ev(b); return mode === 'run' ? ((x.c - y.c) || (x.n - y.n) || (a.id - b.id)) : ((x.n - y.n) || (x.c - y.c) || (a.id - b.id)); });
    var pairs = [], single = [];
    for (var i = 0; i < left.length; i++) {
      var a = left[i], b = left[i + 1];
      if (b) { var x = ev(a), y = ev(b), match = mode === 'run' ? (x.c === y.c && y.n === x.n + 1) : (x.n === y.n && x.c !== y.c); if (match) { pairs.push([a, b]); i++; continue; } }
      single.push(a);
    }
    var jokers = hand.filter(function (t) { return !used[t.id] && Okey.isJoker(t, ok); });
    // 4) yerleşim: perler arası tek boşluk, ikililer arası tek boşluk, kalanlar toplu, jokerler sonda
    // bloklar: perler, ikililer, kalanlar (tek tek), jokerler. Bir per mümkünse satır sonunda bölünmez; bloklar arası tek boşluk.
    var blocks = [];
    groups.forEach(function (g) { blocks.push({ ids: g.map(function (t) { return t.id; }), keep: true }); });
    pairs.forEach(function (p) { blocks.push({ ids: p.map(function (t) { return t.id; }), keep: true }); });
    if (single.length) blocks.push({ ids: single.map(function (t) { return t.id; }), keep: false });
    if (jokers.length) blocks.push({ ids: jokers.map(function (t) { return t.id; }), keep: true });
    var n = hand.length;
    function layout(cols) { // null = sığmadı
      var out = []; for (var q = 0; q < cols * RACK_ROWS; q++) out.push(null);
      var pos = 0;
      for (var bi = 0; bi < blocks.length; bi++) {
        var bk = blocks[bi], L = bk.ids.length;
        if (bi > 0 && pos % cols !== 0) pos++; // bloklar arası boşluk (satır başında gereksiz)
        if (bk.keep && L <= cols && pos % cols + L > cols) pos = (Math.floor(pos / cols) + 1) * cols; // satır sonunda bölünmesin
        for (var k = 0; k < L; k++) { if (pos >= out.length) return null; out[pos++] = bk.ids[k]; }
      }
      return out;
    }
    var cols = minCols(n), res = null;
    while (!(res = layout(cols))) cols++;
    rack = res;
    return found;
  }
  // Araya ekleme: hedef hücre boşsa oraya; doluysa işaretli tarafa (sol/sağ) araya girer, komşular en yakın boşluğa doğru kayar;
  // satırda boşluk yoksa bir sütun eklenir. Hiçbir zaman başka bir taşla yer değiştirmez; diğer taşlar yalnızca yer açmak kadar kayar.
  function insertInRack(id, slot, after) {
    var cols = rackCols(), from = rack.indexOf(id);
    if (from === slot) return;
    if (rack[slot] === null) { if (from >= 0) rack[from] = null; rack[slot] = id; return; }
    var row = Math.floor(slot / cols), start = row * cols, end = start + cols;
    var pos = after ? slot + 1 : slot, i;
    if (from >= 0 && Math.floor(from / cols) === row) { // aynı satır içinde taşıma: aradaki taşlar kayar, boşluk kalmaz
      rack[from] = null;
      if (from < pos) { for (i = from; i < pos - 1; i++) rack[i] = rack[i + 1]; rack[pos - 1] = id; }
      else { for (i = from; i > pos; i--) rack[i] = rack[i - 1]; rack[pos] = id; }
      return;
    }
    if (from >= 0) rack[from] = null;
    if (pos < end && rack[pos] === null) { rack[pos] = id; return; }
    var gapR = -1; for (i = pos; i < end; i++) if (rack[i] === null) { gapR = i; break; }
    if (gapR >= 0) { for (i = gapR; i > pos; i--) rack[i] = rack[i - 1]; rack[pos] = id; return; }
    var gapL = -1; for (i = pos - 1; i >= start; i--) if (rack[i] === null) { gapL = i; break; }
    if (gapL >= 0) { for (i = gapL; i < pos - 1; i++) rack[i] = rack[i + 1]; rack[pos - 1] = id; return; }
    var col = pos - start; // satır dolu: sütun ekle, sağdakileri kaydır
    setCols(cols + 1); cols = rackCols(); start = row * cols; end = start + cols; pos = start + col;
    for (i = end - 1; i > pos; i--) rack[i] = rack[i - 1]; rack[pos] = id;
  }
  function moveInRack(id, slot) { insertInRack(id, slot, false); }
  function rackBlocks() {
    var cols = rackCols(), blocks = [], cur = null;
    for (var i = 0; i < rack.length; i++) {
      var atRowStart = i % cols === 0;
      var t = rack[i] !== null ? tileById(rack[i]) : null;
      if (t && !atRowStart && cur) { cur.tiles.push(t); cur.slots.push(i); }
      else if (t) { cur = { tiles: [t], slots: [i] }; blocks.push(cur); }
      else cur = null;
    }
    return blocks;
  }
  // bir bloğun içindeki bütün geçerli pencereler (uzunluk >= 3)
  function blockWindows(b) {
    var out = [];
    for (var len = b.tiles.length; len >= 3; len--) {
      for (var s = 0; s + len <= b.tiles.length; s++) {
        var tiles = b.tiles.slice(s, s + len), kind = Okey.meldKind(tiles, G.ok);
        if (kind === 'run' && !orderedRun(tiles)) kind = null; // seri ıstakada sıralı dizilmeli (13 10 11 12 olmaz)
        if (kind) out.push({ tiles: tiles, slots: b.slots.slice(s, s + len), kind: kind, start: s, len: len });
      }
    }
    return out;
  }
  // pencere, artan ya da azalan sırada mı? (okeyler aradaki boşlukları doldurur)
  function orderedRun(tiles) {
    var ok = G.ok, up = true, down = true, prevUp = null, prevDown = null;
    for (var i = 0; i < tiles.length; i++) {
      if (Okey.isJoker(tiles[i], ok)) continue;
      var n = Okey.effective(tiles[i], ok).n;
      if (prevUp !== null && n - i !== prevUp) up = false;
      if (prevDown !== null && n + i !== prevDown) down = false;
      prevUp = n - i; prevDown = n + i;
    }
    return up || down;
  }
  function overlaps(a, b) { return a.slots.some(function (x) { return b.slots.indexOf(x) >= 0; }); }
  // Bütün adaylar (görev araması için) ve en iyi örtüşmesiz kapsama (gösterim / indirme için)
  function rackWindows() { var all = []; rackBlocks().forEach(function (b) { all = all.concat(blockWindows(b)); }); return all; }
  function rackSegments() {
    var segs = [];
    rackBlocks().forEach(function (b) {
      var wins = blockWindows(b);
      if (!wins.length) return;
      // örtüşmeyen, en çok taşı kapsayan pencere kümesi (küçük blok: tüm alt kümeler yerine DP)
      var L = b.tiles.length, best = []; // dp[i] = i. taştan itibaren en iyi kapsama
      var dp = new Array(L + 1).fill(null);
      dp[L] = { count: 0, wins: [] };
      for (var i = L - 1; i >= 0; i--) {
        dp[i] = { count: dp[i + 1].count, wins: dp[i + 1].wins };
        wins.forEach(function (w) {
          if (w.start !== i) return;
          var cand = { count: w.len + dp[i + w.len].count, wins: [w].concat(dp[i + w.len].wins) };
          if (cand.count > dp[i].count || (cand.count === dp[i].count && cand.wins.length < dp[i].wins.length)) dp[i] = cand;
        });
      }
      segs = segs.concat(dp[0].wins);
    });
    return segs;
  }
  // Görev kontrolü: ortak taş kullanmayan, görev türü ve uzunluğuna uyan pencere kombinasyonu.
  // Dönen: { segs, used, ready: n/n } ya da ilerleme bilgisi { segs: null, progress, need }
  function taskSegments() {
    if (!G.task.req) return null;
    var wins = rackWindows(), me = G.players[ME], need = G.task.req.length, best = null;
    function fits(w, req) { return w.tiles.length >= req[1] && (w.kind === 'any' || w.kind === req[0]); }
    function tryCombo(combo) {
      for (var a = 0; a < combo.length; a++) for (var b = a + 1; b < combo.length; b++) if (overlaps(combo[a], combo[b])) return;
      var groups = combo.map(function (s) { return s.tiles; });
      var used = groups.reduce(function (x, g) { return x + g.length; }, 0);
      if (used >= me.hand.length) return;
      if (!Okey.groupsSatisfyTask(groups, G.task, G.ok)) return;
      if (!best || used < best.used) best = { segs: combo, used: used }; // en az taş harcayan kombinasyon
    }
    if (need === 1) wins.forEach(function (w) { tryCombo([w]); });
    else for (var i = 0; i < wins.length; i++) for (var j = i + 1; j < wins.length; j++) tryCombo([wins[i], wins[j]]);
    if (best) { best.progress = need; best.need = need; return best; }
    // kısmi ilerleme: kaç görev şartı tek başına karşılanabiliyor?
    var progress = 0;
    if (need === 2) {
      var r0 = wins.some(function (w) { return fits(w, G.task.req[0]); }), r1 = wins.some(function (w) { return fits(w, G.task.req[1]); });
      progress = (r0 || r1) ? 1 : 0;
    }
    return { segs: null, used: 0, progress: progress, need: need };
  }
  function taskReady() { var ts = taskSegments(); return ts && ts.segs ? ts : null; }
  // v9.74: görevi hangi perlerle açacağını oyuncu seçer. Birden fazla geçerli kombinasyon varsa "PER AÇ" seçim moduna girer:
  // adaylar ıstakada renkli çerçeveyle gösterilir, dokununca seçilir (aynı taşın iki adayı varsa sırayla değişir), "Seçilen taşlarla aç" ile onaylanır; sunucu yine doğrular.
  var OPEN_SEL = { active: false, cands: [], chosen: [], combos: {} };
  function segKey(sg) { return sg.tiles.map(function (t) { return t.id; }).sort(function (x, y) { return x - y; }).join('-'); }
  function taskCombos() { // bütün geçerli kombinasyonlar (taş kümesine göre tekil)
    if (!G || !G.task.req) return [];
    var wins = rackWindows(), me = G.players[ME], need = G.task.req.length, out = [], seen = {};
    function tryCombo(combo) {
      for (var a = 0; a < combo.length; a++) for (var b = a + 1; b < combo.length; b++) if (overlaps(combo[a], combo[b])) return;
      var groups = combo.map(function (sg) { return sg.tiles; }), used = groups.reduce(function (x, g) { return x + g.length; }, 0);
      if (used >= me.hand.length) return;
      if (!Okey.groupsSatisfyTask(groups, G.task, G.ok)) return;
      var key = combo.map(segKey).sort().join('|'); if (seen[key]) return; seen[key] = true; out.push({ segs: combo, used: used, key: key });
    }
    if (need === 1) wins.forEach(function (w) { tryCombo([w]); });
    else for (var i = 0; i < wins.length; i++) for (var j = i + 1; j < wins.length; j++) tryCombo([wins[i], wins[j]]);
    return out;
  }
  function enterOpenSel(combos) {
    var cands = [], byKey = {}; OPEN_SEL.combos = {};
    combos.forEach(function (c) { OPEN_SEL.combos[c.key] = c; c.segs.forEach(function (sg) { var k = segKey(sg); if (!byKey[k]) { byKey[k] = { key: k, tiles: sg.tiles, kind: sg.kind }; cands.push(byKey[k]); } }); });
    cands.sort(function (x, y) { return rack.indexOf(x.tiles[0].id) - rack.indexOf(y.tiles[0].id); });
    OPEN_SEL.active = true; OPEN_SEL.cands = cands; OPEN_SEL.chosen = []; sel = [];
    toast(__L("Görevi hangi perlerle açacağını seç: çerçeveli taşlara dokun, sonra \"Seçilen taşlarla aç\"."), '', 4500);
    render(); emit('openSel');
  }
  function exitOpenSel() { if (!OPEN_SEL.active) return; OPEN_SEL.active = false; OPEN_SEL.cands = []; OPEN_SEL.chosen = []; }
  function selValidKey() { if (!OPEN_SEL.active) return null; var k = OPEN_SEL.chosen.slice().sort().join('|'); return OPEN_SEL.combos[k] ? k : null; }
  function candsOf(t) { return OPEN_SEL.cands.filter(function (c) { return c.tiles.indexOf(t) >= 0 || c.tiles.some(function (x) { return x.id === t.id; }); }); }
  function toggleCand(t) { // dokunulan taşın adayları arasında sırayla dön; son adaydan sonra seçimi kaldır
    var cs = candsOf(t); if (!cs.length) return;
    var need = G.task.req.length, chosenIdx = -1; cs.forEach(function (c, i) { if (OPEN_SEL.chosen.indexOf(c.key) >= 0) chosenIdx = i; });
    var next = chosenIdx < 0 ? cs[0] : (chosenIdx + 1 < cs.length ? cs[chosenIdx + 1] : null);
    if (chosenIdx >= 0) OPEN_SEL.chosen = OPEN_SEL.chosen.filter(function (k) { return k !== cs[chosenIdx].key; });
    if (next) {
      var ids = {}; next.tiles.forEach(function (x) { ids[x.id] = true; });
      OPEN_SEL.chosen = OPEN_SEL.chosen.filter(function (k) { var c = OPEN_SEL.cands.filter(function (q) { return q.key === k; })[0]; return c && !c.tiles.some(function (x) { return ids[x.id]; }); }); // çakışanı bırak
      if (need === 1) OPEN_SEL.chosen = [];
      while (OPEN_SEL.chosen.length >= need) OPEN_SEL.chosen.shift();
      OPEN_SEL.chosen.push(next.key);
    }
    sfx('tap'); render();
  }
  function openWithSel() {
    var k = selValidKey(); if (!k) { toast(__L("Seçilen taşlar görevi karşılamıyor: {0} gerekiyor.", [(G.task.req.map(taskReqText).join(' + '))]), 'warn'); return; }
    var combo = OPEN_SEL.combos[k]; exitOpenSel();
    doAction(function () { Okey.actOpen(G, combo.segs.map(function (sg) { return sg.tiles.slice(); })); sel = []; }, 'open', { groups: combo.segs.map(function (sg) { return sg.tiles.map(function (t) { return t.id; }); }) });
  }
  function taskReqText(req) { if (window.DonguI18n && DonguI18n.en) return (req[0] === 'set' ? 'set of ' : 'run of ') + req[1]; return req[1] + '\'' + (req[1] === 3 ? 'lü' : req[1] === 4 ? 'lü' : 'li') + ' ' + (req[0] === 'set' ? 'renkli' : 'seri'); }
  function tName(t) { return t && t.text ? (window.DonguI18n ? DonguI18n.rt(t.text) : t.text) : ''; } // v10.11: motorun görev adı (İngilizcede sözlükten)

  // ---------- çizim ----------
  // sahne: koltuk -> öğeler
  var SEAT = { 0: { ch: 'chMe', rack: 'rackMe', disc: 'mydisc', pose: 'back' }, 1: { ch: 'chRight', rack: 'rackRight', disc: 'discRight', pose: 'right' }, 2: { ch: 'chTop', rack: 'rackTop', disc: 'discTop', pose: 'front' }, 3: { ch: 'chLeft', rack: 'rackLeft', disc: 'discLeft', pose: 'left' } };
  var seatEls = {}, zoneEls = {}, built = false;
  var ROT = false; // sahne artık döndürülmez; dikeyde çevirme uyarısı gösterilir
  function viewSize() { // gerçekten kullanılabilir alan: adres/araç çubukları hariç görünür pencere
    var vv = window.visualViewport;
    if (vv && vv.width && vv.height && vv.scale <= 1.01) return { W: vv.width, H: vv.height };
    return { W: window.innerWidth, H: window.innerHeight };
  }
  // Güvenli alan (çentik) payları: CSS env() değerleri bir sonda elemanından okunur
  function safeInsets() {
    var pr = $('safeProbe'); if (!pr) return { l: 0, r: 0, t: 0, b: 0 };
    var cs = getComputedStyle(pr);
    return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  }
  var PHONE = false;
  // v9.77 telefon masası (K86): deste/gösterge ortada, dört bölge ve ıstaka aynı; masa ve per alanı yalnız YATAYDA kx kadar genişler.
  // Pay: yan rakiplerin küçülmesi (PH_D0) + ekran 16:9'dan genişse iki yandaki boş bant (M, sahne px). Yükseklik ve dikey düzen değişmez.
  var PH_D0 = 60, PH_DM = 0.85, PH_DMAX = 176; // masanın yarı genişliğine (550) eklenen: en çok 176 → kx ≤ 1,32
  var PHG = { M: 0, kx: 1 };
  function phoneGeo(W) { if (!PHONE) return { M: 0, kx: 1 }; var M = Math.max(0, (W / SC - 1600) / 2); return { M: M, kx: 1 + Math.min(PH_DMAX, PH_D0 + M * PH_DM) / 550 }; }
  function mobileLike() { return (window.matchMedia && matchMedia(__L("(pointer: coarse)")).matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent); }
  function isPortrait() { var v = viewSize(); return v.H > v.W; }
  // Sahne her zaman gerçek yatay düzende çizilir (CSS ile döndürme yok). Dikey telefonda uyarı katmanı çıkar; çevirince kendiliğinden kalkar.
  function sizeScene() {
    var v = viewSize(), ins = safeInsets(), W = Math.max(100, v.W - ins.l - ins.r), H = Math.max(100, v.H - ins.t - ins.b);
    var st = $('stage'), rs = document.documentElement.style;
    rs.setProperty('--sal', ins.l + 'px'); rs.setProperty('--sar', ins.r + 'px'); rs.setProperty('--sat', ins.t + 'px'); rs.setProperty('--sab', ins.b + 'px'); // v10.06 (K144): sahne dışı sabit öğeler (koç şeridi, pencereler, bildirimler) kamera bandına girmez
    ROT = false;
    SC = Math.min(W / 1600, H / 900);
    st.style.transform = 'scale(' + SC + ')';
    st.style.left = Math.round(ins.l + (W - 1600 * SC) / 2) + 'px';
    st.style.top = Math.round(ins.t + (H - 900 * SC) / 2) + 'px';
    document.documentElement.style.setProperty('--sc', SC);
    var phone = mobileLike() && SC < 0.6, wasPhone = document.documentElement.classList.contains('phone'); // v9.74: telefonda büyük ıstaka taşları (sahne küçükken)
    document.documentElement.classList.toggle('phone', phone); PHONE = phone;
    var g = phoneGeo(W), geoChanged = Math.abs(g.kx - PHG.kx) > 0.004 || Math.abs(g.M - PHG.M) > 2; PHG = g; // v9.77 (K86): yan bant + masa genişleme oranı
    document.documentElement.style.setProperty('--sideM', Math.round(g.M) + 'px');
    if ((phone !== wasPhone || geoChanged) && appliedTheme) applyTheme(appliedTheme, true); // per alanı ve masa boyu telefona göre
    var portrait = isPortrait() && (mobileLike() || v.W < 700);
    var tp = $('turnPhone'); if (tp) tp.hidden = !portrait;
    var was = document.documentElement.classList.contains('portrait');
    document.documentElement.classList.toggle('portrait', portrait);
    if (was !== portrait && splash && splash.next) splashTick(); // FOG açılışı: uyarı kalkınca süre başlar/sürer, dikeye dönünce duraklar
  }
  // Kullanıcı dokunuşuyla yatay tam ekran: önce tam ekran, ardından yön kilidi (destekleyen tarayıcılarda; başarısızlık sessizce yutulur)
  function tryLandscape() {
    if (!mobileLike()) return;
    var el = document.documentElement, p = null;
    try {
      if (!document.fullscreenElement && !isStandalone()) {
        if (el.requestFullscreen) p = el.requestFullscreen({ navigationUI: 'hide' });
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      }
    } catch (e) {}
    var lock = function () { try { if (screen.orientation && typeof screen.orientation.lock === 'function') { var q = screen.orientation.lock('landscape'); if (q && q.catch) q.catch(function () {}); } } catch (e) {} };
    if (p && p.then) p.then(lock, lock); else lock();
    setTimeout(resettle, 300); setTimeout(resettle, 900);
  }
  // ekran koordinatı -> sahne koordinatı
  function toStage(sx, sy) {
    var st = $('stage'), L = parseFloat(st.style.left) || 0, T = parseFloat(st.style.top) || 0;
    return { x: (sx - L) / SC, y: (sy - T) / SC };
  }
  function dToStage(dx, dy) { return { x: dx / SC, y: dy / SC }; }
  function stageRect() { return $('stage').getBoundingClientRect(); }
  function avatarFor(p) { return myAvatar || DEFAULT_AV; }
  // Bot karakter resimleri (paket 2-A). Pozlar: on (karşı koltuk), yan (sol; sağ için aynalanır), arka, bust (portre)
  var BOT_IMG = { 1: 'ali', 2: 'ayse', 3: 'mehmet' };
  var POSE_IMG = { front: 'on', left: 'yan', right: 'yan', back: 'arka' };
  function seatAvatar(p) { // çevrim içi: koltuktaki oyuncunun avatarı (bot ise {bot:'ali'})
    if (!NET.online || !NET.seats) return null; var s = NET.seats[(p + NET.seat) % 4]; return s ? (s.avatar || { v: 2 }) : { bot: 'ali' };
  }
  function charaView(p, pose) {
    var sa = seatAvatar(p);
    if (sa && sa.bot) return __L("<img class=\"av wait{0}\" alt=\"\" draggable=\"false\" src=\"assets/bot-{1}-{2}.webp\">", [(pose === 'right' ? ' mirror' : ''), (sa.bot), (POSE_IMG[pose])]);
    if (sa && p !== ME) return charImgHTML(sa, pose === 'back' ? 'arka' : pose, pose === 'left' ? 'mirror' : ''); // v9.95: yan görseller sola bakar; sol koltukta aynalanır ki masaya dönük otursun (önce sol koltuktaki oyuncu masaya sırtını dönmüş gibi dışarı bakıyordu; botlar zaten aynalanıyordu)
    if (p !== ME && BOT_IMG[p]) return __L("<img class=\"av wait{0}\" alt=\"\" draggable=\"false\" src=\"assets/bot-{1}-{2}.webp\">", [(pose === 'right' ? ' mirror' : ''), (BOT_IMG[p]), (POSE_IMG[pose])]);
    return charImgHTML(avatarFor(p), pose === 'back' ? 'arka' : pose, 'me');
  }
  function portrait(p) { var sa = seatAvatar(p); if (sa && sa.bot) return __L("<img class=\"av\" alt=\"\" draggable=\"false\" src=\"assets/bot-{0}-bust.webp\">", [(sa.bot)]); if (sa && p !== ME) return charImgHTML(sa, 'bust', 'bust'); return (p !== ME && BOT_IMG[p]) ? __L("<img class=\"av\" alt=\"\" draggable=\"false\" src=\"assets/bot-{0}-bust.webp\">", [(BOT_IMG[p])]) : charImgHTML(avatarFor(p), 'bust', 'bust'); }
  function setCls(av, cls) { if (!av) return; if (av.className !== undefined && av.className.baseVal !== undefined) av.className.baseVal = cls; else av.className = cls; }
  function seatLevel(p) { // v9.86 (K107): masadaki seviye rozeti — kendin her zaman; çevrim içinde hesabı olan gerçek oyuncular; botlarda yok
    if (p === ME) return myLevel();
    if (!NET.online || !NET.seats) return 0;
    var s = NET.seats[(p + NET.seat) % 4]; return s && !s.bot && s.prof && s.prof.level ? s.prof.level : 0;
  }
  function rigSeat(p) { // K121: koltuktaki özel karakter için rig varsa (assets/rig/<karakter>/rig.json) tek resmin yerine parçalı karakter kurulur; yoksa hiçbir şey değişmez
    if (!window.Rig || p === ME) return; var sa = seatAvatar(p); if (!sa || sa.bot) return;
    var el = $(SEAT[p].ch), avw = el && el.querySelector('.avw'); if (!avw) return; var view = SEAT[p].pose === 'front' ? 'on' : 'yan', mo = { phase: p * 1.6, reduce: !!settings.reduceMotion, mirror: SEAT[p].pose === 'left', events: { servis: function (ev, hp) { cayCups(); } } };
    if (sa.full && sa.full !== 'yok' && FULL_CHARS[sa.full]) { var char = sa.full; Rig.load(char).then(function (def) { if (!def || !built || !avw.isConnected || avw.classList.contains('rig')) return; Rig.mount(avw, char, view, mo); }); return; }
    if (!canGardropRig(sa)) return; // v10.13 (08-C): oyuncunun kendi karakteri de parçalı
    gardropRig(sa, view).then(function (name) { if (!name || !built || !avw.isConnected || avw.classList.contains('rig')) return; Rig.mount(avw, name, view, mo); });
  }
  function rigOf(p) { if (!window.Rig) return null; var el = p === ME ? $('meAv') : $(SEAT[p] ? SEAT[p].ch : 'chMe'); return Rig.instances().filter(function (i) { return el && el.contains(i.host); })[0] || null; } // v9.97: kendi rig'in portre dairesinde
  function rigMe() { // v9.97: kendi portren (sol alt daire) rig'li karakterde parçalı: 'on' görünümünün baş+omuz kırpımı; Çay Servisi kendi ekranında da elde tepsiyle oynar; masadaki arka görünüm (#chMe) eski resim
    if (!window.Rig || !G) return; Rig.instances().forEach(function (i) { if (!i.host.isConnected) Rig.unmount(i); }); var host = $('meAv') && $('meAv').querySelector('.avw'); if (!host) return;
    var a = normAvatar(myAvatar || DEFAULT_AV); var isFull = !!(a.full && a.full !== 'yok' && FULL_CHARS[a.full]), gr = !isFull && canGardropRig(a);
    if (!isFull && !gr) { if (host.classList.contains('rig')) Rig.unmountAll(host); host.dataset.rigChar = ''; return; }
    var sig = isFull ? a.full : 'gardrop:' + meSig(a); // v10.13: kendi karakter değişince portre rig'i yenilenir
    if (host.dataset.rigChar === sig && host.classList.contains('rig')) return;
    if (host.dataset.rigLoading === sig) return; host.dataset.rigLoading = sig;
    var ld = isFull ? Rig.load(a.full).then(function (def) { return def ? a.full : null; }) : gardropRig(a, 'on');
    ld.then(function (nm) { if (host.dataset.rigLoading === sig) host.dataset.rigLoading = ''; if (!nm || !G || !host.isConnected) return; var cur = normAvatar(myAvatar || DEFAULT_AV); if ((isFull ? cur.full : 'gardrop:' + meSig(cur)) !== sig) return; Rig.unmountAll(host); Rig.mount(host, nm, 'on', { phase: 0.9, reduce: !!settings.reduceMotion, crop: [96, 0, 288, 288], events: { servis: function () { cayCups(); } } }); host.dataset.rigChar = sig; });
  }
  function setMeAv(a) { $('meAv').innerHTML = '<span class="avw">' + charImgHTML(a, 'bust', 'bust') + '</span>'; rigMe(); } // v9.97: portre her zaman .avw sarmalayıcısıyla (giriş skini animasyonu + rig)
  function cayCups() { [0, 1, 2, 3].forEach(function (p, i) { setTimeout(function () { if (!G) return; spawnFx('fx-cay', CUP_XY[p][0], CUP_XY[p][1], 10000); sfxOnce('cayting', 'cay:' + (i + 1), 100); }, i * 140); }); }
  function shownDiscards(p) { // v10.06 (K160): el bittiyse bitiren oyuncunun son taşı (bitiş taşı) atma köşesinde gösterilmez — masanın ortasındadır
    var d = G.players[p].discards, ho = G.handOver;
    if (G.phase === 'handover' && ho && ho.finishTile && ho.winner === p && d.length && d[d.length - 1].id === ho.finishTile.id) return d.slice(0, -1);
    return d;
  }
  var ME_SIG = ''; // v10.06 (K158, tester videosu "ben burada sarışınım, orada başka birisi var"): masadaki kendi (arkadan) karakterin kurulduğu görünüm
  function meSig(av) { try { return JSON.stringify(normAvatar(av || myAvatar || DEFAULT_AV)); } catch (e) { return ''; } }
  function buildTable() {
    ME_SIG = meSig();
    var N = G.names; if (window.Rig) [0, 1, 2, 3].forEach(function (p) { var el = $(SEAT[p].ch); Rig.instances().forEach(function (i) { if (el && el.contains(i.host)) Rig.unmount(i); }); }); // eski rig örnekleri (yeniden kurulumda)
    [0, 1, 2, 3].forEach(function (p) {
      var el = $(SEAT[p].ch);
      el.innerHTML = __L("<div class=\"bubble\"></div><span class=\"avw\">{0}</span><div class=\"nm\" style=\"--fam:{1}\"><span class=\"nmt\">{2}</span><b class=\"lvb\" hidden></b></div>{3}", [(charaView(p, SEAT[p].pose)), ([__L("var(--water)"), __L("var(--sun)"), __L("var(--star)"), __L("var(--water)")][p]), (N[p]), (p === ME ? '' : '<div class="pts"></div>')]); // v9.86: seviye rozeti (.lvb) ad etiketinin ucunda
      seatEls[p] = el; rigSeat(p); // K121: rig'li özel karakter → parçalı çizim (rig.json yoksa değişiklik yok)
      el.classList.toggle('clickable', p !== ME);
      el.onclick = function () { if (p === ME) return; if (SKIN.target) pickTarget(p); else showProfile(p); }; // hedef seçimi: masadaki karaktere dokunarak; değilse profil kartı (v9.74)

    });
    built = true;
  }
  // Rakip ıstakası: ahşap korunur, üstünde yalnızca sayaç (gerçek el sayısı). Değişince hafif vurgu.
  function fillRack(el, n) {
    var cnt = el.querySelector('.cnt'), txt = __L("{0} TAŞ", [(n)]);
    if (cnt.textContent !== txt) { cnt.textContent = txt; if (cnt.dataset.init) { cnt.classList.remove('bump'); void cnt.offsetWidth; cnt.classList.add('bump'); } cnt.dataset.init = '1'; }
  }
  function handPenOf(p) { return ((G.handPen && G.handPen[p]) || 0) + ((G.handPenDisc && G.handPenDisc[p]) || 0); } // bu elde birikmiş ceza (el sonunda puana eklenir)
  function render() {
    if (!G) return;
    var me = G.players[ME];
    var N = G.names;
    if (built && meSig() !== ME_SIG) built = false; // v10.06 (K158): görünüm değiştiyse (karakter düzenleme, mağazada giyme, hesaptan gelen görünüm) masadaki karakter de yenilenir — eskiden masa bir kez kuruluyor, arkadan görünüm eski karakterde kalıyordu
    if (!built) buildTable();
    if (OPEN_SEL.active && !(G.phase === 'play' && G.cp === ME && !me.opened)) exitOpenSel(); // seçim modu yalnız kendi sıramda ve açılmadan önce
    $('handNo').textContent = __L("EL {0} / {1}", [(G.hand), (TH())]);
    $('roundNo').textContent = __L("Tur {0}", [(Okey.roundNo(G))]);
    var hc = $('hostChip'); if (hc) { var hv = G.hostVenue; if (hv && !G.tutorial) { hc.hidden = false; var tE = hc.querySelector('.tier'); tE.textContent = hv.tier || 1; tE.className = __L("tier k{0}", [(Math.min(6, Math.max(1, hv.tier || 1)))]); hc.querySelector('.lbl').textContent = hv.seat == null ? __L("Kıraathane") : __L("Ev sahibi"); hc.querySelector('.vn').textContent = hv.name; hc.querySelector('.tn').textContent = hv.tierName || ''; hc.title = hv.seat == null ? __L("Bu masa {0} kıraathanesinde", [(hv.name)]) : __L("Ev sahibi: {0} · {1} ({2})", [(hv.owner || ''), (hv.name), (hv.tierName || '')]); } else hc.hidden = true; } // v9.76 görsel ev sahipliği
    var mc = $('multChip'); if (mc) { var sp = !!(G.ok && G.ok.fakeIsOkey); mc.textContent = sp ? __L("Özel El · ×4") : __L("×2 okeyle"); mc.className = sp ? 'special' : ''; mc.title = __L("{0} — dokun: açıklama", [(sp ? __L("Özel el: sahte okey joker; sahte okeyle bitiş −40, rakiplerin kalan taş puanı ×4") : __L("Okeyle bitiş: −20, rakiplerin kalan taş puanı ×2"))]); } // v9.73: bu elde hangi çarpan var; v9.79: dokununca açıklama
    maybeSpecialAnnounce(); // v9.79 (madde 7): özel elde bir kez duyuru
    var gch = $('guestChip'); if (gch) { var gst = !!(NET.online && !G.tutorial && appliedTheme && THEMES[appliedTheme] && !arenaOpenMe(appliedTheme)); if (gch.hidden === gst) { gch.hidden = !gst; if (gst) { gch.title = __L("{0} senin için henüz kilitli; bu masada misafirsin. Dokun: nasıl açılır", [(roomName(roomOf(appliedTheme)))]); gch.onclick = function (ev) { if (ev) ev.stopPropagation(); /* üst şeridin çarpan açıklaması da açılmasın */ showArenaLock(roomOf(appliedTheme)); }; } } } // v9.86 (K107, D6): kilitli mekânı misafir olarak görür
    var lch = $('leagueChip'); if (lch) { var lst = !!(NET.online && NET.league && !G.tutorial); if (lch.hidden === lst) { lch.hidden = !lst; lch.onclick = function (ev) { if (ev) ev.stopPropagation(); showLeaguePop(); }; } } // v9.87 (K108): lig maçı rozeti
    $('taskText').textContent = G.task.text;
    $('deck').querySelector('.count').textContent = G.deck.length;
    $('deck').classList.toggle('can', G.phase === 'pickup' && G.cp === ME && G.deck.length > 0);
    var ind = $('ind'); ind.querySelectorAll('.t').forEach(function (e) { e.remove(); }); ind.appendChild(tileEl(G.indicator));
    $('meTotalV').textContent = G.totals[ME];
    $('meName').textContent = N[ME];
    var meLv = $('meLv'); if (meLv) { var ml = myLevel(); meLv.hidden = !ml; if (meLv.textContent !== String(ml)) { meLv.textContent = ml; meLv.title = __L("Seviye {0}", [(ml)]); } } // v9.86
    if (!$('meAv').firstChild) $('meAv').innerHTML = '<span class="avw">' + charImgHTML(myAvatar || DEFAULT_AV, 'bust', 'bust') + '</span>'; // .avw: hareket sarmalayıcısı (bakış/tokat/giriş skini animasyonları gövdenin kendi dönüşümünü ve nefes animasyonunu bozmaz)
    rigMe(); // v9.97

    var actor = G.phase === 'claim' ? Okey.claimant(G) : G.cp;
    var turnOwner = G.phase === 'handover' ? -1 : G.cp;
    function setMood(av, mood) {
      if (!av) return;
      var mir = av.classList.contains('mirror') ? ' mirror' : '';
      if (av.dataset.mood !== mood && av.dataset.mood !== 'draw' && av.dataset.mood !== 'place') { setCls(av, 'av ' + mood + mir); av.dataset.mood = mood; }
      else if (av.dataset.mood === 'draw' || av.dataset.mood === 'place') { setTimeout(function () { setCls(av, 'av ' + mood + mir); av.dataset.mood = mood; }, 650); }
    }
    [0, 1, 2, 3].forEach(function (p) {
      var pl = G.players[p], d = seatEls[p];
      d.classList.toggle('turn', turnOwner === p);
      var nmt = d.querySelector('.nmt'); if (nmt) { if (nmt.textContent !== N[p]) nmt.textContent = N[p]; } else d.querySelector('.nm').textContent = N[p];
      var lvEl = d.querySelector('.lvb'), slv = seatLevel(p); if (lvEl) { lvEl.hidden = !slv; if (slv && lvEl.textContent !== String(slv)) { lvEl.textContent = slv; lvEl.title = __L("Seviye {0}", [(slv)]); } } // v9.86 seviye rozeti
      if (p !== ME) d.querySelector('.pts').textContent = (G.task.req && pl.opened ? '✓ ' : '') + G.totals[p] + ' p' + (handPenOf(p) ? __L(" · ceza {0}", [(handPenOf(p))]) : '');
      fillRack($(SEAT[p].rack), pl.hand.length);
      setMood(d.querySelector('.av'), G.phase === 'handover' && G.handOver ? (G.handOver.winner === p ? 'win' : 'sad') : (actor === p ? 'turn' : 'wait'));
      if (p !== ME) { var disc = $(SEAT[p].disc); disc.innerHTML = ''; var dShow = shownDiscards(p); if (dShow.length) { var dt = dShow[dShow.length - 1], de = tileEl(dt), pk = pullKindOfDisc(p); disc.appendChild(de); disc.classList.toggle('pullable', !!pk); disc.onpointerdown = pk ? (function (el, tile, kind) { return function (ev) { startPull(ev, el, kind, tile); }; })(de, dt, pk) : null; if (pk && PULL_DEST && PULL_DEST.tileId === dt.id) de.classList.add('pullsrc'); } else { disc.classList.remove('pullable'); disc.onpointerdown = null; } } // v9.80: alabileceğim taş sürüklenebilir
    });
    var myAv = $('meAv').querySelector('.av');
    var myMood = G.phase === 'handover' && G.handOver ? (G.handOver.winner === ME ? 'win' : 'sad') : (actor === ME ? 'turn' : 'wait');
    if (myAv && myAv.dataset.mood !== myMood) { setCls(myAv, 'av bust ' + myMood); myAv.dataset.mood = myMood; }
    $('meAv').classList.toggle('turn', turnOwner === ME);

    var md = $('mydisc'); md.querySelectorAll('.t').forEach(function (e) { e.remove(); });
    var myShow = shownDiscards(ME), myTop = myShow.length ? myShow[myShow.length - 1] : null; // v10.06 (K160): bitiş taşı köşede değil ortada
    md.querySelector('.empty').hidden = !!myTop;
    if (myTop) md.appendChild(tileEl(myTop));
    var finT = G.phase === 'handover' && G.handOver && G.handOver.finishTile, ftEl = $('finTile'); // v10.06 (K160): bitiş taşı masanın ortasında, "X bitirdi" etiketiyle
    if (ftEl) { if (finT) { if (ftEl.dataset.id !== String(finT.id)) { var wn = G.handOver.winner; ftEl.innerHTML = '<i class="lbl">' + (wn === ME ? __L("Bitirdin!") : __L("{0} bitirdi", [(esc(G.names[wn] || ''))])) + '</i>'; ftEl.appendChild(tileEl(finT)); ftEl.dataset.id = String(finT.id); ftEl.dataset.fresh = '1'; } ftEl.hidden = false; } else if (!ftEl.hidden || ftEl.dataset.id) { ftEl.hidden = true; ftEl.dataset.id = ''; ftEl.innerHTML = ''; } }

    renderMelds();
    $('statusText').textContent = G.log.length ? G.log[G.log.length - 1] : '';
    var tt = $('turnText');
    if (G.phase === 'claim') { tt.textContent = __L("{0} taşı istiyor mu?", [(N[actor])]); tt.className = 'turnmsg'; }
    else if (G.phase === 'handover') { tt.textContent = __L("El bitti"); tt.className = 'turnmsg'; }
    else if (G.cp === ME) { tt.textContent = __L("Sıra sende"); tt.className = 'turnmsg me'; }
    else { tt.textContent = __L("{0} oynuyor", [(N[G.cp])]); tt.className = 'turnmsg'; }
    $('meState').textContent = __L("{0} taş · {1}{2}", [(me.hand.length), (G.task.req ? (me.opened ? __L("açıldın") : __L("açılmadın")) : __L("kafa eli")), (handPenOf(ME) ? __L(" · bu el +{0} ceza puanı", [(handPenOf(ME))]) : '')]);
    var tk = G.hand + ':' + G.turnNo + ':' + G.cp;
    var badgeOn = G.cp === ME && G.phase !== 'claim' && G.phase !== 'handover';
    $('rackWrap').classList.toggle('myturn', badgeOn); // v9.89 (K113): sıra sendeyken ıstaka çerçevesi parlar (karakter parlaması + yazı + ses zaten var)
    var tb = $('turnBadge');
    var newTurn = tk !== lastTurnKey;
    if (newTurn) { lastTurnKey = tk; tb.classList.remove('on'); void tb.offsetWidth; }
    tb.classList.toggle('on', badgeOn);
    if (newTurn && badgeOn && G.phase === 'pickup' && !G.tutorial && !prepActive()) turnCallout(); // v10.06 (K146): ilk sıralarda büyük "Sıra sende" bildirimi + ses (tester: sırasının geldiğini fark etmemiş)

    renderRack();
    renderActions();
    renderClaim();
    syncSkinUI();
    saveGame();
    scheduleHint();
  }

  var OWN_COLOR = ['#5fe0c8', __L("var(--sun)"), __L("var(--star)"), __L("var(--water)")];
  function shortName(n) { n = String(n || ''); return n.length > 8 ? n.slice(0, 7) + '…' : n; }
  function meldEl(m, mi, canAdd, part) {
    var me = G.players[ME];
    var d = document.createElement('div'); d.className = 'meld'; d.dataset.meld = mi; d.dataset.drop = 'meld'; d.style.setProperty('--own', OWN_COLOR[m.owner]); d.title = G.names[m.owner] + (m.kind === 'set' ? __L(" · renkli per") : __L(" · seri per"));
    var tiles = Okey.layoutMeld(m, G.ok);
    if (part && part.part > 0) { d.classList.add('cont'); d.dataset.part = part.part; d.dataset.from = part.from; d.insertAdjacentHTML('beforeend', '<span class="link">⤷</span>'); }
    (part ? tiles.slice(part.from, part.to) : tiles).forEach(function (t) { d.appendChild(tileEl(t)); });
    // Dokunma: seçili taş(lar) varsa işleme denemesi (motor doğrular; uymazsa taş yerinde kalır, nedeni söylenir); seçim yoksa perin detay görünümü
    if (canAdd && sel.length === 1 && Okey.canSwapJoker(G, mi, sel[0])) {
      d.classList.add('cantap');
      var st = sel[0]; d.onclick = function () { overlay(null); swapJoker(mi, st); };
    } else if (canAdd && sel.length >= 2 && Okey.canSwapJokers(G, mi, sel)) { // v9.81: seçili taşlar perdeki okeylerin yerine (tek işlem)
      d.classList.add('cantap');
      var sts = sel.slice(); d.onclick = function () { overlay(null); swapJokers(mi, sts); };
    } else if (canAdd && Okey.canAddTo(G, mi, sel) && sel.length < me.hand.length) {
      d.classList.add('cantap');
      d.onclick = function () { overlay(null); var selIds = sel.map(function (t) { return t.id; }); doAction(function () { Okey.actAdd(G, mi, sel.slice()); sel = []; }, 'add', { meld: mi, tiles: selIds }); };
    } else if (sel.length && G.phase === 'play' && G.cp === ME) {
      d.onclick = function () { toast(addProblem(mi, sel), 'warn'); shake(d); };
    } else d.onclick = function () { showMeldDetail(mi); };
    return d;
  }
  // Neden işlenemiyor? (kısa, kural diliyle)
  function addProblem(mi, tiles) {
    var me = G.players[ME];
    if (!me.opened) return __L("Masaya taş işlemek için önce görevini tamamlayıp yere açılmalısın.");
    if (me.openedThisTurn) return __L("Açıldığın sırada işleme yapılmaz; bir sonraki sıranda işleyebilirsin.");
    if (tiles.length >= me.hand.length) return __L("Elinde atacak bir taş kalmalı.");
    var m = G.table[mi], who = tiles.length > 1 ? __L("Seçili taşlar") : __L("Bu taş");
    if (m.kind === 'set') { // v9.72: gerçek ret nedeni (dolu per, okeyli per, yanlış sayı, aynı renk)
      var ok = G.ok, real = m.tiles.filter(function (t) { return !Okey.isJoker(t, ok); }), jokers = m.tiles.length - real.length;
      var n0 = real.length ? Okey.effective(real[0], ok).n : null, have = {}; real.forEach(function (t) { have[Okey.effective(t, ok).c] = true; });
      if (m.tiles.length >= 4) {
        if (jokers) { var miss = [0, 1, 2, 3].filter(function (c) { return !have[c]; }).map(function (c) { return Okey.COLORS[c]; }); return __L("Bu renkli per dolu (4 taş){0}", [(jokers > 1 ? __L(" ve {0} okey içeriyor: okeyler eksik renklerin ({1}) {2}'i ile alınır — ikisini birden almak için iki taşı birlikte seç; başka taş eklenemez.", [(jokers), (miss.join(', ')), (n0)]) : __L(". İçindeki okeyi almak için eksik rengin ({0}) {1}'ini okeyin ÜSTÜNE bırak; başka taş eklenemez.", [(miss.join(', ')), (n0)]))]); } // v9.98 (K128): iki okeyli dolu per artık alınabilir
        return __L("Bu renkli per dolu: dört renkte {0} tamam, taş eklenemez.", [(n0)]);
      }
      if (tiles.length > 1) return __L("{0} bu pere uymuyor: renkli pere aynı sayının eksik renkleri eklenir; taşları tek tek dene.", [(who)]);
      var t0 = tiles[0]; if (Okey.isJoker(t0, ok)) return __L("Okey bu pere eklenebilir ama per 4 taşı geçemez.");
      var e0 = Okey.effective(t0, ok);
      if (n0 !== null && e0.n !== n0) return __L("Bu taş bu pere uymuyor: per {0}'lerden oluşuyor, sen {1} işlemeye çalışıyorsun.", [(n0), (e0.n)]);
      if (have[e0.c]) return __L("Bu taş bu pere uymuyor: {0} {1} perde zaten var; aynı renkten ikinci taş olmaz.", [(Okey.COLORS[e0.c]), (e0.n)]);
      return __L("{0} bu pere uymuyor: renkli pere aynı sayının eksik rengi eklenir.", [(who)]);
    }
    var okR = G.ok, jm = m.tiles.filter(function (t) { return Okey.isJoker(t, okR); }).map(function (j) { var q = Okey.jokerMeaning(G, mi, j); return q ? Okey.COLORS[q.colors[0]] + ' ' + q.n : null; }).filter(Boolean);
    if (jm.length) return __L("{0} bu pere uymuyor. Bu perdeki okey{1}: okeyi almak için tam o taşı seç{2}. Seriye ancak uçlara aynı renkte sıradaki sayı eklenir.", [(who), (jm.length > 1 ? __L("ler {0} yerinde", [(jm.join(__L(" ve ")))]) : __L(" {0} yerinde", [(jm[0])])), (jm.length > 1 ? __L(" (iki okeyi birden almak için iki taşı birlikte seç)") : '')]); // v9.81
    return __L("{0} bu pere uymuyor: seri pere aynı renkte bir önceki ya da bir sonraki sayı eklenir.", [(who)]);
  }
  // ---------- Oyuncu açma bölgeleri: yerleşim motoru ----------
  // Masa dört bölgeye ayrılır: üst (karşıdaki), orta bant [sol (soldaki) | merkez: deste+gösterge | sağ (sağdaki)], alt (yerel oyuncu).
  // Her per yalnızca AÇAN oyuncunun (m.owner, sabit) bölgesine yerleşir; sonradan taş işleyen oyuncu bölgeyi değiştirmez.
  // Bölge içinde perler "ilk sığan satır" kuralıyla satırlara dizilir, önceki yerleşim korunur (yalnızca taşan per kayar).
  // Bant yükseklikleri içeriğe göre dağıtılır; taş boyu 56 → 50 → 44 → 40 (alan yetmezse). Dar bölgeye sığmayan uzun per "⤷" ile parçalanır;
  // parçalama gerektirmeyen en büyük boy tercih edilir. Alt bantta sol taraf yerel karakterin başı için ayrılır; yer kalmazsa karakter geriye yaslanır.
  var MELD_SIZES = [56, 50, 44, 40], MELD_GAP_X = 14, MELD_PAD = 10 + 3; // yatay iç boşluk 5+5 + sol renk çizgisi 3
  var SP_NORMAL = { gapY: 10, pad: 6, padTop: 18, gap: 8 }, SP_TIGHT = { gapY: 6, pad: 4, padTop: 16, gap: 4 }; // satır arası / bölge iç boşluğu / etiket şeridi / bölgeler arası
  var ZONE_SLIM = 24, CENTER_W = 120; // merkez sütun: deste + sayaç + gösterge (yan bölgeler bu sütunun iki yanında)
  var LAYP = { padTopCut: 12, centerW: 100, gapX: 8, pad: 9 }; // v9.74 telefon yerleşimi (yalnız PHONE): etiket şeridi kesintisi, merkez sütun genişliği, perler arası boşluk, per iç boşluğu (CSS --meld-px ile uyumlu)
  function gapX() { return PHONE ? LAYP.gapX : MELD_GAP_X; }
  function meldPad() { return PHONE ? LAYP.pad : MELD_PAD; }
  var GROUP_V = 151, GROUP_H = 95; // merkez grubun yüksekliği: dikey (deste üstte, gösterge altta) / yan yana (bant kısaysa)
  var HEAD_Y = 517, HEAD_W = 112; // yerel karakterin saç tepesi (sahne y) ve baş için ayrılan sütun genişliği (ıstakanın ortası etrafında)
  var zoneCfg = { topX0: 38, topX1: 802 }; // üst bölgenin yatay sınırı (#melds içine göre; köşe atma alanlarına değmez, yuvarlak masada daha dar)
  function meldWidth(n, tw) { return n * tw + (n - 1) * 2 + meldPad(); }
  function rowPitch(tw, gapY) { return tw + 7 + gapY; }
  var zonePrev = { 0: null, 1: null, 2: null, 3: null }; // bölge → son yerleşim hafızası {tw, rows, x, n}
  var duckHand = ''; // v9.77: telefonda karakterin geriye yaslandığı el (el bitene kadar yaslı kalır)
  // Tek bölge: list [{mi, m}] → satırlar. keep: önceki satırlar korunur (aynı taş boyunda). Sığmayan uzun per dengeli parçalanır (⤷).
  // hole: {x0, x1, y0} (bölge içi koordinat) — bu dikdörtgenle kesişen satırlar iki şeride bölünür (yerel karakterin başı için boşluk).
  function packZone(list, W, tw, mem, keep, gapY, hole) {
    var R = rowPitch(tw, gapY);
    var spansOf = function (r) { return (hole && r * R + tw + 7 > hole.y0) ? [[0, hole.x0], [hole.x1, W]] : [[0, W]]; };
    var Wmax = hole ? Math.max(hole.x0, W - hole.x1) : W;
    var maxPer = Math.max(1, Math.floor((Wmax - meldPad() + 2) / (tw + 2)));
    var pieces = [], splits = 0, multi = {};
    list.forEach(function (e) {
      var n = e.m.tiles.length;
      if (n <= maxPer) pieces.push({ mi: e.mi, part: 0, from: 0, to: n, n: n, w: meldWidth(n, tw) });
      else { // dengeli parçalama: 13 taş / en çok 7 → 7+6
        splits++; multi[e.mi] = true;
        var kParts = Math.ceil(n / maxPer), base = Math.floor(n / kParts), extra = n % kParts, from = 0;
        for (var part = 0; part < kParts; part++) { var len = base + (part < extra ? 1 : 0); pieces.push({ mi: e.mi, part: part, from: from, to: from + len, n: len, w: meldWidth(len, tw) }); from += len; }
      }
    });
    var rows = []; // satır: { sp: [{x0, x1, pcs: []}] }
    var newRow = function (r) { return { sp: spansOf(r).map(function (q) { return { x0: q[0], x1: q[1], pcs: [] }; }) }; };
    var GX = gapX();
    var used = function (sp) { var w = 0; sp.pcs.forEach(function (pc, i) { w += (i ? GX : 0) + pc.w; }); return w; };
    var fitsIn = function (sp, pc) { return sp.x0 + used(sp) + (sp.pcs.length ? GX : 0) + pc.w <= sp.x1; };
    var place = function (pc) { // ilk sığan satır/şerit; hiçbiri sığmazsa yeni satır
      for (var r = 0; ; r++) { if (r === rows.length) rows.push(newRow(r)); for (var k = 0; k < rows[r].sp.length; k++) if (fitsIn(rows[r].sp[k], pc)) { rows[r].sp[k].pcs.push(pc); return; } if (r > 60) { rows[r].sp[0].pcs.push(pc); return; } }
    };
    var pending = pieces;
    if (keep && mem && mem.tw === tw) { // önceki satır ve şeritte kal; taşan şeritten büyüyen (yoksa sondaki) per çıkar
      pending = [];
      pieces.forEach(function (pc) {
        var r = mem.rows[pc.mi], x = mem.x[pc.mi];
        if (pc.part !== 0 || multi[pc.mi] || r === undefined) { pending.push(pc); return; }
        while (rows.length <= r) rows.push(newRow(rows.length));
        var sps = rows[r].sp, k = 0; for (var i = 0; i < sps.length; i++) if (x >= sps[i].x0 && x < sps[i].x1) { k = i; break; }
        sps[k].pcs.push(pc);
      });
      rows.forEach(function (row) { row.sp.forEach(function (sp) {
        sp.pcs.sort(function (a, b) { return (mem.x[a.mi] || 0) - (mem.x[b.mi] || 0); });
        while (sp.pcs.length && sp.x0 + used(sp) > sp.x1) {
          var gi = -1; for (var i = sp.pcs.length - 1; i >= 0; i--) if (mem.n[sp.pcs[i].mi] !== undefined && mem.n[sp.pcs[i].mi] < sp.pcs[i].n) { gi = i; break; }
          if (gi < 0) gi = sp.pcs.length - 1;
          pending.push(sp.pcs.splice(gi, 1)[0]);
        }
      }); });
      pending.sort(function (a, b) { return (a.mi - b.mi) || (a.part - b.part); });
    }
    pending.forEach(place);
    while (rows.length && !rows[rows.length - 1].sp.some(function (sp) { return sp.pcs.length; })) rows.pop(); // sondaki boş satırlar
    var items = [];
    rows.forEach(function (row, r) { row.sp.forEach(function (sp) { var x = sp.x0; sp.pcs.forEach(function (pc, i) { if (i) x += GX; items.push({ mi: pc.mi, part: pc.part, from: pc.from, to: pc.to, n: pc.n, x: x, y: r * R, w: pc.w }); x += pc.w; }); }); });
    return { rows: rows.length, items: items, splits: splits, h: rows.length ? rows.length * R - gapY : 0 };
  }
  // Bütün bölgeler: taş boyu, boşluk modu ve bant yükseklikleri.
  // Dönen: { tw, sp, zones:{p:{x,y,w,h,items,rows}}, center:{x,y,mode}, head, overflow }
  function zonesLayout(table) {
    var A = $('melds'), AW = A.clientWidth || 840, AH = A.clientHeight || 386, AY = A.offsetTop || 240, AX = A.offsetLeft || 380;
    var by = { 0: [], 1: [], 2: [], 3: [] };
    table.forEach(function (m, mi) { if (by[m.owner]) by[m.owner].push({ mi: mi, m: m }); });
    var topX0 = zoneCfg.topX0, topX1 = zoneCfg.topX1;
    var headTop = HEAD_Y - AY, headCx = 812 - AX; // başın üst sınırı ve merkezi (bölge alanı koordinatı)
    function attempt(tw, keep, emptyRow, head, sp0) {
      var sp = PHONE ? { gapY: sp0.gapY, pad: sp0.pad, padTop: Math.max(4, sp0.padTop - LAYP.padTopCut), gap: sp0.gap } : sp0; // telefonda etiket şeridi kısaltılabilir
      var Wt = topX1 - topX0 - 2 * sp.pad, Wb = AW - 2 * sp.pad;
      var z = {};
      z[2] = packZone(by[2], Wt, tw, zonePrev[2], keep, sp.gapY, null);
      var R = rowPitch(tw, sp.gapY), emptyH = emptyRow ? (R - sp.gapY + sp.padTop + sp.pad) : ZONE_SLIM;
      var zh = function (zz) { return zz.rows ? zz.h + sp.padTop + sp.pad : emptyH; };
      var hTop = zh(z[2]);
      // merkez grup: üst bant kısaysa dikey, uzunsa yan yana; o da başın üstüne taşarsa bu deneme (başlı) geçersiz
      var midStart = hTop + sp.gap, mode = 'v';
      if (head) { if (midStart + 6 + GROUP_V > headTop - 6) mode = 'h'; if (mode === 'h' && midStart + 6 + GROUP_H > headTop - 6) return { fits: false, head: true, invalid: true }; }
      var CW = (PHONE && mode === 'v') ? LAYP.centerW : CENTER_W; // v9.74: telefonda deste gösterge üstündeyken merkez sütun dar → yan bölgeler geniş
      var sideW = Math.floor((AW - CW - 2 * sp.gap) / 2), Ws = sideW - 2 * sp.pad;
      z[3] = packZone(by[3], Ws, tw, zonePrev[3], keep, sp.gapY, null); z[1] = packZone(by[1], Ws, tw, zonePrev[1], keep, sp.gapY, null);
      var hMidMin = mode === 'v' ? GROUP_V + 12 : GROUP_H + 12;
      var hMid0 = Math.max(zh(z[3]), zh(z[1]), hMidMin);
      // alt bölge: tam genişlik; baş için orta boşluk (yalnızca başlı denemede)
      var yBotMin = midStart + hMid0 + sp.gap, yB = yBotMin, hole = null, hBot = 0; // alt bant alta yaslanır; boşluk satırları kesin yere göre hesaplanır
      for (var it = 0; it < 4; it++) {
        hole = head ? { x0: headCx - HEAD_W / 2 - sp.pad, x1: headCx + HEAD_W / 2 - sp.pad, y0: Math.max(0, headTop - (yB + sp.padTop)) } : null;
        z[0] = packZone(by[0], Wb, tw, zonePrev[0], keep, sp.gapY, hole);
        hBot = zh(z[0]);
        var yB2 = Math.max(yBotMin, AH - hBot);
        if (yB2 === yB) break; yB = yB2;
      }
      var total = hTop + sp.gap + hMid0 + sp.gap + hBot;
      return { tw: tw, sp: sp, sideW: sideW, z: z, hTop: hTop, hMid: hMid0, hBot: hBot, mode: mode, hole: hole, total: total, fits: total <= AH, splits: z[0].splits + z[1].splits + z[2].splits + z[3].splits, head: head, overflow: Math.max(0, total - AH) };
    }
    var cands = [], fitting = [];
    var add = function (tw, emptyRow, head, sp) { var c = attempt(tw, true, emptyRow, head, sp); if (!c.fits && !c.invalid) c = attempt(tw, false, emptyRow, head, sp); if (c.invalid) return; cands.push(c); if (c.fits) fitting.push(c); };
    var sizes = PHONE ? [80, 76, 72, 68, 64, 60, 56, 53, 50, 47, 44, 40] : MELD_SIZES; // v9.74: telefonda masa taşları önce 80/72/64 px denenir (sığıyorsa %43 büyük), masa dolunca eskisi gibi küçülür; v9.77: ara boylar (4 px adım) — genişleyen alanda sığan en büyük boy kaçmasın
    sizes.forEach(function (tw) {
      add(tw, true, true, SP_NORMAL); add(tw, false, true, SP_NORMAL); // önce boş bölgelere bir satırlık yer, sonra ince şerit
      if (PHONE) { add(tw, true, true, SP_TIGHT); add(tw, false, true, SP_TIGHT); } // v9.74: telefonda taşı küçültmeden önce satır/bölge boşlukları sıkılaştırılır (aynı düzen, daha büyük taş)
    });
    if (!fitting.length) [40, 36].forEach(function (tw) { add(tw, false, true, SP_TIGHT); }); // sık boşluk, karakter görünür kalır
    if (!fitting.length) sizes.forEach(function (tw) { add(tw, false, false, SP_NORMAL); }); // yine sığmadı: karakter geriye yaslanır
    if (!fitting.length) [40, 36].forEach(function (tw) { add(tw, false, false, SP_TIGHT); }); // son çare: sık boşluk, 36 px, başsız
    var best;
    if (window.AO && AO.layDebug) AO.layCands = cands.map(function (c) { return { tw: c.tw, sp: c.sp.gapY === SP_TIGHT.gapY ? 'tight' : 'normal', fits: c.fits, total: c.total, splits: c.splits, head: c.head, mode: c.mode, hTop: c.hTop, hMid: c.hMid, hBot: c.hBot }; }); // yalnız ölçüm/test için
    var pick = function (list) { if (!list.length) return null; var minS = Math.min.apply(null, list.map(function (c) { return c.splits; })); return list.filter(function (c) { return c.splits === minS; })[0]; };
    if (fitting.length) best = pick(fitting);
    else best = cands[cands.length - 1]; // sığmadı: taşma işaretlenir (büyüteç "!")
    if (!table.length) duckHand = ''; // boş masa (yeni el): yaslanma sıfırlanır
    if (PHONE && best.head && table.length) { // v9.77 (K86): telefonda yerel karakter geriye yaslanınca (alt bant tam genişlik) masa taşı en az bir boy büyüyorsa yaslanır; el boyunca yaslı kalır (karakter inip kalkmasın)
      var nh = [], hk = G ? G.hand + ':' + (G.matchId || '') : '';
      sizes.forEach(function (tw) { [SP_NORMAL, SP_TIGHT].forEach(function (s0) { [true, false].forEach(function (er) { var c = attempt(tw, true, er, false, s0); if (!c.fits) c = attempt(tw, false, er, false, s0); if (c.fits) nh.push(c); }); }); });
      var bn = pick(nh), stick = duckHand === hk;
      if (bn && (!fitting.length || (bn.splits <= best.splits && (bn.tw > best.tw || (stick && bn.tw >= best.tw))))) { best = bn; duckHand = hk; }
    }
    var sp = best.sp, sideW = best.sideW, midStart = best.hTop + sp.gap;
    var yBot = Math.max(midStart + best.hMid + sp.gap, AH - best.hBot), midH = yBot - sp.gap - midStart;
    var zones = {};
    zones[2] = { x: topX0, y: 0, w: topX1 - topX0, h: best.hTop, items: best.z[2].items, rows: best.z[2].rows };
    zones[3] = { x: 0, y: midStart, w: sideW, h: midH, items: best.z[3].items, rows: best.z[3].rows };
    zones[1] = { x: AW - sideW, y: midStart, w: sideW, h: midH, items: best.z[1].items, rows: best.z[1].rows };
    zones[0] = { x: 0, y: yBot, w: AW, h: Math.max(best.hBot, AH - yBot), items: best.z[0].items, rows: best.z[0].rows };
    [0, 1, 2, 3].forEach(function (p) { var mem = { tw: best.tw, rows: {}, x: {}, n: {} }; best.z[p].items.forEach(function (it) { if (it.part === 0) { mem.rows[it.mi] = Math.round(it.y / rowPitch(best.tw, sp.gapY)); mem.x[it.mi] = it.x; mem.n[it.mi] = table[it.mi].tiles.length; } }); zonePrev[p] = mem; });
    // merkez grup: orta bandın üstüne yaslı (başa çarpmaz); bant genişse ortalanır
    var gh = best.mode === 'v' ? GROUP_V : GROUP_H, gy = midStart + 6, slack = midH - gh - 12;
    if (best.head) { var maxTop = headTop - 6 - gh; gy = Math.min(gy + Math.max(0, slack / 2), maxTop); gy = Math.max(gy, midStart + 6); } else gy = midStart + 6 + Math.max(0, slack / 2);
    return { tw: best.tw, pad: sp.pad, padTop: sp.padTop, zones: zones, center: { x: AW / 2, y: gy, mode: best.mode }, head: best.head, overflow: best.overflow };
  }
  var meldPos = {}; // önceki konumlar: değişmeyen perler yerinde kalır, yeni gelen taş masayı karıştırmaz
  function renderMelds() {
    if (drag && drag.moving) return; // sürükleme sırasında hedefler yerinden oynamaz; bırakınca çizilir
    var me = G.players[ME], area = $('melds');
    var canAdd = G.phase === 'play' && G.cp === ME && me.opened && !me.openedThisTurn && sel.length > 0;
    var lay = zonesLayout(G.table), newPos = {};
    area.innerHTML = ''; area.style.setProperty('--zt', lay.tw + 'px');
    if (PHONE && G.table.length && !settings.meldHinted && !G.tutorial) { settings.meldHinted = true; saveSettings(); toast(__L("Masadaki bir peri büyük görmek için pere dokun; sağ üstteki büyüteç bütün perleri listeler."), '', 5000); } // v9.74: telefonda bir kez
    var turnOwner = G.phase === 'handover' ? -1 : (G.phase === 'claim' ? Okey.claimant(G) : G.cp);
    [2, 3, 1, 0].forEach(function (p) {
      var zn = lay.zones[p], d = document.createElement('div');
      d.className = __L("zone z{0}{1}{2}{3}", [(p), (p === ME ? ' me' : ''), (zn.rows ? '' : ' empty'), (turnOwner === p ? ' turn' : '')]); d.dataset.zone = p;
      d.style.left = zn.x + 'px'; d.style.top = zn.y + 'px'; d.style.width = zn.w + 'px'; d.style.height = zn.h + 'px'; d.style.setProperty('--own', OWN_COLOR[p]);
      var lb = document.createElement('span'); lb.className = 'zl'; lb.innerHTML = '<i></i>' + (p === ME ? __L("Sen · ") : '') + shortName(G.names[p]); d.appendChild(lb);
      zn.items.forEach(function (it) {
        var m = G.table[it.mi], el = meldEl(m, it.mi, canAdd, it);
        var key = it.mi + ':' + it.part, prev = meldPos[key];
        el.style.left = (lay.pad + it.x) + 'px'; el.style.top = (lay.padTop + it.y) + 'px';
        if (!prev) el.classList.add('nomove'); // yeni per: kayma animasyonu yok, doğrudan yerinde
        newPos[key] = { x: it.x, y: it.y };
        d.appendChild(el);
      });
      area.appendChild(d);
    });
    meldPos = newPos;
    // merkez grup: deste + sayaç + gösterge orta bandın ortasında (sahne koordinatı = alan konumu + bölge içi konum)
    var ax = area.offsetLeft || 380, ay = area.offsetTop || 240, cx = ax + lay.center.x, gy = ay + lay.center.y, root = document.documentElement.style;
    if (lay.center.mode === 'v') { // deste üstte, gösterge altta
      root.setProperty('--deck-x', Math.round(cx - 32) + 'px'); root.setProperty('--deck-y', Math.round(gy) + 'px');
      root.setProperty('--ind-x', Math.round(cx - 23) + 'px'); root.setProperty('--ind-y', Math.round(gy + 81) + 'px');
    } else { // yan yana (orta bant kısa)
      root.setProperty('--deck-x', Math.round(cx - 58) + 'px'); root.setProperty('--deck-y', Math.round(gy) + 'px');
      root.setProperty('--ind-x', Math.round(cx + 12) + 'px'); root.setProperty('--ind-y', Math.round(gy + 6) + 'px');
    }
    $('chMe').classList.toggle('duck', !lay.head); // alt banda yer kalmadıysa karakter geriye yaslanır; perler hiçbir zaman örtülmez
    var zb = $('zoomBtn'), more = zb.querySelector('.more');
    zb.hidden = !G.table.length;
    more.hidden = !lay.overflow; more.textContent = lay.overflow ? '!' : '';
  }
  // Bir perin detayı: taşlar büyük, masadaki gerçek sırayla; okeyin temsil ettiği taş yazılır; seçili taş uyuyorsa "Bu pere işle"
  function showMeldDetail(mi) {
    var m = G.table[mi]; if (!m) return;
    clearTimeout(botTimer);
    var me = G.players[ME], ok = G.ok, lay = Okey.layoutMeld(m, ok);
    var jk = lay.filter(function (t) { return Okey.isJoker(t, ok); }).map(function (t) {
      var mean = Okey.jokerMeaning(G, mi, t), txt;
      if (!mean) txt = __L("OK → {0}", [(m.kind === 'set' ? __L("eksik renklerden biri") : __L("serideki eksik taş"))]);
      else txt = __L("OK → {0}", [(mean.colors.map(function (c) { return Okey.COLORS[c] + ' ' + mean.n; }).join(' / '))]);
      return txt + (t.placedBy != null ? __L(" (koyan: {0})", [(G.names[t.placedBy])]) : '');
    });
    var canAct = G.phase === 'play' && G.cp === ME && me.opened && !me.openedThisTurn && sel.length > 0;
    var swap = canAct && sel.length === 1 && Okey.canSwapJoker(G, mi, sel[0]);
    var swapN = canAct && !swap && sel.length >= 2 && Okey.canSwapJokers(G, mi, sel); // v9.81
    var add = canAct && !swap && !swapN && Okey.canAddTo(G, mi, sel) && sel.length < me.hand.length;
    var html = __L("<h2><span class=\"owndot\" style=\"--own:{0}\"></span>{1} · {2} · {3} taş</h2><div class=\"meldbig\" id=\"mdTiles\"></div>{4}{5}<div class=\"row\">{6}<button class=\"primary\" id=\"mdClose\">Kapat</button></div>", [(OWN_COLOR[m.owner]), (G.names[m.owner]), (m.kind === 'set' ? __L("Renkli per") : __L("Seri per")), (m.tiles.length), (jk.length ? '<p class="note">' + jk.join('<br>') + '</p>' : ''), (sel.length ? '<p class="muted">' + (swap ? __L("Seçili taşın bu perdeki okeyin yerine geçiyor; okeyi alırsın.") : swapN ? __L("Seçili {0} taş bu perdeki {1} okeyin yerine birebir geçiyor; okeylerin hepsini tek hamlede alırsın.", [(sel.length), (sel.length)]) : add ? __L("Seçili taş{0} bu pere eklenebilir.", [(sel.length > 1 ? __L("lar") : '')]) : (canAct ? __L("Seçili taş bu pere uymuyor.") : (me.opened ? (G.cp !== ME || G.phase !== 'play' ? __L("Sıran gelip taş çektikten sonra işleyebilirsin.") : __L("Açıldığın sırada işleme yapılmaz.")) : __L("Masaya taş işlemek için önce yere açılmalısın.")))) + '</p>' : ''), ((swap || swapN || add) ? '<button class="good" id="mdDo">' + (swap ? __L("Okeyi al") : swapN ? __L("Okeyleri al ({0})", [(sel.length)]) : __L("Bu pere işle")) + '</button>' : '')]);
    overlay(html);
    var box = $('mdTiles'); var md = document.createElement('div'); md.className = 'meld'; md.style.setProperty('--own', OWN_COLOR[m.owner]);
    lay.forEach(function (t) { md.appendChild(tileEl(t)); }); box.appendChild(md);
    $('mdClose').onclick = function () { overlay(null); render(); if (G.phase !== 'handover') schedule(); };
    if ($('mdDo')) $('mdDo').onclick = function () {
      overlay(null);
      if (swap) { swapJoker(mi, sel[0]); return; }
      if (swapN) { swapJokers(mi, sel.slice()); return; }
      var selIds = sel.map(function (t) { return t.id; });
      doAction(function () { Okey.actAdd(G, mi, sel.slice()); sel = []; }, 'add', { meld: mi, tiles: selIds }); // motor geçerliliği tekrar kontrol eder
    };
  }
  function showZoom() {
    if (!G || !G.table.length) return;
    var me = G.players[ME];
    var canAdd = G.phase === 'play' && G.cp === ME && me.opened && !me.openedThisTurn && sel.length > 0;
    var html = __L("<h2>Açılan perler</h2>{0}<div class=\"zoomlist\" id=\"zoomList\"></div><div class=\"row\"><button class=\"primary\" id=\"zoomClose\">Kapat</button></div>", [(canAdd ? __L("<p class=\"muted\">Seçili taşını ekleyebileceğin perler sarı çerçeveli; dokunarak işle. Diğer perlere dokununca detayı açılır.</p>") : __L("<p class=\"muted\">Herkesin masaya açtığı perler. Bir pere dokununca büyük görünümü açılır.</p>"))]);
    overlay(html);
    var list = $('zoomList');
    [2, 3, 1, 0].forEach(function (p) {
      var ms = G.table.map(function (m, i) { return [m, i]; }).filter(function (x) { return x[0].owner === p; });
      if (!ms.length) return;
      var sec = document.createElement('div'); sec.innerHTML = __L("<div class=\"own\" style=\"--own:{0}\"><i></i>{1} · {2} per</div><div class=\"melds\"></div>", [(OWN_COLOR[p]), (G.names[p]), (ms.length)]);
      var wrap = sec.querySelector('.melds');
      ms.forEach(function (x) { wrap.appendChild(meldEl(x[0], x[1], canAdd)); });
      list.appendChild(sec);
    });
    $('zoomClose').onclick = function () { overlay(null); render(); if (G.phase !== 'handover') schedule(); };
  }
  $('zoomBtn').onclick = function () { clearTimeout(botTimer); showZoom(); };
  function renderRack() {
    var r = $('rack');
    syncRack(false);
    if (drag && !drag.moving && Date.now() - drag.at > 15000) cancelDrag(); // v9.79: kaybolmuş basış ıstakayı kilitlemesin (güvenlik)
    if (drag) { rackDirty = true; return; } // v9.79: parmak bir taşa basılıyken (sürükleme başlamadan da) ıstaka yeniden kurulmaz — sıra başkasındayken gelen sunucu durumu basılan taşı yok edip sürüklemeyi bozuyordu; bırakınca çizilir
    rackDirty = false;
    var cols = rackCols();
    var width = r.clientWidth || 912;
    var tw = Math.max(40, Math.min(PHONE ? 110 : 88, Math.floor((width - (cols - 1) * 4) / cols))); // telefonda 88 → 110 (%25 büyük)
    var classic = document.documentElement.classList.contains('skin-klasik');
    if (classic) { // klasik taş 2:3 — hücreler taş genişliğinde, taşlar bitişik, raf ortalı
      var cw = Math.floor((width - (cols - 1) * 2) / cols);
      tw = Math.max(40, Math.min(88, Math.floor(cw * 1.5)));
      var tileW = Math.floor(tw / 1.5);
      r.style.setProperty('--tw', tw + 'px');
      r.style.gridTemplateColumns = 'repeat(' + cols + ', ' + tileW + 'px)';
      r.style.columnGap = '2px'; r.style.justifyContent = 'center'; r.style.width = '';
    } else {
      r.style.setProperty('--tw', tw + 'px');
      r.style.gridTemplateColumns = __L("repeat({0}, 1fr)", [(cols)]);
      r.style.columnGap = ''; r.style.justifyContent = '';
      r.style.width = (cols * tw + (cols - 1) * 4) > width ? width + 'px' : '';
    }
    r.innerHTML = '';
    var segs = rackSegments(), slotCls = {};
    var ts = taskReady();
    var taskSlots = {}; if (ts && !OPEN_SEL.active) ts.segs.forEach(function (sg) { sg.slots.forEach(function (i) { taskSlots[i] = true; }); });
    var candCls = {};
    if (OPEN_SEL.active) { // seçim modu: adaylar güncel ıstakaya göre yeniden bulunur (sürükleme sonrası), seçim anahtarla korunur
      var combos = taskCombos(); if (!combos.length) exitOpenSel(); else { OPEN_SEL.combos = {}; var cands = [], byKey = {}; combos.forEach(function (c) { OPEN_SEL.combos[c.key] = c; c.segs.forEach(function (sg) { var k = segKey(sg); if (!byKey[k]) { byKey[k] = { key: k, tiles: sg.tiles, kind: sg.kind }; cands.push(byKey[k]); } }); }); cands.sort(function (x, y) { return rack.indexOf(x.tiles[0].id) - rack.indexOf(y.tiles[0].id); }); OPEN_SEL.cands = cands; OPEN_SEL.chosen = OPEN_SEL.chosen.filter(function (k) { return !!byKey[k]; });
        cands.forEach(function (c, ci) { var chosen = OPEN_SEL.chosen.indexOf(c.key) >= 0; c.tiles.forEach(function (t) { var i = rack.indexOf(t.id); if (i < 0) return; if (chosen) { candCls[i] = ' chosen'; taskSlots[i] = true; } else if (!candCls[i]) candCls[i] = __L(" cand c{0}", [(ci % 4)]); }); }); }
    }
    if (assistOn()) segs.forEach(function (sg) { if (sg.kind) sg.slots.forEach(function (i, k) { slotCls[i] = 'per' + (k === 0 ? ' first' : '') + (k === sg.slots.length - 1 ? ' last' : '') + (taskSlots[i] ? ' task' : ''); }); });
    Object.keys(candCls).forEach(function (i) { slotCls[i] = (slotCls[i] || '') + candCls[i]; });
    rack.forEach(function (id, i) {
      var s = document.createElement('div'); s.className = 'slot' + (slotCls[i] ? ' ' + slotCls[i] : ''); s.dataset.slot = i; s.dataset.drop = 'slot';
      if (id !== null) {
        var t = tileById(id);
        if (t) { var e = tileEl(t); if (sel.indexOf(t) >= 0) e.classList.add('sel'); if (newTiles[t.id] && Date.now() - newTiles[t.id] < 1500) e.classList.add('new'); else delete newTiles[t.id]; bindTile(e, t); s.appendChild(e); }
      }
      r.appendChild(s);
    });
    var valid = segs.filter(function (s) { return s.kind; }).length;
    var h = $('rackHint');
    var prog = G.task.req ? taskSegments() : null;
    var progTxt = G.task.req ? __L("Görev: {0} — Hazır: <b>{1}/{2}</b>", [(tName(G.task)), (prog ? prog.progress : 0), (G.task.req.length)]) : '';
    if (!assistOn()) h.innerHTML = __L("{0} <span class=\"modeNote\">· Yardımsız mod (perler işaretlenmez)</span>", [(G.task.req ? (G.players[ME].opened ? __L("Açıldın. Perlerini indir, uygun taşları masadaki perlere işle.") : progTxt) : __L("Kafa eli: bütün taşlar per olunca son taşı atarak bitirirsin."))]); // v10.08 (K169): hangi modda olduğu görünür
    else if (!G.task.req) h.innerHTML = valid ? __L("<b>{0} per</b> hazır. Kafa: bütün taşlar per olunca son taşı atarak bitirirsin.", [(valid)]) : __L("Taşları yan yana dizince per oluşur.");
    else if (G.players[ME].opened) h.innerHTML = valid ? __L("<b>{0} per</b> indirmeye hazır.", [(valid)]) : __L("Yan yana dizilen uygun taşlar per olur ve yeşil çizgiyle işaretlenir.");
    else if (OPEN_SEL.active) h.innerHTML = __L("<b>Görev perini seç:</b> çerçeveli taşlara dokun ({0} aday) — seçilenler altın çizgiyle işaretlenir; {1}", [(OPEN_SEL.cands.length), (selValidKey() ? __L("\"Seçilen taşlarla aç\" hazır.") : __L("{0} per seç.", [(G.task.req.length)]))]);
    else if (ts) h.innerHTML = progTxt + (Okey.roundNo(G) < 2 ? __L(" — ilk turda açılamazsın, 2. turda açarsın.") : (taskCombos().length > 1 ? __L(" — \"Per aç\": hangi perlerle açacağını seçersin.") : __L(" — sarı işaretli perlerle \"Per aç\".")));
    else h.innerHTML = progTxt + (prog && prog.progress ? __L(" — eksik: {0}.", [(G.task.req.slice(prog.progress).map(taskReqText).join(__L(" ve ")))]) : __L(" — gereken: {0}.", [(G.task.req.map(taskReqText).join(' + '))]))
  }

  var ICON = {
    color: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="5" height="14" rx="1.5"/><rect x="9.5" y="5" width="5" height="14" rx="1.5"/><rect x="16" y="5" width="5" height="14" rx="1.5"/></svg>',
    num: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18V6M4 6l-2 2M4 6l2 2"/><path d="M10 7h10M10 12h7M10 17h4"/></svg>',
    draw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="4" width="10" height="14" rx="2"/><path d="M12 21v-4M9 20l3-3 3 3"/></svg>',
    take: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="6" width="9" height="12" rx="2"/><path d="M16 12h5M18 9l3 3-3 3"/></svg>',
    open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="9" width="6" height="9" rx="1.5"/><rect x="10" y="9" width="6" height="9" rx="1.5"/><path d="M19 10v8M12 4v2M8 5l1 2M16 5l-1 2"/></svg>',
    lay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="12" width="5" height="8" rx="1.5"/><rect x="9.5" y="12" width="5" height="8" rx="1.5"/><rect x="16" y="12" width="5" height="8" rx="1.5"/><path d="M12 3v6M9 6l3 3 3-3"/></svg>',
    discard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="3" width="9" height="12" rx="2"/><path d="M14 17l3 3M20 14l-3 3M17 20v-6"/></svg>',
    finish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l2.6 5.4 6 .8-4.4 4.2 1.1 5.9L12 16.5 6.7 19.3l1.1-5.9L3.4 9.2l6-.8z"/></svg>'
  };
  function btn(label, cls, fn, disabled, id, icon) {
    var b = document.createElement('button'); if (icon) b.innerHTML = ICON[icon]; b.appendChild(document.createTextNode(label)); if (cls) b.className = cls; b.onclick = fn; b.disabled = !!disabled; if (id) b.id = id; return b;
  }
  // Diz menüsü bir kez kurulur; her çizimde yeniden yaratılmaz (açık menü bot hamlesiyle kapanmaz, dokunuş kaybolmaz)
  function buildSortMenu() {
    var sw = $('btnSortWrap'); if (sw.dataset.built) return; sw.dataset.built = '1';
    var sm = document.createElement('div'); sm.id = 'sortMenu';
    function pick(mode) { return function () { sm.classList.remove('show'); TAP_GUARD = Date.now() + 450; if (!G) return; var found = autoSort(mode); sfx('slide'); render(); emit('sort:' + mode); emit('rack');
      if (mode === 'task') { var me = G.players[ME]; if (me.opened) { toast(__L("Açıldın; görev perin yok, sayıya göre dizildi."), ''); return; } if (!G.task.req) { toast(__L("Kafa eli: görev yok, taşlar dizildi."), ''); return; }
        if (found) { toast(assistOn() ? __L("Görevi karşılayan perler başa alındı (sarı çizgi).") : __L("Görevi karşılayan perler başa alındı. Yardımsız moddasın: perler çizgiyle işaretlenmez — çizgiler için Ayarlar → Oyun modu → Yardımlı."), '', assistOn() ? undefined : 4500); return; } // v10.08 (K169): tester "yeşil/sarı ışık yanmıyor" — Yardımsız modda "(sarı çizgi)" yanıltıyordu
        var ts = TSORT, need = G.task.req.length, miss = ts && ts.miss.length ? ts.miss.map(function (m) { return taskReqText(m.req) + ' (' + m.have + '/' + m.req[1] + ')'; }).join(', ') : G.task.req.map(taskReqText).join(' + ');
        toast(__L("Görev {0}/{1} hazır · eksik: {2} — en yakın taşlar öne alındı.", [(ts ? ts.done : 0), (need), (miss)]), 'soft', 2800); } }; } // v10.06 (K152): kırmızı uyarı değil, bilgi
    var b0 = btn(__L("Göreve Göre Diz"), 'soft', pick('task'), false, 'sortTask', 'num'); b0.insertAdjacentHTML('beforeend', __L("<small>Bu elin görevini karşılayan perleri (okey dahil) başa al.</small>")); sm.appendChild(b0); // v9.89 (canlı bulgu 3)
    var b1 = btn(__L("Sayıya Göre Diz"), 'soft', pick('run'), false, 'sortNum', 'num'); b1.insertAdjacentHTML('beforeend', __L("<small>Aynı renkte ardışık sayıları birleştir.</small>")); sm.appendChild(b1);
    var b2 = btn(__L("Renge Göre Diz"), 'soft', pick('set'), false, 'sortColor', 'color'); b2.insertAdjacentHTML('beforeend', __L("<small>Aynı sayının farklı renklerini birleştir.</small>")); sm.appendChild(b2);
    sw.appendChild(btn(__L("Diz"), 'soft', function () { sm.classList.toggle('show'); }, false, 'btnSort', 'color'));
    sw.appendChild(sm);
    document.addEventListener('pointerdown', function (ev) { if (sm.classList.contains('show') && !sw.contains(ev.target)) { sm.classList.remove('show'); TAP_GUARD = Date.now() + 450; } }, true); // v10.06: menüyü kapatan dokunuş alttaki pere/düğmeye geçmez
  }
  // v10.06 (K153, tester videosu): Diz menüsünden seçim yapan ya da menüyü kapatan dokunuşun hemen ardından gelen tıklama (çift dokunma / iOS hayalet tıklaması)
  // menünün altında kalan pere düşüp "per ayrıntısı" penceresini açıyordu. 450 ms içinde menü dışındaki tıklamalar yutulur.
  var TAP_GUARD = 0;
  document.addEventListener('click', function (ev) { if (Date.now() < TAP_GUARD && !(ev.target && ev.target.closest && ev.target.closest('#sortMenu, #btnSort'))) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  var actionsSig = '';
  function renderActions() {
    buildSortMenu();
    var a = document.createElement('div'); // önce geçici kapsayıcıda kur; değişmediyse DOM'a dokunma (basılı parmak altındaki düğme yok olmaz)
    buildActions(a);
    var sig = a.innerHTML;
    if (sig === actionsSig) return;
    actionsSig = sig;
    var real = $('actions'); real.innerHTML = ''; while (a.firstChild) real.appendChild(a.firstChild);
  }
  function buildActions(a) {
    var me = G.players[ME];
    var myTurn = G.cp === ME && G.phase !== 'claim';
    if (!myTurn || G.phase === 'handover' || prepActive() || introPlaying) return; // hazırlık aşamasında ve giriş gösterisinde hamle yok
    var row = document.createElement('div'); row.className = 'row2'; a.appendChild(row);
    if (G.phase === 'pickup') {
      var td = Okey.topDiscard(G);
      var deckOut = G.deck.length === 0; // deste bitti: çekilecek taş yok; "eli kapat" ile el kimse bitiremeden kapanır (kural: herkese elindeki toplam yazılır)
      row.appendChild(btn(deckOut ? __L("DESTE BİTTİ — ELİ KAPAT") : __L("ÇEK"), 'primary', function () { doAction(function () { Okey.actDraw(G); }, 'draw', {}); }, false, 'btnDraw', 'draw'));
      row.appendChild(btn(__L("YANDAN AL"), 'good', function () { doAction(function () { Okey.actTake(G); }, 'take', {}); }, !td, 'btnTake', 'take'));
      if (deckOut && assistOn()) { var dh = document.createElement('div'); dh.className = 'hint'; dh.textContent = td ? __L("Deste bitti. Yandan alıp bitiremeyeceksen eli kapat; herkese elindeki taşların toplamı yazılır.") : __L("Deste bitti ve alınacak taş yok: eli kapat."); a.appendChild(dh); }
      return;
    }
    var isKafa = !G.task.req;
    if (!isKafa && !me.opened) {
      var ts = taskReady();
      var early = Okey.roundNo(G) < 2;
      if (OPEN_SEL.active) { // v9.74: seçim modu
        var okSel = !!selValidKey();
        row.appendChild(btn(__L("Seçilen taşlarla aç"), 'good', openWithSel, !okSel, 'btnOpenSel', 'open'));
        row.appendChild(btn(__L("Vazgeç"), 'soft', function () { exitOpenSel(); render(); }, false, 'btnOpenCancel'));
      } else row.appendChild(btn(__L("PER AÇ"), 'good', function () {
        var now = taskReady(); // açma anında güncel ıstakayla yeniden doğrula
        if (early) { toast(__L("İlk turda kimse açılamaz. Herkes bir kez oynadıktan sonra, 2. turda açabilirsin."), 'warn'); return; }
        if (!now) { toast(__L("Görev perlerin hazır değil. {0} gerekiyor.", [(G.task.req.map(taskReqText).join(' + '))]), 'warn'); return; }
        var combos = G.tutorial ? [] : taskCombos();
        if (combos.length > 1) { enterOpenSel(combos); return; } // v9.74: birden fazla uygun per → oyuncu seçer
        doAction(function () { Okey.actOpen(G, now.segs.map(function (s) { return s.tiles.slice(); })); sel = []; }, 'open', { groups: now.segs.map(function (s) { return s.tiles.map(function (t) { return t.id; }); }) });
      }, !ts || early, 'btnOpen', 'open'));
    }
    if (!isKafa && me.opened && !me.openedThisTurn) {
      var segs = rackSegments().filter(function (s) { return s.kind; });
      row.appendChild(btn(__L("PERLERİ İNDİR"), 'good', function () {
        var segs = rackSegments().filter(function (s) { return s.kind; }); // tıklama anındaki güncel ıstaka
        var pick = [], left = me.hand.length;
        segs.forEach(function (s) { if (left - s.tiles.length >= 1) { pick.push(s); left -= s.tiles.length; } });
        var amb = pick.filter(ambiguousSeg)[0]; // v9.82 (kullanıcı kararı 3): iki okey + tek taş hem seri hem renkli olabilir → oyuncuya sorulur
        if (amb) { askMeldKind(amb, function (kind) { layPicked(pick, amb, kind); }); return; }
        layPicked(pick, null, null);
      }, !segs.length, 'btnLay', 'lay'));
    }
    var canFinishKafa = false;
    if (isKafa && sel.length === 1) canFinishKafa = !!Okey.partition(me.hand.filter(function (t) { return t !== sel[0]; }), G.ok, 0);
    var finishing = (!isKafa && me.hand.length === 1 && me.opened) || canFinishKafa;
    var lastOne = !isKafa && me.hand.length === 1 && me.opened; // v10.06 (K156, tester videosu): tek taş kalınca BİTİR! seçim istemez — eskiden taşa dokunmadan basılamıyordu
    a.appendChild(btn(finishing ? __L("BİTİR!") : __L("TAŞ AT"), 'primary', function () { discardTile(lastOne ? me.hand[0] : sel[0]); }, lastOne ? false : (sel.length !== 1 || (!isKafa && me.hand.length === 1 && !me.opened)), 'btnDiscard', finishing ? 'finish' : 'discard'));
    if (!row.firstChild) row.remove();
    var hint = null;
    if (isKafa) hint = Okey.partition(me.hand, G.ok, 1) ? __L("Elin bitmeye hazır: artan taşı atarak bitir!") : __L("Bütün taşlar per olunca son taşını atarak bitirirsin.");
    else if (me.opened && me.openedThisTurn) hint = __L("Açıldın! Diğer perlerini ve işlemeyi bir sonraki sıranda yapabilirsin. Şimdi bir taş at.");
    else if (me.opened && me.hand.length === 1 && G.cp === ME && G.phase === 'play') hint = __L("Son taşın kaldı: ortaya (desteye) sürükle ya da BİTİR!'e bas."); // v10.06 (K160)
    else if (me.opened) hint = __L("Uygun taşı masadaki bir perin üstüne sürükleyerek işleyebilirsin.");
    if (hint && assistOn()) { var h = document.createElement('div'); h.className = 'hint'; h.textContent = hint; a.appendChild(h); }
  }

  var claimKey = null, claimTimer = null, claimAnim = null, introOpen = false; // introOpen: çevrim içi el başı penceresi açık (oyun başlarsa kendiliğinden kapanır)
  function renderClaim() {
    var box = $('claimBox');
    var isMine = G.phase === 'claim' && Okey.claimant(G) === ME;
    document.querySelectorAll('.disc.claimable, #mydisc.claimable').forEach(function (e) { e.classList.remove('claimable'); });
    if (!isMine) { box.classList.remove('show'); claimKey = null; clearTimeout(claimTimer); if (claimAnim) { claimAnim.cancel(); claimAnim = null; } return; }
    var key = G.hand + ':' + G.turnNo + ':' + G.lastDiscarder;
    if (CALLOUT) { try { CALLOUT.remove(); } catch (e) {} CALLOUT = null; } // v10.06: taş zaten kutuda büyük görünür; ortadaki çağrı kutuyu örtmesin
    var disc = $(SEAT[G.lastDiscarder].disc); disc.classList.add('claimable');
    // kutuyu atan oyuncunun atma alanının yanına yerleştir
    var sr = { width: 1600, height: 900 }, dl = parseFloat(disc.style.left) || disc.offsetLeft, dt = parseFloat(disc.style.top) || disc.offsetTop;
    var dr = { left: dl, right: dl + disc.offsetWidth, top: dt, bottom: dt + disc.offsetHeight };
    box.className = 'show';
    // kutu, atma alanının boş tarafına: üst köşelerde ortadaki deste/gösterge grubuna çarpmıyorsa yanına, yoksa altına; alt köşelerde içe doğru
    var side = dr.left < 800 ? 'right' : 'left'; // sol üst köşe (Ayşe) → sağına; sağ üst köşe (Ali) → soluna (orta deste grubuna ulaşmaz)
    box.style.left = ''; box.style.right = ''; box.style.top = '';
    if (side === 'below') { box.classList.add('below'); box.style.left = Math.max(6, Math.min(sr.width - box.offsetWidth - 6, dr.left - 10)) + 'px'; box.style.top = (dr.bottom + 10) + 'px'; }
    else if (side === 'right') { box.style.left = (dr.right + 12) + 'px'; box.style.top = Math.max(6, dr.top - 8) + 'px'; box.classList.add('right'); }
    else { box.style.right = (sr.width - dr.left + 12) + 'px'; box.style.top = Math.max(6, dr.top - 8) + 'px'; box.classList.add('left'); }
    $('claimQ').textContent = __L("{0} attı: {1} — alır mısın?", [(G.names[G.lastDiscarder]), (Okey.tileName(G.claimTile))]);
    var ctb = $('claimTile'); if (ctb && (!ctb.firstChild || ctb.firstChild.dataset.id !== String(G.claimTile.id))) { ctb.innerHTML = ''; ctb.appendChild(tileEl(G.claimTile)); } // v10.06 (K146): taşın kendisi kutuda
    if (claimKey === key) return;
    claimKey = key;
    clearTimeout(claimTimer); if (claimAnim) claimAnim.cancel();
    var ms = (settings.claimTime || 8) * 1000;
    if (G.tutorial) { $('claimBar').style.transform = 'scaleX(1)'; emit('claimPrompt'); return; } // eğitimde süre işlemez: oyuncu okuyup karar verir
    $('claimBar').style.transform = '';
    claimAnim = $('claimBar').animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
    claimTimer = setTimeout(function () { if (NET.online) return; if (G && G.phase === 'claim' && Okey.claimant(G) === ME) { toast(__L("Süre doldu, geçildi"), ''); doAction(function () { Okey.actClaim(G, ME, false); }, 'pass', {}); } }, ms);
    emit('claimPrompt');
  }
  $('btnPass').onclick = function () { if (G && G.phase === 'claim' && Okey.claimant(G) === ME) doAction(function () { Okey.actClaim(G, ME, false); }, 'pass', {}); };
  $('btnClaim').onclick = function () { if (G && G.phase === 'claim' && Okey.claimant(G) === ME) doAction(function () { Okey.actClaim(G, ME, true); }, 'claim', {}); };

  document.addEventListener('keydown', function (e) { // Escape: açık pencereyi kapat (kapatma düğmesine basılmış gibi)
    if (e.key !== 'Escape') return; var o = $('overlay'); if (!o || !o.innerHTML) return;
    var b = o.querySelector('#sX, .xfix, #sClose, #helpClose, #qClose, #cClose, #lgClose, #mdClose, #thClose, #zoomClose'); if (b) { e.preventDefault(); b.click(); } // v10.06: sabit ✕ de (aynı kapatıcıya basar)
  });
  function overlay(html, cls) {
    var o = $('overlay'); if (SOC && SOC.dmOpen && !(html && html.indexOf('id="dmList"') >= 0)) { SOC.dmOpen = false; SOC.peer = null; o.style.cssText = ''; o.classList.remove('kb'); } /* v9.93: başka pencere (el sonu vb.) sohbetin yerini alırsa sohbet kapanmış sayılır */
    if (!html) { o.innerHTML = ''; o.className = ''; return; }
    o.className = 'overlay'; o.innerHTML = __L("<div class=\"card fr{0}\"><div class=\"cin\">{1}</div></div>", [(cls ? ' ' + cls : ''), (html)]);
    // v9.78 arayüz bütünlüğü: pencerenin başlığı (baştaki h2 ya da baş satırdaki h2) lobideki gibi kurdeleye taşınır; içerik çerçevenin içinde kayar
    var card = o.firstChild, cin = card.firstChild, c = cin.firstElementChild, h = null;
    if (c && c.tagName === 'H2') h = c; else if (c && c.classList.contains('row')) { for (var j = 0; j < c.children.length; j++) if (c.children[j].tagName === 'H2') { h = c.children[j]; break; } }
    if (h) { var rb = document.createElement('div'); rb.className = 'rbn'; h.classList.add('rt'); h.removeAttribute('style'); rb.appendChild(h); card.insertBefore(rb, cin); card.classList.add('rb'); }
    addCloseX(card, cin); // v10.06 (K150)
  }
  // v10.06 (K150): sabit kapatma ✕ — tester: "kapatmak için içeriğin en altına kaydırmak zorunda kaldım". Pencerenin kendi kapatıcı düğmesi (Kapat / Tamam / Vazgeç / İptal / Anladım ya da bilinen kimlik)
  // varsa kartın sağ üst köşesine içerikle KAYMAYAN bir ✕ eklenir ve aynı düğmeye basar (aynı iş, aynı kurallar). Seçim pencereleri (Devam / Lobiye dön / Sonraki el / onay) ✕ almaz.
  var CLOSE_IDS = ['helpClose', 'qClose', 'cClose', 'cCancel', 'lgClose', 'mdClose', 'thClose', 'zoomClose', 'pfClose', 'socClose', 'alClose', 'iosOk', 'ntOk', 'delNo', 'delDone', 'skCancel', 'kaNo', 'dupCancel', 'nCancel', 'vUpX', 'vShopX', 'vProdX', 'vCancel', 'viSkip'];
  var CLOSE_RX = /^(✕|×|Kapat|Tamam|Vazgeç|İptal|Anladım|Close|OK|Cancel|Got it)$/;
  function findCloseBtn(cin) {
    if (!cin) return null;
    for (var i = 0; i < CLOSE_IDS.length; i++) { var b = cin.querySelector('#' + CLOSE_IDS[i]); if (b) return b; }
    var bs = cin.querySelectorAll('button');
    for (var j = bs.length - 1; j >= 0; j--) { var t = (bs[j].textContent || '').trim(); if (CLOSE_RX.test(t) && !bs[j].closest('.tabs, .seg, .soctabs, #sTry, .tmrow')) return bs[j]; }
    return null;
  }
  function addCloseX(card, cin) {
    if (!cin || cin.querySelector('.sticky .x')) return; // başlığı zaten yapışkan ✕ taşıyan pencere (mağaza)
    var own = cin.querySelector('button.x'); // içerikle kayan bir ✕ varsa (ör. kıraathane mağazası): o gizlenir, sabit olan aynı işi yapar
    if (!findCloseBtn(cin) && !own) return;
    if (own) own.classList.add('xhid');
    var x = document.createElement('button'); x.className = 'xfix'; x.type = 'button'; x.title = __L("Kapat"); x.setAttribute('aria-label', __L("Kapat"));
    x.onclick = function (ev) { ev.stopPropagation(); var b = findCloseBtn(cin) || cin.querySelector('button.x'); if (b && !b.disabled) b.click(); };
    card.appendChild(x); card.classList.add('hasx');
  }

  // ---------- sürükle-bırak ----------
  var drag = null, rackDirty = false;
  var DRAG_PX = 10; // parmağın küçük kayması sürükleme başlatmaz
  // v10.06 (K156): bitiş taşı — açılmış oyuncunun son taşı ya da Kafa elinde kalanları per yapan taş; desteye (ortaya) bırakılınca el biter
  function finishDrop(t) {
    if (!G || G.phase !== 'play' || G.cp !== ME) return false; var me = G.players[ME];
    if (!G.task.req) return !!Okey.partition(me.hand.filter(function (x) { return x.id !== t.id; }), G.ok, 0);
    return me.opened && me.hand.length === 1;
  }
  function nearDeck(cx, cy) { var d = $('deck'), r = d.getBoundingClientRect(); if (!r.width) return false; var p = toStage(cx, cy), c = toStage(r.left + r.width / 2, r.top + r.height / 2); return Math.hypot(p.x - c.x, p.y - c.y) <= (PHONE ? 190 : 140); }
  var missAt = 0;
  function dropMissHint(d) { // hedef dışına bırakılan taş: kısa açıklama (2,5 sn'de bir; rafın üstüne bırakmak düzenlemedir, açıklama yok)
    if (!G || Date.now() - missAt < 2500) return; missAt = Date.now();
    var me = G.players[ME], mine = G.cp === ME && G.phase === 'play';
    if (d.overDeck) { toast(mine ? __L("Ortaya yalnız eli bitiren son taş konur. Taş atmak için sağ alttaki \"Atma yeri\"ne bırak.") : __L("Sıra sende değil: taş ıstakana döndü."), ''); return; }
    if (!mine) { toast(G.cp === ME && G.phase === 'pickup' ? __L("Önce bir taş çek (desteye dokun ya da yandan al).") : __L("Şu an sıra sende değil: taş ıstakana döndü."), ''); return; }
    toast((me.hand.length === 1 && me.opened ? __L("Bitirmek için son taşı \"Atma yeri\"ne ya da ortaya bırak, veya BİTİR!'e bas.") : __L("Taş ıstakana döndü. Atmak için sağ alttaki \"Atma yeri\"ne, işlemek için uygun perin üstüne bırak.")), '');
  }
  // v10.06 (K147): atma yerinin çevresinde geniş bırakma bölgesi — merkeze uzaklık (sahne px): telefonda 150 (≈55 CSS px), masaüstünde 110; yalnız atma sırasında (oyun aşaması, sıra bende)
  function nearDiscard(cx, cy) {
    if (!G || G.phase !== 'play' || G.cp !== ME) return false;
    var md = $('mydisc'), r = md.getBoundingClientRect(); if (!r.width) return false;
    var p = toStage(cx, cy), c = toStage(r.left + r.width / 2, r.top + r.height / 2);
    return Math.hypot(p.x - c.x, p.y - c.y) <= (PHONE ? 150 : 110);
  }
  function cancelDrag() { // v9.79: el değişimi, ekran döndürme, uygulama arka plana: süren sürükleme güvenle iptal (hamle oluşmaz, taş yerinde)
    if (!drag) return; var d = drag; drag = null;
    try { d.el.classList.remove('press', 'lifted'); } catch (e) {}
    if (d.ghost) d.ghost.remove();
    $('mydisc').classList.remove('near');
    if (d.target) d.target.classList.remove('over', 'ins-l', 'ins-r');
    if (d.moving && G) { markTargets(d.t, false); clearPreview(); }
  }
  window.addEventListener('orientationchange', function () { if (drag || PULL) { cancelDrag(); cancelPull(); if (G) render(); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden && (drag || PULL)) { cancelDrag(); cancelPull(); if (G) render(); } });
  function bindTile(el, t) {
    el.addEventListener('pointerdown', function (ev) {
      if (ev.button && ev.button !== 0) return;
      if (PULL) return; // v9.80: taş çekme sürüklenirken ıstaka taşı tutulmaz
      if (drag) { if (Date.now() - drag.at < 6000) return; cancelDrag(); if (G) render(); } // ikinci parmak / ikinci işaretçi yok sayılır; v9.79: bırakması hiç gelmeyen eski basış 6 sn sonra yeni dokunuşa engel olmaz
      drag = { t: t, el: el, pid: ev.pointerId, x0: ev.clientX, y0: ev.clientY, moving: false, ghost: null, target: null, after: false, at: Date.now() };
      el.classList.add('press'); // anında geri bildirim
      try { el.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault(); // aynı dokunuş için ayrıca click üretilmez
    });
  }
  window.addEventListener('pointermove', function (ev) {
    if (!drag || ev.pointerId !== drag.pid) return;
    var dx = ev.clientX - drag.x0, dy = ev.clientY - drag.y0;
    if (!drag.moving) {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      drag.moving = true; drag.el.classList.remove('press');
      if (!drag.el.isConnected) { var liveEl = document.querySelector('#rack .t[data-id="' + drag.t.id + '"]'); if (liveEl) drag.el = liveEl; } // v9.79: savunma — öğe yeniden kurulduysa canlısı
      var r = drag.el.getBoundingClientRect(), c = toStage(r.left + r.width / 2, r.top + r.height / 2), tw = Math.max(r.width, r.height) / SC;
      var g = drag.el.cloneNode(true); g.classList.add('ghost'); g.classList.remove('sel');
      g.style.setProperty('--tw', tw + 'px'); g.style.left = (c.x - tw / 2) + 'px'; g.style.top = (c.y - tw / 2) + 'px';
      $('stage').appendChild(g); drag.ghost = g; drag.el.classList.add('lifted');
      markTargets(drag.t, true); sfx('tap');
    }
    var dd = dToStage(dx, dy);
    drag.ghost.style.transform = __L("translate({0}px,{1}px) scale(1.15) rotate(-3deg)", [(dd.x), (dd.y)]);
    var under = document.elementFromPoint(ev.clientX, ev.clientY);
    var tgt = under && under.closest ? under.closest('[data-drop]') : null;
    if (tgt && tgt.dataset.drop === 'deck') tgt = finishDrop(drag.t) ? tgt : null; // v10.06 (K156): son taşı ortaya (desteye) koymak eli bitirir — klasik okeydeki "ortaya kapatma"
    drag.overDeck = !!(under && under.closest && under.closest('#deck'));
    if (!tgt && under && under.closest && under.closest('#rackWrap')) tgt = nearestSlot(ev.clientX, ev.clientY); // rafın boş kısmı: en yakın hücre
    if (!tgt && finishDrop(drag.t) && nearDeck(ev.clientX, ev.clientY)) tgt = $('deck'); // v10.06 (K160): bitiş taşı ortaya — destenin çevresi geniş hedef
    if (!tgt && nearDiscard(ev.clientX, ev.clientY)) tgt = $('mydisc'); // v10.06 (K147): atma yerine YAKLAŞMAK yeter — geniş, affedici bırakma bölgesi (tester: dar hedef)
    if (tgt !== drag.target) {
      if (drag.target) { drag.target.classList.remove('over', 'ins-l', 'ins-r', 'near'); clearPreview(); }
      drag.target = tgt;
    }
    $('mydisc').classList.toggle('near', tgt === $('mydisc') && G.phase === 'play' && G.cp === ME); // hedef büyür + parlar: "buraya bırak"
    if (tgt && tgt.dataset.drop === 'slot') { // bırakma önizlemesi: boş hücre → vurgulu; dolu hücre → sol/sağ araya girme çizgisi
      var side = slotSide(tgt, ev.clientX, ev.clientY), occ = !!tgt.querySelector('.t:not(.lifted)');
      drag.after = side;
      tgt.classList.toggle('over', !occ); tgt.classList.toggle('ins-l', occ && !side); tgt.classList.toggle('ins-r', occ && side);
    } else if (tgt) { tgt.classList.add('over'); if (tgt.dataset.drop === 'meld') meldPreview(tgt, drag.t); }
  });
  // Sürüklenen taşın perde nereye gireceğini göster: geçerliyse yerleşim sırasındaki konuma yarı saydam taş; okey alıyorsa okey taşı yanıp söner
  function meldPreview(el, t) {
    clearPreview();
    var mi = parseInt(el.dataset.meld), m = G.table[mi], me = G.players[ME];
    var play = G.phase === 'play' && G.cp === ME && me.opened && !me.openedThisTurn;
    if (!play) return;
    if (Okey.canSwapJoker(G, mi, t)) { var jk = el.querySelector('.t.joker'); if (jk) jk.classList.add('swapTarget'); return; }
    if (!Okey.canAddTo(G, mi, [t]) || me.hand.length <= 1) return;
    var lay = Okey.layoutMeld({ tiles: m.tiles.concat([t]), kind: m.kind }, G.ok), idx = lay.indexOf(t);
    if (el.dataset.from) { idx -= parseInt(el.dataset.from); if (idx < 0) return; } // devam parçası: önceki parçaya düşen konum gösterilmez
    var ph = tileEl(t, 'ph'), tilesEls = el.querySelectorAll('.t');
    if (idx >= tilesEls.length) el.appendChild(ph); else el.insertBefore(ph, tilesEls[idx]);
  }
  function clearPreview() { document.querySelectorAll('#melds .t.ph').forEach(function (e) { e.remove(); }); document.querySelectorAll('#melds .t.swapTarget').forEach(function (e) { e.classList.remove('swapTarget'); }); }
  // Raf üzerinde ama hücre dışında bırakma: aynı satırdaki (y'ye göre) en yakın hücre; sütun dışıysa satırın son hücresi
  function nearestSlot(cx, cy) {
    var p = toStage(cx, cy), best = null, bd = 1e9;
    document.querySelectorAll('#rack .slot').forEach(function (sl) {
      var r = sl.getBoundingClientRect(), c = toStage(r.left + r.width / 2, r.top + r.height / 2);
      var w = Math.max(r.width, r.height) / SC, dy = Math.abs(p.y - c.y), dx = Math.abs(p.x - c.x);
      var d = dy * 4 + dx; // satır uyumu öncelikli
      if (dy < w && d < bd) { bd = d; best = sl; }
    });
    return best;
  }
  // işaretçi hücrenin hangi yarısında? (döndürülmüş sahnede de sahne koordinatıyla) true = sağ yarı
  function slotSide(slot, cx, cy) {
    var r = slot.getBoundingClientRect(), c = toStage(r.left + r.width / 2, r.top + r.height / 2), p = toStage(cx, cy);
    return p.x > c.x;
  }
  function endDrag(ev) {
    if (!drag) return;
    if (ev && ev.pointerId !== undefined && ev.pointerId !== drag.pid) return;
    var d = drag; drag = null;
    d.el.classList.remove('press');
    if (!d.moving) { // dokunarak seç / seçimi kaldır — bütün masa yeniden çizilmez
      if (ev && ev.type === 'pointercancel') { if (rackDirty) render(); return; }
      if (!tileById(d.t.id)) { render(); return; } // basılıyken taş elden çıktıysa (el değişimi) seçilmez
      if (OPEN_SEL.active) { if (candsOf(d.t).length) { toggleCand(d.t); return; } exitOpenSel(); toast(__L("Per seçimi kapatıldı; \"Per aç\" ile yeniden seçebilirsin."), ''); render(); } // v9.74: görev perini seçme; aday dışı taşa dokunmak seçimi kapatır ve normal seçime döner
      var cur = tileById(d.t.id), i = -1; for (var si = 0; si < sel.length; si++) if (sel[si].id === d.t.id) i = si; if (i >= 0) sel.splice(i, 1); else sel.push(cur);
      var live = document.querySelector('#rack .t[data-id="' + d.t.id + '"]') || d.el;
      live.classList.toggle('sel', i < 0);
      sfx('tap'); if (rackDirty) render(); else { renderActions(); renderMelds(); } // basılıyken sunucudan durum geldiyse ıstaka şimdi çizilir
      return;
    }
    d.ghost.remove(); d.el.classList.remove('lifted'); markTargets(d.t, false); clearPreview(); $('mydisc').classList.remove('near');
    var tgt = d.target; if (tgt) tgt.classList.remove('over', 'ins-l', 'ins-r');
    if (ev && ev.type === 'pointercancel') { render(); return; } // iptal: taş eski yerinde kalır
    if (!tgt) { render(); dropMissHint(d); return; } // v10.06 (K156): hedef dışı — taş döner ve nedeni yazılır (eskiden sessizce dönüyordu)
    var kind = tgt.dataset.drop;
    if (kind === 'deck') { discardTile(d.t); return; } // bitiş taşı ortaya: BİTİR ile aynı işlem
    if (kind === 'slot') { // ıstaka düzenleme: oyun durumu değişmez (atma/açma/ceza yok)
      var sl = parseInt(tgt.dataset.slot), occ = rack[sl] !== null && rack[sl] !== d.t.id;
      insertInRack(d.t.id, sl, occ && !!d.after); sfx('place'); render(); emit('rack'); return;
    }
    if (kind === 'discard') {
      if (!(G.phase === 'play' && G.cp === ME)) { toast(G.cp === ME && G.phase === 'pickup' ? __L("Önce bir taş çek (desteye dokun ya da yandan al).") : __L("Şu an sıra sende değil."), 'warn'); shake(tgt); render(); return; }
      discardTile(d.t);
      return;
    }
    if (kind === 'meld') {
      var mi = parseInt(tgt.dataset.meld), me = G.players[ME];
      if (!(G.phase === 'play' && G.cp === ME)) { toast(__L("Sıran gelip taş çektikten sonra işleyebilirsin."), 'warn'); shake(tgt); render(); return; }
      if (!me.opened) { toast(__L("Masaya taş işlemek için önce görevini tamamlayıp yere açılmalısın."), 'warn'); shake(tgt); render(); return; }
      if (me.openedThisTurn) { toast(__L("Açıldığın sırada işleme yapılmaz; bir sonraki sıranda işleyebilirsin."), 'warn'); shake(tgt); render(); return; }
      var selNow = sel.filter(function (x) { return x && x.id !== undefined; }); if (selNow.length >= 2 && selNow.some(function (x) { return x.id === d.t.id; }) && Okey.canSwapJokers(G, mi, selNow)) { swapJokers(mi, selNow); return; } // v9.81: seçili taşlarla iki okey birden
      if (Okey.canSwapJoker(G, mi, d.t)) { swapJoker(mi, d.t); return; }
      if (!Okey.canAddTo(G, mi, [d.t]) || me.hand.length <= 1) { toast(addProblem(mi, [d.t]), 'warn'); shake(tgt); render(); return; }
      doAction(function () { Okey.actAdd(G, mi, [d.t]); sel = []; }, 'add', { meld: mi, tiles: [d.t.id] });
      return;
    }
    render();
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  function markTargets(t, on) {
    var me = G.players[ME];
    var play = G.phase === 'play' && G.cp === ME;
    $('mydisc').classList.toggle('ok', on && play);
    $('deck').classList.toggle('fin', !!(on && finishDrop(t))); // v10.06 (K156): bitiş taşı sürüklenirken orta "BİTİR" hedefi
    document.querySelectorAll('#melds .meld').forEach(function (m) {
      var mi = parseInt(m.dataset.meld);
      m.classList.toggle('ok', on && play && me.opened && !me.openedThisTurn && ((Okey.canAddTo(G, mi, [t]) && me.hand.length > 1) || Okey.canSwapJoker(G, mi, t)));
    });
  }
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

  // ---------- v9.80 (madde 1–2): atılan taşı ve kapalı desteden taşı ıstakaya sürükleyerek çekme ----------
  // Tutmak hamle değildir: taş ıstakaya bırakılınca istek gider; sunucu (bot masasında motor) onaylayınca taş bırakılan hücreye yerleşir.
  // Desteden çekerken sürüklenen taş KAPALI yüzüyle gider (yüzü onaydan sonra açılır). Geçersiz yere bırakma / iptal: taş geri döner.
  // Bekleyen istek varken ikinci çekme başlamaz (çift dokunma + sürükleme iki taş çekmez). Ret gelirse görüntü ve durum birlikte eski hâline döner.
  var PULL = null, PULL_DEST = null, deckClickBlockUntil = 0;
  function pullAllowed(kind) {
    if (!G || G.finished || G.phase === 'handover' || drag || NET.pending || prepActive() || introPlaying || $('overlay').innerHTML) return false;
    if (kind === 'draw') return G.phase === 'pickup' && G.cp === ME && G.deck.length > 0;
    if (kind === 'take') return G.phase === 'pickup' && G.cp === ME && !!Okey.topDiscard(G);
    if (kind === 'claim') return G.phase === 'claim' && Okey.claimant(G) === ME && !!G.claimTile;
    return false;
  }
  function pullKindOfDisc(p) { // hangi atma köşesindeki taş benim alabileceğim taş? (yalnız son atanın en üst taşı)
    if (!G || p === ME || G.lastDiscarder !== p) return null;
    if (pullAllowed('take')) return 'take';
    if (pullAllowed('claim')) return 'claim';
    return null;
  }
  function startPull(ev, src, kind, tile) {
    if (ev.button && ev.button !== 0) return;
    if (PULL || drag || !pullAllowed(kind)) return;
    PULL = { kind: kind, src: src, tile: tile || null, pid: ev.pointerId, x0: ev.clientX, y0: ev.clientY, moving: false, ghost: null, slot: null, after: false, over: false, at: Date.now() };
    if (kind !== 'draw') { src.classList.add('press'); ev.preventDefault(); } // destede dokunma = mevcut "dokun-çek" (click) korunur
  }
  function pullGhostEl() {
    var g = PULL.kind === 'draw' ? backEl() : tileEl(PULL.tile);
    var rt = document.querySelector('#rack .t'), tw = rt ? Math.max(rt.getBoundingClientRect().width, rt.getBoundingClientRect().height) / SC : 72;
    g.classList.add('ghost', 'pullg'); g.style.setProperty('--tw', tw + 'px');
    var r = PULL.src.getBoundingClientRect(), c = toStage(r.left + r.width / 2, r.top + r.height / 2);
    g.style.left = (c.x - tw / 2) + 'px'; g.style.top = (c.y - tw / 2) + 'px'; g.dataset.cx = c.x; g.dataset.cy = c.y;
    $('stage').appendChild(g); return g;
  }
  function pullClearMarks() { $('rackWrap').classList.remove('pullTarget', 'pullOver'); document.querySelectorAll('#rack .slot.over, #rack .slot.ins-l, #rack .slot.ins-r').forEach(function (e) { e.classList.remove('over', 'ins-l', 'ins-r'); }); }
  window.addEventListener('pointermove', function (ev) {
    if (!PULL || ev.pointerId !== PULL.pid) return;
    var dx = ev.clientX - PULL.x0, dy = ev.clientY - PULL.y0;
    if (!PULL.moving) {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      if (!pullAllowed(PULL.kind)) { cancelPull(); return; } // bu arada sıra/aşama değiştiyse başlamaz
      PULL.moving = true; PULL.src.classList.remove('press');
      if (PULL.kind !== 'draw') PULL.src.classList.add('pullsrc');
      PULL.ghost = pullGhostEl(); $('rackWrap').classList.add('pullTarget'); sfx('tap');
    }
    var p = toStage(ev.clientX, ev.clientY), g = PULL.ghost;
    g.style.transform = __L("translate({0}px,{1}px) scale(1.12) rotate(-3deg)", [(p.x - parseFloat(g.dataset.cx)), (p.y - parseFloat(g.dataset.cy))]);
    var under = document.elementFromPoint(ev.clientX, ev.clientY), over = !!(under && under.closest && under.closest('#rackWrap'));
    document.querySelectorAll('#rack .slot.over, #rack .slot.ins-l, #rack .slot.ins-r').forEach(function (e) { e.classList.remove('over', 'ins-l', 'ins-r'); });
    PULL.over = over; $('rackWrap').classList.toggle('pullOver', over); PULL.slot = null;
    if (over) {
      var sl = (under.closest('#rack .slot')) || nearestSlot(ev.clientX, ev.clientY);
      if (sl) { var side = slotSide(sl, ev.clientX, ev.clientY), occ = !!sl.querySelector('.t'); PULL.slot = parseInt(sl.dataset.slot); PULL.after = side; sl.classList.toggle('over', !occ); sl.classList.toggle('ins-l', occ && !side); sl.classList.toggle('ins-r', occ && side); }
    }
  });
  function endPull(ev) {
    if (!PULL || (ev && ev.pointerId !== undefined && ev.pointerId !== PULL.pid)) return;
    var P = PULL; PULL = null;
    P.src.classList.remove('press');
    if (!P.moving) { if (P.kind !== 'draw') P.src.classList.remove('pullsrc'); return; } // dokunma: deste için click "çek"i çalışır; atılan taş için bir şey yapmaz (Yandan al / Al düğmeleri)
    if (P.kind === 'draw') deckClickBlockUntil = Date.now() + 600; // sürüklemenin sonundaki olası click ikinci çekme yapmasın
    pullClearMarks();
    if (!P.over || (ev && ev.type === 'pointercancel') || !pullAllowed(P.kind)) { pullReturn(P); if (P.over && !pullAllowed(P.kind)) toast(__L("Şu an çekemezsin: sıra ya da aşama değişti."), 'warn'); return; }
    // geçerli bırakma: hedef hücre kaydedilir; onay gelince yeni taş oraya konur
    var hand0 = {}; G.players[ME].hand.forEach(function (t) { hand0[t.id] = true; });
    var gr = P.ghost.getBoundingClientRect();
    PULL_DEST = { kind: P.kind, slot: P.slot, after: P.after, tileId: P.tile ? P.tile.id : null, hand0: hand0, ghost: P.ghost, src: P.src, rect: { left: gr.left, top: gr.top, width: gr.width, height: gr.height }, at: Date.now() };
    P.ghost.classList.add('pending');
    if (P.kind === 'draw') doAction(function () { Okey.actDraw(G); }, 'draw', {});
    else if (P.kind === 'take') doAction(function () { Okey.actTake(G); }, 'take', {});
    else doAction(function () { Okey.actClaim(G, ME, true); }, 'claim', {});
    if (!NET.online) pullDone(); // bot masası: motor anında uyguladı (render içinde yerleşti)
    else if (PULL_DEST) { var pd = PULL_DEST; pd.tmo = setTimeout(function () { if (PULL_DEST === pd) { NET.pending = null; pullFail(); toast(__L("Sunucudan cevap gelmedi; taş yerine döndü."), 'warn'); } }, 7000); } // cevap gelmezse güvenle geri al
  }
  function pullReturn(P) { // taş geldiği yere döner
    var g = P.ghost; if (!g) return;
    var r = (P.kind === 'draw' ? $('deck') : (P.src.isConnected ? P.src : ($(SEAT[G.lastDiscarder] ? SEAT[G.lastDiscarder].disc : 'deck')))).getBoundingClientRect(), c = toStage(r.left + r.width / 2, r.top + r.height / 2);
    g.style.transition = __L("transform .22s ease-in"); g.style.transform = __L("translate({0}px,{1}px) scale(.9)", [(c.x - parseFloat(g.dataset.cx)), (c.y - parseFloat(g.dataset.cy))]);
    setTimeout(function () { g.remove(); if (P.src) P.src.classList.remove('pullsrc'); if (G) render(); }, 230);
  }
  function pullDone() { // onaylandı ya da durum değişti: hayalet kalkar (taş ıstakada yerinde)
    if (!PULL_DEST) return; var d = PULL_DEST; PULL_DEST = null; clearTimeout(d.tmo);
    if (d.ghost) d.ghost.remove(); if (d.src) d.src.classList.remove('pullsrc');
  }
  function pullFail() { // sunucu reddetti / cevap yok: hayalet geri döner, durum sunucudaki gibi çizilir
    if (!PULL_DEST) return; var d = PULL_DEST; PULL_DEST = null; clearTimeout(d.tmo);
    pullReturn({ kind: d.kind, ghost: d.ghost, src: d.src });
  }
  function pullPlace(missing) { // syncRack'ten: onaydan sonra yeni gelen taşlardan çekileni bırakılan hücreye koy; kalan yeni taşları döndür
    if (!PULL_DEST || PULL_DEST.slot === null || PULL_DEST.slot === undefined) return missing;
    var fresh = missing.filter(function (t) { return !PULL_DEST.hand0[t.id]; }); if (!fresh.length) return missing;
    var pick = PULL_DEST.tileId != null ? fresh.filter(function (t) { return t.id === PULL_DEST.tileId; })[0] : (PULL_DEST.kind === 'draw' ? fresh[0] : null);
    if (!pick) return missing;
    var sl = Math.min(PULL_DEST.slot, rack.length - 1), occ = rack[sl] !== null && rack[sl] !== pick.id;
    insertInRack(pick.id, sl, occ && !!PULL_DEST.after); newTiles[pick.id] = Date.now(); PULL_DEST.slot = null; // bir kez
    return missing.filter(function (t) { return t !== pick; });
  }
  function cancelPull() {
    if (!PULL) return; var P = PULL; PULL = null; P.src.classList.remove('press', 'pullsrc'); pullClearMarks(); if (P.ghost) P.ghost.remove();
  }
  window.addEventListener('pointerup', endPull);
  window.addEventListener('pointercancel', endPull);
  $('deck').addEventListener('pointerdown', function (ev) { startPull(ev, $('deck'), 'draw', null); });

  function swapJoker(mi, t) {
    var res = null;
    doAction(function () { res = Okey.actSwapJoker(G, mi, t); sel = []; }, 'swap', { meld: mi, tile: t.id });
    if (res) toast(res.message, '');
  }
  // ---------- v9.82 (kullanıcı kararı 3, 9 Ekim 20:31): "PERLERİ İNDİR"de iki türlü okunabilen per (iki okey + tek taş) için oyuncuya "Seri mi, renkli mi?" sorulur ----------
  function ambiguousSeg(s) { var ok = G.ok; return s.tiles.length === 3 && s.tiles.filter(function (t) { return Okey.isJoker(t, ok); }).length === 2 && Okey.meldKind(s.tiles, ok) === 'any'; }
  function ambiguousRun(tiles) { // ıstaka sırasıyla seri okunuşu (motordaki kuralla aynı: önce soldan sağa artan, olmazsa azalan)
    var ok = G.ok, ri = -1; for (var i = 0; i < tiles.length; i++) if (!Okey.isJoker(tiles[i], ok)) { ri = i; break; }
    if (ri < 0) return null; var e = Okey.effective(tiles[ri], ok);
    function dir(d) { var out = []; for (var k = 0; k < tiles.length; k++) { var n = e.n + d * (k - ri); if (n < 1 || n > 13) return null; out.push(n); } return out; }
    var nums = dir(1) || dir(-1); return nums ? { c: e.c, n: e.n, nums: nums, jokerNums: nums.filter(function (n, k) { return Okey.isJoker(tiles[k], ok); }) } : null;
  }
  function askMeldKind(seg, cb) {
    var ok = G.ok, real = seg.tiles.filter(function (t) { return !Okey.isJoker(t, ok); })[0], e = Okey.effective(real, ok), fam = Okey.COLORS[e.c], run = ambiguousRun(seg.tiles);
    var runTxt = run ? fam + ' ' + run.nums.slice().sort(function (a, b) { return a - b; }).join('-') : '';
    overlay(__L("<h2>Bu per nasıl sayılsın?</h2><div class=\"kindask\"><div class=\"tiles\" id=\"kaTiles\"></div><p>İki okey ve tek taş hem seri hem renkli olabilir. Seçimin bu el boyunca değişmez.</p>{0}<p class=\"muted\">Renkli: okeyler başka renklerdeki {1}'lerin yerinde durur; bu perdeki iki okey alınamaz.</p></div><div class=\"row\">{2}<button class=\"good\" id=\"kaSet\">Renkli: {3}-{4}-{5}</button><button class=\"soft\" id=\"kaNo\">Vazgeç</button></div>", [(run ? __L("<p class=\"muted\">Seri: okeyler {0} yerinde durur; başka oyuncu bu gerçek taşlarla okeyleri alabilir.</p>", [(run.jokerNums.map(function (n) { return fam + ' ' + n; }).join(__L(" ve ")))]) : ''), (e.n), (run ? __L("<button class=\"good\" id=\"kaRun\">Seri: {0}</button>", [(runTxt)]) : ''), (e.n), (e.n), (e.n)]));
    seg.tiles.forEach(function (t) { $('kaTiles').appendChild(tileEl(t)); });
    if ($('kaRun')) $('kaRun').onclick = function () { overlay(null); cb('run'); };
    $('kaSet').onclick = function () { overlay(null); cb('set'); };
    $('kaNo').onclick = function () { overlay(null); render(); };
  }
  function layPicked(pick, amb, kind) { // seçilen perleri indir (çevrim içinde sunucuya; belirsiz perin türü "kinds" ile)
    var me = G.players[ME], groups = pick.map(function (s) { return s.tiles.map(function (t) { return t.id; }); }), kinds = pick.map(function (s) { return s === amb ? kind : null; });
    doAction(function () {
      var laid = 0;
      pick.forEach(function (s, i) { if (me.hand.length - s.tiles.length >= 1) { Okey.actLay(G, s.tiles.slice(), kinds[i]); laid++; } });
      if (!laid) throw new Error(__L("İndirilecek per yok: elinde en az bir taş kalmalı."));
      sel = [];
    }, 'lay', amb ? { groups: groups, kinds: kinds } : { groups: groups });
  }
  function swapJokers(mi, tiles) { // v9.81: birden çok okeyi tek işlemde al (sunucu hepsini birlikte doğrular; ya hepsi ya hiçbiri)
    var res = null, ids = tiles.map(function (t) { return t.id; });
    doAction(function () { res = Okey.actSwapJokers(G, mi, tiles.slice()); sel = []; }, 'swap', { meld: mi, tiles: ids });
    if (res) toast(res.message, '');
  }
  function discardTile(t) {
    var me = G.players[ME];
    if (!G.task.req || me.opened || me.hand.length > 1) {
      var res = null;
      doAction(function () { res = Okey.actDiscard(G, t); sel = []; }, 'discard', { tile: t.id });
      if (res && res.playablePenalty) toast(__L("İşlek taş attın: +{0} ceza puanı (el sonunda puanına eklenir)", [(res.playablePenalty)]), 'warn');
    }
    else toast(__L("Açılmadan son taşı atamazsın."), 'warn');
  }

  // ---------- Rakibin eline bak / Tokat (skin yeteneği) ----------
  // Sahip olunan her Masa Giriş Skini el başına 1 "Çaktırmadan Bak" hakkı verir (en çok 5). Haklar her elde dağıtımdan sonra yenilenir, birikmez.
  // Yetenek yalnızca el başındaki hazırlık aşamasında kullanılır; çevrim içinde sayaç, hedef ve süreler sunucuda tutulur.
  var PEEK = { charges: 0, prepUntil: 0, tick: null, active: null, endTimer: null, botSlap: null, incoming: null, pending: false, pendTimer: null, tut: false, trial: 0, inTimer: null }; // tut/trial: eğitim denemesi (gerçek hakları kullanmaz)
  var PEEK_MS = 8000, PREP_MS = 15000;
  // Hamle süresi (AFK, çevrim içi): sunucu her taş alma / taş atma için 30 sn verir (v9.73; önce 45); geri sayım baştan sona rozette, son 10 sn kırmızı; sıran gelince ses + titreşim. Süre dolarsa sunucu o oyuncunun yerine oynar (bot hamlesi sayılır).
  var TURN = { until: 0, actor: null, tick: null, ms: 30000, lastMine: false };
  function setTurn(actor, left) { TURN.actor = actor; TURN.until = left > 0 ? Date.now() + left : 0; clearInterval(TURN.tick); if (TURN.until) { TURN.tick = setInterval(turnTick, 250); turnTick(); } else turnTick(); }
  function turnTick() {
    var tb = $('turnBadge'), tt = $('turnText'); if (!tb || !G) return;
    var left = TURN.until ? Math.max(0, Math.ceil((TURN.until - Date.now()) / 1000)) : 0;
    if (!TURN.until || !NET.online || G.phase === 'claim' || G.phase === 'handover') { clearInterval(TURN.tick); tb.textContent = __L("Sıra sende"); tb.classList.remove('urgent'); return; }
    if (TURN.actor === ME) { tb.textContent = __L("Sıra sende · {0}", [(left)]); tb.classList.toggle('urgent', left <= 10); if (!TURN.lastMine) { TURN.lastMine = true; sfx('turn'); try { if (navigator.vibrate) navigator.vibrate(90); } catch (e) {} } } // v9.73: geri sayım baştan sona; sıran gelince kısa ses + titreşim
    else { TURN.lastMine = false; tb.textContent = __L("Sıra sende"); tb.classList.remove('urgent'); if (G.cp === TURN.actor && G.names && G.names[TURN.actor]) tt.textContent = __L("{0} oynuyor · {1}", [(G.names[TURN.actor]), (left)]); }
    if (left <= 0) clearInterval(TURN.tick);
  }
  // Oyun kendi sunucusundan mı açıldı? (claude.ai / dosya değil)
  function selfHosted() { if (NATIVE) return true; return /^https?:$/.test(location.protocol) && !/(claude\.ai|claudeusercontent\.com|anthropic\.com)$/.test(location.hostname); } // claude.ai prototipi (artifact iframe'i claudeusercontent.com) sunucu değildir
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); } // iPhone/iPad Safari tam ekran API'sini desteklemez; tam ekran yalnız "Ana ekrana ekle" ile (v9.73)
  function showIosGuide() {
    overlay(__L("<h2>iPhone'da tam ekran</h2><p class=\"note\">Safari tam ekran düğmesini desteklemez. Oyunu ana ekrana eklersen tam ekran ve yatay açılır:</p><ol class=\"iosguide\"><li>Safari'de alttaki <b>Paylaş</b> simgesine (kare + yukarı ok) dokun.</li><li>Listede <b>\"Ana Ekrana Ekle\"</b>yi seç.</li><li>Sağ üstte <b>Ekle</b>'ye dokun. Ana ekrandaki <b>Döngü</b> simgesinden aç.</li></ol><p class=\"note\">Chrome kullanıyorsan: ⋯ menüsü → \"Ana Ekrana Ekle\". Oyun tarayıcıda da çalışır; yalnız üst/alt çubuklar yer kaplar.</p><div class=\"row\"><button class=\"primary\" id=\"iosOk\">Tamam</button></div>"));
    $('iosOk').onclick = function () { overlay(null); showHelp('settings'); };
  }
  function iosWeb() { return isIOS() && navigator.standalone !== true; } // iOS'ta tarayıcıda (ana ekrana eklenmemiş): Safari'de requestFullscreen yok; navigator.standalone iOS'a özgü
  function iosHintOnce() { if (!iosWeb() || settings.iosHinted) return; settings.iosHinted = true; saveSettings(); setTimeout(function () { toast(__L("iPhone'da tam ekran için: Paylaş → \"Ana Ekrana Ekle\" (Ayarlar → Tam ekran'da anlatım)."), '', 6000); }, 6500); } // hoş geldin bildirimi (4,5 sn) bitince
  function isStandalone() { return (window.matchMedia && matchMedia(__L("(display-mode: standalone), (display-mode: fullscreen)")).matches) || navigator.standalone === true; }
  function goFullscreen() { var el = document.documentElement; var f = el.requestFullscreen || el.webkitRequestFullscreen; if (!f) return false; try { var p = f.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(function () {}); return true; } catch (e) { return false; } }
  // ---------- Masa Giriş Skinleri: istendiği an bütün masaya oynayan karakter gösterisi (v10.06 K159) ----------
  // Gösterim maç kimliği ile izlenir (ao.introShown): sonraki eller, yeniden bağlanma ve sayfa yenileme yeni gösterim hakkı vermez.
  var INTRO_DIR = { 0: { x: 1, y: -0.55 }, 1: { x: -1, y: 0 }, 2: { x: 0, y: 1 }, 3: { x: 1, y: 0 } }; // koltuk → masaya doğru yön (ben: portreden sağ yukarı, ıstakaya doğru)
  var introPlaying = false;
  function seatIntro(p) { // koltuktaki oyuncunun aktif skini (sahiplik: kendim için dolap; rakipler için avatar kaydı — sunucu doğrular)
    if (p === ME) {
      if (NET.online) { var me0 = seatAvatar(ME); if (me0 && !me0.bot && me0.intro && INTRO_SKINS[me0.intro]) return me0.intro; } // v9.82: çevrim içinde sunucunun herkese oynattığı skin (ücretsiz deneme maç başında düştüğü için yerel kayıt boşalmış olabilir; eskiden oyuncu kendi deneme gösterisini göremiyordu)
      var a = normAvatar(myAvatar || DEFAULT_AV), it = catItem('intro', a.intro); if (it && owns(it.id)) return a.intro; return null;
    }
    var sa = seatAvatar(p); return (sa && !sa.bot && sa.intro && INTRO_SKINS[sa.intro]) ? sa.intro : null;
  }
  function introAutoClose() { // v9.82: el başladı (hazırlık bitti ya da ilk hamle geldi): açık el başı penceresi kapanır; "Masaya geç"e basmayan oyuncu da maç başı gösterilerini görür (eskiden hiç görmüyordu; süre dolunca pencere ilk hamleye kadar açık kalıyordu)
    if (!introOpen) return; introOpen = false; overlay(null); render();
    if (!prepActive()) toast(__L("El başladı; görev ve kuralları üstteki Görev düğmesinden yeniden okuyabilirsin."), '');
    playIntros(null, true); flushIntroQ();
  }
  function playIntros(cb) { if (cb) cb(); } // v10.06 (K159): Masa Giriş Skinleri maç başında kendiliğinden OYNAMAZ — oyuncu Skinler panelinden istediği an kullanır (useIntroSkin)
  // v10.06 (K162): el başı penceresi ("El N / M · Masaya geç") açıkken gelen gösteri pencerenin arkasında kaybolmasın — pencere kapanınca oynar (aynı el; koltuk başına en son gösteri)
  var INTRO_Q = [];
  function flushIntroQ() { var q = INTRO_Q, seen = {}; INTRO_Q = []; if (!G) return; for (var i = q.length - 1; i >= 0; i--) { var x = q[i]; if (x.key !== G.matchId + ':' + G.hand || seen[x.from]) continue; seen[x.from] = 1; playIntroAt(x.from, x.skin); } }
  // v10.06 (K159): istendiği an kullanım. Sahip olunan skin her el 1 kez; sahip olunmayanın ücretsiz denemesi kullanıldığı an düşer. Çevrim içinde sunucu doğrular ve herkese 'introFx' yayınlar.
  var INTRO_USE = { key: '', used: {}, at: 0 };
  function introUsed() { var k = G ? (G.matchId + ':' + G.hand) : ''; if (INTRO_USE.key !== k) INTRO_USE = { key: k, used: {}, at: 0 }; return INTRO_USE.used; }
  function introUseState(id) {
    var st = introState(id), nm = INTRO_SKINS[id].name;
    if (!G || G.finished) return { ok: false, st: st, why: __L("Masa Giriş Skini masada, maç sırasında kullanılır.") };
    if (G.tutorial) return { ok: false, st: st, why: __L("Eğitimde ▶ İzle ile önizle; gerçek masada istediğin an \"Kullan\" de.") };
    if (Date.now() - INTRO_USE.at < 2400) return { ok: false, st: st, why: __L("Gösterin sürüyor; bitince yeniden dene.") };
    if (st.has) return introUsed()[id] ? { ok: false, st: st, used: true, why: __L("Bu elde {0} kullandın; sonraki elde yine kullanabilirsin.", [(nm)]) } : { ok: true, st: st, owned: true };
    if (st.free > 0) return { ok: true, st: st, trial: true };
    return { ok: false, st: st, why: __L("{0} sende yok: Mağaza → Masa Girişi ({1} altın).", [(nm), ((st.price || 0).toLocaleString(window.__LOC || 'tr-TR'))]) };
  }
  function playIntroAt(p, id) { // gösteri: koltuğun karakterinde (kendin: portre), skin sesi + karakter motifi
    if (!G || !INTRO_SKINS[id]) return 0;
    var ms = playIntroOn(p === ME ? $('meAv') : $(SEAT[p].ch), id, INTRO_DIR[p]);
    var sa = seatAvatar(p) || (p === ME ? normAvatar(myAvatar || DEFAULT_AV) : null), full = sa && !sa.bot && sa.full && CHAR_SFX[sa.full];
    setTimeout(function () { sfxOnce(SKIN_SFX[id] || 'tap', 'intro:' + p, 800); }, 150); if (full && ms) setTimeout(function () { sfxOnce(CHAR_SFX[sa.full], 'char:' + p, 800); }, Math.min(ms, 1400));
    actionTag(id, p, null);
    return ms;
  }
  function useIntroSkin(id) {
    var u = introUseState(id); if (!u.ok) { toast(u.why, ''); return; }
    INTRO_USE.at = Date.now();
    if (NET.online) { NET.send({ t: 'introUse', skin: id }); closeSkinMenu(); return; } // sunucu doğrular → 'introFx' herkese (kendin dahil)
    introUsed()[id] = 1; closeSkinMenu(); playIntroAt(ME, id); emit('intro:' + id);
    if (u.trial) { useFreeSkin(id); setTimeout(function () { toast(__L("{0} ücretsiz denemesi kullanıldı (1/1). Beğendiysen: Mağaza → Masa Girişi.", [(INTRO_SKINS[id].name)]), ''); }, 1600); }
  }
  // Tek gösteri: anchor (karakter kabı), skin kimliği, yön. Web Animations ile; temsili taşlar sonunda temizlenir. Süreyi (ms) döndürür.
  function playIntroOn(anchor, skin, dir) {
    if (!anchor || !INTRO_SKINS[skin]) return 0;
    var av = anchor.querySelector('.avw') || anchor.querySelector('.av'), fx = document.createElement('div'); fx.className = 'ifx'; // hareket sarmalayıcı: portrenin yakınlaştırma dönüşümü ve aynalama korunur
    if (anchor.id === 'meAv') { fx.style.inset = 'auto'; fx.style.left = anchor.offsetLeft + 'px'; fx.style.top = anchor.offsetTop + 'px'; fx.style.width = anchor.offsetWidth + 'px'; fx.style.height = anchor.offsetHeight + 'px'; $('stage').appendChild(fx); } // portre kabı taşmayı kırpar: efektler sahneye
    else anchor.appendChild(fx);
    var W = anchor.offsetWidth || 200, H = anchor.offsetHeight || 200, isPortrait = anchor.id === 'meAv' || anchor.classList.contains('introPv');
    var hx = isPortrait ? W * 0.82 : W / 2, hy = isPortrait ? H * 0.3 : H * 0.72; // "el" konumu (portrede sağ üst: Diz düğmesini kapatmaz)
    var rgI = window.Rig ? Rig.instances().filter(function (i) { return anchor.contains(i.host); })[0] : null, rgClip = rgI && Rig.CLIPS['intro_' + skin]; // v9.99 (K130): rig'li karakterde kol/bilek/baş klibi; DOM taş/iz efektleri gerçek el noktasından
    if (rgI && rgClip) { var hp = Rig.point(rgI, rgI.view === 'yan' ? 'el-sol' : 'el-sag', 'tutma'); if (hp) { hx = hp[0] + (isPortrait ? 6 : 0); hy = hp[1] + (isPortrait ? 6 : 0); } Rig.play(rgI, rgClip); }
    var D = Math.round(Math.min(W, H) * 0.3), dx = dir.x * D, dy = dir.y * D, ms = INTRO_SKINS[skin].ms, reduce = reduceMotion;
    function at(x, y, el) { el.style.left = x + 'px'; el.style.top = y + 'px'; fx.appendChild(el); return el; }
    function tile(front) { var e = front ? tileEl({ c: 2, n: 7, fake: false, id: -1 }) : backEl(); e.classList.add('ifxt'); e.style.setProperty('--tw', Math.round(Math.max(28, Math.min(W, H) * 0.19)) + 'px'); return e; }
    function anim(el, kf, o) { try { return el.animate(kf, o); } catch (e) { return null; } }
    function avAnim(kf, o) { if (av && !reduce && !(rgI && rgClip)) anim(av, kf, o); } // rig'li karakterde bütün resim eğilmez; klip oynar
    function snd(k, t) { setTimeout(function () { sfx(k); }, t); }
    var tw = Math.round(Math.max(28, Math.min(W, H) * 0.19));
    if (skin === 'tersten_el') {
      var t1 = at(hx - tw / 2, hy - tw / 2, tile(false));
      anim(t1, [{ transform: __L("scale(.5) rotateY(0deg)"), opacity: 0 }, { transform: __L("scale(1) rotateY(0deg)"), opacity: 1, offset: .15 }, { transform: __L("translate({0}px,{1}px) rotateY(90deg)", [(dx * .5), (dy * .5)]), offset: .45 }, { transform: __L("translate({0}px,{1}px) rotateY(180deg) scale(1)", [(dx), (dy)]), offset: .62 }, { transform: __L("translate({0}px,{1}px) rotateY(180deg) scale(.96)", [(dx), (dy)]), opacity: 1, offset: .85 }, { transform: __L("translate({0}px,{1}px) rotateY(180deg) scale(.9)", [(dx), (dy)]), opacity: 0 }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
      setTimeout(function () { t1.classList.remove('back'); t1.classList.add('c2', 'flipped'); t1.innerHTML = '<b class="n">7</b><i class="ic"></i>'; }, ms * .45); // bilek dönünce yüzü görünür
      var trail = at(hx - tw / 2, hy - tw / 2, document.createElement('i')); trail.className = 'itrail'; trail.style.width = tw + 'px'; trail.style.height = tw + 'px';
      anim(trail, [{ transform: __L("translate(0,0) scale(1)"), opacity: 0 }, { opacity: .5, offset: .4 }, { transform: __L("translate({0}px,{1}px) scale(1.3)", [(dx), (dy)]), opacity: 0, offset: .7 }, { opacity: 0 }], { duration: ms, fill: 'forwards' });
      snd('place', ms * .62);
      setTimeout(function () { avAnim([{ transform: 'rotate(0deg)' }, { transform: __L("rotate({0}deg) translateY(2px)", [(dir.x ? -3 * dir.x : 3)]) }, { transform: 'rotate(0deg)' }], { duration: 360, easing: 'ease-in-out' }); }, ms * .7); // rakiplere baş hareketi
    } else if (skin === 'ince_ayar') {
      avAnim([{ transform: __L("translate(0,0) scale(1)") }, { transform: __L("translate({0}px,{1}px) scale(1.03)", [(dx * .35), (dy * .35)]), offset: .25 }, { transform: __L("translate({0}px,{1}px) scale(1.03)", [(dx * .35), (dy * .35)]), offset: .8 }, { transform: __L("translate(0,0) scale(1)") }], { duration: ms, easing: 'ease-in-out' });
      var row = at(hx - tw * 1.6, hy - tw / 2 + dy * .6 + (dir.x ? 0 : 0), document.createElement('div')); row.className = 'irow'; row.style.transform = 'translate(' + dx * .9 + 'px,' + dy * .9 + 'px)';
      for (var k = 0; k < 3; k++) { var mt = tile(false); mt.style.setProperty('--tw', Math.round(tw * .8) + 'px'); mt.style.position = 'relative'; row.appendChild(mt); }
      anim(row, [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .9 }, { opacity: 0 }], { duration: ms, fill: 'forwards' });
      var taps = [ms * .3, ms * .55];
      taps.forEach(function (t, i) { setTimeout(function () { var mark = document.createElement('i'); mark.className = 'itap'; mark.style.left = (i ? '78%' : '12%'); row.appendChild(mark); anim(mark, [{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(1.3)', opacity: 0 }], { duration: 320, fill: 'forwards' }); var mt2 = row.querySelectorAll('.t')[i ? 2 : 0]; if (mt2) anim(mt2, [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }], { duration: 200 }); sfx('tap'); }, t); });
      setTimeout(function () { var sweep = document.createElement('i'); sweep.className = 'isweep'; row.appendChild(sweep); anim(sweep, [{ transform: 'translateX(-30%)', opacity: 0 }, { opacity: 1, offset: .4 }, { transform: 'translateX(130%)', opacity: 0 }], { duration: 380, fill: 'forwards' }); sfx('click'); avAnim([{ transform: 'rotate(0deg)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(0deg)' }], { duration: 300 }); }, ms * .76);
    } else if (skin === 'gosterissiz_numara') {
      var t3 = at(hx - tw / 2, hy - tw / 2, tile(true));
      anim(t3, [{ transform: __L("translate(0,0) rotate(-6deg)"), opacity: 0 }, { opacity: 1, offset: .1 }, { transform: __L("translate({0}px,{1}px) rotate(0deg)", [(dx), (dy)]), offset: .35 }, { transform: __L("translate({0}px,{1}px) rotate(0deg)", [(dx), (dy)]), opacity: 1, offset: .85 }, { transform: 'translate(' + dx + 'px,' + dy + 'px)', opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' });
      snd('place', ms * .33);
      setTimeout(function () { var ring = at(hx - tw * .6, hy - tw * .6, document.createElement('i')); ring.className = 'iring'; ring.style.width = ring.style.height = Math.round(tw * 1.2) + 'px'; anim(ring, [{ transform: __L("scale(.3) rotate(0deg)"), opacity: 0 }, { transform: __L("scale(1) rotate(60deg)"), opacity: 1, offset: .35 }, { transform: __L("scale(1.5) rotate(180deg)"), opacity: 0 }], { duration: 480, easing: 'ease-out', fill: 'forwards' }); sfx('snap'); avAnim([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], { duration: 320 }); }, ms * .45);
    } else if (skin === 'ortayi_kokla') {
      avAnim([{ transform: __L("translate(0,0) rotate(0deg)") }, { transform: __L("translate({0}px,{1}px) rotate(0deg)", [(dx * .5), (dy * .5)]), offset: .28 }, { transform: __L("translate({0}px,{1}px) rotate(0deg)", [(dx * .5), (dy * .5)]), offset: .4 }, { transform: __L("translate({0}px,{1}px) rotate({2}deg)", [(dx * .5), (dy * .5), (dir.x ? 7 * dir.x : 7)]), offset: .55 }, { transform: __L("translate({0}px,{1}px) rotate({2}deg)", [(dx * .5), (dy * .5), (dir.x ? 7 * dir.x : 7)]), offset: .72 }, { transform: __L("translate(0,0) rotate(0deg)") }], { duration: ms, easing: 'ease-in-out' });
      snd('cloth', ms * .1);
      setTimeout(function () { for (var i = 0; i < 2; i++) { var w = at(hx - 6 + i * 14 + dx * .4, hy - tw * .9 + dy * .4, document.createElement('i')); w.className = 'isniff'; anim(w, [{ transform: __L("translateY(0) scale(.6)"), opacity: 0 }, { opacity: .9, offset: .4 }, { transform: __L("translateY(-16px) scale(1.1)"), opacity: 0 }], { duration: 520, delay: i * 120, fill: 'forwards' }); } }, ms * .5);
      setTimeout(function () { var t4 = at(hx - tw / 2 + dx * 1.6, hy - tw / 2 + dy * 1.6, tile(false)); anim(t4, [{ transform: 'translate(0,0)', opacity: 0 }, { opacity: 1, offset: .2 }, { transform: 'translate(' + (-dx * 1.6) + 'px,' + (-dy * 1.6) + 'px)', opacity: 1, offset: .75 }, { transform: __L("translate({0}px,{1}px) scale(.8)", [(-dx * 1.6), (-dy * 1.6)]), opacity: 0 }], { duration: ms * .38, easing: 'ease-in-out', fill: 'forwards' }); sfx('draw'); }, ms * .62);
    }
    setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, ms + 120);
    return ms;
  }
  function skinCount() { var vals = grantsOf().intros.slice(); wardrobe.owned.forEach(function (id) { var c = null; for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) c = CATALOG[i]; if (c && c.cat === 'intro' && vals.indexOf(c.val) < 0) vals.push(c.val); }); return Economy.bakCharges(vals.length, wardrobe.owned); } // Çaktırmadan Bak el hakkı: sahip olunan + karakterle açılan Masa Giriş Skinleri (K5, en çok 5); Bal Palyaço → en çok (K110)
  function prepActive() { return PEEK.prepUntil > 0; }
  function startPrep(until) {
    PEEK.charges = G.tutorial ? 0 : skinCount(); PEEK.active = null; PEEK.incoming = null; PEEK.done = {}; showSlapBtn(false);
    if (!PEEK.tut) PEEK.trial = 0;
    var noPrep = (G.tutorial && !PEEK.tut) || (!NET.online && !PEEK.charges && !freeLeft('bak') && !paidLeft('bak') && !PEEK.tut) || (NET.online && !until); // bot masasında hazırlık: hak ya da ücretsiz hak varsa (eğitim: skin bölümü)
    if (noPrep) { PEEK.prepUntil = 0; if (!NET.online) schedule(); return; }
    PEEK.prepUntil = PEEK.tut ? (Date.now() + 3600000) : (until || (Date.now() + PREP_MS)); // eğitimde süre işlemez
    clearInterval(PEEK.tick); PEEK.tick = setInterval(prepTick, 200); prepTick(); renderActions();
  }
  function prepTick() {
    if (!G) { clearInterval(PEEK.tick); PEEK.prepUntil = 0; $('prepBar').classList.remove('show'); return; } // masa yokken sayaç durur
    var bar = $('prepBar'); if (!prepActive()) { bar.classList.remove('show'); return; }
    bar.classList.add('show');
    var left = Math.max(0, Math.ceil((PEEK.prepUntil - Date.now()) / 1000)), fb = freeLeft('bak');
    $('prepT').textContent = PEEK.tut ? '' : left; $('btnPrepGo').disabled = !!PEEK.active; $('btnPrepGo').hidden = !!PEEK.tut;
    $('prepHint').textContent = PEEK.tut ? __L("🎓 Eğitim: süre işlemez, rehberi izle.") : PEEK.active ? __L("👀 Bakış sürüyor…") : (PEEK.charges ? __L("👀 Skinler → Çaktırmadan Bak: bu el {0} hak{1}", [(PEEK.charges), (fb ? __L(" + 1 ücretsiz") : '')]) : fb ? __L("👀 Skinler → Çaktırmadan Bak: 1 ücretsiz kullanım") : (NET.online ? __L("Taşlarını incele; herkes \"Oyuna geç\" deyince ya da süre bitince el başlar.") : __L("Bu elde bakma hakkın yok (Masa Giriş Skini alınca her el 1 hak).")));
    syncSkinUI();
    if (PEEK.active) { var l2 = Math.max(0, (PEEK.active.until - Date.now()) / 1000); $('peekT').textContent = __L("{0} sn", [(l2.toFixed(1))]); $('peekBar').style.transform = 'scaleX(' + (l2 / (PEEK_MS / 1000)) + ')'; }
    if (Date.now() >= PEEK.prepUntil && !PEEK.active && !PEEK.tut) endPrep();
  }
  function endPrep() {
    clearInterval(PEEK.tick); PEEK.prepUntil = 0; $('prepBar').classList.remove('show');
    if (SKIN.target) cancelTarget();
    if (NET.online) NET.send({ t: 'prepDone' });
    renderActions(); syncSkinUI(); if (!NET.online) schedule();
  }
  function requestPeek(p) {
    if (!prepActive() || PEEK.active || PEEK.pending || p === ME) return;
    if (PEEK.done && PEEK.done[p] === 'done' && !PEEK.tut) { toast(__L("Bu elde bu rakibe zaten baktın; başka bir rakip seç."), 'warn'); return; } // v10.09 (K172, denge P1)
    if (NET.online) { // sunucu doğrular (el hakkı, yoksa ücretsiz hak); 'peek' cevabıyla başlar. Çift dokunma koruması: cevap gelene dek yeni istek yok
      if (PEEK.charges <= 0 && freeLeft('bak') <= 0 && paidLeft('bak') <= 0) return;
      PEEK.pending = true; clearTimeout(PEEK.pendTimer); PEEK.pendTimer = setTimeout(function () { PEEK.pending = false; syncSkinUI(); }, 3000);
      NET.send({ t: 'peek', target: p }); syncSkinUI(); return;
    }
    // bot masası: önce el hakkı, sonra ücretsiz başlangıç hakkı (kabul edildiği anda düşer); eğitimde yalnız deneme hakkı
    var usedFree = false, usedPaid = false;
    if (PEEK.tut) { if (!(PEEK.trial > 0)) return; PEEK.trial--; }
    else if (PEEK.charges > 0) PEEK.charges--;
    else if (freeLeft('bak') > 0) { useFreeSkin('bak'); usedFree = true; } // v9.82: bilgi panelde (bildirim telefonda taşları örtüyordu)
    else if (paidLeft('bak') > 0) { usePaidSkin('bak'); usedPaid = true; } // v9.88: satın alınmış kullanım (sıra: el hakkı → ücretsiz → satın alınmış)
    else return;
    var peekTiles = G.players[p].hand.map(function (t) { return { c: t.c, n: t.n, fake: t.fake, id: t.id }; });
    beginPeek(p, PEEK.tut ? peekTiles : null, Date.now() + PEEK_MS, usedFree ? FREE_NOTE : (usedPaid ? __L("{0} Kalan: {1}", [(PAID_NOTE), (paidLeft('bak'))]) : ''));
    if (!PEEK.tut) setTimeout(function () { if (PEEK.active && PEEK.active.target === p) showPeekTiles(peekTiles); }, 600); // v10.09 (K172, P2): bot masasında da taşlar yarım saniye sonra
    clearTimeout(PEEK.botSlap);
    if (PEEK.tut) PEEK.botSlap = setTimeout(function () { if (PEEK.active && PEEK.active.target === p) slapHappened(p, ME); }, 3500); // eğitim: bot kesin yakalar (engellenmeyi göstermek için)
    else if (Math.random() < 0.45) PEEK.botSlap = setTimeout(function () { if (PEEK.active && PEEK.active.target === p) slapHappened(p, ME); }, 1500 + Math.random() * 5000); // bot fark ederse tokat
  }
  var FREE_NOTE = __L("Ücretsiz kullanım hakkın kullanıldı (1/1).");
  function beginPeek(p, tiles, until, note) {
    PEEK.pending = false; clearTimeout(PEEK.pendTimer);
    PEEK.active = { target: p, until: until };
    peekAnim(ME, p, true);
    var panel = $('peekPanel'); panel.className = __L("show at-{0}", [(SEAT[p].pose)]); $('peekWho').textContent = __L("👀 {0} — eldeki taşlar", [(G.names[p])]);
    var box = $('peekTiles'); box.innerHTML = ''; if (tiles) showPeekTiles(tiles); else box.innerHTML = '<span class="peekWait">👀 …</span>'; $('peekNote').textContent = note || ''; // v10.09 (K172): taşlar yarım saniye sonra açılır (o arada tokat gelirse hiç görünmez)
    if (PEEK.prepUntil < until + 500) PEEK.prepUntil = until + 500;
    clearTimeout(PEEK.endTimer); PEEK.endTimer = setTimeout(function () { endPeek('time'); }, Math.max(0, until - Date.now()));
    prepTick(); if (!PEEK.restoring) sfxOnce('peekfx', 'peek:' + p, 600); emit('peekStart');
  }
  function showPeekTiles(tiles) { var box = $('peekTiles'); if (!box) return; box.innerHTML = ''; (tiles || []).forEach(function (t) { box.appendChild(tileEl(t)); }); }
  function endPeek(reason) {
    if (!PEEK.active) return;
    var a = PEEK.active; PEEK.active = null; clearTimeout(PEEK.endTimer); clearTimeout(PEEK.botSlap);
    PEEK.done = PEEK.done || {}; PEEK.done[a.target] = reason === 'slap' ? 'slapped' : 'done'; // v10.09 (K172, P1): aynı rakibe elde bir bakış (tokatla kesilen yinelenebilir)
    $('peekPanel').className = ''; $('peekTiles').innerHTML = ''; $('peekNote').textContent = ''; // taşlar hemen kapanır (animasyon beklenmez)
    peekAnim(ME, a.target, false);
    if (reason === 'slap') { toast(__L("Yakalandın! Rakibin bakışı kesti; kullanılan hak geri gelmez."), 'warn'); if (!NET.online) openTosWindow(a.target); } // v9.91: bot masasında tokat sonrası tos penceresi (çevrim içi: peekEnd mesajı açar)
    if ((PEEK.charges > 0 || freeLeft('bak') > 0 || paidLeft('bak') > 0) && prepActive() && !PEEK.tut) PEEK.prepUntil = Math.max(PEEK.prepUntil, Date.now() + 6000); // kalan hak için 6 sn ek süre (sunucu da aynı kuralı uygular)
    prepTick(); syncSkinUI(); emit('peekEnd:' + reason);
  }
  var SEAT_XY = { 0: [800, 760], 1: [1480, 320], 2: [800, 120], 3: [120, 320] };
  function dirTo(from, to) { var dx = SEAT_XY[to][0] - SEAT_XY[from][0], dy = SEAT_XY[to][1] - SEAT_XY[from][1]; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
  function peekAnim(from, to, on) {
    var el = $(SEAT[from].ch); el.classList.remove('peek-left', 'peek-right', 'peek-up', 'peek-down');
    if (on) { el.classList.add('peek-' + dirTo(from, to)); if (from !== ME) { bubble(from, '👀'); if (!PEEK.restoring) sfxOnce('peekfx', 'peek:' + from + ':' + to, 600); } } // v9.88: bakış sesi (yeniden bağlanma geri yüklemesinde çalmaz)
  }
  function slapHappened(target, peeker) { // hedef oyuncu bakanı yakaladı
    if (peeker === ME) endPeek('slap');
    slapAnim(target, peeker);
  }
  function slapAnim(target, peeker) {
    var t = $(SEAT[target].ch), p = $(SEAT[peeker].ch), d = dirTo(target, peeker);
    t.classList.add('slap-' + d); setTimeout(function () { t.classList.remove('slap-' + d); }, 650);
    bubble(target, __L("Hop! Nereye bakıyorsun?"));
    setTimeout(function () {
      p.classList.remove('peek-left', 'peek-right', 'peek-up', 'peek-down'); p.classList.add('slapped');
      var boom = document.createElement('div'); boom.className = 'boom'; boom.textContent = '💥'; p.appendChild(boom);
      sfx('slap');
      setTimeout(function () { p.classList.remove('slapped'); boom.remove(); }, 900);
    }, 220);
  }
  // Tokat düğmesi: yalnızca sana bakan oyuncunun bakışı sürerken, o karakterin yanında görünür (bütün ekranı kaplamaz, kontrolleri kilitlemez)
  var SLAP_XY = { 1: [1360, 250], 2: [640, 90], 3: [240, 250] };
  function showSlapBtn(on, from) {
    var w = $('slapBtnWrap'); w.classList.toggle('show', !!on);
    if (on && SLAP_XY[from]) { w.style.left = SLAP_XY[from][0] + 'px'; w.style.top = SLAP_XY[from][1] + 'px'; }
  }
  $('btnPrepGo').onclick = function () { if (PEEK.active) return; endPrep(); };
  $('btnSlap').onclick = function () { // sana bakanı yakala: çevrim içinde sunucu keser (herkese peekEnd:slap), bot masası/eğitimde yerelde
    if (!PEEK.incoming) return; var from = PEEK.incoming.from; PEEK.incoming = null; showSlapBtn(false);
    if (NET.online) { NET.send({ t: 'slap', from: from }); return; }
    clearTimeout(PEEK.inTimer); slapHappened(ME, from); sfx('tap'); emit('slap');
  };
  function tutIncoming(from) { // eğitim: rakip (bot) sana bakıyor; TOKAT AT ile kesersin. Süre dolarsa bakış kendiliğinden biter (adım yeniden denenebilir)
    clearTimeout(PEEK.inTimer); var u = Date.now() + 12000;
    PEEK.incoming = { from: from, until: u }; peekAnim(from, ME, true); showSlapBtn(true, from);
    PEEK.inTimer = setTimeout(function () { if (PEEK.incoming && PEEK.incoming.until === u) { PEEK.incoming = null; showSlapBtn(false); peekAnim(from, ME, false); emit('tutPeekTimeout'); } }, 12000);
  }
  function tutSkinsCleanup() { clearTimeout(PEEK.inTimer); clearTimeout(PEEK.botSlap); PEEK.incoming = null; showSlapBtn(false); PEEK.tut = false; PEEK.trial = 0; if (PEEK.active) endPeek('end'); clearInterval(PEEK.tick); PEEK.prepUntil = 0; $('prepBar').classList.remove('show'); $('btnPrepGo').hidden = false; [1, 2, 3].forEach(function (q) { if (seatEls[q]) peekAnim(q, ME, false); }); if (SKIN.open) closeSkinMenu(); }

  // ---------- Skinler: hızlı kullanım menüsü (elle tetiklenen etkileşimler; Masa Giriş Skinleri buradan oynatılmaz) ----------
  // Etkileşim skinleri: şimdilik "Çaktırmadan Bak" (temel, herkeste). Hak kuralı (5 Ekim 2026): sahip olunan her Masa Giriş Skini el başına 1 hak (en çok 5),
  // yalnızca el başı hazırlık süresinde kullanılır; haklar menüyü açıp kapamakla ya da yeniden bağlanmakla yenilenmez.
  // v9.91 (K116): aksiyon skinleri — masa içi durum (el başına sayaç, tos penceresi) ve oynatıcı
  var ACT = { key: '', used: {}, tosWin: null };
  function actUsed() { var k = G ? (G.matchId + ':' + G.hand) : ''; if (ACT.key !== k) { ACT.key = k; ACT.used = {}; ACT.tosWin = null; } return ACT.used; }
  function actionRight(id) { var it = catItem('action', id); if (it && owns(it.id)) return { ok: true, unlimited: true, via: grantedBy(id) ? 'char' : 'own' }; if (freeLeft(id) > 0) return { ok: true, trial: true }; return { ok: false }; }
  function ownedActionSkins() { return Object.keys(ACTION_SKINS).filter(function (id) { return actionRight(id).ok; }); }
  function actionState(id) { // panel kartı: {ok, why, label}
    var a = ACTION_SKINS[id], def = Economy.actionSkin(id) || {}, r = actionRight(id), used = (actUsed()[id] || 0);
    if (!G || G.phase === 'handover') return { ok: false, why: __L("Masada kullanılır"), r: r };
    if (G.tutorial) return { ok: false, why: __L("Eğitimde kullanılmaz"), r: r };
    if (!r.ok) return { ok: false, why: __L("Mağazadan al ya da karakterle aç"), r: r };
    if (a.cat === 'open') return { ok: false, info: true, why: __L("Açılışta kendiliğinden oynar"), r: r };
    if (a.cat === 'discard') return { ok: false, info: true, why: __L("Taş atınca kendiliğinden oynar (elde {0})", [(def.perHand || 3)]), r: r };
    if (a.cat === 'guard') return { ok: false, info: true, why: __L("Sana bakılınca kendiliğinden (elde 1)"), r: r };
    if (a.cat === 'end') return { ok: false, info: true, why: __L("Maç sonunda birinci olursan kendiliğinden"), r: r };
    if (a.cat === 'info' && NET.online && NET.league && Economy.CONFIG.league.peekOff) return { ok: false, why: __L("Lig maçında kapalı"), r: r };
    if (def.perHand && used >= def.perHand) return { ok: false, why: __L("Bu elde kullanıldı ({0}/{1})", [(used), (def.perHand)]), r: r };
    if (a.cat === 'prep' || a.cat === 'info') return prepActive() ? { ok: true, why: '', r: r, label: a.cat === 'info' ? __L("Rakip seç") : __L("Kullan"), pick: a.cat === 'info' } : { ok: false, why: __L("Yalnızca el başındaki hazırlık süresinde"), r: r };
    if (a.cat === 'react') { var w = ACT.tosWin && Date.now() < ACT.tosWin.until ? ACT.tosWin : null; return w ? { ok: true, why: '', r: r, label: __L("Tos at → {0}", [(shortName(G.names[w.target]))]), target: w.target } : { ok: false, why: __L("Tokat yedikten ya da rakip açıldıktan sonra 5 sn"), r: r }; }
    return { ok: false, why: '', r: r };
  }
  function useActionSkin(id, pick) {
    var st = actionState(id); if (!st.ok) { toast(st.why, ''); return; }
    var target = st.target != null ? st.target : (pick != null ? pick : null);
    if (st.pick && target == null) { enterTarget(id); return; } // hedef seçimi (Yoklama)
    if (NET.online) { NET.send({ t: 'skinUse', skin: id, target: target }); cancelTarget(); closeSkinMenu(); return; } // sunucu doğrular, 'skinFx' ile herkese yayınlar
    actUsed()[id] = (actUsed()[id] || 0) + 1; if (st.r.trial) useFreeSkin(id);
    if (id === 'tos') ACT.tosWin = null;
    cancelTarget(); closeSkinMenu(); playActionFx(id, ME, target); emit('action:' + id);
    if (id === 'yoklama' && target != null) showYoklama(target, colorCounts(G.players[target].hand)); // bot masası: yerel sayım
  }
  function colorCounts(hand) { var c = [0, 0, 0, 0]; (hand || []).forEach(function (t) { if (G && Okey.isJoker(t, G.ok)) return; if (t.fake) return; c[t.c]++; }); return c; } // okey ve sahte okey sayılmaz (bilgi sınırı)
  function showYoklama(target, counts) { // yalnız kullanan görür: hedefin üstünde 4 sn renk dağılımı
    var old = $('yoklamaBox'); if (old) old.remove();
    var z = YOK_XY[target] || YOK_XY[2], d = document.createElement('div'); d.id = 'yoklamaBox'; d.className = 'pos yoklama'; /* üst koltukta hazırlık çubuğunun altına (çubukla çakışıyordu) */
    d.style.left = (z[0] - 150) + 'px'; d.style.top = (z[1] - 34) + 'px';
    d.innerHTML = '<b>👂 ' + shortName(G.names[target]) + '</b>' + counts.map(function (n, c) { return __L("<span class=\"c{0}\">{1} <i>{2}</i></span>", [(c), (Okey.COLORS[c]), (n)]); }).join('');
    $('stage').appendChild(d); setTimeout(function () { d.remove(); }, (Economy.actionSkin('yoklama') || {}).showMs || 4000);
  }
  var YOK_XY = { 1: [1250, 450], 2: [800, 380], 3: [350, 450] }; // Yoklama kutusu: hedefin per bölgesi (üstte hazırlık çubuğunun altı)
  function sceneBox(el) { /* öğenin sahne (1600×900) koordinatlarındaki kutusu — translate(-50%) gibi dönüşümler ve sahne ölçeği dahil (offsetLeft üst koltukta 125 px sağa kayıyordu) */
    var st = $('stage'); if (!el || !st || !el.offsetWidth) return null; var sr = st.getBoundingClientRect(), r = el.getBoundingClientRect(), sc = sr.width / 1600 || 1;
    return { x: (r.left - sr.left) / sc, y: (r.top - sr.top) / sc, w: r.width / sc, h: r.height / sc };
  }
  function discXY(p) { var b = sceneBox($(SEAT[p] ? SEAT[p].disc : 'mydisc')); if (b) return [b.x + b.w / 2, b.y + b.h / 2]; return ZONE_XY[p] || ZONE_XY[0]; }
  function charXY(p) { var b = sceneBox(p === ME ? $('meAv') : $(SEAT[p].ch)); if (b) return [b.x + b.w / 2, b.y + b.h * 0.25]; return ZONE_XY[p] || ZONE_XY[0]; }
  function zaferCheck() { // maç bitti: birinci Zafer Turu'na sahipse konfeti (çevrim içi: koltuk kaydı; bot masası: kendi hakkım)
    if (!G || !G.finished || !G.history.length) return; var first = G.history[G.history.length - 1].ranks.indexOf(1); if (first < 0) return;
    var has = NET.online ? (function () { var s = NET.seats && NET.seats[(first + NET.seat) % 4]; return !!(s && !s.bot && (s.actions || []).indexOf('zafer') >= 0); })() : (first === ME && actionRight('zafer').ok);
    if (has) playActionFx('zafer', first, null);
  }
  var ZONE_XY = { 0: [800, 600], 1: [1250, 450], 2: [800, 250], 3: [350, 450] }, CUP_XY = { 0: [300, 588], 1: [1330, 400], 2: [800, 205], 3: [270, 400] }; // sahne koordinatları (göreli koltuk)
  var FX_SCALE = { 'fx-muhur': 1.5, 'fx-tos': 1.4, 'fx-nazar': 1.5, 'fx-kulak': 1.4, 'fx-pati': 1.35, 'fx-konfeti': 1.3, 'fx-tepsi': 1.25, 'fx-cay': 1.15 }; // v9.99 (K129): efektler tester'a göre çok sadeydi/küçüktü → büyütüldü (sprite aynı, ölçek)
  function spawnFx(name, x, y, loopMs, scale) {
    var d = FX_DEF[name]; if (!d || !$('stage')) return null; var el = document.createElement('i'); el.className = 'fxs live';
    var reduce = settings.reduceMotion, dur = d.frames / d.fps, sc = scale || FX_SCALE[name] || 1, w = d.w * sc, h = d.h * sc;
    el.style.cssText = 'left:' + (x - w / 2) + 'px;top:' + (y - h / 2) + 'px;width:' + w + 'px;height:' + h + 'px;background-image:url(assets/fx/' + name + '.webp);background-size:' + d.frames * w + 'px ' + h + 'px;--fxf:' + d.frames + ';--fxw:' + d.frames * w + 'px;--fxd:' + dur + 's;animation-iteration-count:' + (loopMs ? 'infinite' : '1');
    if (reduce) { el.style.animation = 'none'; el.style.backgroundPosition = __L("{0}px 0", [(-(d.frames - 1) * w)]); }
    $('stage').appendChild(el); setTimeout(function () { el.remove(); }, loopMs || (reduce ? 800 : dur * 1000 + 60)); return el;
  }
  function netActFx(kind, actor) { /* v9.92: çevrim içi hamle olayına bağlı otomatik skinler — koltuk kaydındaki haklara göre (kendi hamlem dahil): taş atışı → Patili (elde 3), açılış → Mühür */
    var sAct = NET.seats && NET.seats[(actor + NET.seat) % 4]; if (!sAct || sAct.bot) return; var acts = sAct.actions || [];
    if (kind === 'discard' && acts.indexOf('patili') >= 0) { var ku = actUsed(); ku['patili:' + actor] = (ku['patili:' + actor] || 0) + 1; if (ku['patili:' + actor] <= 3) playActionFx('patili', actor, null); }
    if (kind === 'open' && acts.indexOf('muhur') >= 0) playActionFx('muhur', actor, null);
  }
  var ACT_TAG_T = null;
  function actionTag(skin, from, target) { // v9.99 (K129): her aksiyonda "kim · hangi skin · kime" etiketi (ad baloncuğu yalnız rakiplerde ve küçüktü; oyuncu ne olduğunu anlamıyordu) + aktörün koltuğu parlar
    var a = ACTION_SKINS[skin] || (INTRO_SKINS[skin] ? { icon: INTRO_ICON[skin] || '✨', name: INTRO_SKINS[skin].name, color: INTRO_ART[skin] ? INTRO_ART[skin].color : '#ffd36b' } : null), el = $('actTag'); if (!a || !el || !G) return; // v10.06 (K159): Masa Giriş Skini de aynı etiketle
    var who = from === ME ? __L('Sen') : G.names[from], tgt = target != null && target !== from ? (target === ME ? __L("sen") : G.names[target]) : '';
    el.innerHTML = '<i class="ic">' + a.icon + '</i><b class="nm">' + a.name + '</b><span class="who">' + who + (tgt ? ' → ' + tgt : '') + '</span>';
    el.style.setProperty('--skc', a.color); el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(ACT_TAG_T); ACT_TAG_T = setTimeout(function () { el.hidden = true; el.classList.remove('show'); }, 2600);
    var ch = from === ME ? $('meAv') : (SEAT[from] ? $(SEAT[from].ch) : null); if (ch) { ch.classList.remove('acting'); void ch.offsetWidth; ch.classList.add('acting'); setTimeout(function () { ch.classList.remove('acting'); }, 950); }
  }
  function playActionFx(skin, from, target) { // herkese görünen gösteri (çevrim içi: 'skinFx'; bot masası: yerel)
    var a = ACTION_SKINS[skin]; if (!a || !G) return;
    if (skin !== 'patili') actionTag(skin, from, target); else bubble(from, '🐾'); // K129: pati her atışta çıkar (elde 3) → yalnız küçük baloncuk
    var rgA = rigOf(from); // v10.07 (üretim 07): rig'li karakter aksiyonu kendi eliyle/başıyla da oynar
    if (skin === 'cay_servisi') {
      var rg = rgA;
      if (rg && rg.props.tepsi) { Rig.play(rg, Rig.CLIPS.cay_servisi); setTimeout(function () { bubble(from, __L("🍵 Buyrun!")); }, 900); sfxOnce('cayting', 'cay:0', 300); } // K121: rig'li karakter tepsiyi eliyle kaldırır, bardaklar servis anında çıkar (klip olayı → cayCups)
      else { if (rg) Rig.play(rg, Rig.CLIPS.ikram); spawnFx('fx-tepsi', 800, 450); bubble(from, __L("🍵 Buyrun!")); sfxOnce('cayting', 'cay:0', 300); setTimeout(cayCups, 650); } // v10.07: tepsisi olmayan rig'li karakter "buyrun" eliyle ikram eder
    } else if (skin === 'muhur') {
      var z = ZONE_XY[from] || ZONE_XY[0], stamp = rgA && rgA.props.muhur;
      if (stamp) Rig.play(rgA, Rig.CLIPS.muhur_vur); else if (rgA && !rgA.clip) Rig.play(rgA, Rig.CLIPS.selam); // v10.07: Muhtar mührü kaldırıp basar; iz basma anında
      var muhurFx = function () { if (!G) return; spawnFx('fx-muhur', z[0], z[1]); sfxOnce('muhurtak', 'muhur:' + from, 300); }; if (stamp) setTimeout(muhurFx, 470); else muhurFx(); // mührü olmayan karakterde iz hemen (eskisi gibi)
    } else if (skin === 'patili') {
      var dp = discXY(from); if (rgA && Rig.hasVariant(rgA, 'el-sag', 'pati')) Rig.play(rgA, Rig.CLIPS.pati); spawnFx('fx-pati', dp[0], dp[1]); sfxOnce('patipat', 'pati:' + from, 250); // v10.07: Pamuk patisini kaldırıp dokunur
    } else if (skin === 'nazar') {
      var cp = charXY(from); if (from === 2) spawnFx('fx-nazar', cp[0] - 90, cp[1] + 10); else spawnFx('fx-nazar', cp[0], cp[1] - 30); sfxOnce('nazarcin', 'nazar:' + from, 500); bubble(from, '🧿'); /* üst koltukta omuz hizası: başın üstü el/tur başlığına giriyordu */
      if (rgA && !rgA.clip) Rig.play(rgA, Rig.CLIPS.nazar);
    } else if (skin === 'yoklama') {
      var yp = charXY(from); spawnFx('fx-kulak', yp[0], yp[1] + 40); sfxOnce('yoklamahmm', 'yok:' + from, 500);
      if (rgA) Rig.play(rgA, Rig.hasVariant(rgA, 'el-sag', 'kulak') ? Rig.CLIPS.yoklama_kulak : Rig.CLIPS.yoklama); // v10.07: Nine elini kulağına götürür (dedikodu yüzü); diğerleri başını eğip dinler
    } else if (skin === 'zafer') {
      var zp = charXY(from); [0, -130, 130].forEach(function (dx, i) { setTimeout(function () { if (G) spawnFx('fx-konfeti', zp[0] + dx, zp[1] - 40); }, i * 160); }); sfxOnce('zafertef', 'zafer', 800); bubble(from, __L("🎉 Zafer!"));
      var zc = from === ME ? $('meAv') : $(SEAT[from].ch); if (zc) { zc.classList.add('zafer'); setTimeout(function () { zc.classList.remove('zafer'); }, 2500); }
      if (rgA) Rig.play(rgA, Rig.CLIPS.zafer);
    } else if (skin === 'tos') {
      var rgT = rigOf(from), ch = from === ME ? $('meAv') : $(SEAT[from].ch); if (rgT) Rig.play(rgT, Rig.CLIPS.tos); else if (ch) { ch.classList.remove('tos'); void ch.offsetWidth; ch.classList.add('tos'); setTimeout(function () { ch.classList.remove('tos'); }, 700); } // v9.98: rig'li karakter (Şakir) kafa vuruşunu parçalı oynar ('tos' yüzü), diğerleri eski CSS sallanma
      bubble(from, __L("Tos!")); var sa = seatAvatar(from) || (from === ME ? normAvatar(myAvatar || DEFAULT_AV) : null); if (sa && sa.full === 'sakir') sfxOnce('mee', 'tos:mee', 500);
      setTimeout(function () { if (!G) return; var zt = ZONE_XY[target != null ? target : 0] || ZONE_XY[0]; spawnFx('fx-tos', zt[0], zt[1]); sfxOnce('tostok', 'tos:' + from, 200); var tc = target === ME ? $('meAv') : (target != null && SEAT[target] ? $(SEAT[target].ch) : null); if (tc) { tc.classList.add('shaken'); setTimeout(function () { tc.classList.remove('shaken'); }, 500); if (target != null) rigReact(target); } }, 180);
    }
  }
  function rigReact(p) { var rg = rigOf(p); if (rg && !rg.clip) Rig.play(rg, Rig.CLIPS.tepki); }
  // v10.07 (K168): üst koltuktaki karakterin elleri masanın kenarının arkasında kalıyordu — kol/el oynatan klip boyunca masaya eğilir (CSS #chTop.leanIn), bitince geri
  var LEAN_T = null;
  if (window.Rig && Rig.hooks) {
    Rig.hooks.play = function (inst, def) { var top = $('chTop'); if (!top || !top.contains(inst.host)) return; var arms = Object.keys(def.kemik || {}).some(function (k) { return /kol|^el-/.test(k); }); if (!arms) return; clearTimeout(LEAN_T); top.classList.add('leanIn'); };
    Rig.hooks.end = function (inst) { var top = $('chTop'); if (!top || !top.contains(inst.host)) return; clearTimeout(LEAN_T); LEAN_T = setTimeout(function () { if (!Rig.instances().some(function (i) { return top.contains(i.host) && i.clip; })) top.classList.remove('leanIn'); }, 150); };
  } // K121: tokat/tos/nazar tepkisi (rig yoksa mevcut CSS sallanma)
  function openTosWindow(target) { if (!G || G.tutorial || target == null || target === ME) return; if (!actionRight('tos').ok) return; var def = Economy.actionSkin('tos') || {}; if ((actUsed().tos || 0) >= (def.perHand || 2)) return; ACT.tosWin = { target: target, until: Date.now() + (def.windowMs || 5000) }; var sb = $('skinBtn'); if (sb) { sb.classList.add('tosReady'); setTimeout(function () { sb.classList.remove('tosReady'); }, def.windowMs || 5000); } syncSkinUI(); if (SKIN.open) renderSkinMenu(); } // bildirim yok (telefonda taşları örter): Skinler düğmesi 5 sn "Tos!" diye parlar
  var INTER_SKINS = { bak: { name: __L("Çaktırmadan Bak"), icon: '👀', desc: __L("Seçtiğin rakibin elini 8 sn görürsün (yalnızca el başı hazırlık süresinde). Fark edilirsen tokat yersin; kullanılan hak geri gelmez.") }, yoklama: { name: __L("Yoklama"), icon: '👂', desc: __L("Seçtiğin rakibin elindeki renk dağılımını 4 sn görürsün (sayılar ve okey gösterilmez).") } };
  var INTRO_ICON = { tersten_el: '🔄', ince_ayar: '📏', gosterissiz_numara: '🫰', ortayi_kokla: '👃' };
  var SKIN = { open: false, target: null, pick: null }; // menü açık mı; hedef seçilen skin; seçilen rakip koltuğu
  function ownedInterSkins() { return ['bak']; }
  function interState(id) {
    if (id !== 'bak') return { ok: false, uses: 0, why: __L("Yakında") };
    var free = freeLeft('bak'), paid = paidLeft('bak'), base = skinCount() + (free ? 1 : 0) + paid, viaChar = grantsOf().bakMax;
    if (!G || G.phase === 'handover') return { ok: false, uses: 0, paid: paid, viaChar: viaChar, why: __L("Masada kullanılır") };
    if (G.tutorial && !PEEK.tut) return { ok: false, uses: 0, why: __L("Eğitimde kullanılmaz") };
    if (NET.online && NET.league && Economy.CONFIG.league.peekOff) return { ok: false, uses: 0, free: free, why: __L("Lig maçında kapalı") }; // v9.87 (D7)
    if (PEEK.active) return { ok: false, uses: PEEK.charges, free: free, paid: paid, viaChar: viaChar, why: __L("Bakış sürüyor") };
    if (PEEK.pending) return { ok: false, uses: PEEK.charges, free: free, paid: paid, viaChar: viaChar, why: __L("Sunucu onaylıyor…") };
    if (!prepActive()) return { ok: false, uses: base, free: free, paid: paid, viaChar: viaChar, why: base ? __L("Yalnızca el başındaki hazırlık süresinde") : __L("Masa Giriş Skini alınca her el 1 hak") };
    if (PEEK.tut) return PEEK.trial > 0 ? { ok: true, uses: PEEK.trial, trial: true, why: '' } : { ok: false, uses: 0, trial: true, why: __L("Eğitim denemesi kullanıldı") };
    if (PEEK.charges <= 0 && free <= 0 && paid <= 0) return { ok: false, uses: 0, paid: 0, viaChar: viaChar, why: skinCount() ? __L("Bu elde hakkın bitti · mağazadan kullanım paketi alabilirsin") : (wardrobe.skinGift || ACC.on ? __L("Ücretsiz hak kullanıldı · Mağaza: kullanım paketi ya da Masa Giriş Skini (her el 1 hak)") : __L("Masa Giriş Skini alınca her el 1 hak")) };
    return { ok: true, uses: PEEK.charges, free: free, paid: paid, viaChar: viaChar, why: '' };
  }
  function introState(id) { // Masa Giriş Skini kartı: sahiplik / aktif / ücretsiz deneme / mağaza
    var it = catItem('intro', id), a = normAvatar(myAvatar || DEFAULT_AV), has = !!(it && owns(it.id)), free = freeLeft(id);
    return { has: has, active: has && a.intro === id, free: free, trial: false, used: !!(G && introUsed()[id]), price: it ? it.price : 0 };
  }
  var skinMenuKey = ''; // açık menü yalnız durum değişince yeniden çizilir (her 200 ms'lik hazırlık tikinde DOM yenilenmesin: dokunma/odak kaybolmasın)
  function syncSkinUI() { // düğme ışığı + açık menünün tazelenmesi
    var btn = $('skinBtn'); if (!btn) return;
    var st = interState('bak');
    $('skinDot').hidden = !st.ok; btn.classList.toggle('on', SKIN.open);
    btn.hidden = !G || APP.state !== 'GAME' && APP.state !== 'TUTORIAL' || (settings.skins === false && !G.tutorial); // v10.12 (K181): skinler kapalıysa düğme yok (eğitimde kalır)
    if (SKIN.open) { var key = [st.ok, st.uses, st.free, st.why, SKIN.target, SKIN.pick, PEEK.trial, INTRO_USE.key, Object.keys(INTRO_SKINS).map(function (id) { var x = introState(id); return x.has + '' + x.active + x.free; }).join('')].join('|'); if (key !== skinMenuKey) { renderSkinMenu(); skinMenuKey = key; } }
  }
  function renderSkinMenu() {
    var grid = $('skinGrid'), tg = $('skinTgt'); skinMenuKey = '*';
    if (SKIN.target) { grid.hidden = true; tg.hidden = false; renderTargetStep(); return; }
    grid.hidden = false; tg.hidden = true; grid.innerHTML = '';
    if (!G.tutorial && !settings.tipSkin) { // v9.89 (K112): özellik ilk açıldığında kısa anlatım — panelin içinde, "Tamam" ile bir kez kapanır (bildirim olarak değil: telefonda taşları örterdi)
      var tip = document.createElement('div'); tip.className = 'sktip'; tip.innerHTML = __L("<b>Skinler nedir?</b> El başı hazırlıkta rakibe bakmak (Çaktırmadan Bak) ve maç başı gösterileri. Hakların kartlarda yazar; adım adım öğrenmek için lobide \"Nasıl Oynanır?\" → Skinler. <button class=\"soft\" id=\"skTipOk\">Tamam</button>");
      tip.querySelector('#skTipOk').onclick = function (ev) { ev.stopPropagation(); settings.tipSkin = true; saveSettings(); tip.remove(); };
      grid.appendChild(tip);
    }
    var h1 = document.createElement('div'); h1.className = 'sksec'; h1.textContent = __L("Etkileşim · elle kullanılır"); grid.appendChild(h1);
    ownedInterSkins().forEach(function (id) {
      var sk = INTER_SKINS[id], st = interState(id), c = document.createElement('div');
      c.className = 'skcard' + (st.ok ? '' : ' off'); c.dataset.skin = id;
      var useTxt = st.trial ? __L("Eğitim denemesi: {0}", [(st.uses)]) : (prepActive() || !G ? __L("Kalan: {0} hak", [(st.uses + (st.free && prepActive() ? 1 : 0))]) : __L("Her el {0} hak", [(st.uses)])); // ücretsiz hak da kalan sayıya dahil; rozet kaynağını söyler
      c.innerHTML = '<span class="ic">' + sk.icon + '</span><span class="nm">' + sk.name + '</span><span class="use">' + useTxt + '</span>' + (st.free ? __L("<span class=\"free\">1 ücretsiz kullanım</span>") : '') + (st.paid ? __L("<span class=\"free paid\">Satın alınmış: {0}</span>", [(st.paid)]) : '') + (st.viaChar ? __L("<span class=\"free char\">Bal Palyaço avantajı: her el en çok hak</span>") : '') + (st.ok ? '' : '<span class="why">' + st.why + '</span>'); // v9.88: satın alınmış kullanım ve karakter avantajı
      c.title = sk.desc;
      c.onclick = function () { if (!interState(id).ok) { toast(interState(id).why, ''); return; } enterTarget(id); };
      grid.appendChild(c);
    });
    ownedActionSkins().forEach(function (id) { // v9.91 (K116)
      var a = ACTION_SKINS[id], st = actionState(id), c = document.createElement('div');
      c.className = 'skcard act' + (st.ok ? '' : ' off'); c.dataset.action = id; c.title = a.desc;
      c.innerHTML = '<span class="ic">' + a.icon + '</span><span class="mid"><span class="nm">' + a.name + '</span><span class="use">' + (st.ok ? (st.label || __L("Kullan")) : st.why) + '</span>' + (st.r.trial ? __L("<span class=\"free\">1 ücretsiz deneme</span>") : st.r.via === 'char' ? __L("<span class=\"free char\">Karakter avantajıyla ücretsiz</span>") : '') + '</span>';
      c.onclick = function () { if (st.info) { toast(a.desc, ''); return; } useActionSkin(id); };
      c.dataset.pick = st.pick ? '1' : '';
      grid.appendChild(c);
    });
    var h2 = document.createElement('div'); h2.className = 'sksec'; h2.textContent = __L("Masa Giriş Skinleri · istediğin an bütün masaya oynar"); grid.appendChild(h2);
    Object.keys(INTRO_SKINS).forEach(function (id) {
      var sk = INTRO_SKINS[id], st = introState(id), c = document.createElement('div');
      c.className = 'skcard intro' + (st.trial ? ' trial' : ''); c.dataset.intro = id; c.title = sk.desc;
      var gb = grantedBy(id), status = st.has ? (st.used ? __L("Bu elde kullanıldı · sonraki elde yine") : (gb ? __L("Karakter avantajı · her el 1 kez") : __L("Sende · her el 1 kez"))) : st.free ? '' : __L("Mağaza · {0} altın", [((st.price || 0).toLocaleString(window.__LOC || 'tr-TR'))]); // v10.06 (K159)
      c.innerHTML = __L("<span class=\"ic\">{0}</span><span class=\"mid\"><span class=\"nm\">{1}</span>{2}{3}</span><span class=\"row\"><button class=\"soft mini\" data-pv=\"{4}\" title=\"Önizle (yalnız sen görürsün, hak harcamaz)\">▶ İzle</button>{5}</span>", [(INTRO_ICON[id] || '✨'), (sk.name), (status ? '<span class="use">' + status + '</span>' : ''), (!st.has && st.free ? __L("<span class=\"free\">1 ücretsiz kullanım</span>") : ''), (id), (st.has || st.free ? __L("<button class=\"{0} mini\" data-use=\"{1}\"{2} title=\"Şimdi bütün masaya oynat\">{3}</button>", [(st.has ? 'primary' : 'good'), (id), (st.used ? ' disabled' : ''), (st.has ? __L("Kullan") : __L("Dene"))]) : '')]);
      grid.appendChild(c);
    });
    grid.querySelectorAll('[data-pv]').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); if (introPlaying) return; var id = b.dataset.pv; playIntroOn($('meAv'), id, INTRO_DIR[0]); toast(INTRO_SKINS[id].name + ': ' + INTRO_SKINS[id].desc, ''); emit('preview'); }; }); // önizleme sınırsız; hak harcamaz
    grid.querySelectorAll('[data-use]').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); sfx('tap'); useIntroSkin(b.dataset.use); }; }); // v10.06 (K159): o an oynar
  }
  function renderTargetStep() {
    var tg = $('skinTgt'), sk = INTER_SKINS[SKIN.target];
    tg.innerHTML = __L("<div class=\"ttl\">{0} {1} · Rakip seç</div><div class=\"who\"></div><div class=\"row\"><button class=\"soft\" id=\"skCancel\">İptal</button><button class=\"primary\" id=\"skUse\"{2}>Kullan</button></div>", [(sk.icon), (sk.name), (SKIN.pick === null ? ' disabled' : '')]);
    var who = tg.querySelector('.who');
    [1, 2, 3].forEach(function (p) { var b = document.createElement('button'); b.className = SKIN.pick === p ? 'sel' : ''; b.innerHTML = portrait(p) + '<span>' + shortName(G.names[p]) + '</span>'; b.onclick = function () { pickTarget(p); }; who.appendChild(b); });
    $('skCancel').onclick = cancelTarget;
    $('skUse').onclick = useSkin;
  }
  function enterTarget(id) {
    SKIN.target = id; SKIN.pick = null;
    [1, 2, 3].forEach(function (p) { var el = $(SEAT[p].ch); el.classList.add('targetable'); el.classList.remove('picked'); });
    renderSkinMenu(); emit('skinTarget');
  }
  function pickTarget(p) { // hedef seçimi hak harcamaz; "Kullan" ile onaylanır
    if (!SKIN.target || p === ME) return;
    SKIN.pick = p; [1, 2, 3].forEach(function (q) { $(SEAT[q].ch).classList.toggle('picked', q === p); });
    renderSkinMenu(); sfx('tap');
  }
  function cancelTarget() {
    SKIN.target = null; SKIN.pick = null;
    [1, 2, 3].forEach(function (p) { var el = $(SEAT[p].ch); if (el) el.classList.remove('targetable', 'picked'); });
    if (SKIN.open) renderSkinMenu();
  }
  function useSkin() {
    if (!SKIN.target || SKIN.pick === null) return;
    var id = SKIN.target, p = SKIN.pick;
    if (ACTION_SKINS[id]) { var b0 = $('skUse'); if (b0) b0.disabled = true; useActionSkin(id, p); return; } // v9.92: hedefli aksiyon skini (Yoklama)
    var st = interState(id);
    if (!st.ok) { toast(st.why, 'warn'); cancelTarget(); return; }
    var b = $('skUse'); if (b) b.disabled = true; // çift dokunma: tek istek
    cancelTarget(); closeSkinMenu();
    if (id === 'bak') requestPeek(p);
  }
  function openSkinMenu() { if (!G) return; SKIN.open = true; $('skinMenu').hidden = false; renderSkinMenu(); syncSkinUI(); emit('skinOpen'); } // v9.89 (K112): ilk açılış notu panelin içinde (renderSkinMenu; bildirim taşları örtmesin)
  function closeSkinMenu() { SKIN.open = false; $('skinMenu').hidden = true; if (SKIN.target) cancelTarget(); syncSkinUI(); }
  function toggleSkinMenu() { if (SKIN.open) closeSkinMenu(); else openSkinMenu(); }
  $('skinBtn').onclick = function () { toggleSkinMenu(); }; // menüyü açıp kapatmak oyun hamlesi değildir
  $('skinClose').onclick = closeSkinMenu;
  document.addEventListener('pointerdown', function (ev) { // menü dışına dokununca kapanır (hedef seçimi sırasında karakterlere dokunmak hariç)
    if (!SKIN.open) return;
    var t = ev.target; if (!t || !t.closest) return;
    if (t.closest('#skinMenu') || t.closest('#skinBtn') || (SKIN.target && t.closest('.chara.targetable'))) return;
    closeSkinMenu();
  }, true);

  // ---------- animasyon ----------
  function snapshot() {
    var s = { rack: {}, disc: {}, discTop: {}, avatar: {}, table: {}, hand: {}, counts: [], deck: rectOf($('deck')), pen: G.penalties ? G.penalties.join() : '' };
    document.querySelectorAll('#rack .t').forEach(function (e) { s.rack[e.dataset.id] = rectOf(e); });
    G.players.forEach(function (p, i) {
      var dEl = $(SEAT[i].disc), el = dEl.querySelector('.t');
      s.disc[i] = rectOf(el || dEl);
      s.discTop[i] = p.discards.length ? p.discards[p.discards.length - 1].id : null;
      s.avatar[i] = rectOf(i === ME ? $('rackMe') : $(SEAT[i].rack));
      s.counts[i] = p.hand.length;
    });
    G.table.forEach(function (m) { m.tiles.forEach(function (t) { s.table[t.id] = true; }); });
    G.players[ME].hand.forEach(function (t) { s.hand[t.id] = true; });
    return s;
  }
  function rectOf(el) { if (!el) return null; var r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }
  function flyTo(el, from, delay) {
    if (!el || !from || reduceMotion) return;
    var to = el.getBoundingClientRect();
    if (!to.width) return;
    var dd = dToStage(from.left + from.width / 2 - to.left - to.width / 2, from.top + from.height / 2 - to.top - to.height / 2), dx = dd.x, dy = dd.y, sc = Math.min(1.3, Math.max(.6, from.width / to.width || 1));
    el.animate([{ transform: __L("translate({0}px,{1}px) scale({2})", [(dx), (dy), (sc)]), opacity: .9 }, { transform: 'none', opacity: 1 }], { duration: 400, delay: delay || 0, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  function flyGhost(from, to, tile, delay) {
    if (!from || !to || reduceMotion) return;
    var e = tile ? tileEl(tile, 'fx') : backEl(); e.classList.add('fx');
    e.style.setProperty('--tw', (from.width || 26) + 'px'); e.style.left = from.left + 'px'; e.style.top = from.top + 'px';
    document.body.appendChild(e);
    var dx = to.left + to.width / 2 - from.left - from.width / 2, dy = to.top + to.height / 2 - from.top - from.height / 2;
    var an = e.animate([{ transform: 'none' }, { transform: __L("translate({0}px,{1}px) scale(.6)", [(dx), (dy)]), opacity: .2 }], { duration: 420, delay: delay || 0, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
    an.onfinish = function () { e.remove(); };
    setTimeout(function () { e.remove(); }, 900);
  }
  // v10.06 (K146): yeni oyuncunun ilk 10 sırasında (kalıcı sayaç) sıra gelince büyük bildirim + ses + titreşim; sonra yalnız rozet/ıstaka parlaması ve 14 sn sonraki ipucu
  function turnCallout() {
    var n = settings.turnCalls || 0; if (n >= 10) return;
    settings.turnCalls = n + 1; saveSettings();
    var td = Okey.topDiscard(G), who = td && G.lastDiscarder != null && G.lastDiscarder !== ME ? G.names[G.lastDiscarder] : null;
    var d = document.createElement('div'); d.className = 'toast turncall'; d.innerHTML = __L("<b>Sıra sende!</b><span>{0}</span>", [(who ? __L("Desteden çek ya da {0}'in attığı taşı \"YANDAN AL\" ile al.", [(esc(who))]) : __L("Desteye dokunarak bir taş çek."))]);
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600);
    if (!NET.online) { sfx('turn'); try { if (navigator.vibrate) navigator.vibrate(90); } catch (e) {} } // çevrim içinde sayaç zaten ses + titreşim verir
  }
  // v10.06 (K146): rakip taş atınca atılan taş önce masanın ortasında BÜYÜK görünür ("Mehmet attı"), sonra köşesine iner — karar anında tanınsın (tester: "eşim taş attığında hemen görmek istiyorum")
  var CALLOUT = null;
  function discardCallout(seat, tile, discEl) {
    if (!tile || !discEl || seat === ME || !G) return;
    if (CALLOUT) { try { CALLOUT.remove(); } catch (e) {} CALLOUT = null; }
    var dr = discEl.getBoundingClientRect(); if (!dr.width) return;
    var st = $('stage'), L = parseFloat(st.style.left) || 0, T = parseFloat(st.style.top) || 0; // sahne (800, 380): deste/gösterge çevresi — üst rakibin ıstakasının altı, kendi ıstakanın üstü
    var tw = Math.round(dr.width * (PHONE ? 2.1 : 1.5)), cx = L + 800 * SC, cy = T + (PHONE ? 372 : 380) * SC;
    var wrap = document.createElement('div'); wrap.className = 'callout'; wrap.style.left = (cx - tw / 2) + 'px'; wrap.style.top = (cy - tw / 2) + 'px'; wrap.style.width = tw + 'px';
    var e = tileEl(tile, 'fx'); e.style.setProperty('--tw', tw + 'px'); e.style.position = 'relative'; wrap.appendChild(e);
    var who = document.createElement('i'); who.className = 'who'; who.textContent = __L("{0} attı", [(G.names[seat])]); who.style.fontSize = Math.max(12, Math.round(tw * 0.17)) + 'px'; wrap.appendChild(who);
    document.body.appendChild(wrap); CALLOUT = wrap;
    var hold = PHONE ? 1100 : 800, dx = dr.left + dr.width / 2 - cx, dy = dr.top + dr.height / 2 - cy, sc = dr.width / tw;
    var done = function () { if (CALLOUT === wrap) CALLOUT = null; wrap.remove(); };
    if (reduceMotion) { setTimeout(done, hold); return; }
    wrap.animate([{ transform: 'scale(.5)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: .25 }, { transform: 'scale(1)', opacity: 1, offset: .35 }, { transform: 'scale(1)', opacity: 1, offset: .78 }, { transform: __L("translate({0}px,{1}px) scale({2})", [(dx), (dy), (sc)]), opacity: .15 }], { duration: hold + 420, easing: 'ease-in-out', fill: 'forwards' }).onfinish = done;
    setTimeout(done, hold + 900);
  }
  function animateDiff(s, actor) {
    var me = G.players[ME];
    var ftE = $('finTile'); if (ftE && !ftE.hidden && ftE.dataset.fresh === '1') { ftE.dataset.fresh = ''; var fw = G.handOver ? G.handOver.winner : null, fid = ftE.dataset.id; flyTo(ftE.querySelector('.t'), fw === ME ? (s.rack[fid] || s.avatar[ME]) : s.avatar[fw]); sfx('place'); } // v10.06 (K160)
    G.players.forEach(function (p, i) {
      var top = p.discards.length ? p.discards[p.discards.length - 1] : null;
      if (top && G.phase === 'handover' && G.handOver && G.handOver.finishTile && G.handOver.finishTile.id === top.id) return; // v10.06 (K160): bitiş taşı köşeye uçmaz — ortaya (#finTile) uçar
      if (top && top.id !== s.discTop[i]) {
        var el = $(SEAT[i].disc).querySelector('.t');
        flyTo(el, i === ME ? (s.rack[top.id] || s.avatar[ME]) : s.avatar[i]);
        if (i !== ME && G.phase !== 'handover') discardCallout(i, top, el);
      }
    });
    var d = 0;
    document.querySelectorAll('#melds .t').forEach(function (e) {
      var id = e.dataset.id;
      if (!s.table[id]) { flyTo(e, s.rack[id] || s.avatar[actor] || s.avatar[ME], d); d += 40; }
    });
    document.querySelectorAll('#rack .t').forEach(function (e) {
      var id = e.dataset.id;
      if (s.hand[id]) return;
      var from = s.deck;
      for (var i = 0; i < 4; i++) if (String(s.discTop[i]) === id) from = s.disc[i];
      if (PULL_DEST && PULL_DEST.rect && (PULL_DEST.tileId != null ? String(PULL_DEST.tileId) === id : PULL_DEST.kind === 'draw')) from = PULL_DEST.rect; // v9.80: sürükleyerek çekilen taş bırakıldığı yerden yerine oturur
      flyTo(e, from);
    });
    [1, 2, 3].forEach(function (i) {
      var gained = G.players[i].hand.length - s.counts[i];
      if (gained <= 0) return;
      var tookDiscard = null;
      for (var j = 0; j < 4; j++) {
        if (s.discTop[j] === null) continue;
        var still = G.players.some(function (q) { return q.discards.some(function (t) { return t.id === s.discTop[j]; }); });
        if (!still && !me.hand.some(function (t) { return t.id === s.discTop[j]; })) tookDiscard = j;
      }
      var k = 0;
      if (tookDiscard !== null) { var tt = G.players[i].hand.find(function (t) { return t && t.id === s.discTop[tookDiscard]; }); flyGhost(s.disc[tookDiscard], s.avatar[i], tt, 0); k++; }
      for (; k < gained; k++) flyGhost(s.deck, s.avatar[i], null, k * 80);
      var av = seatEls[i].querySelector('.av'); if (av) { setCls(av, 'av draw' + (av.classList.contains('mirror') ? ' mirror' : '')); av.dataset.mood = 'draw'; }
    });
  }
  function bubble(p, text) {
    if (p === ME || !seatEls[p]) return;
    var b = seatEls[p].querySelector('.bubble'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  // ---------- v9.76 açıklama sözlüğü: motor/sunucu hata metinleri insan diline (tek yerden; dokunma, sürükleme, düğme ve sunucu reddi aynı cümleyi gösterir) ----------
  var ERR_TEXT = {
    'sıra çekme değil': __L("Önce bir taş çekmen gerekmiyor: elinde zaten 15 taş var, bir taş at."),
    'oynama sırası değil': __L("Şu an taş atamazsın: önce desteden ya da yandan bir taş çek."),
    'Sıra sende değil.': __L("Sıra sende değil; sıran gelince hamle yapabilirsin."),
    'talep sırası değil': __L("Bu taşı şu an alamazsın; atılan taşı yalnız sırası gelen alır."),
    'taş elinde değil': __L("Bu taş elinde değil (masadaki bir taşı seçmiş olabilirsin)."),
    'taş elde yok': __L("Bu taş elinde yok."),
    'atacak taş kalmalı': __L("Elinde atacak bir taş kalmalı: hepsini indiremezsin, son taşı atarak bitirirsin."),
    'zaten açıldı': __L("Zaten açıldın; artık yalnız masadaki perlere taş işleyebilir ya da yeni per indirebilirsin."),
    'kafa elinde açılmaz': __L("Kafa elinde yere açılmak yok: eli, açılmadan tek seferde bitirmen gerekir."),
    'geçersiz grup': __L("Seçtiğin taşlar per oluşturmuyor: seri (aynı aile, ardışık) ya da renkli (aynı sayı, farklı aile) olmalı."),
    'bu gruba uymuyor': __L("Bu taş bu pere uymuyor."),
    'açılmadan bitilmez': __L("Bitirmek için önce görevini tamamlayıp yere açılmalısın."),
    'aynı taş iki kez kullanılamaz': __L("Aynı taşı iki kez kullanamazsın."),
    'aynı taş iki grupta kullanılamaz': __L("Aynı taş iki perde birden olamaz."),
    'alınacak taş yok': __L("Yandan alınacak taş yok; desteden çek."),
    'per bulunamadı': __L("Bu per artık masada yok; ekran yenilendi."),
    'el bitti': __L("Bu el bitti; sonraki el başlayınca devam edersin."),
    'oyun başlamadı': __L("Oyun henüz başlamadı."),
    'önce odaya katıl': __L("Önce bir odaya katılmalısın."),
    'geçersiz hedef': __L("Bu hedef geçersiz; masadaki bir rakibi seç."),
    'bilinmeyen hamle': __L("Bu hamle tanınmadı; ekranı yenileyip yeniden dene."),
    'Süre doldu.': __L("Süre doldu; bu hamle için zaman bitti.")
  };
  function humanError(msg) { msg = String(msg || ''); if (ERR_TEXT[msg]) return ERR_TEXT[msg]; var k = Object.keys(ERR_TEXT); for (var i = 0; i < k.length; i++) if (msg.indexOf(k[i]) === 0) return ERR_TEXT[k[i]]; return msg; }
  // ---------- aksiyon ve bot akışı ----------
  function doAction(fn, kind, payload) {
    if (NET.online) { if (NET.pending) return; NET.pending = { kind: kind, snap: snapshot() }; NET.send(Object.assign({ t: 'act', kind: kind }, payload || {})); sel = []; return; }
    var s = snapshot();
    try { fn(); } catch (e) { toast(humanError(e.message), 'warn'); render(); return; }
    if (kind === 'draw' || kind === 'take' || kind === 'claim') sfx('draw');
    else if (kind === 'discard' || kind === 'add') sfx('place');
    else if (kind === 'open' || kind === 'lay') { sfx('place'); setTimeout(function () { sfx('place'); }, 90); }
    lastActor = ME;
    var took = null;
    while (G.phase === 'claim' && Okey.claimant(G) !== ME) {
      var cl = Okey.claimant(G), before = G.players[cl].hand.length;
      Okey.botStep(G);
      if (G.players[cl].hand.length > before) took = cl;
    }
    render();
    animateDiff(s, ME);
    var mav = seatEls[ME] && seatEls[ME].querySelector('.av');
    if (mav) { var mm = (kind === 'draw' || kind === 'take' || kind === 'claim') ? 'draw' : (kind === 'pass' ? null : 'place'); if (mm) { setCls(mav, 'av ' + mm); mav.dataset.mood = mm; } }
    if (took !== null) bubble(took, __L("O taşı alıyorum!"));
    if (kind === 'open') { toast(__L("Görev tamamlandı, açıldın!"), ''); if (!NET.online && actionRight('muhur').ok) playActionFx('muhur', ME, null); }
    if (kind === 'discard' && !NET.online && actionRight('patili').ok) { var pu = actUsed(); pu.patili = (pu.patili || 0) + 1; if (pu.patili <= 3) playActionFx('patili', ME, null); } // v9.92
    emit(kind);
    schedule();
  }
  function schedule() {
    clearTimeout(botTimer);
    if (!G) return; // v9.89: hamle içinde eğitim bitince masa kapanmış olabilir (kısa yol → Hazırsın)
    if (G && G.online === true && !NET.online) return; // v9.87: sunucudan gelen masa görünümü bağlantı bırakıldıktan sonra yerelde botlarla oynatılmaz (rakip taşları gizli: hata verirdi)
    if (G && G.tutorial && !tutorial) return; // eğitim masası ama bölüm bitti/penceresi açık: botlar bekler (bölüm sonu ekranında el bitmesin)
    if (!NET.online && prepActive()) return; // bot masasında hazırlık sürüyor (yardım/mağaza kapanınca botlar erken başlamasın); endPrep yeniden çağırır
    if (NET.online) { if (G.phase === 'handover') setTimeout(showHandOver, 900); else if ((G.phase === 'claim' ? Okey.claimant(G) : G.cp) === ME) emit('turn'); return; }
    if (G.phase === 'handover') { setTimeout(showHandOver, 900); return; }
    var actor = G.phase === 'claim' ? Okey.claimant(G) : G.cp;
    if (actor === ME) { emit('turn'); return; }
    var delay = SPEEDS[settings.speed] || 750;
    botTimer = setTimeout(function () {
      var s = snapshot();
      var openedBefore = G.players[actor].opened, tableBefore = G.table.length, phaseBefore = G.phase, logBefore = G.log.length;
      try { Okey.botStep(G); } catch (e) { console.error(e); toast(__L("Hata: {0}", [(e.message)]), 'warn'); return; }
      if (G.table.length > tableBefore) sfx('place'); else if (phaseBefore === 'pickup') sfx('draw'); else if (phaseBefore === 'play') sfx('slide');
      lastActor = actor;
      var dl = G.players[actor].discards; var discarded = (dl.length ? dl[dl.length - 1].id : null) !== s.discTop[actor];
      render();
      animateDiff(s, actor);
      if (discarded && seatEls[actor]) { var pav = seatEls[actor].querySelector('.av'); if (pav && pav.dataset.mood !== 'draw') { setCls(pav, 'av place' + (pav.classList.contains('mirror') ? ' mirror' : '')); pav.dataset.mood = 'place'; } }
      if (G.penalties && s.pen && G.penalties.join() !== s.pen) { var lg = G.log.filter(function (x) { return x.indexOf('okeyini aldı') >= 0; }); if (lg.length) toast(lg[lg.length - 1], ''); bubble(actor, __L("Okeyi aldım!")); }
      else { G.log.slice(logBefore).forEach(function (x) { if (x.indexOf('kendi okeyini') >= 0) { toast(x, ''); bubble(actor, __L("Okeyimi geri aldım")); } else if (x.indexOf('işlenebilen') >= 0) toast(x, 'warn'); }); }
      if (!openedBefore && G.players[actor].opened) { bubble(actor, __L("Yere açıldım!")); openTosWindow(actor); }
      else if (phaseBefore === 'claim' && G.phase === 'play' && G.players[actor].hand.length > s.counts[actor]) bubble(actor, __L("O taşı alıyorum!"));
      else if (phaseBefore === 'play' && G.table.length > tableBefore) bubble(actor, __L("Per indirdim"));
      if (G.phase === 'handover' && G.handOver && G.handOver.winner === actor) bubble(actor, __L("Bitti!"));
      schedule();
    }, G.phase === 'claim' ? Math.min(delay, 450) : delay);
  }

  // ---------- ekranlar ----------
  var NAVI = { lobby: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>', char: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>', shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>' };
  function navbar(on) {
    return __L("<div class=\"navbar\"><button data-nav=\"lobby\"{0}>{1}Lobi</button><button data-nav=\"char\"{2}>{3}Karakter</button><button data-nav=\"shop\"{4}>{5}Mağaza</button></div>", [(on === 'lobby' ? ' class="on"' : ''), (NAVI.lobby), (on === 'char' ? ' class="on"' : ''), (NAVI.char), (on === 'shop' ? ' class="on"' : ''), (NAVI.shop)]);
  }
  function bindNav() {
    document.querySelectorAll('[data-nav]').forEach(function (b) {
      b.onclick = function () { var n = b.dataset.nav; if (n === 'lobby') showLobby(); else if (n === 'char') showCreator(G ? backToGame : showLobby); else showStore(); };
    });
  }
  function coinsHTML() { return '<span class="coins"><i></i>' + wardrobe.coins + '<button id="coinPlus" title="Altın">+</button></span>'; }
  // ---------- çevrim içi (sunucu) ----------
  var NET = {
    ws: null, online: false, url: '', code: '', token: '', seat: 0, host: false, seats: null, pending: null, started: false,
    send: function (m) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); } catch (e) {} },
    connect: function (url, onOpen) {
      var self = this; if (self.ws) { try { self.ws.onclose = null; self.ws.close(); } catch (e) {} }
      var u = url.trim().replace(/^http/, 'ws'); if (!/^wss?:\/\//.test(u)) u = (/localhost|127\.0\.0\.1/.test(u) ? 'ws://' : 'wss://') + u;
      self.url = url.trim(); self.ws = new WebSocket(u);
      self.ws.onopen = function () { self.retry = 0; netBar(false); clearInterval(self.ka); self.ka = setInterval(function () { self.send({ t: 'ping' }); }, 25000); if (onOpen) onOpen(); }; // v9.73: 25 sn'de bir canlı tutma (boşta kalan soket kesilmesin)
      self.ws.onmessage = function (ev) { self.lastMsgAt = Date.now(); var m; try { m = JSON.parse(ev.data); } catch (e) { return; } locData(m); netMessage(m); };
      self.ws.onerror = function () { self.resuming = false; if (!(self.online && self.token)) toast(__L("Sunucuya bağlanılamadı. Adresi ve sunucunun çalıştığını kontrol et."), 'warn'); if (!self.online && !G && APP.state !== 'ONLINE' && APP.state !== 'ROOM') showTables(roomOf(lobbySel)); }; // hızlı masa bağlanamadı: boş masada bırakma, masa seçimine dön
      self.ws.onclose = function () { self.resuming = false; clearInterval(self.ka); if (self.online && self.token) { netBar(true); var wait = Math.min(10000, Math.round(1500 * Math.pow(1.6, self.retry || 0))); self.retry = (self.retry || 0) + 1; setTimeout(function () { if (self.online && self.token && !(self.ws && self.ws.readyState === 1)) self.rejoin(); }, wait); } }; // v9.73: şerit + artan bekleme (1,5 → 10 sn)
    },
    rejoin: function () { var self = this; self.rejoining = true; self.connect(self.url, function () { self.send({ t: 'join', code: self.code, token: self.token, name: (myAvatar || DEFAULT_AV).name, avatar: matchAvatar(), skins: skinCount(), acc: ACC.auth }); }); }, // v9.75: rejoining — oda yoksa gelen hata ekranı temizler
    // v9.75: oda kur / kodla katıl → sunucudan 8 sn içinde cevap (joined ya da hata) gelmezse açık uyarı; belirsiz bekleme yok
    expectJoin: function (what) { var self = this; clearTimeout(self.joinTimer); self.joinTimer = setTimeout(function () { if (self.online || APP.state === 'GAME') return; toast(__L("Sunucudan cevap gelmedi ({0}). Bağlantını kontrol edip yeniden dene.", [(what)]), 'warn', 5000); try { if (self.ws) { self.ws.onclose = null; self.ws.close(); } } catch (e) {} self.ws = null; }, 8000); },
    // v9.75: başka bir oda kurarken/katılırken eski kayıttaki başlamamış koltuk bırakılır (hayalet koltuk kalmasın)
    abandonSaved: function (exceptCode) { var sv = load('ao.net', null); if (!sv || !sv.code || !sv.token || sv.code === exceptCode || sv.started) return; this.send({ t: 'abandon', code: sv.code, token: sv.token }); try { localStorage.removeItem('ao.net'); } catch (e) {} },
    leave: function () { this.send({ t: 'leave' }); this.detach(); try { localStorage.removeItem('ao.net'); } catch (e) {} },
    leaveKeep: function () { this.send({ t: 'leave' }); var sv = load('ao.net', null); if (sv && sv.code === this.code) { sv.left = true; store('ao.net', sv); } this.detach(); }, // sosyal masadan geçici çıkış: bot oynar, lobiden geri dönülür (kayıt kalır)
    detach: function () { this.online = false; this.started = false; this.token = ''; this.code = ''; this.seats = null; this.seatKey = null; this.pending = null; this.resuming = false; this.rejoining = false; this.retry = 0; clearInterval(this.ka); clearTimeout(this.joinTimer); netBar(false); if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) {} this.ws = null; } }
  };
  function veilUntilLoaded() { // v9.73: mekân arka planı ve masa görseli (mobil veride geç yükleniyordu) gelene kadar perde; en çok 4 sn
    var v = $('tableVeil'); if (!v) return; v.classList.add('show');
    var t = themeOf(appliedTheme || settings.theme), srcs = [t.bg, t.table].filter(Boolean), left = srcs.length, done = false;
    var fin = function () { if (done) return; done = true; v.classList.remove('show'); };
    if (!left) { fin(); return; }
    srcs.forEach(function (u) { var im = new Image(); im.onload = im.onerror = function () { if (--left <= 0) fin(); }; im.src = u; });
    setTimeout(fin, 4000);
  }
  function netBar(show) { var b = $('netBar'); if (b) b.classList.toggle('show', !!show); }
  // v9.73: uygulama öne gelince (telefon kilidi, sekme değişimi) hemen yeniden bağlan ya da taze durum iste; arka planda soket kopmuş olabilir
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { NET.hiddenAt = Date.now(); return; }
    if (!NET.online || !NET.token) return;
    if (!NET.ws || NET.ws.readyState === 3) { NET.retry = 0; netBar(true); NET.rejoin(); }
    else if (NET.ws.readyState === 1 && Date.now() - (NET.hiddenAt || 0) > 8000) { var at = Date.now(); NET.send({ t: 'state' }); setTimeout(function () { if (NET.online && NET.token && (NET.lastMsgAt || 0) < at) { NET.retry = 0; netBar(true); NET.rejoin(); } }, 4000); } // v9.75: yarı ölü soket (telefon arka planda): 4 sn içinde cevap gelmezse yeniden bağlan
  });
  function restorePeeks(list) { // yeniden bağlanınca süren bakışlar: animasyon + tokat düğmesi (+ kendi bakışımsa taşlar) kalan süreyle
    PEEK.restoring = true; // v9.88: geri yüklemede ses tekrar çalmaz
    list.forEach(function (pk) {
      if (pk.from === ME) { if (!PEEK.active && pk.hand) beginPeek(pk.target, pk.hand, Date.now() + pk.left); return; }
      peekAnim(pk.from, pk.target, true);
      if (pk.target === ME) { var u = Date.now() + pk.left; PEEK.incoming = { from: pk.from, until: u }; showSlapBtn(true, pk.from); setTimeout(function () { if (PEEK.incoming && PEEK.incoming.until === u) { PEEK.incoming = null; showSlapBtn(false); } }, pk.left); }
    });
    PEEK.restoring = false;
  }
  function netMessage(m) {
    if (m.t === 'takeover') { NET.detach(); G = null; overlay(null); toast(__L("Bu hesap başka bir sekmede ya da cihazda açıldı; maç orada sürüyor. Bu ekran lobiye döndü."), 'warn', 5000); showLobby(); return; } // tek etkin bağlantı: son açılan kazanır
    if (m.t === 'error' && NET.resuming && !NET.online) { NET.leave(); G = null; overlay(null); toast(__L("Dönülecek maç artık yok: maç bitmiş ya da sunucu yenilenmiş olabilir. Kayıt silindi."), 'warn', 5000); showLobby(); return; } // eski kayıt: açıklama + temizlik
    if (m.t === 'error' && NET.rejoining && !G) { NET.rejoining = false; var wasRoom = APP.state === 'ROOM'; NET.leave(); overlay(null); toast(__L("Oda artık yok: {0} Kurucu uzun süre dönmemiş ya da sunucu yenilenmiş olabilir. Yeni oda kur ya da yeni kod iste.", [(m.msg || '')]), 'warn', 6000); if (wasRoom) showOnlineLobby(); else showLobby(); return; } // v9.75: eski oda ekranı sunucuda olmayan odayı göstermesin
    if (m.t === 'error' && NET.rejoining && G && G.online && /^Oda bulunamadı/.test(m.msg || '')) { NET.rejoining = false; NET.leave(); G = null; overlay(null); toast(__L("Bu maç sunucuda artık yok (sunucu yenilenmiş ya da maç kapanmış olabilir). Lobiye dönüldü."), 'warn', 6000); showLobby(); return; } // v9.85: maç kaydı geri yüklenemediyse donmuş masada bırakma
    if (m.t === 'error') { if (NET.rejoining) NET.rejoining = false; clearTimeout(NET.joinTimer); toast(humanError(m.msg), 'warn'); if (PULL_DEST) pullFail(); if (NET.pending) { NET.pending = null; render(); } if (PEEK.pending) { PEEK.pending = false; clearTimeout(PEEK.pendTimer); syncSkinUI(); } if (m.fatal || (!NET.online && !G && APP.state !== 'ONLINE' && APP.state !== 'ROOM' && APP.state !== 'VENUE')) { NET.leave(); showTables(roomOf(lobbySel)); } return; }
    if (m.t === 'me') { if (m.player) accApply(m.player);  return; }
    if (m.t === 'cancel') { toast(m.msg || __L("Masa iptal edildi; giriş iade edildi."), 'warn'); NET.leave(); G = null; overlay(null); showTables(roomOf(lobbySel)); return; }
    if (m.t === 'turn') { setTurn(m.actor, m.left); if (introOpen) introAutoClose(); return; } // hamle sayacı: kimin sırası, kalan süre (v9.82: hazırlık süresi dolunca da el başı penceresi kapanır)
    if (m.t === 'peek') { PEEK.charges = m.charges; if (m.blur) { var pt = $('peekTiles'); pt.classList.add('blur'); setTimeout(function () { pt.classList.remove('blur'); }, m.blur); } // v9.92: hedefin Nazar Boncuğu — ilk 2 sn bulanık
      if (ACC.player && ACC.player.freeSkins && m.free != null) ACC.player.freeSkins.bak = m.free; if (ACC.player && m.paid != null) { ACC.player.skinUses = ACC.player.skinUses || {}; ACC.player.skinUses.bak = m.paid; } beginPeek(m.target, m.hand || null, Date.now() + m.left, m.usedFree ? FREE_NOTE : (m.usedPaid ? __L("{0} Kalan: {1}", [(PAID_NOTE), (m.paid)]) : '')); return; } // sunucu onayladı: rakibin taşları (sadece bana) — v10.09 (K172, P2): taşlar 0,6 sn sonra 'peekHand' ile
    if (m.t === 'peekHand') { if (PEEK.active && PEEK.active.target === m.target) showPeekTiles(m.hand); return; }
    if (m.t === 'peekAnim') { peekAnim(m.from, m.target, true); if (m.target === ME) { var u = Date.now() + m.left; PEEK.incoming = { from: m.from, until: u }; showSlapBtn(true, m.from); setTimeout(function () { if (PEEK.incoming && PEEK.incoming.until === u) { PEEK.incoming = null; showSlapBtn(false); } }, m.left); } return; }
    if (m.t === 'slapBonus') { PEEK.charges = m.charges; toast(__L("Tokat ödülü: bu el +1 Çaktırmadan Bak hakkı."), ''); syncSkinUI(); return; } // v10.12 (K181, denge P6)
    if (m.t === 'peekEnd') { if (m.from === ME) endPeek(m.reason); else peekAnim(m.from, m.target, false); if (m.target === ME) { PEEK.incoming = null; showSlapBtn(false); } if (m.reason === 'slap') { slapAnim(m.target, m.from); if (m.from === ME) openTosWindow(m.target); } return; }
    if (m.t === 'skinInfo') { if (m.skin === 'yoklama' && m.target != null) showYoklama(m.target, m.counts || [0, 0, 0, 0]); return; } // v9.92: yalnız isteyene
    if (m.t === 'introFx') { if (G) { if (introOpen) INTRO_Q.push({ from: m.from, skin: m.skin, key: G.matchId + ':' + G.hand }); else playIntroAt(m.from, m.skin); } if (m.from === ME) { introUsed()[m.skin] = 1; INTRO_USE.at = Date.now(); emit('intro:' + m.skin); if (m.trial) setTimeout(function () { toast(__L("{0} ücretsiz denemesi kullanıldı (1/1). Beğendiysen: Mağaza → Masa Girişi.", [(INTRO_SKINS[m.skin].name)]), ''); }, 1600); } if (SKIN.open) renderSkinMenu(); return; } // v10.06 (K159)
    if (m.t === 'skinFx') { playActionFx(m.skin, m.from, m.target); if (m.from === ME && m.skin !== 'muhur') { actUsed()[m.skin] = (actUsed()[m.skin] || 0) + 1; if (m.skin === 'tos') ACT.tosWin = null; emit('action:' + m.skin); } if (SKIN.open) renderSkinMenu(); return; } // v9.91 (K116): sunucu onayladı, herkese gösteri
    if (m.t === 'joined') { NET.resuming = false; NET.rejoining = false; NET.retry = 0; clearTimeout(NET.joinTimer); netBar(false); NET.code = m.code; NET.seat = m.seat; NET.token = m.token; NET.online = true; NET.venueReturn = m.venue || null; var prevSv = load('ao.net', null); store('ao.net', { url: NET.url, code: m.code, token: m.token, venue: m.venue || null, started: !!(prevSv && prevSv.code === m.code && prevSv.started), host: !!(prevSv && prevSv.code === m.code && prevSv.host) }); if (NET.pendingInvites) { var pInv = NET.pendingInvites; NET.pendingInvites = null; NET.invites = {}; setTimeout(function () { sendInvites(pInv, m.code); }, 300); } else if (!m.venue) NET.invites = NET.invites && NET.invitesCode === m.code ? NET.invites : {}; NET.invitesCode = m.code; return; } // v10.10 (K177): "Bu grupla yeniden" / "Oyna" daveti oda kurulunca gider
    if (m.t === 'vstate' || m.t === 'vjoin' || m.t === 'vmove' || m.t === 'vleave' || m.t === 'vtables' || m.t === 'venue') { if (window.Venue) Venue.onMessage(m); return; }
    if (m.t === 'room') { if (!m.started && m.rematchOf && G && G.online) { clearInterval(NET.rmTick); NET.rematch = null; G = null; built = false; rack = []; sel = []; } // v9.76: rövanş bekleme odası — bitmiş maç temizlenir, yeni maç ilk durum gibi kurulur
      var seatKey = JSON.stringify((m.seats || []).map(function (x) { return x && [x.name, x.bot, x.avatar]; })), seatsChanged = seatKey !== NET.seatKey; NET.seatKey = seatKey; NET.seats = m.seats; NET.host = m.host === m.you; NET.started = m.started; NET.league = !!m.league; /* v9.87: lig maçı (sunucu başlarken karar verir) */ var svr = load('ao.net', null); if (svr && svr.code === m.code && (svr.started !== !!m.started || svr.host !== NET.host)) { svr.started = !!m.started; svr.host = NET.host; store('ao.net', svr); } /* v9.75: lobideki geri dönüş çubuğu oda mı maç mı bilsin */ if (m.settings && m.settings.theme) applyTheme(m.settings.theme); if (!m.started) showRoom(m); else if (built && G && !G.finished && seatsChanged) { buildTable(); render(); } return; } // v9.73: bağlantı durumu değişince karakterler yeniden çizilmez
    if (m.t === 'rematch') { // v9.76 rövanş oylaması
      if (m.dropped) { NET.rematch = null; var backD = NET.venueReturn; NET.leave(); G = null; overlay(null); toast(__L("Rövanş sensiz başladı: oy vermedin ya da bağlantın koptu. Lobiden yeni masa seçebilirsin."), 'warn', 6000); if (backD && window.Venue) { Venue.returnAfterMatch(backD); return; } showLobby(); return; }
      NET.rematch = m;
      if (m.cancelled) { toast(__L("Rövanş olmadı: yeterli \"devam\" oyu çıkmadı."), '', 5000); }
      var rmEl = document.querySelector('#overlay .ledger .rematch'); // oy satırı yerinde güncellenir (bütün defter yeniden çizilmez: dokunma anında düğme kaybolmasın)
      if (rmEl && !m.cancelled) { clearInterval(NET.rmTick); var tmp = document.createElement('div'); tmp.innerHTML = rematchHTML(); var nu = tmp.firstChild; if (nu) { rmEl.replaceWith(nu); bindRematch(); } }
      else if (G && G.finished && document.querySelector('#overlay .ledger')) showFinal();
      return;
    }
    if (m.t === 'reward') { if (m.player) accApply(m.player); showRewardLines(m.reward && m.reward.hand != null ? m.reward.hand : (G ? G.hand : 0), m.reward); return; }
    if (m.t === 'state') {
      var v = m.view; if (!v) return;
      // v9.78 (B01): bellekte önceki maç kalmışsa (maç sonu "Ana menü", maçtan çıkış, kıraathaneye dönüş) yeni maçın ilk durumu "ilk durum" sayılır:
      // masa seçimi ekranı, "koltuk boş" penceresi ve oda penceresi kapanır, masa baştan kurulur. Kimlik: sunucunun maç kimliği (matchId).
      var newMatch = !!(G && G.online === true && ((v.matchId && G.matchId !== v.matchId) || (G.finished && !v.finished)));
      var first = !G || G.online !== true || m.event === 'resync' || newMatch;
      var snap = (G && G.online && !first) ? (NET.pending ? NET.pending.snap : snapshot()) : null;
      var prevHand = G && G.online && !newMatch ? G.hand : null;
      G = v; G.online = true; APP.state = 'GAME';
      if (sel.length) sel = sel.map(function (t) { return tileById(t.id); }).filter(Boolean); // v9.79: seçim taş kimliğiyle korunur (sıra başkasındayken gelen durum seçimi siliyordu)
      if (first || (m.event === 'handStart' && G.hand !== prevHand)) { cancelDrag(); cancelPull(); if (PULL_DEST) pullFail(); }
      if (first) { rack = []; sel = []; overlay(null); built = false; screen(null); veilUntilLoaded(); if (m.event === 'handStart' || v.hand === 1) rewardByHand = {}; } // v9.76: yeni maçta (rövanş dahil) ödül satırları sıfırlanır // oda kur / kodla katıl / odaya geri dön: masa seçimi katmanı oyunun üstünde kalmasın; v9.73: görseller yüklenene kadar "Masa kuruluyor…"
      if (v.turnLeft) setTurn((v.phase === 'claim') ? null : v.cp, v.turnLeft); else if (first || m.event === 'handStart' || v.phase === 'claim' || v.phase === 'handover') setTurn(null, 0);
      if (v.turnMs) TURN.ms = v.turnMs;
      if (m.event === 'afk') { if (m.actor === ME) toast(__L("Süre doldu: senin yerine oynandı. Hamlelerinin yarısından fazlasını sunucu yaparsa maçta hükmen son sayılırsın."), 'warn', 4000); else if (G.names && G.names[m.actor]) toast(__L("{0} süresini doldurdu; yerine oynandı.", [(G.names[m.actor])]), ''); }
      if (m.event === 'handStart' && G.hand !== prevHand) { rack = []; sel = []; NET.pending = null; overlay(null); PEEK.active = null; PEEK.incoming = null; showSlapBtn(false); $('peekPanel').className = ''; NET.prepUntil = v.prepLeft ? Date.now() + v.prepLeft : 0; syncRack(true); render(); showHandIntro(false); return; }
      syncRack(first);
      render();
      if (first && v.prepLeft) { NET.prepUntil = Date.now() + v.prepLeft; if (!prepActive()) startPrep(NET.prepUntil); if (v.peeks && v.peeks.length) restorePeeks(v.peeks); } // yeniden bağlanma: hazırlık ve süren bakışlar kaldığı süreden devam eder
      if (snap) animateDiff(snap, m.actor != null ? m.actor : ME);
      if (PULL_DEST && NET.pending && (NET.pending.kind === PULL_DEST.kind)) pullDone(); // v9.80: sürükleyerek çekme onaylandı
      if (NET.pending) { var k = NET.pending.kind; NET.pending = null; if (k === 'draw' || k === 'take' || k === 'claim') sfx('draw'); else sfx('place'); if (k === 'open') toast(__L("Görev tamamlandı, açıldın!"), ''); if (k === 'swap' && m.result) toast(m.result.message, ''); if (k === 'discard' && m.result && m.result.playablePenalty) toast(__L("İşlek taş attın: +{0} ceza puanı (el sonunda puanına eklenir)", [(m.result.playablePenalty)]), 'warn'); netActFx(k, ME); emit(k); } /* v9.92: kendi atışında Patili, kendi açılışında Mühür de oynasın (önce yalnız başkalarının olaylarında oynuyordu) */
      else if (m.event === 'act' || m.event === 'bot') { if (m.actor != null) netActFx(m.kind, m.actor); if (m.kind === 'open' && m.actor != null && m.actor !== ME) openTosWindow(m.actor); if (m.kind === 'swap' && m.result) toast(m.result.message, ''); else if (G.log.length) { var lg = G.log[G.log.length - 1]; if (lg.indexOf('okeyini') >= 0 || lg.indexOf('işlenebilen') >= 0) toast(lg, ''); } sfx(m.kind === 'discard' ? 'slide' : 'place'); }
      if (m.event === 'claimTimeout' && m.actor === ME) toast(__L("Süre doldu, geçildi"), '');
      if (m.event === 'prepEnd' && prepActive() && !PEEK.active) endPrep();
      if ((m.event === 'prepEnd' || m.event === 'act' || m.event === 'bot') && introOpen) introAutoClose();
      schedule();
    }
  }
  function showOnlineLobby() {
    APP.state = 'ONLINE';
    var saved = load('ao.net', null);
    if (!settings.server && selfHosted()) settings.server = srvHost(); // kendi adresinden açıldıysa sunucu adresi otomatik
    var html = __L("<h2>Çevrim içi oda</h2><p class=\"note\">Arkadaşlarınla aynı masada oyna: biri oda kurar, diğerleri kodla katılır; boş koltuklara bot oturur.</p>{0}<div class=\"row left\"><button class=\"primary big\" id=\"nQuick\">HIZLI KATIL</button><span class=\"note\">Bekleyen oyuncularla aynı masaya oturursun; maç en geç 20 sn içinde başlar. Mod: {1} el.</span></div><div class=\"row left\"><button class=\"primary\" id=\"nCreate\">Oda kur</button><input type=\"text\" id=\"nCode\" placeholder=\"ODA KODU\" maxlength=\"4\" style=\"width:130px;text-transform:uppercase\"><button class=\"good\" id=\"nJoin\">Katıl</button></div><div class=\"row left\"><input type=\"text\" id=\"nVenue\" placeholder=\"KIRAATHANE KODU\" maxlength=\"5\" style=\"width:200px;text-transform:uppercase\"><button class=\"soft\" id=\"nVisit\">Kıraathaneye git</button><button class=\"soft\" id=\"nDisc\">🔎 Keşfet</button></div>{2}<div class=\"row\"><button class=\"soft\" id=\"nCancel\">Geri</button></div>", [(selfHosted() ? __L("<input type=\"hidden\" id=\"nUrl\" value=\"{0}\">", [(srvHost())]) : __L("<div class=\"opt\"><label>Sunucu adresi</label><input type=\"text\" id=\"nUrl\" placeholder=\"örn. dongu-sunucu.onrender.com\" value=\"{0}\"></div>", [(settings.server || '')])), (settings.mode), (saved && saved.code ? __L("<div class=\"row left\"><button class=\"soft\" id=\"nBack\">Odaya geri dön ({0})</button></div>", [(saved.code)]) : '')]);
    overlay(html);
    function urlOk() { var u = $('nUrl').value.trim(); if (!u) { toast(__L("Önce sunucu adresini yaz."), 'warn'); return null; } settings.server = u; saveSettings(); return u; }
    var av = matchAvatar();
    $('nQuick').onclick = function () { var u = urlOk(); if (!u) return; NET.expectJoin(__L("hızlı katıl")); NET.connect(u, function () { NET.send({ t: 'quick', name: av.name, avatar: av, skins: skinCount(), acc: ACC.auth, settings: { totalHands: settings.mode } }); }); };
    var doCreate = function (u) { NET.expectJoin(__L("oda kur")); NET.connect(u, function () { NET.abandonSaved(null); NET.send({ t: 'create', name: av.name, avatar: av, skins: skinCount(), acc: ACC.auth, settings: { claimTime: settings.claimTime, jokerPenalty: settings.jokerPenalty, totalHands: settings.mode, theme: settings.theme } }); }); };
    $('nCreate').onclick = function () { var u = urlOk(); if (!u) return; var sv = savedNet();
      if (sv && !sv.left && !sv.started) { // v9.75: açık odası varken ikinci oda kurulmasın (arkadaşlar eski kodda beklerken kurucu botlarla başlıyordu)
        overlay(__L("<h2>Zaten açık bir odan var</h2><p><b>{0}</b> kodlu odan sunucuda duruyor olabilir (arkadaşların bu kodla bekliyorsa oraya dön). Yeni oda kurarsan eski koddaki koltuğun boşalır ve arkadaşlarına <b>yeni kodu</b> göndermen gerekir.</p><div class=\"row\"><button class=\"primary\" id=\"dupBack\">Odama dön ({1})</button><button class=\"soft\" id=\"dupNew\">Yeni oda kur</button><button class=\"soft\" id=\"dupCancel\">Vazgeç</button></div>", [(sv.code), (sv.code)]));
        $('dupBack').onclick = function () { resumeOnline(); };
        $('dupNew').onclick = function () { doCreate(u); };
        $('dupCancel').onclick = function () { showOnlineLobby(); };
        return;
      }
      doCreate(u); };
    $('nJoin').onclick = function () { var u = urlOk(); if (!u) return; var c = $('nCode').value.trim().toUpperCase(); if (c.length !== 4) { toast(__L("4 harfli oda kodunu yaz."), 'warn'); return; } NET.expectJoin(__L("kodla katıl")); NET.connect(u, function () { NET.abandonSaved(c); var sv = savedNet(); NET.send(sv && sv.code === c && !sv.left ? { t: 'join', code: c, token: sv.token, name: av.name, avatar: av, skins: skinCount(), acc: ACC.auth } : { t: 'join', code: c, name: av.name, avatar: av, skins: skinCount(), acc: ACC.auth }); }); }; // aynı odaya yeniden katılırken koltuğun geri gelir (token)
    $('nVisit').onclick = function () { var c = $('nVenue').value.trim().toUpperCase(); if (c.length !== 5) { toast(__L("5 harfli kıraathane kodunu yaz."), 'warn'); return; } if (!ACC.on) { toast(__L("Kıraathane ziyareti için oyunu sunucu adresinden aç."), 'warn'); return; } overlay(null); if (window.Venue) Venue.visit(c); };
    $('nDisc').onclick = function () { if (!ACC.on) { toast(__L("Keşfet için oyunu sunucu adresinden aç."), 'warn'); return; } overlay(null); if (window.Venue && Venue.discover) Venue.discover('popular'); }; // v10.11 (K178)
    if ($('nBack')) $('nBack').onclick = function () { resumeOnline(); };
    $('nCancel').onclick = function () { NET.leave(); overlay(null); showTables(roomOf(lobbySel)); }; // Geri: masa seçimine dön
  }
  function showRoom(m) {
    APP.state = 'ROOM'; NET.lastRoom = m;
    var seats = m.seats.map(function (s, i) {
      var who = s ? (s.bot ? __L("<img class=\"av\" src=\"assets/bot-{0}-bust.webp\">", [(s.avatar.bot)]) : charImgHTML(s.avatar || DEFAULT_AV, 'bust', 'bust')) : '';
      return __L("<div class=\"seat{0}\"><div class=\"sav\">{1}</div><b>{2}</b><small>{3}</small></div>", [(s ? '' : ' empty'), (who), (s ? s.name : __L("Boş")), (s ? (s.bot ? __L("Bot") : (i === m.host ? __L("Oda sahibi{0}", [(s.connected ? '' : __L(" · Bağlantı yok"))]) : (s.connected ? __L("Bağlı") : __L("Bağlantı yok")))) : (m.quick ? __L("Bekleniyor…") : __L("boş")))]); // v10.09 (K171): Hızlı Katıl'da bot yazısı yok
    }).join('');
    var humans = m.seats.filter(function (s) { return s && !s.bot; }).length, hostSeat = m.host != null ? m.seats[m.host] : null;
    var paid = m.settings && m.settings.entry;
    var html = __L("{0}<div class=\"lobby\"><div class=\"linfo\"><div class=\"seats\">{1}</div><div class=\"row left\">{2}</div>{3}<div class=\"row left\"><button class=\"soft\" id=\"rLeave\">Odadan ayrıl</button><span class=\"note\">Masa, oyun başlayınca kurulur.</span></div></div></div>", [(m.rematchOf && m.quick ? __L("<h2>Rövanş · aynı masa{0}</h2><p class=\"note\">Devam diyen oyuncular koltuklarında; boş koltuklara yeni oyuncular geliyor ({1} boş).</p>", [(paid ? ' · ' + Economy.stakeOf(m.settings.stake).name : ''), (4 - humans)]) : m.quick ? __L("<h2>Hızlı Katıl{0}</h2><p class=\"note\">{1}{2}</p>{3}", [(paid ? __L(" · {0} masa", [(Economy.stakeOf(m.settings.stake).name)]) : ''), (humans >= 4 ? __L("Masa doldu · <span id=\"qLeft\">{0}</span> sn sonra başlıyor", [(Math.max(1, Math.ceil((m.startsIn || 0) / 1000)))]) : __L("Oyuncular bekleniyor: {0}/4", [(humans)])), (paid ? __L(" · girişin ({0} altın) emanette; maç sonunda havuz sıralamaya göre dağıtılır.", [(paid.toLocaleString(window.__LOC || 'tr-TR'))]) : '.'), (!paid && !m.rematchOf ? __L("<p class=\"note\">🏆 Bu masa <b>lig maçı</b>: sıran Döngü Puanı kazandırır (Liderlik).</p>") : '')]) : __L("<h2>Oda <span style=\"font-family:monospace;letter-spacing:.2em\">{0}</span></h2><p class=\"note\">Bu kodu arkadaşlarına gönder; aynı sunucu adresiyle \"Katıl\" deyip kodu yazsınlar.</p>", [(m.code)])), (seats), (m.quick ? __L("<span class=\"note\">Maç kendiliğinden başlar.</span>") : (NET.host ? __L("<button class=\"primary big\" id=\"rStart\">OYUNU BAŞLAT</button><span class=\"note\">{0}</span>", [(humans < 4 ? __L("Boş koltuk var: başlatırken sorulur — botla başlat ya da arkadaşlarını bekle.") : __L("Masa dolu, bot yok."))]) : __L("<span class=\"note\">Oda sahibinin başlatması bekleniyor…{0}</span>", [(hostSeat && !hostSeat.connected ? __L(" <b>Oda sahibi şu an bağlı değil</b>; geri dönünce başlatabilir (oda 10 dk açık kalır).") : '')]))), (!m.quick && INVITE_ON ? '<div class="row left">' + (ACC.on ? __L("<button class=\"soft\" id=\"rInvite\">👥 Davet et</button>") : '') + (NET.invites && Object.keys(NET.invites).length ? __L("<span class=\"note invst\">Davetler: {0}</span>", [(Object.keys(NET.invites).map(function (k) { var x = NET.invites[k]; return esc(x.name) + ' (' + esc(x.st) + ')'; }).join(' · '))]) : __L("<span class=\"note\">Arkadaşlarını ya da son masa arkadaşlarını çağır; kod: {0}</span>", [(esc(m.code || ''))])) + '</div>' : '')]);
    overlay(html);
    if ($('rStart')) $('rStart').onclick = function () { guard(function () {
      var emptyN = (NET.seats || []).filter(function (x) { return !x; }).length;
      if (!emptyN) { NET.send({ t: 'start' }); return; }
      // v9.75: boş koltuklara bot yalnız kurucunun açık seçimiyle
      overlay(__L("<h2>{0} koltuk boş</h2><p>Masada {1} oyuncu var. Boş koltuklara <b>bot</b> oturtup hemen başlatabilirsin ya da arkadaşlarını bekleyebilirsin. Bot oturan koltuğa sonradan insan giremez.</p><div class=\"row\"><button class=\"primary\" id=\"rFillYes\">Botla başlat ({2} bot)</button><button class=\"soft\" id=\"rFillNo\">Bekle</button></div>", [(emptyN), (humans), (emptyN)]));
      $('rFillYes').onclick = function () { this.disabled = true; NET.send({ t: 'start', fill: true }); }; // v9.78: çift dokunuş ikinci istek göndermesin
      $('rFillNo').onclick = function () { if (NET.started || APP.state === 'GAME') { overlay(null); return; } showRoom(NET.lastRoom || m); }; // v9.78 (B01): maç başladıysa eski oda penceresi geri gelmez
    }); };
    $('rLeave').onclick = function () { var back = NET.venueReturn; NET.leave(); if (back && window.Venue) { Venue.returnAfterMatch(back); return; } showLobby(); };
    if ($('rInvite')) $('rInvite').onclick = function () { showInvitePicker(); }; // v10.10 (K177)
    if (m.quick && m.startsIn != null) { var qEnd = Date.now() + m.startsIn; clearInterval(NET.qTick); NET.qTick = setInterval(function () { var el = $('qLeft'); if (!el) { clearInterval(NET.qTick); return; } el.textContent = Math.max(0, Math.ceil((qEnd - Date.now()) / 1000)); }, 500); }
  }

  // ---------- uygulama akışı: MAIN_MENU -> LOBBY -> START_CHOICE -> TUTORIAL | GAME ----------
  var APP = { state: 'MAIN_MENU', busy: false };
  function guard(fn) { if (APP.busy) return; APP.busy = true; setTimeout(function () { APP.busy = false; }, 90); fn(); } // yalnızca aynı dokunuşun çift işlenmesini önler; art arda bilinçli dokunuşlar kaybolmaz
  function stopSession() { // oturumdan çıkış: zamanlayıcılar, eğitim dinleyicileri, bot döngüsü temizlenir
    clearTimeout(botTimer); clearTimeout(claimTimer); clearTimeout(hintTimer);
    clearInterval(PEEK.tick); PEEK.prepUntil = 0; clearTimeout(PEEK.endTimer); clearTimeout(PEEK.botSlap); PEEK.active = null; PEEK.incoming = null; // v9.88: hazırlık sayacı masadan çıkınca durur (eskiden lobide sürüyor, süre dolunca boş masada hata veriyordu)
    if (SKIN && SKIN.open) closeSkinMenu(); showSlapBtn(false); if (PEEK.tut) tutSkinsCleanup();
    if (tutorial) { tutorial = null; $('coach').classList.remove('show'); document.querySelectorAll('.tut-glow').forEach(function (e) { e.classList.remove('tut-glow'); }); }
    listeners = listeners.filter(function (f) { return f !== onTutEvent; });
    if (G && G.tutorial) G = null;
    if (NET.online) { NET.leave(); G = null; }
    if (G && G.online) G = null; // v9.78 (B01): bitmiş/bırakılmış çevrim içi maç bellekte kalmasın (yeni maçın ilk durumu yanlışlıkla "devam" sanılıyordu)
  }
  function savedGame() { var s = load('ao.game', null); if (!s || !s.g) return null; try { var g = JSON.parse(s.g); return g.finished ? null : g; } catch (e) { return null; } }
  function showWelcome() { showMainMenu(); }
  function showMainMenuOld() {
    stopSession(); APP.state = 'MAIN_MENU';
    var a = normAvatar(myAvatar || DEFAULT_AV);
    var html = __L("<div class=\"menu\"><div class=\"mlogo\"></div><div class=\"mprofile\"><div class=\"mav\">{0}</div><div class=\"minfo\"><b>{1}</b><span class=\"coins\"><i></i>{2}</span>{3}{4}</div></div><div class=\"mbtns\"><button class=\"primary big\" id=\"mLobby\">LOBİ</button><button class=\"good\" id=\"mChar\">KARAKTER</button><button class=\"good\" id=\"mShop\">MAĞAZA</button><button class=\"soft\" id=\"mSettings\">AYARLAR</button></div><button class=\"link\" id=\"mTut\">Eğitim / Nasıl Oynanır?</button></div>", [(charImgHTML(a, 'on', 'full')), (a.name), (wardrobe.coins), (levelHTML()), (ACC.player && ACC.player.bonusReady ? __L("<button class=\"good\" id=\"mBonus\">🎁 Günlük bonus</button>") : '')]);
    overlay(html, 'menucard');
    $('mLobby').onclick = function () { guard(showLobby); };
    if ($('mBonus')) $('mBonus').onclick = function () { $('mBonus').disabled = true; accBonus(); };
    $('mChar').onclick = function () { guard(function () { APP.state = 'CHAR'; showCreator(showMainMenu); }); };
    $('mShop').onclick = function () { guard(function () { APP.state = 'SHOP'; showStore(); }); };
    $('mSettings').onclick = function () { guard(function () { APP.state = 'SETTINGS'; showHelp('settings'); }); };
    $('mTut').onclick = function () { guard(function () { newGame(true); }); };
  }
  function showLobbyOld() {
    stopSession(); APP.state = 'LOBBY';
    var a = normAvatar(myAvatar || DEFAULT_AV), sg = savedGame();
    var seats = [[0, a.name, 'Sen'], [1, __L("Ali"), __L("Bot")], [2, __L("Ayşe"), __L("Bot")], [3, __L("Mehmet"), __L("Bot")]].map(function (s) {
      return '<div class="seat"><div class="sav">' + (s[0] === 0 ? charImgHTML(a, 'bust', 'bust') : portrait(s[0])) + '</div><b>' + s[1] + '</b><small>' + s[2] + '</small></div>';
    }).join('');
    var html = __L("<h2>Lobi</h2><div class=\"lobby\"><div class=\"lchar\">{0}</div><div class=\"linfo\"><div class=\"tinfo\"><b id=\"lPlace\">Mekân: {1}</b><span id=\"lInfo\">{2} el · 4 oyuncu · {3} mod</span>{4}</div><div class=\"seats\">{5}</div>{6}<div class=\"modes\" id=\"lModes\">{7}</div><div class=\"row left\">{8}<button class=\"primary big\" id=\"lStart\">OYUNA BAŞLA</button><button class=\"good\" id=\"lOnline\">ÇEVRİM İÇİ ODA</button></div><div class=\"row left\"><button class=\"soft\" id=\"lBack\">Ana Menü</button></div></div></div>{9}", [(charImgHTML(a, 'on', 'full')), (themeOf(settings.theme).name), (settings.mode), (settings.assist ? __L("Yardımlı") : __L("Yardımsız")), (sg ? __L("<span>Kaydedilmiş maç: El {0} / {1}</span>", [(sg.hand), (sg.totalHands || 12)]) : ''), (seats), (themePickerHTML(themeOwned(settings.theme) ? settings.theme : 'koy')), (MODES.map(function (m) { return __L("<button data-mode=\"{0}\"{1}><b>{2}</b><small>{3}</small></button>", [(m[0]), (settings.mode === m[0] ? ' class="on"' : ''), (m[1]), (m[2])]); }).join('')), (sg ? __L("<button class=\"good\" id=\"lResume\">Kaldığım maça devam et</button>") : ''), (navbar('lobby'))]);
    overlay(html, 'menucard'); bindNav();
    $('lStart').onclick = function () { guard(showStartChoice); };
    Array.prototype.forEach.call($('lThemes').querySelectorAll('button'), function (b) {
      b.onclick = function () { if (b.disabled) return; var tt = THEMES[b.dataset.theme]; if (tt.price && !owns(tt.item)) { showStore('theme', tt.item); return; } settings.theme = b.dataset.theme; saveSettings(); applyTheme(settings.theme); Array.prototype.forEach.call($('lThemes').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); }); $('lPlace').textContent = __L("Mekân: {0}", [(themeOf(settings.theme).name)]); };
    });
    Array.prototype.forEach.call($('lModes').querySelectorAll('button'), function (b) {
      b.onclick = function () {
        settings.mode = +b.dataset.mode; saveSettings();
        Array.prototype.forEach.call($('lModes').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
        $('lInfo').textContent = __L("{0} el · 4 oyuncu · {1} mod", [(settings.mode), (settings.assist ? __L("Yardımlı") : __L("Yardımsız"))]);
      };
    });
    $('lOnline').onclick = function () { guard(showOnlineLobby); };
    $('lBack').onclick = function () { guard(showMainMenu); };
    if ($('lResume')) $('lResume').onclick = function () { guard(function () { if (restoreGame()) { APP.state = 'GAME'; overlay(null); render(); schedule(); } else showLobby(); }); };
  }
  function showStartChoice() {
    APP.state = 'START_CHOICE';
    var html = __L("<h2>Nasıl başlamak istersin?</h2><p>Döngü'yü adım adım öğrenebilir veya doğrudan masaya geçebilirsin.</p><div class=\"choice\"><button class=\"good big\" id=\"cTut\">EĞİTİMLE BAŞLA</button><small>Örnek bir masada gerçek kontrollerle öğrenirsin; puanlar kaydedilmez. İstediğin an çıkabilirsin.</small><button class=\"primary big\" id=\"cPlay\">DOĞRUDAN OYNA</button><small>{0} ellik maç ({1}) hemen başlar; sen ve üç bot.</small></div><div class=\"row\"><button class=\"soft\" id=\"cClose\">Vazgeç</button></div>", [(settings.mode), (modeName(settings.mode))]);
    overlay(html);
    $('cTut').onclick = function () { guard(function () { newGame(true); }); };
    $('cPlay').onclick = function () { if (matchMedia(__L("(pointer: coarse)")).matches && !isStandalone() && !document.fullscreenElement && settings.autoFull !== false) goFullscreen(); guard(function () { try { localStorage.removeItem('ao.game'); } catch (e) {} newGame(false); }); };
    $('cClose').onclick = function () { guard(showLobby); };
  }
  // El başı ekonomi satırı: masadaki insan sayısı → katsayı; bugünkü tam ödüllü el sayacı; antrenman
  function econIntroHTML() {
    var ec = econSummary(), C = Economy.CONFIG, txt;
    // Önce yalnız bu masada geçerli ödül; genel tablo (4 insan, tam bant) ayrı, küçük bir satırda.
    var ranks = __L("Sıralama ödülü (4 insan, tam bant): 1. {0} · 2. {1} · 3. {2} · 4. {3} altın.", [(C.handGold[0]), (C.handGold[1]), (C.handGold[2]), (C.handGold[3])]);
    if (NET.online && G.econ) {
      if (G.econ.training) { txt = __L("<b>Bu masa antrenman</b> (tek insan): her el {0} altın · {1} XP, günde {2} el (bugün {3}/{4}). Sıralama ödülü bu masada yok.", [(C.training.gold), (C.training.xp), (C.training.handsPerDay), (ec.training), (C.training.handsPerDay)]); ranks = __L("Gerçek oyuncularla masada: {0}", [(ranks)]); }
      else {
        var k = Economy.fmt(G.econ.coef), rk = C.handGold.map(function (g) { return Math.round(g * G.econ.coef); });
        txt = __L("<b>Bu masada</b> {0} insan → sıralama ödülü ×{1}: 1. {2} · 2. {3} · 3. {4} · 4. {5} altın. Bugün tam ödüllü el: {6}/{7}{8}.", [(G.econ.humans), (k), (rk[0]), (rk[1]), (rk[2]), (rk[3]), (ec.hands), (ec.fullHands), (ec.hands >= ec.fullHands ? (ec.hands >= ec.reducedHands ? __L(" (günlük ödül sınırı doldu; oyun ve görevler sürer)") : __L(" (sonraki eller %25)")) : '')]);
        ranks = G.econ.humans >= 4 ? '' : ranks;
      }
    } else { txt = __L("<b>Antrenman</b> (botlara karşı): her el {0} altın · {1} XP, günde {2} el (bugün {3}/{4}).", [(C.training.gold), (C.training.xp), (C.training.handsPerDay), (ec.training), (C.training.handsPerDay)]); ranks = __L("Gerçek ödül çevrim içi masalarda: {0}", [(ranks)]); }
    return __L("<h3>Ödül</h3><div class=\"ibox\"><p>{0}</p>{1}</div>", [(txt), (ranks ? '<p class="muted">' + ranks + '</p>' : '')]);
  }
  // Görevler paneli: günlük giriş, günlük/haftalık el görevleri, antrenman, bant durumu
  function showQuests() {
    var ec = econSummary(), C = Economy.CONFIG;
    var dq = C.dailyQuests.map(function (q, i) { var done = ec.dailyDone.indexOf(i) >= 0; return __L("<div class=\"qrow{0}\"><span>Günlük {1} uygun insan eli</span><b>{2}/{3}</b><span class=\"qr\">+{4} altın · +{5} XP{6}</span></div>", [(done ? ' done' : ''), (q[0]), (Math.min(ec.hands, q[0])), (q[0]), (q[1]), (q[2]), (done ? ' ✓' : '')]); }).join('');
    var wq = C.weeklyQuests.map(function (q, i) { var done = ec.weeklyDone.indexOf(i) >= 0; return __L("<div class=\"qrow{0}\"><span>Haftalık {1} uygun insan eli</span><b>{2}/{3}</b><span class=\"qr\">+{4} altın · +{5} XP{6}</span></div>", [(done ? ' done' : ''), (q[0]), (Math.min(ec.weekHands, q[0])), (q[0]), (q[1]), (q[2]), (done ? ' ✓' : '')]); }).join('');
    var html = __L("<div class=\"row\" style=\"justify-content:space-between;align-items:center\"><h2 style=\"margin:0\">Görevler</h2>{0}</div><div class=\"qrow login\"><span>Günlük giriş ödülü</span><b>{1}</b>{2}</div><h3>Günlük (03.00'te yenilenir)</h3>{3}<h3>Haftalık (pazartesi 03.00)</h3>{4}<p class=\"note\">Uygun el: çevrim içi masada (Hızlı Katıl, arkadaş odası, kıraathane masası) bağlı kalarak ve kendi hamlelerini yaparak bitirdiğin el. Arkadaş odasında boş koltuklara bot oturtursan ödül azalır. Bugün {5} uygun el; ilk {6} el tam ödül, {7}–{8} arası %25, sonrası ödülsüz (oyun sürer). Antrenman (botlara karşı): {9}/{10}.</p><div class=\"row\"><button class=\"soft\" id=\"qClose\">Kapat</button></div>", [(coinsHTML()), (ec.login ? __L("Alındı") : __L("+{0} altın", [(C.loginGold)])), (ec.login ? __L("<span class=\"qr\">Yarın 03.00'te yenilenir</span>") : __L("<button class=\"primary\" id=\"qLogin\">Al</button>")), (dq), (wq), (ec.hands), (ec.fullHands), (ec.fullHands), (ec.reducedHands), (ec.training), (C.training.handsPerDay)]);
    overlay(html);
    $('coinPlus').onclick = function () { showStore('altin'); };
    $('qClose').onclick = function () { overlay(null); if (G && !NET.online && G.phase !== 'handover') schedule(); if (APP.state === 'LOBBY') showLobby(); };
    if ($('qLogin')) $('qLogin').onclick = function () { guard(function () { if (ACC.on) { accBonus(); setTimeout(showQuests, 400); return; } var r = Economy.loginReward(wardrobe, Date.now()); if (r) { saveWardrobe(); sfx('place'); toast(__L("Günlük giriş ödülü: +{0} altın!", [(r.gold)]), ''); } showQuests(); }); };
  }
  function tutorialRewardNow() { // eğitimi ilk tamamlama ödülü (bir kez; sunucu hesabı varsa sunucuda)
    if (ACC.on) { if (ACC.player && ACC.player.tutorialRewarded) return; api('/api/tutorial', accBody(), function (e, r) { if (e || !r || !r.reward) return; accApply(r.player); toast(__L("Eğitim ödülü: +{0} altın · +{1} XP", [(r.reward.gold), (r.reward.xp)]), ''); if (r.reward.levelUp) setTimeout(function () { toast(__L("Seviye {0}! +{1} altın", [(r.reward.levelUp.to), (r.reward.levelUp.gold)]), ''); }, 900); }); return; }
    var rw = Economy.tutorialReward(wardrobe, Date.now()); if (!rw) return; saveWardrobe();
    toast(__L("Eğitim ödülü: +{0} altın · +{1} XP", [(rw.gold), (rw.xp)]), ''); if (rw.levelUp) setTimeout(function () { toast(__L("Seviye {0}! +{1} altın", [(rw.levelUp.to), (rw.levelUp.gold)]), ''); }, 900);
  }
  function confirmLeave(then) {
    var paid = NET.online && G && G.econ && G.econ.entry ? G.econ.entry : 0;
    if (!G || G.tutorial || G.finished || (G.phase === 'handover' && !paid)) { then(); return; }
    var html = paid
      ? __L("<h2>Bahisli maçtan çık?</h2><p><b>Dikkat:</b> çıkarsan girişin ({0} altın) havuzda kalır ve giriş kadar ceza ({1} altın) daha ödersin — toplam {2} altın. Hükmen son sıra olursun ve bu maça geri dönemezsin. Bağlantın koparsa bot senin yerine oynar; maç bitmeden dönersen ceza yoktur.</p><div class=\"row\"><button class=\"primary\" id=\"lvNo\">Vazgeç, oyna</button><button class=\"soft\" id=\"lvYes\">Çık (ceza öde)</button></div>", [(paid.toLocaleString(window.__LOC || 'tr-TR')), (paid.toLocaleString(window.__LOC || 'tr-TR')), ((2 * paid).toLocaleString(window.__LOC || 'tr-TR'))])
      : __L("<h2>Maçtan çık?</h2><p>{0}</p><div class=\"row\"><button class=\"soft\" id=\"lvNo\">Vazgeç</button><button class=\"primary\" id=\"lvYes\">Çık</button></div>", [(NET.online ? __L("Masadaki koltuğun kalır, sen yokken bot senin yerine oynar. Lobideki <b>\"Kaldığın çevrim içi maça dön\"</b> düğmesiyle maç bitmeden geri dönebilirsin. Dönmezsen ya da hamlelerinin yarısından fazlasını bot yaparsa hükmen son sayılırsın (maç bonusu yok).") : __L("Devam eden maç kaydedilir; lobiden <b>\"Kaldığın bot maçına dön\"</b> ile sürdürebilirsin."))]);
    overlay(html);
    $('lvNo').onclick = backToGame;
    $('lvYes').onclick = function () { if (NET.online) { if (paid) { NET.leave(); setTimeout(function () { if (ACC.on) api('/api/me', accBody(accProfile()), function (e, p) { if (!e && p) accApply(p); }); }, 1500); /* v10.09: ceza sunucuda düşer → lobideki altın yenilensin */ } else NET.leaveKeep(); } else saveGame(); then(); }; // sosyal masa: kayıt kalır, geri dönülebilir; bahisli: çıkış kesin (K15)
  }

  // ---------- v9.79 (madde 7): Özel El duyurusu ----------
  // Tetikleyici sunucunun/motorun onaylı kuralı: gösterge sahte okey (G.ok.fakeIsOkey). Yeni koşul yok. Akış: "Özel El!" → gösterge/sahte okey vurgusu →
  // çarpanın neye uygulandığı → üst şeritteki "Özel El · ×4" rozetine küçülür. Aynı elde bir kez (yeniden bağlanınca da tekrar etmez). Hamleyi engellemez
  // (dokunmaları kesmez, düğmeleri örtmez); bu yüzden hamle süresi etkilenmez. Deste ve göstergenin yeri değişmez (yalnız parlama).
  var SPECIAL = { key: null, timers: [], chk: null };
  function specialKey() { return G ? ((G.matchId || NET.code || 'L') + ':' + G.hand) : ''; }
  function specialText(short) {
    var r = G.rules || {}, cap = r.jokerCapturePenalty != null ? r.jokerCapturePenalty : 10;
    return short ? __L("Sahte okeyle bitiren <b>−40</b> alır; diğerlerinin kalan taş puanı <b>×4</b> yazılır. Normal taşla bitişte çarpan yok (×1).")
      : __L("Bu elde gösterge <b>sahte okey</b> çıktı: sahte okeyler okeydir (joker), her taşın yerine kullanılabilir; elde kalan sahte okey 50 taş puanıdır. Eli <b>sahte okeyle</b> bitiren <b>−40</b> alır, diğer oyuncuların <b>kalan taş puanı ×4</b> yazılır. Normal taşla bitişte çarpan yoktur (×1). <b>Cezalar çarpılmaz:</b> okey kaptırma (+{0}), işlek taş ve elde okey bırakma cezaları ×4 olmaz, sonradan ayrıca eklenir.", [(cap)]);
  }
  function maybeSpecialAnnounce() { // render içinden çağrılır; karar bir sonraki karede verilir (el başı penceresi aynı adımda açılıyor: önce o görünsün)
    if (SPECIAL.chk || !G || !G.ok || !G.ok.fakeIsOkey) return;
    SPECIAL.chk = setTimeout(function () { SPECIAL.chk = null; specialCheck(); }, 80);
  }
  function specialCheck() {
    if (!G || !G.ok || !G.ok.fakeIsOkey || G.phase === 'handover' || G.finished) return;
    if (APP.state !== 'GAME' && APP.state !== 'TUTORIAL') return;
    if ($('overlay').innerHTML || introPlaying || $('specialFx')) return; // el başı penceresi açıkken bekler (aynı bilgi pencerede de var)
    var k = specialKey(); if (SPECIAL.key === k) return;
    var sv = load('ao.special', null); SPECIAL.key = k; if (sv && sv.k === k) return; // sayfa yenilense de aynı elde bir kez
    store('ao.special', { k: k }); playSpecialAnnounce();
  }
  function playSpecialAnnounce() {
    SPECIAL.timers.forEach(clearTimeout); SPECIAL.timers = [];
    var old = $('specialFx'); if (old) old.remove();
    var fx = document.createElement('div'); fx.id = 'specialFx'; fx.className = 's1';
    fx.innerHTML = __L("<div class=\"spTitle\">Özel El!</div><div class=\"spRow\"><span class=\"spTiles\" id=\"spTiles\"></span><span class=\"spWhat\">Gösterge sahte okey çıktı → bu elde <b>sahte okeyler okey</b> (joker)</span></div><div class=\"spText\">{0} Cezalar çarpılmaz.</div><div class=\"spHint\">Açıklama: üstteki “Özel El · ×4” rozetine dokun</div>", [(specialText(true))]);
    $('stage').appendChild(fx);
    var tl = fx.querySelector('#spTiles'); tl.appendChild(tileEl({ c: 0, n: 0, fake: true, id: -1 })); var ar = document.createElement('i'); ar.textContent = '='; tl.appendChild(ar);
    var ok = document.createElement('em'); ok.textContent = __L("OKEY"); tl.appendChild(ok);
    var done = false;
    function step(cls, ms) { SPECIAL.timers.push(setTimeout(function () { if (!done && fx.isConnected) fx.className = cls; }, ms)); }
    function spot(on) { var ind = $('ind'); if (ind) ind.classList.toggle('spotlight', on); document.querySelectorAll('#rack .t.joker').forEach(function (e) { e.classList.toggle('spotlight', on); }); }
    function collapse() {
      if (done) return; done = true; SPECIAL.timers.forEach(clearTimeout); SPECIAL.timers = [];
      spot(false); fx.className = 's3 out';
      var mc = $('multChip'); if (mc) { mc.classList.remove('flash'); void mc.offsetWidth; mc.classList.add('flash'); }
      setTimeout(function () { if (fx.isConnected) fx.remove(); }, 650);
    }
    step('s2', 1300); SPECIAL.timers.push(setTimeout(function () { if (!done) spot(true); }, 1300));
    step('s3', 3600); SPECIAL.timers.push(setTimeout(collapse, 8200));
    fx.onclick = collapse; // dokununca hemen rozete küçülür
    sfx('turn');
  }
  // ---------- v9.87 (K108): lig — Döngü Puanı, aylık sezon, liderlik tablosu ----------
  function leagueSeason() { return Economy.seasonLabel(Economy.seasonKey(Date.now())); }
  function leagueAmounts(th) { var L = Economy.CONFIG.league, m = L.handsMult[th] || 1; return L.base.map(function (b) { var v = Math.round(b * m); return (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v); }); }
  function leagueRulesHTML() {
    var a6 = leagueAmounts(6), L = Economy.CONFIG.league;
    return __L("<ul class=\"lgrules\"><li><b>Lig maçı:</b> Hızlı Katıl'da Sosyal (girişsiz) masadaki her maç. Ayrı sıra beklemezsin; masaya oturduğunda maç başında \"Lig maçı\" rozeti çıkar.</li><li><b>Puan:</b> maç sonunda sırana göre 1. <b>{0}</b> · 2. <b>{1}</b> · 3. <b>{2}</b> · 4. <b>{3}</b> (6 El). 1 El {4} · 12 El {5}.</li><li>Senden yüksek puanlı rakiplere karşı kazancın biraz artar, kaybın azalır (en çok %25); düşük puanlılara karşı tersi.</li><li>Maçtan çıkan ya da maç bittiğinde bağlı olmayan <b>4.</b> sayılır. Puan 0'ın altına inmez.</li><li>Aynı oyuncularla günde en çok <b>{6} maç</b>, toplamda günde en çok <b>{7} lig maçı</b> puanlanır.</li><li>Sezon her ayın 1'inde saat 03.00'te biter, puanlar sıfırlanır; geçen sezon arşivde kalır. Altın, XP ve mekânlar etkilenmez.</li>{8}</ul>", [(a6[0]), (a6[1]), (a6[2]), (a6[3]), (leagueAmounts(1).join(' / ')), (leagueAmounts(12).join(' / ')), (L.sameGroupDaily), (L.dailyMax || 20), (L.peekOff ? __L("<li>Lig maçında <b>Çaktırmadan Bak</b> kapalı (herkes eşit şartlarda).</li>") : __L("<li><b>Çaktırmadan Bak</b> ve Yoklama lig maçında da kullanılabilir; bir elde aynı rakibe bir kez bakılır.</li>"))]);
  }
  function showLeaguePop() { // masadaki "Lig maçı" rozetine dokununca (oyunu durdurmaz)
    var old = $('leaguePop'); if (old) { old.remove(); return; }
    var sp = $('specialPop'); if (sp) sp.remove();
    var th = TH(), a = leagueAmounts(th), p = document.createElement('div'); p.id = 'leaguePop';
    var mine = ACC.player && ACC.player.league ? ACC.player.league : null;
    p.innerHTML = __L("<button class=\"x\" aria-label=\"Kapat\">✕</button><b class=\"sptl\">🏆 Lig maçı · {0}</b><ul><li>Maç sonunda sırana göre Döngü Puanı: 1. <b>{1}</b> · 2. <b>{2}</b> · 3. <b>{3}</b> · 4. <b>{4}</b> ({5} El).</li><li>Güçlü rakiplere karşı kazanç biraz artar, kayıp azalır. Maçtan çıkan 4. sayılır.</li>{6}{7}</ul>", [(leagueSeason()), (a[0]), (a[1]), (a[2]), (a[3]), (th), (Economy.CONFIG.league.peekOff ? __L("<li>Bu maçta Çaktırmadan Bak kapalı.</li>") : ''), (mine ? __L("<li>Senin puanın: <b>{0}</b> ({1} lig maçı). Liderlik tablosu lobide.</li>", [(mine.points), (mine.matches)]) : '')]);
    $('stage').appendChild(p);
    var close = function () { if (p.isConnected) p.remove(); document.removeEventListener('pointerdown', outside, true); };
    var outside = function (ev) { if (!p.contains(ev.target) && !(ev.target.closest && ev.target.closest('#leagueChip'))) close(); };
    p.querySelector('.x').onclick = close; setTimeout(function () { document.addEventListener('pointerdown', outside, true); }, 0); setTimeout(close, 12000);
  }
  function lgDays(ms) { var d = Math.max(0, ms - Date.now()), days = Math.floor(d / 86400000), h = Math.floor(d / 3600000); return days >= 1 ? __L("{0} gün", [(days)]) : (h >= 1 ? __L("{0} saat", [(h)]) : __L("bir saatten az")); }
  function lgEndText(endsAt) { var e = new Date(endsAt); if (window.DonguI18n && DonguI18n.en) return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][e.getMonth()] + ' ' + e.getDate() + ', ' + ('0' + e.getHours()).slice(-2) + ':' + ('0' + e.getMinutes()).slice(-2); return e.getDate() + ' ' + [__L("Ocak"), __L("Şubat"), __L("Mart"), __L("Nisan"), __L("Mayıs"), __L("Haziran"), __L("Temmuz"), __L("Ağustos"), __L("Eylül"), __L("Ekim"), __L("Kasım"), __L("Aralık")][e.getMonth()] + ' ' + ('0' + e.getHours()).slice(-2) + '.' + ('0' + e.getMinutes()).slice(-2); }
  function showLeaderboard() {
    APP.state = 'LEAGUE';
    var head = function (lb) { return __L("<div class=\"row\" style=\"justify-content:space-between;align-items:center\"><h2 style=\"margin:0\">Liderlik · {0}</h2>{1}</div>", [(esc(lb ? lb.label : leagueSeason())), (lb ? __L("<span class=\"note lgend\">Sezon bitimine {0} ({1})</span>", [(lgDays(lb.endsAt)), (lgEndText(lb.endsAt))]) : '')]); };
    var foot = __L("<div class=\"row\"><button class=\"soft\" id=\"lgRules\">Nasıl puan kazanılır?</button><button class=\"primary\" id=\"lgClose\">Kapat</button></div>");
    var bind = function () {
      $('lgClose').onclick = function () { overlay(null); APP.state = 'LOBBY'; showLobby(); };
      $('lgRules').onclick = function () { var r = $('lgRulesBox'); if (!r) return; r.hidden = !r.hidden; Array.prototype.forEach.call(document.querySelectorAll('#overlay .lgwrap, #overlay .lgprev, #overlay .lgempty'), function (x) { x.hidden = !r.hidden; }); this.textContent = r.hidden ? __L("Nasıl puan kazanılır?") : __L("Tabloya dön"); }; // telefonda pencere taşmasın: kurallar tablonun yerine açılır
    };
    var rulesBox = '<div id="lgRulesBox" class="lgbox" hidden>' + leagueRulesHTML() + '</div>';
    if (!ACC.on) { overlay(__L("{0}<p class=\"note\">Liderlik tablosu çevrim içi hesapla görünür: oyunu sunucu adresinden aç. Lig maçları Hızlı Katıl'da oynanır.</p><div class=\"lgbox\">{1}</div><div class=\"row\"><button class=\"primary\" id=\"lgClose\">Kapat</button></div>", [(head(null)), (leagueRulesHTML())]), 'leaguewin'); $('lgClose').onclick = function () { overlay(null); showLobby(); }; return; }
    overlay(__L("{0}<p class=\"note\" id=\"lgLoading\">Liderlik tablosu yükleniyor…</p>{1}{2}", [(head(null)), (rulesBox), (foot)]), 'leaguewin'); bind();
    api('/api/lig', accBody(), function (e, lb) {
      if (APP.state !== 'LEAGUE' || !$('lgLoading')) return; // pencere kapandı
      if (e || !lb) { $('lgLoading').textContent = __L("Liderlik tablosu alınamadı: {0}. Biraz sonra yeniden dene.", [(e ? humanError(e.message) : __L("bilinmeyen hata"))]); return; }
      var me = lb.me, rows = lb.top.map(function (x) { return __L("<tr{0}><td class=\"rk\">{1}</td><td class=\"nm\">{2}{3}</td><td><b class=\"lvb\" title=\"Seviye {4}\">{5}</b></td><td class=\"pt\">{6}</td><td>{7}</td><td>{8}</td></tr>", [(x.me ? ' class="me"' : (x.id ? __L(" class=\"tap\" data-pid=\"{0}\" data-pname=\"{1}\" data-plv=\"{2}\" data-ppts=\"{3}\" data-pm=\"{4}\" data-pw=\"{5}\" title=\"Profil · arkadaş ekle\"", [(esc(x.id)), (esc(x.name)), (x.level), (x.points), (x.matches), (x.wins)]) : '')), (x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : x.rank), (esc(x.name)), (x.me ? __L(" <small>(sen)</small>") : ''), (x.level), (x.level), (x.points), (x.matches), (x.wins)]); });
      if (me && me.rank > lb.top.length) rows.push(__L("<tr class=\"gap\"><td colspan=\"6\">…</td></tr><tr class=\"me\"><td class=\"rk\">{0}</td><td class=\"nm\">{1} <small>(sen)</small></td><td><b class=\"lvb\">{2}</b></td><td class=\"pt\">{3}</td><td>{4}</td><td>{5}</td></tr>", [(me.rank), (esc((ACC.player && ACC.player.name) || 'Sen')), (myLevel()), (me.points), (me.matches), (me.wins)]));
      var mine = me ? __L("<div class=\"lgme\">Sıran: <b>{0}</b> / {1} · <b>{2}</b> Döngü Puanı · {3} lig maçı · {4} birincilik</div>", [(me.rank), (lb.total), (me.points), (me.matches), (me.wins)])
        : __L("<div class=\"lgme\">Bu sezon henüz lig maçın yok. Hızlı Katıl'daki Sosyal (girişsiz) maçlar lig maçıdır.</div>");
      var table = lb.top.length ? __L("<div class=\"lgwrap\"><table class=\"lgtable\"><thead><tr><th>#</th><th>Oyuncu</th><th>Sv</th><th>Puan</th><th>Maç</th><th>1.</th></tr></thead><tbody>{0}</tbody></table></div>", [(rows.join(''))])
        : __L("<p class=\"note lgempty\">Bu sezon henüz kimse lig maçı bitirmedi. İlk sen ol!</p>");
      var prev = lb.prev && lb.prev.top && lb.prev.top.length ? __L("<div class=\"lgprev\">Geçen sezon ({0}): {1}</div>", [(esc(lb.prev.label)), (lb.prev.top.map(function (x) { return ['🥇', '🥈', '🥉'][x.rank - 1] + ' ' + esc(x.name) + ' ' + x.points + (x.me ? __L(" (sen)") : ''); }).join(' · '))]) : '';
      overlay(head(lb) + mine + table + prev + rulesBox + foot, 'leaguewin'); bind();
      Array.prototype.forEach.call(document.querySelectorAll('#overlay tr.tap'), function (tr) { tr.onclick = function () { showPlayerCard({ id: tr.dataset.pid, name: tr.dataset.pname, level: parseInt(tr.dataset.plv, 10), points: parseInt(tr.dataset.ppts, 10), matches: parseInt(tr.dataset.pm, 10), wins: parseInt(tr.dataset.pw, 10) }, showLeaderboard); }; }); // v10.00 (K124): satıra dokun → profil kartı + arkadaşlık düğmeleri
    });
  }
  function showPlayerCard(q, back) { // v10.00 (K124): masada olmayan oyuncunun kartı (lider tablosu): seviye, lig istatistikleri, arkadaşlık düğmeleri
    overlay(__L("<div class=\"prof\"><div class=\"pav\"><img class=\"av\" src=\"{0}ikon-liderlik.webp\" alt=\"\" style=\"object-fit:contain\">{1}</div><div class=\"pinfo\"><h2>{2}</h2><div class=\"prow\"><b>Seviye {3}</b></div><div class=\"prow\">Döngü Puanı ({4}): <b>{5}</b> · {6} lig maçı · {7} birincilik</div><div class=\"prow\"><span class=\"note\">Lider tablosundan · görünümü masada görürsün</span></div></div></div>{8}<div class=\"row\"><button class=\"primary\" id=\"pfClose\">Kapat</button></div>", [(UI), (q.level ? __L("<b class=\"lvb big\" title=\"Seviye {0}\">{1}</b>", [(q.level), (q.level)]) : ''), (esc(q.name)), (q.level || '?'), (leagueSeason()), (q.points || 0), (q.matches || 0), (q.wins || 0), (ACC.on && q.id && q.id !== ACC.auth.id ? '<div id="pfSoc" class="pfsocbox"></div>' : '')]), 'profcard');
    if ($('pfSoc')) socProfileButtons(q.id, q.name, $('pfSoc'));
    var close = function () { $('overlay').onclick = null; if (back) back(); else overlay(null); };
    $('pfClose').onclick = close; $('overlay').onclick = function (ev) { if (ev.target && ev.target.id === 'overlay') close(); };
  }
  function showSpecialPop() { // rozete dokununca: açıklamayı yeniden oku (pencere değil; oyunu durdurmaz, dokunmaları kesmez)
    if (!G || !G.ok) return; var old = $('specialPop'); if (old) { old.remove(); return; }
    var sp = !!G.ok.fakeIsOkey, p = document.createElement('div'); p.id = 'specialPop';
    var cap = (G.rules && G.rules.jokerCapturePenalty != null) ? G.rules.jokerCapturePenalty : 10;
    var items = sp ? [__L("Gösterge <b>sahte okey</b> çıktı: bu elde sahte okeyler <b>okey</b> (joker); elde kalırsa 50 taş puanı."), __L("Eli <b>sahte okeyle</b> bitiren <b>−40</b>, diğerlerinin <b>kalan taş puanı ×4</b>. Normal bitişte ×1."), __L("<b>Cezalar çarpılmaz:</b> okey kaptırma (+{0}), işlek taş, elde okey bırakma sonradan eklenir.", [(cap)])]
      : [__L("Eli <b>okeyle</b> bitiren <b>−20</b>, diğerlerinin <b>kalan taş puanı ×2</b>. Normal bitiş −10 (×1)."), __L("<b>Cezalar çarpılmaz:</b> okey kaptırma (+{0}), işlek taş, elde okey bırakma sonradan eklenir.", [(cap)]), __L("Bu elde sahte okey normal taştır (özel el değil).")];
    p.innerHTML = '<button class="x" aria-label="Kapat">✕</button><b class="sptl">' + (sp ? __L("Özel El · ×4") : __L("Bu elde çarpan · ×2")) + '</b><ul>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
    $('stage').appendChild(p);
    var close = function () { if (p.isConnected) p.remove(); document.removeEventListener('pointerdown', outside, true); };
    var outside = function (ev) { if (!p.contains(ev.target) && !(ev.target.closest && ev.target.closest('#infobar .hand'))) close(); };
    p.querySelector('.x').onclick = close; setTimeout(function () { document.addEventListener('pointerdown', outside, true); }, 0); setTimeout(close, 12000);
  }
  $('infobar').querySelector('.hand').onclick = function () { showSpecialPop(); };
  function showHandIntro(withTutorial) {
    var t = G.task, C = Okey.COLORS, ind = G.indicator, ok = G.ok;
    // 1) Elin görevi
    var taskHtml = __L("<h3>Elin görevi</h3><div class=\"ibox\"><b class=\"tname\">{0}</b><p>{1}</p><div class=\"exlist\" id=\"introEx\"></div></div>", [(t.text), (taskDesc(t))]);
    // 2) Açılma kuralı
    var openHtml = __L("<h3>Açılma kuralı</h3><div class=\"ibox\">{0}</div>", [(t.req
      ? __L("<div class=\"warnline\">İlk turda kimse açamaz.</div><p>İlk tur, masadaki dört oyuncunun da birer kez sırasını tamamlamasıdır. Görev taşların hazır olsa bile bu turda yere açamazsın. İkinci turdan itibaren, sıra sana geldiğinde taşını aldıktan sonra görevi tamamlayarak açılabilirsin.</p><p class=\"note\">İlk açılışta yalnızca görevin istediği perler, belirtilen taş sayısıyla açılır. Fazla taşların elinde kalır. Açıldığın sırada başka per indiremez veya masaya taş işleyemezsin. Bunları bir sonraki kendi sıranda yapabilirsin.</p>")
      : __L("<div class=\"warnline\">Bu elde yere açılmazsın.</div><p>Elindeki bütün taşları geçerli perler hâline getirip son taşını atarak bitirmelisin.</p>"))]);
    // 3) Gösterge / Okey / Sahte Okey
    var okHtml = __L("<h3>Gösterge / Okey / Sahte Okey</h3><div class=\"ibox\">");
    if (ok.fakeIsOkey) {
      okHtml += __L("<div class=\"irow\"><div class=\"tiles\" id=\"introInd\"></div><div><b>Gösterge: Sahte Okey</b><p>Bu elin okeyini belirler. Gösterge sahte okey çıktı.</p></div></div><div class=\"irow\"><div class=\"tiles\" id=\"introOkT\"></div><div><b>Bu elin okeyi: Sahte Okey</b><p>Bu elde sahte okey taşları jokerdir ve her taşın yerine kullanılabilir. Sahte okeyle bitiren −40 puan alır; diğer oyuncuların kalan taş puanları 4 ile çarpılır.</p></div></div>");
    } else {
      var okName = C[ok.c] + ' ' + ok.n;
      okHtml += __L("<div class=\"irow\"><div class=\"tiles\" id=\"introInd\"></div><div><b>Gösterge: {0} {1}</b><p>Bu elin okeyini belirler. Normalde göstergenin aynı ailesindeki bir sonraki sayı okey olur{2}.</p></div></div><div class=\"irow\"><div class=\"tiles\" id=\"introOkT\"></div><div><b>Bu elin okeyi: {3}</b><p>{4} taşları bu elde jokerdir; per oluştururken ihtiyacın olan herhangi bir taşın yerine kullanılabilir. Bu taşlar üzerinde \"OK\" etiketi gösterilir. <b>Son taşın okey olursa (okeyle bitiş) −20 alırsın ve rakiplerin kalan taş puanları 2 ile çarpılır (×2).</b> Bu elde sahte okeyle bitiş özel sayılmaz.</p></div></div><div class=\"irow\"><div class=\"tiles\" id=\"introFk\"></div><div><b>Sahte Okey: Bu elde {5} sayılır</b><p>Sahte okey, bu elde yalnızca normal bir {6} taşı gibi kullanılır. İstediğin başka bir taşın yerine geçmez.</p></div></div>", [(C[ind.c]), (ind.n), (ind.n === 13 ? __L("; gösterge 13 olduğu için aynı ailenin 1 taşı okeydir") : ''), (okName), (okName), (okName), (okName)]);
    }
    okHtml += '</div>';
    var special = ok.fakeIsOkey ? __L("<div class=\"special\">Özel el! Bu elde sahte okey jokerdir. Sahte okeyle bitirirsen −40 puan kazanırsın; rakiplerinin kalan taş puanları 4 kat yazılır (×4). Cezalar (okey kaptırma, işlek taş, elde okey) çarpılmaz. Üst şeritteki \"Özel El · ×4\" rozeti el boyunca hatırlatır; dokununca açıklama açılır.</div>") : __L("<div class=\"special soft\">Bu elde çarpan: okeyle bitiş ×2 (üst şeritte \"×2\" rozeti). Özel el (sahte okey ×4) değil.</div>");
    var ecoHtml = withTutorial ? '' : econIntroHTML();
    var hostHtml = (G.hostVenue && !withTutorial) ? __L("<div class=\"hostline\"><i class=\"tier k{0}\">{1}</i>{2} <small>({3})</small></div>", [(Math.min(6, Math.max(1, G.hostVenue.tier || 1))), (G.hostVenue.tier || 1), (G.hostVenue.seat == null ? __L("Bu masa <b>{0}</b> kıraathanesinde", [(esc(G.hostVenue.name))]) : __L("Ev sahibi: <b>{0}</b> · {1}", [(esc(G.hostVenue.owner || '')), (esc(G.hostVenue.name))])), (esc(G.hostVenue.tierName || ''))]) : ''; // v9.76
    var lgA = leagueAmounts(TH()), leagueHtml = (NET.online && NET.league && !withTutorial) ? __L("<div class=\"leagueline\">🏆 <b>Lig maçı</b> · maç sonunda sırana göre Döngü Puanı: {0}{1}</div>", [(lgA.join(' / ')), (Economy.CONFIG.league.peekOff ? __L(" · Çaktırmadan Bak bu maçta kapalı") : '')]) : ''; // v9.87
    var html = __L("<h2>El {0} / {1}</h2>{2}<div class=\"intro\">{3}{4}{5}{6}{7}{8}</div><div class=\"row stick\"><button class=\"primary big\" id=\"btnStart\">{9}</button></div>", [(G.hand), (TH()), (special), (leagueHtml), (hostHtml), (taskHtml), (openHtml), (okHtml), (ecoHtml), (NET.online ? __L("Masaya geç") : __L("Başla"))]);
    overlay(html, 'introcard');
    $('introInd').appendChild(tileEl(ind));
    $('introOkT').appendChild(tileEl(ok.fakeIsOkey ? { c: 0, n: 0, fake: true, id: -1 } : { c: ok.c, n: ok.n, fake: false, id: -1 }));
    if ($('introFk')) $('introFk').appendChild(tileEl({ c: 0, n: 0, fake: true, id: -1 }));
    taskExample(t, $('introEx'));
    var introAt = Date.now(); introOpen = !withTutorial && NET.online;
    $('btnStart').onclick = function () { if (Date.now() - introAt < 400) return; introOpen = false; overlay(null); render(); if (withTutorial) { startTutorial(); return; } flushIntroQ(); playIntros(function () { startPrep(NET.online ? (NET.prepUntil && Date.now() < NET.prepUntil ? NET.prepUntil : 0) : 0); }); };
  }
  // Görev açıklaması: motor verisinden (req) sade cümle üretir.
  var NUMW = { 3: __L("üç"), 4: __L("dört"), 5: __L("beş") };
  function reqPhrase(r) {
    return r[0] === 'set' ? __L("aynı sayıdan, {0} farklı aileye ait {1} taş", [(NUMW[r[1]]), (r[1])]) : __L("aynı aileden ardışık {0} taş", [(r[1])]);
  }
  function taskDesc(task) {
    if (!task.req) return __L("Bu elde görev yere açılmak değil: elindeki 14 taşın tamamını geçerli perler hâline getirip son taşını atarak elden bitirmelisin.");
    if (task.req.length === 1) return __L("Bu elde açılmak için {0} hazırlamalısın.", [(reqPhrase(task.req[0]))]);
    return __L("Bu elde açılmak için iki ayrı per hazırlamalısın: {0} ve {1}.", [(reqPhrase(task.req[0])), (reqPhrase(task.req[1]))]);
  }
  function taskExample(task, container) {
    container.innerHTML = '';
    if (!task.req) { container.innerHTML = __L("<small class=\"muted\">Örnek: 14 taşın tamamı per hâlinde, son taş atılır.</small>"); return; }
    task.req.forEach(function (r, i) {
      var ex = document.createElement('div'); ex.className = 'exitem';
      var box = document.createElement('div'); box.className = 'tiles';
      var tiles = r[0] === 'set' ? [0, 1, 2, 3].slice(0, r[1]).map(function (c) { return { c: c, n: 7, fake: false, id: -1 }; }) : [3, 4, 5, 6, 7].slice(0, r[1]).map(function (n) { return { c: i ? 2 : 0, n: n, fake: false, id: -1 }; });
      tiles.forEach(function (t) { box.appendChild(tileEl(t)); });
      var names = document.createElement('div'); names.className = 'exnames'; names.textContent = tiles.map(Okey.tileName).join(' + ');
      var cap = document.createElement('small'); cap.className = 'muted'; cap.textContent = r[0] === 'set' ? __L("Aynı sayı, {0} farklı aile", [(NUMW[r[1]])]) : __L("Aynı aile, ardışık {0} sayı", [(r[1])]);
      ex.appendChild(box); ex.appendChild(names); ex.appendChild(cap);
      container.appendChild(ex);
    });
  }

  function showHandOver() {
    if (!G || G.phase !== 'handover' || !G.handOver) return; // el bitiş penceresi gecikmeli açılır; bu arada oyun değiştiyse (yeni el/eğitim) atlanır
    if (G.handOver.winner === ME) confetti();
    if (G.tutorial) { tutHandEnded(); return; }
    if (G.finished) { zaferCheck(); showFinal(); } else showLedger(G.history.length - 1, false); // v9.92: Zafer Turu
    settleTrainingHand(G); // botlara karşı el: antrenman ödülü (günde ilk 5 el)
  }
  // Puan defteri: idx = history indeksi. live=true oyun sırasında bakma (devam eden el yok).
  function showLedger(idx, live) {
    var h = G.history[idx], last = idx === G.history.length - 1;
    var isFinalPage = G.finished && last;
    var html = __L("<div class=\"ledger{0}\"><h2>{1}</h2><div class=\"sub\">{2}</div>{3}<div class=\"nav\"><button class=\"soft\" id=\"lgPrev\"{4}>‹ Önceki</button><span>Defter: {5} el</span><button class=\"soft\" id=\"lgNext\"{6}>Sonraki ›</button></div><div id=\"lgRows\"></div></div><div id=\"lgReward\">{7}</div><p class=\"note\">El puanı = kalan taş puanı × çarpan + ek cezalar (ek cezalar çarpılmaz). Eli bitiren eksi puan alır. Sıralama {8} el toplamına göredir, eşitlikte çok el kazanan önde.</p><div class=\"row stick lgact\">{9}</div>", [(live ? ' noanim' : ''), (isFinalPage ? __L("Oyun bitti — {0}", [(h.ranks.indexOf(1) === ME ? __L("Kazandın!") : __L("{0} kazandı", [(G.names[h.ranks.indexOf(1)])]))]) : __L("El {0} / {1}", [(h.hand), (TH())])), (h.finishType), (isFinalPage ? momentHTML() + hostCardHTML() + (NET.online && !live ? rematchHTML() : '') : ''), (idx === 0 ? ' disabled' : ''), (G.history.length), (last ? ' disabled' : ''), (!live && rewardByHand[G.hand] ? rewardHTML(rewardByHand[G.hand]) : ''), (TH()), (live ? __L("<button class=\"primary\" id=\"lgClose\">Kapat</button>") : (G.finished ? (NET.online ? (NET.rematch && !NET.rematch.cancelled ? '' : __L("<button class=\"primary\" id=\"btnAgain\">Ana menü</button>")) + (ACC.on && INVITE_ON && regroupPeople().length ? __L("<button class=\"soft\" id=\"btnRegroup\" title=\"Yeni oda kurulur, masadaki oyunculara davet gider\">👥 Bu grupla yeniden</button>") : '') : __L("<button class=\"primary\" id=\"btnAgain\">Tekrar Oyna</button><button class=\"soft\" id=\"btnLobby\">Lobiye Dön</button>")) : (NET.online && !(NET.host || G.canNext) ? __L("<span class=\"note\">Sonraki el <span id=\"lgNextIn\">birazdan</span> başlıyor…</span>") : __L("<button class=\"primary\" id=\"btnNext\">Sonraki el</button>{0}", [(NET.online ? __L("<span class=\"note\">Sonraki el <span id=\"lgNextIn\">birazdan</span> kendiliğinden başlar.</span>") : '')]))))]);
    overlay(html);
    var rows = $('lgRows');
    [0, 1, 2, 3].slice().sort(function (a, b) { return h.ranks[a] - h.ranks[b]; }).forEach(function (p) {
      var d = h.detail ? h.detail[p] : { tiles: [], count: 0, base: 0, mult: 1, bonus: 0, score: h.scores[p], reasons: [] };
      var r = document.createElement('div'); r.className = 'lrow';
      r.innerHTML = portrait(p) + '<div class="nm">' + G.names[p] + '<span class="rk">' + h.ranks[p] + '.</span>' + (h.winner === p ? __L("<span class=\"w\">eli kazandı</span>") : '') + '</div>' +
        '<div class="tiles"></div><div class="why">' + (d.reasons.length ? d.reasons.join(' · ') : __L("Kalan taş yok")) + '</div>' +
        '<div class="sc"><b>' + (h.scores[p] > 0 ? '+' : '') + h.scores[p] + '</b><small>toplam ' + h.totals[p] + '</small></div>';
      var tl = r.querySelector('.tiles');
      if (d.tiles.length) d.tiles.forEach(function (t) { tl.appendChild(tileEl(t)); }); else { var n = document.createElement('span'); n.className = 'none'; n.textContent = h.winner === p ? __L("Bitirdi") : '—'; tl.appendChild(n); }
      rows.appendChild(r);
    });
    bindRematch();
    if ($('hcVisit')) $('hcVisit').onclick = function () { var code = G.hostVenue && G.hostVenue.code; if (!code) return; if (!ACC.on || !window.Venue) { toast(__L("Kıraathane ziyareti için oyunu sunucu adresinden aç."), 'warn'); return; } NET.leave(); overlay(null); G = null; Venue.visit(code); }; // v9.76: maç sonunda ev sahibinin kıraathanesine
    $('lgPrev').onclick = function () { showLedger(idx - 1, live); };
    $('lgNext').onclick = function () { showLedger(idx + 1, live); };
    if ($('lgClose')) $('lgClose').onclick = function () { overlay(null); render(); if (G.phase !== 'handover') schedule(); };
    if ($('btnNext')) $('btnNext').onclick = function () { if (NET.online) { if (NET.host || G.canNext) NET.send({ t: 'next' }); else toast(__L("Sonraki eli oda sahibi başlatır."), ''); return; } nextHand(false); };
    if ($('lgNextIn') && NET.online && G.nextIn) { var nAt = Date.now() + G.nextIn; clearInterval(NET.nextTick); NET.nextTick = setInterval(function () { var el = $('lgNextIn'); if (!el) { clearInterval(NET.nextTick); return; } var sLeft = Math.max(0, Math.ceil((nAt - Date.now()) / 1000)); el.textContent = __L("{0} sn içinde", [(sLeft)]); }, 250); }
    if ($('btnAgain')) {
      try { localStorage.removeItem('ao.game'); } catch (e) {}
      var mode = G.totalHands || 12;
      $('btnAgain').onclick = function () { if (NET.online) { var back = NET.venueReturn; NET.leave(); overlay(null); G = null; if (back && window.Venue) { Venue.returnAfterMatch(back); return; } showMainMenu(); return; } /* v9.78: kıraathaneye dönerken sonuç penceresi açık kalıyordu (ikinci dokunuş bot maçı başlatıyordu) */ guard(function () { stopSession(); settings.mode = mode; saveSettings(); newGame(false); }); }; // Tekrar Oyna: aynı modda yeni maç
      if ($('btnLobby')) $('btnLobby').onclick = function () { guard(showLobby); };
      if (h.ranks.indexOf(1) === ME) confetti();
    }
    if ($('btnRegroup')) $('btnRegroup').onclick = function () { var ppl = regroupPeople(), hands = G.totalHands, lr = NET.lastRoom, th = (lr && lr.settings && lr.settings.theme) || settings.theme; if (NET.rematch && !NET.rematch.cancelled) { try { NET.send({ t: 'rematch', yes: false }); } catch (e) {} } clearInterval(NET.rmTick); try { NET.leave(); } catch (e) {} NET.rematch = null; G = null; overlay(null); createRoomInvite(ppl, { hands: hands, theme: th }); }; // v10.10 (K177): masadaki oyuncularla yeni oda + davet (rövanş oylaması sürerken de: önce "lobi" oyu) — btnAgain bloğunun dışında (Hızlı Katıl'da oylama varken btnAgain çizilmiyor)
  }
  function rematchHTML() { // oy durumu + düğmeler; NET.rematch sunucudan (votes: koltuk başına yes/no/wait/gone/bot/null, mutlak koltuk; you: benim koltuğum)
    var rm = NET.rematch; if (!rm || rm.cancelled) return '';
    var mine = rm.votes[rm.you], names = rm.names || [];
    var rows = rm.votes.map(function (v, i) { if (v === null || v === undefined) return ''; var nm = i === rm.you ? 'Sen' : esc(names[i] || '?'); var st = v === 'yes' ? __L("✔ devam") : v === 'no' ? __L("✗ lobi") : v === 'bot' ? 'bot' : v === 'gone' ? __L("— ayrıldı") : __L("… bekliyor"); return __L("<span class=\"rv {0}\">{1} <small>{2}</small></span>", [(v), (nm), (st)]); }).join('');
    var head = mine === 'yes' ? __L("Devam oyu verdin — diğerleri bekleniyor") : __L("Aynı masayla bir maç daha?");
    var note = __L("{0} Oy vermeyen lobiye döner.", [(rm.entry ? __L("Bahisli masa: devam dersen giriş ({0} altın) yeniden emanete alınır. ", [(rm.entry.toLocaleString(window.__LOC || 'tr-TR'))]) : '') + (NET.lastRoom && NET.lastRoom.quick ? __L("Devam diyenlerle aynı masada yeni maç başlar; boşalan koltuklara yeni oyuncular oturur.") : __L("En az 2 oyuncu \"devam\" derse aynı masada yeni maç başlar; boş koltuklar oda sahibinin onayıyla botla dolar."))]);
    return __L("<div class=\"rematch\"><div class=\"rhead\"><b>{0}</b><span class=\"rleft\" id=\"rmLeft\">{1} sn</span></div><div class=\"rvotes\">{2}</div><p class=\"note\">{3}</p><div class=\"row\">{4}<button class=\"soft\" id=\"rmNo\">Lobiye dön</button></div></div>", [(head), (Math.ceil((rm.left || 0) / 1000)), (rows), (note), (mine === 'yes' ? __L("<span class=\"note\">Oyun bulunduğun masada başlayınca ekran kendiliğinden geçer.</span>") : __L("<button class=\"primary big\" id=\"rmYes\">Bu masayla devam et</button>"))]);
  }
  function bindRematch() {
    var rm = NET.rematch; if (!rm) return;
    if ($('rmYes')) $('rmYes').onclick = function () { guard(function () { NET.send({ t: 'rematch', yes: true }); }); };
    if ($('rmNo')) $('rmNo').onclick = function () { guard(function () { NET.send({ t: 'rematch', yes: false }); var back = NET.venueReturn; NET.leave(); NET.rematch = null; G = null; overlay(null); if (back && window.Venue) { Venue.returnAfterMatch(back); return; } showMainMenu(); }); };
    if ($('rmLeft') && rm.left) { var at = Date.now() + rm.left; clearInterval(NET.rmTick); NET.rmTick = setInterval(function () { var el = $('rmLeft'); if (!el) { clearInterval(NET.rmTick); return; } el.textContent = __L("{0} sn", [(Math.max(0, Math.ceil((at - Date.now()) / 1000)))]); }, 500); }
  }
  function momentHTML() { // v9.76 maçın anı: çevrim içi sunucudan (4 ekranda aynı), bot masasında motor aynı kuralla hesaplar
    var m = G.moment; if (!m && !NET.online && G.history && G.history.length) { try { m = Okey.matchMoment(Object.assign({}, G, { names: G.names.map(function (n, i) { return i === ME && n === 'Sen' ? ((myAvatar && myAvatar.name) || 'Sen') : n; }) })); } catch (e) { m = null; } }
    if (!m || !m.text) return '';
    return __L("<div class=\"moment\"><span class=\"star\"></span><span>{0}</span><small>Maçın anı</small></div>", [(esc(m.text))]);
  }
  function hostCardHTML() {
    var hv = G.hostVenue; if (!hv) return NET.online ? __L("<div class=\"hostcard\"><i class=\"tier\">·</i><div class=\"txt\"><b>Döngü masası</b><small>Masada kıraathanesi olan oyuncu yoktu. Kendi kıraathaneni kurarsan ev sahibi sen olursun.</small></div></div>") : '';
    var mine = hv.seat === ME;
    return __L("<div class=\"hostcard\"><i class=\"tier k{0}\">{1}</i><div class=\"txt\"><b>{2}</b><small>{3} · {4}</small></div><span class=\"thumb\"></span>{5}</div>", [(Math.min(6, Math.max(1, hv.tier || 1))), (hv.tier || 1), (esc(hv.name)), (hv.seat == null ? __L("Bu masa bu kıraathanedeydi") : (mine ? __L("Senin kıraathanen ev sahipliği yaptı") : __L("Ev sahibi: {0}", [(esc(hv.owner || ''))]))), (esc(hv.tierName || '')), (hv.code ? '<button class="good" id="hcVisit">' + (mine ? __L("Kıraathaneme git") : __L("Ziyaret et")) + '</button>' : '')]);
  }
  function showFinal() { showLedger(G.history.length - 1, false); }
  function confetti() {
    if (reduceMotion) return;
    var colors = ['#ff9f43', '#5aa9e6', '#43b581', '#ef6c57', '#ffd36b', '#9b6bd6'];
    for (var i = 0; i < 50; i++) {
      var c = document.createElement('div'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = colors[i % colors.length];
      c.style.animationDuration = (1.8 + Math.random() * 1.5) + 's'; c.style.animationDelay = Math.random() * .6 + 's';
      document.body.appendChild(c); (function (el) { setTimeout(function () { el.remove(); }, 4000); })(c);
    }
  }

  // ---------- karakter oluşturma ----------
  function showCreator(onDone, view) {
    view = view || 'look';
    var a = normAvatar(myAvatar || randomAvatar());
    var tab = 'face', cpose = 'on';
    if (a.full !== 'yok') tab = 'full';
    var html = __L("<h2>Karakterim</h2><div class=\"tabs\"><button data-v=\"look\"{0}>Görünüm</button><button data-v=\"ward\"{1}>Gardırop</button></div><div class=\"creator\"><div class=\"preview\" id=\"cPrev\"></div>{2}<div class=\"row\"><button class=\"soft\" id=\"cCancel\">Vazgeç</button><button class=\"primary\" id=\"cSave\">Görünümü kaydet</button></div></div>{3}", [(view === 'look' ? ' class="on"' : ''), (view === 'ward' ? ' class="on"' : ''), (view === 'look' ? __L("<div class=\"opt\"><div class=\"chips\" id=\"cPreset\"><button class=\"gp\" data-g=\"m\" title=\"Erkek\">{0}</button><button class=\"gp\" data-g=\"f\" title=\"Kadın\">{1}</button><button class=\"soft\" id=\"cRand\">Rastgele</button></div></div><div class=\"opt\"><label>İsim</label><input type=\"text\" id=\"cName\" maxlength=\"14\" placeholder=\"Adın\"></div><div class=\"opt\"><label>Masa Giriş Skinleri</label><p class=\"muted\" style=\"margin:0\">Masada sağdaki <b>Skinler</b> panelinden istediğin an kullanırsın; seçmen gerekmez.</p></div><div class=\"ctabs\" id=\"cTabs\"></div><div id=\"cOpts\"></div><p class=\"note\">Daha fazla kıyafet, saç ve aksesuar Mağaza'da. Satın alınanlar Gardırop'ta listelenir.</p>", [(charImgHTML(Object.assign({}, a, PRESET.m), 'bust', 'bust')), (charImgHTML(Object.assign({}, a, PRESET.f), 'bust', 'bust'))]) : '<div id="wardList"></div>'), (navbar('char'))]);
    overlay(html); bindNav();
    document.querySelectorAll('[data-v]').forEach(function (b) { b.onclick = function () { showCreator(onDone, b.dataset.v); }; });
    if ($('cName')) $('cName').value = a.name === 'Sen' ? '' : a.name;
    var TABS = [['full', __L("Karakter"), ['full']], ['face', __L("Yüz"), ['gender', 'skin', 'makeup']], ['hair', __L("Saç"), ['hair', 'hairColor']], ['beard', __L("Sakal & bıyık"), ['beard', 'moustache']], ['outfit', __L("Üst"), ['outfit']], ['pants', __L("Alt"), ['pants']], ['acc', __L("Aksesuar"), ['headwear', 'eyewear', 'necklace', 'earring', 'wrist', 'acc']]];
    var LABEL = { full: __L("Karakter (özel karakter seçiliyse diğer sekmeler uygulanmaz)"), gender: __L("Gövde"), skin: __L("Ten rengi"), hair: __L("Saç"), hairColor: __L("Saç rengi"), beard: __L("Sakal"), moustache: __L("Bıyık (gür/kirli sakal ve Kaptan Çapa kendi bıyığını taşır)"), outfit: __L("Üst kıyafet"), pants: __L("Alt giyim"), headwear: __L("Şapka (takılınca saç görünmez)"), eyewear: __L("Gözlük"), necklace: __L("Boyun"), earring: __L("Küpe"), wrist: __L("Bilek"), acc: __L("Eski aksesuarlar (bere, pilot gözlüğü)"), makeup: __L("Makyaj (kadın karakter)") };
    function options(k) { // ücretsiz seçenekler + sahip olunan mağaza ürünleri (kilitli olanlar da listelenir, fiyatla)
      return AV[k].filter(function (opt) { var v = typeof opt === 'string' ? opt : opt[0], gi = GARDROP[v]; return !(gi && gi.gender && gi.gender !== a.gender); }); // v9.96: yalnız kadın gövdesi çizilmiş ürünler erkek karakterde listelenmez
    }
    function draw() {
      $('cPrev').innerHTML = __L("{0}<div class=\"pose\"><button data-pose=\"on\"{1}>Ön</button><button data-pose=\"yan\"{2}>Yan</button><button data-pose=\"arka\"{3}>Arka</button></div>", [(charImgHTML(a, cpose, 'full')), (cpose === 'on' ? ' class="on"' : ''), (cpose === 'yan' ? ' class="on"' : ''), (cpose === 'arka' ? ' class="on"' : '')]);
      $('cPrev').querySelectorAll('[data-pose]').forEach(function (b) { b.onclick = function () { cpose = b.dataset.pose; draw(); }; });
      if (view === 'ward') { drawWardrobe(); return; }
      var tabs = $('cTabs'); tabs.innerHTML = '';
      TABS.forEach(function (t) { var b = document.createElement('button'); b.textContent = t[1]; if (t[0] === tab) b.className = 'on'; b.onclick = function () { tab = t[0]; draw(); }; tabs.appendChild(b); });
      var o = $('cOpts'); o.innerHTML = '';
      var keys = TABS.filter(function (t) { return t[0] === tab; })[0][2];
      keys.forEach(function (k) {
        if (k === 'makeup' && options(k).length < 2) return; // v9.96: erkek karakterde makyaj bölümü gösterilmez (yalnız kadın ürünleri var)
        var d = document.createElement('div'); d.className = 'opt'; d.innerHTML = '<label>' + LABEL[k] + '</label><div class="chips"></div>';
        var chips = d.querySelector('.chips');
        options(k).forEach(function (opt) {
          var isColor = typeof opt === 'string';
          var val = isColor ? opt : opt[0];
          var b = document.createElement('button');
          if (isColor) { b.className = 'sw'; b.style.background = opt; b.title = opt; }
          else {
            var va = Object.assign({}, a); va[k] = val; var it = catItem(k, val), locked = it && !owns(it.id);
            b.className = 'th' + (locked ? ' locked' : ''); b.innerHTML = '<div class="thav">' + charImgHTML(va, k === 'outfit' ? 'on' : (k === 'pants' || k === 'wrist') ? 'stand' : 'bust', k === 'outfit' ? 'body' : (k === 'pants' || k === 'wrist') ? 'stand' : 'bust') + '</div><span>' + opt[1] + '</span>' + (locked ? '<em class="lock">🔒 ' + (it.free ? __L("Ücretsiz") : it.price) + '</em>' : '');
          }
          if (a[k] === val) b.classList.add('on');
          b.onclick = function () { var it2 = catItem(k, val); if (it2 && !owns(it2.id)) { showStore(it2.cat, it2.id); return; } a[k] = val; if (k === 'gender' && a.gender === 'kadin' && a.beard !== 'yok') a.beard = 'yok'; sfx('tap'); draw(); };
          chips.appendChild(b);
        });
        o.appendChild(d);
      });
    }
    function drawWardrobe() {
      var w = $('wardList'); w.innerHTML = '';
      var ownedItems = CATALOG.filter(function (it) { return owns(it.id) && it.cat !== 'tiles' && it.cat !== 'theme'; });
      if (!ownedItems.length) { w.innerHTML = __L("<p class=\"muted\">Gardırobun boş. Mağazadan beğendiğin ürünü dene, satın aldığında burada görünür.</p>"); return; }
      var g = document.createElement('div'); g.className = 'grid2';
      ownedItems.forEach(function (it) {
        var worn = a[it.k] === it.val;
        var va = Object.assign({}, a); va[it.k] = it.val;
        var d = document.createElement('div'); d.className = 'item' + (worn ? ' on' : '') + (previewCls(it) === 'body' ? ' body' : previewCls(it) === 'stand' ? ' stand' : '');
        d.innerHTML = __L("<div class=\"pv\">{0}</div><div class=\"nm\">{1}</div><div class=\"pr\"><span class=\"st{2}\">{3}</span><button class=\"{4}\">{5}</button></div>", [(pvImgHTML(va, it, 92)), (it.name), (worn ? ' worn' : ''), (worn ? __L("Giyili") : __L("Sende")), (worn ? 'soft' : 'primary'), (worn ? __L("Çıkar") : __L("Giy"))]);
        d.querySelector('button').onclick = function () { a[it.k] = worn ? DEFAULT_AV[it.k] : it.val; sfx('tap'); draw(); };
        g.appendChild(d);
      });
      w.appendChild(g);
    }
    draw();
    if ($('cPreset')) {
      $('cPreset').querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { Object.assign(a, PRESET[b.dataset.g]); draw(); }; });
      $('cRand').onclick = function () { var n = a.name; a = randomAvatar(); a.name = n; draw(); };
    }
    $('cCancel').onclick = function () { if (!myAvatar) { myAvatar = normAvatar(a); store('ao.avatar', myAvatar); } overlay(null); if (onDone) onDone(); else backToGame(); };
    $('cSave').onclick = function () {
      if ($('cName')) a.name = ($('cName').value.trim() || 'Sen').slice(0, 14);
      // sahip olunmayan ürün giyilemez
      var bad = CATALOG.filter(function (it) { return it.cat !== 'tiles' && it.cat !== 'theme' && a[it.k] === it.val && !owns(it.id); });
      if (bad.length) { toast(__L("{0} gardırobunda yok; önce mağazadan al.", [(bad[0].name)]), 'warn'); return; }
      myAvatar = a; store('ao.avatar', a); accSync();
      if (NET.online) NET.send({ t: 'avatar', avatar: matchAvatar() }); // v9.73: aynı masada herkese yansır (sunucu sahiplik denetiminden geçirir)
      setMeAv(a);
      if (G) { G.names = names(); if (built) { buildTable(); render(); } }
      overlay(null);
      if (onDone) onDone(); else backToGame();
    };
  }

  // ---------- mağaza (ön izleme + deneme; ödeme sonraki aşamada) ----------
  function itemLockLv(it) { var need = Economy.itemLevel(it.id); return need && !owns(it.id) && myLevel() < need ? need : 0; } // v9.86 (K107): seviyeyle açılan kostüm (sahip olunan kilitlenmez)
  function showStore(cat, tryId) {
    cat = cat || 'all';
    if (!TRIAL && !settings.tipStore) { settings.tipStore = true; saveSettings(); setTimeout(function () { toast(__L("Mağaza: altın maçlardan ve görevlerden kazanılır; uygulamada \"Altın Al\" sekmesinden de alınabilir. \"Dene\" ücretsizdir; Masa Giriş Skinleri sahip olduğun her skin için el başına 1 Çaktırmadan Bak hakkı da verir. Karakterler kalıcı, kullanım paketleri tüketilir."), '', 7000); }, 400); } // v9.89 (K112): ilk açılışta kısa anlatım
    var base = normAvatar(myAvatar || DEFAULT_AV);
    var tryItem = tryId ? CATALOG.filter(function (it) { return it.id === tryId; })[0] : null;
    var html = __L("<div class=\"row sticky\" style=\"justify-content:space-between;align-items:center\"><h2 style=\"margin:0\">Mağaza</h2>{0}<button class=\"x\" id=\"sX\" title=\"Kapat\">✕</button></div><div class=\"ctabs\" id=\"sTabs\"></div><div id=\"sTry\"></div><div class=\"grid2\" id=\"sGrid\"></div><p class=\"note\">Altın oyun içinde kazanılır ya da mağaza uygulamasında satın alınır; paraya çevrilemez, oyun dışında değeri yoktur. Denemek kayıtlı görünümünü değiştirmez.</p><p class=\"note\"><b>Skin yeteneği (Çaktırmadan Bak):</b> Masadaki \"Skinler\" düğmesinden kullanılır. Sahip olduğun her Masa Giriş Skini el başına bir hak verir; her hak, el başındaki hazırlıkta seçtiğin rakibin elini 8 saniye görmeni sağlar. Dikkatli ol! Rakibin seni fark edip tokat atarsa bakışın hemen sona erer. (Sende her el {1} hak{2}{3}) Yeni oyuncuya her skinden 1 ücretsiz kullanım hediyedir; Masa Giriş Skinlerini \"Ücretsiz dene (1 maç)\" ile bir maçta deneyebilirsin. Hakların bitince \"Kullanım\" sekmesinden paket alabilirsin. <b>Özel karakterler</b> (Karakter sekmesi) altın ve seviyeyle alınır; sahipliği bazı skinleri kalıcı ücretsiz yapar (Bal Palyaço: hepsi). Lig maçında Çaktırmadan Bak hiçbir karakterle açılmaz.</p><div class=\"row\"><button class=\"soft\" id=\"sClose\">{4}</button></div>{5}", [(coinsHTML()), (skinCount()), (freeLeft('bak') ? __L(" + 1 ücretsiz kullanım") : ''), (paidLeft('bak') ? __L(" + {0} satın alınmış kullanım", [(paidLeft('bak'))]) : ''), (G ? __L("Oyuna dön") : __L("Kapat")), (navbar('shop'))]);
    overlay(html); bindNav();
    $('sClose').onclick = $('sX').onclick = function () { if (TRIAL) { leaveTutorial(false); return; } backToGame(); };
    $('coinPlus').onclick = function () { showStore('altin'); };
    var tabs = $('sTabs');
    [['all', __L("Tümü")], ['altin', __L("Altın Al")], ['character', __L("Karakter")], ['intro', __L("Masa Girişi")], ['action', __L("Aksiyon")], ['uses', __L("Kullanım")], ['tiles', __L("Taşlar")], ['outfit', __L("Üst")], ['pants', __L("Alt")], ['hair', __L("Saç")], ['beard', __L("Sakal & bıyık")], ['face', __L("Yüz")], ['acc', __L("Aksesuar")]].forEach(function (t) {
      var b = document.createElement('button'); b.textContent = t[1]; if (t[0] === cat) b.className = 'on'; b.onclick = function () { showStore(t[0], tryId); if (tutorial) setTimeout(showTutStep, 30); }; tabs.appendChild(b);
    });
    var tr = $('sTry');
    if (tryItem) {
      var va = pvAvatar(base, tryItem);
      var isTile = tryItem.cat === 'tiles', isTheme = tryItem.cat === 'theme', isIntro = tryItem.cat === 'intro', isUses = tryItem.cat === 'uses', isChar = tryItem.cat === 'character', isAct = tryItem.cat === 'action', actDef = isAct ? ACTION_SKINS[tryItem.val] : null, chDef = isChar ? Economy.charOf(tryItem.id) : null, gbTry = isIntro ? grantedBy(tryItem.val) : null;
      var has = (!isUses && owns(tryItem.id)) || !!(TRIAL && TRIAL.owned[tryItem.id]), worn = isTile ? (settings.tileSkin || 'dongu') === tryItem.val : isTheme ? settings.theme === tryItem.val : (isIntro && TRIAL ? TRIAL.worn === tryItem.val : base[tryItem.k] === tryItem.val);
      var GA = function (vis, adv) { return __L("<div class=\"garows\"><div class=\"garow\"><span class=\"gav\">Görsel</span><b>{0}</b></div><div class=\"garow\"><span class=\"gaa\">Avantaj</span><b>{1}</b></div></div>", [(vis), (adv)]); }; // v10.09 (K172, denge P4): satın almadan önce görsel ile avantaj ayrı
      var INTRO_GRANT = isChar && chDef ? chDef.grants.filter(function (g) { return !!INTRO_SKINS[g]; }).length : 0;
      var gaChar = isChar && chDef ? GA(__L("Masada, kıraathanede ve mağazada bu karakter; kendi hareketleri ve sesi"), chDef.allSkins ? __L("Bütün Masa Giriş Skinleri ücretsiz → her el 5 Çaktırmadan Bak hakkı (her rakibe 1 bakış + tokatla kesilene 2 yedek)") : (chDef.grants.length ? __L("Ücretsiz: {0}{1}", [(chDef.grants.map(skinNameOf).join(', ')), (INTRO_GRANT ? __L(" (el başına +{0} Çaktırmadan Bak hakkı)", [(INTRO_GRANT)]) : '')]) : __L("Yok — yalnız görsel"))) : '';
      var gaAct = isAct && actDef ? GA(__L("Masada herkesin gördüğü hareket ve efekt"), actDef.cat === 'info' ? __L("Bilgi: seçtiğin rakibin renk dağılımını 4 sn görürsün") : actDef.cat === 'guard' ? __L("Savunma: sana bakan rakip ilk 2 sn bulanık görür") : __L("Yok — yalnız görsel")) : '';
      var charExtra = isChar && chDef ? __L("<div class=\"chinfo\">{0}{1}<div class=\"chrow\"><span>Gereken seviye</span><b>{2}{3}</b></div><div class=\"chrow\"><span>Fiyat</span><b>{4} altın</b></div><div class=\"chrow\"><span>Ücretsiz skinler</span><b>{5}</b></div><p class=\"note\">Satın alınca kalıcı; karakteri kuşanmasan da skin hakkı sende kalır. Sonradan eklenecek skinler bu avantaja dahil değildir.</p></div>", [(gaChar), (CHAR_INFO[tryItem.val] ? '<p class="note">' + CHAR_INFO[tryItem.val].blurb + '</p>' : ''), (chDef.level), (myLevel() >= chDef.level ? ' ✓' : __L(" (sen: {0})", [(myLevel())])), (chDef.price.toLocaleString(window.__LOC || 'tr-TR')), (chDef.allSkins ? __L("Mevcut bütün aksiyon skinleri (4 Masa Giriş Skini + Çaktırmadan Bak her el en çok hak)") : chDef.grants.length ? chDef.grants.map(skinNameOf).join(', ') : __L("yok (karaktere özgü skin eklenince bu karakterle ücretsiz olur)"))]) : '';
      var actExtra = isAct && actDef ? __L("<div class=\"chinfo\">{0}<p class=\"note\">{1}</p><div class=\"chrow\"><span>Ne zaman</span><b>{2}</b></div><div class=\"chrow\"><span>Hak</span><b>{3}</b></div><ol class=\"introSteps\">{4}</ol><p class=\"note\">{5}</p></div>", [(gaAct), (actDef.desc), (actDef.when), (owns(tryItem.id) ? (grantedBy(tryItem.val) ? __L("Karakter avantajıyla ücretsiz") : __L("Sende · sınırsız (el başına sınır)")) : (freeLeft(tryItem.val) ? __L("1 ücretsiz deneme (maçta Skinler panelinden)") : __L("Mağazadan al"))), (actDef.steps.map(function (t, i) { return '<li><b>' + [__L("Başlangıç"), __L("Hareket"), __L("Bitiş")][i] + '</b><span>' + t + '</span></li>'; }).join('')), (actDef.cat === 'info' || actDef.cat === 'guard' ? __L("Lig maçında da kullanılabilir.") : __L("Yalnız görsel; rakibin taşları hakkında bilgi vermez. Lig maçında da kullanılabilir."))]) : '';
      var usesExtra = isUses ? __L("<div class=\"chinfo\">{0}<div class=\"chrow\"><span>Paket</span><b>{1} kullanım · {2}</b></div><div class=\"chrow\"><span>Elinde</span><b>{3} kullanım</b></div><p class=\"note\">Yalnız el başındaki hazırlık süresinde, seçtiğin rakibin elini 8 sn gösterir; bir elde aynı rakibe bir kez (tokatla kesilirse yeniden denenebilir). Sıra: önce el hakkı, sonra ücretsiz deneme, sonra bu kullanımlar. Lig maçında da kullanılabilir. Yakalanırsan hak geri gelmez.</p></div>", [(GA(__L("Yok — masada rakipler senin eğildiğini görür"), __L("Seçtiğin rakibin elini 8 sn görürsün (el başı hazırlıkta)"))), (tryItem.uses), (skinNameOf(tryItem.skin)), (paidLeft(tryItem.skin))]) : '';
      var introExtra = isIntro ? __L("<div class=\"chinfo\">{0}{1}<p class=\"note\">Önizleme hak harcamaz. Masada: sağdaki Skinler panelinden istediğin an \"Kullan\" — o an bütün oyunculara oynar (her el 1 kez). Sahip olduğun her Masa Giriş Skini el başına 1 Çaktırmadan Bak hakkı da verir (en çok 5).</p></div>", [(GA(__L("Masada istediğin an bütün oyunculara oynayan gösteri (her el 1 kez)"), __L("El başına +1 Çaktırmadan Bak hakkı (en çok 5; bir elde aynı rakibe 1 bakış)"))), (introStepsHTML(tryItem.val))]) : '';
      tr.innerHTML = __L("<div class=\"tryon{0}{1}{2}\"><div class=\"pv\">{3}</div><div class=\"info\"><b>{4}</b><span>{5} · {6}{7}</span>{8}{9}{10}{11}{12}</div></div><div class=\"row left acts\" id=\"sActs\">{13}{14}{15}<button class=\"soft\" id=\"sTryOff\">Kapat</button></div>", [(isTile ? ' tiles' : ''), (isTheme ? ' tiles' : ''), (isIntro ? ' intro' : ''), (isAct ? __L("<div class=\"fxPv\" style=\"--skc:{0}\">{1}</div>", [(actDef.color), (fxSpriteFit(actDef.fx, 84))]) : isUses ? '<div class="usesPv">👀<b>×' + tryItem.uses + '</b></div>' : isChar && CHAR_INFO[tryItem.val] ? __L("<div class=\"chPv\" id=\"chPv\">{0}<div class=\"walk\" hidden style=\"background-image:url({1})\"></div></div>", [(charImgHTML(va, 'on', 'body')), (CHAR_INFO[tryItem.val].walk)]) : isIntro ? __L("<div class=\"introPv\" id=\"introPv\" style=\"--skc:{0}\"><span class=\"avw\">{1}</span>{2}</div>", [(INTRO_ART[tryItem.val] ? INTRO_ART[tryItem.val].color : '#fff'), (charImgHTML(base, 'bust', 'bust')), (introArtHTML(tryItem.val))]) : isTheme ? __L("<img src=\"{0}\" style=\"width:100%;height:100%;object-fit:cover\" alt=\"\">", [(THEMES[tryItem.val].preview)]) : isTile ? tilePreviewHTML(tryItem.val) : pvImgHTML(va, tryItem, 84)), (tryItem.name), (CAT_NAMES[tryItem.cat]), (gbTry ? __L("<span class=\"badge\">Karakter avantajıyla ücretsiz</span>") : tryItem.free ? __L("<span class=\"badge\">Ücretsiz</span>") : '<span class="coins" style="padding:1px 8px 1px 4px"><i style="width:14px;height:14px"></i>' + tryItem.price + '</span>'), (has ? '<span class="badge">' + (worn && !isIntro ? (isTile || isTheme ? __L("Kullanılıyor") : (isChar ? __L("Kuşanıldı") : __L("Giyili"))) : __L("Sende")) + '</span>' : ''), (charExtra), (usesExtra), (introExtra), (actExtra), (tryItem.gardrop && GARDROP[tryItem.val] && GARDROP[tryItem.val].gender ? __L("<div class=\"chinfo\"><p class=\"note\">Yalnız kadın karakterde görünür; erkek gövdede çizilmez (önizleme kadın gövdeyle).</p></div>") : ''), (isIntro ? __L("<button class=\"soft\" id=\"sPreview\">▶ Önizle</button>") : ''), (isChar && CHAR_INFO[tryItem.val] ? __L("<button class=\"soft\" id=\"sWalk\">▶ Yürüyüş</button><button class=\"soft\" id=\"sPlay\" hidden>▶ Oynat</button>") : ''), (has ? (isIntro ? __L("<span class=\"badge\" style=\"align-self:center\">Sende · masada Skinler panelinden istediğin an kullan</span>") : '<button class="primary" id="sWear">' + (worn ? (isTile ? __L("Döngü taşlarına dön") : isTheme ? __L("Köy Meydanı'na dön") : (isChar ? __L("Kendi karakterime dön") : __L("Çıkar"))) : (isTile || isTheme ? __L("Kullan") : (isChar ? __L("Kuşan") : __L("Giy")))) + '</button>') : (itemLockLv(tryItem) && !TRIAL ? __L("<button class=\"primary\" id=\"sBuyLv\" disabled>Seviye {0} olunca açılır · {1} altın</button>", [(itemLockLv(tryItem)), (tryItem.price)]) : '<button class="primary" id="sBuy">' + (tryItem.free ? __L("Ücretsiz Al") : (TRIAL ? __L("Satın al (deneme)") : (isUses ? __L("Satın al · {0} altın", [(tryItem.price)]) : __L("Satın al")))) + '</button>') + (isIntro && !TRIAL && !has && freeLeft(tryItem.val) > 0 ? __L("<span class=\"badge\" style=\"align-self:center\">1 ücretsiz deneme · masada Skinler → Dene</span>") : ''))]); /* v9.94 (K120): eylem düğümeleri panelin altında ayrı satırda; telefonda yapışkan (açıklama kayar, düğmeler görünür) */
      if ($('sBuy')) $('sBuy').onclick = function () {
        if (TRIAL) { TRIAL.owned[tryItem.id] = true; if (tryItem.cat === 'intro' && !TRIAL.worn) TRIAL.worn = tryItem.val; sfx('place'); toast(__L("Eğitim: deneme satın alma — bakiyen değişmedi."), ''); emit('buy:trial'); showStore(cat, tryId); return; }
        var btn = this; if (btn.disabled) return; btn.disabled = true; // v9.88: çift dokunma tek işlem (sunucuda ayrıca işlem kimliği)
        if (isUses) { // tüketilebilir kullanım paketi (tekrar alınabilir)
          var afterU = function () { sfx('place'); toast(__L("{0} kullanım eklendi: {1} · elinde {2} kullanım.", [(tryItem.uses), (skinNameOf(tryItem.skin)), (paidLeft(tryItem.skin))]), ''); showStore(cat, tryId); };
          if (ACC.on) { accBuy(tryItem, function (e) { if (e) { btn.disabled = false; return; } afterU(); }); return; }
          if (wardrobe.coins < tryItem.price) { toast(__L("Yeterli altın yok."), 'warn'); btn.disabled = false; return; }
          wardrobe.coins -= tryItem.price; wardrobe.skinUses = wardrobe.skinUses || {}; wardrobe.skinUses[tryItem.skin] = (wardrobe.skinUses[tryItem.skin] || 0) + tryItem.uses; saveWardrobe(); afterU(); return;
        }
        if (owns(tryItem.id)) { toast(__L("Bu ürün zaten sende."), ''); btn.disabled = false; return; }
        var after = function () { sfx('place'); if (isChar) { var g0 = Economy.charOf(tryItem.id); toast(__L("{0} alındı. {1} \"Kuşan\" ile masaya çıkar.", [(tryItem.name), (g0 && g0.allSkins ? __L("Mevcut bütün aksiyon skinleri artık ücretsiz.") : g0 ? __L("Artık ücretsiz: {0}.", [(g0.grants.map(skinNameOf).join(', '))]) : '')]), '', 5000); showStore(cat, tryId); return; } if (tryItem.cat === 'intro' && !(normAvatar(myAvatar || DEFAULT_AV).intro)) { myAvatar = normAvatar(myAvatar || DEFAULT_AV); myAvatar.intro = tryItem.val; store('ao.avatar', myAvatar); accSync(); toast(__L("{0} alındı: masada Skinler panelinden istediğin an kullan (her el 1 kez).", [(tryItem.name)]), '', 4000); } else toast(__L("{0} gardırobuna eklendi.", [(tryItem.name)]), ''); showStore(cat, tryId); };
        if (ACC.on) { accBuy(tryItem, function (e) { if (e) { btn.disabled = false; return; } after(); }); return; }
        if (!tryItem.free) { if (wardrobe.coins < tryItem.price) { toast(__L("Yeterli altın yok."), 'warn'); btn.disabled = false; return; } if (itemLockLv(tryItem)) { toast(__L("Seviye {0} gerekir.", [(itemLockLv(tryItem))]), 'warn'); btn.disabled = false; return; } wardrobe.coins -= tryItem.price; }
        wardrobe.owned.push(tryItem.id); saveWardrobe(); after();
      };
      if (isChar && window.Rig && $('chPv')) (function (host, char) { Rig.load(char).then(function (def) { if (!def || !host.isConnected || $('chPv') !== host || host.classList.contains('rig')) return; var ty = tr.querySelector('.tryon'); if (ty) ty.classList.add('rigpv'); var inst = Rig.mount(host, char, 'on', { reduce: !!settings.reduceMotion }); var pb = $('sPlay'); if (pb) { pb.hidden = false; var seq = ['selam', { fikret: 'cay_servisi', sakir: 'tos', muhtar: 'muhur_vur', pamuk: 'pati', nine: 'yoklama_kulak', ordek: 'intro_ortayi_kokla', palyaco: 'intro_gosterissiz_numara' }[char] || 'tepki', 'tepki'], si = 0; pb.onclick = function () { if (inst.clip) return; Rig.play(inst, Rig.CLIPS[seq[si++ % seq.length]]); pb.textContent = __L("▶ Tekrar oynat"); emit('preview'); }; } }); })($('chPv'), tryItem.val); // v9.97: rig'li karakterde büyük parçalı önizleme (nefes/göz kırpma) + Oynat: selam → Çay Servisi → tepki
      if ($('sWalk')) $('sWalk').onclick = function () { var w = $('chPv') && $('chPv').querySelector('.walk'); if (!w) return; w.hidden = !w.hidden; $('chPv').classList.toggle('walking', !w.hidden); this.textContent = w.hidden ? __L("▶ Yürüyüş") : __L("■ Durdur"); emit('preview'); }; // v9.88: hareketli önizleme (kıraathane yürüyüş şeridi, 6 kare); hak harcamaz
      if ($('sPreview')) $('sPreview').onclick = function () { playIntroOn($('introPv'), tryItem.val, { x: 1, y: 0 }); emit('preview'); }; // mağaza önizlemesi sınırsız; maç başı hakkına dahil değil
      if ($('sWear')) $('sWear').onclick = function () {
        if (isIntro && TRIAL) { TRIAL.worn = tryItem.val; sfx('place'); emit('wear:trial'); showStore(cat, tryId); return; }
        if (isIntro) { myAvatar = normAvatar(myAvatar || DEFAULT_AV); myAvatar.intro = tryItem.val; store('ao.avatar', myAvatar); accSync(); sfx('place'); toast(__L("{0} sende: masada Skinler panelinden istediğin an kullan.", [(tryItem.name)]), ''); showStore(cat, tryId); return; }
        if (isTile) { settings.tileSkin = worn ? 'dongu' : tryItem.val; saveSettings(); applyTileSkin(); sfx('place'); showStore(cat, tryId); return; }
        if (isTheme) { settings.theme = worn ? 'koy' : tryItem.val; saveSettings(); applyTheme(settings.theme); sfx('place'); showStore(cat, tryId); return; }
        myAvatar = normAvatar(myAvatar || DEFAULT_AV); myAvatar[tryItem.k] = worn ? DEFAULT_AV[tryItem.k] : tryItem.val; store('ao.avatar', myAvatar);
        setMeAv(myAvatar); if (G && built) { buildTable(); render(); }
        showStore(cat, tryId);
      };
      $('sTryOff').onclick = function () { showStore(cat, null); };
    }
    var grid = $('sGrid');
    if (cat === 'altin') { renderGoldStore(grid); return; } // v10.03 (K140)
    CATALOG.filter(function (it) { return cat === 'all' || it.cat === cat; }).forEach(function (it) {
      var va = pvAvatar(base, it);
      var isT = it.cat === 'tiles', isTh = it.cat === 'theme', isIn = it.cat === 'intro', isU = it.cat === 'uses', isC = it.cat === 'character', isA = it.cat === 'action', gbIt = isIn ? grantedBy(it.val) : null, chIt = isC ? Economy.charOf(it.id) : null;
      var has = (!isU && owns(it.id)) || !!(TRIAL && TRIAL.owned[it.id]), worn = isT ? (settings.tileSkin || 'dongu') === it.val : isTh ? settings.theme === it.val : (isIn && TRIAL ? TRIAL.worn === it.val : base[it.k] === it.val);
      var d = document.createElement('div'); d.className = 'item' + (tryId === it.id ? ' on' : '') + (previewCls(it) === 'body' && !isT && !isTh && !isIn ? ' body' : '') + (previewCls(it) === 'stand' ? ' stand' : '') + (isT || isTh ? ' tiles' : '');
      d.innerHTML = __L("{0}<div class=\"pv\">{1}</div><div class=\"nm\">{2}{3}</div><div class=\"pr\">{4}<button class=\"soft\">Dene</button></div>", [(it.isNew ? '<i class="newtag"></i>' : ''), (isA ? __L("<div class=\"fxPv\" style=\"--skc:{0}\">{1}</div>", [(ACTION_SKINS[it.val].color), (fxSpriteFit(ACTION_SKINS[it.val].fx, 88))]) : isU ? '<div class="usesPv">👀<b>×' + it.uses + '</b></div>' : isIn ? __L("<div class=\"introCard\" style=\"--skc:{0}\">{1}{2}<i class=\"introTag\">▶</i></div>", [(INTRO_ART[it.val] ? INTRO_ART[it.val].color : '#fff'), (charImgHTML(base, 'bust', 'bust framed', pvStyle(null, 92))), (introArtHTML(it.val))]) : isTh ? __L("<img src=\"{0}\" style=\"width:100%;height:100%;object-fit:cover\" alt=\"\">", [(THEMES[it.val].preview)]) : isT ? tilePreviewHTML(it.val) : (isC && charPortrait(it.val) ? __L("<img class=\"portre\" src=\"{0}\" alt=\"\">", [(charPortrait(it.val))]) : pvImgHTML(va, it, 92))), (it.name), (isIn ? '<small class="sub">' + INTRO_SKINS[it.val].desc + '</small>' : isC && chIt ? __L("<small class=\"sub\">Seviye {0} · {1}</small>", [(chIt.level), (chIt.allSkins ? __L("bütün aksiyon skinleri ücretsiz") : chIt.grants.length ? __L("ücretsiz: {0}", [(chIt.grants.map(skinNameOf).join(', '))]) : __L("kendi girişi ve sesi; skin hakkı yok"))]) : isU ? __L("<small class=\"sub\">{0} kullanım · elinde {1}</small>", [(it.uses), (paidLeft(it.skin))]) : isA ? '<small class="sub">' + ACTION_SKINS[it.val].when + ' — ' + ACTION_SKINS[it.val].desc.split('.')[0] + '.</small>' : (it.gardrop && GARDROP[it.val] && GARDROP[it.val].gender ? __L("<small class=\"sub\">Kadın karakter için</small>") : '')), (has ? __L("<span class=\"st{0}\">{1}</span>", [(worn && !isIn ? ' worn' : ''), (worn && !isIn ? (isC ? __L("Kuşanıldı") : isT || isTh ? __L("Kullanılıyor") : __L("Giyili")) : (gbIt ? __L("Ücretsiz (karakter)") : __L("Sende")))]) : (itemLockLv(it) && !TRIAL ? __L("<span class=\"lvlock\" title=\"Seviye {0} olunca satın alınabilir\">Seviye {1}</span>", [(itemLockLv(it)), (itemLockLv(it))]) : it.free ? __L("<span class=\"badge\">Ücretsiz</span>") : '<span class="coins" style="padding:1px 8px 1px 4px"><i style="width:14px;height:14px"></i>' + it.price + '</span>'))]);
      d.querySelector('button').onclick = function () { sfx('tap'); showStore(cat, it.id); emit('try'); setTimeout(function () { var t = $('sTry'); if (t) t.scrollIntoView({ block: 'nearest' }); if (tutorial) showTutStep(); }, 30); };
      grid.appendChild(d);
    });
  }

  // ---------- yardım menüsü ----------
  function showHelp(tab) {
    tab = tab || 'how';
    var html = __L("<h2>Yardım</h2><div class=\"tabs\">{0}</div><div id=\"helpBody\"></div><div class=\"row\"><button class=\"primary\" id=\"helpClose\">Kapat</button></div>", [([__L("how|Nasıl oynanır"), __L("tasks|Görevler"), __L("rules|Kurallar"), __L("venue|Kıraathane"), __L("settings|Ayarlar")].map(function (x) { var p = x.split('|'); return __L("<button data-tab=\"{0}\"{1}>{2}</button>", [(p[0]), (tab === p[0] ? ' class="on"' : ''), (p[1])]); }).join(''))]);
    overlay(html);
    var body = $('helpBody');
    if (tab === 'how') {
      body.innerHTML = __L("<h3>Perler</h3><div class=\"ex\"><div class=\"tiles\" id=\"exSet\"></div><span><b>Renkli per:</b> aynı sayı, farklı aileler (Ateş, Su, Güneş, Yıldız; 3 veya 4 taş)</span></div><div class=\"ex\"><div class=\"tiles\" id=\"exRun\"></div><span><b>Seri per:</b> aynı aile, ardışık sayılar (12-13-1 yok)</span></div><div class=\"ex\"><div class=\"tiles\" id=\"exOk\"></div><span><b>OK</b> yazan taş her taşın yerine geçer. ★ sahte okey, okeyin asıl taşı sayılır.</span></div><p>Istakanda taşları yan yana dizince per oluşur ve altında yeşil çizgi belirir. Perlerin arasında bir boşluk bırak.</p><h3>Tur nasıl geçer?</h3><ol><li><b>Taş al:</b> sıra sende olunca desteye dokun ya da senden önceki oyuncunun son attığı taşı \"Yandan al\".</li><li><b>Diz:</b> taşları sürükleyerek perlerini hazırla.</li><li><b>Taş at:</b> istemediğin bir taşı \"Atma yeri\"ne sürükle. Her sıra bir taş atarak biter.</li></ol><h3>Açılma</h3><ul><li>Dört oyuncu da birer kez oynayana kadar (1. tur) kimse açılamaz.</li><li>2. turdan itibaren görev perlerin hazırsa <b>Yere aç</b>: sadece görev perleri iner.</li><li>Sonraki sıralarında <b>Perleri indir</b> ile diğer perlerini masaya koyar, uygun taşları masadaki perlerin üstüne sürükleyerek işlersin. Elinde atacak bir taş hep kalmalı.</li></ul><h3>Sıra sende değilken</h3><p>Birisi taş attığında, sıradaki oyuncu almazsa önce karşısındaki, sonra diğer oyuncu o taşı isteyebilir. Hakkın varsa atılan taşın yanında küçük bir <b>Al / Geç</b> kutusu çıkar; süre dolunca geçmiş sayılırsın (süre Ayarlar'da). Sıra dışı alan oyuncu desteden de bir taş çeker: eline 2 taş girer, taş atmaz.</p><h3>Seviye ve mekânlar</h3><p>Ellerden, maçlardan ve görevlerden XP kazanırsın. Mekânlar seviye ve bir oynama hedefiyle açılır (örneğin \"çevrim içi 18 el\": çevrim içi masada oynadığın ve ödül alan her el). Lobide kilitli karta dokununca ne kaldığını görürsün; açılan mekân bir daha kapanmaz. Bazı kostümler belli seviyede mağazada açılır. Masada adın yanındaki rakam oyuncunun seviyesidir.</p><h3>Lig (Döngü Puanı)</h3><p>Hızlı Katıl'daki Sosyal (girişsiz) maçlar lig maçıdır. Maç sonunda sırana göre puan kazanır ya da kaybedersin (6 El: {0}). Sezon her ay yenilenir; sıralama lobideki Liderlik'te. Altın ve XP etkilenmez.</p>", [(leagueAmounts(6).join(' / '))]); // v9.87
      [{ c: 0, n: 7 }, { c: 1, n: 7 }, { c: 2, n: 7 }].forEach(function (t) { t.fake = false; t.id = -1; $('exSet').appendChild(tileEl(t)); });
      [{ c: 2, n: 4 }, { c: 2, n: 5 }, { c: 2, n: 6 }].forEach(function (t) { t.fake = false; t.id = -1; $('exRun').appendChild(tileEl(t)); });
      var ok = tileEl({ c: 3, n: 4, fake: false, id: -1 }); ok.classList.add('joker'); $('exOk').appendChild(tileEl({ c: 0, n: 4, fake: false, id: -1 })); $('exOk').appendChild(tileEl({ c: 1, n: 4, fake: false, id: -1 })); $('exOk').appendChild(ok);
    } else if (tab === 'tasks') {
      var list = document.createElement('div'); list.className = 'tasklist';
      Okey.TASKS.forEach(function (t, i) {
        var d = document.createElement('div'); d.className = 'item' + (G && G.task === t ? ' now' : ''); // aktif görev (1 / 6 el modlarında sıra karışıktır)
        d.innerHTML = '<span class="n">' + (i + 1) + '</span><span class="txt">' + t.text + '</span><div class="tiles"></div>';
        var tl = d.querySelector('.tiles');
        if (t.req) t.req.forEach(function (r, k) { var tiles = r[0] === 'set' ? [0, 1, 2, 3].slice(0, r[1]).map(function (c) { return { c: c, n: 5, fake: false, id: -1 }; }) : [2, 3, 4, 5, 6].slice(0, r[1]).map(function (n) { return { c: k ? 2 : 0, n: n, fake: false, id: -1 }; }); tiles.forEach(function (x) { tl.appendChild(tileEl(x)); }); if (k < t.req.length - 1) tl.appendChild(document.createTextNode(' + ')); });
        list.appendChild(d);
      });
      body.appendChild(list);
      var p = document.createElement('p'); p.className = 'muted'; p.textContent = __L("Birden fazla per istenen ellerde ilk açılış için perlerin hepsi hazır olmalı. İlk açılışta perler görevin istediği taş sayısıyla iner (3'lü isteniyorsa 3 taş); fazlası elinde kalır, açıldıktan sonraki sıralarında masaya işlersin."); body.appendChild(p);
    } else if (tab === 'rules') {
      body.innerHTML = __L("<h3>Puanlama</h3><ul><li>Eli bitiren <b>−10</b> alır; son taşı okey atarak bitirirse <b>−20</b>, diğerlerinin kalan taş puanı ×2 olur (okey kaptırma, işlek taş ve elde okey cezaları çarpılmaz, sonradan eklenir).</li><li>Gösterge sahte okey çıkan elde okeyle bitiş <b>−40</b>, diğerleri ×4.</li><li>Bitiremeyenlere elinde kalan taşların toplamı yazılır. Elde kalan okey <b>50</b>, sahte okey <b>25</b> taş puanıdır; bunun üstüne her okey için <b>+10</b> \"elde okey bırakma\" cezası ayrıca eklenir (çarpılmaz). Örnek: elinde Su 4, Güneş 9 ve bir okey kaldı, rakip normal bitirdi → 4 + 9 + 50 = 63 (×1) + 10 ceza = <b>73</b>; rakip okeyle bitirseydi 63 × 2 + 10 = 136.</li><li>Deste biter kimse bitiremezse herkese elindeki toplam yazılır.</li><li><b>İşlek taş atma +10:</b> masaya işlenebilecek bir taşı (bir pere eklenebilen ya da okeyin yerine konabilen) atan oyuncuya yazılır; açılmış olsun olmasın. Yalnız açıldığın tur (işleme hakkın yokken) ve eli bitiren son taş cezasızdır.</li></ul><h3>El, tur, sıra</h3><p>Klasik maç 12 <b>el</b>den oluşur; lobiden 1 El veya 6 El (rastgele görevler) de seçilebilir. Bir elde dört oyuncunun birer kez oynaması bir <b>tur</b>dur; tur numarası üstte görünür. <b>Sıra</b> saat yönünde döner.</p><h3>Hamle süresi (çevrim içi)</h3><p>Her taş alma ve taş atma için <b>30 saniye</b> vardır; \"Sıra sende\" rozetinde geri sayım görünür (son 10 saniye kırmızı), sıran gelince kısa bir ses duyarsın (telefonda titreşim). Süre dolarsa sunucu senin yerine oynar ve bu hamle bot hamlesi sayılır: bir maçta hamlelerinin yarısından fazlasını sunucu yaparsa hükmen son sıra olursun (bahisli masada giriş havuzda kalır). Taş alma kutusunun (Al / Geç) süresi ayrıdır.</p><h3>Skinler: Çaktırmadan Bak ve Tokat</h3><p>Masadaki \"Skinler\" panelinden kullanılır. Sahip olduğun her Masa Giriş Skini el başına bir hak verir (en çok 5; ücretsiz ürünler hak vermez). Her hak, el başındaki hazırlıkta seçtiğin rakibin elini 8 saniye görmeni sağlar; taşları yalnız sen görürsün, rakipler eğildiğini görür. Sana bakanı fark edersen \"TOKAT AT\" ile bakışı anında kesersin. Haklar her elde yenilenir, birikmez; engellenen kullanımın hakkı geri gelmez. <b>Hediye:</b> her oyuncuya bir kez, her skinden 1 ücretsiz kullanım (Çaktırmadan Bak + 4 Masa Giriş Skini denemesi); panelde \"1 ücretsiz kullanım\" yazar. Masa Giriş Skinlerini masada istediğin an \"Kullan\" dersin, o an herkese oynar (sahipsen her el 1 kez; ücretsiz deneme kullanınca düşer).</p><div class=\"row left\"><button class=\"soft\" id=\"hSkinTut\">🎓 Skinler eğitimini aç</button></div><h3>Masadaki okeyi alma</h3><p>Masaya açılmış bir perde okey varsa, açılmış bir oyuncu kendi sırasında okeyin yerine geçtiği <b>gerçek taşı</b> koyup okeyi eline alabilir (taşı o perin üstüne sürükle ya da seçip pere dokun). Okeyin hangi taşın yerinde durduğunu peri açan oyuncunun dizdiği sıra belirler (seride O-O-8 → 6-7-8) ve bu el boyunca değişmez. <b>Yan yana iki okey</b> varsa karşılıkları olan iki taşı birlikte seçip pere dokunarak ikisini tek hamlede alabilirsin; her taş ayrı bir okeyin yerine birebir geçmeli, biri uymazsa hiçbiri alınmaz. İki okey ve tek taştan oluşan per (Okey-Okey-8) hem seri hem renkli olabilir: görevle açılırken türünü görev belirler; sonradan \"PERLERİ İNDİR\" ile indirirken oyun sana \"Seri mi, renkli mi?\" diye sorar (seride okeyler alınabilir, renklide bu iki okey alınamaz). Okeyi masaya koyan oyuncuya <b>okey başına</b> ceza puanı yazılır (çevrim içi +10, iki okey +20; bot masasında Ayarlar'dan). Alınan okey tekrar masaya konursa sorumluluk son koyana geçer. Kendi okeyini geri alan ceza almaz.</p><p><b>Renkli gruplarda:</b> İki farklı renkte aynı sayı ve bir okey ile açılan üçlü gruptan okey hemen alınamaz. Üçüncü farklı renkteki aynı sayı eklendiğinde grup dört taşa çıkar ve okey masada kalır. Okey, ancak eksik olan dördüncü renkteki aynı sayı yerine konulduğunda alınabilir. <b>İki okeyli renkli grup</b> (örn. 8-O-O): ikinci renk eklenince grup dört taşa dolar; sonra eksik iki rengin 8'leri okeyleri alır — tek tek ya da iki taşı birlikte seçerek ikisini birden.</p><h3>Oyun sonu</h3><p>Maçın son eli bitince <b>en düşük toplam puan</b> kazanır. Eşitlikte daha çok el kazanan önde.</p><h3>Kafa görevi (klasik maçta 12. el)</h3><p>Yere açılmak yok. Elindeki taşların tamamı per olunca son taşını atarak bitirirsin. Yandan taş aldıkça elin büyür, sorun değil.</p>");
    } else if (tab === 'venue') {
      var VC = Economy.CONFIG.venue, rc = VC.recipes.cay, T = VC.tiers;
      body.innerHTML = __L("<h3>Kıraathanem nedir?</h3><p>Kendi kıraathaneni kur, zevkine göre döşe ve arkadaşlarınla aynı mekânda oyna. Maçlara ev sahipliği yaparak itibar kazan, işletmenden (çay ocağı) elde ettiğin oyun içi gelirle mekânını geliştir. Kıraathane seviyesi yükseldikçe daha fazla masa ve yeni eşyalar açılır. Lobide <b>Kıraathanem</b> ile girilir; arkadaşların 5 harfli kodunla ziyaret eder.</p><h3>Kavramlar</h3><ul><li><b>Oyuncu seviyesi:</b> profilinin XP ile ilerleyen seviyesi (maçlardan XP).</li><li><b>Kıraathane seviyesi:</b> mekânının gelişim aşaması; masa kapasitesini ve kullanılabilecek eşyaları belirler ({0}).</li><li><b>İtibar:</b> yükseltme için gereken birikim; harcanmaz. Kazanma: masanda en az 2 gerçek oyuncuyla (biri sahibi olmayan), 3 dakikadan uzun süren ve biten uygun maçlar +{1} (günde en çok {2}), ilk arkadaş maçı bir kez +{3}, açılış hediyesi {4}.</li><li><b>Cüzdanım:</b> kişisel altının (maç ödülleri, günlük giriş, görevler).</li><li><b>Kıraathane kasası:</b> eşya, üretim ve yükseltme altını. Dolma yolları: ev sahipliği ödülü (uygun maç başına {5}/{6}/{7} altın; günde en çok {8}), çay satışı geliri ve cüzdandan aktarım. Aktarım <b>tek yönlüdür</b>: kasadan cüzdana geri çekilemez.</li></ul><h3>İşletme döngüsü</h3><p><b>Hazırla</b> (çay ocağı: {9} altın girdi, {10} dk, {11} servis) → <b>Satış</b> (ziyaretçiler ve mahalleli; servis {12} altın, {13} altın sistem payı → kasaya {14}) → <b>Topla</b> (biriken geliri kasaya geçir). Mahalleli satışı saatte en çok {15} servis ve günde seviyeye göre en çok {16}–{17} altın kâr; çevrimdışıyken en çok {18} saat işler.</p><h3>Yükseltme</h3><p>Kıraathane içindeki <b>Gelişim</b> paneli mevcut seviyeyi, masa kullanımını, sonraki seviye için gereken itibarı ve kasa bedelini, yükseltince açılacakları ve sıradaki somut adımı gösterir. Üç adımlı tanıtımı kıraathanedeki <b>?</b> düğmesiyle yeniden açabilirsin.</p>", [(T.map(function (t) { return __L("{0} {1} · {2} masa", [(t.tier), (t.name), (t.tables)]); }).join(' → ')), (VC.hostReputation), (VC.hostDailyReputationMax), (VC.firstFriendMatch.reputation), (VC.openGift.reputation), (VC.hostGold[1]), (VC.hostGold[6]), (VC.hostGold[12]), (VC.hostDailyMax), (rc.inputCost), (rc.minutes), (rc.servings), (rc.price), (rc.systemFee), (rc.price - rc.systemFee), (rc.npcPerHour), (VC.npcProfitDailyMax[0]), (VC.npcProfitDailyMax[VC.npcProfitDailyMax.length - 1]), (VC.offlineHours)]);
    } else {
      body.innerHTML = '<div class="setting lang"><span>Dil / Language</span><div class="seg"><button data-lang="tr"' + (window.DonguI18n && DonguI18n.lang === 'tr' ? ' class="on"' : '') + '>Türkçe</button><button data-lang="en"' + (window.DonguI18n && DonguI18n.lang === 'en' ? ' class="on"' : '') + '>English</button></div></div>' + __L("<div class=\"setting\"><span>İpuçları</span><div class=\"seg\"><button data-h=\"1\"{0}>Açık</button><button data-h=\"0\"{1}>Kapalı</button></div></div><div class=\"setting\"><span>Masa odağı</span><div class=\"seg\"><button data-fc=\"1\"{2}>Arka planı kıs</button><button data-fc=\"0\"{3}>Tam parlak</button></div></div><div class=\"setting\"><span>Hareket azalt</span><div class=\"seg\"><button data-rm=\"0\"{4}>Normal</button><button data-rm=\"1\"{5}>Azalt</button></div></div><div class=\"setting\"><span>Ses efektleri</span><div class=\"seg\"><button data-snd=\"1\"{6}>Açık</button><button data-snd=\"0\"{7}>Kapalı</button></div></div><div class=\"setting\"><span>Rakip hızı</span><div class=\"seg\">{8}</div></div><div class=\"setting\"><span>Oyun modu</span><div class=\"seg\"><button data-as=\"1\"{9}>Yardımlı</button><button data-as=\"0\"{10}>Yardımsız</button></div></div>{11}<div class=\"setting\"><span>Okey kaptırma cezası</span><div class=\"seg\">{12}</div></div><div class=\"setting\"><span>Tam ekran</span><div class=\"seg\"><button id=\"sFull\">{13}</button></div></div><div class=\"setting\"><span>Taş alma süresi</span><div class=\"seg\">{14}</div></div><div class=\"setting\"><span>Karakterim</span><button class=\"soft\" id=\"sChar\">Düzenle</button></div><div class=\"setting\"><span>Mağaza</span><button class=\"soft\" id=\"sShop\">Aç</button></div><div class=\"setting\"><span>Eğitim</span><button class=\"soft\" id=\"sTut\">Eğitimi tekrar oynat</button></div><div class=\"setting\"><span>Oyun</span><button class=\"soft\" id=\"sMenu\">Ana menü</button></div>{15}{16}", [(settings.hints ? ' class="on"' : ''), (!settings.hints ? ' class="on"' : ''), (settings.focus ? ' class="on"' : ''), (!settings.focus ? ' class="on"' : ''), (!settings.reduceMotion ? ' class="on"' : ''), (settings.reduceMotion ? ' class="on"' : ''), (settings.sound ? ' class="on"' : ''), (!settings.sound ? ' class="on"' : ''), ([__L("slow|Yavaş"), 'normal|Normal', __L("fast|Hızlı")].map(function (x) { var p = x.split('|'); return __L("<button data-s=\"{0}\"{1}>{2}</button>", [(p[0]), (settings.speed === p[0] ? ' class="on"' : ''), (p[1])]); }).join('')), (settings.assist ? ' class="on"' : ''), (!settings.assist ? ' class="on"' : ''), (__L("<div class=\"setting\"><span>Skinler</span><div class=\"seg\"><button data-sk=\"1\"{0}>Açık</button><button data-sk=\"0\"{1}>Kapalı</button></div></div>", [(settings.skins !== false ? ' class="on"' : ''), (settings.skins === false ? ' class="on"' : '')])), ([5, 10, 20].map(function (n) { return __L("<button data-jp=\"{0}\"{1}>{2}</button>", [(n), (settings.jokerPenalty === n ? ' class="on"' : ''), (n)]); }).join('')), (iosWeb() ? __L("iPhone/iPad: Ana ekrana ekle") : (document.fullscreenElement ? __L("Tam ekrandan çık") : __L("Tam ekrana geç"))), ([5, 8, 12].map(function (n) { return __L("<button data-ct=\"{0}\"{1}>{2} sn</button>", [(n), (settings.claimTime === n ? ' class="on"' : ''), (n)]); }).join('')), (ACC.on ? __L("<h3>Hesap</h3><div class=\"setting\"><span>Oyuncu kimliğin<br><code>{0}</code></span><button class=\"soft\" id=\"sExport\">Verilerimi indir</button></div><div class=\"setting\"><span>Hesabı kalıcı olarak sil</span><button class=\"soft danger\" id=\"sDelete\">Hesabımı sil</button></div>", [(esc(ACC.auth.id))]) : ''), (selfHosted() ? __L("<p class=\"note legal\">{0} · <a href=\"{1}/hesap-silme\" target=\"_blank\" rel=\"noopener\">Hesap silme</a></p>", [(legalLinks()), (SERVER_ORIGIN)]) : '')]); // v10.01 (K134)
      body.querySelectorAll('[data-lang]').forEach(function (b) { b.onclick = function () { if (!window.DonguI18n || b.dataset.lang === DonguI18n.lang) return; DonguI18n.set(b.dataset.lang); }; }); // v10.11: dil değişince sayfa yeniden yüklenir
      body.querySelectorAll('[data-h]').forEach(function (b) { b.onclick = function () { settings.hints = b.dataset.h === '1'; saveSettings(); showHelp('settings'); }; });
      body.querySelectorAll('[data-snd]').forEach(function (b) { b.onclick = function () { settings.sound = b.dataset.snd === '1'; saveSettings(); if (settings.sound) sfx('place'); showHelp('settings'); }; });
      body.querySelectorAll('[data-s]').forEach(function (b) { b.onclick = function () { settings.speed = b.dataset.s; saveSettings(); showHelp('settings'); }; });
      body.querySelectorAll('[data-as]').forEach(function (b) { b.onclick = function () { settings.assist = b.dataset.as === '1'; saveSettings(); showHelp('settings'); }; });
      body.querySelectorAll('[data-sk]').forEach(function (b) { b.onclick = function () { settings.skins = b.dataset.sk === '1'; saveSettings(); if (ACC.on) api('/api/me', accBody(accProfile()), function (e, p) { if (!e && p) accApply(p); }); if (!settings.skins) toast(__L("Skinler kapalı: masada skin kullanmazsın, sana da kullanılamaz (Ayarlar'dan yeniden açabilirsin)."), ''); syncSkinUI(); showHelp('settings'); }; }); // v10.12 (K181, denge P3): herkeste açık başlar; isteyen kapatır
      body.querySelectorAll('[data-jp]').forEach(function (b) { b.onclick = function () { settings.jokerPenalty = parseInt(b.dataset.jp); saveSettings(); if (G && G.rules) G.rules.jokerCapturePenalty = settings.jokerPenalty; showHelp('settings'); }; });
      body.querySelectorAll('[data-ct]').forEach(function (b) { b.onclick = function () { settings.claimTime = parseInt(b.dataset.ct); saveSettings(); showHelp('settings'); }; });
      $('sChar').onclick = function () { showCreator(function () { showHelp('settings'); }); };
      $('sFull').onclick = function () { if (iosWeb()) { showIosGuide(); return; } if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); } else if (!goFullscreen()) toast(__L("Bu tarayıcı tam ekranı desteklemiyor. Oyunu ana ekrana ekleyerek tam ekran açabilirsin."), ''); setTimeout(function () { showHelp('settings'); }, 300); };
      $('sShop').onclick = function () { showStore(); };
      body.querySelectorAll('[data-fc]').forEach(function (b) { b.onclick = function () { settings.focus = b.dataset.fc === '1'; saveSettings(); document.documentElement.classList.toggle('focus', settings.focus); body.querySelectorAll('[data-fc]').forEach(function (x) { x.classList.toggle('on', x === b); }); }; }); // v9.89 (K113)
      body.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { settings.reduceMotion = b.dataset.rm === '1'; saveSettings(); document.documentElement.classList.toggle('reduce', settings.reduceMotion); showHelp('settings'); }; });
      $('sTut').onclick = function () { confirmLeave(function () { showTutHub(); }); };
      if ($('sExport')) $('sExport').onclick = exportMyData; if ($('sDelete')) $('sDelete').onclick = function () { if (G && !G.tutorial && !G.finished) { toast(__L("Önce maçtan çık."), 'warn'); return; } showDeleteAccount(); };
      $('sMenu').onclick = function () { confirmLeave(showMainMenu); };
    }
    body.parentNode.querySelectorAll('.tabs button').forEach(function (b) { b.onclick = function () { showHelp(b.dataset.tab); }; });
    if ($('hSkinTut')) $('hSkinTut').onclick = function () { var go = function () { overlay(null); screen(null); startModule(tutModIndex('skinler'), 0, false); }; if (G && !G.tutorial) confirmLeave(go); else go(); }; // yardımdan skin eğitimi (maçtaysa önce çıkış onayı)
    $('helpClose').onclick = function () { if (G) backToGame(); else showMainMenu(); };
  }
  $('helpBtn').onclick = function () { clearTimeout(botTimer); showHelp('how'); };
  $('menuBtn').onclick = function () { clearTimeout(botTimer); showHelp('settings'); };
  // ---------- Profil kartı (v9.74): kendi portren / lobi profil alanı / rakip karakteri → ad, seviye, görünüm, giyili parçalar, kostüm sayısı, maç/galibiyet, kıraathane ----------
  function wornNames(a) { var out = []; ['hair', 'beard', 'moustache', 'outfit', 'pants', 'acc', 'headwear', 'eyewear', 'necklace', 'earring', 'wrist', 'makeup', 'intro'].forEach(function (k) { var v = a[k]; if (!v || v === 'yok') return; if (GARDROP[v]) { out.push(GARDROP[v].name); return; } var it = catItem(k, v); if (it && it.price > 0) out.push(it.name); }); return out; }
  function showProfile(p) {
    var me = p === ME, a, name, prof = null, bot = null;
    if (me) { a = normAvatar(myAvatar || DEFAULT_AV); name = a.name; var li = levelInfo(); prof = { level: li.level, into: li.into, need: li.need, matches: ACC.player && ACC.player.stats ? (ACC.player.stats.matches || 0) : null, wins: ACC.player && ACC.player.stats ? (ACC.player.stats.wins || 0) : null, owned: wardrobe.owned.length, venue: (window.Venue && Venue.venue && Venue.venue.mine) ? Venue.venue.name : null }; if (NET.online && NET.seats && NET.seats[NET.seat] && NET.seats[NET.seat].prof && NET.seats[NET.seat].prof.venue) prof.venue = NET.seats[NET.seat].prof.venue; }
    else { var sa = seatAvatar(p); name = G ? G.names[p] : '?'; if (sa && sa.bot) bot = sa.bot; else if (sa) { a = normAvatar(sa); var abs = NET.online ? (p + NET.seat) % 4 : -1; prof = NET.online && NET.seats && NET.seats[abs] ? NET.seats[abs].prof : null; } else if (BOT_IMG[p]) bot = BOT_IMG[p]; }
    var av = bot ? __L("<img class=\"av\" src=\"assets/bot-{0}-bust.webp\" alt=\"\">", [(bot)]) : charImgHTML(a || DEFAULT_AV, 'bust', 'bust');
    var rows = [];
    if (bot) rows.push(__L("<span class=\"note\">Bot — antrenman rakibi</span>"));
    else {
      rows.push(__L("<b>Seviye {0}</b>{1}", [(prof && prof.level != null ? prof.level : '?'), (prof && prof.need ? __L("<div class=\"pbar\"><i style=\"width:{0}%\"></i><b>{1} / {2} XP</b></div>", [(Math.round(100 * (prof.into || 0) / prof.need)), (prof.into || 0), (prof.need)]) : '')]));
      if (prof && prof.matches != null) rows.push(__L("Maç: <b>{0}</b> · Galibiyet: <b>{1}</b>", [(prof.matches), (prof.wins)]));
      var arN = me ? ROOMS.filter(function (r) { return !r.soon && arenaOpenMe(r.theme); }).length : (prof && prof.arenas != null ? prof.arenas : null); if (arN != null) rows.push(__L("Açık mekân: <b>{0} / {1}</b>", [(arN), (ROOMS.length)])); // v9.86
      var worn = a ? wornNames(a) : []; rows.push(__L("Giyili: {0}{1}", [(worn.length ? worn.map(esc).join(', ') : __L("standart görünüm")), (prof && prof.owned != null ? __L(" · Kostüm: <b>{0} parça</b>", [(prof.owned)]) : '')]));
      var lgP = me ? (ACC.player && ACC.player.league ? ACC.player.league : null) : (prof && prof.lp != null ? { points: prof.lp } : null); if (lgP) rows.push(__L("Döngü Puanı ({0}): <b>{1}</b>{2}", [(leagueSeason()), (lgP.points), (lgP.matches != null ? __L(" · {0} lig maçı", [(lgP.matches)]) : '')])); // v9.87
      if (prof && prof.venue) rows.push(__L("Kıraathane: <b>{0}</b>", [(esc(prof.venue))]));
      var bdg = me ? (ACC.player && ACC.player.badges) : (prof && prof.badges); if (bdg && bdg.length) rows.push(__L("🏆 Lig: {0}", [(bdg.slice(-3).reverse().map(function (b) { return '<b>' + ['🥇', '🥈', '🥉'][Math.max(0, Math.min(2, (b.rank || 1) - 1))] + ' ' + esc(Economy.seasonLabel(b.season)) + '</b>'; }).join(' · '))])); // v10.09 (K174): sezon sonu lig rozetleri
      if (!NET.online && !me) rows.push(__L("<span class=\"note\">Çevrim içi maçta seviye ve istatistikler görünür.</span>"));
    }
    var pLv = !bot && prof && prof.level ? prof.level : 0; // v9.86 seviye rozeti
    overlay(__L("<div class=\"prof\"><div class=\"pav\">{0}{1}</div><div class=\"pinfo\"><h2>{2}</h2>{3}</div></div>{4}<div class=\"row\">{5}<button class=\"primary\" id=\"pfClose\">Kapat</button></div>", [(av), (pLv ? __L("<b class=\"lvb big\" title=\"Seviye {0}\">{1}</b>", [(pLv), (pLv)]) : ''), (esc(name)), (rows.map(function (r) { return '<div class="prow">' + r + '</div>'; }).join('')), (!me && !bot && prof && prof.id ? '<div id="pfSoc" class="pfsocbox"></div>' : ''), (me ? __L("<button class=\"soft\" id=\"pfEdit\">Karakteri düzenle</button>") : '')]), 'profcard');
    if ($('pfSoc')) socProfileButtons(prof.id, name, $('pfSoc')); // v9.93: arkadaşlık düğmeleri (masadaki oyuncu)
    var close = function () { $('overlay').onclick = null; if (G) backToGame(); else overlay(null); };
    $('pfClose').onclick = close;
    if ($('pfEdit')) $('pfEdit').onclick = function () { $('overlay').onclick = null; if (G) showCreator(backToGame); else { APP.state = 'CHAR'; showCreator(showLobby); } };
    $('overlay').onclick = function (ev) { if (ev.target && ev.target.id === 'overlay') close(); }; // dışına dokununca kapanır
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }
  function backToGame() { overlay(null); if (G) { APP.state = G.tutorial ? 'TUTORIAL' : 'GAME'; render(); if (G.phase !== 'handover' && !(tutorial && curStep() && curStep().wait === 'next')) schedule(); } else showMainMenu(); }
  $('charBtn').onclick = function () { clearTimeout(botTimer); showCreator(backToGame); };
  $('meAv').onclick = function () { if (G && !SKIN.target) showProfile(ME); }; // v9.74: kendi portren → profil kartı
  $('shopBtn').onclick = function () { clearTimeout(botTimer); showStore(); };
  $('ledgerBtn').onclick = function () { if (!G) return; clearTimeout(botTimer); if (!G.history.length) { toast(__L("Henüz tamamlanmış el yok."), ''); schedule(); return; } showLedger(G.history.length - 1, true); };
  document.addEventListener('pointerdown', function (ev) { var sm = $('sortMenu'); if (sm && sm.classList.contains('show') && !ev.target.closest('#sortMenu') && !ev.target.closest('#btnSort')) sm.classList.remove('show'); }, true);
  $('taskBtn').onclick = function () { clearTimeout(botTimer); showHelp('tasks'); };

  // ---------- uygulamalı eğitim: modüller ----------
  // Eğitim ayrı bir deneme oturumudur: kayıt, puan, XP, bakiye değişmez (saveGame/accReport/localReward eğitimi atlar; mağazada TRIAL).
  // İlerleme settings.tut = { mod, step, done:{} } ile saklanır; "Nasıl Oynanır?" merkezinden her modül ayrı açılabilir.
  var listeners = [];
  function emit(ev) { listeners.slice().forEach(function (fn) { fn(ev); }); }
  function colorName(c) { return Okey.COLORS[c].toLowerCase(); }
  function hasSegment(kind, pred) {
    return rackSegments().some(function (s) { return s.kind && (s.kind === kind || s.kind === 'any') && (!pred || pred(s)); });
  }
  // v9.72: elle gruplama adımına girişte per zaten hazırsa ("Renge Göre Diz" sonrası) bir taşı uzağa taşır; oyuncu sürüklemeyi gerçekten yapar. Taşınan taş ıstakada kalır, el değişmez.
  function tutSegPred(wait) { return wait === 'segSet' ? function (s) { return s.tiles.every(function (t) { return Okey.isJoker(t, G.ok) || Okey.effective(t, G.ok).n === tutN; }); } : function (s) { return s.tiles.every(function (t) { return Okey.isJoker(t, G.ok) || Okey.effective(t, G.ok).c === tutRunColor; }); }; }
  function tutScatter(wait) {
    if (!G || !rack.length) return false;
    var kind = wait === 'segSet' ? 'set' : 'run', pred = tutSegPred(wait), moved = 0, guard = 0;
    while (guard++ < 6) {
      var seg = rackSegments().filter(function (s) { return s.kind && (s.kind === kind || s.kind === 'any') && pred(s); })[0]; if (!seg) break;
      var slot = seg.slots[seg.slots.length - 1], id = rack[slot], far = -1, bestD = -1;
      for (var i = 0; i < rack.length; i++) { if (rack[i] !== null) continue; var d = Math.min.apply(null, seg.slots.map(function (x) { return Math.abs(x - i); })); if (d > bestD) { bestD = d; far = i; } }
      if (far < 0 || bestD < 2) break;
      rack[slot] = null; rack[far] = id; moved++;
    }
    if (moved) { sel = []; render(); }
    return moved > 0;
  }
  var TRIAL = null; // mağaza eğitimi: deneme sahipliği (bakiye/sunucu değişmez)
  function okName() { var ok = G.ok; return ok.fakeIsOkey ? __L("sahte okey taşları") : Okey.COLORS[ok.c] + ' ' + ok.n; }
  function indName() { return Okey.tileName(G.indicator); }
  var TUT_MODULES = [
    { id: 'temel', name: __L("Temel Kontroller"), game: 'basic', noIntro: true, steps: [ // v9.89 (K112): el başı penceresi yok — bölüm kendisi anlatır. v10.06 (K145): kısa adımlar, her adım tek iş, ilk hamle 2. adımda (tester geri bildirimi)
      { text: function () { return __L("Merhaba! Önce oyunun temelini gösterelim. Bu senin ıstakan: 14 taşın burada."); }, target: '#rackWrap', wait: 'next' },
      { text: function () { return __L("Sıra sende. Ortadaki kapalı desteye dokun ve bir taş çek."); }, target: '#deck', wait: 'draw' },
      { text: function () { return __L("Taşları sürükleyerek dizersin. Şimdi bir taşı tut, ıstakada başka bir yere bırak."); }, target: '#rackWrap', wait: 'rack', retry: true },
      { text: function () { return __L("Yan yana duran uygun taşlar per olur ve altı yeşil çizgiyle işaretlenir: aynı sayı farklı renklerde, ya da aynı renkte ardışık sayılar."); }, target: '#rackWrap', wait: 'next' },
      { text: function () { return __L("Taş atmak: işine yaramayan bir taşı sağ alttaki \"Atma yeri\"ne sürükle (ya da taşa dokun, \"TAŞ AT\"a bas)."); }, target: '#mydisc', wait: 'discard', retry: true },
      { text: function () { return __L("Rakipler oynuyor. Sıra sana gelince \"Sıra sende\" yanar ve ıstakan parlar. Her sırada bir taş alır, bir taş atarsın."); }, target: '#turnBadge', wait: 'next' },
      { text: function () { return __L("Solundaki oyuncunun attığı taşı desteden çekmek yerine alabilirsin: sıran gelince \"YANDAN AL\"a bas."); }, target: '#btnTake', wait: 'take', retry: true },
      { text: function () { return __L("Üstteki şeritte el sayısı ve bu elin görevi yazar; \"Puanlar\" biten ellerin defteridir. Döngü'de EN DÜŞÜK toplam kazanır."); }, target: '#infobar', wait: 'next' },
      { text: function () { return __L("Sıra dışı alma: biri desteden çekerse atılan taşı sonraki oyuncular da isteyebilir. Sana sorulursa \"Al / Geç\" kutusu çıkar; alırsan desteden de bir taş çekersin."); }, wait: 'next' },
      { text: function () { return __L("Temel kontroller tamam! Bir taş at ve bölümü bitir."); }, target: '#mydisc', wait: 'discard', retry: true }
    ] },
    { id: 'per', name: __L("Per ve El Açma"), game: 'basic', fresh: true, noIntro: true, steps: [ // v9.89: taze el (önceki bölümün masası devralınmaz) — "ilk turda açılamaz" dersi gerçekten 1. turda
      { text: function () { return __L("Okeyde iki çeşit per var. Renkli per: aynı sayının farklı aileleri (Ateş 7, Yıldız 7, Su 7). Seri per: aynı ailede ardışık sayılar (Su 4, 5, 6). Her elin görevi belli perleri ister."); }, target: '#taskBtn', wait: 'next' },
      { text: function () { return __L("Önce sıra sende olmalı ve bir taş çekmiş olmalısın: desteye dokun."); }, target: '#deck', wait: 'draw' },
      { text: function () { return __L("\"Diz\" menüsü elini otomatik toplar. \"Sayıya Göre Diz\": aynı renkte ardışık sayıları yan yana getirir (seri perler). Dene: Diz → Sayıya Göre Diz."); }, target: '#btnSort', wait: 'sort:run' },
      { text: function () { return __L("\"Renge Göre Diz\": aynı sayının farklı renklerini yan yana getirir (renkli perler). Dene: Diz → Renge Göre Diz."); }, target: '#btnSort', wait: 'sort:set' },
      { text: function () { return __L("Elle gruplama: {0}'lerden birini ayırdık. Ateş {1}, Yıldız {2} ve Su {3}'yi sürükleyerek yeniden yan yana getir (aralarında boşluk kalmasın). Doğru olunca altında yeşil çizgi belirir.", [(tutN), (tutN), (tutN), (tutN)]); }, target: '#rackWrap', wait: 'segSet', retry: true, enter: function () { tutScatter('segSet'); } },
      { text: function () { return __L("Şimdi bir seri: {0} 4, 5 ve 6'yı sürükleyerek yan yana diz (perler arasında bir boşluk bırak).", [(Okey.COLORS[tutRunColor])]); }, target: '#rackWrap', wait: 'segRun', retry: true, enter: function () { tutScatter('segRun'); } },
      { text: function () { return __L("Bu elin görevi bir 3'lü renkli; {0}'ler görevi karşılıyor ve sarı çizgiyle işaretlendi. Kural: İLK TURDA HİÇ KİMSE EL AÇAMAZ. Şimdilik istemediğin bir taşı at (perlerden olmasın).", [(tutN)]); }, target: '#mydisc', wait: 'discard', retry: true },
      { text: function () { return __L("Rakipler oynuyor; dört oyuncu da oynayınca tur biter (üstteki sayaç). Sıra sana yeniden gelince yine bir taş çek (ya da yandan al)."); }, wait: 'turn2' },
      { text: function () { return tutSatisfied({ wait: 'segSet' }, 'show') ? __L("Sıra yine sende ve görev perin hazır: \"PER AÇ\"a bas. Sadece görev perin masaya iner, seri perin ıstakanda kalır.") : __L("Görev perin dağılmış: Ateş {0}, Yıldız {1} ve Su {2}'yi tekrar yan yana getir (ya da Diz → Renge Göre Diz), sonra \"PER AÇ\"a bas.", [(tutN), (tutN), (tutN)]); }, target: '#btnOpen', wait: 'open', retry: true },
      { text: function () { return __L("Açıldın! Perin masada senin bölgende (ıstakanın üstündeki \"Sen\" alanı) görünüyor; her oyuncunun perleri kendi önündeki bölgede durur. Açıldığın sırada başka per indirilmez ve taş işlenmez; şimdi bir taş at."); }, target: '#mydisc', wait: 'discard', retry: true },
      { text: function () { return __L("Sıra sana bir daha gelince (açıldığın turdan sonraki tur) ıstakandaki hazır perleri \"PERLERİ İNDİR\" ile masaya koyabilirsin. Sıranı bekle, taş çek, sonra \"PERLERİ İNDİR\"e bas."); }, target: '#btnLay', wait: 'lay', retry: true },
      { text: function () { return __L("Harika! Her oyuncunun perleri kendi bölgesinde durur ama herkes herkesin perine taş işleyebilir; işleme bölümünde bunu yapacağız. Bir taş atarak bölümü bitir."); }, target: '#mydisc', wait: 'discard', retry: true }
    ] },
    { id: 'isleme', name: __L("İşleme ve Okey"), game: 'isleme', steps: [
      { text: function () { return __L("Bu bölümde hazır bir masa kurduk: sen açılmışsın, sıra sende. Masa dört bölgeye ayrılır: üstte karşındakinin, sağda ve solda yandakilerin, ıstakanın üstünde senin perlerin. Bölge etiketi sahibini gösterir; işlediğin taş perin sahibinin bölgesinde kalır."); }, target: '#melds', wait: 'next' },
      { text: function () { return __L("İşleme: ıstakandaki uygun taşı masadaki perin üstüne sürükle; uygun perler sarı yanar ve taşın gireceği yer yarı saydam görünür. Dene: {0}'u {1}-{2} serisine ekle.", [(tutT('c10')), (tutT('c7')), (tutT('c9'))]); }, target: '#rackWrap', wait: 'add', check: function () { return onTable(2, 'c10'); }, retry: true },
      { text: function () { return __L("Okey alma: masada okey ({0}) yer tutuyorsa, temsil ettiği gerçek taşı yerine koyup okeyi alırsın. {1}-{2}-OK-{3} serisindeki okey {4} yerine duruyor. Dene: {5}'i serinin okeyinin üstüne sürükle.", [(okName()), (tutT('a3')), (tutT('a4')), (tutT('a6')), (tutT('a5')), (tutT('a5'))]); }, target: '#rackWrap', wait: 'swap', check: function () { return onTable(0, 'a5'); }, retry: true },
      { text: function () { return __L("Okey artık sende; her taşın yerine geçer. Dikkat: el sonunda elinde kalan okey +10 ceza yazar, bu yüzden kullanmadan bitirme."); }, wait: 'next' },
      { text: function () { return __L("Renkli perde okey: {0} + {1} + OK üçlüsünden okey hemen alınamaz. Üçüncü rengi ({2}) eklediğinde grup 4 taşa çıkar ama okey masada kalır. Dene: {3}'yi o pere sürükle.", [(tutT('b1')), (tutT('b2')), (tutT('b3')), (tutT('b3'))]); }, target: '#rackWrap', wait: 'add', check: function () { return onTable(1, 'b3'); }, retry: true },
      { text: function () { return __L("Gördün mü? Okey yerinde kaldı. Ancak eksik olan DÖRDÜNCÜ renkteki aynı sayı ({0}) yerine konunca alınır; o zaman masada dört renkte dört {1} kalır. Aynı renkten ikinci taş ya da başka sayı kabul edilmez.", [(tutT('b4')), (tutNb)]); }, wait: 'next' },
      { text: function () { return __L("Ceza farkı: rakibin okeyini alırsan, okeyi masaya en son koyan oyuncuya +{0} ceza yazılır; kendi okeyini geri alırsan ceza yoktur.", [(settings.jokerPenalty || 10)]); }, wait: 'next' },
      { text: function () { return __L("İşlek taş atma: masaya işlenebilecek bir taşı atarsan +10 ceza alırsın; açılmış olsan da olmasan da. Elini kontrol et, işlenemeyen bir taşı at ve bölümü bitir."); }, target: '#mydisc', wait: 'discard', retry: true }
    ] },
    { id: 'gorev', name: __L("Görevler ve Cezalar"), game: 'basic', noIntro: true, steps: [
      { text: function () { return __L("Görev: her elin görevi (ör. \"3'lü renkli\", \"iki 4'lü seri\", \"Kafa\") üstteki şeritte yazar; \"?\" düğmesinde görev listesi var. Açılmak için görev perlerinin TAMAMI aynı anda inmeli."); }, target: '#taskBtn', wait: 'next' },
      { text: function () { return __L("İlk tur kuralı: masadaki dört oyuncu birer kez oynamadan kimse açılamaz; görev perin hazır olsa bile 2. turu beklersin."); }, wait: 'next' },
      { text: function () { return __L("Gösterge ve okey: bu elde gösterge {0}, okey {1} (taç rozetli). Okey her taşın yerine geçer. Yıldızlı SAHTE OKEY ise {2}.", [(indName()), (okName()), (G.ok.fakeIsOkey ? __L("bu elde okeyin ta kendisi (özel el!)") : __L("yalnızca {0} {1} olarak oynanır", [(Okey.COLORS[G.ok.c]), (G.ok.n)]))]); }, target: '#ind', wait: 'next' },
      { text: function () { return __L("Özel el (×4): gösterge sahte okey çıkarsa o elde sahte okeyler okey olur; sahte okeyle bitiren −40 alır, diğerlerinin kalan taş puanı ×4 yazılır. 12 ellik maçta bu özel el bir kez mutlaka gelir."); }, wait: 'next' },
      { text: function () { return __L("El bitişi: biri son taşını atınca el biter. Bitiren −10 (okeyle bitirirse −20). Diğerlerine ellerinde kalan taşların toplamı yazılır; okey 50, sahte okey 25 puandır. Deste biter kimse bitiremezse herkese elindeki toplam yazılır."); }, target: '#ledgerBtn', wait: 'next' },
      { text: function () { return __L("Cezalar (puana eklenir): okey kaptırma +{0} (kendi okeyini geri alan ceza almaz) · işlek taş atma +10 (herkes için; açıldığın tur ve bitiş taşı hariç) · el sonunda elde okey: taş puanı 50 (sahte okey 25) + okey başına +10 ceza (alıp masaya koymadan tutmak da dahil).", [(settings.jokerPenalty || 10)]); }, wait: 'next' },
      { text: function () { return __L("Modlar: 1 El (tek görev), 6 El (karışık 6 görev), 12 El (klasik sıra: 3'lü renkli → … → Kafa). Puanlar el el toplanır; maç sonunda en düşük toplam kazanır, eşitlikte çok el kazanan önde."); }, wait: 'next' },
      { text: function () { return __L("Puan defteri: her el bitince açılır; satırlarda bitiş tipi, kalan taşlar ve ceza kalemleri ayrı yazar. \"Puanlar\" düğmesiyle istediğin zaman bakabilirsin."); }, target: '#ledgerBtn', wait: 'next' }
    ] },
    { id: 'skinler', name: __L("Skinler"), game: 'skinler', noIntro: true, steps: [ // uygulamalı: panel → Çaktırmadan Bak → tokat yeme → tokat atma → Masa Giriş Skinleri; deneme durumu (PEEK.tut), gerçek haklar harcanmaz
      { text: function () { return __L("Skinler: masada elle kullandığın yetenekler ve maç başı gösterileri. Sağ alttaki \"Skinler\" düğmesinden açılır. Bu bölümde deneme hakları kullanılır; gerçek oyun hakların (ücretsiz kullanımlar dahil) harcanmaz."); }, target: '#skinBtn', wait: 'next' },
      { text: function () { return __L("Skinler düğmesine dokun ve paneli aç."); }, target: '#skinBtn', wait: 'skinOpen' },
      { text: function () { return __L("Çaktırmadan Bak: seçtiğin rakibin taşlarını 8 saniye görürsün. Yalnızca el başındaki hazırlık süresinde kullanılır. Karta dokun."); }, target: '#skinMenu', wait: 'skinTarget' },
      { text: function () { return __L("Hedef seç: masadaki bir karaktere ya da listeden birine dokun, sonra \"Kullan\". Hedef seçmek hak harcamaz; hak \"Kullan\" deyince kullanılır."); }, target: '#skinMenu', wait: 'peekStart' },
      { text: function () { return __L("Rakibin taşları açıldı: 8 saniye boyunca yalnız SEN görürsün. Rakipler yalnız senin ona doğru eğildiğini görür. Fark edilirsen tokat yersin — bu bot fark edecek, izle."); }, wait: 'peekEnd' },
      { text: function () { return __L("Tokat yedin: bakış erken bitti ve kullanılan hak geri gelmedi. Gerçek oyunda bu, rakibin karakterinin yanındaki \"TOKAT AT\" düğmesine basmasıyla olur. Süre dolunca ya da tokat gelince taşlar kapanır, oyun normal sürer."); }, wait: 'next' },
      { text: function () { return __L("Şimdi tersi: {0} sana bakıyor! Karakterinin yanında çıkan \"TOKAT AT\" düğmesine bas ve bakışı kes.", [(names()[2])]); }, target: '#slapBtnWrap', wait: 'slap', retry: true, enter: function () { tutIncoming(2); } },
      { text: function () { return __L("Tokat! Bakış kesildi. Kim ne görür: bakan oyuncu taşları görür; eğilme, tokat ve sonuç masadaki herkese görünür; taşlar başka kimseye gönderilmez."); }, wait: 'next' },
      { text: function () { return __L("Masa Giriş Skinleri (Tersten El, İnce Ayar, Gösterişsiz Numara, Ortayı Kokla): bütün oyunculara oynayan karakter gösterileri. Gerçek masada istediğin an \"Kullan\" (sahipsen her el 1 kez) ya da ücretsiz \"Dene\" dersin, o an oynar. Burada \"▶ İzle\" ile önizle. Panel açık, bak."); }, target: '#skinMenu', wait: 'next', enter: function () { if (!SKIN.open) openSkinMenu(); } },
      { text: function () { return __L("Ücretsiz haklar: panelde \"1 ücretsiz kullanım\" yazan skinleri gerçek masada birer kez deneyebilirsin. Çaktırmadan Bak hakkı kullanım kabul edilince düşer, yakalanınca geri gelmez. Bu eğitim o hakları harcamadı. Skinler bölümü tamam!"); }, wait: 'next', enter: function () { if (SKIN.open) closeSkinMenu(); } }
    ] },
    { id: 'magaza', name: __L("Mağaza ve Skinler"), game: null, screen: 'shop', steps: [
      { text: function () { return __L("Mağaza eğitimi deneme modunda: burada yaptığın alışverişler gerçek bakiyeni değiştirmez. Üstteki sekmeler ürün türleri: Karakter, Masa Girişi, Mekân, Taşlar, kıyafetler…"); }, target: '#sTabs', wait: 'next' },
      { text: function () { return __L("Bir ürüne bakmak için kartındaki \"Dene\"ye dokun: üstte önizleme ve fiyat açılır."); }, target: '#sGrid', wait: 'try', retry: false },
      { text: function () { return __L("\"Satın al\" ürünü kalıcı olarak gardırobuna ekler (deneme modunda bakiyen değişmez). Dene: Satın al."); }, target: '#sBuy', wait: 'buy:trial' },
      { text: function () { return __L("Masa Giriş Skinleri: Tersten El, İnce Ayar, Gösterişsiz Numara, Ortayı Kokla. Satın aldığın skini masada sağdaki Skinler panelinden istediğin an \"Kullan\" dersin; o an bütün oyunculara oynar (her el 1 kez). Kuşanman gerekmez."); }, target: '#sTry', wait: 'next' },
      { text: function () { return __L("\"▶ Önizle\" ile skini istediğin kadar izleyebilirsin; önizleme hak harcamaz. Dene."); }, target: '#sPreview', wait: 'preview' },
      { text: function () { return __L("Masada: Skinler → Masa Giriş Skinleri → Kullan. Mağaza bölümü tamam!"); }, wait: 'next' }
    ] },
    { id: 'lobi', name: __L("Lobi ve Seviyeler"), game: null, screen: 'lobby', steps: [
      { text: function () { return __L("Lobi: ortadaki kartlar odalar, her oda bir mekân. Kartı seçip \"OYNA\" dersin; içeride 1 / 6 / 12 el masaları, bota karşı masa ve arkadaş odası var."); }, target: '#lbRooms', wait: 'next' },
      { text: function () { return __L("Mekânlar: her el ve maç XP kazandırır, seviyen profilde yükselir. İlk mekân (Köy Meydanı) herkese açık; sonraki mekânlar seviye ve oynanan el sayısıyla açılır — kilitli kartın altında ne kaldığı yazar (ör. \"Seviye 2 · 0/6 el\"), karta dokununca \"Nasıl açarım?\" penceresi çıkar."); }, target: '#lbProfile', wait: 'next' },
      { text: function () { return __L("Profil: üstteki ad ve seviye çubuğuna dokununca profil kartın açılır (seviye, maçlar, giyili parçalar); \"Karakteri düzenle\" ile görünüm, isim ve Masa Giriş Skini."); }, target: '#lbProfile', wait: 'next' },
      { text: function () { return __L("Alt şerit: Günlük Giriş (her gün 40 altın) ve görevler, Mağaza, Nasıl Oynanır? (bu eğitim), Kurallar ve Ayarlar (ses, hızlar, yardım modu)."); }, target: '#nav-ayar', wait: 'next' },
      { text: function () { return __L("Skinler: her el başında 15 saniyelik hazırlık vardır; sağ alttaki \"Skinler\" panelinden Çaktırmadan Bak kullanılır, sana bakanı \"TOKAT AT\" ile kesersin. Sahip olduğun her Masa Giriş Skini el başına bir hak verir (en çok 5); yeni oyuncuya her skinden 1 ücretsiz kullanım hediyedir. Uygulamalı anlatım \"Skinler\" bölümünde."); }, wait: 'next' },
      { text: function () { return __L("Hepsi bu! Köy Meydanı seni bekliyor. İstediğin bölümü \"Nasıl Oynanır?\" içinden tekrar açabilirsin."); }, wait: 'next' }
    ] }
  ];
  var tutRig = {}; // işleme senaryosundaki taş adları
  var tutNb = 12;
  function tutT(key) { return tutRig[key] || key; }
  function onTable(mi, key) { var id = tutRig.ids && tutRig.ids[key]; var m = G && G.table[mi]; return !!(m && id !== undefined && m.tiles.some(function (t) { return t.id === id; })); }
  function tutModIndex(id) { for (var i = 0; i < TUT_MODULES.length; i++) if (TUT_MODULES[i].id === id) return i; return 0; }
  function tutProgress() { if (!settings.tut) settings.tut = { done: {} }; if (!settings.tut.done) settings.tut.done = {}; return settings.tut; }
  function saveTutProgress() { var tp = tutProgress(); if (tutorial) { tp.mod = TUT_MODULES[tutorial.mod].id; tp.step = tutorial.step; } saveSettings(); }
  var pendingTut = null;
  // Modülü başlat (step: kaldığı adım). all=true: bitince sonrakine geçilir.
  function startModule(mi, step, all) {
    var mod = TUT_MODULES[mi];
    TRIAL = null; overlay(null);
    var t = { mod: mi, step: step || 0, all: all === 'quick' ? 'quick' : !!all }; // all: true = bütün bölümler sırayla; 'quick' = kısa yol (K112)
    if (mod.game) {
      var reuse = G && G.tutorial && G.tutGame === mod.game && !G.finished && G.phase !== 'handover' && !(mod.fresh && (step || 0) === 0); // v9.89: fresh bölüm (Per ve El Açma) baştan başlarken taze el kurar
      if (!reuse) { pendingTut = t; newGame(true, mod.game, mod.noIntro); return; } // → el başı penceresi → "Başla" → startTutorial()
      if (mod.id === 'per') { rigTutorialHand(true); syncRack(false); } // görev taşları atılmış olabilir: yeniden hazırla (sıra düzeni korunur)
      tutorial = t; listeners = listeners.filter(function (f) { return f !== onTutEvent; }); listeners.push(onTutEvent);
      APP.state = 'TUTORIAL'; render(); saveTutProgress(); if (mod.id === 'skinler') tutSkinsBegin(); showTutStep(); if (G.phase !== 'handover') schedule(); // botlar kaldığı yerden sürer
      return;
    }
    stopSession(); G = null;
    if (mod.screen === 'shop') { screen(null); showLobby(); TRIAL = { owned: {}, worn: null }; APP.state = 'SHOP'; showStore('intro'); }
    else { overlay(null); showLobby(); }
    tutorial = t; listeners = listeners.filter(function (f) { return f !== onTutEvent; }); listeners.push(onTutEvent); // ekran kurulduktan sonra (showLobby oturumu sıfırlar)
    saveTutProgress(); setTimeout(showTutStep, 60);
  }
  function startTutorial() { // el başı penceresinden sonra (ya da doğrudan) adımlara başla
    var t = pendingTut || { mod: 0, step: 0, all: true }; pendingTut = null;
    tutorial = t; listeners = listeners.filter(function (f) { return f !== onTutEvent; }); listeners.push(onTutEvent);
    APP.state = 'TUTORIAL'; saveTutProgress(); if (G && G.tutGame === 'skinler') tutSkinsBegin(); showTutStep();
  }
  function tutSkinsBegin() { PEEK.tut = true; PEEK.trial = 1; if (!prepActive()) startPrep(0); } // skin bölümü: hazırlık açık (süre işlemez), 1 deneme hakkı; gerçek haklar ayrı
  function curStep() { return tutorial ? TUT_MODULES[tutorial.mod].steps[tutorial.step] : null; }
  function tutSatisfied(st, ev) {
    if (!G && st.wait !== 'next' && !/^(screen|try|buy|wear|preview|tab)/.test(st.wait)) return false;
    var me = G ? G.players[ME] : null;
    switch (st.wait) {
      case 'draw': return ev === 'draw' || ev === 'take';
      case 'take': if (ev === 'draw') { toast(__L("Bu kez desteden çektin; yandan almayı bir sonraki sıranda da deneyebilirsin."), ''); return true; } return ev === 'take';
      case 'discard': return ev === 'discard';
      case 'open': return ev === 'open';
      case 'lay': return ev === 'lay';
      case 'add': return ev === 'add';
      case 'swap': return ev === 'swap';
      case 'rack': return ev === 'rack';
      case 'sort:run': case 'sort:set': return ev === st.wait;
      case 'try': return ev === 'try';
      case 'buy:trial': return ev === 'buy:trial';
      case 'preview': return ev === 'preview';
      case 'skinOpen': return ev === 'skinOpen' || SKIN.open;
      case 'skinTarget': return ev === 'skinTarget' || !!SKIN.target;
      case 'peekStart': return ev === 'peekStart' || !!PEEK.active;
      case 'peekEnd': return /^peekEnd/.test(ev);
      case 'slap': return ev === 'slap';
      case 'segSet': return hasSegment('set', function (s) { return s.tiles.every(function (t) { return Okey.isJoker(t, G.ok) || Okey.effective(t, G.ok).n === tutN; }); });
      case 'segRun': return hasSegment('run', function (s) { return s.tiles.every(function (t) { return Okey.isJoker(t, G.ok) || Okey.effective(t, G.ok).c === tutRunColor; }); });
      case 'turn2': return G.cp === ME && G.phase === 'play' && Okey.roundNo(G) >= 2 && !me.opened;
      case 'turn3': return G.cp === ME && G.phase === 'play' && me.opened && !me.openedThisTurn;
    }
    return false;
  }
  function onTutEvent(ev) {
    if (!tutorial) return;
    var st = curStep(); if (!st) return;
    if (st.wait === 'open' && ev === 'rack') { $('coachText').textContent = st.text(); } // per dağıldıysa/toplandıysa metin güncellenir
    if (ev === 'claimPrompt' && G) { $('coachText').textContent = __L("Atılan taşı alma hakkın var: masadaki küçük Al / Geç kutusu bunun için. Alırsan desteden de bir taş çekersin. Şimdilik \"Geç\" diyebilirsin."); return; }
    if (ev === 'tutPeekTimeout' && st.wait === 'slap') { $('coachText').textContent = __L("Süre doldu, bakış kendiliğinden bitti. \"Yeniden dene\" deyince rakip yine bakacak; bu kez TOKAT AT düğmesine bas."); $('coachRetry').hidden = false; return; }
    if (!tutSatisfied(st, ev)) { if (ev === 'pass' || ev === 'claim' || ev === 'take' || ev === 'turn') $('coachText').textContent = st.text(); return; } // Al/Geç kutusu kapanınca rehber kendi adımına döner
    if (st.check && !st.check()) { if (ev !== 'show') toast(__L("Olur, ama bu adımda istenen hamle farklı: {0}", [(st.text().split(/Dene:|Try it:|Try:/).pop().trim())]), ''); return; } // başka geçerli hamle yapıldı: adım sürer
    if (st.wait === 'segSet' || st.wait === 'segRun') {
      var stepNow = tutorial.step;
      $('coachOk').hidden = false; $('coachOk').textContent = __L("Doğru, per oluştu!");
      setTimeout(function () { if (tutorial && tutorial.step === stepNow) advanceTut(); }, 700);
    } else advanceTut();
  }
  function advanceTut() {
    if (!tutorial) return;
    var mod = TUT_MODULES[tutorial.mod];
    tutorial.step++;
    if (tutorial.step >= mod.steps.length) return endModule();
    showTutStep();
  }
  function endModule() {
    var mod = TUT_MODULES[tutorial.mod], tp = tutProgress();
    if (PEEK.tut) tutSkinsCleanup();
    tp.done[mod.id] = true; tp.mod = null; tp.step = 0;
    var next = tutorial.mod + 1, all = tutorial.all;
    var allDone = TUT_MODULES.every(function (m) { return tp.done[m.id]; });
    if (allDone) { settings.tutorialDone = true; }
    saveSettings();
    hideCoach(); TRIAL = null; tutorial = null; listeners = listeners.filter(function (f) { return f !== onTutEvent; });
    clearTimeout(botTimer);
    if (all === 'quick') { // v9.89 (K112): kısa yol — Temel Kontroller → Per ve El Açma → hazırsın (kalan bölümler "Nasıl Oynanır?")
      if (mod.id === 'temel') {
        overlay(__L("<h2>{0} tamamlandı ✓</h2><p>Son adım: <b>Per ve El Açma</b> — gerçekten bir per açacaksın.</p><div class=\"row\"><button class=\"primary\" id=\"tmNext\">Devam</button><button class=\"soft\" id=\"tmExit\">Lobiye dön</button></div>", [(mod.name)]));
        $('tmNext').onclick = function () { guard(function () { startModule(tutModIndex('per'), 0, 'quick'); }); };
        $('tmExit').onclick = function () { guard(function () { leaveTutorial(); }); };
        return;
      }
      settings.tutorialDone = true; settings.quickTut = true; saveSettings(); leaveTutorial(true); return;
    }
    if (all && next < TUT_MODULES.length) {
      var html = __L("<h2>{0} tamamlandı ✓</h2><p>Sıradaki bölüm: <b>{1}</b></p><div class=\"row\"><button class=\"primary\" id=\"tmNext\">Sonraki bölüm</button><button class=\"soft\" id=\"tmExit\">Lobiye dön</button></div>", [(mod.name), (TUT_MODULES[next].name)]);
      overlay(html);
      $('tmNext').onclick = function () { guard(function () { startModule(next, 0, true); }); };
      $('tmExit').onclick = function () { guard(function () { leaveTutorial(); }); };
      return;
    }
    if (allDone || (all && next >= TUT_MODULES.length)) { leaveTutorial(true); return; }
    var html2 = __L("<h2>{0} tamamlandı ✓</h2><p>Diğer bölümleri \"Nasıl Oynanır?\" içinden açabilirsin.</p><div class=\"row\"><button class=\"primary\" id=\"tmHub\">Bölümler</button><button class=\"soft\" id=\"tmExit\">Lobiye dön</button></div>", [(mod.name)]);
    overlay(html2);
    $('tmHub').onclick = function () { guard(function () { stopSessionTut(); showTutHub(); }); };
    $('tmExit').onclick = function () { guard(function () { leaveTutorial(); }); };
  }
  function stopSessionTut() { TRIAL = null; hideCoach(); stopSession(); if (G && G.tutorial) G = null; overlay(null); }
  function leaveTutorial(finished) {
    saveTutProgress(); stopSessionTut();
    if (finished) {
      var rwTxt = (ACC.on ? (ACC.player && ACC.player.tutorialRewarded) : wardrobe.tutorialRewarded) ? '' : __L("<p class=\"rwline\">Eğitim ödülü: <b>+{0} altın · +{1} XP</b> (bir kez)</p>", [(Economy.CONFIG.tutorial.gold), (Economy.CONFIG.tutorial.xp)]);
      tutorialRewardNow();
      var quick = !!settings.quickTut && !TUT_MODULES.every(function (m) { return tutProgress().done[m.id]; });
      var html = __L("<h2>Hazırsın! İlk döngünü başlat.</h2>{0}<p>{1} Lobide Köy Meydanı seni bekliyor.</p><div class=\"row\"><button class=\"primary big\" id=\"tPlay\">LOBİYE GİT</button></div>", [(rwTxt), (quick ? __L("Taş çekmeyi, dizmeyi, atmayı ve el açmayı biliyorsun; ilk maç için yeter. Taş işleme, okey değiştirme, görevler ve skinler: lobide <b>\"Nasıl Oynanır?\"</b> bölümleri (5 kısa bölüm) ve masada sırası gelince çıkan ipuçları.") : __L("Artık per yapmayı, açılmayı, taş atmayı ve işlemeyi biliyorsun."))]);
      overlay(html);
      $('tPlay').onclick = function () { guard(function () { overlay(null); lobbySel = 'koy'; settings.theme = 'koy'; saveSettings(); applyTheme('koy'); showLobby(); }); };
      return;
    }
    showLobby();
  }
  function endTutorial(completed) { // eski çağrılar: el bitince (eğitim masasında) ya da çıkış
    if (completed && tutorial) { endModule(); return; }
    leaveTutorial(false);
  }
  function tutHandEnded() { // v9.89 (K111): eğitim masasında el bitti (bot bitirdi / deste tükendi). Bölüm, oyuncu öğretilen işlemi yapmadan tamamlanmış sayılmaz
    if (!tutorial) { endTutorial(true); return; } // bölüm zaten bitmişti (pencere açık)
    var mod = TUT_MODULES[tutorial.mod];
    var remainingAct = mod.steps.slice(tutorial.step).some(function (s) { return s.wait !== 'next'; }); // kalan adımlarda alıştırma var mı
    if (!remainingAct) { endModule(); return; } // yalnız okunacak adımlar kaldı: bölüm biter
    var t = { mod: tutorial.mod, step: tutorial.step, all: tutorial.all };
    var firstAct = 0; for (var i = 0; i < mod.steps.length; i++) if (mod.steps[i].wait !== 'next') { firstAct = i; break; }
    var redoStep = Math.min(t.step, firstAct); // alıştırma yeni elde baştan kurulur (okuma adımları atlanır); yarım kalan hamle adımları yeni elde geçersiz olurdu
    hideCoach(); tutorial = null; listeners = listeners.filter(function (f) { return f !== onTutEvent; });
    var who = G.handOver && G.handOver.winner != null && G.handOver.winner !== ME ? __L("{0} eli bitirdi.", [(G.names[G.handOver.winner])]) : __L("Deste tükendi.");
    overlay(__L("<h2>El beklenmedik biçimde bitti</h2><p>{0} Bu bölüm tamamlanmış sayılmaz: öğretilen işlemi henüz yapmadın. Alıştırma yeni bir elle yeniden kuruluyor ({1}. adımdan).</p><div class=\"row\"><button class=\"primary\" id=\"tmRedo\">Yeniden kur</button><button class=\"soft\" id=\"tmExit2\">Lobiye dön</button></div>", [(who), (redoStep + 1)]));
    $('tmRedo').onclick = function () { guard(function () { startModule(t.mod, redoStep, t.all); }); };
    $('tmExit2').onclick = function () { guard(function () { tutorial = { mod: t.mod, step: redoStep, all: t.all }; leaveTutorial(false); }); };
  }
  function hideCoach() { $('coach').classList.remove('show'); document.querySelectorAll('.tut-glow').forEach(function (e) { e.classList.remove('tut-glow'); }); }
  function showTutStep() {
    var st = curStep(); if (!st) return;
    var c = $('coach'), mod = TUT_MODULES[tutorial.mod];
    document.querySelectorAll('.tut-glow').forEach(function (e) { e.classList.remove('tut-glow'); });
    $('coachText').textContent = st.text();
    $('coachOk').hidden = true;
    $('coachStep').textContent = mod.name + ' · ' + (tutorial.step + 1) + ' / ' + mod.steps.length;
    var bar = $('coachBar'); if (bar) bar.style.width = Math.round(100 * (tutorial.step + 1) / mod.steps.length) + '%';
    saveTutProgress();
    if (!$('coachAv').firstChild) $('coachAv').innerHTML = portrait(2);
    coachLabels();
    $('coachNext').hidden = st.wait !== 'next';
    $('coachRetry').hidden = !(st.retry && G);
    $('coach').querySelector('.txt').scrollTop = 0;
    if (G && st.wait !== 'next' && tutorial.snapStep !== tutorial.step) { tutorial.snap = { g: Okey.serialize(G), rack: rack.slice() }; tutorial.snapStep = tutorial.step; }
    if (st.enter && tutorial.enteredStep !== tutorial.step) { tutorial.enteredStep = tutorial.step; st.enter(); } // adıma girişte bir kez (ör. rakip sana bakmaya başlar)
    var tgt = st.target ? document.querySelector(st.target) : null;
    if (tgt && tgt.offsetParent === null && !tgt.getClientRects().length) tgt = null;
    if (tgt) tgt.classList.add('tut-glow');
    placeCoach(tgt);
    if (st.wait === 'turn2' || st.wait === 'turn3' || st.wait === 'take') schedule();
    if (tutSatisfied(st, 'show')) setTimeout(function () { onTutEvent('show'); }, 50); // koşul zaten sağlanmışsa hemen ilerle
  }
  // Koç kutusu ıstakayı, atma yerini ve masayı kapatmaz: hedef ekranın alt yarısındaysa kutu en üstte durur; üstteyse hedefin altına iner
  function placeCoach(tgt) { // hedef ekranın sağ yarısındaysa kutu sola, soldaysa sağa; hedefin üstüne gelmez
    var c = $('coach'), W = window.innerWidth, H = window.innerHeight;
    c.style.top = '';
    if (PHONE) { // v10.06 (K144): telefonda tam genişlikte şerit — hedef ekranın üst %42'sindeyse şerit alta iner (ıstaka adımlarında üstte: ıstaka, atma yeri ve köşeler açık)
      var bottom = false; if (tgt) { var rb = tgt.getBoundingClientRect(); bottom = (rb.top + rb.bottom) / 2 < H * 0.42; }
      c.className = 'show' + (bottom ? ' bottom' : '');
      return;
    }
    var right = true; // hedefsiz adımlarda sağda: deste (sol üst) ve ıstaka açık kalır
    if (tgt) { var r = tgt.getBoundingClientRect(); right = (r.left + r.right) / 2 < W * 0.42; }
    c.className = 'show' + (right ? ' right' : '');
  }
  function coachLabels() { // telefon şeridinde düğmeler kısa (simge), masaüstünde yazılı
    var ph = PHONE; $('coachAgain').textContent = ph ? '↻' : __L("↻ Tekrar göster"); $('coachRetry').textContent = ph ? '⟲' : __L("⟲ Yeniden dene"); $('coachSkip').textContent = ph ? __L("Çık") : __L("Eğitimden çık");
  }
  function retryStep() { // adımı başlangıç durumuna döndür (deneme oturumu; motor doğrulaması aynen)
    var stE = curStep(), rackStep = stE && (stE.wait === 'segSet' || stE.wait === 'segRun');
    if (stE && stE.enter && !rackStep) { stE.enter(); $('coachText').textContent = stE.text(); $('coachRetry').hidden = true; return; } // olay adımı: rakip yeniden bakar
    if (!tutorial || !tutorial.snap) return;
    clearTimeout(botTimer);
    try { G = Okey.deserialize(tutorial.snap.g); G.names = names(); rack = tutorial.snap.rack.slice(); sel = []; built = false; render(); } catch (e) {}
    if (rackStep && stE.enter) stE.enter(); // gruplama adımı: kayıtlı dizilişte per hazırsa yine ayrılır (adım kendiliğinden geçmez)
    showTutStep(); toast(__L("Adım baştan: aynı taşlarla tekrar dene."), '');
  }
  function replayHint() { // "Tekrar Göster": hedefi tekrar vurgula, metni yeniden oku, varsa işaretçi animasyonu
    var st = curStep(); if (!st) return;
    var tgt = st.target ? document.querySelector(st.target) : null;
    if (tgt) { tgt.classList.remove('tut-glow'); void tgt.offsetWidth; tgt.classList.add('tut-glow'); tgt.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 500 }); }
    var from = $('rackWrap'), to = tgt;
    if (from && to && (st.wait === 'discard' || st.wait === 'add' || st.wait === 'swap' || st.wait === 'rack')) {
      var a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), h = document.createElement('div'); h.className = 'tut-hand'; h.textContent = '👆';
      h.style.left = (a.left + a.width * 0.3) + 'px'; h.style.top = (a.top + a.height * 0.3) + 'px'; document.body.appendChild(h);
      h.animate([{ transform: __L("translate(0,0) scale(1)"), opacity: 0 }, { opacity: 1, offset: .15 }, { transform: __L("translate({0}px,{1}px) scale(.9)", [(b.left + b.width / 2 - a.left - a.width * 0.3), (b.top + b.height / 2 - a.top - a.height * 0.3)]), opacity: 1, offset: .85 }, { opacity: 0 }], { duration: 1400, easing: 'ease-in-out' }).onfinish = function () { h.remove(); };
    }
    $('coachText').textContent = st.text();
  }
  $('coachNext').onclick = function () { if (tutorial) advanceTut(); };
  $('coachSkip').onclick = function () { if (tutorial) endTutorial(false); };
  $('coachRetry').onclick = function () { retryStep(); };
  $('coachAgain').onclick = function () { replayHint(); };
  window.addEventListener('resize', function () { sizeScene(); if (G && G.phase !== 'handover') renderRack(); if (tutorial) showTutStep(); });
  // Eğitim merkezi: bütün modüller, durumları ve kaldığı yer
  function showTutHub() {
    stopSession(); APP.state = 'TUTHUB';
    var tp = tutProgress();
    var rows = TUT_MODULES.map(function (m, i) {
      var done = tp.done[m.id], cur = tp.mod === m.id ? tp.step : null;
      return __L("<div class=\"tmrow{0}\"><b>{1}. {2}</b><span>{3}</span><button class=\"{4}\" data-mod=\"{5}\">{6}</button></div>", [(done ? ' done' : ''), (i + 1), (m.name), (done ? __L("✓ Tamamlandı") : cur !== null && cur > 0 ? __L("Kaldığın yer: adım {0} / {1}", [(cur + 1), (m.steps.length)]) : __L("{0} adım", [(m.steps.length)])), (done ? 'soft' : 'good'), (i), (done ? __L("Tekrar") : cur ? __L("Devam") : __L("Başla"))]);
    }).join('');
    overlay(__L("<h2>Nasıl Oynanır?</h2><p class=\"muted\">Bölümler ayrı ayrı açılır; ilerlemen kaydedilir. Eğitim deneme oturumudur: bakiyen, XP'n ve istatistiklerin değişmez.</p><div class=\"tmlist\">{0}</div><div class=\"row\"><button class=\"primary\" id=\"thAll\">Baştan oynat (hepsi)</button><button class=\"soft\" id=\"thClose\">Kapat</button></div>", [(rows)]));
    document.querySelectorAll('[data-mod]').forEach(function (b) { b.onclick = function () { guard(function () { var i = parseInt(b.dataset.mod), step = tp.mod === TUT_MODULES[i].id ? (tp.step || 0) : 0; overlay(null); screen(null); startModule(i, step, false); }); }; });
    $('thAll').onclick = function () { guard(function () { tp.mod = null; tp.step = 0; saveSettings(); overlay(null); screen(null); startModule(0, 0, true); }); };
    $('thClose').onclick = function () { guard(function () { overlay(null); showLobby(); }); };
  }

  // ---------- boşta ipucu ----------
  var hintTimer = null, hintShownFor = null;
  function scheduleHint() {
    clearTimeout(hintTimer);
    if (!settings.hints || !settings.assist || tutorial || !G) return;
    var key = G.hand + ':' + G.turnNo + ':' + G.phase;
    var mine = (G.phase === 'claim' ? Okey.claimant(G) : G.cp) === ME && G.phase !== 'handover';
    if (!mine || hintShownFor === key) return;
    hintTimer = setTimeout(function () {
      if (hintShownFor === key || $('overlay').className === 'overlay') return;
      hintShownFor = key;
      var me = G.players[ME], msg = '';
      if (G.phase === 'pickup') msg = __L("Sıra sende: desteye dokunarak taş çek{0}", [(Okey.topDiscard(G) ? __L(" ya da yandaki taşı al.") : '.')]);
      else if (G.phase === 'play') {
        if (!G.task.req) msg = __L("Kafa eli: bütün taşlar per olunca son taşı at. Şimdilik istemediğin bir taşı atma yerine sürükle.");
        else if (!me.opened) msg = taskReady() ? (Okey.roundNo(G) < 2 ? __L("Görev perlerin hazır ama ilk turda açılamazsın; bir taş at, 2. turda açarsın.") : __L("Görev perlerin hazır: \"Yere aç\"a bas.")) : (Okey.findTaskGroups(me.hand, G.ok, G.task) ? __L("Görev taşların elinde var gibi: ıstakada yan yana diz ki per oluşsun.") : __L("Görev henüz tamam değil. İstemediğin bir taşı atma yerine sürükleyerek turu bitir."));
        else msg = __L("Hazır perlerini \"Perleri indir\" ile masaya koy ya da uygun taşı masadaki pere sürükle; sonra bir taş at.");
      }
      if (!msg) return;
      var d = document.createElement('div'); d.className = 'toast hint'; d.textContent = msg; d.onclick = function () { d.remove(); }; document.body.appendChild(d);
      setTimeout(function () { d.remove(); }, 6000);
    }, 14000);
  }

  // ---------- başlangıç ----------
  window.addEventListener('pointerdown', function () { clearTimeout(hintTimer); scheduleHint(); }, true);
  $('deck').addEventListener('click', function () { if (Date.now() < deckClickBlockUntil || PULL_DEST) return; if (prepActive()) { toast(__L("Hazırlık aşaması: önce \"Oyuna geç\"."), ''); return; } if (G && G.phase === 'pickup' && G.cp === ME) { if (!G.deck.length) { toast(__L("Deste bitti: yandan alabilirsin ya da \"Eli kapat\" ile eli bitirebilirsin."), ''); return; } doAction(function () { Okey.actDraw(G); }, 'draw', {}); } });
  // test/kurgu kancası (prototip)
  // ---------- Açılış akışı: Giriş → Misafir → taş geçişi → (öğretici) → Lobi (FOG açılışı 7 Ekim 2026'da şimdilik kaldırıldı: SPLASH_ENABLED) ----------
  // Odalar = mekânlar; seviye eşikleri burada (sonradan değiştirilebilir). item: mağazadan alınmış olmalı. soon: görseli hazır değil.
  var ROOMS = [
    { theme: 'koy', level: 1, sub: __L("İlk Döngü") },
    { theme: 'kahve', level: 3, sub: __L("Kahve Döngüsü") },
    { theme: 'sokak', level: 5, sub: __L("Sokak Döngüsü") },
    { theme: 'sanayi', level: 8, sub: __L("Emek Döngüsü") },
    { theme: 'cinar', level: 12, sub: __L("Muhabbet Döngüsü") },
    { theme: 'soba', level: 16, sub: __L("Sıcak Döngü") },
    { theme: 'apartman', level: 20, sub: __L("Komşu Döngüsü") },
    { theme: 'bag', level: 25, sub: __L("Bağ Döngüsü") },
    { theme: 'kor', level: 30, sub: __L("Ateş Döngüsü") },
    { theme: 'gok', level: 34, sub: __L("Fırtına Döngüsü") },
    { theme: 'inci', level: 38, sub: __L("Gelgit Döngüsü") },
    { theme: 'kok', level: 42, sub: __L("Kök Döngüsü") },
    { theme: 'yildiz', level: 46, sub: __L("Yıldız Döngüsü") }
  ];
  ROOMS.forEach(function (r) { var a = Economy.arenaRule(r.theme); if (a) r.level = a.level; }); // v9.86: eşikler tek yerde (Economy.CONFIG.arenas)
  var UI = 'assets/ui/';
  function localLevel() { return Economy.levelOf(wardrobe.xp || 0); }
  function econSummary() { return ACC.on && ACC.player && ACC.player.econ ? ACC.player.econ : Economy.summary(wardrobe, Date.now()); }
  function levelInfo() { if (ACC.player) return { level: ACC.player.level, into: ACC.player.xpInto, need: ACC.player.xpNeed }; return localLevel(); }
  function myLevel() { return levelInfo().level; }
  function roomName(r) { return r.name || (THEMES[r.theme] ? THEMES[r.theme].name : r.theme); }
  function deSuffix(n) { // Türkçe bulunma eki: 3'te, 5'te, 8'de, 12'de, 16'da, 20'de, 25'te
    var d = n % 10, t = n % 100;
    if (d === 0) return { 10: 'da', 20: 'de', 30: 'da', 40: 'ta', 50: 'de', 60: 'ta', 70: 'te', 80: 'de', 90: 'da' }[t] || 'de';
    return ({ 1: 'de', 2: 'de', 3: 'te', 4: 'te', 5: 'te', 6: 'da', 7: 'de', 8: 'de', 9: 'da' })[d];
  }
  // v9.86 (K107): mekân kilidi — seviye + oynama hedefi; kayıt: hesap (sunucu) ya da cihaz (sunucusuz deneme)
  function arenaRec() { return ACC.on && ACC.player ? ACC.player : { xp: wardrobe.xp || 0, stats: wardrobe.stats || {}, arenas: wardrobe.arenas || ['koy'] }; }
  function arenaProg(theme) { return Economy.arenaProgress(arenaRec(), theme); }
  function arenaOpenMe(theme) { return OPEN_ALL || arenaProg(theme).open; }
  function lockShort(pr) { var a = []; if (pr.level.have < pr.level.need) a.push(__L("Seviye {0}", [(pr.level.need)])); var h = pr.real || pr.hands; if (h && h.have < h.need) a.push(h.have + '/' + h.need + (pr.real ? __L(" gerçek el") : __L(" el"))); return a.join(' · ') || __L("Kilitli"); }
  function roomLocked(r) { if (r.soon) return __L("Yakında"); if (OPEN_ALL) return ''; if (r.item && !owns(r.item)) return __L("Mağazadan al"); var pr = arenaProg(r.theme); return pr.open ? '' : lockShort(pr); }
  var TILE_MAT_NAMES = { lav: __L("Lav"), firtina: __L("Fırtına"), gelgit: __L("Gelgit"), kok: __L("Kök"), yildiz: __L("Yıldız") };
  function showArenaLock(r) { // kilitli mekân kartı: nasıl açarım · ne kadar kaldı · ne kazanırım
    var pr = arenaProg(r.theme), t = THEMES[r.theme] || {};
    var bar = function (lbl, have, need) { var pct = Math.min(100, Math.round(100 * have / Math.max(1, need))); return __L("<div class=\"alrow{0}\"><span>{1}</span><div class=\"pbar\"><i style=\"width:{2}%\"></i><b>{3} / {4}</b></div><em>{5}</em></div>", [(have >= need ? ' done' : ''), (lbl), (pct), (Math.min(have, need)), (need), (have >= need ? '✓' : '')]); };
    var rows = [bar(__L("Seviye"), pr.level.have, pr.level.need)];
    if (pr.hands) rows.push(bar(__L("Oynanan el (bot masası dahil)"), pr.hands.have, pr.hands.need));
    if (pr.real) rows.push(bar(__L("Çevrim içi el"), pr.real.have, pr.real.need));
    var gains = [__L("<li>Bu mekânda Hızlı Katıl, arkadaş odası ve bota karşı masa</li>")];
    if (t.tiles) gains.push(__L("<li>Mekâna özel taşlar: <b>{0}</b> <span class=\"almat\">{1}</span></li>", [(TILE_MAT_NAMES[t.tiles] || t.tiles), (['ates', 'su', 'gunes', 'yildiz'].map(function (c) { return __L("<img src=\"assets/tiles/{0}/tas-{1}.webp\" alt=\"\">", [(t.tiles), (c)]); }).join(''))]));
    overlay(__L("<h2>{0}</h2><div class=\"alock\"><div class=\"pic\">{1}<img class=\"lk\" src=\"{2}kilit.webp\" alt=\"\"></div><div class=\"info\"><p class=\"note\">{3}{4}</p><h3>Nasıl açarım?</h3>{5}<h3>Ne kazanırım?</h3><ul>{6}</ul><p class=\"note\">\"Çevrim içi el\": çevrim içi masada oynadığın ve ödül alan her el (Hızlı Katıl, arkadaş odası, kıraathane masası). Açılan mekân bir daha kapanmaz. Kilitli mekânı arkadaşının masasında misafir olarak görebilirsin.</p></div></div><div class=\"row\"><button class=\"primary\" id=\"alClose\">Tamam</button></div>", [(roomName(r)), (t.preview ? __L("<img src=\"{0}\" alt=\"\">", [(t.preview)]) : ''), (UI), (r.sub), (t.desc ? ' · ' + esc(t.desc) : ''), (rows.join('')), (gains.join(''))]), 'arenalock');
    $('alClose').onclick = function () { if (G) backToGame(); else overlay(null); };
  }
  function roomOf(theme) { for (var i = 0; i < ROOMS.length; i++) if (ROOMS[i].theme === theme) return ROOMS[i]; return ROOMS[0]; }
  var lobbySel = roomOf(settings.theme).soon ? 'koy' : (settings.theme || 'koy');
  // çevrim dışı (prototip) ilerleme: sunucu yoksa aynı formülle yerel XP
  function screen(html, cls) { // sahne içinde tam ekran katman (1600×900, oyunla aynı ölçek)
    var s = $('screen');
    document.documentElement.classList.toggle('scr', !!html); // v9.77: menü ekranları açıkken telefon yan bantları (masa uzantısı) gizli
    if (!html) { s.innerHTML = ''; s.className = ''; s.hidden = true; return; }
    s.hidden = false; s.className = cls || ''; s.innerHTML = html;
  }
  // FOG açılışı: süre yalnızca logo gerçekten görünürken işler (dikey telefonda çevirme uyarısının arkasında ya da sekme gizliyken sayaç durur,
  // yataya dönünce kaldığı yerden sürer). Bir kez tamamlanınca bir daha oynamaz; yön/boyut değişimi açılışı ne bitirir ne yeniden başlatır.
  var SPLASH_ENABLED = false; // FOG açılış logosu şimdilik kapalı (kullanıcı kararı, 7 Ekim 2026); görseli archive/ui/fog.webp
  var splash = { done: false, next: null, ms: 2200, shown: 0, since: 0, timer: null, outTimer: null, started: false };
  var splashDone = false; // geriye uyumluluk (okunur)
  function splashVisible() { return !document.hidden && !document.documentElement.classList.contains('portrait'); }
  function preloadUi() { ['giris-arkaplan', 'logo', 'buton-oyna', 'buton-misafir', 'lobi-arkaplan', 'kart-acik', 'ust-profil', 'ust-jeton', 'yuvarlak-buton', 'pencere', 'pencere-cerceve', 'serit-baslik', 'buton-x'].forEach(function (n) { var im = new Image(); im.src = UI + n + '.webp'; }); } // giriş/lobi görsellerini önceden yükle (yavaş ağda boş kart/arka plan görünmesin)
  function showSplash(next) {
    if (!SPLASH_ENABLED) { splash.done = true; splashDone = true; preloadUi(); next(); return; }
    if (splash.done) { next(); return; }
    if (splash.next) { splash.next = next; return; } // zaten oynuyor: yalnızca devam hedefi güncellenir
    splash.next = next; APP.state = 'SPLASH';
    screen(__L("<div class=\"splash\"><img src=\"{0}fog.webp\" alt=\"FOG\"><small>sunar</small></div>", [(UI)]), 'dark');
    preloadUi();
    splash.ms = settings.reduceMotion ? 1200 : 2200; splash.shown = 0; splash.since = 0; splash.started = false;
    splashTick();
  }
  function splashFinish() {
    if (splash.done) return;
    clearTimeout(splash.timer); clearTimeout(splash.outTimer); splash.timer = splash.outTimer = null;
    splash.done = true; splashDone = true;
    var n = splash.next; splash.next = null; if (n) n();
  }
  function splashTick() { // görünürlük / yön değişiminde çağrılır: görünür süreyi biriktirir, kalan süreyi yeniden kurar
    if (splash.done || !splash.next) return;
    var now = Date.now();
    if (splash.since) { splash.shown += now - splash.since; splash.since = 0; }
    clearTimeout(splash.timer); clearTimeout(splash.outTimer); splash.timer = splash.outTimer = null;
    var el = $('screen').querySelector('.splash');
    if (!splashVisible()) { if (el) el.classList.remove('out'); return; } // duraklat: logo yerinde kalır, süre işlemez
    if (!splash.started && el) { splash.started = true; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; } // ilk gerçek görünüşte giriş animasyonu baştan
    splash.since = now;
    var left = Math.max(0, splash.ms - splash.shown);
    if (left <= 0) { splashFinish(); return; }
    splash.outTimer = setTimeout(function () { var e = $('screen').querySelector('.splash'); if (e) e.classList.add('out'); }, Math.max(0, left - 500));
    splash.timer = setTimeout(splashFinish, left);
  }
  document.addEventListener('visibilitychange', splashTick);
  function showLogin() {
    stopSession(); overlay(null); APP.state = 'LOGIN';
    screen(__L("<div class=\"login\"><img class=\"bg\" src=\"{0}giris-arkaplan.webp\" alt=\"\"><img class=\"logo\" src=\"{1}logo.webp\" alt=\"DÖNGÜ\"><div class=\"sub\">Americano Okey</div><button class=\"imgbtn misafir\" id=\"gGuest\" style=\"left:800px;top:680px\"><img src=\"{2}buton-misafir.webp\" alt=\"\"><span>Misafir Girişi</span></button><div class=\"ver\">v{3}{4}</div></div>", [(UI), (UI), (UI), (VERSION), (ACC.auth ? __L(" · kayıtlı misafir") : '')]));
    if (window.DonguI18n) { var lb = document.createElement('button'); lb.className = 'soft langbtn'; lb.id = 'gLang'; lb.setAttribute('translate', 'no'); lb.textContent = DonguI18n.lang === 'en' ? '🌐 Türkçe' : '🌐 English'; lb.onclick = function () { DonguI18n.set(DonguI18n.lang === 'en' ? 'tr' : 'en'); }; var lg = document.querySelector('.login'); if (lg) lg.appendChild(lb); } // v10.11: giriş ekranında dil
    $('gGuest').onclick = function () { $('gGuest').disabled = true; tryLandscape(); guestLogin(); };
  }
  if (NATIVE) { try { var CP = window.Capacitor.Plugins || {}; if (CP.StatusBar) CP.StatusBar.hide().catch(function () {}); if (CP.App) CP.App.addListener('backButton', function () { if ($('overlay').firstChild) { overlay(null); return; } if (G && !G.tutorial && !G.finished) { confirmLeave(showMainMenu); return; } if (APP.state === 'LOBBY' || APP.state === 'LOGIN' || APP.state === 'MENU') { CP.App.minimizeApp && CP.App.minimizeApp(); return; } showLobby(); }); } catch (e) {} } // v10.02: mağaza uygulaması
  function guestLogin() {
    if (selfHosted() && !consentOk()) { showConsent(function () { guestLogin(); }); return; } // v10.01 (K134): 18+ ve yasal metin onayı (gerçek sunucuda; metin sürümü değişince yeniden)
    if (!myAvatar) { var a = Object.assign({}, DEFAULT_AV); a.name = __L("Misafir {0}", [(1000 + Math.floor(Math.random() * 9000))]); myAvatar = normAvatar(a); store('ao.avatar', myAvatar); } // profil cihazda; sunucuda da aynı kimlikle
    var go = function () { tileTransition(function () { if (!settings.welcomed && !settings.tutorialDone) showWelcomeTut(); else showLobby(); }); };
    if (!selfHosted()) { go(); return; }
    ACC.tried = false; accBoot(go); // önce hesap (varsa geri yüklenir), sonra geçiş; sunucuya ulaşılamazsa yine devam
  }
  function tileTransition(mid) { // Döngü taşları halka olup döner, ortada DÖNGÜ; sonra kenarlara açılıp yeni ekranı gösterir
    var N = 12, R = 250, fast = settings.reduceMotion, html = '';
    for (var i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2, x = 800 + Math.cos(a) * R, y = 450 + Math.sin(a) * R, ox = 800 + Math.cos(a) * 1300, oy = 450 + Math.sin(a) * 1300;
      html += __L("<div class=\"tt\" style=\"--x:{0}px;--y:{1}px;--ox:{2}px;--oy:{3}px;--d:{4}ms;--c:{5}\"><svg viewBox=\"0 0 24 24\"><path d=\"M12 4a8 8 0 1 1-8 8 6 6 0 1 0 6-6 4 4 0 1 1-4 4 2 2 0 1 0 2-2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\"/></svg></div>", [(x.toFixed(0)), (y.toFixed(0)), (ox.toFixed(0)), (oy.toFixed(0)), (i * 30), (i % 4)]);
    }
    var d = document.createElement('div'); d.className = 'trans' + (fast ? ' fast' : ''); d.innerHTML = __L("{0}<div class=\"ttlogo\">DÖNGÜ</div>", [(html)]);
    $('stage').appendChild(d);
    var t1 = fast ? 250 : 650, t2 = fast ? 500 : 1400;
    setTimeout(function () { mid(); d.classList.add('open'); }, t1); // halka kurulunca alttaki ekran değişir, taşlar açılır
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, t2);
  }
  function windowHTML(title, body, okText, extra) {
    return __L("<div class=\"win\"><img class=\"frame\" src=\"{0}pencere.webp\" alt=\"\"><div class=\"title\">{1}</div><div class=\"body\">{2}</div>{3}{4}</div>", [(UI), (title), (body), (okText ? __L("<button class=\"imgbtn ok\" id=\"wOk\"><img src=\"{0}buton-onay.webp\" alt=\"\"></button><div class=\"oklbl\">{1}</div>", [(UI), (okText)]) : ''), (extra || '')]);
  }
  function showWelcomeTut() {
    stopSession(); APP.state = 'WELCOME';
    // v10.06 (K145): tek karar — "Başlayalım" kısa alıştırmayı hemen başlatır (tester geri bildirimi: baştan seçenek sunulmasın). Bilenler için küçük "atla"; tüm bölümler lobide "Nasıl Oynanır?"
    screen(__L("<div class=\"lobbybg\"><img class=\"bg\" src=\"{0}lobi-arkaplan.webp\" alt=\"\"></div>{1}", [(UI), (windowHTML(__L("Döngü'ye Hoş Geldin"),
      __L("<p>Önce sana oyunun temelini göstereyim: taş çekme, dizme ve atma. Oynayarak öğreneceksin, 2 dakika sürer.</p><div class=\"row\" style=\"justify-content:center;gap:14px;margin-top:8px\"><button class=\"good big\" id=\"wTut\">Başlayalım</button></div><div class=\"row\" style=\"justify-content:center;margin-top:6px\"><button class=\"link\" id=\"wPlay\">Okey biliyorum, atla</button></div>"),
      null))]), 'lobby');
    $('wTut').onclick = function () { guard(function () { settings.welcomed = true; saveSettings(); screen(null); startModule(0, 0, 'quick'); }); }; // v9.89 (K112): kısa yol — Temel Kontroller + Per ve El Açma
    $('wPlay').onclick = function () { guard(function () { settings.welcomed = true; saveSettings(); showLobby(); }); }; // atlamak eğitimi tamamlanmış saymaz; "Nasıl Oynanır?" her zaman açık
  }
  // ---- Lobi ----
  // ---------- v9.93 (K118): arkadaşlık + özel mesaj (sunucu: social.js) ----------
  // Sosyal soket: girişten sonra sürekli açık (oyun soketinden ayrı); çevrim içi varlık + anlık bildirimler (istek, kabul, mesaj, okundu).
  // Bütün kurallar sunucuda; istemci yalnız gösterir. Mesaj metni her yerde textContent ile yazılır (HTML işlenmez).
  var SOC = { ws: null, on: false, retry: 0, ka: null, requests: 0, unread: 0, data: null, tab: 'friends', open: null, peer: null, msgs: [], more: false, canSend: false, why: '', loading: false, menu: null, lastNote: 0, readIds: {} };
  function socUrl() { if (NATIVE) return 'wss://' + SERVER_HOST; return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host; }
  function socConnect() {
    if (!ACC.on || !ACC.auth || !/^https?:$/.test(location.protocol)) return;
    if (SOC.ws && SOC.authId !== ACC.auth.id) { try { SOC.ws.onclose = null; SOC.ws.close(); } catch (e) {} SOC.ws = null; SOC.on = false; } // hesap değişti: yeni hesapla bağlan
    if (SOC.ws && (SOC.ws.readyState === 0 || SOC.ws.readyState === 1)) return;
    var ws; try { ws = new WebSocket(socUrl()); } catch (e) { return; }
    SOC.ws = ws; SOC.authId = ACC.auth.id;
    ws.onopen = function () { try { ws.send(JSON.stringify({ t: 'social', acc: ACC.auth })); } catch (e) {} clearInterval(SOC.ka); SOC.ka = setInterval(function () { if (ws.readyState === 1) { try { ws.send(JSON.stringify({ t: 'ping' })); } catch (e) {} } }, 25000); };
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } locData(m); if (m && m.t === 'social') socEvent(m); };
    ws.onerror = function () {};
    ws.onclose = function () { clearInterval(SOC.ka); SOC.on = false; if (SOC.ws !== ws) return; SOC.ws = null; var wait = Math.min(30000, Math.round(2000 * Math.pow(1.7, SOC.retry++))); setTimeout(socConnect, wait); socBadge(); };
  }
  function socEvent(m) {
    var meId = ACC.auth ? ACC.auth.id : '';
    if (m.ev === 'hello') { SOC.on = true; SOC.retry = 0; SOC.requests = m.requests || 0; SOC.unread = m.unread || 0; socBadge(); if (APP.state === 'FRIENDS') socRefresh(); if (dmOpen() && SOC.peer) dmReload(); return; } // yeniden bağlanınca durum sunucudan (kopya üretmez: kimlikle birleştirilir)
    if (m.ev === 'denied') { SOC.on = false; return; }
    if (m.ev === 'acc') { if (m.text) toast(m.text, '', 5000); if (ACC.on) api('/api/me', accBody(accProfile()), function (e, p) { if (!e && p) { ACC.player = p; if (APP.state === 'LOBBY') showLobby(); } }); return; } // v10.07 (K164): yönetim hediyesi (altın / seviye / ürün) — hesap hemen yenilenir
    if (m.ev === 'invite' && m.code && m.from) { // v10.10 (K177): masa daveti — maçta/odadaysan küçük bildirim (Arkadaşlar → Davetler), değilsen hemen sorulur
      SOC.invites = liveInvites().filter(function (x) { return x.code !== m.code; }); var iv = { from: m.from, code: m.code, hands: m.hands, theme: m.theme, kind: m.kind, at: Date.now() }; SOC.invites.push(iv);
      var idle = !(G && !G.finished) && (APP.state === 'ONLINE' || ((APP.state === 'LOBBY' || APP.state === 'TABLES') && !document.querySelector('#overlay .card'))); // boşta (lobi, masa seçimi, çevrim içi menü): pencere; maçta, odada, kıraathanede, mağazada, açık pencerede: küçük bildirim + Arkadaşlar → Masa davetleri
      if (idle) showInvitePrompt(iv); else { socNote(__L("🎴 {0} seni masasına çağırıyor — Arkadaşlar → Masa davetleri", [(m.from.name)])); if (APP.state === 'FRIENDS' && SOC.tab === 'friends') socRenderList(); }
      return; }
    if (m.ev === 'request') { SOC.requests++; socBadge(); socNote(__L("👥 {0} arkadaşlık isteği gönderdi", [(m.from ? m.from.name : __L("Biri"))])); if (APP.state === 'FRIENDS') socRefresh(); return; }
    if (m.ev === 'accept') { socNote(__L("🎉 {0} isteğini kabul etti — artık arkadaşsınız", [(m.from ? m.from.name : __L("Biri"))])); if (APP.state === 'FRIENDS') socRefresh(); if (dmOpen() && SOC.peer && m.from && m.from.id === SOC.peer) dmReload(); if (SOC.pfRefresh) SOC.pfRefresh(); return; }
    if (m.ev === 'unfriend' || m.ev === 'sync') { socSummary(); if (APP.state === 'FRIENDS') socRefresh(); if (dmOpen() && SOC.peer) dmReload(); if (SOC.pfRefresh) SOC.pfRefresh(); return; }
    if (m.ev === 'dm' && m.msg) { var msg = m.msg, mine = msg.sender === meId, peer = mine ? msg.recipient : msg.sender;
      if (dmOpen() && SOC.peer === peer) { if (dmAppend(msg)) { dmScrollEnd(); if (!mine) api('/api/dm/read', accBody({ peer: peer }), function () {}); } }
      else if (!mine) { SOC.unread++; socBadge(); socNote('💬 ' + (m.fromName || socPeerName(msg.sender)) + ': ' + msg.body.slice(0, 60) + (msg.body.length > 60 ? '…' : '')); if (APP.state === 'FRIENDS') socRefresh(); }
      return; }
    if (m.ev === 'read') { var ids = m.ids || []; ids.forEach(function (id) { SOC.readIds[id] = 1; }); if (dmOpen() && SOC.peer === m.by) { SOC.msgs.forEach(function (x) { if (x.sender === meId && ids.indexOf(x.id) >= 0) x.read = true; }); dmRenderAll(); } return; } // readIds: okundu bildirimi kendi gönderim cevabından önce gelebilir
    if (m.ev === 'readSelf') { socSummary(); return; }
    if (m.ev === 'presence') { if (SOC.data) SOC.data.friends.forEach(function (f) { if (f.id === m.id) f.online = !!m.online; }); if (dmOpen() && SOC.peer === m.id && SOC.canSend && $('dmOn')) $('dmOn').textContent = m.online ? __L("● çevrim içi") : __L("çevrim dışı — mesajın saklanır"); if (APP.state === 'FRIENDS' && SOC.tab === 'friends') socRenderList(); return; }
  }
  function socPeerName(id) { var d = SOC.data; if (!d) return __L("Arkadaşın"); var f = d.friends.filter(function (x) { return x.id === id; })[0]; return f ? f.name : __L("Arkadaşın"); }
  function socSummary() { if (!ACC.on) return; api('/api/social/me', accBody(), function (e, d) { if (e || !d) return; SOC.data = d; SOC.requests = d.requests || 0; SOC.unread = d.unreadTotal || 0; socBadge(); }); }
  function socNote(text) { // engellemeyen küçük bildirim (maç içinde de): oyun bildirimlerinin yerini almaz, 3,5 sn
    var old = document.querySelector('.toast.soc'); if (old) old.remove();
    var d = document.createElement('div'); d.className = 'toast soc'; d.textContent = text; document.body.appendChild(d); SOC.lastNote = Date.now();
    d.onclick = function () { d.remove(); if (!G && APP.state === 'LOBBY') showFriends(); };
    setTimeout(function () { d.remove(); }, 3500);
  }
  function socBadge() { var n = (SOC.requests || 0) + (SOC.unread || 0), b = $('nav-arkadas'); if (!b) return; var old = b.querySelector('.nbadge'); if (old) old.remove(); if (n > 0) { var e = document.createElement('b'); e.className = 'nbadge'; e.textContent = n > 99 ? '99+' : String(n); b.appendChild(e); } }
  function socAvatarHTML(b, cls) { var a = b && b.avatar ? normAvatar(b.avatar) : null; if (a && a.full && a.full !== 'yok' && charIcon(a.full)) return __L("<img class=\"av {0}\" src=\"{1}\" alt=\"\" draggable=\"false\">", [(cls || ''), (charIcon(a.full))]); return charImgHTML(a || DEFAULT_AV, 'bust', cls || ''); }
  function socErr(e) { toast(humanError(e && e.message ? e.message : __L("Sunucuya ulaşılamadı")), 'warn', 3200); }
  // ---- v10.10 (K177): masa daveti ve "Bu grupla yeniden" ----
  function liveInvites() { var now = Date.now(); return (SOC.invites || []).filter(function (x) { return now - x.at < 10 * 60 * 1000; }); }
  function inviteWhat(iv) { var th = iv.theme && THEMES[iv.theme] ? THEMES[iv.theme].name : ''; return (iv.hands ? __L("{0} El", [(iv.hands)]) : __L("oda")) + (th ? ' · ' + th : '') + (iv.kind === 'venue' ? __L(" · kıraathane masası") : ''); }
  function serverUrl() { return settings.server || (selfHosted() ? srvHost() : ''); }
  function joinRoomCode(c) { // kodla katılma (Çevrim içi oda → Katıl ile aynı)
    var u = serverUrl(); if (!u) { toast(__L("Sunucu adresi yok: çevrim içi menüsünden bağlan."), 'warn'); return; } var av = matchAvatar();
    NET.expectJoin(__L("davet")); NET.connect(u, function () { NET.abandonSaved(c); var sv = savedNet(); NET.send(sv && sv.code === c && !sv.left ? { t: 'join', code: c, token: sv.token, name: av.name, avatar: av, skins: skinCount(), acc: ACC.auth } : { t: 'join', code: c, name: av.name, avatar: av, skins: skinCount(), acc: ACC.auth }); });
  }
  function acceptInvite(iv) { SOC.invites = liveInvites().filter(function (x) { return x !== iv; }); overlay(null); joinRoomCode(iv.code); }
  function showInvitePrompt(iv) {
    overlay(__L("<h2>Masa daveti</h2><div class=\"srow\"><div class=\"sav\">{0}</div><div class=\"sinfo\"><b>{1}</b><span class=\"note\">seni masasına çağırıyor · {2}</span></div></div><div class=\"row\"><button class=\"primary\" id=\"invYes\">Katıl</button><button class=\"soft\" id=\"invNo\">Şimdi değil</button></div>", [(socAvatarHTML(iv.from, 'sav')), (esc(iv.from.name)), (inviteWhat(iv))]));
    $('invYes').onclick = function () { acceptInvite(iv); };
    $('invNo').onclick = function () { overlay(null); if (APP.state === 'LOBBY') showLobby(); };
  }
  function createRoomInvite(people, opts) { // oda kur → kurulunca davetler gider (people: [{id, name}])
    if (!ACC.on) { toast(__L("Davet için çevrim içi hesap gerekir."), 'warn'); return; }
    var u = serverUrl(); if (!u) { toast(__L("Sunucu adresi yok."), 'warn'); return; } var av = matchAvatar();
    NET.pendingInvites = people.slice(0, 3); NET.inviteNames = {}; people.forEach(function (x) { NET.inviteNames[x.id] = x.name; });
    NET.expectJoin(__L("oda kur")); NET.connect(u, function () { NET.abandonSaved(null); NET.send({ t: 'create', name: av.name, avatar: av, skins: skinCount(), acc: ACC.auth, settings: { claimTime: settings.claimTime, jokerPenalty: settings.jokerPenalty, totalHands: opts.hands || settings.mode, theme: opts.theme || settings.theme } }); });
  }
  function sendInvites(people, code) {
    NET.invites = NET.invites || {};
    people.forEach(function (x) { NET.invites[x.id] = { name: x.name || (NET.inviteNames || {})[x.id] || __L("Oyuncu"), st: __L("gidiyor") }; api('/api/social/invite', accBody({ target: x.id, code: code }), function (e, out) { NET.invites[x.id].st = e ? __L("olmadı") : (out && out.online ? __L("davet gitti") : __L("çevrim dışı")); if (e) NET.invites[x.id].why = humanError(e.message); if (APP.state === 'ROOM' && NET.lastRoom) showRoom(NET.lastRoom); }); });
    if (APP.state === 'ROOM' && NET.lastRoom) showRoom(NET.lastRoom);
  }
  function showInvitePicker() { // odadayken: çevrim içi arkadaşlar + son masa arkadaşları
    var code = NET.code; if (!code) return;
    overlay(__L("<h2>Masaya davet et</h2><div class=\"socbody\" id=\"invBody\"><p class=\"note\">Yükleniyor…</p></div><div class=\"row\"><button class=\"primary\" id=\"invBack\">Odaya dön</button></div>"), 'socwin');
    $('invBack').onclick = function () { if (NET.lastRoom) showRoom(NET.lastRoom); };
    api('/api/social/me', accBody(), function (e, d) { api('/api/social/recent', accBody(), function (e2, rec) {
      var el = $('invBody'); if (!el) return; var seen = {}, rows = [];
      ((d && d.friends) || []).forEach(function (f) { seen[f.id] = 1; rows.push({ b: f, on: f.online, tag: __L("Arkadaş") }); });
      ((rec && rec.players) || []).forEach(function (r) { if (seen[r.id]) return; seen[r.id] = 1; rows.push({ b: r, on: r.online, tag: __L("Son masandan") }); });
      if (!rows.length) { el.innerHTML = __L("<p class=\"note\">Davet edebileceğin kimse yok: arkadaş ekle ya da Hızlı Katıl'da oyna — son masa arkadaşların burada görünür. Oda kodunu ({0}) arkadaşına kendin de gönderebilirsin.</p>", [(esc(code))]); return; }
      el.innerHTML = rows.map(function (x) { var st = NET.invites && NET.invites[x.b.id]; return socRow(x.b, st ? '<span class="note">' + esc(st.st) + '</span>' : (x.on ? __L("<button class=\"primary mini\" data-inv=\"{0}\">Davet et</button>", [(esc(x.b.id))]) : __L("<span class=\"note\">çevrim dışı</span>")), __L("{0} · {1} · Seviye {2}", [(x.on ? __L("<i class=\"on\"></i>Çevrim içi") : __L("Çevrim dışı")), (x.tag), (x.b.level || 1)])); }).join('');
      Array.prototype.forEach.call(el.querySelectorAll('[data-inv]'), function (bt) { bt.onclick = function () { var id = bt.dataset.inv, nm = (rows.filter(function (x) { return x.b.id === id; })[0] || { b: {} }).b.name; bt.disabled = true; sendInvites([{ id: id, name: nm }], code); bt.outerHTML = __L("<span class=\"note\">davet gidiyor…</span>"); }; });
    }); });
  }
  function regroupPeople() { // maç sonu "Bu grupla yeniden": masadaki diğer oyuncular (açık botlar hariç)
    var out = []; (NET.seats || []).forEach(function (x, i) { if (!x || i === NET.seat || x.bot || !x.prof || !x.prof.id) return; out.push({ id: x.prof.id, name: x.name }); }); return out;
  }
  function socAct(path, target, cb) { api(path, accBody({ target: target }), function (e, out) { if (e) { socErr(e); if (cb) cb(e); return; } socSummary(); if (cb) cb(null, out); }); }
  // ---- Arkadaşlar penceresi ----
  function showFriends() {
    if (!ACC.on) { toast(__L("Arkadaş listesi çevrim içi hesapla çalışır: oyunu sunucu adresinden aç."), 'warn', 3200); return; }
    APP.state = 'FRIENDS'; SOC.menu = null;
    overlay(__L("<h2>Arkadaşlar</h2><div class=\"soctabs\" id=\"socTabs\"></div><div class=\"socbody\" id=\"socBody\"><p class=\"note\">Yükleniyor…</p></div><div class=\"socadd\"><span class=\"note\">Senin kodun: <code id=\"socMyCode\">{0}</code> <button class=\"soft mini\" id=\"socCopy\">Kopyala</button></span><div class=\"row\"><input id=\"socCode\" maxlength=\"40\" placeholder=\"Arkadaşının kodu (p_…)\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\"><button class=\"soft\" id=\"socAddBtn\">Arkadaş ekle</button></div></div><div class=\"row\"><button class=\"primary\" id=\"socClose\">Kapat</button></div>", [(esc(ACC.auth.id))]), 'socwin');
    $('socClose').onclick = function () { overlay(null); APP.state = 'LOBBY'; showLobby(); };
    $('socCopy').onclick = function () { var c = ACC.auth.id; try { if (navigator.clipboard) navigator.clipboard.writeText(c); } catch (e) {} toast(__L("Kodun kopyalandı: {0}", [(c)]), '', 2200); };
    $('socAddBtn').onclick = function () { var v = ($('socCode').value || '').trim(); if (!v) { toast(__L("Arkadaşının kodunu yaz (profilindeki \"Senin kodun\")."), 'warn'); return; } socAct('/api/social/request', v, function (e, out) { if (e) return; $('socCode').value = ''; toast(out.state === 'friends' ? __L("{0} ile artık arkadaşsınız (o da istek göndermişti).", [(out.target.name)]) : __L("{0} kişisine istek gönderildi.", [(out.target.name)]), ''); socRefresh(); }); };
    $('socCode').onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('socAddBtn').click(); } };
    socRefresh();
  }
  function socRefresh() {
    api('/api/social/me', accBody(), function (e, d) {
      if (APP.state !== 'FRIENDS' || !$('socBody')) return;
      if (e || !d) { $('socBody').innerHTML = __L("<p class=\"note\">Liste alınamadı: {0}. Biraz sonra yeniden dene.</p>", [(esc(e ? humanError(e.message) : __L("bilinmeyen hata")))]); return; }
      SOC.data = d; SOC.requests = d.requests || 0; SOC.unread = d.unreadTotal || 0; socBadge(); socRenderTabs(); socRenderList();
    });
  }
  function socRenderTabs() {
    var d = SOC.data || { friends: [], in: [], out: [], blocked: [] }, reqN = d.in.length + d.out.length, unread = d.unreadTotal || 0;
    var tabs = [['friends', __L("Arkadaşlar"), d.friends.length, unread], ['requests', __L("İstekler"), reqN, d.in.length], ['blocked', __L("Engellenenler"), d.blocked.length, 0]];
    $('socTabs').innerHTML = tabs.map(function (t) { return __L("<button class=\"stab{0}\" data-tab=\"{1}\">{2} <span>{3}</span>{4}</button>", [(SOC.tab === t[0] ? ' on' : ''), (t[0]), (t[1]), (t[2]), (t[3] ? '<b class="nbadge in">' + t[3] + '</b>' : '')]); }).join('');
    Array.prototype.forEach.call($('socTabs').querySelectorAll('.stab'), function (b) { b.onclick = function () { SOC.tab = b.dataset.tab; SOC.menu = null; socRenderTabs(); socRenderList(); }; });
  }
  function socRow(b, right, sub) { return __L("<div class=\"srow\" data-id=\"{0}\"><div class=\"sav\">{1}</div><div class=\"sinfo\"><b>{2}</b><span class=\"note\">{3}</span></div><div class=\"sbtns\">{4}</div></div>", [(esc(b.id)), (socAvatarHTML(b, 'sav')), (esc(b.name)), (sub || (__L("Seviye {0}", [(b.level || 1)]))), (right)]); }
  function socRenderList() {
    var d = SOC.data, el = $('socBody'); if (!d || !el) return; var html = '';
    if (SOC.tab === 'friends') {
      var invs = liveInvites(); if (invs.length) html += __L("<h3>Masa davetleri</h3>{0}<h3>Arkadaşlar</h3>", [(invs.map(function (iv) { return __L("<div class=\"srow\" data-id=\"{0}\"><div class=\"sav\">{1}</div><div class=\"sinfo\"><b>{2}</b><span class=\"note\">seni masasına çağırıyor · {3}</span></div><div class=\"sbtns\"><button class=\"primary mini\" data-act=\"joininv\">Katıl</button></div></div>", [(esc(iv.code)), (socAvatarHTML(iv.from, 'sav')), (esc(iv.from.name)), (inviteWhat(iv))]); }).join(''))]); // v10.10 (K177)
      if (!d.friends.length) html += __L("<p class=\"note\">Henüz arkadaşın yok. Masada bir oyuncunun karakterine dokunup profilinden \"Arkadaş ekle\" diyebilir ya da aşağıya arkadaşının kodunu yazabilirsin.</p>");
      else html += d.friends.map(function (f) { var menuOpen = SOC.menu === f.id; return socRow(f, __L("{0}<button class=\"good mini vgo{1}\" data-act=\"venue\" title=\"{2}\">🏠 Kıraathanesine Git</button><button class=\"soft mini msg\" data-act=\"dm\">💬 Mesaj{3}</button><button class=\"soft mini more\" data-act=\"menu\" title=\"Diğer\">⋯</button>", [(f.online && INVITE_ON ? __L("<button class=\"primary mini\" data-act=\"play\" title=\"Oda kur ve davet et\">🎴 Oyna</button>") : ''), (f.venue ? '' : ' off'), (f.venue ? esc(f.venue.name) : __L("Bu arkadaşın henüz kıraathanesi yok.")), (f.unread ? '<b class="nbadge in">' + f.unread + '</b>' : '')]), __L("{0} · Seviye {1}{2}", [(f.online ? __L("<i class=\"on\"></i>Çevrim içi") : __L("Çevrim dışı")), (f.level || 1), (f.venue ? ' · 🏠 ' + esc(f.venue.name) : __L(" · kıraathanesi yok"))])) + (menuOpen ? __L("<div class=\"smenu\" data-id=\"{0}\"><button class=\"soft mini\" data-act=\"unfriend\">Arkadaşlıktan çıkar</button><button class=\"soft mini\" data-act=\"block\">Engelle</button><button class=\"soft mini\" data-act=\"report\">Şikâyet et</button></div>", [(esc(f.id))]) : ''); }).join('');
    } else if (SOC.tab === 'requests') {
      html = __L("<h3>Gelen istekler{0}</h3>{1}<h3>Gönderdiğin istekler{2}</h3>{3}", [(d.in.length ? ' (' + d.in.length + ')' : ''), (d.in.length ? d.in.map(function (f) { return socRow(f, __L("<button class=\"primary mini\" data-act=\"accept\">Kabul et</button><button class=\"soft mini\" data-act=\"reject\">Reddet</button><button class=\"soft mini more\" data-act=\"menu\" title=\"Diğer\">⋯</button>")) + (SOC.menu === f.id ? __L("<div class=\"smenu\" data-id=\"{0}\"><button class=\"soft mini\" data-act=\"block\">Engelle</button><button class=\"soft mini\" data-act=\"report\">Şikâyet et</button></div>", [(esc(f.id))]) : ''); }).join('') : __L("<p class=\"note\">Gelen istek yok.</p>")), (d.out.length ? ' (' + d.out.length + ')' : ''), (d.out.length ? d.out.map(function (f) { return socRow(f, __L("<span class=\"note\">İstek gönderildi</span><button class=\"soft mini\" data-act=\"cancel\">Geri çek</button>")); }).join('') : __L("<p class=\"note\">Bekleyen isteğin yok.</p>"))]);
    } else {
      html = d.blocked.length ? d.blocked.map(function (f) { return socRow(f, __L("<button class=\"soft mini\" data-act=\"unblock\">Engeli kaldır</button><button class=\"soft mini\" data-act=\"report\">Şikâyet et</button>"), __L("Engelli — iki yönde mesaj ve istek kapalı")); }).join('') : __L("<p class=\"note\">Engellediğin kimse yok.</p>");
    }
    el.innerHTML = html;
    Array.prototype.forEach.call(el.querySelectorAll('[data-act]'), function (b) { b.onclick = function () { var row = b.closest('.srow') || b.closest('.smenu'); socDo(b.dataset.act, row ? row.dataset.id : null); }; });
    if (SOC.tab === 'friends') Array.prototype.forEach.call(el.querySelectorAll('.srow .sav, .srow .sinfo'), function (x) { x.classList.add('tapme'); x.onclick = function () { var row = x.closest('.srow'); var f = row && socFind(row.dataset.id); if (f) showFriendCard(f); }; }); // v10.06 (K151): arkadaşın profil kartı
  }
  function showFriendCard(f) { // v10.06 (K151): arkadaş listesinden profil: seviye, durum, kıraathanesi ve düğmeler (Mesaj · Kıraathanesine Git)
    overlay(__L("<div class=\"prof\"><div class=\"pav\">{0}{1}</div><div class=\"pinfo\"><h2>{2}</h2><div class=\"prow\"><b>Seviye {3}</b> · {4}</div><div class=\"prow\">{5}</div></div></div><div id=\"pfSoc\" class=\"pfsocbox\"></div><div class=\"row\"><button class=\"primary\" id=\"pfClose\">Kapat</button></div>", [(socAvatarHTML(f, 'av')), (f.level ? __L("<b class=\"lvb big\" title=\"Seviye {0}\">{1}</b>", [(f.level), (f.level)]) : ''), (esc(f.name)), (f.level || 1), (f.online ? __L("Çevrim içi") : __L("Çevrim dışı")), (f.venue ? __L("🏠 Kıraathanesi: <b>{0}</b>", [(esc(f.venue.name))]) : __L("<span class=\"note\">Bu arkadaşın henüz kıraathanesi yok.</span>"))]), 'profcard fcard');
    socProfileButtons(f.id, f.name, $('pfSoc'));
    var close = function () { $('overlay').onclick = null; showFriends(); };
    $('pfClose').onclick = close; $('overlay').onclick = function (ev) { if (ev.target && ev.target.id === 'overlay') close(); };
  }
  function goFriendVenue(id, name) { // v10.06 (K151): kodsuz giriş — sunucu arkadaşlığı ve kıraathanenin erişimini doğrular; maçtaysan önce çıkış onayı
    if (!ACC.on || !window.Venue || !Venue.visitFriend) { toast(__L("Kıraathane ziyareti çevrim içi hesapla çalışır: oyunu dongu.app adresinden aç."), 'warn', 3200); return; }
    var go = function () { $('overlay').onclick = null; Venue.visitFriend(id, name); };
    if (G && !G.tutorial && !G.finished) { confirmLeave(go); return; }
    go();
  }
  function socFind(id) { var d = SOC.data; if (!d) return null; var all = d.friends.concat(d.in, d.out, d.blocked); return all.filter(function (x) { return x.id === id; })[0] || null; }
  function socDo(act, id) {
    if (!id) return; var b = socFind(id) || { id: id, name: __L("Oyuncu") };
    if (act === 'menu') { SOC.menu = SOC.menu === id ? null : id; socRenderList(); return; }
    if (act === 'dm') { showDM(id, b, function () { showFriends(); }); return; }
    if (act === 'venue') { goFriendVenue(id, b.name); return; } // v10.06 (K151)
    if (act === 'play') { overlay(null); createRoomInvite([{ id: id, name: b.name }], {}); return; } // v10.10 (K177): arkadaşınla oda kur + davet
    if (act === 'joininv') { var inv = (SOC.invites || []).filter(function (x) { return x.code === id; })[0]; if (inv) acceptInvite(inv); return; }
    if (act === 'accept') return socAct('/api/social/accept', id, function (e, out) { if (!e) { toast(__L("{0} ile artık arkadaşsınız.", [(out.target.name)]), ''); socRefresh(); } });
    if (act === 'reject') return socAct('/api/social/reject', id, function (e) { if (!e) socRefresh(); });
    if (act === 'cancel') return socAct('/api/social/cancel', id, function (e) { if (!e) socRefresh(); });
    if (act === 'unblock') return socAct('/api/social/unblock', id, function (e) { if (!e) { toast(__L("{0} için engel kaldırıldı (arkadaşlık geri gelmez; yeniden istek gerekir).", [(b.name)]), '', 3200); socRefresh(); } });
    if (act === 'unfriend') return socConfirm(__L("{0} arkadaşlıktan çıkarılsın mı? Mesajlaşma iki yönde kapanır; yeniden arkadaş olunca açılır.", [(b.name)]), __L("Çıkar"), function () { socAct('/api/social/unfriend', id, function (e) { if (!e) { SOC.menu = null; socRefresh(); } }); });
    if (act === 'block') return socConfirm(__L("{0} engellensin mi? Mesaj ve istek iki yönde durur, bekleyen istekler silinir. Engeli kaldırmak arkadaşlığı geri getirmez.", [(b.name)]), __L("Engelle"), function () { socAct('/api/social/block', id, function (e) { if (!e) { SOC.menu = null; toast(b.name + ' engellendi.', ''); socRefresh(); } }); });
    if (act === 'report') return socReport(id, b.name, 'liste');
  }
  function socConfirm(text, yes, fn) { // pencere içi onay şeridi (ikinci dokunuş)
    var old = document.getElementById('socConfirm'); if (old) old.remove();
    var host = $('socBody') || $('dmBody'); if (!host) { fn(); return; }
    var d = document.createElement('div'); d.id = 'socConfirm'; d.className = 'sconfirm';
    var p = document.createElement('p'); p.textContent = text; d.appendChild(p);
    var row = document.createElement('div'); row.className = 'row';
    var b1 = document.createElement('button'); b1.className = 'primary mini'; b1.textContent = yes; b1.onclick = function () { d.remove(); fn(); };
    var b2 = document.createElement('button'); b2.className = 'soft mini'; b2.textContent = __L("Vazgeç"); b2.onclick = function () { d.remove(); };
    row.appendChild(b1); row.appendChild(b2); d.appendChild(row); host.insertBefore(d, host.firstChild); d.scrollIntoView({ block: 'nearest' });
  }
  var REPORT_REASONS = [['hakaret', __L("Hakaret / taciz")], ['ad', __L("Uygunsuz ad (oyuncu / kıraathane)")], ['spam', __L("Spam / reklam")], ['hile', __L("Hile şüphesi")], ['diger', __L("Diğer")]]; // v10.11 (K178): 'ad'
  function socReport(id, name, where, defReason) { // şikâyet: sebep + not → sunucuda kayıt (reports); inceleme arayüzü yok, kayıt numarası gösterilir (v10.11: defReason ön seçim)
    var old = document.getElementById('socConfirm'); if (old) old.remove();
    var host = $('socBody') || $('dmBody') || document.querySelector('#overlay .cin'); if (!host) return;
    var d = document.createElement('div'); d.id = 'socConfirm'; d.className = 'sconfirm';
    var p = document.createElement('p'); p.textContent = __L("{0} için şikâyet: sebep seç, istersen kısa bir not ekle. Kayıt sunucuda tutulur; son mesajlar kayda eklenir.", [(name)]); d.appendChild(p);
    var sel = document.createElement('select'); sel.id = 'socReason'; REPORT_REASONS.forEach(function (r) { var o = document.createElement('option'); o.value = r[0]; o.textContent = r[1]; sel.appendChild(o); }); if (defReason) sel.value = defReason; d.appendChild(sel);
    var ta = document.createElement('textarea'); ta.id = 'socNote'; ta.maxLength = 300; ta.rows = 2; ta.placeholder = __L("Not (isteğe bağlı, en çok 300 karakter)"); d.appendChild(ta);
    var row = document.createElement('div'); row.className = 'row';
    var b1 = document.createElement('button'); b1.className = 'primary mini'; b1.textContent = __L("Şikâyeti gönder"); b1.onclick = function () { b1.disabled = true; api('/api/social/report', accBody({ target: id, reason: sel.value, note: ta.value, where: where || '' }), function (e, out) { b1.disabled = false; if (e) { socErr(e); return; } d.remove(); toast(__L("Şikâyet kaydedildi (kayıt #{0}, {1}). İncelenecek.", [(out.id), (out.reasonText)]), '', 3600); }); };
    var b2 = document.createElement('button'); b2.className = 'soft mini'; b2.textContent = __L("Vazgeç"); b2.onclick = function () { d.remove(); };
    row.appendChild(b1); row.appendChild(b2); d.appendChild(row); host.insertBefore(d, host.firstChild); d.scrollIntoView({ block: 'nearest' });
  }
  // ---- Özel mesaj penceresi ----
  function showDM(peerId, brief, onBack) {
    if (!ACC.on) return; if (!G) APP.state = 'DM'; SOC.dmOpen = true; SOC.peer = peerId; /* maç içinde APP.state GAME kalır (oyun akışı bozulmaz) */ SOC.msgs = []; SOC.more = false; SOC.canSend = false; SOC.why = ''; SOC.menu = null; SOC.back = onBack || null;
    overlay(__L("<div class=\"dmhead\"><button class=\"soft mini\" id=\"dmBack\">‹ {0}</button><div class=\"dmwho\"><b id=\"dmName\">{1}</b><span class=\"note\" id=\"dmOn\"></span></div><button class=\"soft mini more\" id=\"dmMore\" title=\"Diğer\">⋯</button></div><div class=\"dmbody\" id=\"dmBody\"><button class=\"soft mini\" id=\"dmOlder\" hidden>Daha eski mesajlar</button><div id=\"dmList\" class=\"dmlist\"></div></div><div class=\"dmfoot\" id=\"dmFoot\"><textarea id=\"dmText\" rows=\"1\" maxlength=\"500\" placeholder=\"Mesaj yaz…\" autocomplete=\"off\"></textarea><button class=\"primary\" id=\"dmSend\">Gönder</button></div><p class=\"note dmwhy\" id=\"dmWhy\" hidden></p>", [(G ? __L("Masaya dön") : __L("Arkadaşlar")), (esc(brief ? brief.name : '…'))]), 'dmwin');
    $('dmBack').onclick = function () { dmClose(); };
    $('dmMore').onclick = function () { var b = socFind(peerId) || brief || { id: peerId, name: $('dmName').textContent }; var host = $('dmBody'); var old = document.getElementById('socConfirm'); if (old) { old.remove(); return; }
      var d = document.createElement('div'); d.id = 'socConfirm'; d.className = 'sconfirm'; var row = document.createElement('div'); row.className = 'row';
      [[__L("Arkadaşlıktan çıkar"), function () { socConfirm(__L("{0} arkadaşlıktan çıkarılsın mı? Mesajlaşma iki yönde kapanır.", [(b.name)]), __L("Çıkar"), function () { socAct('/api/social/unfriend', peerId, function (e) { if (!e) dmReload(); }); }); }],
       [__L("Engelle"), function () { socConfirm(__L("{0} engellensin mi? Mesaj ve istek iki yönde durur.", [(b.name)]), __L("Engelle"), function () { socAct('/api/social/block', peerId, function (e) { if (!e) dmReload(); }); }); }],
       [__L("Şikâyet et"), function () { socReport(peerId, b.name, 'sohbet'); }]].forEach(function (it) { var bt = document.createElement('button'); bt.className = 'soft mini'; bt.textContent = it[0]; bt.onclick = function () { d.remove(); it[1](); }; row.appendChild(bt); });
      d.appendChild(row); host.insertBefore(d, host.firstChild); };
    $('dmSend').onclick = dmSend;
    $('dmText').onkeydown = function (ev) { if (ev.key === 'Enter' && !ev.shiftKey && !PHONE) { ev.preventDefault(); dmSend(); } };
    $('dmText').onfocus = function () { setTimeout(dmFit, 50); setTimeout(dmFit, 350); };
    $('dmText').oninput = function () { this.style.height = 'auto'; this.style.height = Math.min(96, this.scrollHeight) + 'px'; };
    $('dmOlder').onclick = dmOlder;
    if (window.visualViewport && !SOC.vvBound) { SOC.vvBound = true; window.visualViewport.addEventListener('resize', function () { if (dmOpen()) dmFit(); }); }
    dmReload();
  }
  function dmOpen() { return !!(SOC.dmOpen && $('dmList')); }
  function dmClose() { var back = SOC.back; SOC.peer = null; SOC.back = null; SOC.dmOpen = false; var o = $('overlay'); if (o) { o.style.cssText = ''; o.classList.remove('kb'); } if (G) { backToGame(); return; } overlay(null); APP.state = 'LOBBY'; if (back) back(); else showLobby(); }
  function dmFit() { // telefonda klavye açılınca pencere görünen alana sığar, yazı kutusu klavyenin üstünde kalır
    var o = $('overlay'), vv = window.visualViewport; if (!o || !vv || !dmOpen()) return;
    var full = window.innerHeight, h = vv.height; if (full - h > 80) { o.style.top = vv.offsetTop + 'px'; o.style.height = h + 'px'; o.style.bottom = 'auto'; o.classList.add('kb'); } else { o.style.cssText = ''; o.classList.remove('kb'); }
    dmScrollEnd();
  }
  function dmReload() {
    var peer = SOC.peer; if (!peer) return; SOC.loading = true;
    api('/api/dm/history', accBody({ peer: peer, limit: 30 }), function (e, out) {
      SOC.loading = false; if (!dmOpen() || SOC.peer !== peer) return;
      if (e || !out) { $('dmList').innerHTML = ''; var p = document.createElement('p'); p.className = 'note'; p.textContent = __L("Sohbet yüklenemedi: {0}", [(e ? humanError(e.message) : __L("bilinmeyen hata"))]); $('dmList').appendChild(p); return; }
      var keep = SOC.msgs.filter(function (x) { return x.status === 'sending' || x.status === 'failed'; }); // gönderilmekte/başarısız yerel mesajlar korunur
      SOC.msgs = out.msgs.slice(); keep.forEach(function (k) { if (!SOC.msgs.some(function (x) { return x.cid === k.cid && x.sender === k.sender; })) SOC.msgs.push(k); });
      SOC.more = !!out.more; SOC.canSend = !!out.canSend; SOC.why = out.whyText || ''; SOC.peerBrief = out.peer;
      $('dmName').textContent = out.peer ? out.peer.name : ''; $('dmOn').textContent = out.canSend ? (out.online ? __L("● çevrim içi") : __L("çevrim dışı — mesajın saklanır")) : '';
      dmRenderAll(); dmScrollEnd(); dmSyncFoot();
      if (out.msgs.some(function (x) { return x.recipient === ACC.auth.id && !x.read; })) api('/api/dm/read', accBody({ peer: peer }), function () { socSummary(); });
    });
  }
  function dmSyncFoot() { var f = $('dmFoot'), w = $('dmWhy'); if (!f) return; var ok = SOC.canSend; $('dmText').disabled = !ok; $('dmSend').disabled = !ok; w.hidden = ok; w.textContent = ok ? '' : (SOC.why || __L("Bu sohbete şu anda mesaj gönderilemez.")); $('dmOlder').hidden = !SOC.more; }
  function dmOlder() {
    var peer = SOC.peer, first = SOC.msgs.filter(function (x) { return x.id; })[0]; if (!peer || !first || SOC.loading) return; SOC.loading = true; $('dmOlder').disabled = true;
    api('/api/dm/history', accBody({ peer: peer, before: first.id, limit: 30 }), function (e, out) {
      SOC.loading = false; if (!dmOpen() || SOC.peer !== peer) return; $('dmOlder').disabled = false;
      if (e || !out) { socErr(e); return; }
      var body = $('dmBody'), beforeH = body.scrollHeight, beforeT = body.scrollTop;
      var ids = {}; SOC.msgs.forEach(function (x) { if (x.id) ids[x.id] = 1; }); var add = out.msgs.filter(function (x) { return !ids[x.id]; });
      SOC.msgs = add.concat(SOC.msgs); SOC.more = !!out.more; dmRenderAll(); $('dmOlder').hidden = !SOC.more;
      body.scrollTop = beforeT + (body.scrollHeight - beforeH); // görünüm kaymaz
    });
  }
  function dmAppend(msg) { if (msg.id && SOC.readIds[msg.id]) msg.read = true; if (SOC.msgs.some(function (x) { return (msg.id && x.id === msg.id) || (x.cid === msg.cid && x.sender === msg.sender); })) { SOC.msgs = SOC.msgs.map(function (x) { return (x.cid === msg.cid && x.sender === msg.sender) ? msg : x; }); dmRenderAll(); return false; } SOC.msgs.push(msg); dmRenderAll(); return true; }
  function dmDay(ts) { var d = new Date(ts), t = new Date(); var same = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }; if (same(d, t)) return __L("Bugün"); var y = new Date(t.getTime() - 86400000); if (same(d, y)) return __L("Dün"); if (window.DonguI18n && DonguI18n.en) return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + '/' + d.getFullYear(); return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear(); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dmTime(ts) { var d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function dmRenderAll() { // metin daima textContent ile (HTML işlenmez)
    var list = $('dmList'); if (!list) return; list.innerHTML = ''; var meId = ACC.auth.id, lastDay = '';
    if (!SOC.msgs.length) { var p = document.createElement('p'); p.className = 'note center'; p.textContent = SOC.canSend ? __L("Henüz mesaj yok. İlk mesajı sen yaz.") : __L("Henüz mesaj yok."); list.appendChild(p); return; }
    SOC.msgs.forEach(function (m) {
      var day = dmDay(m.at); if (day !== lastDay) { lastDay = day; var sep = document.createElement('div'); sep.className = 'dmday'; sep.textContent = day; list.appendChild(sep); }
      var mine = m.sender === meId, row = document.createElement('div'); row.className = 'dmrow' + (mine ? ' mine' : '');
      var bub = document.createElement('div'); bub.className = 'bub' + (m.status === 'failed' ? ' failed' : ''); var txt = document.createElement('span'); txt.className = 'txt'; txt.setAttribute('translate', 'no'); txt.textContent = m.body; bub.appendChild(txt);
      var meta = document.createElement('small'); meta.className = 'meta'; var st = '';
      if (mine) { if (m.status === 'sending') st = __L(" · gönderiliyor…"); else if (m.status === 'failed') st = __L(" · ⚠ gönderilemedi — yeniden denemek için dokun"); else st = m.read ? __L(" · ✓✓ okundu") : __L(" · ✓ gönderildi"); }
      meta.textContent = dmTime(m.at) + st; bub.appendChild(meta);
      if (mine && m.status === 'failed') bub.onclick = function () { dmResend(m); };
      row.appendChild(bub); list.appendChild(row);
    });
  }
  function dmScrollEnd() { var b = $('dmBody'); if (b) b.scrollTop = b.scrollHeight; }
  function dmNewCid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function dmSend() {
    var ta = $('dmText'); if (!ta || !SOC.canSend) return; var text = ta.value.replace(/\s+$/, ''); if (!text.trim()) return; if (text.length > 500) { toast(__L("Mesaj en çok 500 karakter."), 'warn'); return; }
    ta.value = ''; ta.style.height = 'auto';
    var m = { cid: dmNewCid(), sender: ACC.auth.id, recipient: SOC.peer, body: text, at: Date.now(), status: 'sending' }; SOC.msgs.push(m); dmRenderAll(); dmScrollEnd(); dmPost(m);
    if (!PHONE) ta.focus();
  }
  function dmResend(m) { m.status = 'sending'; m.at = m.at || Date.now(); dmRenderAll(); dmPost(m); }
  function dmPost(m) { // aynı cid ile yeniden gönderim sunucuda kopya üretmez
    var peer = SOC.peer;
    api('/api/dm/send', accBody({ to: m.recipient, body: m.body, cid: m.cid }), function (e, out) {
      if (e || !out || !out.msg) { m.status = 'failed'; if (e && /arkadaş|engel|gönderemezsin|Geçersiz alıcı|bulunamadı/.test(e.message)) { SOC.canSend = false; SOC.why = humanError(e.message); if (dmOpen() && SOC.peer === peer) dmSyncFoot(); } else if (e) toast(humanError(e.message), 'warn'); if (dmOpen() && SOC.peer === peer) dmRenderAll(); return; }
      var s = out.msg; if (SOC.readIds[s.id]) s.read = true; s.status = s.read ? 'read' : 'sent';
      SOC.msgs = SOC.msgs.map(function (x) { return (x.cid === m.cid && x.sender === m.sender) ? s : x; });
      if (dmOpen() && SOC.peer === peer) { dmRenderAll(); dmScrollEnd(); }
    });
  }
  // ---- profil kartı düğmeleri (masadaki oyuncu) ----
  function socProfileButtons(targetId, name, host) {
    if (!ACC.on || !targetId || !host) return;
    SOC.pfRefresh = function () { if (host.isConnected) socProfileButtons(targetId, name, host); else SOC.pfRefresh = null; }; // v10.00 (K124): açık kart, karşı taraf kabul/ret/engel yapınca kendini tazeler
    host.innerHTML = __L("<span class=\"note\">Arkadaşlık durumu alınıyor…</span>");
    var render = function (st, venue) {
      var h = '';
      if (st === 'self') h = '';
      else if (st === 'friends') h = __L("<span class=\"ok\">✓ Arkadaşsınız</span><button class=\"primary mini\" data-act=\"dm\">💬 Mesaj gönder</button><button class=\"good mini vgo{0}\" data-act=\"venue\">🏠 Kıraathanesine Git</button><button class=\"soft mini more\" data-act=\"menu\">⋯</button>{1}", [(venue === null ? ' off' : ''), (venue ? '<span class="note pfvenue">🏠 ' + esc(venue.name) + '</span>' : venue === null ? __L("<span class=\"note pfvenue\">Bu arkadaşın henüz kıraathanesi yok.</span>") : '')]); // v10.06 (K151)
      else if (st === 'out') h = __L("<span class=\"note\">İstek gönderildi</span><button class=\"soft mini\" data-act=\"cancel\">Geri çek</button><button class=\"soft mini more\" data-act=\"menu\">⋯</button>");
      else if (st === 'in') h = __L("<span class=\"note\">Sana istek gönderdi</span><button class=\"primary mini\" data-act=\"accept\">Kabul et</button><button class=\"soft mini\" data-act=\"reject\">Reddet</button><button class=\"soft mini more\" data-act=\"menu\">⋯</button>");
      else if (st === 'blocked') h = __L("<span class=\"note\">Engelledin</span><button class=\"soft mini\" data-act=\"unblock\">Engeli kaldır</button><button class=\"soft mini\" data-act=\"report\">Şikâyet et</button>");
      else h = __L("<button class=\"primary mini\" data-act=\"request\">＋ Arkadaş ekle</button><button class=\"soft mini more\" data-act=\"menu\">⋯</button>");
      host.innerHTML = __L("<div class=\"row pfsoc\">{0}</div><div class=\"row pfmenu\" id=\"pfMenu\" hidden>{1}{2}<button class=\"soft mini\" data-act=\"report\">Şikâyet et</button></div>", [(h), (st === 'friends' ? __L("<button class=\"soft mini\" data-act=\"unfriend\">Arkadaşlıktan çıkar</button>") : ''), (st !== 'blocked' ? __L("<button class=\"soft mini\" data-act=\"block\">Engelle</button>") : '')]);
      Array.prototype.forEach.call(host.querySelectorAll('[data-act]'), function (b) { b.onclick = function () { var act = b.dataset.act;
        if (act === 'menu') { var mn = $('pfMenu'); if (mn) mn.hidden = !mn.hidden; return; }
        if (act === 'dm') { $('overlay').onclick = null; showDM(targetId, { id: targetId, name: name }, null); return; }
        if (act === 'venue') { goFriendVenue(targetId, name); return; } // v10.06 (K151)
        if (act === 'report') { var host2 = host.querySelector('.pfmenu'); if (host2) host2.hidden = true; socReportInline(targetId, name, host, 'masa'); return; }
        var path = { request: '/api/social/request', cancel: '/api/social/cancel', accept: '/api/social/accept', reject: '/api/social/reject', unblock: '/api/social/unblock', unfriend: '/api/social/unfriend', block: '/api/social/block' }[act]; if (!path) return;
        if (act === 'block' || act === 'unfriend') { if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = __L("{0} — emin misin?", [(act === 'block' ? __L("Engelle") : __L("Çıkar"))]); return; } }
        socAct(path, targetId, function (e, out) { if (e) return; if (act === 'request') toast(out.state === 'friends' ? __L("Artık arkadaşsınız.") : __L("İstek gönderildi."), ''); if (act === 'accept') toast(__L("Artık arkadaşsınız."), ''); render(out.state); }); }; });
    };
    api('/api/social/state', accBody({ target: targetId }), function (e, out) { if (e || !out) { host.innerHTML = __L("<span class=\"note\">Arkadaşlık durumu alınamadı{0}</span>", [(e ? ': ' + esc(humanError(e.message)) : '')]); return; } render(out.state, out.venue); });
  }
  function socReportInline(id, name, host, where) { var box = document.createElement('div'); box.id = 'pfReport'; var old = document.getElementById('pfReport'); if (old) old.remove(); host.appendChild(box);
    var sel = document.createElement('select'); REPORT_REASONS.forEach(function (r) { var o = document.createElement('option'); o.value = r[0]; o.textContent = r[1]; sel.appendChild(o); }); box.appendChild(sel);
    var ta = document.createElement('textarea'); ta.maxLength = 300; ta.rows = 2; ta.placeholder = __L("Not (isteğe bağlı)"); box.appendChild(ta);
    var row = document.createElement('div'); row.className = 'row'; var b1 = document.createElement('button'); b1.className = 'primary mini'; b1.textContent = __L("Şikâyeti gönder"); b1.onclick = function () { b1.disabled = true; api('/api/social/report', accBody({ target: id, reason: sel.value, note: ta.value, where: where }), function (e, out) { b1.disabled = false; if (e) { socErr(e); return; } box.remove(); toast(__L("Şikâyet kaydedildi (kayıt #{0}).", [(out.id)]), '', 3200); }); };
    var b2 = document.createElement('button'); b2.className = 'soft mini'; b2.textContent = __L("Vazgeç"); b2.onclick = function () { box.remove(); }; row.appendChild(b1); row.appendChild(b2); box.appendChild(row); }
  function navBtn(id, icon, label, soon) { return __L("<button class=\"nav{0}\" id=\"nav-{1}\"><img class=\"base\" src=\"{2}yuvarlak-buton.webp\" alt=\"\"><img class=\"ic\" src=\"{3}ikon-{4}.webp\" alt=\"\">{5}<small>{6}</small></button>", [(soon ? ' soon' : ''), (id), (UI), (UI), (icon), (soon ? __L("<em>Yakında</em>") : ''), (label)]); }
  function showLobby() {
    stopSession(); overlay(null); APP.state = 'LOBBY'; NET.online = false; // açık kalan pencere (örn. Çevrim içi oda) kapanır
    if (roomLocked(roomOf(lobbySel))) lobbySel = 'koy'; // kilitli oda seçili kalmaz (seviye düzeni değişince ilk odaya dönülür)
    var a = normAvatar(myAvatar || DEFAULT_AV), lv = levelInfo(), pct = Math.round(100 * lv.into / lv.need);
    var cards = ROOMS.map(function (r) {
      var lock = roomLocked(r), t = THEMES[r.theme];
      return __L("<button class=\"rcard{0}{1}\" data-room=\"{2}\"><img class=\"frame\" src=\"{3}{4}.webp\" alt=\"\"><div class=\"ttl\">{5}</div><div class=\"pic\">{6}</div><div class=\"sub\">{7}</div><div class=\"foot\">{8}</div></button>", [(lock ? ' locked' : ''), (r.theme === lobbySel ? ' sel' : ''), (r.theme), (UI), (lock ? 'kart-kilitli' : 'kart-acik'), (roomName(r)), (t && t.preview ? __L("<img src=\"{0}\" alt=\"\">", [(t.preview)]) : '<div class="soon">🌊</div>'), (r.sub), (lock || __L("Açık"))]);
    }).join('');
    screen(__L("<div class=\"lobbybg\"><img class=\"bg\" src=\"{0}lobi-arkaplan.webp\" alt=\"\"></div><button class=\"profile\" id=\"lbProfile\"><img class=\"frame\" src=\"{1}ust-profil.webp\" alt=\"\"><div class=\"av\">{2}</div><div class=\"nm\">{3}</div><div class=\"lv\">Seviye {4}<i><b style=\"width:{5}%\"></b></i><span>{6}/{7} XP</span></div></button><div class=\"coinbox\"><img class=\"frame\" src=\"{8}ust-jeton.webp\" alt=\"\"><span>{9}</span></div><button class=\"imgbtn plus\" id=\"lbPlus\"><img src=\"{10}arti.webp\" alt=\"\"></button><button class=\"imgbtn shop\" id=\"lbShop\"><img src=\"{11}magaza.webp\" alt=\"\"></button><img class=\"logo\" src=\"{12}logo.webp\" alt=\"DÖNGÜ\"><button class=\"rarrow left\" id=\"lbPrev\" title=\"Önceki mekânlar\">‹</button><div class=\"rooms\" id=\"lbRooms\">{13}</div><button class=\"rarrow right\" id=\"lbNext\" title=\"Sonraki mekânlar\">›</button>{14}<button class=\"imgbtn play\" id=\"lbPlay\"><img src=\"{15}buton-oyna.webp\" alt=\"\"><span>OYNA</span></button><div class=\"lnav\">{16}{17}{18}{19}{20}{21}{22}{23}{24}</div>{25}", [(UI), (UI), (a.full !== 'yok' && charIcon(a.full) ? __L("<img class=\"ikon\" src=\"{0}\" alt=\"\">", [(charIcon(a.full))]) : charImgHTML(a, 'bust', 'bust')), (a.name), (lv.level), (pct), (lv.into), (lv.need), (UI), (wardrobe.coins.toLocaleString(window.__LOC || 'tr-TR')), (UI), (UI), (UI), (cards), (savedNet() ? '<button class="resumebar" id="lbResumeNet">⟳ ' + (savedNet().started ? __L("Kaldığın çevrim içi maça dön · Oda {0}{1}", [(savedNet().code), (savedNet().left ? __L(" · bot senin yerine oynuyor") : '')]) : (savedNet().host ? __L("Kurduğun odaya dön · Oda {0} (başlamadı)", [(savedNet().code)]) : __L("Katıldığın odaya dön · Oda {0} (başlamadı)", [(savedNet().code)]))) + '</button>' : (savedGame() ? __L("<button class=\"resumebar\" id=\"lbResumeBot\">⟳ Kaldığın bot maçına dön · El {0}</button>", [(savedGame().hand)]) : '')), (UI), (navBtn('arkadas', 'arkadaslar', __L("Arkadaşlar"))), (navBtn('kiraathane', 'kiraathane', __L("Kıraathanem"))), (navBtn('lider', 'liderlik', __L("Liderlik"))), (navBtn('bonus', 'gunluk-bonus', __L("Görevler"))), (navBtn('reklam', 'reklam-jeton', __L("Altın Kazan"), true)), (navBtn('magaza', 'magaza', __L("Mağaza"))), (navBtn('ogren', 'nasil-oynanir', __L("Nasıl Oynanır?"))), (navBtn('bilgi', 'bilgi', __L("Kurallar"))), (navBtn('ayar', 'ayarlar', __L("Ayarlar"))), (!econSummary().login ? '<div class="dot" style="left:702px;top:812px"></div>' : '')]), 'lobby');
    var soon = function (what) { return function () { toast(__L("{0} henüz hazır değil; sonraki sürümlerde gelecek.", [(what)]), ''); }; };
    $('lbProfile').onclick = function () { guard(function () { showProfile(ME); }); }; // v9.74: profil kartı (içinden Karakteri düzenle)
    $('lbShop').onclick = $('nav-magaza').onclick = function () { guard(function () { APP.state = 'SHOP'; showStore(); }); };
    $('lbPlus').onclick = function () { guard(function () { showStore('altin'); }); };
    $('nav-arkadas').onclick = function () { guard(showFriends); }; socBadge(); if (ACC.on && !SOC.data) socSummary(); /* v9.93 */ $('nav-kiraathane').onclick = function () { guard(function () { if (window.Venue) Venue.open(); else toast(__L("Kıraathane modülü yüklenmedi."), 'warn'); }); }; $('nav-lider').onclick = function () { guard(showLeaderboard); }; $('nav-reklam').onclick = soon(__L("Reklam izleyerek altın"));
    $('nav-bonus').onclick = function () { guard(function () { showQuests(); }); };
    $('nav-ogren').onclick = function () { guard(function () { showTutHub(); }); };
    $('nav-bilgi').onclick = function () { guard(function () { APP.state = 'HELP'; showHelp('how'); }); };
    $('nav-ayar').onclick = function () { guard(function () { APP.state = 'SETTINGS'; showHelp('settings'); }); };
    var rooms = $('lbRooms'); APP.lobbyAt = Date.now();
    Array.prototype.forEach.call(rooms.querySelectorAll('.rcard'), function (b) {
      b.onclick = function () { var r = roomOf(b.dataset.room), lock = roomLocked(r); if (lock) { if (Date.now() - (APP.lobbyAt || 0) < 400) return; /* v9.86: önceki ekrandaki çift dokunuşun ikincisi lobideki kilitli karta düşüp pencere açmasın */ if (r.soon) toast(roomName(r) + ': ' + lock + '.', 'warn'); else if (r.item && !owns(r.item)) { toast(roomName(r) + ': ' + lock + '.', 'warn'); showStore('theme', r.item); } else showArenaLock(r); return; } lobbySel = r.theme; Array.prototype.forEach.call(rooms.querySelectorAll('.rcard'), function (x) { x.classList.toggle('sel', x === b); }); };
    });
    var selEl = rooms.querySelector('.rcard.sel'); if (selEl) rooms.scrollLeft = Math.max(0, selEl.offsetLeft - 320);
    var STEP = 326; function arrows() { var pv = $('lbPrev'), nx = $('lbNext'); if (!pv || !nx || !rooms.isConnected) return; pv.disabled = rooms.scrollLeft <= 2; nx.disabled = rooms.scrollLeft >= rooms.scrollWidth - rooms.clientWidth - 2; } // lobi kapandıysa (ekran değişti) sessizce çık
    $('lbPrev').onclick = function () { rooms.scrollBy({ left: -STEP, behavior: 'smooth' }); }; $('lbNext').onclick = function () { rooms.scrollBy({ left: STEP, behavior: 'smooth' }); };
    rooms.addEventListener('scroll', arrows); setTimeout(arrows, 50);
    if ($('lbResumeNet')) $('lbResumeNet').onclick = function () { guard(resumeOnline); };
    if ($('lbResumeBot')) $('lbResumeBot').onclick = function () { guard(function () { if (restoreGame()) { screen(null); APP.state = 'GAME'; overlay(null); render(); schedule(); } else showLobby(); }); };
    $('lbPlay').onclick = function () { guard(function () { showTables(roomOf(lobbySel)); }); };
    giftToastIfPending(); iosHintOnce();
  }
  function savedNet() { var sv = load('ao.net', null); return sv && sv.code && sv.token ? sv : null; }
  function resumeOnline() { // yenileme/kapanma sonrası aynı koltuğa dön (sunucu odayı silmişse hata mesajı gelir ve kayıt temizlenir)
    var sv = savedNet(); if (!sv) { toast(__L("Dönülecek çevrim içi maç yok."), ''); return; }
    NET.resuming = true; NET.expectJoin(__L("odaya dön"));
    var av = matchAvatar(); if (!settings.server && selfHosted()) settings.server = srvHost();
    screen(null); NET.connect(sv.url || settings.server || srvHost(), function () { NET.send({ t: 'join', code: sv.code, token: sv.token, name: av.name, avatar: av, skins: skinCount(), acc: ACC.auth }); });
  }
  function showMainMenu() { if (APP.state === 'LOGIN' || APP.state === 'SPLASH') return; showLobby(); }
  // ---- Oda içi: masa seçimi ----
  var tableInfo = null; // sunucudan açık hızlı masalar
  function fetchTables(cb) {
    if (!selfHosted()) { cb(null); return; }
    try { fetch(SERVER_ORIGIN + '/api/masalar?t=' + Date.now()).then(function (r) { return r.json(); }).then(function (j) { tableInfo = j; cb(j); }).catch(function () { cb(null); }); } catch (e) { cb(null); }
  }
  function showTables(room) {
    if (roomLocked(room)) { toast(roomName(room) + ': ' + roomLocked(room) + '.', 'warn'); room = roomOf('koy'); lobbySel = 'koy'; }
    stopSession(); overlay(null); APP.state = 'TABLES';
    settings.theme = room.theme; saveSettings(); applyTheme(room.theme);
    var sg = savedGame(), t = THEMES[room.theme], online = selfHosted() || !!settings.server;
    var stakes = Economy.CONFIG.stakes, stake = Economy.stakeOf(settings.stake || 'sosyal'); if (stake.locked) stake = stakes[0];
    var myLv = levelInfo().level, entryTotal = stake.entry * settings.mode;
    function stakeRow() {
      return stakes.map(function (st) { var lock = st.locked ? __L("Yakında") : (myLv < st.level ? __L("Seviye {0}", [(st.level)]) : ''); return __L("<button data-st=\"{0}\" class=\"{1}{2}\"><b>{3}</b><span>{4}</span>{5}</button>", [(st.id), (st.id === stake.id ? 'on' : ''), (lock ? ' locked' : ''), (st.name), (st.entry ? __L("{0} altın/el", [(st.entry.toLocaleString(window.__LOC || 'tr-TR'))]) : __L("ücretsiz")), (lock ? '<small>' + lock + '</small>' : '')]); }).join('');
    }
    function tableCards() {
      var list = (tableInfo && tableInfo.rooms || []).filter(function (x) { return x.theme === room.theme && x.totalHands === settings.mode && (x.stake || 'sosyal') === stake.id; });
      var html = '';
      for (var i = 0; i < 3; i++) {
        var x = list[i], n = x ? x.players : 0;
        html += __L("<button class=\"tcard{0}{1}\" data-q=\"1\"><b>{2} · {3} Masa 0{4}</b><span>{5}/4 oyuncu · {6} el{7}</span><small>{8}</small></button>", [(x ? ' live' : ''), (stake.entry ? ' paid' : ''), (roomName(room)), (stake.name), (i + 1), (n), (settings.mode), (stake.entry ? __L(" · giriş {0} altın", [(entryTotal.toLocaleString(window.__LOC || 'tr-TR'))]) : ''), (x ? __L("Oyuncular bekliyor — hemen otur") : __L("Boş masa — Hızlı Katıl ile açılır"))]);
      }
      return html;
    }
    var html = __L("<div class=\"lobbybg\"><img class=\"bg\" src=\"{0}lobi-arkaplan.webp\" alt=\"\"></div><div class=\"tables\"><button class=\"back\" id=\"tbBack\">‹ Lobi</button><h2>{1}</h2><div class=\"sub\">{2} · {3}</div><div class=\"modes\" id=\"tbModes\">{4}</div><div class=\"stakes\" id=\"tbStakes\">{5}</div>{6}<div class=\"tlist\" id=\"tbList\">{7}</div><div class=\"others\">{8}{9}<button class=\"tcard bot\" id=\"tbBot\"><b>Bota karşı masa</b><span>Sen + 3 bot · {10} el</span><small>Hemen başlar, bağlantı gerekmez</small></button><button class=\"tcard friends\" id=\"tbFriends\"><b>Arkadaşlarla oda</b><span>Oda kur ya da kodla katıl</span><small>{11}</small></button></div></div>", [(UI), (roomName(room)), (room.sub), (t ? t.desc : ''), ([1, 6, 12].map(function (m) { return __L("<button data-m=\"{0}\"{1}>{2} El</button>", [(m), (settings.mode === m ? ' class="on"' : ''), (m)]); }).join('')), (stakeRow()), (stake.entry ? __L("<div class=\"stakenote\">{0} masa: kişi başı giriş {1} altın ({2} × {3} el) emanete alınır. Havuzun %5'i gider; kalanın %65'i birinciye, %35'i ikinciye. Bilerek çıkan girişini ve bir giriş daha cezayı kaybeder (2×), hükmen son olur; bağlantısı kopup dönmeyen hükmen son sayılır. Bu yalnız oyun içi altındır.</div>", [(stake.name), (entryTotal.toLocaleString(window.__LOC || 'tr-TR')), (stake.entry.toLocaleString(window.__LOC || 'tr-TR')), (settings.mode)]) : __L("<div class=\"stakenote lgnote\">🏆 Sosyal Hızlı Katıl maçları <b>lig maçı</b>dır (Döngü Puanı · Liderlik).</div>")), (tableCards()), (savedNet() ? __L("<button class=\"tcard resume\" id=\"tbResumeNet\"><b>Kaldığın çevrim içi maç</b><span>Oda {0}</span><small>Aynı koltuğa dön</small></button>", [(savedNet().code)]) : ''), (sg ? __L("<button class=\"tcard resume\" id=\"tbResume\"><b>Kaldığın maç</b><span>El {0} / {1}</span><small>Bota karşı · devam et</small></button>", [(sg.hand), (sg.totalHands || 12)]) : ''), (settings.mode), (online ? __L("Çevrim içi") : __L("Sunucu adresi gerekir"))]);
    screen(html, 'lobby');
    $('tbBack').onclick = function () { guard(showLobby); };
    Array.prototype.forEach.call($('tbModes').querySelectorAll('button'), function (b) { b.onclick = function () { settings.mode = parseInt(b.dataset.m); saveSettings(); showTables(room); }; });
    Array.prototype.forEach.call($('tbStakes').querySelectorAll('button'), function (b) { b.onclick = function () { var st = Economy.stakeOf(b.dataset.st); if (st.locked) { toast(__L("{0} masası yakında açılacak.", [(st.name)]), ''); return; } if (myLv < st.level) { toast(__L("{0} masası için seviye {1} gerekir (sen: seviye {2}).", [(st.name), (st.level), (myLv)]), 'warn'); return; } if (st.entry && !ACC.on) { toast(__L("Giriş altınlı masalar yalnız oyunun sunucu adresinde (hesapla) oynanır."), 'warn'); return; } settings.stake = st.id; saveSettings(); showTables(room); }; });
    function fullIfPhone() { if (settings.autoFull !== false) tryLandscape(); }
    function joinQuick() { fullIfPhone(); guard(function () {
      if (!online) { toast(__L("Çevrim içi masalar için oyunu sunucu adresinden (dongu.app) aç."), 'warn'); return; }
      var av = matchAvatar(); if (!settings.server && selfHosted()) settings.server = srvHost();
      if (stake.entry && wardrobe.coins < entryTotal) { toast(__L("Yeterli altın yok: bu masa için {0} altın gerekir.", [(entryTotal.toLocaleString(window.__LOC || 'tr-TR'))]), 'warn'); return; }
      screen(null); NET.connect(settings.server, function () { NET.send({ t: 'quick', name: av.name, avatar: av, skins: skinCount(), acc: ACC.auth, settings: { totalHands: settings.mode, theme: room.theme, stake: stake.id } }); });
    }); }
    function bindList() { Array.prototype.forEach.call($('tbList').querySelectorAll('.tcard'), function (b) { b.onclick = joinQuick; }); }
    bindList();
    if ($('tbResumeNet')) $('tbResumeNet').onclick = function () { fullIfPhone(); guard(resumeOnline); };
    if ($('tbResume')) $('tbResume').onclick = function () { fullIfPhone(); guard(function () { if (restoreGame()) { screen(null); APP.state = 'GAME'; overlay(null); render(); schedule(); } else showTables(room); }); };
    $('tbBot').onclick = function () { fullIfPhone(); guard(function () { screen(null); try { localStorage.removeItem('ao.game'); } catch (e) {} newGame(false); }); };
    $('tbFriends').onclick = function () { guard(function () { showOnlineLobby(); }); };
    fetchTables(function (j) { if (APP.state === 'TABLES' && $('tbList') && j) { $('tbList').innerHTML = tableCards(); bindList(); } });
  }

  window.DonguApp = { srvHost: srvHost, NATIVE: NATIVE, $: $, overlay: overlay, screen: screen, toast: toast, guard: guard, NET: NET, ACC: ACC, api: api, accBody: accBody, accApply: accApply, charImgHTML: charImgHTML, normAvatar: normAvatar, effectiveAvatar: effectiveAvatar, gardrop: gardrop, GARDROP: GARDROP, GARDROP_VERSION: GARDROP_VERSION, avatar: function () { return normAvatar(myAvatar || DEFAULT_AV); }, matchAvatar: matchAvatar, settings: settings, saveSettings: saveSettings, showLobby: showLobby, showTables: showTables, roomOf: roomOf, roomSel: function () { return lobbySel; }, wardrobe: wardrobe, levelInfo: levelInfo, applyTheme: applyTheme, THEMES: THEMES, UI: UI, sfx: sfx, skinCount: skinCount, stopSession: stopSession, setState: function (st) { APP.state = st; }, state: function () { return APP.state; }, selfHosted: selfHosted, store: store, load: load, socReport: socReport /* v10.11 (K178) */ };
  window.AO = { openAll: function (v) { OPEN_ALL = !!v; }, gardropRig: gardropRig, canGardropRig: canGardropRig, grig: GRIG, /* v10.13 test */ help: showHelp, app: APP, /* v10.01 test */ composeChar: composeChar, charLayers: charLayers, act: ACT, actionState: actionState, playIntroAt: playIntroAt, rigOf: rigOf, /* v10.07 test: gösteri vitrini */ useActionSkin: useActionSkin, playActionFx: playActionFx, zaferCheck: zaferCheck, soc: SOC, showFriends: showFriends, showDM: showDM, socConnect: socConnect, dmClose: dmClose, interState: interState, leaderboard: showLeaderboard, profile: showProfile, acc: ACC, peek: PEEK, skin: SKIN, endPrep: endPrep, accBoot: accBoot, tutRig: function () { return tutRig; }, tut: function () { return tutorial ? { mod: TUT_MODULES[tutorial.mod].id, step: tutorial.step, wait: curStep() && curStep().wait, text: $('coachText').textContent } : null; }, modules: TUT_MODULES, startModule: startModule, hub: showTutHub, tryLandscape: tryLandscape, sizeScene: sizeScene, rooms: ROOMS, lobby: showLobby, login: showLogin, tables: showTables, level: levelInfo, intro: showHandIntro, themes: THEMES, applyTheme: applyTheme, net: NET, peek: PEEK, requestPeek: requestPeek, slapHappened: slapHappened, startPrep: startPrep, endPrep: endPrep, skinCount: skinCount, freeLeft: freeLeft, useFreeSkin: useFreeSkin, wardrobe: function () { return wardrobe; }, tutIncoming: tutIncoming, openSkinMenu: openSkinMenu, meldDetail: showMeldDetail, sort: autoSort, insert: insertInRack, setRackRaw: function (r) { rack = r.slice(); render(); }, rack: function () { return rack.slice(); }, openSel: function () { return OPEN_SEL; }, candsOf: candsOf, layp: LAYP, humanError: humanError, render: render, sel: function () { return sel; },  state: function () { return G; }, setRack: function (ids) { rack = ids.slice(); syncRack(false); render(); }, taskSegments: taskSegments, rackSegments: rackSegments, rig: function (fn) { clearTimeout(botTimer); fn(G); syncRack(false); render(); }, tileById: tileById, CATALOG: CATALOG, showStore: showStore, showLobby: showLobby, showCreator: showCreator, effectiveAvatar: effectiveAvatar, normAvatar: normAvatar, api: api, accBody: accBody };
  sizeScene(); setTimeout(sizeScene, 300);
  ['app', 'stage', 'rackWrap'].forEach(function (id) { $(id).addEventListener('scroll', function () { $(id).scrollTop = 0; $(id).scrollLeft = 0; }); });
  function resettle() { sizeScene(); setTimeout(sizeScene, 120); setTimeout(function () { sizeScene(); if (G && G.phase !== 'handover') renderRack(); }, 450); } // yön değişimi / çubuk açılıp kapanması: birkaç adımda yeniden hesapla
  window.addEventListener('orientationchange', resettle);
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', resettle);
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', resettle); }
  try { if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', resettle); } catch (e) {}
  window.addEventListener('orientationchange', resettle);
  $('tpBtn').onclick = function () { tryLandscape(); };
  document.addEventListener('fullscreenchange', resettle);
  // parmakla yakınlaştırma sahneyi kaydırır; oyun kendi ölçeğini kullanır
  document.addEventListener('touchstart', function (ev) { if (ev.touches.length > 1) ev.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', function (ev) { if (ev.touches.length > 1) ev.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (ev) { ev.preventDefault(); }, { passive: false });
  applyTileSkin(); applyTheme(settings.theme);
  showSplash(showLogin);
})();

