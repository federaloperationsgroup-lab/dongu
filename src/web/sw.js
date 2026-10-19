// Döngü service worker: yalnızca ağ öncelikli, çevrim dışı yedek yok (oyun sunucu ister). Kurulabilirlik için gerekli.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () {});
