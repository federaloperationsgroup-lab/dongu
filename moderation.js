// Döngü — ad süzgeci (v10.11, K178): oyuncu ve kıraathane adlarında açık küfür / hakaret / nefret sözü.
// Temkinli: yalnız kesin kökler. Masum sözcüklere takılmamak için ("sık", "sıkıcı", "sıkışık", "kayarak", "Amina", "Niger", "picture") kökler
// tam sözcük ya da sözcük başı olarak aranır; "sik…" ailesi yalnız ASCII i ile yazılmışsa (Türkçe "sık…" masum). Kaçan adlar için yönetim
// sayfasında "Adı sıfırla" ve şikâyet sebebi "Uygunsuz ad" var.
'use strict';
var LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '€': 'e', 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'к': 'k', 'т': 't', 'м': 'm', 'н': 'h', 'ο': 'o', 'α': 'a', 'ι': 'i' }; // rakam ve Kiril/Yunan benzer harfler
var FOLD = { 'ı': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c', 'â': 'a', 'î': 'i', 'û': 'u' };
var NONLETTER = /[^a-zçğıöşüâîû]+/g;
function lower(s) { return String(s || '').toLocaleLowerCase('tr-TR').replace(/[013457@$€аеорсухiктмнοαι]/g, function (c) { return LEET[c] || c; }).replace(/([a-zçğıöşüâîû])\1{2,}/g, '$1'); } // 3+ aynı harf → 1 ("siiik")
function fold(s) { return s.replace(/[ışğüöçâîû]/g, function (c) { return FOLD[c]; }); }
// Türkçe harfiyle (yazıldığı gibi) tam sözcük
var EXACT_RAW = ['sik', 'göt', 'piç', 'oç', 'puşt', 'godoş', 'amk', 'aq'];
// katlanmış (ı→i, ş→s …) tam sözcük — ASCII yazımı masum bir sözcüğe denk gelmeyenler
var EXACT_FOLD = ['amk', 'aq', 'pust', 'godos', 'penis', 'vajina', 'vagina', 'cunt', 'fag', 'slut', 'whore', 'bitch', 'fuck', 'fucker', 'nigger', 'nigga', 'faggot', 'retard', 'rapist'];
// katlanmış sözcük başı
var PREFIX_FOLD = ['orospu', 'orosbu', 'pezevenk', 'yarak', 'yarrak', 'dalyarak', 'amcik', 'ibne', 'ipne', 'kahpe', 'kaltak', 'gavat', 'yavsak', 'surtuk', 'kevase', 'gotveren', 'motherfuck', 'fuck', 'nigger', 'nigga', 'faggot', 'whore', 'bitch', 'cunt', 'pedofil', 'hitler'];
// yazıldığı gibi sözcük başı ("sik…" yalnız ASCII i ile; "piç…" ç ile)
var PREFIX_RAW = ['siktir', 'sikerim', 'sikeyim', 'sikiyim', 'sikim', 'sikis', 'sikiş', 'sikik', 'sikici', 'sikko', 'sikmek', 'sikecem', 'sikicem', 'sıktır', 'sıkerım', 'sıkeyım', 'piç']; // büyük harfle Türkçe klavyede yazılan SIKTIR → sıktır
// bitişik metin (harfler arasına nokta/boşluk konmuş yazım: "o.r.o.s.p.u") — yalnız masum sözcükte geçmeyen uzun kökler
var SQUASH_FOLD = ['orospu', 'orosbu', 'pezevenk', 'yarrak', 'dalyarak', 'aminakoyim', 'aminakoyayim', 'aminakoydum', 'aminakoyarim', 'aminikoyim', 'motherfuck', 'fuck', 'nigger', 'faggot', 'pedofil', 'hitler', 'kevase', 'yavsak', 'gotveren'];
var SQUASH_RAW = ['siktir', 'sikerim', 'sikeyim', 'sikiyim'];
function badName(raw) {
  var lo = lower(raw), toks = lo.split(NONLETTER).filter(Boolean), sqRaw = lo.replace(NONLETTER, ''), sqFold = fold(sqRaw);
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i], f = fold(t), j;
    if (EXACT_RAW.indexOf(t) >= 0 || EXACT_FOLD.indexOf(f) >= 0) return true;
    for (j = 0; j < PREFIX_FOLD.length; j++) if (f.indexOf(PREFIX_FOLD[j]) === 0) return true;
    for (j = 0; j < PREFIX_RAW.length; j++) if (t.indexOf(PREFIX_RAW[j]) === 0) return true;
  }
  for (var k = 0; k < SQUASH_FOLD.length; k++) if (sqFold.indexOf(SQUASH_FOLD[k]) >= 0) return true;
  for (var m = 0; m < SQUASH_RAW.length; m++) if (sqRaw.indexOf(SQUASH_RAW[m]) >= 0) return true;
  return false;
}
module.exports = { badName: badName };
