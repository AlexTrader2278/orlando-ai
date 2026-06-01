/* Orlando-AI service worker
 * Стратегия:
 *   - /api/*               → ВСЕГДА network-only, никогда не кешируем
 *                            (данные о машине, поиск, AI-ответы должны быть свежими)
 *   - навигация (HTML)     → network-first, при провале — последний кэш / офлайн-страница
 *   - статика (JS/CSS/img) → stale-while-revalidate (быстро + фоновое обновление)
 */
const VERSION = "v5";
const STATIC_CACHE = `oai-static-${VERSION}`;
const PAGES_CACHE = `oai-pages-${VERSION}`;

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.endsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Чужие домены — не трогаем, идём в сеть
  if (url.origin !== self.location.origin) return;

  // API — всегда сеть. Никакого кеша, никаких устаревших ответов.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Навигация по страницам — network-first
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGES_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/"))),
    );
    return;
  }

  // Статика — stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type !== "opaque") {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
