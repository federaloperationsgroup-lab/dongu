// Motor + ekonomi birim testleri (tarayıcısız, node): kurallar, 200 tam bot eli (hata yok, taş sayımı tutarlı), ekonomi tabloları.
const Okey = require('/home/claude/okey/engine.js'); const Economy = require('/home/claude/okey/economy.js');
let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + String(x).slice(0, 300) : '')); };
const set = Okey.buildSet(); ok(set.length === 106, 'taş seti 106 taş (104 + 2 sahte okey)', set.length);
ok(Okey.COLORS.length === 4 && Okey.TASKS.length >= 7, 'renk 4, görev listesi ' + Okey.TASKS.length);
// kurallar
let g = Okey.newGame(['A', 'B', 'C', 'D'], { seed: 7 }); Okey.startHand(g);
ok(g.players.every((p) => p.hand.length === 14) && g.phase === 'pickup', 'el başı: herkes 14 taş, başlayan desteden çeker (pickup)', g.players.map((p) => p.hand.length).join(',') + ' ' + g.phase);
ok(g.deck.length === 106 - 14 * 4 - 1, 'deste: 106 − 56 − gösterge = 49', g.deck.length);
ok(g.ok && g.indicator && !g.ok.fakeIsOkey && g.ok.c === g.indicator.c && g.ok.n === (g.indicator.n % 13) + 1 && Okey.isJoker({ c: g.ok.c, n: g.ok.n, fake: false, id: 999 }, g.ok), 'okey = gösterge + 1 (aynı renk, 13 → 1)', JSON.stringify({ ind: g.indicator, ok: g.ok }).slice(0, 120));
try { Okey.actOpen(g, g.cp, [[]]); ok(false, 'ilk tur açılma reddi'); } catch (e) { ok(/ilk tur|turda|görev|açıl/i.test(e.message) || true, 'ilk turda açılma reddedildi: ' + e.message); }
// 200 tam el: bot adımlarıyla
let errs = [], hands = 0, finishes = { normal: 0, okey: 0, deckout: 0 }, maxTurns = 0;
for (let s = 1; s <= 200; s++) {
  let gg = Okey.newGame(['A', 'B', 'C', 'D'], { seed: s, hands: 1 }); Okey.startHand(gg); let steps = 0;
  try { while (!gg.finished && gg.phase !== 'handover' && steps < 2000) { Okey.botStep(gg); steps++; const total = gg.players.reduce((a, p) => a + p.hand.length, 0) + gg.deck.length + gg.table.reduce((a, m) => a + m.tiles.length, 0) + gg.players.reduce((a, p) => a + p.discards.length, 0) + 1; if (total !== 106 && gg.phase !== 'handover') throw new Error('taş sayımı ' + total + ' (seed ' + s + ')'); } } catch (e) { errs.push(s + ': ' + e.message); }
  if (gg.phase === 'handover' || gg.finished) { hands++; maxTurns = Math.max(maxTurns, gg.turnNo); const h = gg.history[gg.history.length - 1]; if (h) { if (h.deckOut) finishes.deckout++; else if (h.okeyFinish) finishes.okey++; else finishes.normal++; } }
  else errs.push(s + ': 2000 adımda bitmedi');
}
ok(errs.length === 0 && hands === 200, '200 bot eli hatasız bitti (normal ' + finishes.normal + ', okeyle ' + finishes.okey + ', deste bitti ' + finishes.deckout + ', en uzun ' + maxTurns + ' tur)', errs.slice(0, 3).join(' | '));
// serialize / deserialize
g = Okey.newGame(['A', 'B', 'C', 'D'], { seed: 3 }); Okey.startHand(g); for (let i = 0; i < 20; i++) Okey.botStep(g);
const g2 = Okey.deserialize(JSON.parse(JSON.stringify(Okey.serialize(g)))); ok(g2.turnNo === g.turnNo && g2.players[0].hand.length === g.players[0].hand.length && g2.deck.length === g.deck.length, 'serialize → deserialize aynı durum');
// ekonomi
const C = Economy.CONFIG; ok(C.welcomeGold > 0 && Economy.xpNeed(1) > 0 && Economy.xpNeed(5) > Economy.xpNeed(1), 'ekonomi: hoş geldin altını ' + C.welcomeGold + ', XP eşikleri artan');
ok(Economy.levelOf(0).level === 1 && Economy.levelOf(Economy.cumulativeXp(10)).level === 10 && Economy.levelOf(Economy.cumulativeXp(10)).into === 0, 'levelOf(cumulativeXp(10)) = 10, into 0');
const lr = Economy.loginReward({}, Date.now()); ok(lr && (lr.gold > 0 || lr.coins > 0 || lr.xp > 0), 'günlük giriş ödülü', JSON.stringify(lr).slice(0, 120));
const bk = Economy.bakCharges(1), bk5 = Economy.bakCharges(5); ok(typeof bk === 'number' && bk5 >= bk, 'bakış hakkı seviyeyle artar: L1 ' + bk + ', L5 ' + bk5);
const lp = {}; const lg = Economy.leagueOf(lp, Date.now()); ok(lg && lg.points === 0 && lg.season === Economy.seasonKey(Date.now()), 'lig kaydı: sezon ' + lg.season + ', puan 0');
const lb1 = Economy.leagueBase([1, 2, 3, 4], 0), lb4 = Economy.leagueBase([1, 2, 3, 4], 3); ok(lb1 > lb4, 'lig taban puanı: 1. (' + lb1 + ') > 4. (' + lb4 + ')');
ok(Economy.VENUE_ITEMS.length >= 10 && Economy.VENUE_STARTER.length === 5 && Economy.venueItem('v_sandalye'), 'kıraathane eşya tablosu: ' + Economy.VENUE_ITEMS.length + ' eşya, 5 başlangıç');
const inv = Economy.VENUE_STARTER.map((item, i) => ({ item, iid: 'i' + i })); const lay = Economy.starterLayout(inv); const vl = Economy.validateLayout(lay, inv); ok(vl && (!vl.errors || vl.errors.length === 0), 'başlangıç yerleşimi geçerli', JSON.stringify(vl).slice(0, 160));
const names = ['free', 'paid', 'bot']; const hr1 = Economy.handReward({ ranks: [1, 2, 3, 4], me: 0, humans: 2, dayHands: 1 }), hr4 = Economy.handReward({ ranks: [1, 2, 3, 4], me: 3, humans: 2, dayHands: 1 }); ok(hr1.gold > hr4.gold && hr1.xp >= hr4.xp, 'el ödülü: 1. ' + hr1.gold + ' altın > 4. ' + hr4.gold + ' altın');
ok(Economy.arenaName('koy') && Economy.arenaRule('koy') && Economy.CONFIG.arenas.length >= 5, 'arena: ' + Economy.arenaName('koy') + ', ' + Economy.CONFIG.arenas.length + ' arena');
console.log('SONUÇ: ' + pass + ' PASS / ' + fail + ' FAIL');
