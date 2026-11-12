/* =========================================================
   Service worker – ļauj lietotni pievienot sākuma ekrānam
   un atvērt arī bez interneta (rāda pēdējo saglabāto versiju).
   Princips: vispirms mēģina internetu, ja nav – ņem no atmiņas.
   ========================================================= */
const CACHE = "pasakumi-v2";
const FILES = [
  "./", "index.html", "css/style.css", "js/app.js", "js/demo-events.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
