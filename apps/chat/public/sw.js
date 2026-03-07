// sw.js — service worker for chat.prim.sh
const CACHE_NAME = "prim-chat-v1";
const SHELL_ASSETS = ["/", "/index.html", "/style.css", "/app.js"];

// Install: cache app shell
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

// Activate: purge old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for shell
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API calls: network only (SSE streams can't be cached)
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // App shell: stale-while-revalidate
  e.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fetched = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
