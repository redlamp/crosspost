"use client"

import { useEffect, useRef, useState } from "react"

// Staged images live in this browser's IndexedDB (localStorage can't hold
// files). Nothing is uploaded: the user copies or drags each image into the
// platform's own composer.

export type StagedImage = {
  id: string
  name: string
  blob: Blob
  /** Object URL for showing and dragging the image. */
  url: string
}

/** Most images a post can carry: Bluesky and Twitter take 4, so every platform gets the same set. */
export const MAX_IMAGES = 4

type StoredImage = { id: string; name: string; blob: Blob }

const DB = "crosspost"
const STORE = "images"
const KEY = "staged"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
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
      .then((stored) => setImages(stored.slice(0, MAX_IMAGES).map(withUrl)))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    // Don't overwrite what's stored before it has been read.
    if (!loaded) return
    save(images.map(({ id, name, blob }) => ({ id, name, blob }))).catch(() => {
      // Storage blocked or full: the images still work until the page closes.
    })
  }, [images, loaded])

  /** Stage image files, up to MAX_IMAGES in all. Returns how many were added and how many didn't fit. */
  const add = (files: Iterable<File>) => {
    const candidates = [...files].filter((f) => f.type.startsWith("image/"))
    const room = Math.max(0, MAX_IMAGES - images.length)
    const added = candidates
      .slice(0, room)
      .map((f) => withUrl({ id: crypto.randomUUID(), name: f.name || "image.png", blob: f }))
    if (added.length) setImages((list) => [...list, ...added].slice(0, MAX_IMAGES))
    return { added: added.length, skipped: candidates.length - added.length }
  }

  return { images, setImages, add }
}

/** Whether a drag carries image files. Chrome and Firefox show file types mid-drag; if not, any file counts. */
function carriesImages(data: DataTransfer | null) {
  if (!data?.types.includes("Files")) return false
  const items = [...data.items]
  return items.length === 0 || items.some((i) => i.kind === "file" && i.type.startsWith("image/"))
}

export type Point = { x: number; y: number }

/** An image drag over the page: where it came in, or, once it's gone, where it went out. */
export type ImageDrag = { phase: "in" | "out" } & Point

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
      if (!last) return
      setDrag({ phase: "out", ...last })
      last = null
      outTimer = setTimeout(() => setDrag(null), 1200)
    }
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      if (!carriesImages(e.dataTransfer)) return
      const at = { x: e.clientX, y: e.clientY }
      if (!last) setDrag({ phase: "in", ...at })
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

async function toPng(blob: Blob): Promise<Blob> {
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

/** Lets the image be dragged out as a file: Chrome saves it on a drop onto the desktop. */
export function dragOut(e: React.DragEvent, img: StagedImage) {
  e.dataTransfer.effectAllowed = "copy"
  e.dataTransfer.setData("DownloadURL", `${img.blob.type}:${img.name}:${img.url}`)
}
