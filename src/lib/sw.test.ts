import { readFileSync } from "node:fs"
import vm from "node:vm"

import { describe, expect, it } from "vitest"

// The service worker (public/sw.js) runs in a worker scope the tests don't have, so it's loaded
// into a sandbox with the few globals it touches: a listener registry for `self`, a store that
// stands in for IndexedDB, and Node's own Request, Response, FormData and File.

type Listener = (event: { request: Request; respondWith: (r: Promise<Response> | Response) => void }) => void

function loadWorker(href: string, fetch: (request: Request) => Promise<Response> = () => Promise.reject(new Error("offline"))) {
  const listeners: Record<string, Listener> = {}
  const stored = new Map<string, unknown>()
  // The slice of IndexedDB the worker uses: open, one object store, put in a transaction.
  const request = (result?: unknown) => {
    const req: { result?: unknown; onsuccess?: () => void; onupgradeneeded?: () => void; onerror?: () => void } = { result }
    queueMicrotask(() => {
      req.onupgradeneeded?.()
      req.onsuccess?.()
    })
    return req
  }
  const db = {
    createObjectStore: () => {},
    close: () => {},
    transaction: () => {
      const tx: { oncomplete?: () => void; onerror?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          put: (value: unknown, key: string) => {
            stored.set(key, value)
            queueMicrotask(() => tx.oncomplete?.())
          },
        }),
      }
      return tx
    },
  }
  const self = {
    location: { href, origin: new URL(href).origin },
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  }
  const sandbox = {
    self,
    indexedDB: { open: () => request(db) },
    caches: { open: () => Promise.resolve({ add: () => Promise.resolve(), match: () => Promise.resolve(undefined), put: () => {} }), keys: () => Promise.resolve([]) },
    URL,
    Request,
    Response,
    File,
    FormData,
    Date,
    fetch,
  }
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), sandbox)
  const handle = (request: Request) =>
    new Promise<Response>((resolve) => listeners.fetch({ request, respondWith: (r) => resolve(Promise.resolve(r)) }))
  return { handle, stored }
}

describe("the service worker's share target", () => {
  it("keeps a shared post with its images and opens the app flagged", async () => {
    const { handle, stored } = loadWorker("https://redlamp.github.io/crosspost/sw.js")
    const form = new FormData()
    form.set("title", "A page")
    form.set("text", "Worth a look")
    form.set("url", "https://example.com/a")
    form.append("images", new File(["png"], "one.png", { type: "image/png" }))
    form.append("images", new File(["txt"], "notes.txt", { type: "text/plain" }))
    const response = await handle(new Request("https://redlamp.github.io/crosspost/share", { method: "POST", body: form }))

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://redlamp.github.io/crosspost/?share-target")
    const share = stored.get("pending") as { title: string; text: string; url: string; files: File[] }
    expect(share.title).toBe("A page")
    expect(share.text).toBe("Worth a look")
    expect(share.url).toBe("https://example.com/a")
    // Only images are kept.
    expect(share.files.map((f) => f.name)).toEqual(["one.png"])
  })

  it("opens the app on a reload of the share address", async () => {
    const { handle, stored } = loadWorker("https://redlamp.github.io/crosspost/sw.js")
    const response = await handle(new Request("https://redlamp.github.io/crosspost/share"))
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://redlamp.github.io/crosspost/")
    expect(stored.size).toBe(0)
  })

  it("works at the root too (the dev server, or a custom domain)", async () => {
    const { handle } = loadWorker("http://127.0.0.1:4321/sw.js")
    const form = new FormData()
    form.set("text", "hello")
    const response = await handle(new Request("http://127.0.0.1:4321/share", { method: "POST", body: form }))
    expect(response.headers.get("location")).toBe("http://127.0.0.1:4321/?share-target")
  })
})

describe("the service worker's page loads", () => {
  // A page load is a navigate request, which Node won't build: a plain object stands in.
  const pageLoad = (url: string) => ({ url, method: "GET", mode: "navigate" }) as Request

  it("asks the host for the page afresh, never the browser's kept copy", async () => {
    const seen: Request[] = []
    const { handle } = loadWorker("https://example.test/crosspost/sw.js", async (request) => {
      seen.push(request)
      return new Response("<html>", { status: 200 })
    })
    const response = await handle(pageLoad("https://example.test/crosspost/"))
    expect(response.status).toBe(200)
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe("https://example.test/crosspost/")
    expect(seen[0].cache).toBe("no-cache")
  })

  it("leaves hashed assets to the browser's cache", async () => {
    const seen: Request[] = []
    const { handle } = loadWorker("https://example.test/crosspost/sw.js", async (request) => {
      seen.push(request)
      return new Response("", { status: 200 })
    })
    const asset = new Request("https://example.test/crosspost/_next/static/chunks/abc123.js")
    await handle(asset)
    expect(seen[0]).toBe(asset)
  })
})
