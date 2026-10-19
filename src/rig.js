// Döngü rig oynatıcı (K121, v9.95 taslak; v9.97 gerçek Fikret rig'i): parçalı karakter (2D iskelet). rig.json + parça görselleri (480×480 tuval, parçalar kendi yerinde).
// Kemik ağacı: govde → bas; govde → ustkol → onkol → el → prop. Her parça düz DOM'da (z sırası korunur), dönüşümü kemik zincirinden matrisle hesaplanır
// (pivot etrafında döndürme: T(p)·R·T(dx,dy)·T(-p); çocuk = ebeveyn × yerel). Bekleme: nefes + göz kırpma + küçük bakış (koltuk başına faz farkı).
// Klipler: anahtar kareler (kemik başına rot/dx/dy, yüz/el varyantı) + olaylar (ses, efekt, prop bağla/çöz); bitince bekleme pozuna yumuşak dönüş.
// rig.json yoksa hiçbir şey değişmez (eski tek resim yolu).
var Rig = (function () {
  'use strict';
  var CS = 480, DEFS = {}, LOADING = {}, INST = [], raf = null, lastT = 0, PRE = {}, HOOKS = {}; // v10.07: HOOKS.play(inst, klip) / HOOKS.end(inst) — oyun klip başlangıç/bitişine tepki verir (üst koltukta masaya eğilme)
  function fetchDef(char) {
    if (DEFS[char]) return Promise.resolve(DEFS[char]);
    if (LOADING[char]) return LOADING[char];
    LOADING[char] = fetch('assets/rig/' + char + '/rig.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(__L("rig yok")); return r.json(); }).then(function (j) { DEFS[char] = j; return j; }).catch(function (e) { DEFS[char] = null; return null; });
    return LOADING[char];
  }
  function has(char) { return !!DEFS[char]; }
  function preload(src) { if (PRE[src]) return PRE[src]; PRE[src] = new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); return PRE[src]; }
  // ---- matrisler [a,b,c,d,e,f] (CSS matrix) ----
  function mul(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; }
  function local(pivot, rot, dx, dy, sc) { var r = (rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), k = sc || 1, px = pivot[0], py = pivot[1]; // T(p+d)·R·S·T(-p)
    return [c * k, s * k, -s * k, c * k, px + (dx || 0) - (c * k * px - s * k * py), py + (dy || 0) - (s * k * px + c * k * py)]; }
  function apply(m, p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
  var ID = [1, 0, 0, 1, 0, 0];
  function boneName(inst, n) { if (!n || inst.bones[n]) return n; var alt = n.replace('-sol', '-on').replace('-sag', '-arka'); if (inst.bones[alt]) return alt; alt = n.replace('-on', '-sol').replace('-arka', '-sag'); return inst.bones[alt] ? alt : n; } // v9.97: klipler ön görünüm adlarıyla (sol/sag) yazılır; yan görünümde kemikler on/arka (kameraya yakın kol = on = izleyici solu)
  function holdPoint(b) { var vt = b.def.varyant_tutma; return (b.variant && vt && vt[b.variant]) || b.def.tutma || b.pivot; } // v9.97: el pozuna göre tutma noktası (rig.json varyant_tutma)
  // ---- örnek (koltuktaki bir karakter) ----
  function mount(host, char, view, opts) {
    var def = DEFS[char]; if (!def || !def.gorunumler || !def.gorunumler[view]) return null;
    opts = opts || {}; var V = def.gorunumler[view], base = 'assets/rig/' + char + '/';
    var inst = { host: host, char: char, view: view, def: V, bones: {}, order: [], props: {}, pose: {}, idle: { phase: opts.phase || Math.random() * 6.28, blinkAt: 0, gaze: 0, gazeAt: 0 }, clip: null, variants: {}, root: null, reduce: !!opts.reduce, mirror: !!opts.mirror, crop: opts.crop || null, scale: 1, events: opts.events || null }; // crop [x,y,w,h]: tuvalin bir bölgesi host'a sığdırılır (kendi portre: baş+omuz)
    var root = document.createElement('div'); root.className = 'rigroot'; root.style.cssText = __L("position:absolute;left:0;top:0;width:{0}px;height:{1}px;transform-origin:0 0;pointer-events:none", [(CS), (CS)]);
    host.classList.add('rig'); host.appendChild(root); inst.root = root;
    var parts = (V.parcalar || []).slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    var layers = []; // v10.07: parça ve prop görselleri tek z sırasında (prop z'si yoksa en üstte — Fikret'in tepsisi gibi)
    parts.forEach(function (p) {
      var img = document.createElement('img'); img.className = 'rigpart'; img.alt = ''; img.draggable = false; img.style.cssText = __L("position:absolute;left:0;top:0;width:{0}px;height:{1}px;transform-origin:0 0;will-change:transform", [(CS), (CS)]);
      img.src = base + p.dosya; layers.push({ z: p.z || 0, img: img }); preload(base + p.dosya);
      var vr = {}; Object.keys(p.varyant || {}).forEach(function (k) { vr[k] = base + p.varyant[k]; preload(vr[k]); });
      inst.bones[p.ad] = { def: p, img: img, pivot: p.pivot || [CS / 2, CS / 2], parent: p.ebeveyn || null, variants: vr, variant: null, world: ID.slice() };
      inst.pose[p.ad] = { rot: 0, dx: 0, dy: 0, sc: 1 };
    });
    // ebeveynler önce (topolojik sıra)
    var done = {}, order = []; function visit(n) { if (done[n]) return; var b = inst.bones[n]; if (!b) return; if (b.parent) visit(b.parent); done[n] = 1; order.push(n); }
    Object.keys(inst.bones).forEach(visit); inst.order = order;
    (V.proplar || []).forEach(function (pr) { var bw = pr.boyut ? pr.boyut[0] : CS, bh = pr.boyut ? pr.boyut[1] : CS; var img = document.createElement('img'); img.className = 'rigprop'; img.alt = ''; img.draggable = false; img.hidden = true; img.style.cssText = __L("position:absolute;left:0;top:0;width:{0}px;height:{1}px;transform-origin:0 0;will-change:transform", [(bw), (bh)]); img.src = base + pr.dosya; layers.push({ z: pr.z != null ? pr.z : 1000, img: img }); preload(base + pr.dosya); inst.props[pr.ad] = { def: pr, img: img, bone: null, auto: !!(def.varsayilan_prop_gorunur && pr.gorunur !== false && pr.ebeveyn) }; }); // v9.97: prop kendi boyutunda (bardak 64×64); tutma noktası ele hizalanır (compute) · v10.07: varsayılan görünür prop (mühür, örgü, yumak, bıçak) kendi kemiğinde durur
    layers.sort(function (a, b) { return a.z - b.z; }).forEach(function (l) { root.appendChild(l.img); });
    restoreProps(inst);
    fit(inst); INST.push(inst); tick(0, inst); loop(); return inst;
  }
  function fit(inst) { var w = inst.host.clientWidth || CS, h = inst.host.clientHeight || CS, c = inst.crop || [0, 0, CS, CS], s = Math.min(w / c[2], h / c[3]); inst.scale = s; inst.crop0 = [c[0], c[1]]; inst.root.style.transform = 'scale(' + s + ')' + (c[0] || c[1] ? ' translate(' + (-c[0]) + 'px,' + (-c[1]) + 'px)' : '') + (inst.mirror ? ' matrix(-1,0,0,1,' + CS + ',0)' : ''); } // mirror: sol koltuk (yan görsel sola bakar)
  function unmount(inst) { if (!inst) return; var i = INST.indexOf(inst); if (i >= 0) INST.splice(i, 1); if (inst.root && inst.root.parentNode) inst.root.parentNode.removeChild(inst.root); inst.host.classList.remove('rig'); }
  function unmountAll(host) { INST.filter(function (x) { return x.host === host; }).forEach(unmount); }
  // ---- varyant (yüz / el pozu) ----
  function setVariant(inst, bone, name) { var b = inst.bones[boneName(inst, bone)]; if (!b) return; if (Array.isArray(name)) { var pick = null; for (var i = 0; i < name.length; i++) if (b.variants[name[i]]) { pick = name[i]; break; } name = pick; } var src = name && b.variants[name] ? b.variants[name] : ('assets/rig/' + inst.char + '/' + b.def.dosya); if (b.variant === (name || null)) return; b.variant = name || null; b.img.src = src; syncProps(inst); }
  // v10.07: varsayılan proplar — eldeki prop yalnız uygun el pozunda görünür (taş tutan / açık el bıçağı, örgüyü bırakır; Muhtar'ın mührü dinlenme ve "vur" elinde)
  function propAllowed(inst, pr) { var b = pr.bone && inst.bones[pr.bone]; if (!b) return false; if (!b.variant) return true; var ok = (pr.def.el_varyantlari || [pr.def.el_varyanti || 'dinlen']); return !pr.def.el_varyanti && !pr.def.el_varyantlari ? true : ok.indexOf(b.variant) >= 0; }
  function syncProps(inst) { Object.keys(inst.props || {}).forEach(function (k) { var pr = inst.props[k]; if (pr.auto && pr.bone) pr.img.hidden = !propAllowed(inst, pr) || !!(inst.clip && inst.clip.hideProps && inst.clip.hideProps[k]); }); }
  function clipHides(inst, def) { // v10.07: klip propun bağlı olduğu el/ön kol/üst kolu oynatıyorsa (gövde ve baş hariç) varsayılan prop klip boyunca gizli — keepProps: ['muhur'] tutar
    var moved = {}, out = {}; Object.keys(def.kemik || {}).forEach(function (k) { var n = boneName(inst, k); if (n !== 'govde' && n !== 'bas') moved[n] = 1; });
    Object.keys(inst.props || {}).forEach(function (k) { var pr = inst.props[k]; if (!pr.auto || (def.keepProps && def.keepProps.indexOf(k) >= 0)) return; var b = boneName(inst, pr.def.ebeveyn); while (b) { if (moved[b]) { out[k] = 1; break; } b = inst.bones[b] ? inst.bones[b].parent : null; } });
    return out; }
  function hasVariant(inst, bone, name) { var b = inst && inst.bones[boneName(inst, bone)]; return !!(b && b.variants[name]); }
  function restoreProps(inst) { Object.keys(inst.props || {}).forEach(function (k) { var pr = inst.props[k]; if (!pr.auto) return; pr.bone = boneName(inst, pr.def.ebeveyn); pr.img.hidden = !propAllowed(inst, pr); }); } // v9.99: ad dizisi → karakterde var olan ilk varyant (ör. ['sik','acik','sunum'])
  // ---- prop ----
  function attach(inst, prop, bone) { var p = inst.props[prop]; if (!p) return; if (bone === undefined && p.def.ebeveyn) bone = p.def.ebeveyn; bone = bone ? boneName(inst, bone) : null; p.bone = bone; p.img.hidden = !bone; } // kemik verilmezse rig.json'daki ebeveyn
  function detach(inst, prop) { var p = inst.props[prop]; if (!p) return; p.bone = null; p.img.hidden = true; }
  // ---- poz hesabı ----
  function compute(inst, t) {
    var idle = inst.idle, breathe = inst.reduce ? 0 : Math.sin(t / 3200 * 6.283 + idle.phase), add = {};
    add.govde = { dy: -1.6 * breathe, sc: 1 + 0.004 * breathe }; add.bas = { rot: idle.gaze + 0.6 * breathe, dy: -0.8 * breathe };
    inst.order.forEach(function (n) {
      var b = inst.bones[n], p = inst.pose[n] || {}, a = add[n] || {}, pm = b.parent && inst.bones[b.parent] ? inst.bones[b.parent].world : ID;
      var m = local(b.pivot, (p.rot || 0) + (a.rot || 0), (p.dx || 0) + (a.dx || 0), (p.dy || 0) + (a.dy || 0), (p.sc || 1) * (a.sc || 1));
      b.world = mul(pm, m); b.img.style.transform = 'matrix(' + b.world.map(function (v) { return Math.round(v * 10000) / 10000; }).join(',') + ')';
    });
    Object.keys(inst.props).forEach(function (k) { var pr = inst.props[k]; if (!pr.bone || !inst.bones[pr.bone]) return; var b = inst.bones[pr.bone], bt = holdPoint(b), pt = pr.def.tutma || pr.def.pivot || [0, 0], w = mul(b.world, [1, 0, 0, 1, bt[0] - pt[0], bt[1] - pt[1]]); pr.img.style.transform = 'matrix(' + w.map(function (v) { return Math.round(v * 10000) / 10000; }).join(',') + ')'; }); // prop'un tutma noktası elin tutma noktasına oturur (480 tuvalde yerinde çizilmiş tepsi için ofset 0)
  }
  function tick(t, only) {
    (only ? [only] : INST).forEach(function (inst) {
      var idle = inst.idle;
      if (!inst.reduce) { // göz kırpma 2–6 sn, 120 ms; küçük bakış kayması
        if (!idle.blinkAt) idle.blinkAt = t + 1500 + Math.random() * 4500;
        if (t >= idle.blinkAt && !inst.clip) { setVariant(inst, 'bas', 'kirpma'); idle.blinkAt = t + 2000 + Math.random() * 4000; setTimeout(function () { if (!inst.clip || !inst.clip.holdFace) setVariant(inst, 'bas', inst.face || null); }, 120); }
        if (t >= idle.gazeAt) { idle.gazeTarget = (Math.random() - 0.5) * 3; idle.gazeAt = t + 2500 + Math.random() * 3000; }
        idle.gaze += ((idle.gazeTarget || 0) - idle.gaze) * 0.04;
      }
      if (inst.clip) step(inst, t);
      compute(inst, t);
    });
  }
  function loop() { if (raf) return; var f = function (t) { raf = null; if (!INST.length) return; tick(t); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); }
  // ---- klipler ----
  // klip: { sure: ms, kemik: { ad: [{t: 0..1, rot, dx, dy, sc}] }, olay: [{t, tur: 'varyant'|'prop'|'cb', ...}] } — kareler arası ease-in-out; başlangıç/bitiş 0 pozu (beklemeye kesintisiz döner)
  function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function sample(keys, u) { if (!keys.length) return null; if (u <= keys[0].t) return keys[0]; for (var i = 1; i < keys.length; i++) { if (u <= keys[i].t) { var a = keys[i - 1], b = keys[i], k = ease((u - a.t) / Math.max(1e-6, b.t - a.t)), o = {}; ['rot', 'dx', 'dy', 'sc'].forEach(function (f) { var va = a[f] != null ? a[f] : (f === 'sc' ? 1 : 0), vb = b[f] != null ? b[f] : (f === 'sc' ? 1 : 0); o[f] = va + (vb - va) * k; }); return o; } } return keys[keys.length - 1]; }
  function play(inst, clip, done) {
    if (!inst || !clip) { if (done) done(); return; }
    if (inst.clip) stop(inst);
    var sure = inst.reduce ? Math.min(clip.sure, 400) : clip.sure;
    var def = inst.view === 'yan' && clip.yan ? Object.assign({}, clip, clip.yan) : clip; // v9.97: yan görünüm için klip üstüne yazımı (ör. arka kol gövdenin arkasında kalır, sunum yapmaz)
    inst.clip = { def: def, start: performance.now(), sure: sure, fired: {}, done: done || null, holdFace: false, hideProps: clipHides(inst, def) };
    syncProps(inst); if (HOOKS.play) { try { HOOKS.play(inst, def); } catch (e) {} } loop();
  }
  function step(inst, t) {
    var c = inst.clip, u = Math.min(1, (t - c.start) / c.sure);
    Object.keys(c.def.kemik || {}).forEach(function (k) { var n = boneName(inst, k), s = sample(c.def.kemik[k], u); if (s && inst.pose[n]) { inst.pose[n].rot = s.rot || 0; inst.pose[n].dx = s.dx || 0; inst.pose[n].dy = s.dy || 0; inst.pose[n].sc = s.sc != null ? s.sc : 1; } });
    (c.def.olay || []).forEach(function (ev, i) { if (c.fired[i] || u < ev.t) return; c.fired[i] = 1; fire(inst, ev); });
    if (u >= 1) { var d = c.done; Object.keys(inst.pose).forEach(function (n) { inst.pose[n] = { rot: 0, dx: 0, dy: 0, sc: 1 }; }); inst.clip = null; setVariant(inst, 'bas', inst.face || null); Object.keys(inst.props).forEach(function (k) { if (inst.props[k].bone && !inst.props[k].auto) detach(inst, k); }); restoreProps(inst); if (HOOKS.end) { try { HOOKS.end(inst); } catch (e) {} } if (d) d(); }
  }
  function fire(inst, ev) {
    if (ev.tur === 'varyant') { setVariant(inst, ev.kemik, ev.ad || null); if (ev.kemik === 'bas') inst.clip.holdFace = !!ev.ad; }
    else if (ev.tur === 'prop') { if (ev.kemik) attach(inst, ev.ad, ev.kemik); else detach(inst, ev.ad); }
    else if (ev.tur === 'cb' && inst.events && typeof inst.events[ev.ad] === 'function') { var hb = ev.kemik ? inst.bones[boneName(inst, ev.kemik)] : null, hp = hb ? apply(hb.world, holdPoint(hb)) : null; inst.events[ev.ad](ev, hp); }
  }
  function stop(inst) { if (!inst.clip) return; Object.keys(inst.pose).forEach(function (n) { inst.pose[n] = { rot: 0, dx: 0, dy: 0, sc: 1 }; }); inst.clip = null; setVariant(inst, 'bas', inst.face || null); Object.keys(inst.props).forEach(function (k) { if (inst.props[k].bone && !inst.props[k].auto) detach(inst, k); }); restoreProps(inst); if (HOOKS.end) { try { HOOKS.end(inst); } catch (e) {} } }
  function point(inst, bone, key) { var b = inst.bones[boneName(inst, bone)]; if (!b) return null; var p = key === 'tutma' ? holdPoint(b) : b.pivot; var w = apply(b.world, p); var x = inst.mirror ? CS - w[0] : w[0]; var c0 = inst.crop0 || [0, 0]; return [(x - c0[0]) * inst.scale, (w[1] - c0[1]) * inst.scale]; } // host içindeki piksel konumu (ölçekli)
  // ---- hazır klipler ----
  var CLIPS = {
    selam: { sure: 900, kemik: { bas: [{ t: 0 }, { t: 0.4, rot: 6, dy: 3 }, { t: 0.7, rot: 6, dy: 3 }, { t: 1 }] }, olay: [{ t: 0.3, tur: 'varyant', kemik: 'bas', ad: 'gulumse' }, { t: 0.95, tur: 'varyant', kemik: 'bas', ad: null }] },
    tepki: { sure: 700, kemik: { bas: [{ t: 0 }, { t: 0.25, rot: -8, dy: -6 }, { t: 0.6, rot: -6, dy: -4 }, { t: 1 }], govde: [{ t: 0 }, { t: 0.3, dy: -4 }, { t: 1 }] }, olay: [{ t: 0.1, tur: 'varyant', kemik: 'bas', ad: 'sasir' }, { t: 0.9, tur: 'varyant', kemik: 'bas', ad: null }] },
    cay_servisi: { sure: 2600,
      kemik: { 'ustkol-sol': [{ t: 0 }, { t: 0.25, rot: 10 }, { t: 0.7, rot: 12 }, { t: 1 }], 'onkol-sol': [{ t: 0 }, { t: 0.25, rot: -70 }, { t: 0.7, rot: -75 }, { t: 1 }], 'el-sol': [{ t: 0 }, { t: 0.25, rot: 60 }, { t: 0.7, rot: 63 }, { t: 1 }],
        'ustkol-sag': [{ t: 0 }, { t: 0.3 }, { t: 0.45, rot: -10 }, { t: 0.8, rot: -10 }, { t: 1 }], 'onkol-sag': [{ t: 0 }, { t: 0.3 }, { t: 0.45, rot: 55 }, { t: 0.8, rot: 55 }, { t: 1 }], 'el-sag': [{ t: 0 }, { t: 0.3 }, { t: 0.45, rot: -35 }, { t: 0.8, rot: -35 }, { t: 1 }],
        bas: [{ t: 0 }, { t: 0.4, rot: 4, dy: 2 }, { t: 0.8, rot: 4 }, { t: 1 }], govde: [{ t: 0 }, { t: 0.3, dy: -3 }, { t: 0.8, dy: -3 }, { t: 1 }] },
      olay: [{ t: 0.02, tur: 'varyant', kemik: 'el-sol', ad: 'tepsi' }, { t: 0.02, tur: 'prop', ad: 'tepsi', kemik: 'el-sol' }, { t: 0.4, tur: 'varyant', kemik: 'el-sag', ad: 'sunum' }, { t: 0.42, tur: 'varyant', kemik: 'bas', ad: 'gulumse' }, { t: 0.45, tur: 'cb', ad: 'servis', kemik: 'el-sol' }, { t: 0.9, tur: 'varyant', kemik: 'el-sag', ad: null }, { t: 0.93, tur: 'varyant', kemik: 'el-sol', ad: null }, { t: 0.93, tur: 'prop', ad: 'tepsi' }, { t: 0.95, tur: 'varyant', kemik: 'bas', ad: null }] } // v9.97: gerçek parçalarla ayarlandı — tepsi düz kalır (bilek karşı dönüşü: 10−70+60=0), sol kol öne-yukarı, sağ el "buyrun"
  };
  CLIPS.tos = { sure: 760, kemik: { bas: [{ t: 0 }, { t: 0.28, rot: -3, dy: -8, sc: 0.97 }, { t: 0.48, rot: 3, dy: 12, sc: 1.06 }, { t: 0.7, rot: 2, dy: 9, sc: 1.04 }, { t: 1 }], govde: [{ t: 0 }, { t: 0.28, dy: -3 }, { t: 0.48, dy: 5 }, { t: 0.7, dy: 4 }, { t: 1 }] }, olay: [{ t: 0.05, tur: 'varyant', kemik: 'bas', ad: 'tos' }, { t: 0.92, tur: 'varyant', kemik: 'bas', ad: null }],
    yan: { kemik: { bas: [{ t: 0 }, { t: 0.28, rot: 10, dy: -5 }, { t: 0.48, rot: -18, dy: 8 }, { t: 0.7, rot: -15, dy: 6 }, { t: 1 }], govde: [{ t: 0 }, { t: 0.28, dy: -3 }, { t: 0.48, dy: 5 }, { t: 0.7, dy: 4 }, { t: 1 }] } } }; // v9.98: Tos — önden: baş geri çekilir, öne-aşağı vurulur (kameraya yaklaşır); yandan: burun aşağı (eksi dönüş); 'tos' yüzü varsa, yoksa nötr
  // v9.99 (K130): Masa Girişi skinleri rig'li karakterde — kol/bilek/baş hareketi (DOM taş/iz/halka efektleri app.js'te el noktasına bağlı). Yan görünümde sağ kol yerine ön kol (sol→on) kullanılır.
  CLIPS.intro_tersten_el = { sure: 1200, kemik: { 'onkol-sag': [{ t: 0 }, { t: 0.2, rot: -45 }, { t: 0.45, rot: -50 }, { t: 0.65, rot: -12 }, { t: 0.8, rot: -8 }, { t: 1 }], 'el-sag': [{ t: 0 }, { t: 0.2, rot: -25 }, { t: 0.45, rot: 35 }, { t: 0.62, rot: 30 }, { t: 0.8, rot: 0 }, { t: 1 }], bas: [{ t: 0 }, { t: 0.7 }, { t: 0.8, rot: 5, dy: 3 }, { t: 0.9, rot: 5, dy: 3 }, { t: 1 }] },
    olay: [{ t: 0.03, tur: 'varyant', kemik: 'el-sag', ad: 'tut' }, { t: 0.72, tur: 'varyant', kemik: 'bas', ad: 'gulumse' }, { t: 0.8, tur: 'varyant', kemik: 'el-sag', ad: null }, { t: 0.96, tur: 'varyant', kemik: 'bas', ad: null }] };
  CLIPS.intro_ince_ayar = { sure: 1400, kemik: { govde: [{ t: 0 }, { t: 0.25, dy: 6 }, { t: 0.8, dy: 6 }, { t: 1 }], bas: [{ t: 0 }, { t: 0.25, rot: 6, dy: 4 }, { t: 0.76, rot: 6, dy: 4 }, { t: 0.86, rot: -3 }, { t: 1 }], 'onkol-sag': [{ t: 0 }, { t: 0.22, rot: -25 }, { t: 0.3, rot: -14 }, { t: 0.4, rot: -28 }, { t: 0.55, rot: -14 }, { t: 0.65, rot: -28 }, { t: 0.9, rot: 0 }, { t: 1 }] },
    olay: [{ t: 0.78, tur: 'varyant', kemik: 'bas', ad: 'gulumse' }, { t: 0.97, tur: 'varyant', kemik: 'bas', ad: null }] };
  CLIPS.intro_gosterissiz_numara = { sure: 1000, kemik: { 'onkol-sag': [{ t: 0 }, { t: 0.3, rot: -15 }, { t: 0.45, rot: -48 }, { t: 0.7, rot: -42 }, { t: 1 }], 'el-sag': [{ t: 0 }, { t: 0.45, rot: -15 }, { t: 0.6, rot: 10 }, { t: 1 }], bas: [{ t: 0 }, { t: 0.5, rot: -3 }, { t: 1 }] },
    olay: [{ t: 0.02, tur: 'varyant', kemik: 'el-sag', ad: 'tut' }, { t: 0.4, tur: 'varyant', kemik: 'el-sag', ad: ['sik', 'acik', 'sunum'] }, { t: 0.5, tur: 'varyant', kemik: 'bas', ad: ['gozkirp', 'gulumse'] }, { t: 0.9, tur: 'varyant', kemik: 'el-sag', ad: null }, { t: 0.96, tur: 'varyant', kemik: 'bas', ad: null }] };
  CLIPS.intro_ortayi_kokla = { sure: 1600, kemik: { govde: [{ t: 0 }, { t: 0.28, dy: 8 }, { t: 0.72, dy: 8 }, { t: 1 }], bas: [{ t: 0 }, { t: 0.28, rot: 8, dy: 6 }, { t: 0.4, rot: 8, dy: 6 }, { t: 0.55, rot: 12, dy: 4 }, { t: 0.72, rot: 10, dy: 4 }, { t: 1 }], 'ustkol-sag': [{ t: 0 }, { t: 0.28, rot: -10 }, { t: 0.72, rot: -10 }, { t: 1 }], 'onkol-sag': [{ t: 0 }, { t: 0.28, rot: -55 }, { t: 0.6, rot: -55 }, { t: 0.78, rot: -20 }, { t: 1 }] },
    olay: [{ t: 0.45, tur: 'varyant', kemik: 'bas', ad: ['kokla', 'sasir'] }, { t: 0.62, tur: 'varyant', kemik: 'el-sag', ad: 'tut' }, { t: 0.7, tur: 'varyant', kemik: 'bas', ad: 'gulumse' }, { t: 0.95, tur: 'varyant', kemik: 'el-sag', ad: null }, { t: 0.97, tur: 'varyant', kemik: 'bas', ad: null }] };
  // v10.07 (üretim 07): karaktere özgü aksiyon klipleri — Muhtar mührü basar (el 'vur'), Pamuk patiyle dokunur ('pati'), Nine elini kulağına götürür ('kulak' + 'dedikodu' yüzü);
  // genel: ikram (tepsisi olmayan karakterde Çay Servisi), yoklama (kulak eli yoksa baş eğilir), nazar, zafer. Açılar oyunun eklem sınırları içinde (üst kol ≤ ±25°, ön kol ≤ ±40°; kulak ayrı ayarlı).
  CLIPS.muhur_vur = { sure: 1150, keepProps: ['muhur'], kemik: { 'ustkol-sol': [{ t: 0 }, { t: 0.3, rot: 13 }, { t: 0.42, rot: -2 }, { t: 0.7, rot: -2 }, { t: 1 }], 'onkol-sol': [{ t: 0 }, { t: 0.3, rot: -40 }, { t: 0.42, rot: 5 }, { t: 0.5, rot: 2 }, { t: 0.7, rot: 2 }, { t: 1 }], 'el-sol': [{ t: 0 }, { t: 0.3, rot: 22 }, { t: 0.42, rot: -5 }, { t: 0.7, rot: -3 }, { t: 1 }],
      bas: [{ t: 0 }, { t: 0.3, rot: -3, dy: -2 }, { t: 0.45, rot: 2, dy: 3 }, { t: 0.75, rot: 1 }, { t: 1 }], govde: [{ t: 0 }, { t: 0.42, dy: 3 }, { t: 0.6, dy: 2 }, { t: 1 }] },
    olay: [{ t: 0.03, tur: 'varyant', kemik: 'el-sol', ad: 'vur' }, { t: 0.05, tur: 'varyant', kemik: 'bas', ad: 'ciddi' }, { t: 0.42, tur: 'cb', ad: 'muhur', kemik: 'el-sol' }, { t: 0.78, tur: 'varyant', kemik: 'bas', ad: 'gulumse' }, { t: 0.92, tur: 'varyant', kemik: 'el-sol', ad: null }, { t: 0.97, tur: 'varyant', kemik: 'bas', ad: null }] };
  CLIPS.pati = { sure: 850, kemik: { 'ustkol-sag': [{ t: 0 }, { t: 0.3, rot: -6 }, { t: 0.48, rot: 2 }, { t: 1 }], 'onkol-sag': [{ t: 0 }, { t: 0.3, rot: 38 }, { t: 0.48, rot: -6 }, { t: 0.65, rot: -3 }, { t: 1 }], 'el-sag': [{ t: 0 }, { t: 0.3, rot: -22 }, { t: 0.48, rot: 8 }, { t: 0.65, rot: 4 }, { t: 1 }], bas: [{ t: 0 }, { t: 0.4, rot: 5, dy: 2 }, { t: 1 }] },
    olay: [{ t: 0.03, tur: 'varyant', kemik: 'el-sag', ad: 'pati' }, { t: 0.1, tur: 'varyant', kemik: 'bas', ad: ['mirnav', 'gulumse'] }, { t: 0.85, tur: 'varyant', kemik: 'el-sag', ad: null }, { t: 0.92, tur: 'varyant', kemik: 'bas', ad: null }] };
  CLIPS.yoklama_kulak = { sure: 1900, kemik: { 'ustkol-sag': [{ t: 0 }, { t: 0.25, rot: -8 }, { t: 0.8, rot: -8 }, { t: 1 }], 'onkol-sag': [{ t: 0 }, { t: 0.25, rot: 78 }, { t: 0.8, rot: 78 }, { t: 1 }], 'el-sag': [{ t: 0 }, { t: 0.25, rot: -38 }, { t: 0.8, rot: -38 }, { t: 1 }], bas: [{ t: 0 }, { t: 0.25, rot: 9, dx: 5 }, { t: 0.8, rot: 9, dx: 5 }, { t: 1 }] },
    olay: [{ t: 0.08, tur: 'varyant', kemik: 'el-sag', ad: 'kulak' }, { t: 0.15, tur: 'varyant', kemik: 'bas', ad: ['dedikodu', 'sasir'] }, { t: 0.88, tur: 'varyant', kemik: 'el-sag', ad: null }, { t: 0.93, tur: 'varyant', kemik: 'bas', ad: null }] };
  CLIPS.yoklama = { sure: 1400, kemik: { bas: [{ t: 0 }, { t: 0.25, rot: 9, dx: 3 }, { t: 0.8, rot: 9, dx: 3 }, { t: 1 }], govde: [{ t: 0 }, { t: 0.25, dx: 2 }, { t: 0.8, dx: 2 }, { t: 1 }] }, olay: [{ t: 0.15, tur: 'varyant', kemik: 'bas', ad: ['dedikodu', 'sasir'] }, { t: 0.9, tur: 'varyant', kemik: 'bas', ad: null }] };
  CLIPS.nazar = { sure: 900, kemik: { bas: [{ t: 0 }, { t: 0.3, rot: -5, dy: -3 }, { t: 0.7, rot: -4 }, { t: 1 }] }, olay: [{ t: 0.05, tur: 'varyant', kemik: 'bas', ad: 'sasir' }, { t: 0.5, tur: 'varyant', kemik: 'bas', ad: 'gulumse' }, { t: 0.92, tur: 'varyant', kemik: 'bas', ad: null }] };
  CLIPS.zafer = { sure: 1500, kemik: { govde: [{ t: 0 }, { t: 0.2, dy: -8 }, { t: 0.35 }, { t: 0.5, dy: -6 }, { t: 0.65 }, { t: 1 }], bas: [{ t: 0 }, { t: 0.2, rot: -6, dy: -4 }, { t: 0.5, rot: 6, dy: -3 }, { t: 0.8 }, { t: 1 }], 'onkol-sag': [{ t: 0 }, { t: 0.25, rot: 30 }, { t: 0.75, rot: 30 }, { t: 1 }] },
    olay: [{ t: 0.05, tur: 'varyant', kemik: 'bas', ad: ['gozkirp', 'gulumse'] }, { t: 0.1, tur: 'varyant', kemik: 'el-sag', ad: 'acik' }, { t: 0.85, tur: 'varyant', kemik: 'el-sag', ad: null }, { t: 0.93, tur: 'varyant', kemik: 'bas', ad: null }] };
  CLIPS.ikram = { sure: 1300, kemik: { 'onkol-sag': [{ t: 0 }, { t: 0.3, rot: 22 }, { t: 0.75, rot: 22 }, { t: 1 }], 'el-sag': [{ t: 0 }, { t: 0.3, rot: -12 }, { t: 0.75, rot: -12 }, { t: 1 }], bas: [{ t: 0 }, { t: 0.3, rot: 4, dy: 2 }, { t: 0.75, rot: 4 }, { t: 1 }] },
    olay: [{ t: 0.08, tur: 'varyant', kemik: 'el-sag', ad: ['acik', 'sunum'] }, { t: 0.2, tur: 'varyant', kemik: 'bas', ad: 'gulumse' }, { t: 0.85, tur: 'varyant', kemik: 'el-sag', ad: null }, { t: 0.93, tur: 'varyant', kemik: 'bas', ad: null }] };
  ['zafer', 'ikram'].forEach(function (n) { var c = CLIPS[n], k = {}; Object.keys(c.kemik).forEach(function (b) { k[b.replace('-sag', '-sol')] = c.kemik[b]; }); c.yan = { kemik: k, olay: c.olay.map(function (ev) { return ev.kemik && ev.kemik.indexOf('-sag') > 0 ? Object.assign({}, ev, { kemik: ev.kemik.replace('-sag', '-sol') }) : ev; }) }; }); // yan: yakın kol (sol→on). pati / kulak eli yan görünümde arka koldadır (Nine, Pamuk: arka ön kol gövdenin önünde) → o klipler eşlenmez
  ['intro_tersten_el', 'intro_ince_ayar', 'intro_gosterissiz_numara', 'intro_ortayi_kokla'].forEach(function (n) { var c = CLIPS[n], k = {}; Object.keys(c.kemik).forEach(function (b) { k[b.replace('-sag', '-sol')] = c.kemik[b]; }); c.yan = { kemik: k, olay: c.olay.map(function (ev) { return ev.kemik === 'el-sag' ? Object.assign({}, ev, { kemik: 'el-sol' }) : ev; }) }; }); // yan: ön kol (sol→on); sağ elin tut/acik varyantları ön elde yoksa varsayılan el kalır
  (function () { var c = CLIPS.cay_servisi, k = {}; Object.keys(c.kemik).forEach(function (n) { if (n.indexOf('-sag') < 0) k[n] = c.kemik[n]; }); c.yan = { kemik: k, olay: c.olay.filter(function (ev) { return ev.kemik !== 'el-sag'; }) }; })(); // yan: arka kol (sag→arka) gövdenin arkasında; sunum eli görünmez, o yüzden yalnız tepsi kolu + baş
  function refit() { INST.forEach(fit); }
  if (typeof window !== 'undefined') window.addEventListener('resize', refit);
  return { hooks: HOOKS, load: fetchDef, has: has, hasVariant: hasVariant, mount: mount, unmount: unmount, unmountAll: unmountAll, play: play, stop: stop, attach: attach, detach: detach, setVariant: setVariant, point: point, CLIPS: CLIPS, instances: function () { return INST.slice(); }, _m: { mul: mul, local: local, apply: apply, sample: sample, boneName: boneName } };
})();

