const STATIC_CACHE = "snatchn-static-v2";
const RUNTIME_CACHE = "snatchn-runtime-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.ico", "/apple-touch-icon.png", "/pwa-192x192.png", "/pwa-512x512.png", "/maskable-512x512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put("/", responseClone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("/") || Response.error();
        }),
    );
    return;
  }

  const isStaticAsset =
    ["style", "script", "worker", "image", "font"].includes(request.destination) ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2");

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    }),
  );
});
