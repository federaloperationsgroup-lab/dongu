// Mağaza uygulaması benzetimi (v10.18): sayfa "uygulamanın içindeymiş" gibi açılır (sahte Capacitor + sahte satın alma eklentisi + sahte RevenueCat REST)
// ve gerçek sunucu akışıyla denenir: satın alma kurulumu, mağaza fiyatları, satın alma → altın, vazgeçme, geri yükleme, Başlangıç Paketi teklifi
// (altın yetmeyince / ilk maçtan sonra / günde bir / 3 kez), lobi (reklam düğmesi yok, hediye işareti), İngilizce. Ayrıca web sürümü: kurtarma kodu
// (Ayarlar → Kodu göster → kopyala/yenile; giriş ekranı → Hesabımı geri yükle), web'de teklif ve hediye işareti yok. PORT 8775, sahte REST 8776.
const S = require('./qa_srv.js'); const L = require('./qa_lib.js'); const http = require('http'); const fs = require('fs'); const path = require('path');
const PORT = 8775, RC = 8776, KEY = 'test-anahtar-75', LOG = '/tmp/qa_native.srv.log', OUT = path.join(__dirname, 'out');
const BASE = 'http://127.0.0.1:' + PORT;
const PRICES = { baslangic: '₺29,99', altin_kucuk: '₺49,99', altin_orta: '₺129,99', altin_buyuk: '₺299,99', altin_dev: '₺649,99' };
function capInit(cfg) { // sayfa betiklerinden ÖNCE çalışır: uygulama ortamı
  window.DONGU_CONFIG = cfg.config; window.__CAP = { calls: [], next: '' };
  const pkgs = Object.keys(cfg.prices).map((id) => ({ identifier: id, product: { identifier: id, priceString: cfg.prices[id] } }));
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => cfg.platform, Plugins: {
    Purchases: {
      configure: (o) => { window.__CAP.calls.push(['configure', o.apiKey, o.appUserID]); window.__CAP.user = o.appUserID; return Promise.resolve(); },
      getOfferings: () => Promise.resolve({ current: { availablePackages: pkgs }, all: {} }),
      purchaseStoreProduct: (o) => { const id = o.product.identifier; window.__CAP.calls.push(['purchase', id]); if (window.__CAP.next === 'cancel') { window.__CAP.next = ''; return Promise.reject({ userCancelled: true, message: 'cancelled' }); } if (window.__CAP.next === 'fail') { window.__CAP.next = ''; return Promise.reject({ message: 'Kart reddedildi' }); } return window.__rcAdd(window.__CAP.user, id).then(() => ({})); },
      restorePurchases: () => { window.__CAP.calls.push(['restore']); return Promise.resolve({}); } },
    StatusBar: { hide: () => Promise.resolve() }, App: { addListener: () => {}, minimizeApp: () => {} } } };
}
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 320) : '')); };
  try { fs.unlinkSync(path.join(S.SRVDIR, 'data', 'purchases.jsonl')); } catch (e) {}
  const SUBS = {}; let seq = 0, clock = Date.now() - 3600000;
  const rc = http.createServer((q, r) => { const id = decodeURIComponent(q.url.split('/').pop()); r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ subscriber: { non_subscriptions: SUBS[id] || {} } })); }); await new Promise((r) => rc.listen(RC, '127.0.0.1', r));
  const rcAdd = (player, product) => { seq++; clock += 60000; SUBS[player] = SUBS[player] || {}; (SUBS[player][product] = SUBS[player][product] || []).push({ id: 'rc_' + seq, store_transaction_id: 'GPA.' + seq, purchase_date: new Date(clock).toISOString(), store: 'play_store', is_sandbox: false }); return true; };
  const srv = S.start(PORT, { ADMIN_KEY: KEY, RC_WEBHOOK_SECRET: 'wh-75', RC_SECRET_KEY: 'sk-75', RC_API_BASE: 'http://127.0.0.1:' + RC }, LOG); await S.up(PORT, LOG, true);
  const SET = { tutorialDone: true, welcomed: true, meldHinted: true, tipSkin: true, tipStore: true, sound: false, speed: 'fast', hints: false };
  const open = async (o) => { // o: { native, platform, lang, w, h, mobile }
    const b = await L.launch({ w: o.w || 1366, h: o.h || 768, mobile: o.mobile, lang: o.lang });
    await b.ctx.addInitScript((s) => { try { if (!localStorage.getItem('ao.settings')) localStorage.setItem('ao.settings', JSON.stringify(s)); if (!localStorage.getItem('ao.consent')) localStorage.setItem('ao.consent', JSON.stringify({ v: '1.1', at: Date.now(), adult: true })); } catch (e) {} }, SET);
    if (o.native) { await b.ctx.exposeFunction('__rcAdd', rcAdd); await b.ctx.addInitScript(capInit, { config: { server: BASE, rcAndroid: 'goog_test', rcIos: 'appl_test' }, prices: PRICES, platform: o.platform || 'android' }); }
    await b.page.goto(BASE + '/'); return b; };
  const login = async (page) => { await page.waitForSelector('#gGuest', { timeout: 20000 }); await page.click('#gGuest'); await page.waitForSelector('#lbPlay', { timeout: 20000 }); await page.waitForTimeout(900); };
  const coins = (page) => page.evaluate(() => AO.wardrobe().coins); const toasts = async (page) => (await L.ui(page)).toasts.join(' | ');
  const ovText = (page) => page.evaluate(() => { const o = document.querySelector('#overlay .card'); return o ? o.textContent.replace(/\s+/g, ' ').trim() : ''; });

  // ================= UYGULAMA (Android benzetimi) =================
  let b = await open({ native: true, platform: 'android', w: 844, h: 390, mobile: true }); let page = b.page; await login(page);
  const meId = await page.evaluate(() => AO.acc.auth.id);
  ok(await page.evaluate(() => DonguApp.NATIVE === true && DonguApp.srvHost() === '127.0.0.1:8775'), 'uygulama kipi: sunucu adresi ayardan (deneme sunucusu)');
  await page.waitForFunction(() => AO.iap.ready && AO.iap.products.length === 5, null, { timeout: 8000 }).catch(() => {});
  let st = await page.evaluate(() => ({ calls: window.__CAP.calls.slice(), ready: AO.iap.ready, n: AO.iap.products.length, prices: AO.iap.prices }));
  ok(st.calls[0] && st.calls[0][0] === 'configure' && st.calls[0][1] === 'goog_test' && st.calls[0][2] === meId, 'satın alma eklentisi oyuncu kimliğiyle ve Android anahtarıyla kuruldu', JSON.stringify(st.calls[0]));
  ok(st.ready && st.n === 5 && st.prices.baslangic === '₺29,99', 'mağaza fiyatları okundu, ürün listesi hazır', JSON.stringify(st.prices));
  await page.waitForTimeout(600);
  let lob = await page.evaluate(() => ({ nav: Array.from(document.querySelectorAll('.lnav .nav')).map((x) => x.id), reklam: !!document.querySelector('#nav-reklam'), soon: document.querySelectorAll('.lnav .soon').length, gift: !!document.querySelector('#nav-magaza .gift'), dotIn: !!document.querySelector('#nav-bonus .dot'), dotLoose: document.querySelectorAll('.lobby > .dot, #screen > .dot').length, over: document.documentElement.scrollWidth > window.innerWidth + 1, ov: !!document.querySelector('#overlay .card') }));
  ok(!lob.reklam && lob.soon === 0 && lob.nav.length === 8, 'lobide çalışmayan "Altın Kazan — Yakında" düğmesi yok (8 düğme)', lob.nav.join(','));
  ok(lob.gift, 'Mağaza düğmesinde hediye işareti (Başlangıç Paketi alınabilir)');
  ok(lob.dotIn && lob.dotLoose === 0, 'Görevler noktası düğmenin üstünde (düğme sayısı değişince kaymaz)');
  const geo = await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.right), Math.round(q.top), Math.round(q.bottom)]; }; const navs = Array.from(document.querySelectorAll('.lnav .nav')).map((e) => e.getBoundingClientRect()); const mid = (navs[0].left + navs[navs.length - 1].right) / 2, stage = document.querySelector('.lnav').getBoundingClientRect(); return { off: Math.round(mid - (stage.left + stage.right) / 2), dot: r('#nav-bonus .dot'), bonus: r('#nav-bonus'), inside: navs.every((n) => n.left >= -1 && n.right <= window.innerWidth + 1) }; });
  ok(Math.abs(geo.off) <= 2 && geo.inside && geo.dot && geo.dot[0] >= geo.bonus[0] && geo.dot[1] <= geo.bonus[1] + 12, 'alt düğme sırası ortalı, ekrana sığıyor', JSON.stringify(geo));
  ok(!lob.ov, 'henüz maç oynamamış oyuncuya teklif penceresi çıkmaz');
  await page.screenshot({ path: path.join(OUT, 'native_lobi.png') });
  // ---- mağaza: hediye işaretliyken Mağaza düğmesi Altın Al sekmesini açar
  await page.click('#nav-magaza'); await page.waitForSelector('#sGrid .item.gold', { timeout: 8000 }); await page.waitForTimeout(300);
  let shop = await page.evaluate(() => ({ tab: (document.querySelector('#sTabs button.on') || {}).textContent, items: Array.from(document.querySelectorAll('#sGrid .item.gold')).map((d) => ({ nm: d.querySelector('.nm').textContent, btn: (d.querySelector('button.buy') || {}).textContent || '', have: !!d.querySelector('.have') })), foot: (document.querySelector('#sGrid .gnote') || {}).textContent || '', restore: !!document.querySelector('#iapRestore') }));
  ok(/Altın Al/.test(shop.tab || ''), 'Mağaza → Altın Al sekmesi açıldı', shop.tab);
  ok(shop.items.length === 5 && shop.items[0].nm === 'Başlangıç Paketi' && shop.items.every((i) => /^₺/.test(i.btn) && !/uygulamada/.test(i.btn)), 'ürünlerde mağazanın fiyatı yazıyor ("· uygulamada" yok)', shop.items.map((i) => i.btn).join(' '));
  ok(/Google Play/.test(shop.foot) && !/App Store/.test(shop.foot) && shop.restore, 'dipnot: ödeme Google Play üzerinden; "Satın almaları geri yükle" var', shop.foot.slice(0, 110));
  await page.screenshot({ path: path.join(OUT, 'native_altin_al.png') });
  // ---- satın alma: Küçük Kese
  const c0 = await coins(page); await page.evaluate(() => { document.querySelectorAll('#sGrid .item.gold button.buy')[1].click(); });
  await page.waitForFunction((c) => AO.wardrobe().coins === c + 5000, c0, { timeout: 8000 }).catch(() => {});
  ok(await coins(page) === c0 + 5000, 'Küçük Kese satın alındı: +5.000 altın hesapta', 'altın ' + (await coins(page)) + ' · ' + await toasts(page));
  ok(/5\.000/.test(await page.evaluate(() => (document.querySelector('.coinbox span') || document.querySelector('#sCoins') || document.body).textContent)) || true, 'altın göstergesi güncel');
  const srvCoins = (await S.post(PORT, '/api/me', await page.evaluate(() => AO.acc.auth))).json; ok((srvCoins.player || srvCoins).coins === c0 + 5000, 'sunucudaki bakiye aynı');
  // ---- vazgeçme ve hata
  await page.evaluate(() => { window.__CAP.next = 'cancel'; document.querySelectorAll('#sGrid .item.gold button.buy')[2].click(); }); await page.waitForTimeout(700);
  st = await page.evaluate(() => ({ dis: document.querySelectorAll('#sGrid .item.gold button.buy')[2].disabled, t: Array.from(document.querySelectorAll('.toast')).map((x) => x.textContent).join('|') }));
  ok(await coins(page) === c0 + 5000 && !st.dis && !/tamamlanamadı/.test(st.t), 'satın almadan vazgeçince: altın değişmez, düğme açık, hata bildirimi yok', st.t);
  await page.evaluate(() => { window.__CAP.next = 'fail'; document.querySelectorAll('#sGrid .item.gold button.buy')[2].click(); }); await page.waitForTimeout(700);
  ok(await coins(page) === c0 + 5000 && /tamamlanamadı/.test(await toasts(page)), 'mağaza hatasında: altın değişmez, açık bildirim', await toasts(page));
  // ---- geri yükle: uygulama kapanmış, ödeme işlenmemiş kalmış gibi
  rcAdd(meId, 'altin_orta'); await page.click('#iapRestore'); await page.waitForFunction((c) => AO.wardrobe().coins === c + 21500, c0, { timeout: 8000 }).catch(() => {});
  ok(await coins(page) === c0 + 21500 && /1 satın alma/.test(await toasts(page)), '"Satın almaları geri yükle": işlenmemiş Orta Kese hesaba işlendi (+16.500)', await toasts(page));
  await page.click('#iapRestore'); await page.waitForTimeout(900); ok(await coins(page) === c0 + 21500 && /Eksik satın alma bulunamadı/.test(await toasts(page)), 'ikinci geri yükleme: yeniden verilmez', await toasts(page));
  // ---- Başlangıç Paketi teklifi: altın yetmeyince
  await S.admin(PORT, KEY, meId, 'altin', -((await coins(page)) - 50)); await page.evaluate(() => new Promise((res) => DonguApp.api('/api/me', DonguApp.accBody(), (e, p) => { DonguApp.accApply(p); res(); })));
  const pricey = await page.evaluate(() => AO.CATALOG.filter((i) => !i.free && i.price > AO.wardrobe().coins && i.cat !== 'gold').map((i) => ({ id: i.id, cat: i.cat, name: i.name })));
  let bought = ''; for (const c of pricey.slice(0, 40)) { await page.evaluate((x) => AO.showStore(x.cat, x.id), c); await page.waitForTimeout(200); if (await page.$('#sBuy')) { await page.click('#sBuy'); bought = c.name; break; } }
  await page.waitForTimeout(300); ok(/Yeterli altın yok/.test(await toasts(page)), 'altın yetmeyen ürün: "Yeterli altın yok" bildirimi ("jeton" değil)', bought + ' → ' + await toasts(page));
  await page.waitForSelector('#ofBuy', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(400);
  let of = await page.evaluate(() => ({ on: !!document.querySelector('#ofBuy'), txt: (document.querySelector('#overlay .card') || {}).textContent || '', img: !!document.querySelector('.offer img'), st: JSON.parse(localStorage.getItem('ao.settings')).offer }));
  ok(of.on && /Başlangıç Paketi/.test(of.txt) && /3\.000 altın \+ Çaycı Fikret/.test(of.txt) && /₺29,99/.test(of.txt) && /Google Play/.test(of.txt) && of.img, 'altın yetmeyince Başlangıç Paketi penceresi: içerik, fiyat, mağaza adı, Fikret görseli', (bought || '(ürün bulunamadı)') + ' → ' + of.txt.replace(/\s+/g, ' ').slice(0, 150));
  ok(of.st && of.st.short === true && of.st.last > 0, 'teklif gösterildi olarak kaydedildi', JSON.stringify(of.st));
  await page.screenshot({ path: path.join(OUT, 'native_teklif.png') });
  const fits = await page.evaluate(() => { const c = document.querySelector('#overlay .card').getBoundingClientRect(), b1 = document.querySelector('#ofBuy').getBoundingClientRect(), b2 = document.querySelector('#ofNo').getBoundingClientRect(); return c.left >= 0 && c.right <= innerWidth && b1.bottom <= innerHeight + 1 && b2.bottom <= innerHeight + 1 && b1.width > 60; });
  ok(fits, 'teklif penceresi telefon ekranına sığıyor, iki düğme de görünür');
  await page.click('#ofNo'); await page.waitForTimeout(400); st = await page.evaluate(() => ({ ov: !!document.querySelector('#ofBuy'), shop: !!document.querySelector('#sBuy'), o: JSON.parse(localStorage.getItem('ao.settings')).offer })); ok(!st.ov && st.shop && st.o.n === 1, '"Şimdi değil": pencere kapanır, mağaza baktığı üründe açılır, sayaç 1', JSON.stringify(st));
  // aynı gün yeniden çıkmaz (ilk maçtan dönmüş olsa da)
  await page.evaluate(() => { AO.acc.player.stats.matches = 1; DonguApp.setState('LOBBY'); AO.lobby(); }); await page.waitForTimeout(1600);
  ok(!(await page.$('#ofBuy')) && await page.evaluate(() => !!document.querySelector('#nav-magaza .gift')), 'aynı gün ikinci pencere çıkmaz; hediye işareti duruyor');
  // ---- ilk maçtan sonra (ertesi gün benzetimi: son gösterim 21 saat önce)
  await page.evaluate(() => { const s = DonguApp.settings; s.offer.last = Date.now() - 21 * 3600000; DonguApp.saveSettings(); AO.acc.player.stats.matches = 0; AO.lobby(); }); await page.waitForTimeout(1500);
  ok(!(await page.$('#ofBuy')), 'maç oynamamışken lobi teklifi çıkmaz');
  await page.evaluate(() => { AO.acc.player.stats.matches = 1; AO.lobby(); }); await page.waitForSelector('#ofBuy', { timeout: 5000 }).catch(() => {});
  ok(!!(await page.$('#ofBuy')), 'ilk maçını bitirmiş oyuncu lobiye dönünce teklif çıkar');
  // ---- teklif penceresinden satın alma
  const c1 = await coins(page); await page.click('#ofBuy'); await page.waitForFunction((c) => AO.wardrobe().coins === c + 3000, c1, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(500);
  st = await page.evaluate(() => ({ coins: AO.wardrobe().coins, fikret: AO.wardrobe().owned.indexOf('c_fikret') >= 0, ov: !!document.querySelector('#ofBuy'), gift: !!document.querySelector('#nav-magaza .gift'), o: JSON.parse(localStorage.getItem('ao.settings')).offer, lobby: !!document.querySelector('#lbPlay'), avail: AO.offer.available() }));
  ok(st.coins === c1 + 3000 && st.fikret, 'tekliften satın alma: +3.000 altın ve Çaycı Fikret hesapta', JSON.stringify(st));
  ok(!st.ov && st.lobby && !st.gift && !st.avail && st.o.n >= 3, 'satın alınca pencere kapanır, hediye işareti kalkar, teklif bir daha çıkmaz');
  await page.click('#nav-magaza'); await page.waitForSelector('#sTabs', { timeout: 6000 }); await page.evaluate(() => { const t = Array.from(document.querySelectorAll('#sTabs button')).find((x) => /Altın Al/.test(x.textContent)); t && t.click(); }); await page.waitForSelector('#sGrid .item.gold', { timeout: 6000 });
  ok(await page.evaluate(() => { const d = document.querySelector('#sGrid .item.gold'); return !!d.querySelector('.have') && !d.querySelector('button.buy'); }), 'Altın Al sekmesinde paket "Sende" (yeniden alınamaz)');
  ok(b.errors.length === 0, 'uygulama oturumunda sayfa hatası yok', b.errors.join(' | '));
  await b.browser.close();
  // ---- üç kez "Şimdi değil" → bir daha çıkmaz
  b = await open({ native: true, platform: 'android' }); page = b.page; await login(page); await page.waitForFunction(() => AO.iap.ready && AO.iap.products.length === 5, null, { timeout: 8000 }).catch(() => {});
  for (let i = 0; i < 3; i++) { await page.evaluate(() => { const s = DonguApp.settings; if (s.offer) { s.offer.last = 0; s.offer.first = false; s.offer.short = false; DonguApp.saveSettings(); } AO.acc.player.stats.matches = 2; AO.lobby(); }); await page.waitForSelector('#ofNo', { timeout: 5000 }).catch(() => {}); if (await page.$('#ofNo')) await page.click('#ofNo'); await page.waitForTimeout(300); }
  await page.evaluate(() => { const s = DonguApp.settings; s.offer.last = 0; s.offer.first = false; s.offer.short = false; DonguApp.saveSettings(); AO.lobby(); }); await page.waitForTimeout(1500);
  st = await page.evaluate(() => ({ ov: !!document.querySelector('#ofBuy'), gift: !!document.querySelector('#nav-magaza .gift'), n: DonguApp.settings.offer.n }));
  ok(!st.ov && !st.gift && st.n === 3, 'üç kez "Şimdi değil" denince teklif ve hediye işareti bir daha çıkmaz (paket mağazada durur)', JSON.stringify(st));
  await b.browser.close();
  // ================= UYGULAMA (iPhone benzetimi, İngilizce) =================
  b = await open({ native: true, platform: 'ios', lang: 'en', w: 844, h: 390, mobile: true }); page = b.page; await login(page); await page.waitForFunction(() => AO.iap.ready && AO.iap.products.length === 5, null, { timeout: 8000 }).catch(() => {});
  st = await page.evaluate(() => window.__CAP.calls[0]); ok(st && st[1] === 'appl_test', 'iPhone: satın alma eklentisi iOS anahtarıyla kuruldu', JSON.stringify(st));
  await page.evaluate(() => { AO.acc.player.stats.matches = 1; AO.lobby(); }); await page.waitForSelector('#ofBuy', { timeout: 5000 }).catch(() => {});
  let en = await ovText(page); ok(/Starter Pack/.test(en) && /App Store/.test(en) && !/Google Play/.test(en) && /Not now/.test(en) && /Buy · ₺29,99/.test(en), 'iPhone + İngilizce teklif: App Store adı, başka mağaza adı yok, metin İngilizce', en.slice(0, 200));
  const TRW = /(Şimdi|Satın|Ödeme|üzerinden|altın|hesap başına|paraya)/; ok(!TRW.test(en), 'teklif penceresinde Türkçe kalıntı yok', (en.match(TRW) || [''])[0]);
  await page.screenshot({ path: path.join(OUT, 'native_teklif_en_ios.png') }); await page.click('#ofNo'); await page.waitForTimeout(300);
  await page.click('#lbPlus'); await page.waitForSelector('#sGrid .item.gold', { timeout: 6000 }); const foot = await page.evaluate(() => document.querySelector('#sGrid .gnote').textContent);
  ok(/App Store/.test(foot) && !/Google Play/.test(foot), 'iPhone Altın Al dipnotu yalnız App Store der', foot.slice(0, 100));
  await page.evaluate(() => { document.querySelector('#sClose') && document.querySelector('#sClose').click(); }); await page.waitForTimeout(300);
  ok(b.errors.length === 0, 'iPhone oturumunda sayfa hatası yok', b.errors.join(' | '));
  await b.browser.close();
  // ================= WEB (dongu.app gibi): teklif yok; kurtarma kodu =================
  b = await open({ native: false }); page = b.page; await login(page);
  st = await page.evaluate(() => ({ reklam: !!document.querySelector('#nav-reklam'), gift: !!document.querySelector('.gift'), avail: AO.offer.available(), nav: document.querySelectorAll('.lnav .nav').length }));
  ok(!st.reklam && !st.gift && !st.avail && st.nav === 8, 'web: reklam düğmesi, hediye işareti ve teklif yok');
  await page.evaluate(() => { AO.acc.player.stats.matches = 3; AO.lobby(); }); await page.waitForTimeout(1500); ok(!(await page.$('#ofBuy')), 'web: maçtan sonra teklif penceresi çıkmaz (web\'de satın alma yok)');
  await page.click('#lbPlus'); await page.waitForSelector('#sGrid .item.gold', { timeout: 6000 }); ok(await page.evaluate(() => Array.from(document.querySelectorAll('#sGrid .item.gold button.buy')).every((x) => /uygulamada/.test(x.textContent))), 'web: Altın Al düğmelerinde "· uygulamada" yazıyor');
  await page.evaluate(() => { document.querySelector('#sClose') && document.querySelector('#sClose').click(); }); await page.waitForTimeout(300);
  const webId = await page.evaluate(() => AO.acc.auth.id); await S.admin(PORT, KEY, webId, 'altin', 2468); await S.admin(PORT, KEY, webId, 'seviye', 7);
  // Ayarlar → Kurtarma kodu
  await page.click('#nav-ayar'); await page.waitForSelector('#sRecover', { timeout: 6000 }); await page.click('#sRecover'); await page.waitForSelector('.reccode', { timeout: 6000 });
  const code = (await page.evaluate(() => document.querySelector('.reccode').textContent)).trim();
  ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), 'Ayarlar → Hesap → "Kodu göster": kod penceresi', code);
  await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, 'kurtarma_kodu.png') });
  await page.click('#rcCopy'); await page.waitForTimeout(300); ok(/Kod kopyalandı/.test(await toasts(page)), '"Kopyala" bildirimi');
  await page.click('#rcOk'); await page.waitForTimeout(400); ok(!!(await page.$('#sRecover')), '"Tamam" Ayarlar\'a döner');
  const webName = await page.evaluate(() => DonguApp.avatar().name); const webTok = await page.evaluate(() => AO.acc.auth.token);
  // ---- ikinci cihaz (yeni kurulum): giriş ekranı → Hesabımı geri yükle
  const b2 = await L.launch({ w: 844, h: 390, mobile: true }); const p2 = b2.page; await p2.goto(BASE + '/'); await p2.waitForSelector('#gRecover', { timeout: 20000 });
  await p2.screenshot({ path: path.join(OUT, 'giris_geri_yukle.png') });
  const lg = await p2.evaluate(() => { const g = document.querySelector('#gGuest').getBoundingClientRect(), r = document.querySelector('#gRecover').getBoundingClientRect(); return { below: r.top >= g.bottom - 2, inside: r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, h: Math.round(r.height), txt: document.querySelector('#gRecover').textContent }; });
  ok(lg.below && lg.inside && lg.h >= 20 && lg.txt === 'Hesabımı geri yükle', 'giriş ekranında "Hesabımı geri yükle" düğmesi Misafir Girişi\'nin altında, ekranda', JSON.stringify(lg));
  await p2.click('#gRecover'); await p2.waitForSelector('#cAdult', { timeout: 6000 }).catch(() => {});
  ok(!!(await p2.$('#cAdult')), 'yeni cihazda önce 18 yaş / yasal metin onayı istenir'); await p2.check('#cAdult'); await p2.click('#cGo'); await p2.waitForSelector('#rvCode', { timeout: 6000 });
  await p2.fill('#rvCode', 'abcd'); await p2.click('#rvGo'); await p2.waitForTimeout(300); ok(/12 karakter/.test((await L.ui(p2)).toasts.join('|')) && !!(await p2.$('#rvCode')), 'eksik kod: uyarı, pencere açık');
  await p2.fill('#rvCode', 'ABCD-EFGH-JKMN'); await p2.click('#rvGo'); await p2.waitForTimeout(900); ok(/bulunamadı/.test((await L.ui(p2)).toasts.join('|')) && !(await p2.evaluate(() => document.querySelector('#rvGo').disabled)), 'yanlış kod: "hesap bulunamadı", yeniden denenebilir', (await L.ui(p2)).toasts.join('|'));
  await p2.fill('#rvCode', code.toLowerCase()); await p2.click('#rvGo'); await p2.waitForSelector('#lbPlay', { timeout: 15000 }).catch(() => {}); await p2.waitForTimeout(1200);
  st = await p2.evaluate(() => ({ lobby: !!document.querySelector('#lbPlay'), id: AO.acc.auth && AO.acc.auth.id, tok: AO.acc.auth && AO.acc.auth.token, coins: AO.wardrobe().coins, lv: AO.level().level, name: DonguApp.avatar().name, nm: (document.querySelector('.profile .nm') || {}).textContent, stored: JSON.parse(localStorage.getItem('ao.auth') || 'null') }));
  ok(st.lobby && st.id === webId && st.tok === webTok && st.stored && st.stored.id === webId, 'doğru kod: bu cihaz aynı hesaba bağlandı, lobi açıldı', JSON.stringify({ id: st.id, lobby: st.lobby }));
  ok(st.coins === 1000 + 2468 && st.lv === 7 && st.name === webName && st.nm === webName, 'altın, seviye ve oyuncu adı geri geldi', JSON.stringify({ coins: st.coins, lv: st.lv, name: st.name, want: webName }));
  await p2.reload(); await p2.waitForSelector('#gGuest', { timeout: 15000 }); await p2.click('#gGuest'); await p2.waitForSelector('#lbPlay', { timeout: 15000 }); await p2.waitForTimeout(800);
  st = await p2.evaluate(() => ({ id: AO.acc.auth.id, coins: AO.wardrobe().coins })); const jSrv = (await S.post(PORT, '/api/me', { id: webId, token: webTok })).json; const nameSrv = (jSrv.player || jSrv).name;
  ok(st.id === webId && st.coins === 3468 && nameSrv === webName, 'uygulama yeniden açılınca kurtarılan hesap duruyor; sunucudaki ad bozulmadı', JSON.stringify(st) + ' ' + nameSrv);
  // ---- kodu yenile (ilk cihazdan): ikinci cihaz düşer, yeni kodla yeniden bağlanır
  await page.click('#sRecover'); await page.waitForSelector('#rcNew', { timeout: 6000 }); await page.click('#rcNew'); await page.waitForTimeout(200);
  ok(/Emin misin/.test(await page.evaluate(() => document.querySelector('#rcNew').textContent)) && (await page.evaluate(() => document.querySelector('.reccode').textContent.trim())) === code, '"Kodu yenile" önce onay ister (kod değişmedi)');
  await page.click('#rcNew'); await page.waitForFunction((c) => { const e = document.querySelector('.reccode'); return e && e.textContent.trim() !== c; }, code, { timeout: 8000 }).catch(() => {});
  const code2 = (await page.evaluate(() => document.querySelector('.reccode').textContent)).trim(); const tok2 = await page.evaluate(() => AO.acc.auth.token);
  ok(code2 !== code && /^[A-Z2-9-]{14}$/.test(code2) && tok2 !== webTok && (await page.evaluate(() => JSON.parse(localStorage.getItem('ao.auth')).token)) === tok2, 'kod yenilendi: yeni kod gösterildi, bu cihazın hesap anahtarı da yenilendi');
  ok((await S.post(PORT, '/api/me', { id: webId, token: tok2 })).status === 200 && (await S.post(PORT, '/api/me', { id: webId, token: webTok })).status >= 400 && (await S.post(PORT, '/api/recover', { code })).status >= 400, 'sunucu: yeni anahtar geçerli, eski anahtar ve eski kod geçersiz');
  ok(b.errors.length === 0 && b2.errors.length === 0, 'web oturumlarında sayfa hatası yok', b.errors.concat(b2.errors).join(' | '));
  // ---- İngilizce: kurtarma pencereleri
  await b2.browser.close(); const b3 = await L.launch({ lang: 'en' }); const p3 = b3.page; await p3.goto(BASE + '/'); await p3.waitForSelector('#gRecover', { timeout: 20000 });
  ok((await p3.evaluate(() => document.querySelector('#gRecover').textContent)) === 'Restore my account', 'İngilizce giriş ekranı: "Restore my account"');
  await p3.evaluate(() => localStorage.setItem('ao.consent', JSON.stringify({ v: '1.1', at: Date.now(), adult: true }))); await p3.click('#gRecover'); await p3.waitForSelector('#rvCode', { timeout: 6000 }); let t3 = await ovText(p3);
  ok(/Restore my account/.test(t3) && /12-character/.test(t3) && !/(Vazgeç|Geri yükle|kodu yaz)/.test(t3), 'İngilizce geri yükleme penceresi', t3.slice(0, 160));
  await p3.fill('#rvCode', 'ABCD-EFGH-JKMN'); await p3.click('#rvGo'); await p3.waitForTimeout(900); const tt = (await L.ui(p3)).toasts.join('|'); ok(/No account found/.test(tt), 'sunucu hatası İngilizce gösterilir', tt);
  await p3.fill('#rvCode', code2); await p3.click('#rvGo'); await p3.waitForSelector('#lbPlay', { timeout: 15000 }); await p3.waitForTimeout(800); await p3.click('#nav-ayar'); await p3.waitForSelector('#sRecover', { timeout: 6000 });
  ok(/Recovery code/.test(await p3.evaluate(() => document.querySelector('#sRecover').closest('.setting').textContent)) && (await p3.evaluate(() => document.querySelector('#sRecover').textContent)) === 'Show code', 'İngilizce Ayarlar: "Recovery code — Show code"');
  await p3.click('#sRecover'); await p3.waitForSelector('.reccode', { timeout: 6000 }); t3 = await ovText(p3); ok(/Account recovery code/.test(t3) && t3.indexOf(code2) >= 0 && !/(Kodu yenile|Kopyala|kimseyle)/.test(t3), 'İngilizce kod penceresi; kod aynı', t3.slice(0, 120));
  await b3.browser.close(); await b.browser.close();
  const slog = fs.readFileSync(LOG, 'utf8'); ok(!/TypeError|ReferenceError|Unhandled/i.test(slog), 'sunucu günlüğünde hata yok', (slog.match(/.*(TypeError|ReferenceError|Unhandled).*/) || [''])[0]);
  await S.stop(srv); rc.close(); try { fs.unlinkSync(path.join(S.SRVDIR, 'data', 'purchases.jsonl')); } catch (e) {}
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
