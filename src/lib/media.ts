import type { PlatformAdapter } from "@/lib/adapters/types"

// Videos stage beside images, in the same tray and the same places on each card. What's
// particular to them: their length and size are read here once they're added, and each
// platform's own rules (adapters' `video`) are checked against every post.

/** What a staged video's metadata says, read once when it's added. */
export type VideoInfo = { duration: number; width: number; height: number }

/** A staged image or video, as far as the checks need: its file, and a video's metadata. */
export type Media = { blob: Blob; video?: VideoInfo | null }

export const isVideo = (m: { blob: Blob }) => m.blob.type.startsWith("video/")

/** "image" or "video", for labels: "Copy image 2", "Video 1 – Alt Text". */
export const mediaKind = (m: { blob: Blob }) => (isVideo(m) ? "video" : "image")

/**
 * Types for files the system leaves untyped by extension (Windows gives an .mkv none, say), so a
 * video dropped from anywhere is still recognized.
 */
const BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
}

/** The file's media type, from its name when the system gave it none. */
export function mediaType(file: { name: string; type: string }): string {
  if (file.type) return file.type
  return BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? ""
}

/** An image or a video, the files Compose stages. */
export const isMediaType = (type: string) => type.startsWith("image/") || type.startsWith("video/")

/**
 * A video's length and size, read by the browser. Null when it can't play the file (an HEVC
 * .mov in a browser without the codec, say), so its length can't be checked here.
 */
export function probeVideo(blob: Blob): Promise<VideoInfo | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    const url = URL.createObjectURL(blob)
    const done = (info: VideoInfo | null) => {
      clearTimeout(timer)
      video.removeAttribute("src")
      video.load()
      URL.revokeObjectURL(url)
      resolve(info)
    }
    const timer = setTimeout(() => done(null), 15_000)
    video.preload = "metadata"
    video.muted = true
    video.onloadedmetadata = () =>
      done(
        Number.isFinite(video.duration)
          ? { duration: video.duration, width: video.videoWidth, height: video.videoHeight }
          : null,
      )
    video.onerror = () => done(null)
    video.src = url
  })
}

/** A length as "0:42" or "1:02:05". */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, "0")
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** A limit in seconds as words: "60 seconds", "3 minutes", "2 min 20 s", "4 hours". */
export function formatLimit(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

/** A size as "512 MB" or "1.5 GB" (decimal units, as the platforms state theirs). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${+(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** "3 images", "1 video", "2 images and a video": what a set of media holds. */
export function mediaNoun(images: number, videos: number): string {
  if (!videos) return counted(images, "image")
  if (!images) return counted(videos, "video")
  return `${counted(images, "image")} and ${videos === 1 ? "a video" : counted(videos, "video")}`
}

/** Each post's media, in order: `postOf` gives an item's post. */
export function mediaPerPost<T>(items: T[], posts: number, postOf: (item: T) => number): T[][] {
  const out = Array.from({ length: posts }, (): T[] => [])
  for (const item of items) out[postOf(item)].push(item)
  return out
}

/**
 * What's wrong with one post's media on this platform, or null: too many images, too many
 * videos, a video beside images where the platform won't mix them, or a video it won't take
 * (its format, size or length). `n` is each item's number in the Compose tray. With `short`,
 * a few words for the rail's tooltip.
 */
function postMediaProblem<T extends Media>(
  adapter: PlatformAdapter,
  media: T[],
  n: (m: T) => number | string,
  short: boolean,
  alone: boolean,
): string | null {
  // How to fix too many: another post, if there is one; else leave some off, or split.
  const fix = (extra: number, what: string) => {
    const them = extra === 1 ? "it" : "them"
    if (!alone) return `Move ${what} to another post, or leave ${them} off here.`
    if (adapter.chain) return `Leave ${what} off here, or split the post and move ${them} to the next.`
    return `Leave ${what} off here.`
  }
  const videos = media.filter(isVideo)
  const images = media.length - videos.length
  const rules = adapter.video
  if (videos.length && !rules) return short ? "No video" : `${adapter.name} doesn't take video here.`
  if (rules && videos.length > rules.perPost) {
    if (short) return `${videos.length} videos, ${rules.perPost} at most`
    return `${adapter.name} takes ${rules.perPost === 1 ? "one video" : `up to ${rules.perPost} videos`} a post; this one has ${videos.length}. ${fix(videos.length - rules.perPost, String(videos.length - rules.perPost))}`
  }
  if (rules && videos.length && images && !rules.mixes) {
    if (short) return "Video with images"
    return `${adapter.name} won't put a video and images in one post. ${fix(1, "the video")}`
  }
  const max = adapter.maxImages
  if (max && media.length > max) {
    const extra = media.length - max
    if (short) return `${mediaNoun(images, videos.length)}, ${max} at most`
    const what = videos.length ? "photos and videos" : "images"
    return `${adapter.name} takes up to ${max} ${what} a post; this one has ${media.length}. ${fix(extra, String(extra))}`
  }
  if (!rules) return null
  for (const v of videos) {
    const problem = videoProblem(adapter, v, n(v), media.length > 1, short)
    if (problem) return problem
  }
  return null
}

/**
 * The longest video the platform takes, in seconds: in a post with other photos or videos
 * (`inCarousel`), its shorter cap where it has one (Instagram's 60 seconds). Undefined: no cap.
 */
export function videoCap(adapter: PlatformAdapter, inCarousel: boolean): number | undefined {
  const rules = adapter.video
  return (inCarousel && rules?.carouselMaxSeconds) || rules?.maxSeconds
}

/**
 * Why the platform won't take this video (its format, size or length), or null. `n` is its
 * number in the tray; `inCarousel`, that it shares its post with other photos or videos.
 */
export function videoProblem(
  adapter: PlatformAdapter,
  v: Media,
  n: number | string,
  inCarousel: boolean,
  short = false,
): string | null {
  const rules = adapter.video
  if (!rules) return short ? "No video" : `${adapter.name} doesn't take video here.`
  const name = `video ${n}`
  const Name = `Video ${n}`
  if (!rules.types.includes(v.blob.type)) {
    if (short) return `${Name}: format`
    return `${adapter.name} takes ${rules.typeLabel} videos; ${name} is ${describeType(v.blob.type)}. Convert it, or leave it off here.`
  }
  const { maxBytes, upgrade } = rules
  if (maxBytes && v.blob.size > maxBytes) {
    if (short) return `${Name}: over ${formatBytes(maxBytes)}`
    const more = upgrade?.maxBytes && v.blob.size <= upgrade.maxBytes ? ` ${upgrade.label} raises it to ${formatBytes(upgrade.maxBytes)}.` : ""
    return `${adapter.name} takes videos up to ${formatBytes(maxBytes)}; ${name} is ${formatBytes(v.blob.size)}.${more}`
  }
  const length = v.video?.duration
  if (length === undefined || length === null) return null
  // In a post with other photos or videos, a shorter cap where the platform has one.
  const carousel = inCarousel && !!rules.carouselMaxSeconds
  const maxSeconds = videoCap(adapter, inCarousel)
  // A part of a second over is rounding in the file, not the platform's limit.
  if (maxSeconds && length > maxSeconds + 0.5) {
    if (short) return `${Name}: over ${formatDuration(maxSeconds)}`
    const where = carousel ? " in a post with other photos or videos" : ""
    const more =
      !carousel && upgrade?.maxSeconds && length <= upgrade.maxSeconds
        ? ` ${upgrade.label} raises it to ${formatLimit(upgrade.maxSeconds)}.`
        : carousel
          ? " Trim it, or leave it or the others off here."
          : " Trim it, or leave it off here."
    return `${adapter.name} takes videos up to ${formatLimit(maxSeconds)}${where}; ${name} runs ${runs(length)}.${more}`
  }
  if (rules.minSeconds && length < rules.minSeconds) {
    if (short) return `${Name}: under ${rules.minSeconds} s`
    return `${adapter.name} takes videos of at least ${formatLimit(rules.minSeconds)}; ${name} runs ${runs(length)}.`
  }
  return null
}

/**
 * Each video the platform won't take as it is, with why, a few words: the ones a card marks and
 * offers to fix. `perPost` holds each post's media; `n` each item's number.
 */
export function videoIssues<T extends Media>(
  adapter: PlatformAdapter,
  perPost: T[][],
  n: (m: T) => number | string,
): Map<T, string> {
  const out = new Map<T, string>()
  for (const post of perPost) {
    for (const v of post.filter(isVideo)) {
      const problem = videoProblem(adapter, v, n(v), post.length > 1, true)
      if (problem) out.set(v, problem.replace(/^Video \S+: /, ""))
    }
  }
  return out
}

/** A video's length in a sentence: "1:05", or "2.4 seconds" for a short one. */
const runs = (seconds: number) => (seconds < 10 ? `${+seconds.toFixed(1)} seconds` : formatDuration(seconds))

/** "an MKV file" from "video/x-matroska". */
function describeType(type: string): string {
  const name = (type.split("/")[1] ?? type).replace(/^x-/, "")
  const label = { quicktime: "MOV", matroska: "MKV", msvideo: "AVI", "ms-wmv": "WMV" }[name] ?? name.toUpperCase()
  return `${/^[AEFHILMNORSX]/.test(label) ? "an" : "a"} ${label} file`
}

/**
 * The first post whose media the platform won't take, described: in full for the card, or
 * `short` for the rail's tooltip. `perPost` holds each post's media; `n` each item's number.
 */
export function mediaProblem<T extends Media>(
  adapter: PlatformAdapter,
  perPost: T[][],
  n: (m: T) => number | string,
  short = false,
): string | null {
  for (let i = 0; i < perPost.length; i++) {
    const problem = postMediaProblem(adapter, perPost[i], n, short, perPost.length === 1)
    if (problem) return perPost.length > 1 ? `Post ${i + 1}: ${problem}` : problem
  }
  return null
}
