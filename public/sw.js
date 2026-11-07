/* Kavach service worker.
 * Goal: the emergency steps work with no network (a victim may be on a bad
 * connection, or out of data, at the worst moment). Kept deliberately small:
 * - Precache /en/emergency and /hi/emergency plus every /_next/static asset
 *   their HTML references (hashed names are read from the HTML itself).
 * - Navigations: network first; offline -> cached page, else the emergency
 *   page in the visitor's language.
 * - /_next/static/*: cache first (files are content-hashed, so immutable).
 * - Everything else (APIs, Server Actions, RSC) goes straight to the network.
 */
const VERSION = "v1";
const PAGES = `kavach-pages-${VERSION}`;
const ASSETS = `kavach-assets-${VERSION}`;
const OFFLINE_PAGES = ["/en/emergency", "/hi/emergency"];
const EXTRA = ["/manifest.webmanifest", "/icons/icon-192.png", "/icon.svg"];

async function precache() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  for (const path of OFFLINE_PAGES) {
    try {
      const res = await fetch(path, { cache: "no-store", credentials: "omit" });
      if (!res.ok || res.redirected) continue;
      const html = await res.clone().text();
      await pages.put(path, res);
      const urls = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
      await Promise.all(
        urls.map((u) =>
          assets
            .match(u)
            .then((hit) => hit || fetch(u).then((r) => (r.ok ? assets.put(u, r) : undefined))),
        ),
      );
    } catch {
      // offline during install/refresh: keep what we have
    }
  }
  await Promise.all(
    EXTRA.map((u) =>
      fetch(u)
        .then((r) => (r.ok ? assets.put(u, r) : undefined))
        .catch(() => {}),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("kavach-") && k !== PAGES && k !== ASSETS)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "refresh-offline") event.waitUntil(precache());
});

function offlineFallback(pathname) {
  const locale = pathname.startsWith("/hi") ? "hi" : "en";
  return caches
    .open(PAGES)
    .then((c) =>
      c
        .match(pathname)
        .then((hit) => hit || c.match(`/${locale}/emergency`) || c.match("/en/emergency")),
    )
    .then(
      (res) =>
        res ||
        new Response("Offline. Call 1930 if you have lost money.", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(ASSETS).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Keep the offline copies fresh whenever they're visited online.
          if (res.ok && !res.redirected && OFFLINE_PAGES.includes(url.pathname)) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => offlineFallback(url.pathname)),
    );
  }
});
