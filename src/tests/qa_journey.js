// Kullanıcı yolculuğu (dosya modu, sunucusuz): giriş → karşılama → lobi (bütün düğmeler) → kilitli mekân → masa seçimi → bota karşı 1 el (gerçek düğmelerle) → sonuç → Tekrar Oyna → oyun içi pencereler → çık → kaldığın maç → yenileme
// Çalıştırma: NODE_PATH=/opt/npm-tools/node_modules node tests/qa_journey.js   (W=844 H=390 ile telefon)
const L = require('./qa_lib.js');
(async () => {
  const W = parseInt(process.env.W) || 1366, H = parseInt(process.env.H) || 768;
  const { browser, page, errors, consoleErr } = await L.launch({ w: W, h: H });
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); };
  await L.fresh(page, null, L.FAST, { coins: 500, owned: [], xp: 300, stats: { hands: 6, matches: 1, wins: 0 } }); // seviye 3 + 6 el → Köy Kahvesi açık, Ara Sokak kilitli
  await page.waitForTimeout(300);
  const s0 = await L.ui(page); ok(s0.screen === 'splash' || s0.screen === 'login', 'açılışta splash/login', s0.screen);
  await page.waitForSelector('#gGuest', { timeout: 15000 });
  await page.dblclick('#gGuest'); await page.waitForTimeout(2500);
  let u = await L.ui(page); ok(u.screen === 'win', 'misafir girişi → karşılama (çift tıklamada tek geçiş)', u.screen);
  const win = await page.evaluate(() => ({ title: (document.querySelector('.win .title') || {}).textContent, btns: Array.from(document.querySelectorAll('.win button')).map((b) => b.id + ':' + b.textContent.trim()) }));
  ok(/Hoş Geldin/.test(win.title || '') && win.btns.some((b) => /wTut/.test(b)) && win.btns.some((b) => /wPlay/.test(b)), 'karşılama penceresi: Eğitime Başla / Doğrudan Oyna', JSON.stringify(win));
  await page.click('#wPlay'); await page.waitForTimeout(800);
  u = await L.ui(page); ok(u.screen === 'lobby', 'Doğrudan Oyna → lobi', u.screen);
  const lobby = await page.evaluate(() => ({ rooms: document.querySelectorAll('.rcard').length, sel: (document.querySelector('.rcard.sel') || {}).dataset && document.querySelector('.rcard.sel').dataset.room, nav: Array.from(document.querySelectorAll('[id^=nav-]')).map((e) => e.id) }));
  ok(lobby.rooms === 13 && lobby.sel === 'koy', 'lobide 13 oda kartı, Köy Meydanı seçili', JSON.stringify(lobby));
  const navs = [['nav-arkadas', 'toast'], ['nav-kiraathane', 'toast'], ['nav-lider', '#lgClose'], ['nav-bonus', '#qClose'], ['nav-reklam', 'toast'], ['nav-magaza', '#sClose'], ['nav-ogren', '#thClose'], ['nav-bilgi', '#helpClose'], ['nav-ayar', '#helpClose'], ['lbProfile', '#pfClose'], ['lbShop', '#sClose'], ['lbPlus', '#sClose']];
  for (const [id, closer] of navs) {
    await page.click('#' + id); await page.waitForTimeout(450);
    const after = await L.ui(page);
    if (closer === 'toast') ok(after.toasts.length > 0 && !after.overlay, id + ': bilgi mesajı', JSON.stringify(after.toasts));
    else {
      ok(after.overlay || after.screen !== 'lobby', id + ': pencere açıldı', JSON.stringify(after));
      const c = await page.$(closer); ok(!!c, id + ': kapatma düğmesi var (' + closer + ')');
      if (c) { await page.click(closer); await page.waitForTimeout(500); }
      const back = await L.ui(page); ok(!back.overlay && back.screen === 'lobby', id + ': kapatınca lobiye dönüş', JSON.stringify(back));
    }
  }
  const soon = await page.evaluate(() => { const b = document.querySelector('.rcard.locked'); if (!b) return null; b.click(); return b.dataset.room; }); await page.waitForTimeout(400);
  const lockWin = await page.evaluate(() => ({ alock: !!document.querySelector('#overlay .alock'), h2: (document.querySelector('#overlay h2') || {}).textContent || '', rows: Array.from(document.querySelectorAll('#overlay .alrow span')).map((x) => x.textContent) }));
  ok(soon === 'sokak' && lockWin.alock && /Ara Sokak/.test(lockWin.h2) && lockWin.rows.length === 2, 'kilitli mekân kartı → "nasıl açarım" penceresi', JSON.stringify({ soon, lockWin }));
  await page.evaluate(() => { const b = document.getElementById('alClose'); b && b.click(); }); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.rcard[data-room="kahve"]').click()); await page.waitForTimeout(200);
  await page.dblclick('#lbPlay'); await page.waitForTimeout(600);
  u = await L.ui(page); ok(u.screen === 'tables', 'OYNA → masa seçimi', u.screen);
  const tb = await page.evaluate(() => ({ h2: document.querySelector('.tables h2').textContent, modes: document.querySelectorAll('#tbModes button').length, cards: document.querySelectorAll('.tcard').length, bot: !!document.querySelector('#tbBot'), fr: !!document.querySelector('#tbFriends'), back: !!document.querySelector('#tbBack') }));
  ok(/Kahve/.test(tb.h2) && tb.modes === 3 && tb.cards === 5 && tb.bot && tb.fr && tb.back, 'masa seçimi: oda adı, 3 mod, 5 kart, bot, arkadaş, geri', JSON.stringify(tb));
  await page.click('#tbBack'); await page.waitForTimeout(400); u = await L.ui(page); ok(u.screen === 'lobby', 'masa seçimi Geri → lobi', u.screen);
  await page.click('#lbPlay'); await page.waitForTimeout(400);
  await page.click('#tbFriends'); await page.waitForTimeout(400); u = await L.ui(page); ok(u.overlay && /Çevrim içi/.test(u.h2 || ''), 'Arkadaşlarla oda penceresi', JSON.stringify(u));
  await page.click('#nCancel'); await page.waitForTimeout(400); u = await L.ui(page); ok(!u.overlay && u.screen === 'tables', 'Çevrim içi oda Geri → masa seçimi', JSON.stringify(u));
  await page.click('#tbModes button[data-m="1"]'); await page.waitForTimeout(300);
  const m1 = await page.evaluate(() => JSON.parse(localStorage.getItem('ao.settings')).mode); ok(m1 === 1, '1 El seçimi kaydedildi', m1);
  await page.dblclick('#tbBot'); await page.waitForTimeout(900);
  u = await L.ui(page); const g0 = await L.state(page);
  ok(g0 && g0.total === 1 && g0.hand === 1 && u.btnStart, 'bota karşı 1 el: el başı penceresi (çift tıklamada tek oyun)', JSON.stringify({ u, g0 }));
  const intro = await page.evaluate(() => ({ ind: !!document.querySelector('#introInd'), ok: !!document.querySelector('#introOkT'), text: document.querySelector('#overlay .card').textContent.replace(/\s+/g, ' ').slice(0, 600) }));
  ok(intro.ind && intro.ok && /görevi/.test(intro.text) && /Açılma kuralı/.test(intro.text), 'el başı bilgi: görev + açılma kuralı + gösterge/okey', intro.text.slice(0, 200));
  await page.click('#btnStart'); await page.waitForTimeout(500);
  const g1 = await L.state(page); ok(g1.n === 14 && !g1.opened, 'elde 14 taş', JSON.stringify(g1));
  const log = [];
  await L.playUntil(page, (g) => g && g.phase === 'pickup' && g.cp === 0, 60000, log);
  const gb = await L.state(page);
  await page.dblclick('#btnDraw'); await page.waitForTimeout(400);
  const g2 = await L.state(page); u = await L.ui(page);
  ok(g2.n === gb.n + 1 && g2.deck <= gb.deck - 1 && g2.deck >= gb.deck - 2 && (g2.phase === 'play' || g2.phase === 'claim'), 'ÇEK çift tıklama: tek taş çekildi', JSON.stringify({ gb, g2 }));
  ok(!u.toasts.some((t) => /sıra çekme değil/.test(t)), 'çift tıklamada ham motor hatası gösterilmiyor', JSON.stringify(u.toasts));
  const t2 = Date.now();
  const done = await L.playUntil(page, (g, uu) => g && g.phase === 'handover' && uu.overlay, 420000, log);
  const gE = await L.state(page); u = await L.ui(page);
  ok(done && gE.finished && gE.history === 1, '1 el bitti, maç bitti (' + Math.round((Date.now() - t2) / 1000) + ' sn, ' + log.length + ' hamle)', JSON.stringify({ gE, moves: log.slice(-6) }));
  const ledger = await page.evaluate(() => ({ h2: (document.querySelector('.ledger h2') || {}).textContent || '', rows: document.querySelectorAll('.lrow').length, again: !!document.querySelector('#btnAgain'), lobby: !!document.querySelector('#btnLobby') }));
  ok(/Oyun bitti/.test(ledger.h2) && ledger.rows === 4 && ledger.again && ledger.lobby, 'sonuç ekranı: Oyun bitti, 4 satır, Tekrar Oyna + Lobiye Dön', JSON.stringify(ledger));
  const chk = await page.evaluate(() => { const g = AO.state(); const h = g.history[0]; return h.detail.map((d, i) => d.score === h.scores[i] && h.totals[i] === h.scores[i]).every(Boolean); });
  ok(chk, 'defter puanları motorla tutarlı');
  await page.dblclick('#btnAgain'); await page.waitForTimeout(900);
  const g3 = await L.state(page); u = await L.ui(page);
  ok(g3 && g3.total === 1 && g3.hand === 1 && g3.history === 0 && u.btnStart, 'Tekrar Oyna: aynı modda yeni maç, el başı penceresi', JSON.stringify({ g3, u }));
  await page.click('#btnStart'); await page.waitForTimeout(400);
  for (const [id, closer] of [['taskBtn', '#helpClose'], ['helpBtn', '#helpClose'], ['menuBtn', '#helpClose'], ['charBtn', '#cCancel'], ['shopBtn', '#sClose']]) {
    await page.click('#' + id); await page.waitForTimeout(400);
    const a = await L.ui(page); ok(a.overlay, 'oyun içi ' + id + ' penceresi açıldı', JSON.stringify(a));
    const c = await page.$(closer); ok(!!c, id + ' kapatma düğmesi (' + closer + ')');
    if (c) await page.click(closer); await page.waitForTimeout(400);
    const b = await L.ui(page); const gs = await L.state(page); ok(!b.overlay && gs && gs.phase !== 'handover', id + ' kapatınca oyuna dönüş', JSON.stringify(b));
  }
  await page.click('#ledgerBtn'); await page.waitForTimeout(300); u = await L.ui(page); ok(!u.overlay && u.toasts.some((t) => /Henüz tamamlanmış el yok/.test(t)), 'Puanlar (el yokken): uyarı', JSON.stringify(u.toasts));
  await page.click('#menuBtn'); await page.waitForTimeout(300);
  const hasMenu = await page.$('#sMenu'); ok(!!hasMenu, 'ayarlarda Ana menü düğmesi');
  if (hasMenu) { await page.click('#sMenu'); await page.waitForTimeout(400); }
  u = await L.ui(page); ok(u.overlay && /Maçtan çık/.test(u.h2 || ''), 'Ana menü → "Maçtan çık?" onayı', JSON.stringify(u));
  await page.click('#lvNo'); await page.waitForTimeout(300); u = await L.ui(page); ok(!u.overlay && (await L.state(page)).phase !== 'handover', 'Vazgeç → oyuna dönüş', JSON.stringify(u));
  await page.click('#menuBtn'); await page.waitForTimeout(300); await page.click('#sMenu'); await page.waitForTimeout(300); await page.dblclick('#lvYes'); await page.waitForTimeout(700);
  u = await L.ui(page); ok(u.screen === 'lobby' && !u.overlay, 'Çık → lobi', JSON.stringify(u));
  if (u.screen !== 'lobby') { await page.evaluate(() => AO.lobby()); await page.waitForTimeout(500); }
  await page.click('#lbPlay'); await page.waitForTimeout(400);
  const resume = await page.$('#tbResume'); ok(!!resume, 'masa seçiminde "Kaldığın maç" kartı');
  if (resume) { await page.click('#tbResume'); await page.waitForTimeout(600); const gr = await L.state(page); ok(gr && gr.hand === 1 && !gr.finished, 'kaldığın maça dönüş', JSON.stringify(gr)); }
  await page.reload(); await page.waitForTimeout(3200); await page.waitForSelector('#gGuest', { timeout: 15000 }); await page.click('#gGuest'); await page.waitForTimeout(2200);
  u = await L.ui(page); ok(u.screen === 'lobby', 'yenileme sonrası karşılama tekrar çıkmaz, lobi', JSON.stringify(u));
  await page.click('#lbPlay'); await page.waitForTimeout(400); ok(!!(await page.$('#tbResume')), 'yenileme sonrası kaldığın maç korunur');
  ok(errors.length === 0, 'sayfa hatası yok', JSON.stringify(errors.slice(0, 3)));
  console.log('CONSOLE ' + JSON.stringify(consoleErr.slice(0, 5)));
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close();
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
