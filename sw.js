'use strict';

const CACHE_NAME = 'master365-v2026-11';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('master365-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isDataOrHtml =
    url.pathname.endsWith('.txt') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/');

  if (isDataOrHtml) {
    event.respondWith(networkFirstWithValidCache(req));
  } else {
    event.respondWith(cacheFirstFallbackNetwork(req));
  }
});

async function networkFirstWithValidCache(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const freshRes = await fetch(request, { cache: 'no-store' });
    if (freshRes && freshRes.ok) {
      const cloned = freshRes.clone();
      const textCheck = await cloned.text();
      // Chỉ lưu vào cache dự phòng nếu phản hồi không rỗng
      if (textCheck.trim().length > 0) {
        await cache.put(request, freshRes);
      }
      return freshRes;
    }
    const cached = await cache.match(request);
    return cached || freshRes;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('Offline — không có bản cache dự phòng cho tài nguyên này.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirstFallbackNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return fetch(request);
}
