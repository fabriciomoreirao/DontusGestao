/* Only the public offline page is cached. Authenticated pages and API data stay on the network. */
const CACHE = "dontus-public-offline-v1";
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.add("/offline.html")).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("dontus-public-offline-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.mode === "navigate" && new URL(event.request.url).origin === self.location.origin)
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  let url;
  try { url = new URL(event.notification.data?.url || "/", self.location.origin); } catch { url = new URL("/", self.location.origin); }
  if (url.origin !== self.location.origin) url = new URL("/", self.location.origin);
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async windows => {
    const client = windows.find(window => new URL(window.url).origin === self.location.origin);
    if (client) { await client.navigate(url.href); return client.focus(); }
    return self.clients.openWindow(url.href);
  }));
});
