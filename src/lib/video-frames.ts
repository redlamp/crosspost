"use client"

// Reading frames out of a video in the browser: the timeline's strip, and the opening frame the
// media dialog shows while a video it's moving to loads. A hidden copy of the video is seeked and
// drawn to a canvas, so it works for any video this browser can play.

/** Frames along the timeline's strip. */
export const STRIP_FRAMES = 10

/**
 * A hidden copy of the video at `url`, loaded far enough to draw, and how to let it go. Gives up
 * (and lets it go) if it hasn't loaded in 15 seconds or has no picture; a seek that never lands
 * goes on after 5 seconds rather than hang.
 */
async function hiddenVideo(url: string) {
  const video = document.createElement("video")
  video.muted = true
  video.preload = "auto"
  video.src = url
  const close = () => {
    video.removeAttribute("src")
    video.load()
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("too slow")), 15_000)
      video.onloadeddata = () => {
        clearTimeout(timer)
        resolve()
      }
      video.onerror = () => {
        clearTimeout(timer)
        reject(new Error("unplayable"))
      }
    })
    if (!video.videoWidth || !video.videoHeight) throw new Error("no picture")
  } catch (err) {
    close()
    throw err
  }
  const seek = (t: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5_000)
      video.onseeked = () => {
        clearTimeout(timer)
        resolve()
      }
      video.currentTime = t
    })
  return { video, seek, close }
}

/**
 * The strip's frames, small JPEGs (112px tall) from across the video, each handed to `onFrame` as
 * it's read; stops early once `live` says so.
 */
export async function readStrip(
  url: string,
  duration: number,
  onFrame: (frames: string[]) => void,
  live: () => boolean = () => true,
): Promise<string[]> {
  const { video, seek, close } = await hiddenVideo(url)
  try {
    const h = 112
    const w = Math.max(1, Math.round((video.videoWidth / video.videoHeight) * h))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const out: string[] = []
    for (let i = 0; i < STRIP_FRAMES && live(); i++) {
      await seek(((i + 0.5) / STRIP_FRAMES) * duration)
      canvas.getContext("2d")!.drawImage(video, 0, 0, w, h)
      out.push(canvas.toDataURL("image/jpeg", 0.6))
      onFrame([...out])
    }
    return out
  } finally {
    close()
  }
}

/** What the dialog shows of a video before the video itself is in: its frame at `at`, its size and length. */
export type VideoFirstLook = { poster: Blob; width: number; height: number; duration: number }

/** The video's frame at `at` seconds (as a JPEG, at its own size), its size and its length. */
export async function readFirstLook(url: string, at: number): Promise<VideoFirstLook> {
  const { video, seek, close } = await hiddenVideo(url)
  try {
    if (at > 0) await seek(at)
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")!.drawImage(video, 0, 0)
    const poster = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no frame"))), "image/jpeg", 0.85),
    )
    return { poster, width: video.videoWidth, height: video.videoHeight, duration: video.duration }
  } finally {
    close()
  }
}
