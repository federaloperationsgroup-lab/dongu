/* Döngü — dil katmanı (v10.11). Türkçe (asıl) ve İngilizce.
   1) İstemci metinleri: kaynakta __L("Seviye {0}", [lv]) biçiminde şablon (i18n/rewrite.js üretir). Türkçede şablon argümanlarla aynen doldurulur
      (çıktı eski birleştirmeyle birebir aynı); İngilizcede sözlükteki (en.js → DONGU_EN.t) karşılığı kullanılır (sözcük sırası değişebilir).
   2) Sunucudan ve oyun motorundan gelen metinler (hata, ödül satırı, oyun günlüğü…) Türkçe gelir: İngilizcede ekrana konunca eşleştirilip çevrilir
      (DONGU_EN.rt kalıpları; DOM gözlemcisi metin düğümlerine bakar: önce birebir eşleşme, sonra Türkçe görünen metinde kalıplar; kalıbın
      yakaladığı parça da — ör. "Bronz", "3'lü renkli + 3'lü seri" — aynı yolla çevrilir). Oyuncu adı, özel mesaj çevrilmez (translate="no").
   Dil: kayıtlı seçim (localStorage ao.lang) → yoksa telefonun / tarayıcının dili (tr → Türkçe, diğerleri → İngilizce). Otomatik testlerde
   (navigator.webdriver) seçim yoksa Türkçe. Değiştirmek: DonguI18n.set('en') → sayfa yeniden yüklenir. */
(function () {
  'use strict';
  var KEY = 'ao.lang';
  function detect() {
    try { var s = localStorage.getItem(KEY); if (s === 'tr' || s === 'en') return s; } catch (e) {}
    try { if (navigator.webdriver) return 'tr'; } catch (e) {}
    var l = ''; try { l = (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch (e) {}
    return /^tr\b/i.test(l) || l === '' ? 'tr' : 'en';
  }
  var LANG = detect(), EN = LANG === 'en' ? (window.DONGU_EN || { t: {}, rt: [] }) : null;
  function fill(tpl, args) { // {0} {1} … yer tutucular; {{ }} kaçış
    if (tpl.indexOf('{') < 0 && tpl.indexOf('}') < 0) return tpl;
    return tpl.replace(/\{\{|\}\}|\{(\d+)\}/g, function (m, i) { if (m === '{{') return '{'; if (m === '}}') return '}'; var k = +i; return args && k < args.length ? String(args[k]) : m; });
  }
  var T = EN ? EN.t || {} : {};
  window.__L = EN ? function (tpl, args) { var e = T[tpl]; return fill(e != null ? e : tpl, args); } : fill;
  window.__LOC = LANG === 'en' ? 'en-US' : 'tr-TR';
  var I = window.DonguI18n = { lang: LANG, en: !!EN, set: function (l) { try { localStorage.setItem(KEY, l); } catch (e) {} try { location.reload(); } catch (e) {} }, rt: function (s) { return s; } };
  try { document.documentElement.lang = LANG; } catch (e) {}
  if (!EN) return;
  // ---- çalışma anı eşleştirme (sunucu / motor metinleri) ----
  var RTX = Object.create(null), RT = [];
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function unesc(s) { return s.replace(/\{\{/g, '{').replace(/\}\}/g, '}'); }
  // kalıp bayrakları: 'n' yer tutucu yalnız sayı ("Ateş {0}" → "Ateş 7"); 'g' genel kalıp ("{0} + {1}"): her parça çevrilmeli ya da Türkçe olmamalı;
  // 'r' elle yazılmış düzenli ifade (p[3]; gruplar yer tutucu sırasıyla). Yer tutucu boş olabilir ("{3} sezonu{4}"). Yan yana yer tutucular ("{0}{1}{2}")
  // İngilizcede de aynı dizide ise tek parça yakalanır (ör. " (3. sıra, günlük %25 bant)").
  (EN.rt || []).forEach(function (p) { // [türkçe şablon, ingilizce şablon, bayrak?, ifade?] ya da yalnız türkçe şablon (karşılığı t'de)
    var str = typeof p === 'string', tr = (str ? p : p[0]).trim(), en = str ? T[p] : p[1], fl = str ? '' : p[2] || ''; if (en == null) return; en = en.trim();
    var pre0 = /^[,·—:;\s]+/.exec(tr); if (pre0 && en.indexOf(pre0[0]) === 0) { tr = tr.slice(pre0[0].length); en = en.slice(pre0[0].length); } // baştaki bağlaç (", ", " · ") iki dilde aynıysa atılır
    if (!/\{\d+\}/.test(tr)) { RTX[unesc(tr)] = unesc(en); return; }
    var parts = tr.split(/(\{\d+\}|\{\{|\}\})/).filter(function (x) { return x !== ''; }), slots = [], re = '^';
    for (var i = 0; i < parts.length; i++) {
      var m = /^\{(\d+)\}$/.exec(parts[i]);
      if (!m) { re += parts[i] === '{{' ? '\\{' : parts[i] === '}}' ? '\\}' : reEsc(parts[i]); continue; }
      var run = parts[i], j = i; while (j + 1 < parts.length && /^\{\d+\}$/.test(parts[j + 1])) run += parts[++j];
      if (j > i && en.indexOf(run) >= 0) { slots.push({ run: run }); i = j; } // yan yana yer tutucular tek parça
      else { slots.push({ k: +m[1] }); }
      re += fl === 'n' ? '(\\d+)' : '([\\s\\S]*?)';
    }
    re += '$';
    if (fl === 'r' && p[3]) { re = p[3]; slots = (tr.match(/\{\d+\}/g) || []).map(function (x) { return { k: +x.slice(1, -1) }; }); }
    var lead = /^\{\d+\}/.test(tr) ? '' : unesc(parts[0]).slice(0, 3);
    RT.push({ re: new RegExp(re), en: en, slots: slots, len: tr.replace(/\{\d+\}/g, '').length, g: fl === 'g', dot: tr.indexOf(' · ') >= 0, lead: lead.length === 3 ? lead : '' });
  });
  RT.sort(function (a, b) { return b.len - a.len; }); // en çok sabit metni olan (özgül) kalıp önce
  var BY = Object.create(null), GEN = [];
  RT.forEach(function (r) { if (r.lead) (BY[r.lead] || (BY[r.lead] = [])).push(r); else GEN.push(r); });
  var CAND = Object.create(null);
  function cands(s) { var k = s.slice(0, 3), c = CAND[k]; if (c) return c; var b = BY[k] || []; c = b.concat(GEN).sort(function (a, z) { return z.len - a.len; }); CAND[k] = c; return c; } // aynı başlangıçlı + baştan yer tutuculu kalıplar
  Object.keys(T).forEach(function (k) { // istemci sabitleri de (sunucunun gönderdiği aynı metin); baştaki ", " / " · " gibi bağlaç her iki dilde aynıysa atılır
    if (/\{\d+\}/.test(k) || k.indexOf('<') >= 0) return; var u = unesc(k).trim(), v = unesc(T[k]).trim(), pre = /^[,·—:;\s]+/.exec(u);
    if (pre && v.indexOf(pre[0]) === 0) { u = u.slice(pre[0].length); v = v.slice(pre[0].length); }
    if (u && RTX[u] == null) RTX[u] = v;
  });
  var TRCH = /[çğıöşüÇĞİÖŞÜ]/;
  var TRW = /(^|[\s(])(ve|ile|için|bir|bu|da|de|ki|mi|ödülü|ödül|altın|taş|taşı|taşın|masa|masada|eli|elin|puan|puanı|ceza|cezası|oyun|maç|maçı|seviye|seviyesi|kaldı|yok|var|değil|oldu|olur|gerekir|sende|sana|seni|sıra|sırası|açıldı|bitti|aldı|attı|itibar|kasa|sonraki|emanette|giriş|girişin)([\s).,:;!?]|$)/i;
  function tr1(raw, depth) { var t = raw.trim(); if (!t) return { w: raw, c: null, t: t }; var c = core(t, depth + 1); return { w: c != null ? raw.replace(t, c) : raw, c: c, t: t }; }
  function split(s, sep, depth) { // liste: parça parça; çevrilemeyen parça Türkçe olmamalı, en az biri çevrilmeli
    if (s.indexOf(sep) <= 0) return null;
    var ps = s.split(sep), changed = false;
    for (var i = 0; i < ps.length; i++) { var t = ps[i].trim(), c = t ? core(t, depth + 1) : null; if (c != null) { ps[i] = ps[i].replace(t, c); changed = true; } else if (TRCH.test(ps[i]) || TRW.test(ps[i])) return null; }
    return changed ? ps.join(sep) : null;
  }
  function core(s, depth) { // çevrilmiş metin ya da null
    var x = RTX[s]; if (x != null) return x;
    if (depth > 8 || !/[A-Za-zÇĞİÖŞÜçğıöşü]{2}/.test(s)) return null;
    var pm = /^[,·—:;]\s*/.exec(s); if (pm && s.length > pm[0].length) { var rest = core(s.slice(pm[0].length), depth + 1); return rest != null ? pm[0] + rest : null; } // ", hükmen son"
    var sp = split(s, ' · ', depth); if (sp != null) return sp; // "Kalan 1 taş: 50 · Elde okey bırakma cezası: +10"
    var list = cands(s);
    for (var i = 0; i < list.length; i++) {
      var r = list[i], m = r.re.exec(s); if (!m) continue;
      var vals = {}, runs = [], good = true;
      for (var j = 0; j < r.slots.length && good; j++) {
        var raw = m[j + 1] || '', q = tr1(raw, depth);
        if ((r.g ? q.c == null && (TRCH.test(q.t) || TRW.test(q.t)) : TRW.test(q.w)) || (!r.dot && raw.indexOf(' · ') >= 0)) good = false; // yakalanan parça hâlâ Türkçe cümle ya da başka bir liste öğesini yutuyor: bu kalıp değil
        if (r.slots[j].run) runs.push([r.slots[j].run, q.w]); else vals[r.slots[j].k] = q.w;
      }
      if (!good) continue;
      var out = fill(r.en, null);
      for (var u = 0; u < runs.length; u++) out = out.replace(runs[u][0], '\u0001' + u + '\u0002');
      out = out.replace(/\{(\d+)\}/g, function (z, k) { return vals[k] != null ? vals[k] : z; });
      return out.replace(/\u0001(\d+)\u0002/g, function (z, k) { return runs[+k][1]; });
    }
    return split(s, ', ', depth); // "Ateş 7, Su 3" (kalıplardan sonra: "Kalan 2 taş: Ateş 7, Su 3" bütün olarak eşleşsin)
  }
  var NAMES = [[/\bMisafir (\d{3,5})\b/g, 'Guest $1'], [/\bOyuncu (\d{4})\b/g, 'Player $1']]; // varsayılan oyuncu adları İngilizce cümle içinde de
  function names(s) { for (var i = 0; i < NAMES.length; i++) s = s.replace(NAMES[i][0], NAMES[i][1]); return s; }
  var CACHE = new Map();
  function rt(s) {
    if (s == null) return s; var hit = CACHE.get(s); if (hit !== undefined) return hit === null ? s : hit;
    var c = s.trim(), out = c ? core(c, 0) : null;
    var res = out == null ? null : s.replace(c, out);
    if (/Misafir \d|Oyuncu \d/.test(res == null ? s : res)) { var nm = names(res == null ? s : res); if (nm !== s) res = nm; }
    if (CACHE.size > 4000) CACHE.clear(); CACHE.set(s, res); return res === null ? s : res;
  }
  I.rt = rt;
  var DONE = new WeakMap();
  function skip(el) { return el.nodeType === 1 && (el.getAttribute('translate') === 'no' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEXTAREA' || el.isContentEditable); }
  function doText(n) {
    var v = n.nodeValue; if (!v || DONE.get(n) === v) return;
    var c = v.trim(); if (!c || /^[\d\s.,:/+×−%-]*$/.test(c)) return; // sayı / işaret
    for (var p = n.parentNode; p && p !== document.body; p = p.parentNode) if (p.nodeType === 1 && skip(p)) return;
    var r = rt(v); if (r !== v) { DONE.set(n, r); n.nodeValue = r; }
  }
  var ATTRS = ['title', 'placeholder', 'aria-label'];
  function doAttrs(el) { for (var i = 0; i < ATTRS.length; i++) { var a = el.getAttribute(ATTRS[i]); if (a && a.length > 1) { var r = rt(a); if (r !== a) el.setAttribute(ATTRS[i], r); } } }
  function walkTree(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || skip(root)) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, 5 /* ELEMENT | TEXT */, { acceptNode: function (x) { return x.nodeType === 1 && skip(x) ? 2 /* REJECT */ : 1; } });
    var n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function start() {
    walkTree(document.body);
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) { var m = list[i];
        if (m.type === 'childList') { for (var j = 0; j < m.addedNodes.length; j++) walkTree(m.addedNodes[j]); }
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes' && m.target.nodeType === 1) doAttrs(m.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    try { var t = document.title; var r = rt(t); if (r !== t) document.title = r; } catch (e) {}
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}());

