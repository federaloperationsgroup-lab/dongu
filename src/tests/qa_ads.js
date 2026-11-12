// Ödüllü reklam (v10.19) — sunucu: ekonomi kuralı (günlük sınır, UTC günü, bekleme), uygulama bildirimi yolu (nonce tek kullanımlık, erken/geç bildirim),
// Google sunucu doğrulaması (SSV: gerçek ECDSA P-256 imzası, sahte anahtar listesi), tekrar/oynanmış istek, anahtar yenilenmesi, kapalı kip, durum sorgusu, /durum özeti. PORT 8777/8778.
const S = require('./qa_srv.js'); const http = require('http'); const crypto = require('crypto'); const fs = require('fs');
const Economy = require('/home/claude/okey/economy.js');
const PORT = 8777, KP = 8778, KEY = 'test-anahtar-77', LOG = '/tmp/qa_ads.srv.log';
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 300) : '')); };
  const P = (p, b) => S.post(PORT, p, b); const me = async (a) => { const j = (await P('/api/me', { id: a.id, token: a.token })).json; return j.player || j; };
  // ---- ekonomi kuralı (saf işlevler)
  const C = Economy.CONFIG.ads; ok(C && C.gold === 40 && C.dailyMax === 5 && C.cooldownMs === 60000, 'kural: reklam başına 40 altın, günde 5, arada 60 sn (ekonomi ' + Economy.CONFIG.version + ')');
  const t0 = Date.UTC(2026, 10, 12, 10, 0, 0); const pl = { coins: 100 }; let s = Economy.adSummary(pl, t0); ok(s.left === 5 && s.waitMs === 0 && s.gold === 40 && s.max === 5, 'özet: 5 hak, bekleme yok');
  let r = Economy.adReward(pl, t0); s = Economy.adSummary(pl, t0 + 1000); ok(r && r.gold === 40 && pl.coins === 140 && s.left === 4 && s.waitMs === 59000, 'ödül: +40, kalan 4, 59 sn bekleme');
  for (let i = 1; i < 5; i++) Economy.adReward(pl, t0 + i * 61000); ok(pl.coins === 300 && Economy.adReward(pl, t0 + 400000) === null && Economy.adSummary(pl, t0 + 400000).left === 0, 'günde 5 ödülden sonra 6. verilmez');
  const t1 = Date.UTC(2026, 10, 13, 0, 0, 5); ok(Economy.adSummary(pl, t1).left === 5 && Economy.adReward(pl, t1).gold === 40 && pl.coins === 340, 'UTC gün dönümünde (03.00 TSİ) haklar yenilenir');
  // ================= uygulama bildirimi yolu (ADS_SSV kapalı) =================
  let srv = S.start(PORT, { ADMIN_KEY: KEY, ADS_MIN_MS: '400', ADS_COOLDOWN_MS: '0' }, LOG); await S.up(PORT, LOG, true);
  const A = await S.guest(PORT, 'Izleyen'), B = await S.guest(PORT, 'Baska'); const c0 = (await me(A)).coins;
  let v = await me(A); ok(v.ads && v.ads.left === 5 && v.ads.gold === 40 && v.ads.max === 5, 'oyuncu görünümünde reklam özeti', JSON.stringify(v.ads));
  r = await P('/api/ads/status', { id: A.id, token: A.token }); ok(r.status === 200 && r.json.ads && r.json.ads.left === 5 && r.json.ads.waitMs === 0 && r.json.coins === c0, 'durum sorgusu: hak, bekleme ve altın', r.body.slice(0, 120));
  r = await P('/api/ads/status', { id: A.id, token: 'yanlis' }); ok(r.status >= 400 && !/ads/.test(r.body), 'durum sorgusu hesap anahtarı ister');
  // uygulama sayfayı paketten açar: istekler Android'de https://localhost, iPhone'da capacitor://localhost kökeninden gelir (çapraz köken)
  const xo = (method, origin, body) => new Promise((res) => { const d = body ? JSON.stringify(body) : ''; const h = { Origin: origin }; if (method === 'OPTIONS') h['Access-Control-Request-Method'] = 'POST'; if (d) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(d); }
    const q = http.request({ host: '127.0.0.1', port: PORT, path: '/api/ads/status', method, headers: h }, (x) => { let t = ''; x.on('data', (c) => (t += c)); x.on('end', () => res({ status: x.statusCode, acao: x.headers['access-control-allow-origin'] || '', body: t })); }); q.on('error', () => res({ status: 0, acao: '', body: '' })); q.end(d); });
  const x1 = await xo('OPTIONS', 'https://localhost'), x2 = await xo('POST', 'capacitor://localhost', { id: A.id, token: A.token }), x3 = await xo('POST', 'https://baska-site.example', { id: A.id, token: A.token });
  ok(x1.status === 204 && x1.acao === 'https://localhost' && x2.status === 200 && x2.acao === 'capacitor://localhost' && /"left":5/.test(x2.body) && !x3.acao, 'reklam uçlarına uygulama kökenlerinden (Android, iPhone) erişim izni var; başka siteye yok', JSON.stringify([x1.status, x1.acao, x2.status, x2.acao, x3.acao]));
  r = await P('/api/ads/start', { id: A.id, token: 'yanlis' }); ok(r.status >= 400, 'hesap anahtarı yanlışsa reklam oturumu açılmaz');
  r = await P('/api/ads/start', { id: A.id, token: A.token }); const n1 = r.json && r.json.nonce; ok(r.status === 200 && /^[0-9a-f]{24}$/.test(n1 || '') && r.json.ssv === false && r.json.ads.left === 5, 'reklam oturumu: tek kullanımlık kod', r.body.slice(0, 120));
  r = await P('/api/ads/claim', { id: A.id, token: A.token, nonce: n1 }); ok(r.status >= 400 && /bitmeden/.test(r.body) && (await me(A)).coins === c0, 'reklam süresi dolmadan ödül istenirse verilmez', r.body.slice(0, 80));
  await S.sleep(450);
  r = await P('/api/ads/claim', { id: B.id, token: B.token, nonce: n1 }); ok(r.status >= 400 && (await me(B)).coins === 1000, 'başka oyuncu aynı kodla ödül alamaz');
  r = await P('/api/ads/claim', { id: A.id, token: A.token, nonce: 'x'.repeat(24) }); ok(r.status >= 400 && /geçersiz/.test(r.body), 'yanlış kod reddedilir');
  r = await P('/api/ads/claim', { id: A.id, token: A.token, nonce: n1 }); ok(r.status === 200 && r.json.ok && r.json.gold === 40 && r.json.player.coins === c0 + 40 && r.json.player.ads.left === 4, 'reklam bitince ödül: +40 altın, kalan 4', r.body.slice(0, 100));
  const two = await Promise.all([P('/api/ads/claim', { id: A.id, token: A.token, nonce: n1 }), P('/api/ads/claim', { id: A.id, token: A.token, nonce: n1 })]);
  ok((await me(A)).coins === c0 + 40 && two.every((x) => x.json && x.json.already), 'aynı kod yeniden (çift dokunma): altın bir kez');
  // aynı anda iki oturum açma + iki bildirim: yalnız son kod geçerli
  const st2 = await Promise.all([P('/api/ads/start', { id: A.id, token: A.token }), P('/api/ads/start', { id: A.id, token: A.token })]); await S.sleep(450);
  const cl2 = await Promise.all(st2.map((x) => P('/api/ads/claim', { id: A.id, token: A.token, nonce: x.json.nonce })));
  ok((await me(A)).coins === c0 + 80 && cl2.filter((x) => x.json && x.json.ok).length === 1, 'iki oturum birden açılırsa yalnız biri ödül alır', cl2.map((x) => x.status).join(','));
  for (let i = 0; i < 3; i++) { const st = await P('/api/ads/start', { id: A.id, token: A.token }); await S.sleep(420); await P('/api/ads/claim', { id: A.id, token: A.token, nonce: st.json.nonce }); }
  v = await me(A); ok(v.coins === c0 + 200 && v.ads.left === 0, 'günün 5 reklamı tamam: +200 altın, kalan 0', JSON.stringify(v.ads));
  r = await P('/api/ads/start', { id: A.id, token: A.token }); ok(r.status >= 400 && /hakkın bitti/.test(r.body), '6. reklam: "bugünkü hakkın bitti"', r.body.slice(0, 90));
  r = await P('/api/ads/status', { id: A.id, token: A.token }); ok(r.json && r.json.ads.left === 0 && r.json.coins === c0 + 200, 'durum sorgusu güncel: kalan 0, altın +200');
  const d1 = (await S.get(PORT, '/durum')).body; ok(/Reklam ödülü: açık \(40 altın, günde 5\), Google doğrulaması kapalı, açılıştan beri 5 ödül/.test(d1) && /Satın alma: sunucu anahtarı YOK, bildirim anahtarı YOK, deneme satın alması ret/.test(d1) && !/SORUN/.test(d1), '/durum: reklam ve satın alma ayar özeti (anahtar yazılmaz)', (d1.match(/Satın alma:[^\n]*?ödül/) || [''])[0]);
  await S.stop(srv);
  // bekleme süresi (varsayılan 60 sn)
  srv = S.start(PORT, { ADMIN_KEY: KEY, ADS_MIN_MS: '50' }, LOG); await S.up(PORT, LOG, true); const D = await S.guest(PORT, 'Bekleyen');
  let st = await P('/api/ads/start', { id: D.id, token: D.token }); await S.sleep(80); await P('/api/ads/claim', { id: D.id, token: D.token, nonce: st.json.nonce });
  r = await P('/api/ads/start', { id: D.id, token: D.token }); ok(r.status >= 400 && /sn bekle/.test(r.body) && (await me(D)).ads.waitMs > 50000, 'iki reklam arasında 60 sn beklenir', r.body.slice(0, 80));
  await S.stop(srv);
  // ================= Google sunucu doğrulaması (ADS_SSV=1) =================
  const mk = () => crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); const k1 = mk(), k2 = mk(); let served = [{ keyId: 1111, pem: k1.publicKey.export({ type: 'spki', format: 'pem' }), base64: '' }], keyHits = 0;
  const ks = http.createServer((q, res) => { keyHits++; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ keys: served })); }); await new Promise((res) => ks.listen(KP, '127.0.0.1', res));
  const sign = (content, key, pad) => { let b = crypto.createSign('SHA256').update(Buffer.from(content, 'utf8')).sign(key.privateKey).toString('base64'); if (!pad) b = b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); return b; };
  const q = (o) => 'ad_network=5450213213286189855&ad_unit=1234567890' + (o.nonce != null ? '&custom_data=' + encodeURIComponent(o.nonce) : '') + '&reward_amount=1&reward_item=altin&timestamp=' + (o.ts || Date.now()) + '&transaction_id=' + o.tx + (o.uid ? '&user_id=' + o.uid : '');
  const call = async (content, key, keyId, pad) => S.get(PORT, '/api/ads/ssv?' + content + '&signature=' + (key ? encodeURIComponent(sign(content, key, pad)).replace(/%2D/g, '-') : 'AAAA') + '&key_id=' + keyId);
  srv = S.start(PORT, { ADMIN_KEY: KEY, ADS_SSV: '1', ADS_KEYS_URL: 'http://127.0.0.1:' + KP + '/k.json', ADS_KEYS_MIN_MS: '1500', ADS_COOLDOWN_MS: '0' }, LOG); await S.up(PORT, LOG, true);
  const E = await S.guest(PORT, 'Dogrulanan'), F = await S.guest(PORT, 'Oteki'); const e0 = (await me(E)).coins;
  st = await P('/api/ads/start', { id: E.id, token: E.token }); const ne = st.json.nonce; ok(st.json.ssv === true, 'doğrulama kipi: oturum yanıtı ssv=true');
  await S.sleep(100); r = await P('/api/ads/claim', { id: E.id, token: E.token, nonce: ne }); ok(r.status === 200 && r.json.pending === true && (await me(E)).coins === e0, 'doğrulama kipinde uygulamanın bildirimi altın vermez (bekliyor)', r.body.slice(0, 80));
  let c1 = q({ nonce: ne, tx: 'aa01', uid: E.id }); r = await call(c1, k1, 1111); ok(r.status === 200 && /"ok":true/.test(r.body) && (await me(E)).coins === e0 + 40, 'Google imzalı bildirim: +40 altın', r.body);
  ok(keyHits === 1, 'Google anahtar listesi bir kez çekildi');
  r = await P('/api/ads/claim', { id: E.id, token: E.token, nonce: ne }); ok(r.json && r.json.ok && r.json.gold === 40 && r.json.player.coins === e0 + 40, 'uygulama sorunca: ödül işlenmiş (yeniden verilmez)');
  r = await call(c1, k1, 1111); ok(r.status === 200 && /dup/.test(r.body) && (await me(E)).coins === e0 + 40, 'aynı bildirim yeniden (Google 5 kez deneyebilir): altın bir kez');
  r = await S.get(PORT, '/api/ads/ssv?' + c1.replace(E.id, F.id) + '&signature=' + sign(c1, k1) + '&key_id=1111'); ok(r.status === 200 && /imza geçersiz/.test(r.body) && (await me(F)).coins === 1000 && (await me(E)).coins === e0 + 40, 'oynanmış bildirim (oyuncu kimliği değiştirilmiş): işlenmez, altın yok', r.status + ' ' + r.body);
  r = await call(q({ nonce: 'x', tx: 'aa02', uid: E.id }), k2, 1111); ok(/imza geçersiz/.test(r.body) && (await me(E)).coins === e0 + 40, 'başka anahtarla imzalanmış bildirim işlenmez');
  r = await call(q({ nonce: 'x', tx: 'aa03', uid: E.id }), null, 1111); ok(/imza geçersiz/.test(r.body) && (await me(E)).coins === e0 + 40, 'bozuk imza işlenmez');
  r = await S.get(PORT, '/api/ads/ssv?' + q({ nonce: 'x', tx: 'aa04', uid: E.id })); const r0 = await S.get(PORT, '/api/ads/ssv'); ok(r.status === 200 && /imza yok/.test(r.body) && r0.status === 200 && /imza yok/.test(r0.body) && (await me(E)).coins === e0 + 40, 'imzasız istek ve boş yoklama: 200 ama işlem yok (AdMob panelindeki adres denemesi takılmaz)', r0.body);
  r = await call(q({ nonce: 'x', tx: 'aa05', uid: E.id }), k1, 9999); const r2 = await call(q({ nonce: 'x', tx: 'aa05b', uid: E.id }), k1, 8888); ok(/imza geçersiz/.test(r.body) && /imza geçersiz/.test(r2.body) && (await me(E)).coins === e0 + 40 && keyHits === 1, 'bilinmeyen anahtar kimliği işlenmez; anahtar listesi her sahte istekte yeniden çekilmez', 'çekme ' + keyHits);
  r = await call(q({ nonce: 'x', tx: 'aa05c', uid: E.id, ts: Date.now() - 25 * 3600000 }), k1, 1111); ok(r.status === 200 && /eski bildirim/.test(r.body) && (await me(E)).coins === e0 + 40, 'bir günden eski (yeniden gönderilmiş) imzalı bildirim altın vermez', r.body);
  r = await call(q({ nonce: 'x', tx: 'aa06', uid: 'p_olmayan' }), k1, 1111); ok(r.status === 200 && /ignored/.test(r.body), 'geçerli imza, bilinmeyen oyuncu: 200 (Google yeniden denemez), altın yok', r.body);
  r = await call(q({ nonce: 'a b/ç&x', tx: 'aa07', uid: E.id }), k1, 1111, true); ok(r.status === 200 && /"ok":true/.test(r.body) && (await me(E)).coins === e0 + 80, 'özel karakterli veri + dolgulu base64 imza kabul edilir (ham metin üzerinden denetim)', r.status + ' ' + r.body);
  await S.sleep(1600); served = [{ keyId: 2222, pem: k2.publicKey.export({ type: 'spki', format: 'pem' }), base64: '' }]; r = await call(q({ nonce: 'x', tx: 'aa08', uid: E.id }), k2, 2222);
  ok(r.status === 200 && /"ok":true/.test(r.body) && (await me(E)).coins === e0 + 120 && keyHits === 2, 'Google anahtarı yenilenince: liste yeniden çekilir, yeni anahtarla doğrulanır', r.status + ' ' + r.body + ' çekme ' + keyHits);
  for (const tx of ['aa09', 'aa10']) await call(q({ nonce: 'x', tx, uid: E.id }), k2, 2222); v = await me(E); ok(v.coins === e0 + 200 && v.ads.left === 0, 'günün 5. ödülü', JSON.stringify(v.ads));
  r = await call(q({ nonce: 'x', tx: 'aa11', uid: E.id }), k2, 2222); ok(r.status === 200 && /günlük sınır/.test(r.body) && (await me(E)).coins === e0 + 200, 'günlük sınır dolunca geçerli bildirim de altın vermez (200)', r.body);
  r = await S.post(PORT, '/api/ads/ssv', {}); ok(r.status >= 400, 'doğrulama adresi yalnız GET kabul eder', String(r.status));
  const lg = fs.readFileSync(LOG, 'utf8'); ok(/reklam ödülü: p_.* \(Google doğrulaması aa01\)/.test(lg) && !/TypeError|ReferenceError|Unhandled/i.test(lg), 'ödüller sunucu günlüğünde; hata yok');
  const durum = (await S.get(PORT, '/durum')).body; ok(/Reklam ödülü: açık/.test(durum) && /Google doğrulaması açık/.test(durum), '/durum: reklam ödülü ve doğrulama durumu', (durum.match(/Reklam ödülü[^.\n<]*/) || [''])[0]); ok(/[1-9]\d* geçersiz bildirim/.test(durum), '/durum: geçersiz bildirim sayacı (sahte istekler izlenebilir)');
  await S.stop(srv);
  // ================= kapalı =================
  srv = S.start(PORT, { ADMIN_KEY: KEY, ADS_OFF: '1', ADS_SSV: '1', ADS_KEYS_URL: 'http://127.0.0.1:' + KP + '/k.json' }, LOG); await S.up(PORT, LOG, true); const G = await S.guest(PORT, 'Kapali');
  r = await P('/api/ads/start', { id: G.id, token: G.token }); ok(r.status >= 400 && /kapalı/.test(r.body), 'ADS_OFF=1: reklam oturumu açılmaz', r.body.slice(0, 60));
  v = await me(G); r = await P('/api/ads/status', { id: G.id, token: G.token }); ok(v.ads == null && r.json && r.json.ads === null && /Reklam ödülü: kapalı/.test((await S.get(PORT, '/durum')).body), 'ADS_OFF=1: oyuncu görünümünde reklam özeti yok (uygulamada düğme çıkmaz); /durum "kapalı"');
  r = await call(q({ nonce: 'x', tx: 'bb01', uid: G.id }), k2, 2222); ok(r.status === 200 && (await me(G)).coins === 1000, 'ADS_OFF=1: geçerli bildirim de altın vermez');
  await S.stop(srv); await new Promise((res) => ks.close(res));
  // ================= Google anahtar listesi alınamıyor (geçici hata) =================
  srv = S.start(PORT, { ADMIN_KEY: KEY, ADS_SSV: '1', ADS_KEYS_URL: 'http://127.0.0.1:' + KP + '/k.json' }, LOG); await S.up(PORT, LOG, true); const H = await S.guest(PORT, 'Gecici');
  r = await call(q({ nonce: 'x', tx: 'cc01', uid: H.id }), k2, 2222); ok(r.status === 503 && (await me(H)).coins === 1000, 'anahtar listesi alınamazsa 503 (Google yeniden dener), altın verilmez', r.status + ' ' + r.body);
  await S.stop(srv);
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
