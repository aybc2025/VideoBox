/* Caches the app itself so it opens with no connection.
   The videos are not here — they live in IndexedDB, added from the tablet. */
const CACHE = "videobox-v3";
const SHELL = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];
const APP = new URL("./index.html", self.location).href;

/* Store a clean copy: some hosts redirect (e.g. /index.html -> /), and
   Chrome refuses to open a page from a cached redirected response. */
async function cacheFresh(cache, url){
  const res = await fetch(url, {cache: "reload"});
  if (!res.ok) throw new Error(url + " " + res.status);
  const body = await res.blob();
  await cache.put(url, new Response(body, {status: 200, headers: res.headers}));
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const f of SHELL) await cacheFresh(c, new URL(f, self.location).href);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* Opening the app (any address inside it): always answer from the cache
     first, so it starts the same with or without a connection. */
  if (req.mode === "navigate" && url.origin === self.location.origin){
    e.respondWith((async () => {
      const hit = await caches.match(APP);
      if (hit) return hit;
      try { return await fetch(req); }
      catch { return new Response("Video Box needs to be opened once with internet first.",
        {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}}); }
    })());
    return;
  }

  e.respondWith(
    caches.match(req, {ignoreSearch: true}).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok && url.origin === self.location.origin){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
