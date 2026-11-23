/* Master 365 — Service Worker FINAL V3.4 (Safe Network-First, Zero IndexedDB Interference) */
const APP_SHELL_CACHE = 'master365-shell-v3.4.0';
const CONTENT_CACHE = 'master365-content-v3.4.0';
const VALID_CACHES = [APP_SHELL_CACHE, CONTENT_CACHE];

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      Promise.allSettled(
        CORE_ASSETS.map((url) =>
          fetch(url, { cache: 'no-store' })
            .then((res) => {
              if (res && res.ok && res.status === 200) {
                return cache.put(url, res.clone());
              }
            })
            .catch(() => {})
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !VALID_CACHES.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* Chặn triệt để việc cache tệp lỗi, tệp rỗng hoặc JSON hỏng */
async function isValidResponseToCache(response, urlPathname) {
  if (!response || !response.ok || response.status !== 200) return false;
  if (response.type !== 'basic' && response.type !== 'cors') return false;
  try {
    const text = await response.clone().text();
    if (!text || text.trim().length === 0) return false;
    if (urlPathname.endsWith('.json')) {
      JSON.parse(text);
    }
    return true;
  } catch (_) {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Chỉ xử lý GET cùng nguồn; tuyệt đối không chặn Cloud Sync (Firebase/API ngoài) hay IndexedDB
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1. Điều hướng / Reload / F5: Luôn Network-First để không bao giờ lỗi ERR_FAILED sau khi nạp file
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(async (networkRes) => {
          if (await isValidResponseToCache(networkRes, url.pathname)) {
            const cache = await caches.open(APP_SHELL_CACHE);
            cache.put('./index.html', networkRes.clone());
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match('./index.html');
          return cached || new Response(
            '<!doctype html><meta charset="utf-8"><title>Master 365 Offline</title><body style="font-family:system-ui,sans-serif;padding:24px;background:#f6f8fb;color:#0f172a;"><h2>Master 365 đang ngoại tuyến</h2><p>Chưa có bản đệm ngoại tuyến. Hãy kết nối mạng rồi tải lại trang.</p></body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 2. Học liệu .txt và tệp .json cùng nguồn: Network-First, chỉ cache bản hợp lệ
  if (url.pathname.endsWith('.txt') || url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(async (networkRes) => {
          if (await isValidResponseToCache(networkRes, url.pathname)) {
            const cache = await caches.open(CONTENT_CACHE);
            cache.put(req, networkRes.clone());
          }
          return networkRes;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3. Tài nguyên tĩnh khác: Network-First dự phòng cache
  event.respondWith(
    fetch(req)
      .then(async (networkRes) => {
        if (networkRes && networkRes.ok && networkRes.status === 200) {
          const cache = await caches.open(APP_SHELL_CACHE);
          cache.put(req, networkRes.clone());
        }
        return networkRes;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
