// Çevrim içi arayüz (gerçek sunucu + tarayıcı oturumları): iki gerçek oyuncu (Ayla telefon/İngilizce, Berk masaüstü/Türkçe) + 2 bot arkadaş odasında 1 el baştan sona;
// arkadaşlık isteği + kabul + özel mesaj (çevrilmez); kıraathane kurma / cephe / iç mekân / dükkân (satın alma) / üretim (parti) / Keşfet; İngilizce ekranda Türkçe kalıntı taraması.
// PORT 8765. Çıktı ekran görüntüleri: tests/out/ui_*.png
const S = require('./qa_srv.js'); const L = require('./qa_lib.js'); const { chromium } = require('playwright'); const fs = require('fs');
const PORT = 8765, KEY = 'test-anahtar-65', LOG = '/tmp/qa_online_ui.srv.log', OUT = L.ROOT + '/tests/out'; fs.mkdirSync(OUT, { recursive: true });
const SETTINGS = { tutorialDone: true, welcomed: true, sound: false, mode: 1, hints: false, speed: 'fast', assist: true, claimTime: 3, theme: 'koy', meldHinted: true, tipSkin: true, tipStore: true, firstBotMatch: true };
const SCAN = function () {
  const TRCH = /[çğıöşüÇĞİÖŞÜ]/, ALLOW = /Döngü|DÖNGÜ|Şakir|Ayşe|Türkçe|Çınar|Berk|Ayla|Aslı|Barış|Büşra|Coşkun|Gökhan|Gülay|Gül|Hülya|Hüseyin|Pınar|Rıza|Songül|Süleyman|Taşçı|Tuğba|Uğur|Yılmaz|Ömer|Özlem|İbrahim|İsmail|Şule|Şükrü|Selam, akşam bir el atalım mı\? Masada görüşürüz\./g;
  const TRW = /(^|[^A-Za-z'’])(ve|bir|için|ile|masa|masada|oyun|eli|taş|taşı|oda|yok|var|altın|bekle|hak|kez|gün|maç|lig|ödül|giriş|Tamam|Kapat|Evet|Hayır|Seviye|Masa|Oda|Kod|Sosyal|Bronz|Usta|Efsane|Misafir|Oyuncu|Toplam|Puanlar|Tur|bitti|kapalı|açık|boş|dolu|ceza|puan|sıra|deste|Kalan|Hata|Geri|Devam|Sende|Giy|Dene|Satın|Ücretsiz|sn|dk|saat|Geç|Diz|Bitti|renkli|seri|adet|ayrı)([^A-Za-z]|$)/;
  const out = []; const vis = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { if (e.hidden) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = tw.nextNode())) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (!t) continue; const p = n.parentElement; if (!p || p.closest('[translate="no"],script,style')) continue; const t2 = t.replace(ALLOW, ''); if (!(TRCH.test(t2) || TRW.test(t2))) continue; if (!vis(p)) continue; out.push(t.slice(0, 160) + ' @' + (p.id ? '#' + p.id : p.tagName)); }
  return Array.from(new Set(out));
};
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); };
  const srv = S.start(PORT, { ADMIN_KEY: KEY, QUICK_WAIT: '3000', PREP_MS: '3000', PREP_FIRST_MS: '3000', BOT_DELAY: '150', NEXT_DELAY: '2500', RESULT_GAP_MS: '800', TURN_MS: '20000' }, LOG); await S.up(PORT, LOG, true);
  const browser = await chromium.launch(); const errs = []; const TR = new Map(); let shotN = 0;
  async function mk(name, lang, phone) {
    const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(({ lang, SCAN }) => { try { if (lang) localStorage.setItem('ao.lang', lang); } catch (e) {} window.__scanTR = eval('(' + SCAN + ')'); window.__toasts = []; const ob = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList && n.classList.contains('toast')) setTimeout(() => window.__toasts.push(n.textContent), 60); }))); document.addEventListener('DOMContentLoaded', () => ob.observe(document.body, { childList: true })); }, { lang, SCAN: SCAN.toString() });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
    await p.goto('http://127.0.0.1:' + PORT + '/'); await p.waitForTimeout(300);
    await p.evaluate(({ n, s }) => { const l = localStorage.getItem('ao.lang'); localStorage.clear(); if (l) localStorage.setItem('ao.lang', l); localStorage.setItem('ao.avatar', JSON.stringify({ v: 2, name: n })); localStorage.setItem('ao.settings', JSON.stringify(s)); }, { n: name, s: SETTINGS });
    await p.reload(); await p.waitForSelector('#gGuest', { timeout: 15000 }); await p.waitForTimeout(300);
    await p.click('#gGuest'); await p.waitForTimeout(1200); if (await p.$('#cAdult')) { await p.check('#cAdult'); await p.click('#cGo'); } await p.waitForTimeout(2200);
    if (await p.$('#wPlay')) { await p.click('#wPlay'); await p.waitForTimeout(800); }
    return p;
  }
  async function scan(p, label, shot) {
    const list = await p.evaluate(() => window.__scanTR()).catch(() => []);
    const toasts = await p.evaluate(() => { const t = window.__toasts.slice(); window.__toasts.length = 0; return t; }).catch(() => []);
    for (const t of toasts) if (/[çğıöşüÇĞİÖŞÜ]/.test(t.replace(/Döngü|Berk|Ayla/g, ''))) list.push('[toast] ' + t.slice(0, 160));
    for (const t of list) if (!TR.has(t)) { TR.set(t, label); console.log('TR  [' + label + ']  ' + t); }
    if (shot) await p.screenshot({ path: OUT + '/ui_' + String(++shotN).padStart(2, '0') + '_' + label + '.png' }).catch(() => {});
  }
  const A = await mk('Ayla', 'en', true), B = await mk('Berk', 'tr', false);
  const acc = await A.evaluate(() => ({ on: AO.acc.on, id: AO.acc.auth && AO.acc.auth.id, lang: DonguI18n.lang })); const accB = await B.evaluate(() => ({ on: AO.acc.on, id: AO.acc.auth && AO.acc.auth.id, lang: DonguI18n.lang, shop: (document.getElementById('nav-magaza') || {}).textContent || '' }));
  ok(acc.on && acc.lang === 'en' && accB.on && accB.lang === 'tr' && /Mağaza/.test(accB.shop), 'iki hesap: Ayla İngilizce (telefon), Berk Türkçe (masaüstü)', JSON.stringify({ acc, accB }));
  for (const id of [acc.id, accB.id]) await S.admin(PORT, KEY, id, 'seviye', 5);
  await scan(A, 'lobby', true);
  // arkadaşlık + DM
  await A.click('#nav-arkadas'); await A.waitForSelector('#socBody', { timeout: 6000 }); await A.waitForTimeout(500); await scan(A, 'friends', true);
  await A.fill('#socCode', accB.id); await A.click('#socAddBtn'); await A.waitForTimeout(1000);
  await B.click('#nav-arkadas'); await B.waitForTimeout(700); const badge = await B.evaluate(() => (document.querySelector('#nav-arkadas .nbadge') || {}).textContent || '');
  await B.evaluate(() => { const b = document.querySelector('[data-tab="requests"]'); b && b.click(); }); await B.waitForTimeout(400);
  const accepted = await B.evaluate(() => { const b = document.querySelector('[data-act="accept"]'); if (!b) return false; b.click(); return true; }); await B.waitForTimeout(900);
  await A.evaluate(() => { const b = document.querySelector('[data-tab="friends"]'); b && b.click(); }); await A.waitForTimeout(700);
  const friendsA = await A.evaluate(() => Array.from(document.querySelectorAll('.srow')).map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  ok(accepted && friendsA.some((x) => /Berk/.test(x)), 'arkadaşlık: Ayla kodla istek → Berk kabul (rozet "' + badge + '") → Ayla listesinde Berk', JSON.stringify(friendsA));
  await scan(A, 'friends_list', true);
  await A.evaluate((id) => AO.showDM(id, 'Berk'), accB.id); await A.waitForTimeout(800);
  await B.evaluate((id) => AO.showDM(id, 'Ayla'), acc.id); await B.waitForTimeout(800);
  const trMsg = 'Selam, akşam bir el atalım mı? Masada görüşürüz.';
  await B.evaluate((m) => { const i = document.getElementById('dmText'); i.value = m; i.dispatchEvent(new Event('input')); document.getElementById('dmSend').click(); }, trMsg); await B.waitForTimeout(1500);
  const dmA = await A.evaluate(() => Array.from(document.querySelectorAll('.bub .txt')).map((x) => x.textContent));
  ok(dmA.some((x) => x === trMsg), 'DM: Berk\'in Türkçe mesajı Ayla\'da anında ve çevrilmeden', JSON.stringify(dmA));
  await scan(A, 'dm', true);
  await A.evaluate(() => { try { AO.dmClose(); } catch (e) {} AO.lobby(); }); await B.evaluate(() => { try { AO.dmClose(); } catch (e) {} AO.lobby(); }); await A.waitForTimeout(500);
  // kıraathane (Ayla kurar)
  await A.click('#nav-kiraathane'); await A.waitForTimeout(900); await scan(A, 'venue_create', true);
  ok(!!(await A.$('#vCreate')), 'Kıraathanem → kurma penceresi');
  await A.click('#vCreate'); await A.waitForTimeout(1500);
  let vs = await A.evaluate(() => ({ screen: !!document.querySelector('.venue.ext'), code: Venue.venue && Venue.venue.code, kasa: Venue.venue && Venue.venue.kasa, name: Venue.venue && Venue.venue.name }));
  ok(vs.screen && vs.code && vs.code.length === 5 && vs.kasa === 200, 'kuruldu: cephe, 5 harfli kod, kasa 200 (ad: ' + vs.name + ')', JSON.stringify(vs)); await scan(A, 'venue_facade', true);
  await A.click('#vDoor'); await A.waitForTimeout(1500);
  vs = await A.evaluate(() => ({ inside: Venue.inside, items: document.querySelectorAll('.vitem').length, chars: document.querySelectorAll('.vchar').length }));
  ok(vs.inside && vs.items === 5 && vs.chars >= 1, 'iç mekân: 5 başlangıç eşyası, karakter', JSON.stringify(vs)); await scan(A, 'venue_inside', true);
  await A.evaluate(() => { const b = document.getElementById('vSkipIntro') || document.querySelector('#overlay .close, #overlay [id$=Close], #overlay button.soft'); b && b.click(); }); await A.waitForTimeout(400);
  await A.evaluate(() => { const o = document.querySelector('#overlay .card'); if (o) { const b = Array.from(o.querySelectorAll('button')).find((x) => /Skip|Atla|✕|Close|Kapat/.test(x.textContent)); b && b.click(); } }); await A.waitForTimeout(400);
  await A.click('#vShop'); await A.waitForTimeout(600); await scan(A, 'venue_shop', true);
  await A.click('[data-buy="v_sandalye"]'); await A.waitForTimeout(800);
  let v = await A.evaluate(() => ({ kasa: Venue.venue.kasa, inv: Venue.venue.inventory.length }));
  ok(v.kasa === 80 && v.inv === 6, 'dükkân: sandalye alındı, kasa 200 → 80, envanter 6', JSON.stringify(v));
  await A.click('#vShopX').catch(() => {}); await A.waitForTimeout(300);
  await A.click('#vProd'); await A.waitForTimeout(500); await scan(A, 'venue_prod', true);
  await A.click('[data-prod]'); await A.waitForTimeout(800);
  v = await A.evaluate(() => { const st = Venue.venue.production.stations; const k = Object.keys(st)[0]; return { kasa: Venue.venue.kasa, running: st[k].batchEndsAt > Date.now() }; });
  ok(v.kasa === 70 && v.running, 'üretim: parti başladı, girdi 10 düştü (kasa 70)', JSON.stringify(v));
  await A.click('#vProdX').catch(() => {}); await A.waitForTimeout(300);
  await A.evaluate(() => { const o = document.getElementById('vOut'); o && o.click(); }); await A.waitForTimeout(600);
  if (await A.$('#vDisc')) { await A.click('#vDisc'); await A.waitForTimeout(900); const disc = await A.evaluate(() => (document.querySelector('#overlay .card') || {}).textContent || ''); ok(/Discover|Keşfet/.test(disc), 'Keşfet penceresi açıldı', disc.slice(0, 80)); await scan(A, 'venue_discover', true); await A.evaluate(() => { const b = document.querySelector('#overlay [id$=Close], #overlay .close'); b && b.click(); }); await A.waitForTimeout(300); }
  await A.evaluate(() => { const b = document.getElementById('vBack'); b && b.click(); }); await A.waitForTimeout(600); await A.evaluate(() => AO.lobby()); await A.waitForTimeout(400);
  // arkadaş odası: Berk kurar (kahve odası), Ayla kodla katılır, 2 bot ile başlar, 1 el baştan sona
  await B.evaluate(() => AO.tables(AO.rooms[0])); await B.waitForTimeout(400); await B.click('#tbFriends'); await B.waitForSelector('#nCreate', { timeout: 5000 }); await B.click('#nCreate'); await B.waitForTimeout(1200);
  const code = await B.evaluate(() => AO.net.code); ok(code && code.length === 4, 'Berk oda kurdu: ' + code);
  await A.evaluate(() => AO.tables(AO.rooms[0])); await A.waitForTimeout(400); await A.click('#tbFriends'); await A.waitForSelector('#nCode', { timeout: 5000 }); await A.fill('#nCode', code); await A.click('#nJoin'); await A.waitForTimeout(1500);
  const seats = await B.evaluate(() => AO.net.seats.filter(Boolean).map((s) => s.name)); ok(seats.indexOf('Ayla') >= 0 && seats.indexOf('Berk') >= 0, 'Ayla odaya katıldı', JSON.stringify(seats));
  await scan(A, 'room_wait', true);
  await B.click('#rStart'); await B.waitForTimeout(500); if (await B.$('#rFillYes')) await B.click('#rFillYes'); await B.waitForTimeout(1500);
  for (const p of [A, B]) { await p.waitForFunction(() => !!(AO.state() && AO.net.online), null, { timeout: 15000 }).catch(() => {}); }
  await scan(A, 'online_intro', true);
  const t0 = Date.now(); let fin = false, last = 0, shots = 0;
  while (Date.now() - t0 < 300000) {
    const st = await A.evaluate(() => !!(AO.state() && AO.state().finished)).catch(() => false); if (st) { fin = true; break; }
    for (const p of [A, B]) await L.myMove(p).catch(() => null);
    if (Date.now() - last > 3000) { last = Date.now(); await scan(A, 'online_game', shots++ < 2); }
    await S.sleep(100);
  }
  ok(fin, 'iki gerçek oyuncu + 2 bot: 1 el baştan sona bitti (' + Math.round((Date.now() - t0) / 1000) + ' sn)');
  await A.waitForTimeout(1500); await scan(A, 'online_result', true);
  const lgA = await A.evaluate(() => ({ h2: (document.querySelector('.ledger h2') || {}).textContent || '', rows: document.querySelectorAll('.lrow').length })); const lgB = await B.evaluate(() => ({ h2: (document.querySelector('.ledger h2') || {}).textContent || '', rows: document.querySelectorAll('.lrow').length }));
  ok(lgA.rows === 4 && lgB.rows === 4 && /Game over/.test(lgA.h2) && /Oyun bitti/.test(lgB.h2), 'sonuç ekranı iki dilde: ' + lgA.h2 + ' | ' + lgB.h2, JSON.stringify({ lgA, lgB }));
  const glog = await A.evaluate(() => (AO.state().log || []).slice(-6).map((x) => DonguI18n.rt(x)));
  ok(glog.every((x) => !/[çğıöşü]/.test(x.replace(/Döngü|Berk|Ayla|Ayşe|Şükrü|Gülay|Fikret|Şakir/g, ''))), 'sunucu günlüğü İngilizce ekranda çevrildi', JSON.stringify(glog));
  // /olcum: el ve maç kaydı
  const ol = JSON.parse((await S.get(PORT, '/olcum?key=' + KEY)).body);
  ok(ol.toplam.hands >= 1 && ol.toplam.matches >= 1 && ol.toplam.humansHands >= 1, '/olcum: el ve maç kaydı yazıldı', JSON.stringify(ol.toplam));
  ok(TR.size === 0, 'İngilizce ekranda Türkçe kalıntı yok (' + TR.size + ')');
  ok(errs.length === 0, 'sayfa hatası yok', JSON.stringify(errs.slice(0, 4)));
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); await S.stop(srv); process.exit(0);
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
