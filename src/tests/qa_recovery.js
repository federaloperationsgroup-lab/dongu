// Hesap kurtarma kodu (v10.18) — sunucu: kod üretimi (aynı kalır), biçim, başka cihazdan geri yükleme (aynı hesap), yanlış/bozuk kod, deneme sınırı,
// kodu yenile (yeni kod + yeni hesap anahtarı; eski kod ve eski cihaz geçersiz), kod oyuncu görünümünde sızmaz, silinen hesabın kodu çalışmaz. PORT 8773.
const S = require('./qa_srv.js');
const PORT = 8773, KEY = 'test-anahtar-73', LOG = '/tmp/qa_recovery.srv.log';
(async () => {
  let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 300) : '')); };
  const srv = S.start(PORT, { ADMIN_KEY: KEY, RECOVER_MAX: '6' }, LOG); await S.up(PORT, LOG, true);
  const P = (p, b) => S.post(PORT, p, b); const me = async (acc) => { const r = await P('/api/me', { id: acc.id, token: acc.token }); return r.json && (r.json.player || r.json); };
  const A = await S.guest(PORT, 'Asil'), B = await S.guest(PORT, 'Yeni'); ok(A && A.id && B && B.id, 'iki misafir hesap');
  await S.admin(PORT, KEY, A.id, 'altin', 4321); const a0 = await me(A);
  // kod üretimi
  let r = await P('/api/recovery/get', { id: A.id, token: A.token }); const code = r.json && r.json.code;
  ok(r.status === 200 && /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(code || ''), 'kod üretildi: 12 karakter, karışan harf/rakam (I L O 0 1) yok', code);
  r = await P('/api/recovery/get', { id: A.id, token: A.token }); ok(r.json && r.json.code === code, 'ikinci istekte aynı kod');
  r = await P('/api/recovery/get', { id: A.id, token: 'yanlis' }); ok(r.status >= 400 && !/[A-Z2-9]{4}-/.test(r.body), 'yanlış hesap anahtarıyla kod verilmez', r.body.slice(0, 80));
  const view = JSON.stringify(await me(A)); ok(view.indexOf(code) < 0 && view.indexOf(A.token) < 0, 'kod ve hesap anahtarı oyuncu görünümünde yok');
  const rb = await P('/api/recovery/get', { id: B.id, token: B.token }); ok(rb.json && rb.json.code && rb.json.code !== code, 'başka hesabın kodu farklı');
  // geri yükleme
  r = await P('/api/recover', { code }); ok(r.status === 200 && r.json.id === A.id && r.json.token === A.token && r.json.player && r.json.player.coins === a0.coins && r.json.player.name === 'Asil', 'kodla geri yükleme: aynı hesap (kimlik, anahtar, altın, ad)', r.body.slice(0, 120));
  r = await P('/api/recover', { code: code.toLowerCase().replace(/-/g, ' ') }); ok(r.status === 200 && r.json.id === A.id, 'küçük harf / boşluklu yazım kabul edilir');
  r = await P('/api/recover', { code: 'ABCD-EFGH' }); ok(r.status >= 400 && /12 karakter/.test(r.body), 'eksik kod: açık hata', r.body.slice(0, 100));
  r = await P('/api/recover', { code: 'OOOO-1111-LLLL' }); ok(r.status >= 400, 'geçersiz karakterli kod reddedilir');
  r = await P('/api/recover', {}); ok(r.status >= 400, 'kodsuz istek reddedilir');
  const wrong = code.slice(0, 13) + (code[13] === 'A' ? 'B' : 'A'); r = await P('/api/recover', { code: wrong }); ok(r.status >= 400 && /bulunamadı/.test(r.body) && r.body.indexOf(A.id) < 0, 'yanlış kod: hesap bulunamadı (kimlik sızmaz)', r.body.slice(0, 100));
  // kodu yenile
  r = await P('/api/recovery/rotate', { id: A.id, token: A.token }); const code2 = r.json && r.json.code, tok2 = r.json && r.json.token;
  ok(r.status === 200 && code2 && code2 !== code && tok2 && tok2 !== A.token, 'kodu yenile: yeni kod + yeni hesap anahtarı');
  r = await P('/api/me', { id: A.id, token: A.token }); ok(r.status >= 400 && /bulunamadı/.test(r.body), 'eski anahtarlı cihaz artık giremez', r.body.slice(0, 80));
  r = await P('/api/me', { id: A.id, token: tok2 }); ok(r.status === 200 && (r.json.player || r.json).coins === a0.coins, 'yeni anahtarla hesap aynen duruyor');
  r = await P('/api/recover', { code }); ok(r.status >= 400 && /bulunamadı/.test(r.body), 'eski kod artık çalışmaz');
  r = await P('/api/recover', { code: code2 }); ok(r.status === 200 && r.json.id === A.id && r.json.token === tok2, 'yeni kod çalışır (doğru kod deneme sayacını sıfırlar)');
  // deneme sınırı (RECOVER_MAX=6): art arda yanlış kod
  let blocked = null; for (let i = 0; i < 9; i++) { r = await P('/api/recover', { code: 'ABCD-EFGH-JKM' + 'NPQRSTUVW'[i] }); if (/Çok fazla deneme/.test(r.body)) { blocked = i + 1; break; } }
  ok(blocked === 7, '6 yanlış denemeden sonra 7. deneme engellenir', 'engel: ' + blocked + '. deneme');
  r = await P('/api/recover', { code: code2 }); ok(r.status >= 400 && /Çok fazla deneme/.test(r.body), 'engel süresince doğru kod da kabul edilmez (kaba kuvvet)', r.body.slice(0, 80));
  // gizli bot hesabı / silinen hesap
  const lg = require('fs').readFileSync(LOG, 'utf8'); ok(/hesap kurtarma: p_/.test(lg), 'geri yükleme sunucu günlüğüne yazılır');
  await S.stop(srv);
  const srv2 = S.start(PORT, { ADMIN_KEY: KEY }, LOG); await S.up(PORT, LOG, true); // temiz veri, sınır sıfır
  const C = await S.guest(PORT, 'Silinecek'); const cc = (await P('/api/recovery/get', { id: C.id, token: C.token })).json.code;
  r = await P('/api/social/delete', { id: C.id, token: C.token, confirm: 'SIL' }); ok(r.status === 200, 'hesap silindi', r.body.slice(0, 80));
  r = await P('/api/recover', { code: cc }); ok(r.status >= 400 && /bulunamadı/.test(r.body), 'silinen hesabın kodu çalışmaz');
  // aynı anda iki istek: tek kod üretilir
  const D = await S.guest(PORT, 'Cift'); const two = await Promise.all([P('/api/recovery/get', { id: D.id, token: D.token }), P('/api/recovery/get', { id: D.id, token: D.token })]);
  ok(two[0].json.code && two[0].json.code === two[1].json.code, 'aynı anda iki istek aynı kodu alır (hesap kilidi)');
  const lg2 = require('fs').readFileSync(LOG, 'utf8'); ok(!/TypeError|ReferenceError|Unhandled/i.test(lg2), 'sunucu günlüğünde hata yok');
  await S.stop(srv2);
  console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
