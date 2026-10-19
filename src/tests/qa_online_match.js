// Çevrim içi maç akışı (gerçek tarayıcı oturumları, PORT 8770): Ayla + Berk + 2 bot, 6 el arkadaş odası, gerçek düğmelerle hamle;
// 2. elde Berk sayfayı yeniler (token ile aynı koltuğa dönüş, oyun sürer); maç sonu sonuç ekranı, ödül/XP/lig kaydı;
// rövanş ikisi "evet" → aynı grupla yeni maç; yeni maçta Berk masadan çıkar (hükmen) → Ayla 1 el daha; /olcum sayaçları.
const S = require('./qa_srv.js'); const L = require('./qa_lib.js'); const { chromium } = require('playwright'); const fs = require('fs');
const PORT = 8770, KEY = 'test-anahtar-70', LOG = '/tmp/qa_online_match.srv.log';
const SETTINGS = { tutorialDone: true, welcomed: true, sound: false, mode: 6, hints: false, speed: 'fast', assist: true, claimTime: 3, theme: 'koy', meldHinted: true, tipSkin: true, tipStore: true, firstBotMatch: true };
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); };
  const srv = S.start(PORT, { ADMIN_KEY: KEY, QUICK_WAIT: '2000', PREP_MS: '2000', PREP_FIRST_MS: '2000', BOT_DELAY: '120', NEXT_DELAY: '2000', RESULT_GAP_MS: '600', TURN_MS: '25000', REMATCH_WAIT: '20000' }, LOG); await S.up(PORT, LOG, true);
  const browser = await chromium.launch(); const errs = [];
  async function mk(name) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
    await p.goto('http://127.0.0.1:' + PORT + '/'); await p.waitForTimeout(300);
    await p.evaluate(({ n, s }) => { localStorage.clear(); localStorage.setItem('ao.lang', 'tr'); localStorage.setItem('ao.avatar', JSON.stringify({ v: 2, name: n })); localStorage.setItem('ao.settings', JSON.stringify(s)); }, { n: name, s: SETTINGS });
    await p.reload(); await p.waitForSelector('#gGuest', { timeout: 15000 }); await p.waitForTimeout(300); await p.click('#gGuest'); await p.waitForTimeout(1200);
    if (await p.$('#cAdult')) { await p.check('#cAdult'); await p.click('#cGo'); } await p.waitForTimeout(2000); if (await p.$('#wPlay')) { await p.click('#wPlay'); await p.waitForTimeout(600); }
    return p;
  }
  const A = await mk('Ayla'), B = await mk('Berk');
  const ids = { A: await A.evaluate(() => AO.acc.auth.id), B: await B.evaluate(() => AO.acc.auth.id) }; for (const id of Object.values(ids)) await S.admin(PORT, KEY, id, 'seviye', 5);
  const me = async (p) => (await S.post(PORT, '/api/me', { id: p.id, token: p.token })).json;
  const auth = { A: await A.evaluate(() => AO.acc.auth), B: await B.evaluate(() => AO.acc.auth) };
  const xp0 = (await me(auth.A)).xp;
  // oda
  await A.evaluate(() => AO.tables(AO.rooms[0])); await A.waitForTimeout(400); await A.click('#tbFriends'); await A.waitForSelector('#nCreate', { timeout: 5000 }); await A.click('#nCreate'); await A.waitForTimeout(1200);
  const code = await A.evaluate(() => AO.net.code); ok(code && code.length === 4, 'Ayla oda kurdu (' + code + ', 6 el)');
  await B.evaluate(() => AO.tables(AO.rooms[0])); await B.waitForTimeout(400); await B.click('#tbFriends'); await B.waitForSelector('#nCode', { timeout: 5000 }); await B.fill('#nCode', code); await B.click('#nJoin'); await B.waitForTimeout(1500);
  await A.click('#rStart'); await A.waitForTimeout(500); if (await A.$('#rFillYes')) await A.click('#rFillYes'); await A.waitForTimeout(1500);
  for (const p of [A, B]) await p.waitForFunction(() => !!(AO.state() && AO.net.online), null, { timeout: 15000 }).catch(() => {});
  const th = await A.evaluate(() => AO.state().totalHands); ok(th === 6, 'maç 6 el, 2 bot ile başladı', th);
  const t0 = Date.now(); let reloaded = false, phase = 'play', fin = false;
  while (Date.now() - t0 < 900000) {
    const g = await A.evaluate(() => { const g = AO.state(); return g ? { hand: g.hand, finished: !!g.finished, phase: g.phase } : null; }).catch(() => null);
    if (g && g.finished) { fin = true; break; }
    if (g && g.hand === 2 && !reloaded && g.phase === 'play') { // Berk sayfayı yeniler
      reloaded = true; const seatB = await B.evaluate(() => AO.net.seat); await B.reload(); await B.waitForSelector('#gGuest', { timeout: 15000 }); await B.click('#gGuest'); await B.waitForTimeout(2500); const hasResume = !!(await B.$('#lbResumeNet')); if (hasResume) await B.click('#lbResumeNet'); await B.waitForTimeout(2500);
      const back = await B.evaluate(() => ({ online: !!(AO.net && AO.net.online), seat: AO.net && AO.net.seat, hand: AO.state() && AO.state().hand, code: AO.net && AO.net.code })).catch(() => null);
      ok(back && back.online && back.seat === seatB && back.code === code && back.hand === 2, 'Berk sayfayı yeniledi → lobide "Masaya dön" (' + hasResume + ') → aynı koltuğa döndü (el 2)', JSON.stringify(back));
    }
    for (const p of [A, B]) await L.myMove(p).catch(() => null);
    await S.sleep(80);
  }
  ok(fin, '6 el bitti (' + Math.round((Date.now() - t0) / 1000) + ' sn)');
  await A.waitForTimeout(2500);
  const lg = await A.evaluate(() => ({ h2: (document.querySelector('.ledger h2') || {}).textContent || '', rows: document.querySelectorAll('.lrow').length, reward: (document.getElementById('lgReward') || {}).textContent || '', rmYes: !!document.getElementById('rmYes') }));
  ok(lg.rows === 4 && /Oyun bitti/.test(lg.h2) && lg.rmYes, 'maç sonu ekranı + rövanş düğmeleri: ' + lg.h2 + ' | ' + lg.reward.slice(0, 80), JSON.stringify(lg));
  const pa = await me(auth.A); ok(pa.stats.matches >= 1 && pa.xp > xp0 && pa.league && pa.league.matches === 0, 'hesap: maç ' + pa.stats.matches + ', XP ' + xp0 + ' → ' + pa.xp + '; arkadaş odası lige sayılmaz (lig maç 0)', JSON.stringify(pa.league));
  // rövanş evet/evet → arkadaş odası bekleme odasına döner, kurucu yeniden başlatır (botlarla doldurur)
  await A.click('#rmYes'); await B.click('#rmYes'); await A.waitForTimeout(1500);
  await A.waitForSelector('#rStart', { timeout: 20000 }).catch(() => {});
  const wr = await A.evaluate(() => ({ room: !!document.getElementById('rStart'), names: AO.net.seats.filter(Boolean).map((s) => s.name), code: AO.net.code }));
  ok(wr.room && wr.names.length === 2 && wr.code === code, 'rövanş: ikisi evet → aynı oda bekleme odasına döndü (Ayla, Berk)', JSON.stringify(wr));
  await A.click('#rStart'); await A.waitForTimeout(500); if (await A.$('#rFillYes')) await A.click('#rFillYes'); await A.waitForTimeout(1500);
  for (const p of [A, B]) await p.waitForFunction(() => !!(AO.state() && !AO.state().finished && AO.state().hand === 1 && AO.net.online), null, { timeout: 30000 }).catch(() => {});
  const re = await A.evaluate(() => ({ hand: AO.state() && AO.state().hand, names: AO.net.seats.filter(Boolean).map((s) => s.name) }));
  ok(re.hand === 1 && re.names.length === 4 && re.names.indexOf('Berk') >= 0, 'rövanş maçı aynı grupla başladı', JSON.stringify(re));
  const olc1 = JSON.parse((await S.get(PORT, '/olcum?key=' + KEY)).body).toplam;
  // yeni maçta Berk masadan çıkar (Ayarlar → Ana menü → Çık): koltuğu kalır, bot yerine oynar
  await B.waitForFunction(() => AO.state() && AO.state().phase !== 'handover' && !(AO.peek && AO.peek.prepUntil && Date.now() < AO.peek.prepUntil), null, { timeout: 20000 }).catch(() => {});
  for (let i = 0; i < 60; i++) { const ov = await B.evaluate(() => !!document.querySelector('#overlay .card')); if (!ov) break; await L.myMove(B).catch(() => null); await B.waitForTimeout(500); }
  const dbg = [];
  for (const id of ['menuBtn', 'sMenu', 'lvYes']) { const r = await B.evaluate((id) => { const b = document.getElementById(id); const info = { id, found: !!b, h2: (document.querySelector('#overlay .card h2') || {}).textContent, state: AO.app.state, phase: AO.state() && AO.state().phase }; if (b) b.click(); return info; }, id); dbg.push(JSON.stringify(r)); await B.waitForTimeout(800); }
  const lvTxt = /Maçtan çık/.test(dbg[2]) ? 'Maçtan çık?' : dbg.join(' | ');
  const bl = await B.evaluate(() => ({ online: !!(AO.net && AO.net.online), game: !!AO.state(), menu: !!document.querySelector('.menu, #mmPlay, .splash') }));
  ok(/Maçtan çık/.test(lvTxt) && !bl.online && !bl.game, 'Berk maçtan çıktı ("' + lvTxt + '" → Çık)', JSON.stringify(bl));
  const t1 = Date.now(); let fin2 = false;
  while (Date.now() - t1 < 200000) { const g = await A.evaluate(() => { const g = AO.state(); return g ? { hand: g.hand, finished: !!g.finished, phase: g.phase } : null; }).catch(() => null); if (!g || g.hand >= 2 || g.finished) { fin2 = true; break; } await L.myMove(A).catch(() => null); await S.sleep(80); }
  ok(fin2, 'Ayla ve botlarla el sürdü ve bitti (' + Math.round((Date.now() - t1) / 1000) + ' sn)');
  await S.sleep(1500); const olc2 = JSON.parse((await S.get(PORT, '/olcum?key=' + KEY)).body).toplam;
  ok(/oyun başladı \(rövanş\)/.test(fs.readFileSync(LOG, 'utf8')) && olc2.leftHands >= olc1.leftHands + 1 && olc2.hands >= 7 && olc2.matches >= 1, '/olcum: rövanş maçı günlükte (kaydı maç bitince yazılır), çıkışlı el ' + olc2.leftHands + ', el ' + olc2.hands + ', maç ' + olc2.matches, JSON.stringify(olc2));
  const srvLog = fs.readFileSync(LOG, 'utf8'); ok(/Berk.*(ayrıldı|çıktı|terk|bağlantı kapandı)/.test(srvLog.split('rövanş maçı')[0] || srvLog), 'sunucu günlüğünde Berk çıkışı', srvLog.split('\n').filter((l) => /Berk/.test(l) && !/süre doldu/.test(l)).slice(-3).join(' | '));
  ok(errs.length === 0, 'sayfa hatası yok', errs.slice(0, 4).join(' | '));
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); await browser.close(); await S.stop(srv); process.exit(0);
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
