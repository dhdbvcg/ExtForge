// Service Worker for 扩展编辑器 PWA
// App-shell strategy: precache the shell, cache-first for static assets,
// network-first for navigations with offline fallback to cached shell.

const CACHE = 'extbuilder-pwa-v1';
const APP_SHELL = ['./'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(APP_SHELL))
            .catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // Navigations: network-first, fall back to cached app shell when offline
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .catch(() => caches.match('./'))
        );
        return;
    }

    // Static assets: cache-first, populate cache at runtime
    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req).then((res) => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(req, copy));
                }
                return res;
            }).catch(() => cached);
        })
    );
});
