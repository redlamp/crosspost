// Crosspost's service worker. It makes the site installable as an app, opens it when the
// phone is offline, and takes posts shared from other apps (text, a link or images) before
// handing them to the page. A plain file, served as is at <base>/sw.js, so its scope is the
// folder it sits in: / on the dev server, /crosspost/ on GitHub Pages. Registered by
// src/components/app-shell.tsx, in production builds only.

// The page stores its own assets here too, once the worker is ready (src/components/app-shell.tsx).
const CACHE = "crosspost-v1"

// The folder this worker is served from: "/" or "/crosspost/", and its full address, for
// redirects (a Response.redirect wants an absolute URL).
const base = new URL("./", self.location.href).pathname
const home = new URL(base, self.location.href).href
// Where the manifest's share target posts to.
const SHARE_PATH = `${base}share`
// What the page opens to once a share is stored; src/lib/share-target.ts looks for the flag.
const SHARE_FLAG = "share-target"

// The share waits here for the page: IndexedDB is the one store a worker and a page share
// that holds files. Its own database, so the page's image store can change on its own.
const DB = "crosspost-share"
const STORE = "shares"
const KEY = "pending"

self.addEventListener("install", (event) => {
  // The app's page, so it opens offline. Everything else is kept as it's fetched.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(base, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === SHARE_PATH) {
    // A reload of the share address has nothing to receive: just open the app.
    event.respondWith(event.request.method === "POST" ? receiveShare(event.request) : Response.redirect(home, 303))
    return
  }
  if (event.request.method !== "GET") return
  event.respondWith(networkFirst(event))
})

/**
 * The network, with the copy kept from last time when it's unreachable. Network first keeps
 * every visit current (the page and its hashed assets come straight from the host), and the
 * copy only matters offline. The page itself is asked for afresh (no-cache: the host answers
 * 304 when it hasn't changed), never taken from the browser's cache: the host keeps it for ten
 * minutes, and a deploy in that time replaces the hashed assets the kept page names, so a stale
 * page would load against assets that are gone.
 */
async function networkFirst(event) {
  const { request } = event
  const cache = await caches.open(CACHE)
  const url = new URL(request.url)
  // Page loads are kept under the app's own address, whatever the query (?share-target).
  const page = request.mode === "navigate"
  const key = page ? base : request
  // Only the app's page is kept, not a 404 page under its address.
  const keep = !page || url.pathname === base || url.pathname === `${base}index.html`
  try {
    const response = await fetch(page ? new Request(request.url, { cache: "no-cache", credentials: "same-origin" }) : request)
    if (keep && response.ok && response.type === "basic") {
      event.waitUntil(page ? keepPage(cache, key, response.clone()) : cache.put(key, response.clone()))
    }
    return response
  } catch (err) {
    const cached = await cache.match(key)
    if (cached) return cached
    throw err
  }
}

/**
 * Keep the page. When it differs from the copy kept last time, the site was deployed again:
 * the old build's hashed assets are dropped, so they don't pile up, and the new ones are kept
 * as the page fetches them.
 */
async function keepPage(cache, key, response) {
  const fresh = await response.text()
  const old = await cache.match(key)
  if (old && (await old.text()) !== fresh) {
    const assets = (await cache.keys()).filter((req) => new URL(req.url).pathname.startsWith(`${base}_next/`))
    await Promise.all(assets.map((req) => cache.delete(req)))
  }
  await cache.put(key, new Response(fresh, { headers: response.headers }))
}

/** Keep what another app shared, then open the app to take it. */
async function receiveShare(request) {
  try {
    const data = await request.formData()
    const field = (name) => {
      const value = data.get(name)
      return typeof value === "string" ? value : ""
    }
    const files = data.getAll("images").filter((f) => f instanceof File && f.type.startsWith("image/"))
    await store({ title: field("title"), text: field("text"), url: field("url"), files, at: Date.now() })
  } catch {
    // Nothing usable arrived; open the app anyway.
  }
  return Response.redirect(`${home}?${SHARE_FLAG}`, 303)
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function store(share) {
  const db = await openDb()
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(share, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
