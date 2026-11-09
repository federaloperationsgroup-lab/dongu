// v10.16 (K194): skin hareketleri parçalı karakterde — "resim kayıyor" tester geri bildirimi.
// 1) Bot masası: Ali/Ayşe/Mehmet gardırop karakteri, üçü de rig; eski bot resmi (assets/bot-*) hiçbir yerde yok (koltuk, portre, profil kartı).
// 2) Bakış: rig'li koltukta bütün resim kaymaz (.avw animasyonu yok), baş/gövde hedefe döner ve bakış süresince tutulur; bitince beklemeye döner. Kendi bakışın portrede.
// 3) Tokat: yakalayanın kolu savrulur (açık el), yiyenin başı savrulur (şaşkın yüz); .avw animasyonu yok. 4) Zafer/Tos sarsılması rig'de .avw'yi kaydırmaz.
// 5) Kendi skininde portre kırpımı genişler (eller görünür), bitince baş-omuz kırpımına döner. 6) Hareket azaltma açıkken de resim kaymaz.
// 7) Çevrim içi arkadaş odası: boş koltuklara gelen görünür botlar ({bot:'ali'}) da rig. Sayfa hatası yok.
const L = require('./qa_lib.js'); const S = require('./qa_srv.js'); const fs = require('fs'); const PORT = 8774, URL0 = 'http://127.0.0.1:' + PORT + '/'; const OUT = L.ROOT + '/tests/out'; fs.mkdirSync(OUT, { recursive: true });
const SET = Object.assign({ tutorialDone: true, welcomed: true, meldHinted: true, tipSkin: true, tipStore: true, firstBotMatch: true }, L.FAST);
async function toBotTable(page) {
  await page.evaluate(() => { AO.tables(AO.rooms[0]); }); await page.waitForTimeout(400); await page.evaluate(() => { const b = document.querySelector('#tbBot, .tables .card button'); b && b.click(); }); await page.waitForTimeout(2500);
  await L.playUntil(page, (g) => !!(g && g.phase === 'play' && g.cp === 0), 30000);
  await page.waitForFunction(() => Rig.instances().filter((i) => /^gardrop:/.test(i.char)).length >= 4, null, { timeout: 15000 }).catch(() => {});
}
async function enter(page, settings) {
  await L.fresh(page, URL0, settings || SET); await L.login(page); await page.waitForTimeout(500);
  if (await page.$('#cAdult')) { await page.check('#cAdult'); await page.click('#cGo'); await page.waitForTimeout(1500); } if (await page.$('#wPlay')) { await page.click('#wPlay'); await page.waitForTimeout(400); }
}
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); };
  const srv = S.start(PORT, { ADMIN_KEY: 'k74' }, '/tmp/qa_skinrig.srv.log'); await S.up(PORT, null, false);
  for (const V of [{ n: 'masaüstü', w: 1280, h: 720 }, { n: 'telefon', w: 844, h: 390, mobile: true }]) {
    const { browser, page, errors } = await L.launch(V);
    await enter(page); await toBotTable(page);
    // 1) botlar
    const bots = await page.evaluate(() => { const seat = (id) => { const h = document.querySelector('#' + id + ' .avw'); const i = Rig.instances().find((x) => h && h.contains(x.host)); return i ? { char: i.char.slice(0, 8), view: i.view, mirror: i.mirror, parts: Object.keys(i.bones).length } : null; }; return { right: seat('chRight'), top: seat('chTop'), left: seat('chLeft'), oldImgs: document.querySelectorAll('img[src*="assets/bot-"]').length, names: AO.state().names.slice(1) }; });
    ok(bots.right && bots.top && bots.left && /^gardrop:/.test(bots.right.char) && /^gardrop:/.test(bots.top.char) && /^gardrop:/.test(bots.left.char), V.n + ': üç bot da parçalı (gardırop rig) — sağ/üst/sol', JSON.stringify(bots));
    ok(bots.right.view === 'yan' && !bots.right.mirror && bots.top.view === 'on' && bots.left.view === 'yan' && bots.left.mirror, V.n + ': görünümler doğru (sağ yan, üst ön, sol yan aynalı — masaya dönük)', JSON.stringify(bots));
    ok(bots.oldImgs === 0, V.n + ': eski bot resmi (assets/bot-*) masada yok', bots.oldImgs);
    const looks = await page.evaluate(() => ['ali', 'ayse', 'mehmet'].map((b) => { const a = AO.botLook(b); return [a.name, a.gender, a.outfit, AO.canGardropRig(a)].join('/'); }));
    ok(looks.join(' ') === 'Ali/erkek/deri-ceket/true Ayşe/kadin/ust-gece-kimono/true Mehmet/erkek/ust-nane-atolye/true', V.n + ': bot görünümleri (Ali deri ceket, Ayşe gece kimono, Mehmet nane atölye) rig\'e uygun', looks.join(' '));
    if (V.n === 'masaüstü') {
      await page.evaluate(() => AO.profile(1)); await page.waitForTimeout(900);
      const prof = await page.evaluate(() => { const c = document.querySelector('#overlay .card'); const im = c && c.querySelector('img.av'); return { bot: !!(c && /Bot/.test(c.textContent)), src: im ? im.getAttribute('src').slice(0, 22) : null, old: c ? c.querySelectorAll('img[src*="assets/bot-"]').length : -1 }; });
      ok(prof.bot && prof.old === 0 && /^data:image/.test(prof.src || ''), 'profil kartı: bot gardırop görünümüyle (eski bust resmi yok), "Bot" notu var', JSON.stringify(prof));
      await page.evaluate(() => { const b = document.querySelector('#overlay .card button.primary, #overlay .card button'); b && b.click(); }); await page.waitForTimeout(300);
    }
    // 2) bakış
    await page.evaluate(() => { AO.peekAnim(2, 3, true); AO.peekAnim(1, 0, true); AO.peekAnim(0, 1, true); }); await page.waitForTimeout(1100);
    const pk = await page.evaluate(() => { const r = {}; [['top', 'chTop'], ['right', 'chRight'], ['meBack', 'chMe']].forEach(([k, id]) => { const w = document.querySelector('#' + id + ' .avw'); r[k] = getComputedStyle(w).animationName; }); const ins = (sel) => Rig.instances().find((i) => document.querySelector(sel).contains(i.host)); const top = ins('#chTop'), right = ins('#chRight'), me = ins('#meAv'); r.topBak = !!(top.clip && top.clip.def.bak); r.topHead = Math.round(top.pose.bas.rot); r.topBody = Math.round(top.pose.govde.rot); r.rightHeadDx = Math.round(right.pose.bas.dx); r.meBak = !!(me && me.clip && me.clip.def.bak); r.meHead = me ? Math.round(me.pose.bas.rot) : null; r.topFace = top.bones.bas.variant; r.rightFace = right.bones.bas.variant; r.meFace = me ? me.bones.bas.variant : null; return r; });
    ok(pk.top === 'none' && pk.right === 'none' && pk.meBack === 'none', V.n + ': bakışta bütün resim kaymıyor (koltuk ve arka görünüm .avw animasyonu yok)', JSON.stringify(pk));
    ok(pk.topBak && pk.topHead < -4 && pk.topBody < -2 && pk.rightHeadDx < -5 && pk.meBak && pk.meHead > 4, V.n + ': baş ve gövde hedefe döndü (üst → sol: sola; sağ → ben: öne; ben → sağ: sağa)', JSON.stringify(pk));
    ok(pk.topFace === 'kacamak-sol' && pk.rightFace === 'kacamak' && pk.meFace === 'kacamak-sag', V.n + ': üretim 10 — bakışta kaçamak yüz (ön: yöne göre sol/sağ, yan: tek)', JSON.stringify(pk)); // v10.17
    await page.waitForTimeout(2200);
    const hold = await page.evaluate(() => { const i = Rig.instances().find((x) => document.querySelector('#chTop').contains(x.host)); return { bak: !!(i.clip && i.clip.def.bak), head: Math.round(i.pose.bas.rot) }; });
    ok(hold.bak && hold.head < -4, V.n + ': bakış süresince poz tutuluyor (3 sn sonra hâlâ hedefe dönük)', JSON.stringify(hold));
    await page.evaluate(() => { AO.peekAnim(2, 3, false); AO.peekAnim(1, 0, false); AO.peekAnim(0, 1, false); }); await page.waitForTimeout(1300);
    const rel = await page.evaluate(() => Rig.instances().filter((i) => /^gardrop:/.test(i.char)).map((i) => (i.clip ? 'klip' : 'bos') + ':' + Math.round(Math.abs(i.pose.bas.rot) + Math.abs(i.pose.bas.dx) + Math.abs(i.pose.govde.rot))));
    ok(rel.every((x) => x === 'bos:0'), V.n + ': bakış bitince karakterler bekleme pozuna döndü', rel.join(' '));
    // 3) tokat: ben (0) sağ koltuğu (1) yakalarım; sol (3) üstü (2) yakalar
    await page.evaluate(() => { AO.slapAnim(0, 1); AO.slapAnim(3, 2); }); await page.waitForTimeout(600);
    const sl = await page.evaluate(() => { const ins = (sel) => Rig.instances().find((i) => document.querySelector(sel).contains(i.host)); const left = ins('#chLeft'), top = ins('#chTop'), right = ins('#chRight'), me = ins('#meAv'); const arm = (i) => Math.max.apply(null, Object.keys(i.pose).filter((k) => /onkol/.test(k)).map((k) => Math.abs(i.pose[k].rot || 0))); const hv = (i, re) => { const k = Object.keys(i.bones).find((n) => re.test(n)); return k ? i.bones[k].variant : null; }; return { leftArm: Math.round(arm(left)), meArm: Math.round(arm(me)), topHead: Math.round(top.pose.bas.rot), rightHead: Math.round(right.pose.bas.rot), topFace: top.bones.bas.variant, rightFace: right.bones.bas.variant, leftFace: left.bones.bas.variant, leftHand: hv(left, /^el-(sol|on)$/), meHand: hv(me, /^el-sag$/), anims: ['chLeft', 'chTop', 'chRight'].map((id) => getComputedStyle(document.querySelector('#' + id + ' .avw')).animationName).join(',') }; });
    ok(sl.leftArm > 20 && sl.meArm > 20, V.n + ': tokat atanın ön kolu savruluyor (sol koltuk ve kendi portren)', JSON.stringify(sl));
    ok(Math.abs(sl.topHead) > 2 || Math.abs(sl.rightHead) > 2, V.n + ': tokat yiyenin başı savruluyor', JSON.stringify(sl));
    ok(sl.anims === 'none,none,none', V.n + ': tokatta bütün resim kaymıyor', sl.anims);
    ok(sl.leftFace === 'kizgin' && sl.leftHand === 'tokat' && sl.meHand === 'tokat' && sl.topFace === 'sersem' && sl.rightFace === 'sersem', V.n + ': üretim 10 — tokatta kızgın yüz + tokat eli (yanda yakın el), yiyende sersem yüz', JSON.stringify(sl)); // v10.17
    await page.screenshot({ path: OUT + '/skinrig_tokat_' + (V.mobile ? 'tel' : 'masa') + '.png' });
    await page.waitForTimeout(1600);
    // 4) zafer + tos hedefi
    await page.evaluate(() => { AO.playActionFx('zafer', 3, null); AO.playActionFx('tos', 1, 2); }); await page.waitForTimeout(450);
    const zt = await page.evaluate(() => ['chLeft', 'chRight', 'chTop'].map((id) => getComputedStyle(document.querySelector('#' + id + ' .avw')).animationName));
    ok(zt.every((a) => !/zaferBounce|tosHit|shakeX/.test(a)), V.n + ': Zafer ve Tos (vuran ve hedef) rig\'de bütün resmi kaydırmıyor', zt.join(','));
    await page.waitForTimeout(2500);
    // 4b) üretim 10: İnce Ayar işaret parmağı (kendi portrem), yan koltukta Tersten El → el-on 'tut'
    await page.evaluate(() => { AO.playIntroAt(0, 'ince_ayar'); AO.playIntroAt(1, 'tersten_el'); }); await page.waitForTimeout(500);
    const iv = await page.evaluate(() => { const ins = (sel) => Rig.instances().find((i) => document.querySelector(sel).contains(i.host)); const me = ins('#meAv'), right = ins('#chRight'); return { meHand: me.bones['el-sag'].variant, rightHand: right.bones['el-on'] ? right.bones['el-on'].variant : null, rightSrcOk: right.bones['el-on'] ? /^blob:|el-on-tut/.test(right.bones['el-on'].img.src) : false }; }); // gardırop parçaları blob adresli
    ok(iv.meHand === 'isaret' && iv.rightHand === 'tut' && iv.rightSrcOk, V.n + ': üretim 10 — İnce Ayar işaret parmağı; yan koltukta Tersten El taş tutan el (el-on-tut)', JSON.stringify(iv));
    await page.waitForTimeout(2200);
    // 5) kendi giriş skinim: portre kırpımı genişler
    await page.evaluate(() => AO.playIntroAt(0, 'tersten_el')); await page.waitForTimeout(450);
    const z1 = await page.evaluate(() => { const i = Rig.instances().find((x) => document.querySelector('#meAv').contains(x.host)); return { on: document.querySelector('#meAv').classList.contains('actOn'), crop: i.crop, ifx: !!document.querySelector('.ifx') }; });
    await page.screenshot({ path: OUT + '/skinrig_giris_' + (V.mobile ? 'tel' : 'masa') + '.png' });
    await page.waitForTimeout(2600);
    const z2 = await page.evaluate(() => { const i = Rig.instances().find((x) => document.querySelector('#meAv').contains(x.host)); return { on: document.querySelector('#meAv').classList.contains('actOn'), crop: i.crop }; });
    ok(z1.on && JSON.stringify(z1.crop) === '[0,0,480,480]' && z1.ifx, V.n + ': kendi skininde portre üst gövdeye açıldı (eller görünür)', JSON.stringify(z1));
    ok(!z2.on && JSON.stringify(z2.crop) === '[96,0,288,288]', V.n + ': skin bitince portre baş-omuz kırpımına döndü', JSON.stringify(z2));
    ok(errors.length === 0, V.n + ': sayfa hatası yok', errors.slice(0, 3).join(' | '));
    await browser.close();
  }
  // 6) hareket azaltma
  { const { browser, page, errors } = await L.launch({ w: 1280, h: 720 });
    await enter(page, Object.assign({}, SET, { reduceMotion: true })); await toBotTable(page);
    await page.evaluate(() => AO.peekAnim(2, 3, true)); await page.waitForTimeout(700);
    const r = await page.evaluate(() => { const i = Rig.instances().find((x) => document.querySelector('#chTop').contains(x.host)); const w = document.querySelector('#chTop .avw'); const cs = getComputedStyle(w); return { anim: cs.animationName, tr: cs.transform, bak: !!(i && i.clip && i.clip.def.bak), sure: i && i.clip ? i.clip.sure : null }; });
    ok(r.anim === 'none' && (r.tr === 'none' || r.tr === 'matrix(1, 0, 0, 1, 0, 0)') && r.bak && r.sure <= 400, 'hareket azaltma: bakışta resim dönmüyor, kısa klip (≤400 ms) poz tutuyor', JSON.stringify(r));
    ok(errors.length === 0, 'hareket azaltma: sayfa hatası yok', errors.slice(0, 3).join(' | '));
    await browser.close(); }
  // 7) çevrim içi arkadaş odası + görünür botlar
  { const { browser, page, errors } = await L.launch({ w: 1280, h: 720 });
    await enter(page, Object.assign({}, SET, { mode: 1 }));
    await page.evaluate(() => AO.tables(AO.rooms[0])); await page.waitForTimeout(400); await page.click('#tbFriends'); await page.waitForSelector('#nCreate', { timeout: 8000 }); await page.click('#nCreate'); await page.waitForTimeout(1200);
    await page.click('#rStart'); await page.waitForTimeout(500); if (await page.$('#rFillYes')) await page.click('#rFillYes'); await page.waitForTimeout(1500);
    await page.waitForFunction(() => !!(AO.state() && AO.net.online), null, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => Rig.instances().filter((i) => /^gardrop:/.test(i.char)).length >= 4, null, { timeout: 20000 }).catch(() => {});
    const on = await page.evaluate(() => ({ seats: (AO.net.seats || []).map((s) => s ? (s.bot ? 'bot:' + (s.avatar && s.avatar.bot) : 'insan') : '-'), rigs: Rig.instances().map((i) => i.char.slice(0, 8) + '/' + i.view), old: document.querySelectorAll('img[src*="assets/bot-"]').length }));
    ok(on.seats.filter((s) => /^bot:/.test(s)).length === 3 && on.rigs.filter((r) => /^gardrop:/.test(r)).length >= 4 && on.old === 0, 'çevrim içi oda: 3 görünür bot da parçalı, eski bot resmi yok', JSON.stringify(on));
    ok(errors.length === 0, 'çevrim içi: sayfa hatası yok', errors.slice(0, 3).join(' | '));
    await browser.close(); }
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); await S.stop(srv); process.exit(0);
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
