"use client"

import { useEffect, useRef } from "react"

// Posts shared into Crosspost from other apps. The service worker (public/sw.js) takes the
// share target's POST, keeps what came in IndexedDB, and opens the app with ?share-target;
// the composer then takes it from here: text into the draft, images into the tray.

export type SharedPost = {
  title: string
  text: string
  url: string
  files: File[]
}

// The same names as in the worker.
const DB = "crosspost-share"
const STORE = "shares"
const KEY = "pending"
/** The query flag the worker opens the app with once a share is stored. */
export const SHARE_FLAG = "share-target"

type Stored = { title?: unknown; text?: unknown; url?: unknown; files?: unknown }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")

/** A stored blob as a file (IndexedDB gives files back as files, but a plain blob needs a name). */
function asFile(value: unknown, n: number): File | null {
  if (!(value instanceof Blob) || !value.type.startsWith("image/")) return null
  if (value instanceof File) return value
  return new File([value], `shared-${n}.${value.type.split("/")[1] ?? "png"}`, { type: value.type })
}

/** Take the shared post the worker stored, if any, clearing it so a reload doesn't bring it back. */
export async function takeSharedPost(): Promise<SharedPost | null> {
  const db = await openDb()
  try {
    const stored = await new Promise<Stored | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      const store = tx.objectStore(STORE)
      const req = store.get(KEY)
      req.onsuccess = () => store.delete(KEY)
      tx.oncomplete = () => resolve(req.result as Stored | undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    if (!stored) return null
    const files = Array.isArray(stored.files)
      ? stored.files.map((f, i) => asFile(f, i + 1)).filter((f): f is File => f !== null)
      : []
    return { title: text(stored.title), text: text(stored.text), url: text(stored.url), files }
  } finally {
    db.close()
  }
}

/**
 * The shared text as one piece for the draft: the title (a page's, when a browser shares
 * one), the text, then the link unless it's already in them. Chrome on Android puts a shared
 * page's address in the text and leaves the url empty, so the link isn't added twice.
 */
export function sharedText({ title, text, url }: SharedPost): string {
  const parts = [title, text].filter((part, i, all) => part && all.indexOf(part) === i)
  if (url && !parts.some((part) => part.includes(url))) parts.push(url)
  return parts.join("\n")
}

/** Hands over a post shared into the app, once, when the page opened to receive one. */
export function useSharedPost(onShare: (post: SharedPost) => void) {
  const handler = useRef(onShare)
  useEffect(() => {
    handler.current = onShare
  })
  useEffect(() => {
    if (!new URLSearchParams(location.search).has(SHARE_FLAG)) return
    // Drop the flag, so a reload doesn't look like a new share.
    history.replaceState(history.state, "", location.pathname + location.hash)
    takeSharedPost()
      .then((post) => post && handler.current(post))
      .catch(() => {
        // Storage blocked: the share is lost, and the app opens as usual.
      })
  }, [])
}
