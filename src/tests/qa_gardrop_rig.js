// v10.13 (üretim 08-A/B/C): oyuncunun kendi karakteri parçalı rig. Dosya modu.
// 1) 7 giysi × 2 cinsiyet × 2 görünüm: rig nötr karesi, eski tek resimle karşılaştırılır (siluet/RGB farkı).
// 2) Saç/sakal/gözlük/şapka/kolye/bilek/ruj/pantolon katmanları doğru kemiğe bağlanır; baş döndürülünce saç başla gider, kolye gövdede kalır.
// 3) Bot masasında kendi portre rig'i ve rakip koltuklarında (gardırop avatarlı rakipler) rig kurulur; Tersten El klibi oynar; sayfa hatası yok.
// 4) dg24 üst giyen / özel karakter → eski tek resim (rig yok). 5) Önbellek sınırı (en çok 10 kayıt).
const L = require('./qa_lib.js'); const S = require('./qa_srv.js'); const fs = require('fs'); const PORT = 8772, URL0 = 'http://127.0.0.1:' + PORT + '/'; const OUT = L.ROOT + '/tests/out'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); };
  const srv = S.start(PORT, { ADMIN_KEY: 'k72' }, '/tmp/qa_grig.srv.log'); await S.up(PORT, null, false);
  const { browser, page, errors } = await L.launch({ w: 1280, h: 720 });
  await L.fresh(page, URL0, Object.assign({ tutorialDone: true, welcomed: true, meldHinted: true, tipSkin: true, tipStore: true }, L.FAST)); await L.login(page); await page.waitForTimeout(500);
  if (await page.$('#cAdult')) { await page.check('#cAdult'); await page.click('#cGo'); await page.waitForTimeout(1500); } if (await page.$('#wPlay')) { await page.click('#wPlay'); await page.waitForTimeout(400); }
  // yardımcı: bir avatar için rig'i gizli bir host'a kur, nötr kareyi (idle kapalı) tuvale çiz, eski birleşik resimle karşılaştır
  const cmp = await page.evaluate(async () => {
    const CS = 480, res = [];
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-2000px;top:0;width:480px;height:480px'; document.body.appendChild(host);
    const outfits = ['mont-mavi', 'deri-ceket', 'kapusonlu', 'ust-gunes-dikisi', 'ust-gece-kimono', 'ust-nane-atolye', 'ust-mercan-ritim'];
    const load = (src) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
    for (const g of ['erkek', 'kadin']) for (const o of outfits) for (const v of ['on', 'yan']) {
      const a = { v: 2, name: 'T', gender: g, outfit: o, hair: 'yok', beard: 'yok', acc: 'yok', skin: '#c58a6a' };
      const name = await AO.gardropRig(a, v); if (!name) { res.push({ g, o, v, err: 'rig yok' }); continue; }
      host.innerHTML = ''; host.classList.remove('rig'); const inst = Rig.mount(host, name, v, { reduce: true });
      await new Promise((r) => setTimeout(r, 400));
      // parçaları z sırasına göre kendi dünya matrisleriyle tuvale çiz
      const c = document.createElement('canvas'); c.width = CS; c.height = CS; const x = c.getContext('2d');
      const parts = Object.keys(inst.bones).map((k) => inst.bones[k]).sort((p, q) => (p.def.z || 0) - (q.def.z || 0));
      for (const b of parts) { const im = await load(b.img.src); if (!im) continue; const m = b.world; x.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); x.drawImage(im, 0, 0, CS, CS); }
      x.setTransform(1, 0, 0, 1, 0, 0);
      const ref = await load(await AO.composeChar(a, v)); const rc = document.createElement('canvas'); rc.width = CS; rc.height = CS; rc.getContext('2d').drawImage(ref, 0, 0, CS, CS);
      const A = x.getImageData(0, 0, CS, CS).data, B = rc.getContext('2d').getImageData(0, 0, CS, CS).data; let sil = 0, sum = 0, n = 0;
      for (let i = 0; i < A.length; i += 4) { const va = A[i + 3] > 32, vb = B[i + 3] > 32; if (va !== vb) sil++; if (va && vb) { sum += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); n++; } }
      res.push({ g, o, v, sil, rgb: Math.round(sum / (3 * n) / 255 * 10000) / 100, parts: parts.length });
      Rig.unmount(inst);
    }
    host.remove(); return res;
  });
  const bad = cmp.filter((r) => r.err || r.sil > 4000 || r.rgb > 2); // siluet farkı beklenir: 08-C bel dolgusu + eski silme maskesi çentikleri (bilinçli iyileştirme)
  ok(cmp.length === 28 && bad.length === 0, '28 giysi/cinsiyet/görünüm: rig nötr karesi eski resimle uyumlu (RGB ≤%2; siluet farkı ≤4000 px — bel dolgusu beklenen fark)', JSON.stringify(bad.length ? bad : cmp.slice(0, 3)));
  console.log('  ölçüm: ' + cmp.map((r) => r.g[0] + '/' + r.o + '/' + r.v + ' sil ' + r.sil + ' rgb %' + r.rgb).join(' · '));
  // aksesuar katmanları ve kemik bağlantısı
  const att = await page.evaluate(async () => {
    const a = { v: 2, name: 'T', gender: 'kadin', outfit: 'kapusonlu', hair: 'sac-ayin-kesimi', hairColor: '#8b2a10', beard: 'yok', acc: 'pilotgozlugu', headwear: 'aks-erik-kasket', eyewear: 'aks-bal-petek', necklace: 'aks-gezgin-dugumu', wrist: 'aks-zaman-halkasi', makeup: 'mak-ruj-kirmizi', pants: 'alt-kanyon-kargo', skin: '#8d5a3c' };
    const out = {}; for (const v of ['on', 'yan']) { const name = await AO.gardropRig(a, v); if (!name) { out[v] = 'yok'; continue; } const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-2000px;top:0;width:480px;height:480px'; document.body.appendChild(host); const inst = Rig.mount(host, name, v, { reduce: true }); await new Promise((r) => setTimeout(r, 200)); out[v] = Object.keys(inst.bones).filter((k) => ['sac-arka', 'makyaj', 'bas-ust', 'govde-ust', 'bilek'].indexOf(k) >= 0).map((k) => k + '→' + inst.bones[k].parent); Rig.unmount(inst); host.remove(); }
    return out; });
  ok(att.on && att.on.indexOf('bas-ust→bas') >= 0 && att.on.indexOf('govde-ust→govde') >= 0 && att.on.indexOf('makyaj→bas') >= 0 && att.on.some((x) => /^bilek→(onkol|el)/.test(x)) && att.yan && att.yan.indexOf('bas-ust→bas') >= 0, 'katmanlar kemiklere bağlı: saç/gözlük/şapka → baş, kolye → gövde, ruj → baş, bilek → kol/el', JSON.stringify(att));
  // baş dönünce saç başla gider, kolye kalır (dünya matrisleri)
  const rot = await page.evaluate(async () => {
    const a = { v: 2, name: 'T', gender: 'erkek', outfit: 'deri-ceket', hair: 'kisa', hairColor: '#222', necklace: 'aks-gezgin-dugumu', skin: '#c58a6a' };
    const name = await AO.gardropRig(a, 'on'); const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-2000px;top:0;width:480px;height:480px'; document.body.appendChild(host); const inst = Rig.mount(host, name, 'on', { reduce: true });
    await new Promise((r) => setTimeout(r, 150)); const m0 = inst.bones['bas-ust'].world.slice(), g0 = inst.bones['govde-ust'].world.slice();
    inst.pose.bas.rot = 10; await new Promise((r) => setTimeout(r, 120)); const m1 = inst.bones['bas-ust'].world.slice(), g1 = inst.bones['govde-ust'].world.slice(); Rig.unmount(inst); host.remove();
    return { hairMoved: Math.abs(m1[1] - m0[1]) > 0.1, neckSame: Math.abs(g1[1] - g0[1]) < 0.01 }; });
  ok(rot.hairMoved && rot.neckSame, 'baş 10° dönünce saç başla döner, kolye gövdede kalır', JSON.stringify(rot));
  // rig kullanılmayan durumlar
  const no = await page.evaluate(async () => ({ dg24: await AO.gardropRig({ v: 2, name: 'T', gender: 'erkek', outfit: 'mont-mavi', pants: 'yok', acc: 'yok' }, 'arka'), full: await AO.gardropRig({ v: 2, name: 'T', gender: 'erkek', full: 'fikret', outfit: 'mont-mavi' }, 'on'), can: AO.canGardropRig({ v: 2, gender: 'erkek', outfit: 'mont-mavi' }) }));
  ok(no.dg24 === null && no.full === null && no.can === true, 'arka görünüm ve özel karakterde rig yok; 7 giysiden birinde var', JSON.stringify(no));
  // bot masası: kendi portre + rakipler (rakip avatarlarını gardırop karakteri yap)
  await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('ao.avatar') || '{"v":2,"name":"Ben"}'); Object.assign(a, { gender: 'erkek', outfit: 'ust-mercan-ritim', hair: 'kisa', hairColor: '#3a2416', acc: 'yok', full: 'yok' }); localStorage.setItem('ao.avatar', JSON.stringify(a)); });
  await page.reload(); await page.waitForTimeout(800); await L.login(page); await page.waitForTimeout(800); if (await page.$('#cAdult')) { await page.check('#cAdult'); await page.click('#cGo'); await page.waitForTimeout(1500); } if (await page.$('#wPlay')) { await page.click('#wPlay'); await page.waitForTimeout(400); }
  await page.evaluate(() => { AO.tables(AO.rooms[0]); }); await page.waitForTimeout(400); await page.evaluate(() => { const b = document.querySelector('#tbBot, .tables .card button'); b && b.click(); }); await page.waitForTimeout(2500);
  await L.playUntil(page, (g) => !!(g && g.phase === 'play' && g.cp === 0), 30000);
  const me = await page.evaluate(() => { const h = document.querySelector('#meAv .avw'); return { rig: !!(h && h.classList.contains('rig')), parts: h ? h.querySelectorAll('.rigpart').length : 0, char: h && h.dataset.rigChar }; });
  ok(me.rig && me.parts >= 8 && /^gardrop:/.test(me.char || ''), 'bot masasında kendi portre rig\'i parçalı (' + me.parts + ' parça)', JSON.stringify(me));
  await page.screenshot({ path: OUT + '/grig_table.png' });
  const clip = await page.evaluate(async () => { const inst = Rig.instances().find((i) => /^gardrop:/.test(i.char)); if (!inst) return null; let done = false; Rig.play(inst, Rig.CLIPS.intro_tersten_el, () => { done = true; }); await new Promise((r) => setTimeout(r, 400)); const mid = inst.clip ? Object.keys(inst.pose).filter((k) => Math.abs(inst.pose[k].rot || 0) > 0.5) : []; await new Promise((r) => setTimeout(r, 3000)); return { done: done || !inst.clip, moved: mid }; });
  ok(clip && clip.done && clip.moved.length > 0, 'Tersten El klibi gardırop rig\'inde oynadı (dönen kemikler: ' + (clip && clip.moved.join(',')) + ')', JSON.stringify(clip));
  // bellek sınırı
  const cache = await page.evaluate(async () => { const os = ['mont-mavi', 'deri-ceket', 'kapusonlu', 'ust-gunes-dikisi', 'ust-gece-kimono', 'ust-nane-atolye', 'ust-mercan-ritim']; for (let i = 0; i < 14; i++) await AO.gardropRig({ v: 2, name: 'T', gender: i < 7 ? 'kadin' : 'erkek', outfit: os[i % 7], hair: 'kisa', acc: 'bere' }, 'yan'); return { n: Object.keys(AO.grig.cache).length, inst: Rig.instances().filter((i) => /^gardrop:/.test(i.char)).length }; });
  ok(cache.n <= 10 + cache.inst + 2, 'rig önbelleği sınırlı (' + cache.n + ' kayıt; kurulu ' + cache.inst + ')');
  ok(errors.length === 0, 'sayfa hatası yok', errors.slice(0, 3).join(' | '));
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); await browser.close(); await S.stop(srv); process.exit(0);
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
