// catalog.json: app.js içindeki CATALOG + GARDROP (+ economy'den karakter fiyatları ve kullanım paketleri) — sunucunun fiyat kaynağı (katalog-4 biçimi)
'use strict';
const fs = require('fs'), E = require('./economy.js');
const s = fs.readFileSync(__dirname + '/app.js', 'utf8');
const __L = (t) => String(t).replace(/\{\{/g, '{').replace(/\}\}/g, '}');
function grab(name, open, close) { const i = s.indexOf('var ' + name + ' = ' + open); const j = s.indexOf('\n  ' + close + ';', i); return new Function('__L', 'return ' + s.slice(i + ('var ' + name + ' = ').length, j + 4))(__L); }
const CATALOG = grab('CATALOG', '[', ']'), GARDROP = grab('GARDROP', '{', '}'), ACTION_SKINS = grab('ACTION_SKINS', '{', '}');
Object.keys(GARDROP).forEach((id) => { const g = GARDROP[id]; CATALOG.push({ id: 'dg24_' + id, cat: g.cat, k: g.slot, val: id, name: g.name, price: g.price, isNew: true, gardrop: true }); });
CATALOG.forEach((c) => { const ch = E.charOf(c.id); if (ch) { c.price = ch.price; c.free = false; } });
E.CONFIG.skinUses.forEach((u) => { CATALOG.push({ id: u.id, cat: 'uses', k: 'uses', val: u.id, name: u.name, price: u.price, uses: u.uses, skin: u.skin, isNew: true }); });
Object.keys(ACTION_SKINS).forEach((id) => { const a = E.actionSkin(id); CATALOG.push({ id: 'a_' + id, cat: 'action', k: 'action', val: id, name: ACTION_SKINS[id].name, price: a ? a.price : 1500, isNew: true }); });
const out = CATALOG.map((c) => { const o = { id: c.id, price: c.price, free: !!c.free, name: c.name, cat: c.cat, val: c.val, k: c.k }; if (c.uses != null) { o.uses = c.uses; o.skin = c.skin; } o.v = 'katalog-4'; return o; });
fs.writeFileSync(__dirname + '/server/public/catalog.json', JSON.stringify(out)); console.log('catalog.json: ' + out.length + ' ürün');
