"use client"

import { useEffect, useState } from "react"

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
      .then((stored) => setImages(stored.map(withUrl)))
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

  const add = (files: Iterable<File>) => {
    const added = [...files]
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => withUrl({ id: crypto.randomUUID(), name: f.name || "image.png", blob: f }))
    if (added.length) setImages((list) => [...list, ...added])
    return added.length
  }

  return { images, setImages, add }
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
