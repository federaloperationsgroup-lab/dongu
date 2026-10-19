// Sunucu testleri için ortak yardımcılar: sunucu başlat/durdur (temiz data), HTTP, WebSocket istemcisi (hesaplı), yönetim işlemleri.
const { spawn } = require('child_process'); const fs = require('fs'); const http = require('http'); const path = require('path');
const WebSocket = require('ws');
const SRVDIR = process.env.SRVDIR || '/home/claude/okey/server';
function start(port, env, logFile) {
  for (const f of ['players.json', 'venues.json', 'rooms.json', 'rooms.json.tmp', 'matches.jsonl', 'meta.json', 'social.json', 'dm.json', 'reports.jsonl']) { try { fs.unlinkSync(path.join(SRVDIR, 'data', f)); } catch (e) {} }
  const out = logFile ? fs.openSync(logFile, 'w') : 'ignore';
  const srv = spawn('node', ['server.js'], { cwd: SRVDIR, env: Object.assign({}, process.env, { PORT: String(port), NODE_PATH: '/opt/npm-tools/node_modules' }, env || {}), stdio: ['ignore', out, out] });
  srv.port = port; return srv;
}
function stop(p) { return new Promise((r) => { if (!p || p.exitCode != null) return r(); p.on('exit', r); p.kill('SIGTERM'); setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} r(); }, 4000); }); }
function get(port, p) { return new Promise((res) => http.get({ host: '127.0.0.1', port, path: p }, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', () => res({ status: 0, body: '' }))); }
function post(port, p, body, ctype) { return new Promise((res) => { const d = typeof body === 'string' ? body : JSON.stringify(body || {}); const q = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'Content-Type': ctype || 'application/json', 'Content-Length': Buffer.byteLength(d) } }, (r) => { let b = ''; r.on('data', (x) => (b += x)); r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} res({ status: r.statusCode, body: b, json: j }); }); }); q.on('error', () => res({ status: 0, body: '', json: null })); q.end(d); }); }
async function up(port, logFile, waitBots) { for (let i = 0; i < 150; i++) { const r = await get(port, '/durum'); if (r.status === 200) break; await sleep(150); } if (waitBots && logFile) { for (let i = 0; i < 100; i++) { try { if (/gizli botlar hazır/.test(fs.readFileSync(logFile, 'utf8'))) return true; } catch (e) {} await sleep(150); } } return true; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const form = (o) => Object.keys(o).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
const consent = { v: '1.1', at: Date.now(), adult: true };
async function guest(port, name) { const r = await post(port, '/api/guest', { name, avatar: { v: 2, name }, consent }); return r.json; }
async function admin(port, key, id, islem, deger) { return post(port, '/yonetim/oyuncu-islem?key=' + key, form({ id, islem, deger: deger == null ? '' : String(deger) }), 'application/x-www-form-urlencoded'); }
// ham WebSocket istemcisi: msgs, view (son state), wait(pred, ms)
function client(port, acc, name) {
  const c = { name, msgs: [], view: null, acc: acc ? { id: acc.id, token: acc.token } : null, av: { v: 2, name }, ws: new WebSocket('ws://127.0.0.1:' + port) };
  c.ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (e) { return; } m._at = Date.now(); c.msgs.push(m); if (m.t === 'state') c.view = m.view; });
  c.open = new Promise((r) => c.ws.on('open', r));
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.wait = (pred, ms) => new Promise((res) => { const from = c.msgs.length; const t0 = Date.now(); const iv = setInterval(() => { for (let i = from; i < c.msgs.length; i++) if (pred(c.msgs[i])) { clearInterval(iv); return res(c.msgs[i]); } if (Date.now() - t0 > (ms || 5000)) { clearInterval(iv); res(null); } }, 40); });
  c.errorsSince = (n) => c.msgs.slice(n).filter((m) => m.t === 'error').map((m) => m.msg);
  c.close = () => { try { c.ws.close(); } catch (e) {} };
  return c;
}
module.exports = { start, stop, get, post, up, sleep, form, consent, guest, admin, client, SRVDIR };
