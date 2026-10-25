import type { PlatformAdapter } from "@/lib/adapters/types"
import { videoCap } from "@/lib/media"
import { MIN_SPAN, splitSpan, type Span } from "@/lib/trim"

// Splitting a video into clips, the way Compose splits text into posts: each platform's length
// limit splits it on its own where it must, and splits placed by hand (per platform, the way
// Compose keeps text splits) stay put, the limit's splits filling in around them. The All chip
// places a split on every platform; Compose's splits are the hand-placed ones most of them share.

/** Hand-placed split times per platform, for one video, in seconds into the file as added. */
export type VideoSplits = Record<string, number[]>

/** Two split times within this many seconds are the same split. */
const SAME = 0.05

const near = (a: number, b: number) => Math.abs(a - b) < SAME

/**
 * The longest clip the platform takes for this video: a lone video's cap, or where its clips will
 * share a post (with other photos or videos, split by hand, or past what a lone video takes, so
 * the limit splits it), the carousel's (Instagram: 60 seconds against 15 minutes).
 */
export function clipCap(
  adapter: PlatformAdapter,
  length: number,
  opts: { withOthers: boolean; handSplit: boolean },
): number | undefined {
  const alone = videoCap(adapter, false)
  if (opts.withOthers || opts.handSplit || (alone !== undefined && length > alone + 0.5)) return videoCap(adapter, true)
  return alone
}

/**
 * The clips of `span`: cut at the hand-placed splits inside it, then each stretch between them
 * into the fewest equal clips under `cap` (none where it fits, or with no cap).
 */
export function clipsFor(span: Span, cap: number | undefined, hand: readonly number[]): Span[] {
  const cuts = [...hand]
    .filter((t) => t > span.start + MIN_SPAN / 2 && t < span.end - MIN_SPAN / 2)
    .sort((a, b) => a - b)
    .filter((t, i, all) => i === 0 || !near(t, all[i - 1]))
  const edges = [span.start, ...cuts, span.end]
  return edges.slice(0, -1).flatMap((start, i) => {
    const stretch = { start, end: edges[i + 1] }
    return cap ? splitSpan(stretch, cap) : [stretch]
  })
}

/** Where a platform's clips start after the first: the time, the clip that starts there, and whether it was placed by hand. */
export function splitMarks(clips: readonly Span[], hand: readonly number[]) {
  return clips.slice(1).map((c, i) => ({ t: c.start, index: i + 2, manual: hand.some((h) => near(h, c.start)) }))
}

/**
 * Compose's splits as one platform sees them: the hand-placed times most of the other platforms
 * share (what the All chip leaves on each), as Compose's text splits are found.
 */
export function sharedSplits(splits: VideoSplits, platformIds: readonly string[], except?: string): number[] {
  const others = platformIds.filter((id) => id !== except)
  const counts: { t: number; n: number }[] = []
  for (const id of others) {
    for (const t of splits[id] ?? []) {
      const seen = counts.find((c) => near(c.t, t))
      if (seen) seen.n++
      else counts.push({ t, n: 1 })
    }
  }
  return counts
    .filter((c) => c.n > others.length / 2)
    .map((c) => c.t)
    .sort((a, b) => a - b)
}

/** Whether two lists of split times are the same splits. */
export const sameSplits = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((t, i) => near(t, [...b].sort((x, y) => x - y)[i]))

/** Whether the kept part is long enough to split at all: two clips of at least MIN_SPAN. */
export const canSplit = (span: Span) => span.end - span.start >= 2 * MIN_SPAN

/**
 * Whether `t` is too close (under MIN_SPAN) to one of the platform's other hand-placed splits
 * (not the one at `except`, being moved): a split there would make a clip too short to post.
 */
export const crowded = (hand: readonly number[], t: number, except?: number) =>
  hand.some((h) => (except === undefined || !near(h, except)) && Math.abs(h - t) < MIN_SPAN)

/**
 * A hand-placed split at `t` (kept inside the span, clear of its ends), added to the list; none
 * where the span is too short to split, or too close to another of the list's.
 */
export function addSplit(hand: readonly number[], t: number, span: Span): number[] {
  const at = Math.min(span.end - MIN_SPAN, Math.max(span.start + MIN_SPAN, t))
  return !canSplit(span) || crowded(hand, at) ? [...hand] : [...hand, at].sort((a, b) => a - b)
}

/**
 * A split moved from `from` to `to`: a hand-placed one moves; one the limit placed becomes a
 * hand-placed one at `to` (the limit's others reflow around it, as in Compose). Where `to` is too
 * close to another of the platform's hand-placed splits, it stays where it was, rather than merge
 * into that one.
 */
export function moveSplit(hand: readonly number[], from: number, to: number, span: Span): number[] {
  if (crowded(hand, to, from)) return [...hand]
  return addSplit(
    hand.filter((h) => !near(h, from)),
    to,
    span,
  )
}

/** A hand-placed split removed (one the limit placed comes back wherever the limit needs it). */
export const removeSplit = (hand: readonly number[], at: number) => hand.filter((h) => !near(h, at))

/**
 * The splits on the timeline: one per time, with every platform that splits there (and its clip
 * number), so splits shared by several platforms show as one All tag.
 */
export function groupMarks(byPlatform: { id: string; marks: ReturnType<typeof splitMarks> }[]) {
  const groups: { t: number; platforms: { id: string; index: number; manual: boolean }[] }[] = []
  for (const { id, marks } of byPlatform) {
    for (const m of marks) {
      const g = groups.find((x) => near(x.t, m.t))
      if (g) g.platforms.push({ id, index: m.index, manual: m.manual })
      else groups.push({ t: m.t, platforms: [{ id, index: m.index, manual: m.manual }] })
    }
  }
  return groups.sort((a, b) => a.t - b.t)
}

/** Whether made clips are these clips (their spans, within the tolerance). */
export const sameClips = (made: readonly (Span | undefined)[], clips: readonly Span[]) =>
  made.length === clips.length && made.every((m, i) => !!m && near(m.start, clips[i].start) && near(m.end, clips[i].end))

/**
 * `t` pulled onto the nearest of `targets` within `pull` seconds (the splits of other platforms,
 * so a split dragged near one joins it), or left where it is.
 */
export function snapTo(t: number, targets: readonly number[], pull: number): number {
  let best: number | null = null
  for (const x of targets) if (Math.abs(x - t) <= pull && (best === null || Math.abs(x - t) < Math.abs(best - t))) best = x
  return best ?? t
}
