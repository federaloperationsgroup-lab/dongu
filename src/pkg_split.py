# Paketi ~5 MB'lık zip parçalarına böler (v9.76): sohbetten indirme 16–19 MB dosyalarda takılıyordu.
# public.zip, public-2.zip … (public/, kıraathane görselleri hariç) ve assets.zip, assets-2.zip … (public/assets/k).
# Her parçanın zip açıklaması "dongu-paket <sürüm> …" ile başlar; public.zip'in açıklaması bütün parça listesini taşır.
# Sunucu (server.js unzipPublic) yalnız listedeki, aynı sürümden parçaları açar; eksik/eski parçayı log'a ve /durum'a yazar.
# Görseller olduğu gibi kalır (yeniden sıkıştırma yok); zip yalnız taşıyıcı.
import os, re, subprocess, sys

TARGET = int(os.environ.get('PART_MB', '5')) * 1000 * 1000  # parça hedefi (bayt, sıkıştırılmamış toplam; webp zaten sıkışık)
ROOT = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(ROOT, 'server')
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, "pkg")

ver = re.search(r"Sürüm: (v\d+(?:\.\d+)*)\.", open(os.path.join(SERVER, 'server.js'), encoding='utf-8').read()).group(1)

def files_under(rel, exclude=None):
    out = []
    for d, _, fs in os.walk(os.path.join(SERVER, rel)):
        for f in fs:
            p = os.path.relpath(os.path.join(d, f), SERVER)
            if exclude and p.startswith(exclude):
                continue
            out.append(p)
    return out

def pack(files, prefix):
    # kök dosyalar (index.html, sw.js, manifest, catalog) ilk parçada; sonra yola göre sıralı, hedef boyuta kadar doldur
    root_first = sorted(files, key=lambda p: (p.count('/') > 1, p))
    parts, cur, size = [], [], 0
    for p in root_first:
        s = os.path.getsize(os.path.join(SERVER, p))
        if cur and size + s > TARGET:
            parts.append(cur); cur, size = [], 0
        cur.append(p); size += s
    if cur:
        parts.append(cur)
    names = [prefix + '.zip' if i == 0 else '%s-%d.zip' % (prefix, i + 1) for i in range(len(parts))]
    return list(zip(names, parts))

pub = pack(files_under('public', exclude='public/assets/k/'), 'public')
ast = pack(files_under('public/assets/k'), 'assets')
allparts = pub + ast
listing = ' '.join(n for n, _ in allparts)

for old in os.listdir(OUT):
    if re.match(r'^(public|assets)(-\d+)?\.zip$', old):
        os.remove(os.path.join(OUT, old))

for name, files in allparts:
    zp = os.path.join(OUT, name)
    subprocess.run(['zip', '-q', zp, '-@'], input='\n'.join(files).encode('utf-8'), cwd=SERVER, check=True)
    comment = ('dongu-paket %s parcalar: %s' % (ver, listing)) if name == 'public.zip' else ('dongu-paket %s parca %s' % (ver, name))
    subprocess.run(['zip', '-q', '-z', zp], input=comment.encode('utf-8'), cwd=SERVER, check=True)
    print('%-14s %3d dosya  %5.1f MB' % (name, len(files), os.path.getsize(zp) / 1e6))
print('sürüm', ver, '·', len(allparts), 'parça:', listing)
