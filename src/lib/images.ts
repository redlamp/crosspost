"use client"

import { useEffect, useRef, useState } from "react"

// Staged images live in this browser's IndexedDB (localStorage can't hold
// files). Nothing is uploaded: the user copies or drags each image into the
// platform's own composer.

/** Part of an image, as fractions of its full width and height (0 to 1). */
export type CropRect = { x: number; y: number; w: number; h: number }

export type StagedImage = {
  id: string
  name: string
  /** The image as it goes out: cropped, if it was. */
  blob: Blob
  /** Object URL for showing and dragging the image. */
  url: string
  /** Alt text the person wrote, to paste into each platform's alt field (the clipboard carries pixels only). */
  alt?: string
  /** The image as it was added, kept once it's cropped so the crop can be changed or undone. */
  original?: Blob
  /** The part of `original` that `blob` shows. */
  crop?: CropRect
}

/** Bluesky's limit for alt text, the tightest of the platforms that take it. */
export const ALT_LIMIT = 2000

/**
 * Most images Compose holds. A single post on Bluesky, X or Mastodon takes 4, so more than that
 * is for platforms that take more, or for spreading across a thread's posts.
 */
export const MAX_IMAGES = 10

type StoredImage = { id: string; name: string; blob: Blob; alt?: string; original?: Blob; crop?: CropRect }

const DB = "crosspost"
const STORE = "images"
const KEY = "staged"

// One connection for the page, opened on first use.
let connection: Promise<IDBDatabase> | null = null

/**
 * Where open Crosspost tabs (and the installed app's window) hear that one of them cleared
 * everything, so they reload from the cleared storage rather than write their own copy back.
 */
const CHANNEL = "crosspost"
const CLEARED = "cleared"

/** Calls `onCleared` when another tab clears everything; returns how to stop listening. */
export function onClearedElsewhere(onCleared: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {}
  const channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (e) => e.data === CLEARED && onCleared()
  return () => channel.close()
}

/** Close and forget the connection, so the database can be deleted. */
async function closeImageDb() {
  const open = connection
  connection = null
  try {
    ;(await open)?.close()
  } catch {
    // It never opened.
  }
}

/**
 * Zero out everything Crosspost keeps in this browser: every `crosspost:` key in localStorage
 * and sessionStorage (the post, its splits, edits and progress, settings, the theme), the image
 * database, a shared post not yet taken, and the offline copy of the site. The site shares its
 * origin with others on the same host, so only Crosspost's own keys go. Other open Crosspost tabs
 * let go of the image database when asked (see openDb) and reload once it's done
 * (onClearedElsewhere), so none writes its copy back. The caller reloads the page after.
 */
export async function clearAllLocalData() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(store)) if (key.startsWith("crosspost:")) store.removeItem(key)
    } catch {
      // Storage blocked: nothing was kept there.
    }
  }
  await closeImageDb()
  // The image store, and a post shared in from another app that hasn't been taken yet.
  for (const name of [DB, "crosspost-share"]) {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = req.onerror = () => resolve()
      // Held open elsewhere (a tab of an older version, say): give it a moment, then carry on;
      // the delete still goes through once it's let go.
      req.onblocked = () => setTimeout(resolve, 1000)
    })
  }
  try {
    for (const key of await caches.keys()) if (key.startsWith("crosspost")) await caches.delete(key)
  } catch {
    // No Cache Storage here (or not allowed).
  }
  try {
    const channel = new BroadcastChannel(CHANNEL)
    channel.postMessage(CLEARED)
    channel.close()
  } catch {
    // No BroadcastChannel: other tabs keep what they have until they're reloaded.
  }
}

function openDb(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => {
      const db = req.result
      // Another tab clearing everything asks to delete the database: let go, so it isn't blocked.
      db.onversionchange = () => {
        db.close()
        connection = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  }).catch((err) => {
    connection = null // Try again next time.
    throw err
  })
  return connection
}

async function load(): Promise<StoredImage[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve((req.result as StoredImage[] | undefined) ?? [])
    req.onerror = () => reject(req.error)
  })
}

async function save(images: StoredImage[]) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put(images, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const withUrl = (img: StoredImage): StagedImage => ({ ...img, url: URL.createObjectURL(img.blob) })

/** The staged images, loaded from and saved to IndexedDB. */
export function useStagedImages() {
  const [images, setImages] = useState<StagedImage[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    load()
      // Images added while this loaded go after the stored ones, not in place of
      // them. Merged by id, so a second load (React's dev double-run) adds nothing.
      .then((stored) =>
        setImages((list) => {
          const fresh = stored.filter((s) => !list.some((img) => img.id === s.id)).map(withUrl)
          const added = list.filter((img) => !stored.some((s) => s.id === img.id))
          const kept = list.filter((img) => stored.some((s) => s.id === img.id))
          return [...kept, ...fresh, ...added].slice(0, MAX_IMAGES)
        }),
      )
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    // Don't overwrite what's stored before it has been read.
    if (!loaded) return
    save(images.map(({ id, name, blob, alt, original, crop }) => ({ id, name, blob, alt, original, crop }))).catch(() => {
      // Storage blocked or full: the images still work until the page closes.
    })
  }, [images, loaded])

  // An object URL keeps its image in memory until revoked. One that leaves the
  // list is revoked a minute later, unless an undo has brought it back.
  const current = useRef(images)
  const previous = useRef(images)
  useEffect(() => {
    current.current = images
    const gone = previous.current.filter((old) => !images.some((img) => img.url === old.url))
    previous.current = images
    if (gone.length === 0) return
    setTimeout(() => {
      for (const old of gone) {
        if (!current.current.some((img) => img.url === old.url)) URL.revokeObjectURL(old.url)
      }
    }, 60_000)
  }, [images])

  /** Stage image files, up to MAX_IMAGES in all. Returns how many were added and how many didn't fit. */
  const add = (files: Iterable<File>) => {
    const candidates = [...files].filter((f) => f.type.startsWith("image/"))
    // Until the stored images load, the count isn't known; the merge above trims any overflow.
    const room = Math.max(0, MAX_IMAGES - images.length)
    const added = candidates
      .slice(0, room)
      .map((f) => withUrl({ id: crypto.randomUUID(), name: f.name || "image.png", blob: f }))
    if (added.length) setImages((list) => [...list, ...added].slice(0, MAX_IMAGES))
    return { added: added.length, skipped: candidates.length - added.length }
  }

  return { images, setImages, add }
}

/**
 * How many images a drag carries: 0 for none, null when the browser doesn't
 * say. Chrome and Firefox list file types mid-drag; Safari doesn't, so any
 * file drag counts there.
 */
function imagesInDrag(data: DataTransfer | null): number | null {
  if (!data?.types.includes("Files")) return 0
  const items = [...data.items]
  if (items.length === 0) return null
  return items.filter((i) => i.kind === "file" && i.type.startsWith("image/")).length
}

export type Point = { x: number; y: number }

/**
 * An image drag over the page: where it came in, or, once it's gone, where it
 * went out, and how many images it carries (null when the browser doesn't say).
 */
export type ImageDrag = { phase: "in" | "out"; count: number | null } & Point

/**
 * Accept images pasted or dropped anywhere on the page, focused field or not
 * (a missed drop would otherwise open the image in place of the app). Reports
 * image drags: "in" with the entry point while one is over the page, then
 * "out" with the exit point briefly after it leaves; null otherwise and after
 * a drop.
 */
export function usePageImageInput(onFiles: (files: File[]) => void): ImageDrag | null {
  const [drag, setDrag] = useState<ImageDrag | null>(null)
  const handler = useRef(onFiles)
  useEffect(() => {
    handler.current = onFiles
  })

  useEffect(() => {
    let last: Point | null = null
    let leaveTimer: ReturnType<typeof setTimeout> | undefined
    let outTimer: ReturnType<typeof setTimeout> | undefined
    const clear = () => {
      clearTimeout(leaveTimer)
      clearTimeout(outTimer)
    }
    const leave = () => {
      clear()
      const exit = last
      if (!exit) return
      setDrag((d) => ({ phase: "out", count: d?.count ?? null, ...exit }))
      last = null
      outTimer = setTimeout(() => setDrag(null), 1200)
    }
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files") || isOwnDrag(e.dataTransfer)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      const count = imagesInDrag(e.dataTransfer)
      if (count === 0) return
      const at = { x: e.clientX, y: e.clientY }
      if (!last) setDrag({ phase: "in", count, ...at })
      last = at
      clear()
      // dragover repeats while a drag stays over the page; when it stops
      // (left the window, or Escape), the drag is over.
      leaveTimer = setTimeout(leave, 400)
    }
    // Leaving the window has no element to go to; react at once rather than
    // waiting out the timer. A dragover right after (moving between
    // elements in some browsers) cancels it.
    const dragleave = (e: DragEvent) => {
      if (e.relatedTarget !== null || !last) return
      clear()
      leaveTimer = setTimeout(leave, 50)
    }
    const drop = (e: DragEvent) => {
      // The page's own images aren't staged again, nor pasted into the text as a link.
      if (isOwnDrag(e.dataTransfer)) return e.preventDefault()
      if (!e.dataTransfer?.types.includes("Files")) return
      e.preventDefault()
      clear()
      last = null
      setDrag(null)
      handler.current([...e.dataTransfer.files])
    }
    // Pasted images are staged; pasted text still lands wherever it's going.
    const paste = (e: ClipboardEvent) => {
      const files = imageFiles(e.clipboardData)
      if (!files.length) return
      e.preventDefault()
      handler.current(files)
    }
    window.addEventListener("dragover", over)
    window.addEventListener("dragleave", dragleave)
    window.addEventListener("drop", drop)
    window.addEventListener("paste", paste)
    return () => {
      clear()
      window.removeEventListener("dragover", over)
      window.removeEventListener("dragleave", dragleave)
      window.removeEventListener("drop", drop)
      window.removeEventListener("paste", paste)
    }
  }, [])

  return drag
}

/** Image files in a paste or drop, if any. */
export function imageFiles(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter((f) => f.type.startsWith("image/"))
}

/**
 * The part of `source` inside `crop`, at full resolution. JPEGs stay JPEG; everything else
 * becomes a PNG, so transparency survives (a GIF loses its animation).
 */
export async function cropImage(source: Blob, crop: CropRect): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  const sx = Math.round(crop.x * bitmap.width)
  const sy = Math.round(crop.y * bitmap.height)
  const sw = Math.max(1, Math.round(crop.w * bitmap.width))
  const sh = Math.max(1, Math.round(crop.h * bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = sw
  canvas.height = sh
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
  bitmap.close()
  const type = source.type === "image/jpeg" ? "image/jpeg" : "image/png"
  return new Promise((resolve, reject) =>
    canvas.toBlob((out) => (out ? resolve(out) : reject(new Error("crop failed"))), type, 0.92),
  )
}

/** The image as a PNG, drawn through a canvas (an animated GIF loses its animation). */
export async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("convert failed"))), "image/png"),
  )
}

/**
 * Put an image on the clipboard, to paste into a composer. Browsers only take
 * PNG there, so other formats are converted (a GIF loses its animation).
 */
export async function copyImage(img: StagedImage) {
  // Passing a promise keeps the click's permission while the PNG is made.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": toPng(img.blob) })])
}

export function downloadImage(img: StagedImage) {
  const a = document.createElement("a")
  a.href = img.url
  a.download = img.name
  a.click()
}

const OWN_PREFIX = "application/x-crosspost-"

/**
 * Drag type for an image dragged from one platform's card, to reorder it or
 * move it between posts there. The type shows mid-drag; the image id only on drop.
 */
export const moveType = (platformId: string) => `${OWN_PREFIX}move-${platformId}`

/** Drag type for an image dragged within the Compose tray, to reorder it. */
export const TRAY_TYPE = `${OWN_PREFIX}tray`

/**
 * Move `id` beside `target` (after it, or before): the ids in their new
 * order. Unchanged when either is missing or they're the same.
 */
export function reorder(ids: string[], id: string, target: string, after: boolean): string[] {
  if (id === target || !ids.includes(id)) return ids
  const rest = ids.filter((x) => x !== id)
  const at = rest.indexOf(target)
  if (at < 0) return ids
  rest.splice(after ? at + 1 : at, 0, id)
  return rest
}

/** The thumbnail under a drag, from `[data-image-id]`, and whether the pointer is on its right half. */
export function dropTarget(e: React.DragEvent): { id: string; after: boolean } | null {
  const thumb = (e.target as Element).closest<HTMLElement>("[data-image-id]")
  if (!thumb?.dataset.imageId) return null
  const box = thumb.getBoundingClientRect()
  return { id: thumb.dataset.imageId, after: e.clientX > box.left + box.width / 2 }
}

/**
 * A drag of one of the page's own staged images. Chrome hands it over as a
 * file too, so without this a drop on the page would stage it again.
 */
export const isOwnDrag = (data: DataTransfer | null) => !!data?.types.some((t) => t.startsWith(OWN_PREFIX))

/**
 * Follows a drag that starts on this page. Call the returned function when it ends: it
 * stops following and says whether the drag had left the page (for another window, or
 * the other side of a split view).
 */
export function followDragOut(): () => boolean {
  let outside = false
  // dragover repeats while the drag is over the page; leaving the window has no element
  // to go to. Some browsers leave relatedTarget out between elements too, but a dragover
  // follows at once there.
  const over = () => {
    outside = false
  }
  const leave = (e: DragEvent) => {
    if (e.relatedTarget === null) outside = true
  }
  window.addEventListener("dragover", over)
  window.addEventListener("dragleave", leave)
  return () => {
    window.removeEventListener("dragover", over)
    window.removeEventListener("dragleave", leave)
    return outside
  }
}

/**
 * Lets the image be dragged out as a file (Chrome saves it on a drop onto the
 * desktop), and within where it came from: the Compose tray, or a platform's card.
 */
export function dragOut(e: React.DragEvent, img: StagedImage, from: "tray" | { platformId: string }) {
  e.dataTransfer.effectAllowed = "copyMove"
  e.dataTransfer.setData("DownloadURL", `${img.blob.type}:${img.name}:${img.url}`)
  e.dataTransfer.setData(from === "tray" ? TRAY_TYPE : moveType(from.platformId), img.id)
}
