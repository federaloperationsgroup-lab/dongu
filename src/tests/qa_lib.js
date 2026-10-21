// Döngü QA yardımcıları (Playwright) — v10.12 sonrası yeniden yazıldı (19 Ekim 2026, ortam sıfırlanması)
// NODE_PATH=/opt/npm-tools/node_modules:/opt/node-tools/node_modules
const { chromium } = require('playwright'); const path = require('path');
const ROOT = '/home/claude/okey';
const TEST = 'file://' + path.resolve(ROOT + '/web/test.html');
async function launch(opts) {
  opts = opts || {};
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(Object.assign({ viewport: { width: opts.w || 1366, height: opts.h || 768 }, deviceScaleFactor: opts.dpr || 1 }, opts.mobile ? { isMobile: true, hasTouch: true } : {}));
  if (opts.lang) await ctx.addInitScript((l) => { try { localStorage.setItem('ao.lang', l); } catch (e) {} }, opts.lang);
  const page = await ctx.newPage();
  const errors = [], consoleErr = [], net = [];
  page.on('pageerror', (e) => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErr.push(m.type() + ': ' + m.text().slice(0, 200)); });
  page.on('requestfailed', (r) => net.push(r.url().slice(0, 120) + ' ' + (r.failure() && r.failure().errorText)));
  page.on('response', (r) => { if (r.status() >= 400) net.push(r.status() + ' ' + r.url().slice(0, 120)); });
  return { browser, ctx, page, errors, consoleErr, net };
}
// temiz başlangıç: onay verilmiş, ayarlar / gardırop isteğe bağlı
async function fresh(page, url, settings, wardrobe) {
  await page.goto(url || TEST);
  await page.evaluate(({ s, w }) => { const l = localStorage.getItem('ao.lang'); localStorage.clear(); if (l) localStorage.setItem('ao.lang', l); localStorage.setItem('ao.consent', JSON.stringify({ v: '1.1', at: Date.now(), adult: true })); if (s) localStorage.setItem('ao.settings', JSON.stringify(s)); if (w) localStorage.setItem('ao.wardrobe', JSON.stringify(w)); }, { s: settings || null, w: wardrobe || null });
  await page.reload();
}
const FAST = { hints: false, speed: 'fast', sound: false, assist: true, claimTime: 3 };
async function login(page) { await page.waitForSelector('#gGuest', { timeout: 15000 }); await page.click('#gGuest'); await page.waitForFunction(() => document.querySelector('.win') || document.querySelector('.lobby') || document.querySelector('#cAdult'), null, { timeout: 15000 }); }
function tap(page, sel) { return page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); const o = { pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, button: 0, isPrimary: true, pointerType: 'touch' }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new MouseEvent('click', o)); return true; }, sel); }
function state(page) { return page.evaluate(() => { const g = AO.state(); if (!g) return null; const me = g.players[0]; return { phase: g.phase, cp: g.cp, hand: g.hand, total: g.totalHands, turnNo: g.turnNo, finished: !!g.finished, n: me.hand.length, opened: !!me.opened, deck: g.deck.length, kafa: !g.task.req, history: g.history.length, online: !!g.online, prep: !!(AO.peek && AO.peek.prepUntil && Date.now() < AO.peek.prepUntil), claimant: g.claimQueue && g.claimQueue.length ? g.claimQueue[0] : null, claimTile: g.claimTile || null, totals: g.totals }; }); }
function ui(page) { return page.evaluate(() => ({ overlay: !!document.querySelector('#overlay .card'), h2: (document.querySelector('#overlay .card h2') || {}).textContent || null, btnStart: !!document.querySelector('#btnStart'), btnNext: !!document.querySelector('#btnNext'), btnAgain: !!document.querySelector('#btnAgain'), screen: (function () { const sc = document.querySelector('#screen'); const has = (q) => !!document.querySelector(q); if (has('.win')) return 'win'; if (has('.tables')) return 'tables'; if (has('.lobby') || has('#lbPlay')) return 'lobby'; if (has('#gGuest')) return 'login'; if (has('.splash')) return 'splash'; if (has('.venue')) return 'venue'; if (AO.state && AO.state()) return 'game'; return (sc && sc.className) || ''; })(), toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent) })); }
async function pickOpenSel(page) { // birden çok uygun per: ilk adayı seç, onayla
  for (let k = 0; k < 3; k++) {
    const sel = await page.evaluate(() => !!document.querySelector('#btnOpenSel')); if (!sel) return;
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('#rack .slot.cand .t')).map((e) => +e.dataset.id)); if (!ids.length) break;
    await tap(page, '#rack .t[data-id="' + ids[Math.min(k, ids.length - 1)] + '"]');
    let ok = false; for (let w = 0; w < 10 && !ok; w++) { await page.waitForTimeout(150); ok = await page.evaluate(() => { const b = document.querySelector('#btnOpenSel'); if (b && !b.disabled) { b.click(); return true; } return false; }); }
    if (ok) { await page.waitForTimeout(400); return; }
  }
  await page.evaluate(() => { const b = document.querySelector('#btnOpenCancel'); b && b.click(); }); await page.waitForTimeout(200);
}
// Benim sıramda bir hamle (gerçek düğmelerle). Dönüş: yapılan işlem adı ya da null
async function myMove(page, log) {
  const g = await state(page); if (!g) return null;
  if (await page.$('#btnStart')) { try { await page.click('#btnStart', { timeout: 3000 }); } catch (e) {} await page.waitForTimeout(300); return 'start'; }
  if (g.phase === 'handover') { const b = await page.$('#btnNext'); if (b) { await page.click('#btnNext').catch(() => {}); await page.waitForTimeout(400); return 'next'; } return 'handover'; }
  if (g.prep) { await page.evaluate(() => { const b = document.querySelector('#btnPrepGo'); b && b.click(); }); await page.waitForTimeout(200); return 'prepGo'; }
  if (g.phase === 'claim') { if (g.claimant === 0) { const wants = await page.evaluate(() => { const g = AO.state(); return Okey.botWantsTile(g, 0, g.claimTile, true); }); await page.evaluate((y) => { const b = document.querySelector(y ? '#btnClaim' : '#btnPass'); b && b.click(); }, wants); await page.waitForTimeout(250); return wants ? 'claim' : 'pass'; } return null; }
  if (g.cp !== 0) return null;
  if (g.phase === 'pickup') {
    const takeOk = await page.evaluate(() => { const g = AO.state(); const td = Okey.topDiscard(g); return !!(td && Okey.botWantsTile(g, 0, td, false)); });
    if (takeOk) { await page.evaluate(() => { const b = document.querySelector('#btnTake'); b && !b.disabled && b.click(); }); await page.waitForTimeout(250); return 'take'; }
    await page.evaluate(() => { const b = document.querySelector('#btnDraw'); b && !b.disabled && b.click(); }); await page.waitForTimeout(300); return g.deck === 0 ? 'closeHand' : 'draw';
  }
  if (g.phase === 'play') {
    if (!g.kafa && !g.opened) {
      const can = await page.evaluate(() => { const g = AO.state(); return g.turnNo >= 4 && !!Okey.findTaskGroups(g.players[0].hand, g.ok, g.task); });
      if (can) {
        for (const s of ['#sortColor', '#sortNum']) {
          await page.evaluate((x) => { const b = document.querySelector(x); b && b.click(); }, s); await page.waitForTimeout(250);
          const ready = await page.evaluate(() => !!(document.querySelector('#btnOpen') && !document.querySelector('#btnOpen').disabled));
          if (ready) { await page.evaluate(() => document.querySelector('#btnOpen').click()); await page.waitForTimeout(400); await pickOpenSel(page); const g2 = await state(page); if (g2.opened) return 'open'; }
        }
        const ok = await page.evaluate(() => { const g = AO.state(); const grs = Okey.findTaskGroups(g.players[0].hand, g.ok, g.task); if (!grs) return false; const ids = []; grs.forEach((m) => { m.tiles.forEach((t) => ids.push(t.id)); ids.push(null); }); const rest = g.players[0].hand.map((t) => t.id).filter((id) => ids.indexOf(id) < 0); AO.setRack(ids.concat(rest)); return true; });
        if (ok) { await page.waitForTimeout(250); const ready = await page.evaluate(() => !!(document.querySelector('#btnOpen') && !document.querySelector('#btnOpen').disabled)); if (ready) { await page.evaluate(() => document.querySelector('#btnOpen').click()); await page.waitForTimeout(400); await pickOpenSel(page); const g2 = await state(page); if (g2.opened) return 'open'; } }
      }
    }
    if (!g.kafa && g.opened) { const lay = await page.evaluate(() => { const b = document.querySelector('#btnLay'); if (b && !b.disabled) { b.click(); return true; } return false; }); if (lay) { await page.waitForTimeout(400); const ask = await page.$('#kaRun'); if (ask) { await page.click('#kaRun').catch(() => {}); await page.waitForTimeout(300); } return 'lay'; } }
    // taş at: botun atacağı taşı seç (botStep mantığı yerine en yüksek puanlı tekil taş)
    const did = await page.evaluate(() => { const g = AO.state(); const me = g.players[0]; if (!me.hand.length) return false; let pick = me.hand[0];
      if (me.hand.length > 1) { const grs = Okey.findTaskGroups ? null : null; const used = {}; const segs = AO.rackSegments().filter((s) => s.kind); segs.forEach((s) => s.tiles.forEach((t) => { used[t.id] = 1; })); const free = me.hand.filter((t) => !used[t.id] && !Okey.isJoker(t, g.ok)); const cand = free.length ? free : me.hand.filter((t) => !Okey.isJoker(t, g.ok)); pick = (cand.length ? cand : me.hand).slice().sort((a, b) => b.n - a.n)[0]; }
      AO.sel().length = 0; AO.sel().push(pick); AO.render(); const b = document.querySelector('#btnDiscard'); if (b && !b.disabled) { b.click(); return true; } return false; });
    await page.waitForTimeout(300); if (did) return 'discard';
    // seçilemedi: son çare tek taş seç
    await page.evaluate(() => { const g = AO.state(); const me = g.players[0]; AO.sel().length = 0; AO.sel().push(me.hand[0]); AO.render(); const b = document.querySelector('#btnDiscard'); b && !b.disabled && b.click(); }); await page.waitForTimeout(300); return 'discard2';
  }
  return null;
}
async function playUntil(page, cond, ms, log) {
  const t0 = Date.now(); let idle = 0;
  while (Date.now() - t0 < (ms || 120000)) {
    const g = await state(page); const u = await ui(page);
    if (await cond(g, u)) return true;
    const mv = await myMove(page, log).catch((e) => { if (log) log.push('hata ' + e.message); return null; });
    if (log && mv) log.push(mv);
    if (!mv) { idle++; await page.waitForTimeout(idle > 20 ? 400 : 120); } else idle = 0;
  }
  return false;
}
module.exports = { launch, fresh, login, tap, state, ui, myMove, playUntil, pickOpenSel, FAST, TEST, ROOT };
