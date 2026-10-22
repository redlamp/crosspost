"use client"

import { toPng, type StagedImage } from "@/lib/images"

// Handing a post to the system share sheet (the Web Share API), so a platform's phone app
// receives the text and all its images in one go: the one route that moves several images at
// once, since the clipboard holds a single item and a drag carries one file. Phones, and
// Chrome, Edge and Safari on desktops, have it; Firefox doesn't. Chromium takes at most 10
// files and 50 MB, refuses HEIC, and shares no files at all in Incognito.

/** The share sheet is there. */
export const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function"

/**
 * Image types the apps take as they are. Anything else goes as PNG: X's own share target lists
 * only these (with video), and a format one app won't take would fail the whole share.
 */
const SHARED_AS_IS = new Set(["image/jpeg", "image/png", "image/gif"])

const pngName = (name: string) => `${name.replace(/\.[^.]*$/, "")}.png`

const asFile = (blob: Blob, name: string) =>
  blob instanceof File && blob.name === name ? blob : new File([blob], name, { type: blob.type })

/**
 * Staged images as the files the share sheet takes: JPEG, PNG and GIF as they are, the rest
 * converted to PNG. When the browser can't decode one, it goes as it is for the sheet to try.
 */
export async function prepareShareFiles(images: StagedImage[]): Promise<File[]> {
  return Promise.all(
    images.map(async (img) => {
      if (SHARED_AS_IS.has(img.blob.type)) return asFile(img.blob, img.name)
      try {
        return new File([await toPng(img.blob)], pngName(img.name), { type: "image/png" })
      } catch {
        return asFile(img.blob, img.name)
      }
    }),
  )
}

/** Whether these images can go through the share sheet together (the browser decides), as they'll be sent. */
export function canShareImages(images: StagedImage[]): boolean {
  if (images.length === 0 || !canShare() || typeof navigator.canShare !== "function") return false
  try {
    // Stands in for the conversion, which is async: a file of the same bytes typed as PNG.
    const files = images.map((img) =>
      SHARED_AS_IS.has(img.blob.type) ? asFile(img.blob, img.name) : new File([img.blob], pngName(img.name), { type: "image/png" }),
    )
    return navigator.canShare({ files })
  } catch {
    return false
  }
}

export type ShareOutcome = "shared" | "canceled"

/**
 * Hand a post to the share sheet: the text, and the images when the browser can send them
 * along. Resolves once the sheet is done, or "canceled" when the person backed out of it.
 * Must be called from a click or tap: the sheet opens only on a user gesture.
 */
export async function sharePost({
  text,
  images,
  files,
}: {
  text: string
  images: StagedImage[]
  /** The images already converted (prepareShareFiles), so the sheet opens within the tap. */
  files?: File[]
}): Promise<ShareOutcome> {
  const data: ShareData = {}
  if (text) data.text = text
  if (canShareImages(images)) data.files = files ?? (await prepareShareFiles(images))
  try {
    await navigator.share(data)
    return "shared"
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "canceled"
    throw err
  }
}
