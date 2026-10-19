#!/bin/sh
# İstemci sayfası: app.html içindeki yer tutuculara kaynak dosyalar gömülür → web/index.html (ve index.html)
cd "$(dirname "$0")"
python3 - <<'PY'
html=open('app.html').read(); eng=open('engine.js').read(); app=open('app.js').read()
econ=open('economy.js').read(); ven=open('venue.js').read(); rig=open('rig.js').read(); i18n=open('en.js').read()+'\n'+open('i18n.js').read(); out=html.replace('/*I18N*/',i18n,1).replace('/*ENGINE*/',eng+'\n'+econ,1).replace('/*RIG*/',rig,1).replace('/*APP*/',app,1).replace('/*VENUE*/',ven,1)
open('web/index.html','w').write(out); open('index.html','w').write(out)
print('built',len(out),'bytes')
PY
node -e "new Function(require('fs').readFileSync('engine.js','utf8')); new Function(require('fs').readFileSync('app.js','utf8')); new Function(require('fs').readFileSync('venue.js','utf8')); new Function(require('fs').readFileSync('rig.js','utf8')); console.log('syntax ok')"
