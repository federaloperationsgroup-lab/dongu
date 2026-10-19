#!/usr/bin/env python3
# v10.01 (K134): yasal sayfalar — docs_tmp/gizlilik-ve-kullanim-kosullari-v1.md'nin A.1–A.4 bölümlerinden web/yasal/{gizlilik,kosullar,hesap-silme}.html üretir.
# Sunucu /gizlilik, /kosullar, /hesap-silme adreslerinde sunar (server.js). Köşeli parantezli yerler (veri sorumlusu vb.) doldurulana kadar sarı görünür.
import re, os, sys, markdown
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'docs_tmp', 'gizlilik-ve-kullanim-kosullari-v1.md')
OUT = os.path.join(ROOT, 'web', 'yasal')
md = open(SRC, encoding='utf-8').read()

def section(title_prefix):
    i = md.index('## ' + title_prefix)
    j = md.find('\n## ', i + 3); k = md.find('\n# ', i + 3)
    ends = [x for x in (j, k) if x > 0]
    body = md[i:min(ends)] if ends else md[i:]
    body = body.split('\n', 1)[1]  # başlığı at
    return body.replace('\n---\n', '\n')

def html_of(text):
    h = markdown.markdown(text, extensions=['tables', 'sane_lists'])
    h = re.sub(r'\[([^\]\n]{2,160})\]', r'<mark title="Bu bilgi metin yürürlüğe girmeden doldurulacak">[\1]</mark>', h)
    return h

CSS = '''*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f4ef;color:#1d1b16}
header{background:#1a2238;color:#f3e9c9;padding:14px 18px}header a{color:#f3e9c9;text-decoration:none}header .t{font-weight:700;font-size:18px}
nav{background:#fff;border-bottom:1px solid #ddd;padding:8px 18px;font-size:14px}nav a{margin-right:14px;color:#1a2238}
main{max-width:860px;margin:0 auto;padding:18px}h1{font-size:22px;margin:18px 0 8px}h2{font-size:17px;margin:22px 0 6px;border-bottom:1px solid #c9c2b2;padding-bottom:3px}
table{border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 12px}th,td{border:1px solid #c9c2b2;padding:5px 7px;vertical-align:top;text-align:left}th{background:#ece7da}
mark{background:#fff0a3;padding:0 3px}code{background:#ece7da;padding:0 3px;font-size:14px}.lang{margin:24px 0 10px;padding:10px 12px;background:#ece7da;border-left:4px solid #1a2238;font-weight:700}
.note{background:#fff;border:1px solid #c9c2b2;padding:10px 12px;font-size:14px;margin:12px 0}footer{padding:16px 18px;font-size:13px;color:#555;text-align:center}
@media (max-width:600px){body{font-size:15px}main{padding:12px}table{font-size:12.5px}}'''

def page(title, lang, body, extra_nav=''):
    return ('<!doctype html><html lang="%s"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Döngü · %s</title><style>%s</style></head><body>'
            '<header><a href="/" class="t">Döngü</a> · %s</header>'
            '<nav><a href="/gizlilik">Gizlilik Politikası / Privacy</a><a href="/kosullar">Kullanım Koşulları / Terms</a><a href="/hesap-silme">Hesap silme / Account deletion</a>%s</nav>'
            '<main>%s</main><footer>Döngü — Americano Okey · <a href="/">oyuna dön / back to game</a></footer></body></html>') % (lang, title, CSS, title, extra_nav, body)

os.makedirs(OUT, exist_ok=True)
NOTE_TR = '<div class="note">Bu sayfa Türkçe ve İngilizce metni birlikte içerir. <a href="#en">English version below</a>.</div>'

priv = NOTE_TR + '<div class="lang" id="tr">Türkçe</div>' + html_of(section('A.1 ')) + '<div class="lang" id="en">English</div>' + html_of(section('A.3 '))
open(os.path.join(OUT, 'gizlilik.html'), 'w', encoding='utf-8').write(page('Gizlilik Politikası · Privacy Policy', 'tr', priv))

terms = NOTE_TR + '<div class="lang" id="tr">Türkçe</div>' + html_of(section('A.2 ')) + '<div class="lang" id="en">English</div>' + html_of(section('A.4 '))
open(os.path.join(OUT, 'kosullar.html'), 'w', encoding='utf-8').write(page('Kullanım Koşulları · Terms of Use', 'tr', terms))

ver = re.search(r'Sürüm (\d+\.\d+) · 18 Ekim 2026', md).group(1)
del_md = '''<div class="lang" id="tr">Türkçe</div>

## Hesabını silme

Döngü hesabını iki yoldan silebilirsin:

1. **Oyun içinden (önerilen):** Oyunu aç → sağ üstteki **?** (Yardım) → **Ayarlar** sekmesi → en altta **Hesap** bölümünde **"Hesabımı sil"** → açıklamayı oku ve **"Evet, hesabımı sil"** ile onayla. Hesabın hemen kapanır; silme en geç 7 gün içinde tamamlanır.
2. **Oyun dışından:** [İLETİŞİM E-POSTASI] adresine **oyuncu kimliğini** yazarak e-posta gönder. Oyuncu kimliğin (p_ ile başlar) oyunda Profil kartında ve Ayarlar → Hesap bölümünde görünür. Hesabın 7 gün içinde silinir ve sana bilgi verilir.

**Ne silinir:** hesap kaydın (ad, karakter, altın, seviye, sahip olduğun ürünler, istatistikler), arkadaşlık ve engel listen, bütün özel mesajların, kıraathanen. Hakkındaki şikâyet kayıtlarında kimliğin anonimleştirilir. Satın alma kayıtları (sipariş numarası, ürün, tutar, zaman) vergi mevzuatı gereği yasal süre boyunca ayrı tutulur; satın alınan sanal öğeler hesapla birlikte silinir ve iade edilmez (yasal iade hakları saklıdır).

**Silmeden önce:** Ayarlar → Hesap → **"Verilerimi indir"** ile hesap verilerini bir dosya olarak alabilirsin. Silme geri alınamaz.

<div class="lang" id="en">English</div>

## Deleting your account

You can delete your Döngü account in two ways:

1. **In the game (recommended):** open the game → **?** (Help) at the top right → **Settings** tab → **Account** section at the bottom → **"Delete my account"** → read the notice and confirm with **"Yes, delete my account"**. The account is closed immediately; deletion completes within 7 days.
2. **Outside the game:** e-mail [CONTACT EMAIL] with your **player ID** (it starts with p_ and is shown on your profile card and under Settings → Account). The account is deleted within 7 days and we confirm by e-mail.

**What is deleted:** your account record (name, character, coins, level, owned items, statistics), friend and block lists, all private messages, your club room. Your identity in reports about you is anonymised. Purchase records (order ID, product, amount, time) are kept separately for the period required by tax law; purchased virtual items are deleted with the account and are not refunded (statutory refund rights remain unaffected).

**Before deleting:** Settings → Account → **"Download my data"** gives you a file with your account data. Deletion cannot be undone.
'''
open(os.path.join(OUT, 'hesap-silme.html'), 'w', encoding='utf-8').write(page('Hesap silme · Account deletion', 'tr', html_of(del_md)))
print('yasal sayfalar: gizlilik.html, kosullar.html, hesap-silme.html (metin sürümü %s)' % ver)
