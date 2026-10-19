// Çevrim içi kurallar (gerçek sunucu, ham WebSocket istemcileri): hesap, Hızlı Katıl + gizli botlar (lig maçı), arkadaş odası + bot doldurma,
// Çaktırmadan Bak: hak sırası, aynı rakibe elde bir bakış, 0,6 sn gecikme + tokat, skinler kapalı (P3), yeni oyuncu koruması (P5), tokat ödülü (P6),
// Yoklama / Tos hedef denetimi, /olcum oyuncu dağılımı, el bitince kayıt. PORT 8776.
const S = require('./qa_srv.js'); const PORT = 8776, KEY = 'test-anahtar-76', LOG = '/tmp/qa_online_rules.srv.log';
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); };
  const srv = S.start(PORT, { ADMIN_KEY: KEY, QUICK_WAIT: '3000', PREP_MS: '40000', PREP_FIRST_MS: '40000', BOT_DELAY: '100', TURN_MS: '20000' }, LOG); await S.up(PORT, LOG, true);
  // hesaplar
  const A = await S.guest(PORT, 'Bakan'), B = await S.guest(PORT, 'Hedef'), C = await S.guest(PORT, 'Yeni');
  const pA = (A && A.player) || A; ok(A && A.id && A.token && pA.freeSkins && pA.freeSkins.bak === 1, 'misafir hesabı: kimlik + 1 ücretsiz Çaktırmadan Bak', JSON.stringify(A && { id: A.id, keys: Object.keys(A), free: pA.freeSkins }));
  for (const id of [A.id, B.id]) await S.admin(PORT, KEY, id, 'seviye', 20);
  const gift = await S.admin(PORT, KEY, A.id, 'hediye', 'c_palyaco'); ok(gift.status === 200 || gift.status === 302 || gift.status === 303, 'yönetim: Ada\'ya Palyaço hediye (her el 5 bakış hakkı)', gift.status);
  let me = await S.post(PORT, '/api/me', { id: B.id, token: B.token, prefs: { skins: false } }); ok(me.json && me.json.prefs && me.json.prefs.skins === false, 'B: Skinler kapalı tercihi hesapta (prefs.skins=false)', JSON.stringify(me.json && me.json.prefs));
  // 1) Hızlı Katıl: tek insan + gizli botlar → lig maçı, bekleme süresi sonunda başlar
  const q = S.client(PORT, A, 'Bakan'); await q.open;
  q.send({ t: 'quick', settings: { totalHands: 1, stake: 'sosyal' }, name: 'Bakan', avatar: q.av, skins: 0, acc: q.acc });
  const jq = await q.wait((m) => m.t === 'joined', 5000); const rq = await q.wait((m) => m.t === 'room' && m.seats.filter(Boolean).length === 4, 8000);
  ok(jq && rq && rq.quick, 'Hızlı Katıl: oda, 3 koltuk gizli botla doldu', JSON.stringify(rq && rq.seats.map((s) => s && [s.name, s.bot])));
  const stq = await q.wait((m) => m.t === 'state' && m.view && m.view.prepLeft > 0, 10000); const rq2 = q.msgs.filter((m) => m.t === 'room').pop();
  ok(stq && rq2 && rq2.league === true && stq.view.charges === 5, 'maç başladı: lig maçı, hazırlık süresi, Palyaço 5 bakış hakkı', JSON.stringify({ league: rq2 && rq2.league, charges: stq && stq.view.charges }));
  ok(rq.seats.every((s) => !s || s.bot === false), 'gizli botlar koltuk bilgisinde bot olarak görünmüyor (K171)', JSON.stringify(rq.seats.map((s) => s && s.bot)));
  let n = q.msgs.length; q.send({ t: 'peek', target: 1 }); const pk = await q.wait((m) => m.t === 'peek' || m.t === 'error', 3000);
  ok(pk && pk.t === 'peek' && pk.hand === null && pk.revealIn === 600 && pk.charges === 4, 'lig maçında bakış kabul (K173): ilk cevapta taş yok (0,6 sn), hak 5 → 4', JSON.stringify(pk && { t: pk.t, msg: pk.msg, revealIn: pk.revealIn, charges: pk.charges }));
  const ph = await q.wait((m) => m.t === 'peekHand', 3000); ok(ph && ph.hand && ph.hand.length >= 14 && ph._at - pk._at >= 550, 'taşlar ' + (ph ? ph._at - pk._at : '?') + ' ms sonra geldi');
  await q.wait((m) => m.t === 'peekEnd', 12000); await S.sleep(200);
  n = q.msgs.length; q.send({ t: 'peek', target: 1 }); await S.sleep(400); let er = q.errorsSince(n);
  ok(er.some((x) => /zaten baktın/.test(x)), 'aynı rakibe ikinci bakış reddedildi (P1)', er.join('|'));
  q.send({ t: 'leave' }); await S.sleep(300); q.close();
  // 2) arkadaş odası: A kurar, B (skinler kapalı) ve C (yeni oyuncu) katılır, 1 bot ile başlar
  const a = S.client(PORT, A, 'Bakan'), b = S.client(PORT, B, 'Hedef'), c = S.client(PORT, C, 'Yeni'); await a.open; await b.open; await c.open;
  a.send({ t: 'create', name: 'Bakan', avatar: a.av, skins: 0, acc: a.acc, settings: { totalHands: 1 } }); const ja = await a.wait((m) => m.t === 'joined');
  b.send({ t: 'join', code: ja.code, name: 'Hedef', avatar: b.av, skins: 0, acc: b.acc }); await b.wait((m) => m.t === 'joined');
  c.send({ t: 'join', code: ja.code, name: 'Yeni', avatar: c.av, skins: 0, acc: c.acc }); await c.wait((m) => m.t === 'joined'); await S.sleep(800);
  const room = a.msgs.filter((m) => m.t === 'room').pop();
  ok(room && room.seats[1] && room.seats[1].skinsOff === true && room.seats[0].skinsOff === false && room.seats[2].prof && room.seats[2].prof.level === 1, 'koltuk bilgisi: B skinsOff, C seviye 1', JSON.stringify(room && room.seats.map((s) => s && [s.name, s.skinsOff, s.prof && s.prof.level])));
  n = a.msgs.length; a.send({ t: 'start' }); await S.sleep(400); er = a.errorsSince(n); ok(er.some((x) => /boş koltuk/.test(x)), 'boş koltukla başlatma onaysız reddedilir', er.join('|'));
  a.send({ t: 'start', fill: true }); await a.wait((m) => m.t === 'state' && m.view && m.view.prepLeft > 0, 8000); await S.sleep(400);
  n = a.msgs.length; a.send({ t: 'peek', target: 1 }); await S.sleep(400); er = a.errorsSince(n); ok(er.some((x) => /skinleri kapatmış/.test(x)), 'P3: skinleri kapatan hedefe bakış reddedildi', er.join('|'));
  n = b.msgs.length; b.send({ t: 'peek', target: 1 }); await S.sleep(400); er = b.errorsSince(n); ok(er.some((x) => /Ayarlar'dan kapattın/.test(x)), 'P3: skinleri kapatan kendisi de bakamaz', er.join('|'));
  n = a.msgs.length; a.send({ t: 'peek', target: 2 }); await S.sleep(400); er = a.errorsSince(n); ok(er.some((x) => /Yeni oyuncu koruması/.test(x)), 'P5: yeni oyuncuya bakış reddedildi', er.join('|'));
  n = a.msgs.length; a.send({ t: 'skinUse', skin: 'yoklama', target: 2 }); await S.sleep(400); er = a.errorsSince(n); ok(er.some((x) => /Yeni oyuncu koruması/.test(x)), 'P5: Yoklama da yeni oyuncuya kullanılamaz', er.join('|'));
  n = a.msgs.length; a.send({ t: 'peek', target: 3 }); const pk3 = await a.wait((m) => (m.t === 'peek' || m.t === 'error') && a.msgs.indexOf(m) >= n, 3000); ok(pk3 && pk3.t === 'peek', 'korunmayan hedefe (bot) bakış kabul', JSON.stringify(pk3 && { t: pk3.t, msg: pk3.msg }));
  await a.wait((m) => m.t === 'peekEnd' && a.msgs.indexOf(m) > a.msgs.indexOf(pk3), 12000);
  a.send({ t: 'leave' }); b.send({ t: 'leave' }); c.send({ t: 'leave' }); await S.sleep(400); a.close(); b.close(); c.close();
  // 3) tokat + ödül: B skinleri açar; yeni oda A + B; A B'ye bakar, B 0,6 sn içinde tokat → A taş görmez, B'ye +1 hak; B ödül hakkıyla bakar
  me = await S.post(PORT, '/api/me', { id: B.id, token: B.token, prefs: { skins: true } }); ok(me.json && me.json.prefs.skins === true, 'B skinleri yeniden açtı');
  const a2 = S.client(PORT, A, 'Bakan'), b2 = S.client(PORT, B, 'Hedef'); await a2.open; await b2.open;
  a2.send({ t: 'create', name: 'Bakan', avatar: a2.av, skins: 0, acc: a2.acc, settings: { totalHands: 1 } }); const ja2 = await a2.wait((m) => m.t === 'joined');
  b2.send({ t: 'join', code: ja2.code, name: 'Hedef', avatar: b2.av, skins: 0, acc: b2.acc }); await b2.wait((m) => m.t === 'joined'); await S.sleep(800);
  a2.send({ t: 'start', fill: true }); const stB = await b2.wait((m) => m.t === 'state' && m.view && m.view.prepLeft > 0, 8000); await S.sleep(400);
  const before = stB.view.charges;
  n = a2.msgs.length; a2.send({ t: 'peek', target: 1 }); const an = await b2.wait((m) => m.t === 'peekAnim', 3000); if (an) b2.send({ t: 'slap', from: an.from });
  const bonus = await b2.wait((m) => m.t === 'slapBonus', 3000); await S.sleep(900); const endA = a2.msgs.slice(n).find((m) => m.t === 'peekEnd');
  ok(endA && endA.reason === 'slap' && !a2.msgs.some((m) => m.t === 'peekHand'), '0,6 sn içinde tokat: bakış kesildi, bakana taş gitmedi (P2)', JSON.stringify(endA));
  ok(bonus && bonus.charges === (before || 0) + 1, 'P6: tokat ödülü +1 hak (' + before + ' → ' + (bonus && bonus.charges) + ')', JSON.stringify(bonus));
  n = b2.msgs.length; b2.send({ t: 'peek', target: 3 }); const pkB = await b2.wait((m) => (m.t === 'peek' || m.t === 'error') && b2.msgs.indexOf(m) >= n, 3000); ok(pkB && pkB.t === 'peek', 'B ödül hakkıyla A\'ya bakabildi', JSON.stringify(pkB && { t: pkB.t, msg: pkB.msg }));
  n = a2.msgs.length; a2.send({ t: 'peek', target: 1 }); const pkR = await a2.wait((m) => (m.t === 'peek' || m.t === 'error') && a2.msgs.indexOf(m) >= n, 3000); ok(pkR && pkR.t === 'peek', 'tokatla kesilen bakış yedek hakla aynı rakibe yinelenebildi (P1)', JSON.stringify(pkR && { t: pkR.t, msg: pkR.msg }));
  await a2.wait((m) => m.t === 'peekEnd' && a2.msgs.indexOf(m) > n, 12000);
  n = a2.msgs.length; a2.send({ t: 'skinUse', skin: 'tos', target: 1 }); await S.sleep(400); er = a2.errorsSince(n); ok(er.some((x) => /pencere kapalı/.test(x)), 'Tos pencere dışında reddedilir', er.join('|'));
  // 4) /olcum oyuncu dağılımı + bakış/tokat alanları
  const ol = JSON.parse((await S.get(PORT, '/olcum?key=' + KEY)).body);
  ok(ol.oyuncular && ol.oyuncular.oyuncu === 3 && ol.oyuncular.esikler.length === 13 && ol.toplam.peeks != null, '/olcum: 3 oyuncu, 13 mekân eşiği, bakış/tokat alanları', JSON.stringify({ oyuncu: ol.oyuncular.oyuncu, seviye: ol.oyuncular.seviye }));
  const no = await S.get(PORT, '/olcum'); ok(no.status === 404, '/olcum anahtarsız → 404', no.status);
  a2.send({ t: 'leave' }); b2.send({ t: 'leave' }); await S.sleep(300); a2.close(); b2.close();
  await S.stop(srv);
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(0);
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
