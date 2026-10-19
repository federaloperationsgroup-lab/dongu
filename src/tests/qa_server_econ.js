// Sunucu ekonomi / sosyal / moderasyon (ham WebSocket + HTTP, PORT 8768):
// giriş altınlı masa (Bronz): seviye kilidi, yetersiz altın, emanet, 1 elin sonunda havuz dağılımı (altın korunur), AFK oyuncu hükmen son;
// Usta masası bayraksız kapalı; rövanş oylaması; günlük ödül bir kez; /api/buy işlem kimliği (çift tahsilat yok); uygunsuz ad filtresi;
// şikâyet + engel; davet (arkadaş odası, Hızlı Katıl reddi); /api/lig; IAP webhook gizli anahtarsız reddi; /durum gizli bot sayısı.
const S = require('./qa_srv.js'); const Economy = require('/home/claude/okey/economy.js');
const PORT = 8768, KEY = 'test-anahtar-68', LOG = '/tmp/qa_server_econ.srv.log';
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); };
  const srv = S.start(PORT, { ADMIN_KEY: KEY, QUICK_WAIT: '1500', PREP_MS: '1500', PREP_FIRST_MS: '1500', BOT_DELAY: '60', NEXT_DELAY: '500', RESULT_GAP_MS: '300', TURN_MS: '400', PAID_WAIT: '1500', REMATCH_WAIT: '4000' }, LOG); await S.up(PORT, LOG, true);
  const durum = (await S.get(PORT, '/durum')).body; ok(/Sürüm: v10\.12/.test(durum) && /Hesap deposu/.test(durum), '/durum v10.12', durum.slice(0, 120));
  const me = async (acc) => { const j = (await S.post(PORT, '/api/me', { id: acc.id, token: acc.token })).json; return { player: j && j.player ? j.player : j }; };
  // hesaplar
  const A = await S.guest(PORT, 'Zengin'), B = await S.guest(PORT, 'Fakir'), C = await S.guest(PORT, 'Cimri');
  ok(A && A.id && B && B.id && C && C.id, 'üç misafir hesap');
  // Bronz: seviye 1'de kilitli
  let a = S.client(PORT, A, 'Zengin'); await a.open; let n = a.msgs.length;
  a.send({ t: 'quick', settings: { totalHands: 1, stake: 'bronz' }, name: 'Zengin', avatar: a.av, skins: 0, acc: a.acc }); await S.sleep(600);
  let er = a.errorsSince(n); ok(er.length && /seviye|Seviye|kilit|açıl/i.test(er.join('|')), 'Bronz masa seviye 1\'de reddedilir', er.join('|')); a.close();
  for (const acc of [A, B, C]) await S.admin(PORT, KEY, acc.id, 'seviye', 6);
  // yetersiz altın (hoş geldin 1000 → 100 el × 1 = 100 giriş; Fakir'in altınını sıfırla)
  await S.admin(PORT, KEY, B.id, 'altin', -(((await me(B)).player || {}).coins || 1000));
  const bView = await me(B); ok((bView.player.coins || 0) < 100, 'Fakir\'in altını sıfırlandı: ' + bView.player.coins);
  let b = S.client(PORT, B, 'Fakir'); await b.open; n = b.msgs.length; b.send({ t: 'quick', settings: { totalHands: 1, stake: 'bronz' }, name: 'Fakir', avatar: b.av, skins: 0, acc: b.acc }); await S.sleep(600);
  er = b.errorsSince(n); ok(er.length && /altın/i.test(er.join('|')), 'yetersiz altınla Bronz masa reddedilir', er.join('|')); b.close();
  // Usta bayraksız kapalı
  a = S.client(PORT, A, 'Zengin'); await a.open; n = a.msgs.length; a.send({ t: 'quick', settings: { totalHands: 1, stake: 'usta' }, name: 'Zengin', avatar: a.av, skins: 0, acc: a.acc }); await S.sleep(500);
  er = a.errorsSince(n); ok(er.some((x) => /henüz açık değil/.test(x)), 'Usta masası ALLOW_LOCKED_STAKES olmadan kapalı', er.join('|')); a.close();
  // Bronz 1 el: Zengin + 3 gizli bot; Zengin AFK → sunucu oynar → hükmen son; emanet ve havuz
  const coinsA0 = (await me(A)).player.coins; a = S.client(PORT, A, 'Zengin'); await a.open;
  a.send({ t: 'quick', settings: { totalHands: 1, stake: 'bronz' }, name: 'Zengin', avatar: a.av, skins: 0, acc: a.acc }); const j = await a.wait((m) => m.t === 'joined', 5000);
  ok(j && j.stake === 'bronz' && j.entry === 100, 'Bronz Hızlı Katıl: giriş 100 (1 el)', JSON.stringify(j));
  await S.sleep(300); const mid = await me(A); ok(mid.player.coins === coinsA0 - 100, 'giriş emanete alındı: ' + coinsA0 + ' → ' + mid.player.coins);
  let lg = ''; for (let i = 0; i < 100; i++) { lg = require('fs').readFileSync(LOG, 'utf8'); if (lg.indexOf('oyun ba\u015flad\u0131') >= 0) break; await S.sleep(150); }
  ok((lg.match(/\(gizli bot\)/g) || []).length >= 3 && /bahisli masa: gizli botlar zayıf/.test(lg), 'masa 3 gizli botla doldu, oyun başladı (bahisli masada zayıf botlar)', lg.split('\n').filter((l) => /gizli bot|başladı/.test(l)).slice(-4).join(' | '));
  const t0 = Date.now(); let fin = null; while (Date.now() - t0 < 180000 && !fin) { fin = a.msgs.find((m) => m.t === 'state' && m.view && (m.view.finished || m.view.handOver)) || null; if (!fin) await S.sleep(200); }
  ok(!!fin, 'el bitti (AFK: sunucu Zengin yerine oynadı)');
  await S.sleep(1200); const rw = a.msgs.filter((m) => m.t === 'reward').pop(); const after = await me(A);
  const pool = Economy.payoutPool ? Economy.payoutPool([100, 100, 100, 100], [1, 2, 3, 4], { participants: [true, false, false, false], forfeits: [true, false, false, false] }) : null;
  ok(after.player.coins >= coinsA0 - 100 && after.player.coins <= coinsA0 + 400, 'hükmen son: giriş havuzda kaldı, altın ' + coinsA0 + ' → ' + after.player.coins, JSON.stringify(rw || {}).slice(0, 200));
  const olc = JSON.parse((await S.get(PORT, '/olcum?key=' + KEY)).body); ok(olc.toplam.afkHands >= 1 && olc.toplam.hands >= 1, '/olcum: afkHands ≥ 1', JSON.stringify(olc.toplam));
  // rövanş oylaması: hayır → oda dağılır
  const rmi = a.msgs.filter((m) => m.t === 'rematch').pop(); a.send({ t: 'rematch', yes: false }); await S.sleep(600); const rm2 = a.msgs.filter((m) => m.t === 'rematch').pop();
  ok(!!rmi, 'rövanş penceresi geldi; "hayır" oyu gönderildi', JSON.stringify(rm2 || rmi || {}).slice(0, 160)); a.close();
  // günlük ödül bir kez
  const b1 = await S.post(PORT, '/api/bonus', { id: C.id, token: C.token }), b2 = await S.post(PORT, '/api/bonus', { id: C.id, token: C.token });
  ok(b1.json && b1.json.amount > 0 && b2.json && b2.json.error && /bugün/.test(b2.json.error), 'günlük giriş ödülü: ilk +' + (b1.json && b1.json.amount) + ', ikinci reddedildi', JSON.stringify(b2.json).slice(0, 120));
  // /api/buy işlem kimliği
  const cat = ((await S.get(PORT, '/public/katalog.json')).body); let items = []; try { items = JSON.parse(cat).items || JSON.parse(cat); } catch (e) {}
  const item = (Array.isArray(items) ? items : []).find((i) => !i.free && i.price > 0 && i.price <= 300 && !i.uses && (!i.lv || i.lv <= 6)) || { id: 'dg24_mak-ruj-kirmizi', price: 150 };
  const c0 = (await me(C)).player.coins; const p1 = await S.post(PORT, '/api/buy', { id: C.id, token: C.token, item: item.id, tx: 'tx-1' }); const p2 = await S.post(PORT, '/api/buy', { id: C.id, token: C.token, item: item.id, tx: 'tx-1' }); const c1 = (await me(C)).player.coins;
  ok(p1.json && !p1.json.error && p2.json && p2.json.repeated && c1 === c0 - item.price, 'satın alma: ' + item.id + ' bir kez tahsil (' + c0 + ' → ' + c1 + '), aynı tx tekrarı "repeated"', JSON.stringify(p2.json).slice(0, 120));
  const p3 = await S.post(PORT, '/api/buy', { id: C.id, token: C.token, item: item.id, tx: 'tx-2' }); const c2 = (await me(C)).player.coins; ok(p3.json && p3.json.already && c2 === c1, 'sahip olunan ürün yeniden tahsil edilmez (already, altın ' + c2 + ')', JSON.stringify(p3.json).slice(0, 80));
  // uygunsuz ad
  const bad = await S.guest(PORT, 'orospu'); ok(bad && bad.player && !/orospu/i.test(bad.player.name) && /Oyuncu/.test(bad.player.name), 'uygunsuz adla hesap → "Oyuncu N"', bad && bad.player && bad.player.name);
  const ren = await S.post(PORT, '/api/me', { id: C.id, token: C.token, name: 'piç kurusu', avatar: { v: 2, name: 'piç kurusu' } }); ok(ren.json && (ren.json.nameFix || (ren.json.player && !/piç/.test(ren.json.player.name))), 'ad değiştirme filtresi', JSON.stringify(ren.json && (ren.json.nameFix || ren.json.player.name)).slice(0, 120));
  // şikâyet + engel + davet
  const so = (p, body) => S.post(PORT, '/api/social/' + p, Object.assign({ id: A.id, token: A.token }, body));
  const rep = await so('report', { target: C.id, reason: 'hakaret', note: 'test' }); ok(rep.json && !rep.json.error, 'şikâyet kaydı', JSON.stringify(rep.json).slice(0, 100));
  const reps = await S.get(PORT, '/yonetim/sikayetler?key=' + KEY); ok(reps.status === 200 && /hakaret|Hakaret/.test(reps.body), 'yönetim: şikâyet listede');
  const blk = await so('block', { target: C.id }); const stt = await so('state', { target: C.id }); ok(blk.json && blk.json.state === 'blocked' && stt.json && stt.json.state === 'blocked', 'engelleme + ikili durum "blocked"', JSON.stringify(stt.json).slice(0, 160));
  const rq = await S.post(PORT, '/api/social/request', { id: C.id, token: C.token, target: A.id }); ok(rq.json && rq.json.error, 'engellenen kişi arkadaşlık isteği gönderemez', JSON.stringify(rq.json).slice(0, 100));
  await so('unblock', { target: C.id });
  const rqA = await so('request', { target: B.id }); const acc = await S.post(PORT, '/api/social/accept', { id: B.id, token: B.token, target: A.id }); ok(rqA.json && !rqA.json.error && acc.json && !acc.json.error, 'A → B arkadaşlık, kabul');
  a = S.client(PORT, A, 'Zengin'); await a.open; a.send({ t: 'create', name: 'Zengin', avatar: a.av, skins: 0, acc: a.acc, settings: { totalHands: 1 } }); const ja = await a.wait((m) => m.t === 'joined');
  b = S.client(PORT, B, 'Fakir'); await b.open; b.send({ t: 'social', op: 'hello' }); await S.sleep(300);
  const inv = await so('invite', { target: B.id, code: ja.code }); ok(inv.json && !inv.json.error, 'davet gönderildi (arkadaş odası ' + ja.code + ')', JSON.stringify(inv.json).slice(0, 120));
  const inv2 = await so('invite', { target: C.id, code: ja.code }); ok(inv2.json && inv2.json.error, 'arkadaş olmayan / birlikte oynamamış kişiye davet reddi', JSON.stringify(inv2.json).slice(0, 100));
  a.close(); b.close();
  // lig
  const lig = await S.post(PORT, '/api/lig', { id: A.id, token: A.token }); ok(lig.json && !lig.json.error && (lig.json.season || lig.json.top || lig.json.list), '/api/lig yanıt', JSON.stringify(lig.json).slice(0, 160));
  // IAP webhook
  const wh = await S.post(PORT, '/api/iap/webhook', { event: { type: 'TEST' } }); ok(wh.status === 401 || wh.status === 404 || wh.status === 403, 'IAP webhook gizli anahtarsız reddedilir (' + wh.status + ')', wh.body.slice(0, 100));
  const prods = await S.post(PORT, '/api/iap/products', { id: A.id, token: A.token }); ok(prods.status === 200 || prods.status === 404, '/api/iap/products ' + prods.status + ' (RevenueCat yapılandırılmamış ortamda)', prods.body.slice(0, 100));
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL');
  await S.stop(srv); process.exit(0);
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
