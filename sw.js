/* Master 365 Service Worker - LOCAL_FIRST + Fresh TXT/Data Sync */
const SW_VERSION = 'master365-sw-v2.7.3';
const SHELL_CACHE = `master365-shell-${SW_VERSION}`;
const DATA_CACHE = `master365-data-${SW_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CLEAR_DATA_CACHE') {
    event.waitUntil(
      caches.delete(DATA_CACHE).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: true });
        }
      })
    );
  }
});

function isDataRequest(url) {
  const path = url.pathname.toLowerCase();
  return (
    path.endsWith('.txt') ||
    path.endsWith('.json') && !path.endsWith('manifest.json') ||
    url.searchParams.has('fresh') ||
    url.searchParams.has('t')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Luồng 1: Học liệu .txt / dữ liệu cập nhật -> ưu tiên lấy bản mới nhất từ GitHub
  if (isDataRequest(url)) {
    event.respondWith(
      fetch(new Request(req, { cache: 'no-store' }))
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response('Offline - chưa có bản dữ liệu lưu đệm.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // Luồng 2: Shell ứng dụng (index.html, manifest.json) -> ưu tiên mạng, dự phòng cache khi offline
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      fetch(new Request(req, { cache: 'no-store' }))
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req) || await caches.match('./index.html');
          return cached || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // Tài nguyên tĩnh khác (icon, font, css/js phụ nếu có)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
