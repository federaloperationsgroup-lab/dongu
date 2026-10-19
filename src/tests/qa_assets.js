// Varlık denetimi (dosya modu): katalogdaki her ürün iki cinsiyette 3 duruşta çizilir (charLayers), her tam karakterin portre/simge/rig dosyaları,
// giriş skinleri ve aksiyon skinleri oynatılır, 13 mekân teması ve kıraathane sprite'ları yüklenir; eksik dosya (ERR_FILE_NOT_FOUND / 404) = FAIL.
// Ayrıca sw.js ön bellek listesi, manifest ve mobil yapılandırma tutarlılığı.
const L = require('./qa_lib.js'); const fs = require('fs'); const path = require('path');
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 500) : '')); };
  const WEB = L.ROOT + '/web'; const exists = (rel) => fs.existsSync(path.join(WEB, rel.split('?')[0]));
  const { browser, page, errors, net } = await L.launch({ w: 1366, h: 768 });
  await L.fresh(page, L.TEST, Object.assign({ tutorialDone: true, welcomed: true, meldHinted: true, tipSkin: true, tipStore: true }, L.FAST)); await L.login(page); await page.waitForTimeout(500);
  if (await page.$('#wPlay')) { await page.click('#wPlay'); await page.waitForTimeout(400); }
  // 1) statik kaynak dizgileri (app/venue/rig/css içindeki assets/... yolları)
  const src = ['app.js', 'venue.js', 'rig.js', 'app.html'].map((f) => fs.readFileSync(L.ROOT + '/' + f, 'utf8')).join('\n');
  const stat = Array.from(new Set((src.match(/assets\/[A-Za-z0-9_\/.-]+\.(webp|png|ogg|mp3|json|woff2|svg)/g) || []))); const missStat = stat.filter((p) => !exists(p));
  ok(missStat.length === 0, 'kaynakta sabit yazılı ' + stat.length + ' varlık yolu diskte var', missStat.join(', '));
  // 2) katalog: her gardırop ürünü × 2 cinsiyet × 3 duruş
  const layersMissing = await page.evaluate(() => {
    const miss = new Set(); const cat = AO.CATALOG; const slots = {};
    cat.forEach((it) => { if (it.k) (slots[it.k] = slots[it.k] || []).push(it.val); });
    const base = { v: 2, name: 'T' }; const poses = ['on', 'yan', 'arka'];
    const check = (av) => poses.forEach((p) => { let Ls; try { Ls = AO.charLayers(av, p); } catch (e) { miss.add('charLayers hata ' + e.message + ' ' + JSON.stringify(av)); return; } (Ls || []).forEach((l) => { if (l && l.src) miss.add('CHK ' + l.src); if (l && l.erase) (Array.isArray(l.erase) ? l.erase : [l.erase]).forEach((e) => miss.add('CHK ' + (e.src || e))); }); });
    ['erkek', 'kadin'].forEach((g) => { check(Object.assign({}, base, { gender: g })); Object.keys(slots).forEach((k) => slots[k].forEach((v) => { const av = Object.assign({}, base, { gender: g }); av[k] = v; check(av); })); });
    return Array.from(miss);
  });
  const chk = layersMissing.filter((x) => x.startsWith('CHK ')).map((x) => x.slice(4)); const errsL = layersMissing.filter((x) => !x.startsWith('CHK '));
  const missL = Array.from(new Set(chk)).filter((p) => !exists(p));
  ok(errsL.length === 0 && missL.length === 0, 'katalog gardırop katmanları: ' + new Set(chk).size + ' dosya, hepsi diskte', errsL.concat(missL).slice(0, 20).join(', '));
  // 3) tam karakterler: portre, simge, rig.json + rig görünümleri
  const chars = await page.evaluate(() => { const out = []; AO.CATALOG.filter((i) => i.cat === 'char' || i.k === 'full').forEach((i) => out.push(i.val)); return Array.from(new Set(out)); });
  const charFiles = await page.evaluate((cs) => cs.map((c) => { const e = AO.effectiveAvatar(AO.normAvatar({ v: 2, name: 'T', full: c })); const Ls = []; ['on', 'yan', 'arka'].forEach((p) => (AO.charLayers(e, p) || []).forEach((l) => l && l.src && Ls.push(l.src))); return { c, layers: Ls, bust: 'assets/ch/' + (c) + '-bust.webp' }; }), chars);
  let missC = []; for (const cf of charFiles) { for (const f of cf.layers) if (!exists(f)) missC.push(cf.c + ':' + f); }
  const rigs = fs.existsSync(WEB + '/assets/rig') ? fs.readdirSync(WEB + '/assets/rig') : [];
  for (const r of rigs) { const rj = path.join(WEB, 'assets/rig', r, 'rig.json'); if (!fs.existsSync(rj)) { missC.push('rig.json yok: ' + r); continue; } const j = JSON.parse(fs.readFileSync(rj, 'utf8')); const files = new Set(); JSON.stringify(j).replace(/"([A-Za-z0-9_\-\/]+\.(webp|png))"/g, (m, f) => { files.add(f); return m; }); for (const f of files) if (!fs.existsSync(path.join(WEB, 'assets/rig', r, f)) && !fs.existsSync(path.join(WEB, f))) missC.push('rig ' + r + ': ' + f); }
  ok(missC.length === 0, 'tam karakterler (' + chars.length + ') ve rig klasörleri (' + rigs.join(', ') + ') dosyaları tam', missC.slice(0, 15).join(', '));
  // 4) çalışma zamanı: mağazada her kategori + her ürün "Dene" (iki cinsiyet), karakter oluşturucu, mekân temaları — ağ hatası izleme
  const netFail = () => net.filter((x) => /ERR_FILE_NOT_FOUND|ERR_FAILED|^404/.test(x) && !/favicon|sw\.js|manifest|chrome-extension/.test(x));
  const cats = await page.evaluate(() => { AO.showStore(); return Array.from(document.querySelectorAll('#sTabs button')).length; });
  let tried = 0;
  for (const g of ['erkek', 'kadin']) {
    await page.evaluate((g) => { const a = JSON.parse(localStorage.getItem('ao.avatar') || '{"v":2,"name":"T"}'); a.gender = g; localStorage.setItem('ao.avatar', JSON.stringify(a)); AO.acc.avatar = a; }, g);
    for (let i = 0; i < cats; i++) {
      await page.evaluate((i) => { AO.showStore(); document.querySelectorAll('#sTabs button')[i].click(); }, i); await page.waitForTimeout(250);
      const n = await page.evaluate(() => document.querySelectorAll('#sGrid .item').length);
      for (let k = 0; k < n; k++) { const did = await page.evaluate((k) => { const it = document.querySelectorAll('#sGrid .item')[k]; const b = it && it.querySelector('button'); if (b) { b.click(); return true; } return false; }, k); if (did) { tried++; await page.waitForTimeout(120); } }
    }
  }
  await page.waitForTimeout(1500);
  ok(netFail().length === 0, 'mağaza: ' + tried + ' ürün denemesi, yüklenemeyen dosya yok', netFail().slice(0, 10).join(' | '));
  await page.evaluate(() => { try { AO.lobby(); } catch (e) {} }); await page.waitForTimeout(300);
  // giriş skinleri (intro) ve aksiyon skinleri bot masasında
  await page.evaluate(() => { AO.tables(AO.rooms[0]); }); await page.waitForTimeout(400); await page.evaluate(() => { const b = document.querySelector('#tbBot, .tables .card button'); b && b.click(); }); await page.waitForTimeout(1500);
  await L.playUntil(page, (g) => !!(g && g.phase === 'play' && g.cp === 0), 30000);
  const skinRun = await page.evaluate(async () => { const out = { intro: 0, act: 0, err: [] }; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const intro = AO.CATALOG.filter((i) => i.cat === 'intro').map((i) => i.val); for (const s of intro) { try { AO.playIntroAt(0, s); out.intro++; } catch (e) { out.err.push('intro ' + s + ': ' + e.message); } await sleep(150); }
    const acts = AO.CATALOG.filter((i) => i.cat === 'action').map((i) => i.val); for (const s of acts) { try { AO.playActionFx(s, 1, 0); out.act++; } catch (e) { out.err.push('act ' + s + ': ' + e.message); } await sleep(150); }
    return out; });
  await page.waitForTimeout(2500);
  ok(skinRun.err.length === 0 && skinRun.intro >= 4 && skinRun.act >= 5 && netFail().length === 0, 'giriş skinleri (' + skinRun.intro + ') ve aksiyon skinleri (' + skinRun.act + ') oynatıldı, dosya hatası yok', skinRun.err.concat(netFail()).slice(0, 10).join(' | '));
  // mekân temaları
  const themes = await page.evaluate(() => Object.keys(AO.themes || {}));
  for (const th of themes) { await page.evaluate((t) => { try { AO.applyTheme(t); } catch (e) {} }, th); await page.waitForTimeout(200); }
  await page.waitForTimeout(1500); ok(themes.length >= 13 && netFail().length === 0, themes.length + ' mekân teması uygulandı, dosya hatası yok', netFail().slice(0, 10).join(' | '));
  // kıraathane sprite listesi (venue.js K + '...')
  const vsrc = fs.readFileSync(L.ROOT + '/venue.js', 'utf8'); const vk = Array.from(new Set((vsrc.match(/K \+ '([^']+\.(webp|png))'/g) || []).map((m) => 'assets/k/' + m.slice(5, -1)))); const missV = vk.filter((p) => !exists(p));
  ok(vk.length >= 20 && missV.length === 0, 'kıraathane sprite dosyaları (' + vk.length + ') tam', missV.join(', '));
  // 5) sw.js / manifest / mobil
  const sw = fs.readFileSync(WEB + '/sw.js', 'utf8'); const swv = (sw.match(/dongu-v?([0-9.]+)/) || [])[1]; const appv = (fs.readFileSync(L.ROOT + '/app.js', 'utf8').match(/VERSION = '([0-9.]+)'/) || [])[1];
  ok(appv === '10.12' && (!swv || swv === appv), 'sürüm: app ' + appv + ', sw ' + (swv || '(sürüm dizgisi yok)'));
  const pre = Array.from(new Set((sw.match(/'([^']+\.(webp|png|js|html|json|woff2|ogg|webmanifest))'/g) || []).map((x) => x.slice(1, -1)))); const missSw = pre.filter((p) => !p.startsWith('http') && !exists(p.replace(/^\.?\//, '')) && !exists(p.replace(/^\//, '')));
  ok(missSw.length === 0, 'sw.js ön bellek listesi (' + pre.length + ') diskte var', missSw.join(', '));
  const man = JSON.parse(fs.readFileSync(WEB + '/manifest.webmanifest', 'utf8')); ok(man.name && man.icons && man.icons.every((i) => exists(i.src.replace(/^\//, ''))), 'manifest: ' + man.name + ', simgeler var');
  const mc = JSON.parse(fs.readFileSync(L.ROOT + '/mobile/capacitor.config.json', 'utf8')); const ac = JSON.parse(fs.readFileSync(L.ROOT + '/mobile/app-config.json', 'utf8'));
  ok(mc.appId && /dongu/i.test(mc.appId) && 'rcAndroid' in ac && 'rcIos' in ac && !ac.rcAndroid.startsWith('sk_') && !ac.rcIos.startsWith('sk_'), 'mobil yapılandırma: ' + mc.appId + ' (RevenueCat alanları var, gizli anahtar yok)', JSON.stringify(ac).slice(0, 120));
  ok(errors.length === 0, 'sayfa hatası yok', errors.slice(0, 3).join(' | '));
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); await browser.close(); process.exit(0);
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
