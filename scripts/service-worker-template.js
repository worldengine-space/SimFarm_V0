// Build replaces this assignment with a content-addressed cache and file list.
const RELEASE = { version: "development", files: [] };
const scope = new URL(self.registration.scope);
const cachePrefix = `simfarm-v0:${scope.pathname}:`;
const cacheName = cachePrefix + RELEASE.version;
const urls = RELEASE.files.map((file) => new URL(file, scope).href);
const knownUrls = new Set(urls);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      const pending = [...urls];
      try {
        // Bound concurrency for mobile connections and large audio resources.
        await Promise.all(
          Array.from({ length: 6 }, async () => {
            while (pending.length) {
              const url = pending.shift();
              const response = await fetch(
                new Request(url, { cache: "reload" }),
              );
              if (!response.ok)
                throw new Error(`Cannot cache ${url}: ${response.status}`);
              await cache.put(url, response);
            }
          }),
        );
      } catch (error) {
        await caches.delete(cacheName);
        throw error;
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(cachePrefix) && name !== cacheName)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname))
    return;
  url.search = "";
  if (request.mode === "navigate") url.href = new URL("index.html", scope).href;
  if (!knownUrls.has(url.href)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(url.href);
      if (!cached) return fetch(request);
      const range = request.headers.get("range");
      if (!range) return cached;
      // Audio elements can ask for a byte range even when the complete WAV is cached.
      const bytes = await cached.arrayBuffer();
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return cached;
      const start = match[1]
        ? Number(match[1])
        : Math.max(0, bytes.byteLength - Number(match[2]));
      const end =
        match[1] && match[2]
          ? Math.min(Number(match[2]), bytes.byteLength - 1)
          : bytes.byteLength - 1;
      if (start > end || start >= bytes.byteLength)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${bytes.byteLength}` },
        });
      const headers = new Headers(cached.headers);
      headers.set("Content-Range", `bytes ${start}-${end}/${bytes.byteLength}`);
      headers.set("Content-Length", String(end - start + 1));
      headers.set("Accept-Ranges", "bytes");
      return new Response(bytes.slice(start, end + 1), {
        status: 206,
        headers,
      });
    })(),
  );
});
