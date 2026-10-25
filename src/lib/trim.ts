import type { PlatformAdapter } from "@/lib/adapters/types"

// The part of a video to keep, in seconds into the video as it was added, and the timeline's
// moves on it: dragging an edge, moving the whole span, or holding it to a length (a platform's
// cap, or one the person locks) while it slides along.

export type Span = { start: number; end: number }

/** The shortest span the timeline makes, in seconds. */
export const MIN_SPAN = 0.5

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const spanLength = (span: Span) => span.end - span.start

/** A time on the timeline to the tenth: "0:05.2", "1:02:05.0". */
export function formatTime(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10)
  const s = Math.floor(tenths / 10)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, "0")
  const rest = `${pad(s % 60)}.${tenths % 10}`
  return h ? `${h}:${pad(m)}:${rest}` : `${m}:${rest}`
}

/**
 * A time as minutes, seconds and frames, as video editors write it ("0:49:15": 49 seconds and 15
 * frames), at `fps` frames a second (rounded, so 29.97 counts as 30), to the nearest frame.
 */
export function formatTimecode(seconds: number, fps = 30): string {
  const rate = Math.max(1, Math.round(fps))
  const frames = Math.round(Math.max(0, seconds) * rate)
  const s = Math.floor(frames / rate)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, "0")
  const rest = `${pad(s % 60)}:${pad(frames % rate)}`
  return h ? `${h}:${pad(m)}:${rest}` : `${m}:${rest}`
}

/** The span slid by `delta` seconds, its length kept, inside the video. */
export function moveSpan(span: Span, delta: number, duration: number): Span {
  const length = Math.min(spanLength(span), duration)
  const start = clamp(span.start + delta, 0, duration - length)
  return { start, end: start + length }
}

/** The span with one edge at `t`, kept inside the video and at least MIN_SPAN long. */
export function setEdge(span: Span, edge: "start" | "end", t: number, duration: number): Span {
  const min = Math.min(MIN_SPAN, duration)
  if (edge === "start") return { start: clamp(t, 0, span.end - min), end: span.end }
  return { start: span.start, end: clamp(t, span.start + min, duration) }
}

/**
 * The span held to `length` seconds (or the whole video, if that's shorter), starting where it
 * starts now unless that would run past the end.
 */
export function lockedSpan(span: Span, length: number, duration: number): Span {
  const keep = Math.min(length, duration)
  const start = clamp(span.start, 0, duration - keep)
  return { start, end: start + keep }
}

/** The span covers the whole video, so there's nothing to trim (a twentieth of a second either way). */
export const isWhole = (span: Span, duration: number) => span.start <= 0.05 && span.end >= duration - 0.05

/** A length the timeline offers to lock to: a platform cap, and whose it is ("Instagram carousel"). */
export type LengthPreset = { seconds: number; platforms: { adapter: PlatformAdapter; label: string }[] }

/**
 * The platforms' length caps shorter than this video, shortest first, platforms with the same
 * cap together: each platform's own cap, and Instagram's shorter one for a carousel.
 */
export function lengthPresets(adapters: PlatformAdapter[], duration: number): LengthPreset[] {
  const bySeconds = new Map<number, LengthPreset["platforms"]>()
  const add = (seconds: number | undefined, adapter: PlatformAdapter, label: string) => {
    // A cap the video already fits under isn't one to trim to.
    if (!seconds || seconds >= duration) return
    const list = bySeconds.get(seconds) ?? []
    if (!list.some((p) => p.label === label)) list.push({ adapter, label })
    bySeconds.set(seconds, list)
  }
  for (const a of adapters) {
    add(a.video?.carouselMaxSeconds, a, `${a.name} carousel`)
    add(a.video?.maxSeconds, a, a.name)
  }
  return [...bySeconds]
    .sort(([x], [y]) => x - y)
    .map(([seconds, platforms]) => ({ seconds, platforms }))
}

/**
 * The span cut into the fewest equal parts each no longer than `cap` seconds (a part of a second
 * over is the platforms' rounding, so it's allowed): a 2:30 span under a 1:00 cap is 3 of 0:50.
 */
export function splitSpan(span: Span, cap: number): Span[] {
  const length = spanLength(span)
  const parts = Math.max(1, Math.ceil((length - 0.5) / cap))
  const each = length / parts
  return Array.from({ length: parts }, (_, i) => ({
    start: span.start + i * each,
    end: i === parts - 1 ? span.end : span.start + (i + 1) * each,
  }))
}
