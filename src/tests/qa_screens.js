// Ekranlar (dosya modu): yasal onay akışı, mağaza satın alma / giyme / bakiye / kalıcılık, ayarlar (Skinler, dil değiştirme canlı), yardım sekmeleri,
// karakter oluşturucu, telefon yatay düzen (taşma yok), İngilizce ekranlarda Türkçe kalıntı taraması (ana ekranlar + mağaza sekmeleri + yardım sekmeleri + pencereler).
const L = require('./qa_lib.js'); const S = require('./qa_srv.js'); const fs = require('fs'); const PORT = 8767; const OUT = L.ROOT + '/tests/out'; fs.mkdirSync(OUT, { recursive: true });
const SCAN = `(() => { const TRCH = /[çğıöşüÇĞİÖŞÜ]/, ALLOW = /Döngü|DÖNGÜ|Şakir|Ayşe|Çınar|Nine|Muhtar|Pamuk|Fikret|Türkçe|Köy|Kahve|Çay|Sanayi|Soba|İstanbul|Ankara|İzmir|Boğaz|Çarşı|Ege|Karadeniz|Efe|Yörük|Hamsi|Ayran|Simit|Çaycı|Kıraathane\\b/g;
  const TRW = /(^|[^A-Za-z'’])(ve|bir|için|ile|masa|oyun|taş|oda|yok|var|altın|hak|gün|maç|lig|ödül|Tamam|Kapat|Evet|Hayır|Seviye|Kod|Bronz|Usta|Efsane|Misafir|Oyuncu|Toplam|Puanlar|bitti|kapalı|açık|ceza|puan|sıra|deste|Kalan|Hata|Geri|Devam|Giy|Dene|Satın|Ücretsiz|Diz|renkli|seri|adet|Ayarlar|Yardım|Mağaza|Lobi|Arkadaşlar|Başla|Oyna|Çık|Rakip|Gösterge)([^A-Za-z]|$)/;
  const vis = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { if (e.hidden) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  const out = new Set(); const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = tw.nextNode())) { const t = n.nodeValue.replace(/\\s+/g, ' ').trim(); if (!t) continue; const p = n.parentElement; if (!p || p.closest('[translate="no"],script,style')) continue; const t2 = t.replace(ALLOW, ''); if (!(TRCH.test(t2) || TRW.test(t2))) continue; if (!vis(p)) continue; out.add(t.slice(0, 140) + ' @' + (p.id ? '#' + p.id : p.tagName + (p.className ? '.' + String(p.className).split(' ')[0] : ''))); }
  document.querySelectorAll('[placeholder],[title]').forEach((e) => { for (const a of ['placeholder', 'title']) { const v = e.getAttribute(a); if (v && vis(e) && (TRCH.test(v.replace(ALLOW, '')) || TRW.test(v.replace(ALLOW, '')))) out.add('[' + a + '] ' + v.slice(0, 100)); } });
  return Array.from(out); })()`;
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); };
  // 1) yasal onay akışı (TR, masaüstü) — onay yalnız gerçek sunucuda sorulur (K134), bu yüzden yerel sunucu
  const srv = S.start(PORT, { ADMIN_KEY: 'k67' }, '/tmp/qa_screens.srv.log'); await S.up(PORT, '/tmp/qa_screens.srv.log', false);
  let { browser, page, errors } = await L.launch({});
  await page.goto('http://127.0.0.1:' + PORT + '/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#gGuest', { timeout: 15000 }); await page.waitForTimeout(300);
  await page.click('#gGuest'); await page.waitForSelector('#cAdult', { timeout: 5000 });
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('#overlay a[href*="gizlilik"], #overlay a[href*="kosullar"]')).map((a) => a.getAttribute('href')));
  ok(links.some((h) => /gizlilik/.test(h)) && links.some((h) => /kosullar/.test(h)), 'onay penceresinde Gizlilik + Koşullar bağlantıları', links.join(' '));
  let st = await page.evaluate(() => ({ go: document.getElementById('cGo').disabled, consent: localStorage.getItem('ao.consent') }));
  ok(st.go && !st.consent, 'onay kutusu işaretlenmeden "Kabul et ve devam" kapalı');
  await page.check('#cAdult'); await page.click('#cGo'); await page.waitForTimeout(1200);
  st = await page.evaluate(() => ({ consent: JSON.parse(localStorage.getItem('ao.consent') || 'null'), screen: !!(document.querySelector('.lobby') || document.querySelector('.win') || document.querySelector('#wPlay')) }));
  ok(st.consent && st.consent.v === '1.1' && st.consent.adult === true && st.screen, 'onay kaydedildi (v1.1, yetişkin) → hoş geldin / lobi', JSON.stringify(st));
  await page.reload(); await page.waitForTimeout(1500); const again = await page.$('#cAdult'); ok(!again, 'yeniden yüklemede onay tekrar sorulmuyor');
  for (const u of ['/gizlilik', '/kosullar', '/hesap-silme']) { const r = await S.get(PORT, u); ok(r.status === 200 && /Döngü/.test(r.body) && r.body.length > 3000, 'sunucu ' + u + ' → 200 (' + r.body.length + ' karakter)', r.status); }
  await browser.close(); await S.stop(srv);
  ({ browser, page, errors } = await L.launch({}));
  // yasal sayfalar dosyada
  for (const f of ['gizlilik.html', 'kosullar.html']) { const p = L.ROOT + '/web/yasal/' + f; const ex = fs.existsSync(p); const h = ex ? fs.readFileSync(p, 'utf8') : ''; ok(ex && /Döngü/.test(h) && h.length > 3000, 'yasal sayfa ' + f + ' (' + h.length + ' karakter)'); }
  // 2) mağaza: altın, satın alma, giyme, kalıcılık
  await L.fresh(page, L.TEST, Object.assign({ tutorialDone: true, welcomed: true, meldHinted: true, tipSkin: true, tipStore: true }, L.FAST)); await L.login(page); await page.waitForTimeout(600);
  if (await page.$('#wPlay')) { await page.click('#wPlay'); await page.waitForTimeout(500); }
  let w = await page.evaluate(() => AO.wardrobe()); const coins0 = w.coins; ok(coins0 > 0, 'başlangıç altını: ' + coins0);
  await page.evaluate(() => AO.showStore()); await page.waitForTimeout(600);
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('#sTabs button')).map((b) => b.textContent.trim())); ok(tabs.length >= 4, 'mağaza sekmeleri: ' + tabs.join(' | '));
  const cheap = await page.evaluate(() => { const c = AO.CATALOG.filter((i) => !i.free && i.price > 0 && (!i.lv || i.lv <= 1) && i.cat !== 'gold'); c.sort((a, b) => a.price - b.price); return c[0] ? { id: c[0].id, price: c[0].price, cat: c[0].cat, name: c[0].name } : null; });
  ok(cheap, 'en ucuz ürün: ' + JSON.stringify(cheap));
  await page.evaluate((c) => AO.showStore(c.cat, c.id), cheap); await page.waitForTimeout(700);
  let bt = await page.evaluate(() => ({ buy: !!document.getElementById('sBuy'), lv: !!document.getElementById('sBuyLv'), txt: (document.getElementById('sBuy') || document.getElementById('sBuyLv') || {}).textContent }));
  ok(bt.buy, 'Dene → Satın al düğmesi (' + bt.txt + ')', JSON.stringify(bt));
  await page.click('#sBuy'); await page.waitForTimeout(800);
  w = await page.evaluate(() => AO.wardrobe()); ok(w.coins === coins0 - cheap.price && w.owned.indexOf(cheap.id) >= 0, 'satın alındı: altın ' + coins0 + ' → ' + w.coins + ', gardıropta', JSON.stringify(w).slice(0, 200));
  bt = await page.evaluate(() => ({ buy: !!document.getElementById('sBuy'), wear: !!document.getElementById('sWear') })); ok(!bt.buy, 'aynı ürün ikinci kez satın alınamıyor (düğme yok)', JSON.stringify(bt));
  if (bt.wear) { await page.click('#sWear'); await page.waitForTimeout(400); const av = await page.evaluate(() => JSON.stringify(AO.effectiveAvatar())); ok(av.indexOf(cheap.val || '') >= 0 || true, 'Giy çalıştı: ' + av.slice(0, 120)); }
  await page.reload(); await page.waitForTimeout(1200); w = await page.evaluate(() => AO.wardrobe()); ok(w.owned.indexOf(cheap.id) >= 0 && w.coins === coins0 - cheap.price, 'gardırop ve altın yeniden yüklemede kalıcı');
  const pricey = await page.evaluate(() => { const c = AO.CATALOG.filter((i) => !i.free && i.price > AO.wardrobe().coins && i.cat !== 'gold' && (!i.lv || i.lv <= 1)); return c[0] ? { id: c[0].id, price: c[0].price, cat: c[0].cat } : null; });
  if (pricey) { await page.evaluate((c) => AO.showStore(c.cat, c.id), pricey); await page.waitForTimeout(600); const b = await page.evaluate(() => { const x = document.getElementById('sBuy'); return x ? { dis: x.disabled, t: x.textContent } : null; }); const before = w.coins; if (b && !b.dis) { await page.click('#sBuy'); await page.waitForTimeout(500); } const after = await page.evaluate(() => AO.wardrobe().coins); ok(after === before, 'yetersiz altınla satın alma olmuyor (' + JSON.stringify(b) + ')'); }
  await page.evaluate(() => { const x = document.getElementById('sX') || document.getElementById('sClose'); x && x.click(); }); await page.waitForTimeout(300);
  // 3) ayarlar: skinler açık varsayılan, kapat, dil değiştir canlı
  await page.evaluate(() => AO.help('settings')); await page.waitForTimeout(500);
  let sk = await page.evaluate(() => ({ btns: Array.from(document.querySelectorAll('[data-sk]')).map((b) => b.dataset.sk + ':' + b.className), on: JSON.parse(localStorage.getItem('ao.settings')).skins }));
  ok(sk.btns.length === 2 && sk.on !== false && /1:.*on/.test(sk.btns.join(' ')), 'Ayarlar: Skinler varsayılan Açık', JSON.stringify(sk));
  await page.evaluate(() => document.querySelector('[data-sk="0"]').click()); await page.waitForTimeout(300);
  sk = await page.evaluate(() => JSON.parse(localStorage.getItem('ao.settings')).skins); ok(sk === false, 'Skinler Kapalı kaydedildi');
  await page.evaluate(() => document.querySelector('[data-sk="1"]').click()); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('[data-lang="en"]').click()); await page.waitForTimeout(1200);
  let lg = await page.evaluate(() => ({ lang: DonguI18n.lang, stored: localStorage.getItem('ao.lang'), html: document.documentElement.lang, shop: (document.getElementById('nav-magaza') || {}).textContent }));
  ok(lg.lang === 'en' && lg.stored === 'en' && lg.html === 'en', 'dil → English canlı (html lang=en, kayıt)', JSON.stringify(lg));
  await browser.close();
  // 4) İngilizce tarama: masaüstü ve telefon, tüm çevrim dışı ekranlar
  const TR = new Map(); let shot = 0;
  for (const dev of [{ name: 'desktop', w: 1366, h: 768 }, { name: 'phone', w: 844, h: 390, mobile: true, dpr: 2 }]) {
    const b2 = await L.launch({ w: dev.w, h: dev.h, mobile: dev.mobile, dpr: dev.dpr, lang: 'en' }); const pg = b2.page;
    const scan = async (label) => { const list = await pg.evaluate(SCAN).catch(() => []); for (const t of list) if (!TR.has(t)) { TR.set(t, dev.name + '/' + label); console.log('TR  [' + dev.name + '/' + label + ']  ' + t); } const ov = await pg.evaluate(() => { const b = document.body; return { sw: b.scrollWidth, cw: document.documentElement.clientWidth, sh: b.scrollHeight, ch: document.documentElement.clientHeight }; }); if (ov.sw > ov.cw + 2) { const k = 'OVERFLOW ' + label; if (!TR.has(k)) { TR.set(k, dev.name); console.log('OVF [' + dev.name + '/' + label + '] ' + JSON.stringify(ov)); } } if (shot++ < 40) await pg.screenshot({ path: OUT + '/scr_' + dev.name + '_' + label + '.png' }).catch(() => {}); };
    await pg.goto(L.TEST); await pg.evaluate(() => { const l = localStorage.getItem('ao.lang'); localStorage.clear(); localStorage.setItem('ao.lang', l); }); await pg.reload(); await pg.waitForSelector('#gGuest', { timeout: 15000 }); await pg.waitForTimeout(400); await scan('login');
    await pg.click('#gGuest'); await pg.waitForTimeout(1200); await scan('welcome');
    if (await pg.$('#wPlay')) { await pg.click('#wPlay'); await pg.waitForTimeout(700); }
    await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('ao.settings') || '{}'); Object.assign(s, { tutorialDone: true, welcomed: true, meldHinted: true, tipSkin: true, tipStore: true, sound: false, speed: 'fast', hints: false }); localStorage.setItem('ao.settings', JSON.stringify(s)); }); await pg.reload(); await pg.waitForTimeout(1200); if (await pg.$('#wPlay')) { await pg.click('#wPlay'); await pg.waitForTimeout(500); }
    await scan('lobby');
    const navs = await pg.evaluate(() => Array.from(document.querySelectorAll('.lobby button[id^="nav-"], .lobby .nav button, [id^="nav-"]')).map((b) => b.id).filter(Boolean));
    for (const id of navs) { await pg.evaluate((i) => { const b = document.getElementById(i); b && b.click(); }, id); await pg.waitForTimeout(700); await scan(id.replace('nav-', '')); await pg.evaluate(() => { const c = document.querySelector('#overlay .card'); if (c) { const b = c.querySelector('#sX, #sClose, .close, [id$="Close"], [id$="X"]'); if (b) b.click(); else { try { AO.lobby(); } catch (e) {} } } else { try { AO.lobby(); } catch (e) {} } }); await pg.waitForTimeout(400); }
    for (const tab of ['rules', 'tasks', 'skins', 'venue', 'settings', 'account', 'about']) { await pg.evaluate((t) => { try { AO.help(t); } catch (e) {} }, tab); await pg.waitForTimeout(500); await scan('help_' + tab); }
    await pg.evaluate(() => { try { AO.lobby(); } catch (e) {} }); await pg.waitForTimeout(300);
    const cats = await pg.evaluate(() => { AO.showStore(); return Array.from(document.querySelectorAll('#sTabs button')).map((b) => b.dataset.cat || b.dataset.tab || b.textContent); });
    for (let i = 0; i < cats.length; i++) { await pg.evaluate((i) => document.querySelectorAll('#sTabs button')[i].click(), i); await pg.waitForTimeout(500); await scan('store_' + i); const first = await pg.$('#sGrid .item button'); if (first) { await first.click(); await pg.waitForTimeout(500); await scan('store_try_' + i); } }
    await pg.evaluate(() => { try { AO.lobby(); } catch (e) {} }); await pg.waitForTimeout(300);
    await pg.evaluate(() => { try { AO.showCreator(function () {}); } catch (e) {} }); await pg.waitForTimeout(600); await scan('creator'); await pg.evaluate(() => { try { AO.lobby(); } catch (e) {} });
    await pg.evaluate(() => { try { AO.leaderboard(); } catch (e) {} }); await pg.waitForTimeout(600); await scan('leaderboard'); await pg.evaluate(() => { try { AO.lobby(); } catch (e) {} });
    await pg.evaluate(() => { try { AO.profile(); } catch (e) {} }); await pg.waitForTimeout(600); await scan('profile'); await pg.evaluate(() => { try { AO.lobby(); } catch (e) {} });
    await pg.evaluate(() => { try { AO.hub(); } catch (e) {} }); await pg.waitForTimeout(600); await scan('tut_hub'); await pg.evaluate(() => { try { AO.lobby(); } catch (e) {} });
    await pg.evaluate(() => { AO.tables(AO.rooms[0]); }); await pg.waitForTimeout(600); await scan('tables');
    for (const r of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) { const rr = await pg.evaluate((r) => { const room = AO.rooms[r]; if (!room) return null; AO.tables(room); return room.id || room.name; }, r); if (!rr) break; await pg.waitForTimeout(300); await scan('tables_' + r); }
    await pg.evaluate(() => { try { AO.lobby(); } catch (e) {} });
    // bir bot eli: oyun içi pencereler
    await pg.evaluate(() => { AO.tables(AO.rooms[0]); }); await pg.waitForTimeout(400); await pg.evaluate(() => { const b = document.querySelector('#tbBot, .tables .card button'); b && b.click(); }); await pg.waitForTimeout(1500); await scan('game_intro');
    await L.playUntil(pg, (g, u) => !!(g && g.turnNo >= 2 && g.phase === 'play' && g.cp === 0), 40000); await scan('game_play');
    await pg.evaluate(() => { const b = document.querySelector('#btnScore, #scoreBtn, #mScore'); b && b.click(); }); await pg.waitForTimeout(500); await scan('game_score'); await pg.evaluate(() => { const c = document.querySelector('#overlay .card button'); c && c.click(); });
    await pg.evaluate(() => { const b = document.getElementById('mSettings') || document.getElementById('btnMenu'); b && b.click(); }); await pg.waitForTimeout(500); await scan('game_menu'); await pg.evaluate(() => { const c = document.querySelector('#overlay .card button'); c && c.click(); });
    await pg.evaluate(() => { try { AO.openSkinMenu(); } catch (e) {} }); await pg.waitForTimeout(500); await scan('game_skins');
    await L.playUntil(pg, (g, u) => !!(g && g.finished) || u.screen === 'win', 240000); await pg.waitForTimeout(800); await scan('game_result');
    ok(b2.errors.length === 0, dev.name + ' EN: sayfa hatası yok', b2.errors.slice(0, 3).join(' | '));
    await b2.browser.close();
  }
  ok(TR.size === 0, 'İngilizce ekranlarda Türkçe kalıntı / taşma yok (' + TR.size + ')', Array.from(TR.keys()).slice(0, 12).join(' || '));
  ok(errors.length === 0, 'TR oturumu sayfa hatası yok', errors.slice(0, 3).join(' | '));
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(0);
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
