// Guarda o aplicativo no aparelho para abrir sem internet. Com internet, sempre busca a versão mais nova.
// Também mostra a notificação do cronômetro (quando ele está rodando e o app sai da tela) e trata os botões dela.
const V = 'tt-v4';
const FILES = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'notif-icon.png', 'notif-badge.png', 'act-pause.png', 'act-play.png', 'act-reset.png',
  'fonts/JetBrainsMono-Regular.woff2', 'fonts/JetBrainsMono-Medium.woff2', 'fonts/JetBrainsMono-Bold.woff2', 'fonts/PlusJakartaSans.ttf'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(ch => ch.put(r, c)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('index.html'))));
});

// ---------- notificação do cronômetro ----------
// O app guarda o estado do cronômetro no IndexedDB ("tt-notif"). O que se faz pela notificação entra numa fila de ações ("ops");
// o app aplica a fila quando abre ou volta para a tela.
function tnTx(fn) { // fn(registro) -> { rec, out }; leitura e escrita na mesma transação
  return new Promise((res, rej) => {
    const q = indexedDB.open('tt-notif', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('kv');
    q.onerror = () => rej(q.error);
    q.onsuccess = () => {
      const db = q.result, tx = db.transaction('kv', 'readwrite'), st = tx.objectStore('kv'), g = st.get('timer'); let out;
      g.onsuccess = () => { const r = fn(g.result || null) || {}; if (r.rec) st.put(r.rec, 'timer'); out = r.out; };
      tx.oncomplete = () => { db.close(); res(out); };
      tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); };
    };
  });
}
const p2 = n => String(n).padStart(2, '0');
const clockTxt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s % 3600 / 60)) + ':' + p2(s % 60); };
const hhmm = ms => { const d = new Date(ms); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
function tnState(r) { // estado depois de aplicar a fila de ações sobre a última foto do app
  let run = !!r.s.running, st = r.s.startTs || 0, acc = r.s.acc || 0, reset = false;
  for (const o of r.ops || []) {
    if (o.op === 'pause' && run) { acc += Math.max(0, o.at - st); run = false; }
    else if (o.op === 'play' && !run) { run = true; st = o.at; }
    else if (o.op === 'reset') { run = false; acc = 0; st = 0; reset = true; }
  }
  return { run, st, acc, reset, raw: reset ? 0 : (r.raw || 0) };
}
async function tnClose() { for (const n of await self.registration.getNotifications({ tag: 'tt-timer' })) n.close(); }
async function tnShow(r) {
  if (!r || !r.u) return tnClose();
  const s = tnState(r), base = { tag: 'tt-timer', renotify: false, silent: true, requireInteraction: true, icon: 'notif-icon.png', badge: 'notif-badge.png', data: { tt: 1 } };
  const A = { pause: { action: 'pause', title: '\u275A\u275A', icon: 'act-pause.png' }, play: { action: 'play', title: '\u25B6\uFE0E', icon: 'act-play.png' }, reset: { action: 'reset', title: '\u21BA', icon: 'act-reset.png' } }; // só símbolos, sem texto
  if (s.reset) return tnClose();
  if (s.run) {
    const since = s.st - (r.sk || 0), ms = s.raw + s.acc + Math.max(0, Date.now() + (r.sk || 0) - s.st);
    return self.registration.showNotification(clockTxt(ms), { ...base, body: 'Cronômetro rodando · desde ' + hhmm(since), timestamp: since, actions: [A.pause] });
  }
  return self.registration.showNotification(clockTxt(s.raw + s.acc), { ...base, body: 'Cronômetro pausado', actions: [A.play, A.reset] });
}
async function openApp() {
  const l = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of l) { if ('focus' in c) { try { await c.focus(); return; } catch (e) {} } }
  if (self.clients.openWindow) await self.clients.openWindow('./index.html');
}
self.addEventListener('notificationclick', e => {
  const a = e.action;
  if (!a) { e.notification.close(); e.waitUntil(openApp()); return; } // toque no corpo da notificação: abre o app
  e.waitUntil((async () => {
    const at = Date.now();
    const rec = await tnTx(r => {
      if (!r || !r.u) return {};
      const s = tnState(r), op = a === 'pause' && s.run ? 'pause' : a === 'play' && !s.run ? 'play' : a === 'reset' ? 'reset' : null;
      if (!op) return { out: r };
      const n = { ...r, ops: [...(r.ops || []), { op, at: at + (r.sk || 0) }] }; return { rec: n, out: n };
    });
    if (!rec) { e.notification.close(); return; }
    await tnShow(rec);
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ tt: 'ops' });
  })());
});
self.addEventListener('message', e => {
  if (e.data && e.data.tt === 'show') e.waitUntil(tnTx(r => ({ out: r })).then(r => (r && r.u && tnState(r).run) ? tnShow(r) : null));
});
