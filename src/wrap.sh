#!/bin/sh
# Dosya modu test sayfası: web/test.html = web/index.html (sunucusuz; file:// ile Playwright)
cd "$(dirname "$0")"; cp web/index.html web/test.html; echo "web/test.html hazır"
