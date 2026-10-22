// Guarda o aplicativo no aparelho para abrir sem internet. Com internet, sempre busca a versão mais nova.
const V = 'tt-v6';
const FILES = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'fonts/JetBrainsMono-Regular.woff2', 'fonts/JetBrainsMono-Medium.woff2', 'fonts/JetBrainsMono-Bold.woff2', 'fonts/PlusJakartaSans.ttf'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(ch => ch.put(r, c)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('index.html'))));
});

// Toque na notificação "TimeTracker em execução": fecha o aviso e abre o app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow ? self.clients.openWindow('./index.html') : null;
  }));
});
