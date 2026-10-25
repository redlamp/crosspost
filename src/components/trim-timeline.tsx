"use client"

import { CircleHelpIcon, LockIcon, LockOpenIcon, PauseIcon, PlayIcon, ScissorsIcon, Volume2Icon, VolumeXIcon, XIcon } from "lucide-react"
import { Fragment, useEffect, useRef, useState } from "react"

import { Flag, mostCommon } from "@/components/compose-editor"
import { CHOSEN, RowLabel } from "@/components/crop-editor"
import { PlatformLogo } from "@/components/platform-logo"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { PlatformAdapter } from "@/lib/adapters"
import { formatDuration } from "@/lib/media"
import { snapTo } from "@/lib/video-splits"
import { formatTimecode, isWhole, moveSpan, setEdge, spanLength, type LengthPreset, type Span } from "@/lib/trim"
import { cn } from "@/lib/utils"
import { readStrip, STRIP_FRAMES } from "@/lib/video-frames"

/** A strip's frames kept for a file, and the read of them under way, if one is. */
export type StripCache = { frames?: string[]; reading?: Promise<string[]> }

/**
 * Note in a file's strip cache (a store the media dialog keeps for its visit, shared by every
 * strip of that file) the read under way, or frames read: never fewer than it holds already.
 */
function keep(cache: StripCache, what: { reading?: Promise<string[]>; frames?: string[] }) {
  if (what.reading) cache.reading = what.reading
  if (what.frames && what.frames.length > (cache.frames?.length ?? 0)) cache.frames = what.frames
}

/**
 * A row of frames from across the video, behind the timeline, read one after another from a
 * hidden copy of it. Empty where the browser can't play the video. With a `cache` (the media
 * dialog keeps one per file, and fills it ahead for the videos either side), frames read before
 * show at once, and frames read now are kept there.
 */
function Filmstrip({ url, duration, cache }: { url: string; duration: number; cache?: StripCache }) {
  const [frames, setFrames] = useState<string[]>(cache?.frames ?? [])
  // Bumped to read again when a read waited on stopped short (its strip closed first).
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if ((cache?.frames?.length ?? 0) >= STRIP_FRAMES) return
    let live = true
    // One read per file: one already going (got ready ahead, or by another strip) is waited for,
    // not started again. A read stops when its strip goes, and is forgotten once it ends either
    // way, so one that failed or stopped short is tried again next time.
    const own = !cache?.reading
    const reading =
      cache?.reading ??
      readStrip(
        url,
        duration,
        (read) => {
          if (cache) keep(cache, { frames: read })
          if (live) setFrames(read)
        },
        () => live,
      )
    if (cache && own) {
      keep(cache, { reading })
      const forget = () => {
        if (cache.reading === reading) cache.reading = undefined
      }
      reading.then(forget, forget)
    }
    reading
      .then((read) => {
        if (!live) return
        setFrames(read)
        if (!own && read.length < STRIP_FRAMES) setAttempt((n) => n + 1)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [url, duration, cache, attempt])
  return (
    <div aria-hidden className="absolute inset-0 grid grid-cols-[repeat(10,minmax(0,1fr))] overflow-hidden">
      {Array.from({ length: STRIP_FRAMES }, (_, i) =>
        frames[i] ? (
          // eslint-disable-next-line @next/next/no-img-element -- a frame drawn here, as a data URL
          <img key={i} src={frames[i]} alt="" draggable={false} className="size-full object-cover" />
        ) : (
          <span key={i} className="size-full bg-muted-foreground/10" />
        ),
      )}
    </div>
  )
}

type TimelineProps = {
  /** The video's object URL, for the frames. */
  url: string
  duration: number
  span: Span
  onSpan: (span: Span) => void
  /** The crop tab: the edges and the kept part can be dragged. Elsewhere the kept part only shows. */
  editable: boolean
  /** The span is held to its length: no edges to drag, only the whole of it to slide. */
  locked: boolean
  /** Where the preview is, and how to move it. */
  time: number
  onSeek: (t: number) => void
  playing: boolean
  onTogglePlay: () => void
  muted: boolean
  onToggleMute: () => void
  /**
   * Where the video is split into clips: each time, the platforms that split there, and the clip
   * that starts there. Set (even empty), a row under the frames holds each split's time.
   */
  splits?: SplitGroup[]
  /** Opened from a platform's card: its splits come forward and the others fade. */
  focus?: string
  /**
   * Move the platforms' split at `from` toward `to`; returns where it lands (the caller keeps it
   * inside the kept part). Set, the splits can be dragged, and moved with the arrow keys.
   */
  onMoveSplit?: (from: number, to: number, platformIds: string[]) => number
  /** Remove the platforms' hand-placed split at `at` (dragged off the timeline, or Delete). */
  onRemoveSplit?: (at: number, platformIds: string[]) => void
  /** A split being placed (a chip dragged over the timeline), drawn where it would go. */
  placing?: number | null
  /** An edit is being made: the keys leave the playhead and splits alone. */
  paused?: boolean
  /**
   * The split picked to adjust: comma and period nudge it a frame (Shift: a second) rather than
   * the playhead, and Delete removes it. Clicking the frames lets it go.
   */
  picked?: SplitPick | null
  onPick?: (pick: SplitPick | null) => void
  /** The track the frames and splits are on, for a chip dragged onto it. */
  trackRef?: React.Ref<HTMLDivElement>
  /** Where the strip's frames are kept between visits (the media dialog's, per file). */
  strip?: StripCache
  /** One frame, in seconds: how far each arrow key moves things (Shift: a second). */
  frame?: number
}

/** How far each arrow key moves the playhead, an edge, a split or the span when the frame rate isn't known, in seconds. */
const STEP = 1 / 30
/** How far off the timeline (any side) a dragged split has to go to be removed on release. */
const REMOVE_DISTANCE = 24
/** About how wide a split's time is under the frames ("0:30:13"), with a little room, in pixels. */
const TIME_WIDTH = 56
/** Pointer movement before pressing a split becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4
/** How close (in pixels) a dragged split has to come to another platform's to join it. */
export const SNAP_DISTANCE = 12

/**
 * Which way a key steps along the timeline: the arrow keys (on a focused playhead, split, edge or
 * kept part), and comma and period (by where they sit, so Shift and other layouts don't matter).
 */
function stepOf(e: { key: string; code: string }): -1 | 0 | 1 {
  if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.code === "Comma") return -1
  if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.code === "Period") return 1
  return 0
}

/** A split picked to adjust (clicked, or reached with Tab): where it is, and whose (a group's, or one platform's). */
export type SplitPick = { t: number; ids: string[] }

/** Whether a pick is this split (the group's tag, or one of its flags). */
const isPick = (pick: SplitPick | null | undefined, t: number, ids: string[]) =>
  !!pick && Math.abs(pick.t - t) < 0.05 && pick.ids.length === ids.length && pick.ids.every((id) => ids.includes(id))

/** A split on the timeline: its time, and each platform that splits there with the clip that starts there. */
export type SplitGroup = { t: number; platforms: { adapter: PlatformAdapter; index: number; manual: boolean }[] }

/**
 * The video's player and timeline, the same on both tabs: play and sound, its frames with the
 * part kept between two edges (the rest shaded), and the playhead, dragged by its knob on the
 * lane above the frames (or by clicking the frames anywhere but the kept part, when it's
 * editable). On the crop tab, drag an edge to trim and the kept part to slide it along (all a
 * locked span can do).
 */
export function VideoTimeline({
  url,
  duration,
  span,
  onSpan,
  editable,
  locked,
  time,
  onSeek,
  playing,
  onTogglePlay,
  muted,
  onToggleMute,
  splits: splitList,
  focus,
  onMoveSplit,
  onRemoveSplit,
  placing,
  paused,
  picked,
  onPick,
  trackRef,
  strip,
  frame = STEP,
}: TimelineProps) {
  // A split being dragged: which platforms', where it is, and whether it's off the timeline (to go).
  const splits = splitList ?? []
  /** A time as minutes, seconds and frames, at this video's frame rate. */
  const tc = (t: number) => formatTimecode(t, 1 / frame)
  const [held, setHeld] = useState<{ ids: string[]; t: number; removing: boolean } | null>(null)
  /**
   * A slider pressed (an edge, the kept part, the playhead, a split) takes focus, as a click would
   * give it if the press weren't held for the drag: the keys then move it, rather than page
   * through the tray.
   */
  const pressFocus = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    if (el.getAttribute("role") === "slider") el.focus({ preventScroll: true })
  }
  /** Follow the pointer until it's let go, from a press on the track, the span or an edge. */
  const drag = (e: React.PointerEvent, what: "seek" | "move" | "start" | "end") => {
    e.preventDefault()
    e.stopPropagation()
    pressFocus(e)
    const box = (e.currentTarget as Element).closest("[data-trim-track]")!.getBoundingClientRect()
    const at = (clientX: number) => Math.min(duration, Math.max(0, ((clientX - box.left) / box.width) * duration))
    const from = { t: at(e.clientX), span }
    // Clicking the frames lets a picked split go.
    if (what === "seek") onPick?.(null)
    const follow = (clientX: number) => {
      const t = at(clientX)
      // The playhead is pulled onto a split (or the kept part's ends) it comes near, to see the
      // frame a clip starts on.
      if (what === "seek")
        return onSeek(snapTo(t, [...splits.map((g) => g.t), span.start, span.end], (SNAP_DISTANCE / box.width) * duration))
      const next = what === "move" ? moveSpan(from.span, t - from.t, duration) : setEdge(from.span, what, t, duration)
      onSpan(next)
      // Show the frame at the edge being placed (the start, when the whole span moves).
      onSeek(what === "end" ? next.end : next.start)
    }
    if (what === "seek") follow(e.clientX)
    const move = (ev: PointerEvent) => follow(ev.clientX)
    const end = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
  }
  const arrow = (e: React.KeyboardEvent) => {
    const dir = stepOf(e)
    if (dir) e.preventDefault()
    return dir * (e.shiftKey ? 1 : frame)
  }
  // Comma and period step the playhead a frame (Shift: a second) from anywhere in the dialog, so
  // the arrow keys stay with paging through the tray; on a focused split or edge, they step that
  // instead (its own handler, first). Not while typing.
  // A picked split takes them (and Delete) instead.
  const playheadStep = useRef({ time, frame, duration, span, onSeek, picked, splits, onMoveSplit, onRemoveSplit, onPick, editable, paused })
  useEffect(() => {
    playheadStep.current = { time, frame, duration, span, onSeek, picked, splits, onMoveSplit, onRemoveSplit, onPick, editable, paused }
  })
  useEffect(() => {
    const step = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey) return
      if ((e.target as Element | null)?.closest?.("input, textarea, [contenteditable]")) return
      const now = playheadStep.current
      if (now.paused) return
      // On Crop & Trim only: Alt with comma or period goes to the previous or next split.
      if (now.editable && e.altKey && (e.code === "Comma" || e.code === "Period")) {
        e.preventDefault()
        // The kept part's ends count as splits here, so the first and last stops are its start and end.
        const times = [now.span.start, ...now.splits.map((g) => g.t), now.span.end]
        const to =
          e.code === "Comma"
            ? Math.max(...times.filter((t) => t < now.time - 0.01))
            : Math.min(...times.filter((t) => t > now.time + 0.01))
        if (Number.isFinite(to)) now.onSeek(to)
        return
      }
      if (e.altKey) return
      const pick = now.editable ? now.picked : null
      if (pick && (e.key === "Delete" || e.key === "Backspace")) {
        const g = now.splits.find((x) => isPick(pick, x.t, pick.ids) || isPick(pick, x.t, x.platforms.map((p) => p.adapter.id)))
        if (!g?.platforms.some((p) => pick.ids.includes(p.adapter.id) && p.manual)) return
        e.preventDefault()
        now.onRemoveSplit?.(pick.t, pick.ids)
        return now.onPick?.(null)
      }
      if (e.code !== "Comma" && e.code !== "Period") return
      e.preventDefault()
      const d = stepOf(e) * (e.shiftKey ? 1 : now.frame)
      if (pick && now.onMoveSplit) {
        const at = now.onMoveSplit(pick.t, pick.t + d, pick.ids)
        now.onPick?.({ ...pick, t: at })
        return now.onSeek(at)
      }
      // A frame's step lands on a frame.
      const to = e.shiftKey ? now.time + d : Math.round((now.time + d) / now.frame) * now.frame
      now.onSeek(Math.min(now.duration, Math.max(0, to)))
    }
    window.addEventListener("keydown", step)
    return () => window.removeEventListener("keydown", step)
  }, [])
  const key = (what: "move" | "start" | "end") => (e: React.KeyboardEvent) => {
    const d = arrow(e)
    if (!d) return
    // An edge sits inside the kept part, which slides on the same keys: the edge's press is its own.
    e.stopPropagation()
    const next =
      what === "move" ? moveSpan(span, d, duration) : setEdge(span, what, (what === "start" ? span.start : span.end) + d, duration)
    onSpan(next)
    onSeek(what === "end" ? next.end : next.start)
  }
  /**
   * Drag a split (one platform's, or a group's by its tag) along the timeline, or off it (up,
   * down or past either end) to remove it, if it was placed by hand (one the limit placed comes back). A press without a move
   * goes to it.
   */
  const dragSplit = (e: React.PointerEvent, g: SplitGroup, ids: string[]) => {
    if (e.button !== 0 || !onMoveSplit) return
    e.preventDefault()
    e.stopPropagation()
    pressFocus(e)
    const box = (e.currentTarget as Element).closest("[data-trim-track]")!.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY }
    // Pressed, it's picked: to nudge after, with the keys or the Splits row's buttons.
    onPick?.({ t: g.t, ids })
    const timeAt = (x: number) => ((x - box.left) / box.width) * duration
    // Where on the flag it was caught, so it doesn't jump to put its line under the pointer.
    const grab = timeAt(e.clientX) - g.t
    // Other platforms' splits pull it in, so splits meant to be shared line up exactly; not the
    // dragged ones' own (their limit's splits move as they do).
    const others = splits.filter((o) => !o.platforms.every((p) => ids.includes(p.adapter.id))).map((o) => o.t)
    const pull = (SNAP_DISTANCE / box.width) * duration
    let at = g.t
    let moved = false
    const removable = !!onRemoveSplit && g.platforms.some((p) => ids.includes(p.adapter.id) && p.manual)
    // Off the timeline any way, up, down or past either end, it goes on release.
    const off = (x: number, y: number) =>
      removable &&
      (y > box.bottom + REMOVE_DISTANCE ||
        y < box.top - REMOVE_DISTANCE ||
        x < box.left - REMOVE_DISTANCE ||
        x > box.right + REMOVE_DISTANCE)
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return
      moved = true
      // Off the timeline it holds its place, ready to go.
      if (!off(ev.clientX, ev.clientY)) {
        at = onMoveSplit(at, snapTo(Math.min(duration, Math.max(0, timeAt(ev.clientX) - grab)), others, pull), ids)
        onSeek(at)
        onPick?.({ t: at, ids })
      }
      setHeld({ ids, t: at, removing: off(ev.clientX, ev.clientY) })
    }
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      setHeld(null)
      if (!moved) return onSeek(g.t)
      if (ev.type === "pointerup" && off(ev.clientX, ev.clientY)) {
        onRemoveSplit?.(at, ids)
        onPick?.(null)
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
  }
  const splitKey = (g: SplitGroup, ids: string[]) => (e: React.KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && onRemoveSplit && g.platforms.some((p) => ids.includes(p.adapter.id) && p.manual)) {
      e.preventDefault()
      onPick?.(null)
      return onRemoveSplit(g.t, ids)
    }
    const d = arrow(e)
    if (!d || !onMoveSplit) return
    const at = onMoveSplit(g.t, g.t + d, ids)
    onPick?.({ t: at, ids })
    onSeek(at)
  }
  const pct = (t: number) => `${(t / duration) * 100}%`
  /** A split's own key: who splits there and the clip that starts there, the same as it moves. */
  const groupKey = (g: SplitGroup) => `${g.platforms.map((p) => `${p.adapter.id}${p.index}`).join(",")}`
  // The width the split times have, to keep them from overlapping.
  const labelRow = useRef<HTMLDivElement>(null)
  const [rowWidth, setRowWidth] = useState(0)
  useEffect(() => {
    const el = labelRow.current
    if (!el) return
    const measure = () => setRowWidth(el.offsetWidth)
    // Measured at once as well: the observer reports on the next frame, which a background tab may not draw.
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const shownTimes = (() => {
    const shown = new Set<SplitGroup>()
    if (!rowWidth) return new Set(splits)
    const room = TIME_WIDTH
    const placed: number[] = []
    const near = (g: SplitGroup, t: number | undefined) => t !== undefined && Math.abs(g.t - t) < 0.05
    const first = (g: SplitGroup) =>
      near(g, held?.t) || near(g, picked?.t)
        ? 0
        : focus && g.platforms.some((p) => p.adapter.id === focus)
          ? 1
          : g.platforms.some((p) => p.manual)
            ? 2
            : 3
    for (const g of [...splits].sort((a, b) => first(a) - first(b) || a.t - b.t)) {
      const x = (g.t / duration) * rowWidth
      if (placed.every((p) => Math.abs(p - x) >= room)) {
        placed.push(x)
        shown.add(g)
      }
    }
    return shown
  })()
  const trimmed = !isWhole(span, duration)

  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2">
        <Button variant="outline" size="icon" onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"} className={cn("shrink-0", splitList ? "mb-7.5" : "mb-2.5")}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <div
          ref={trackRef}
          data-trim-track
          // With splits on offer, room under the frames for their times, kept whether or not there are any.
          className={cn("relative min-w-0 flex-1 touch-none pt-5 select-none", splitList && "pb-5")}
        >
          {/* The scrub lane: press or drag anywhere on it to move the playhead. */}
          <div aria-hidden onPointerDown={(e) => drag(e, "seek")} className="absolute inset-x-0 top-0 h-5 cursor-pointer">
            <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
          </div>
          <div
            onPointerDown={(e) => drag(e, "seek")}
            className="relative h-14 cursor-pointer overflow-hidden rounded-md bg-muted"
          >
            <Filmstrip url={url} duration={duration} cache={strip} />
            {/* The parts cut off, shaded. */}
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 bg-black/60" style={{ width: pct(span.start) }} />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 bg-black/60" style={{ left: pct(span.end) }} />
            {editable ? (
              <>
                {/* The part kept: drag it to slide it along. */}
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label={`Kept part, ${tc(span.start)} to ${tc(span.end)}. Arrow keys slide it.`}
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration - spanLength(span))}
                  aria-valuenow={Math.round(span.start)}
                  aria-valuetext={`${tc(span.start)} to ${tc(span.end)}`}
                  onPointerDown={(e) => drag(e, "move")}
                  onKeyDown={key("move")}
                  className={cn(
                    "absolute inset-y-0 cursor-grab rounded-md border-2 border-white outline-none focus-visible:border-sky-400 active:cursor-grabbing",
                    locked && "border-(--brand-blue)",
                  )}
                  style={{ left: pct(span.start), width: pct(spanLength(span)) }}
                />
                {/* Its edges: beside it rather than in it (a slider's insides are hidden from
                    screen readers), drawn just inside its ends. */}
                {!locked &&
                  (["start", "end"] as const).map((edge) => (
                    <span
                      key={edge}
                      role="slider"
                      tabIndex={0}
                      aria-label={edge === "start" ? "Start" : "End"}
                      aria-valuemin={0}
                      aria-valuemax={Math.round(duration)}
                      aria-valuenow={Math.round(span[edge])}
                      aria-valuetext={tc(span[edge])}
                      onPointerDown={(e) => drag(e, edge)}
                      onKeyDown={key(edge)}
                      className={cn(
                        // A bar on each edge, caught wider than it's drawn.
                        "absolute inset-y-0 grid w-3 cursor-ew-resize place-items-center bg-white outline-none before:absolute before:-inset-x-2 before:inset-y-0 focus-visible:bg-sky-400",
                        edge === "start" ? "rounded-l-md" : "rounded-r-md",
                      )}
                      style={{ left: edge === "start" ? pct(span.start) : `calc(${pct(span.end)} - 0.75rem)` }}
                    >
                      <span aria-hidden className="h-4 w-0.5 rounded-full bg-black/50" />
                    </span>
                  ))}
              </>
            ) : (
              // Off the crop tab, the kept part only shows: a thin outline, for what's described.
              trimmed && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 rounded-md border border-white/70"
                  style={{ left: pct(span.start), width: pct(spanLength(span)) }}
                />
              )
            )}
          </div>
          {/* The splits: a line through the frames, white over a dark edge so it shows on light
              frames and dark (dashed where the limit placed it), under a flag on the lane above. A
              split several platforms share shows as one tag, scissors and clip number, its
              platforms' flags tucked away until it's hovered or focused, so one can be dragged off. */}
          {splits.map((g) => {
            const ids = g.platforms.map((p) => p.adapter.id)
            const all = g.platforms.length > 1
            const index = mostCommon(g.platforms.map((p) => p.index))
            const faded = !!focus && !ids.includes(focus)
            const manual = g.platforms.some((p) => p.manual)
            const grabbed = !!held && Math.abs(held.t - g.t) < 0.05 && held.ids.every((id) => ids.includes(id))
            const removing = grabbed && held!.removing
            // Picked: the tag (the group), or one of its flags (that platform's alone).
            const pickedHere = !!picked && Math.abs(picked.t - g.t) < 0.05 && picked.ids.every((id) => ids.includes(id))
            // Near the end, the flags hang to the left of their line, so they stay over the frames.
            const flip = g.t > duration * 0.85
            const movable = editable && !!onMoveSplit
            const slider = (p: string[], label: string) =>
              movable
                ? {
                    role: "slider",
                    tabIndex: 0,
                    "aria-label": label,
                    "aria-valuemin": Math.round(span.start),
                    "aria-valuemax": Math.round(span.end),
                    "aria-valuenow": Math.round(g.t),
                    "aria-valuetext": tc(g.t),
                    "aria-current": isPick(picked, g.t, p) || undefined,
                    onPointerDown: (e: React.PointerEvent) => dragSplit(e, g, p),
                    onKeyDown: splitKey(g, p),
                    onFocus: () => onPick?.({ t: g.t, ids: p }),
                  }
                : { "aria-hidden": true }
            return (
              <div
                // Who splits here and which clip starts here: the same as it moves, so a focused
                // flag keeps focus as it passes another platform's.
                key={groupKey(g)}
                className={cn(
                  "absolute top-0 bottom-0 z-20 transition-opacity",
                  faded && "opacity-40 hover:opacity-100 focus-within:opacity-100",
                  (grabbed || pickedHere) && "opacity-100",
                  // Above the other splits, so its flags show whole.
                  pickedHere && "z-30",
                )}
                style={{ left: pct(g.t) }}
              >
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute top-4 bottom-4 -translate-x-1/2 shadow-[0_0_0_1px_rgb(0_0_0/0.5)]",
                    removing
                      ? "w-0.5 bg-destructive"
                      : pickedHere
                        ? "w-0.5 bg-sky-400"
                        : manual
                        ? "w-0.5 bg-white"
                        : "w-0 border-l-2 border-dashed border-white",
                  )}
                />
                <div
                  // No gap between the tag and its flags: the pointer must stay on one for the hover to hold.
                  className={cn("absolute top-0 flex", all && "group/split", flip ? "right-0 flex-row-reverse" : "left-0")}
                >
                  {all && (
                    <span
                      {...slider(ids, `Split for ${g.platforms.map((p) => p.adapter.name).join(", ")}, before clip ${index}`)}
                      className={cn(
                        "flex h-4 items-center gap-0.5 rounded-sm px-1 text-[10px] leading-none font-semibold whitespace-nowrap tabular-nums shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400",
                        flip ? "rounded-br-none" : "rounded-bl-none",
                        removing ? "bg-destructive text-white" : "bg-foreground text-background",
                        movable && "cursor-grab touch-none active:cursor-grabbing",
                        isPick(picked, g.t, ids) && "ring-2 ring-sky-400",
                      )}
                    >
                      {removing ? <XIcon className="size-2.5" /> : <ScissorsIcon className="size-2.5" />}
                      <span className="[text-box:trim-both_cap_alphabetic]">{index}</span>
                    </span>
                  )}
                  {g.platforms.map((p) => (
                    <span
                      key={p.adapter.id}
                      {...slider([p.adapter.id], `${p.adapter.name} split, before clip ${p.index}`)}
                      className={cn(
                        "block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400",
                        movable && "cursor-grab touch-none active:cursor-grabbing",
                        // In a group the padding stands in for a gap, so it's part of the hover area.
                        all && [
                          "hidden group-focus-within/split:block group-hover/split:block",
                          flip ? "pr-0.5" : "pl-0.5",
                          (p.adapter.id === focus || grabbed || pickedHere) && "block",
                        ],
                        isPick(picked, g.t, [p.adapter.id]) && "ring-2 ring-sky-400",
                      )}
                    >
                      <Flag
                        adapter={p.adapter}
                        label={removing && !all ? <XIcon className="size-2.5" /> : all && p.index === index ? undefined : p.index}
                        className={cn(
                          flip && "rounded-bl-sm rounded-br-none",
                          // One the limit placed is lighter: it moves on its own as the others do.
                          !p.manual && "opacity-75",
                          removing && "bg-destructive text-white",
                        )}
                      />
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
          {/* Each split's time, under its line: the lines run through the frames to here. Where
              times would overlap (close splits, a narrow screen), the one picked or held shows,
              then the opened platform's, then those placed by hand, then the rest, from the left. */}
          <div ref={labelRow} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-4">
            {splits.map((g) => {
              if (!shownTimes.has(g)) return null
              const grabbed = !!held && Math.abs(held.t - g.t) < 0.05
              const pickedHere = !!picked && Math.abs(picked.t - g.t) < 0.05
              return (
                <span
                  key={groupKey(g)}
                  className={cn(
                    "absolute bottom-0 -translate-x-1/2 text-xs whitespace-nowrap tabular-nums transition-opacity",
                    pickedHere ? "font-medium text-sky-400" : grabbed ? "text-foreground" : "text-muted-foreground",
                    !!focus && !g.platforms.some((p) => p.adapter.id === focus) && !grabbed && !pickedHere && "opacity-40",
                  )}
                  style={{ left: pct(g.t) }}
                >
                  {tc(g.t)}
                </span>
              )
            })}
          </div>
          {placing != null && (
            // A split being placed by a chip dragged over the timeline.
            <span
              aria-hidden
              className="pointer-events-none absolute top-4 bottom-5 z-20 w-0 -translate-x-1/2 border-l-2 border-dashed border-sky-400"
              style={{ left: pct(placing) }}
            />
          )}
          {/* The playhead: a line through the frames, and a knob on the lane above to drag it by. */}
          <span
            aria-hidden
            className={cn("pointer-events-none absolute top-2.5 w-0.5 -translate-x-1/2 bg-(--brand-blue)", splitList ? "bottom-5" : "bottom-0")}
            style={{ left: pct(time) }}
          />
          <span
            role="slider"
            tabIndex={0}
            aria-label="Playhead"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={tc(time)}
            onPointerDown={(e) => drag(e, "seek")}
            onKeyDown={(e) => {
              const d = arrow(e)
              if (d) onSeek(Math.min(duration, Math.max(0, time + d)))
            }}
            className="absolute top-0.5 z-30 size-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-background bg-(--brand-blue) shadow outline-none before:absolute before:-inset-2 focus-visible:ring-2 focus-visible:ring-sky-400 active:cursor-grabbing"
            style={{ left: pct(time) }}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMute}
          aria-label={muted ? "Sound on" : "Sound off"}
          aria-pressed={!muted}
          className={cn("shrink-0", splitList ? "mb-7.5" : "mb-2.5")}
        >
          {muted ? <VolumeXIcon /> : <Volume2Icon />}
        </Button>
      </div>
      <div className="relative flex justify-between gap-2 px-11 text-xs text-muted-foreground tabular-nums">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Times read minutes, seconds and frames. Keyboard shortcuts: comma and period step back or forward a frame (a picked split, or the playhead), Shift with them a second${
                editable
                  ? "; Alt with them goes to the previous or next split (or the kept part's start or end); Delete removes a picked split."
                  : "."
              }`}
              // Under the sound button; a 16px icon with a 28px hit area (the pseudo-element), as on the cards.
              className="absolute top-0 right-2.5 rounded-full text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
            >
              <CircleHelpIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-left text-base">
            {/* Three columns, so comma and period line up down the rows: the modifier (Shift, Alt;
                Delete on its own), the two keys, what they do; each row on one line. */}
            <dl className="grid grid-cols-[repeat(3,max-content)] items-center gap-x-2 gap-y-2 text-left whitespace-nowrap">
              {/* Each part in its own color, its word beside it in the same: the tooltip is the page's
                  opposite (dark on a light page, light on a dark one), so the shades flip with it. */}
              <dt className="col-span-2 font-semibold tabular-nums">
                <span className={TC_COLORS[0]}>0</span>:<span className={TC_COLORS[1]}>49</span>:
                <span className={TC_COLORS[2]}>15</span>
              </dt>
              <dd className="ml-1">
                <span className={TC_COLORS[0]}>Minutes</span> : <span className={TC_COLORS[1]}>Seconds</span> :{" "}
                <span className={TC_COLORS[2]}>Frames</span>
              </dd>
              {(
                [
                  [null, "Back or forward a frame"],
                  ["Shift", "Back or forward a second"],
                  ...(editable ? [["Alt", "Previous or next split, or the start or end"]] : []),
                ] as [string | null, string][]
              ).map(([mod, what]) => (
                <Fragment key={what}>
                  <dt>{mod && <Keys keys={[mod]} />}</dt>
                  <dt>
                    <Keys keys={[",", "."]} />
                  </dt>
                  <dd className="ml-1">{what}</dd>
                </Fragment>
              ))}
              {editable && (
                <>
                  <dt className="col-span-2">
                    <Keys keys={["Del"]} />
                  </dt>
                  <dd className="ml-1">Remove a picked split</dd>
                </>
              )}
            </dl>
          </TooltipContent>
        </Tooltip>
        <span className="text-(--brand-blue-text)">{tc(time)}</span>
        <span>
          {trimmed ? (
            <>
              {tc(span.start)} – {tc(span.end)}
              <span className="text-foreground"> · {tc(spanLength(span))} kept</span>
            </>
          ) : (
            tc(duration)
          )}
        </span>
      </div>
    </div>
  )
}

/**
 * Minutes, seconds and frames in red, green and blue, for the ? card: one OKLCH lightness for all
 * three, so none stands out but by hue. The tooltip is the page's opposite, so on a light page
 * (a dark tooltip) they're light, and on a dark page (a light one) dark.
 */
const TC_COLORS = [
  "font-semibold text-[oklch(0.78_0.14_25)] dark:text-[oklch(0.52_0.17_25)]",
  "font-semibold text-[oklch(0.78_0.14_145)] dark:text-[oklch(0.52_0.17_145)]",
  "font-semibold text-[oklch(0.78_0.14_260)] dark:text-[oklch(0.52_0.17_260)]",
]

/** Key caps, side by side: a mark (comma, period) large, so it reads at a glance; a word (Shift) at the text's size. */
function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className={cn(
            "grid h-7 min-w-7 place-items-center rounded border border-current/30 px-1.5 font-sans leading-none font-semibold",
            k.length > 1 ? "text-base" : "text-xl",
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}

type LengthProps = {
  presets: LengthPreset[]
  /** The length the span is held to, or null while its edges move freely. */
  locked: number | null
  onLock: (seconds: number | null) => void
  length: number
  /** The video's frame rate, for the times. */
  fps?: number
}

/**
 * The Length row: Lock, which holds the span to its length as it is (or lets it go again), then
 * each platform cap the video runs past, to hold it to (the platforms' marks on the button).
 */
export function LengthControls({ presets, locked, onLock, length, fps }: LengthProps) {
  const tc = (t: number) => formatTimecode(t, fps)
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Length">
      <RowLabel>Length</RowLabel>
      {/* One width whether locked or not, the time on its right, so it doesn't jump as it changes. */}
      <Button
        variant="outline"
        size="sm"
        aria-pressed={locked !== null}
        aria-label={locked !== null ? `Locked to ${tc(locked)}; unlock` : `Lock to ${tc(length)}`}
        onClick={() => onLock(locked === null ? length : null)}
        className={cn(
          "w-36 justify-between tabular-nums",
          locked !== null && CHOSEN,
        )}
      >
        <span className="flex items-center gap-1.5">
          {locked !== null ? <LockIcon /> : <LockOpenIcon />}
          {locked !== null ? "Locked" : "Lock"}
        </span>
        <span>{tc(locked ?? length)}</span>
      </Button>
      {presets.map((p) => {
        const active = locked === p.seconds
        const names = p.platforms.map((x) => x.label).join(", ")
        return (
          <Tooltip key={p.seconds}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={active}
                aria-label={`${formatDuration(p.seconds)}, for ${names}`}
                onClick={() => onLock(active ? null : p.seconds)}
                className={cn("tabular-nums", active && CHOSEN)}
              >
                {formatDuration(p.seconds)}
                <span className="flex gap-0.5">
                  {p.platforms
                    .filter((x, i, all) => all.findIndex((y) => y.adapter.id === x.adapter.id) === i)
                    .map(({ adapter }) => (
                      <span
                        key={adapter.id}
                        style={{ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties}
                      >
                        <PlatformLogo adapter={adapter} className="size-3.5" />
                      </span>
                    ))}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{names}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
