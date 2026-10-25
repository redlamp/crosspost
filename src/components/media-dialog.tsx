"use client"

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ScissorsIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { CHOSEN, CropFrame, CropShapes, isFull, RowLabel, useCrop, type Size } from "@/components/crop-editor"
import { PlatformLogo } from "@/components/platform-logo"
import { LengthControls, SNAP_DISTANCE, VideoTimeline, type SplitGroup, type SplitPick } from "@/components/trim-timeline"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { PlatformAdapter } from "@/lib/adapters"
import { track as trackUse } from "@/lib/analytics"
import { ALT_LIMIT, type CropRect, type StagedImage } from "@/lib/images"
import { formatDuration, isVideo, mediaKind, videoCap } from "@/lib/media"
import {
  addSplit,
  clipCap,
  clipsFor,
  groupMarks,
  moveSplit,
  removeSplit,
  canSplit,
  crowded,
  sameSplits,
  snapTo,
  splitMarks,
  type VideoSplits,
} from "@/lib/video-splits"
import { graphemeLength } from "@/lib/text"
import { formatTimecode, isWhole, lengthPresets, lockedSpan, MIN_SPAN, spanLength, type Span } from "@/lib/trim"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/media"
import { readFirstLook, readStrip } from "@/lib/video-frames"
import { estimateBytes, readFrameRate, renderVideo, scaledSize, sizesBelow, targetBitrate, type SourceInfo } from "@/lib/video-edit"

export type MediaTab = "alt" | "edit"

/**
 * A video's edit, saved: the file it now is, and the crop, trim and size that made it (none: the
 * video as added).
 */
export type VideoChange = { blob: Blob; crop?: CropRect; trim?: Span; resize?: number }

type Props = {
  image: StagedImage
  /** Its number in the Compose tray. */
  n: number
  tab: MediaTab
  onTabChange: (tab: MediaTab) => void
  onClose: () => void
  /** The platforms shown, whose length caps the timeline offers. */
  platforms: PlatformAdapter[]
  onAltChange: (alt: string) => void
  /** An image's new crop (taken from the image as added), or null for all of it. */
  onCrop: (crop: CropRect | null) => void
  onVideoChange: (change: VideoChange) => void
  /**
   * Move to the previous (-1) or next (1) image or video in the tray, the tab kept; set only when
   * there's more than one. `neighbors` names them ("Image 3"), for the side buttons.
   */
  onNavigate?: (dir: -1 | 1) => void
  neighbors?: { prev: string; next: string }
  /** The items the side buttons lead to, got ready ahead (loaded and decoded) so moving to one doesn't flicker. */
  ahead?: StagedImage[]
  /** A video's splits into clips: what's needed to show and change them (none: an image). */
  splitting?: (id: string) => VideoSplitting
}

/** Splitting a video into clips for each platform, as Compose splits text into posts. */
export type VideoSplitting = {
  /** Each platform the video goes to, and whether it shares its post there with other photos or videos. */
  platforms: { adapter: PlatformAdapter; withOthers: boolean }[]
  /** The splits placed by hand, per platform, in seconds into the file as added. */
  splits: VideoSplits
  /** Keep new splits (on Save). */
  onSplits: (next: VideoSplits) => void
  /** Opened from this platform's card: its splits come forward, and the fits box speaks for it. */
  focus?: string
}

/** Pointer movement before pressing a chip becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4

const sameCrop = (a?: CropRect | null, b?: CropRect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)
const sameSpan = (a?: Span, b?: Span) => a === b || (!!a && !!b && a.start === b.start && a.end === b.end)

/**
 * Controls that open only on the crop tab, sliding the picture below them down to make room (and
 * back up): the row grows from nothing as its content fades in.
 */
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      {/* Clipped while it grows; a few pixels of room so focus rings aren't cut off. */}
      <div className="-m-1 min-h-0 overflow-hidden">
        <div className="p-1">{children}</div>
      </div>
    </div>
  )
}

/**
 * A round button beside the panel, to the tray's previous or next item: outside the panel from
 * the sm breakpoint, inside its edge on phones.
 */
function SideButton({ dir, label, onClick, disabled }: { dir: -1 | 1; label: string; onClick: () => void; disabled: boolean }) {
  const Icon = dir < 0 ? ChevronLeftIcon : ChevronRightIcon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          aria-label={`${dir < 0 ? "Previous" : "Next"}: ${label}`}
          className={cn(
            "absolute top-56 z-10 size-11 rounded-full bg-background/90 shadow-lg backdrop-blur dark:bg-background/90",
            dir < 0 ? "left-2 sm:-left-16" : "right-2 sm:-right-16",
          )}
        >
          <Icon className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={dir < 0 ? "left" : "right"}>
        {label} <kbd className="ml-1 font-sans opacity-70">{dir < 0 ? "←" : "→"}</kbd>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The sizes a video can be made: as it is, or a standard size below it, with about how big the
 * file comes to ("~11 MB (76% smaller)", smaller than Original) and its resolution on the right.
 */
function SizeControls({
  crop,
  value,
  onChange,
  bytes,
}: {
  crop: { w: number; h: number }
  value: number | undefined
  onChange: (short: number | undefined) => void
  /** About how many bytes the edit comes to at a size (undefined: Original). */
  bytes: (short: number | undefined) => number
}) {
  const options = sizesBelow(crop.w, crop.h)
  const out = scaledSize(crop.w, crop.h, value)
  const size = bytes(value)
  const original = bytes(undefined)
  const smaller = value && original > 0 ? Math.round((1 - size / original) * 100) : 0
  const choices: { label: string; short?: number }[] = [{ label: "Original" }, ...options.map((s) => ({ label: `${s}p`, short: s }))]
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Size">
      <RowLabel>Size</RowLabel>
      {choices.map((c) => {
        const active = c.short === value
        return (
          <Button
            key={c.label}
            variant="outline"
            size="sm"
            aria-pressed={active}
            onClick={() => onChange(c.short)}
            className={cn("tabular-nums", active && CHOSEN)}
          >
            {c.label}
          </Button>
        )
      })}
      <span className="ml-1 text-sm text-muted-foreground tabular-nums">
        ~{formatBytes(size)}
        {smaller > 0 && <span className="text-(--brand-blue-text)"> ({smaller}% smaller)</span>}
      </span>
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
        {out.width} × {out.height}
      </span>
    </div>
  )
}

/** Keys an arrow press belongs to rather than the dialog's paging: text, sliders, the crop frame, the tabs. */
const OWNS_ARROWS = 'input, textarea, [contenteditable], [role="slider"], [role="tab"], [aria-label^="Crop frame"]'

/**
 * An image's or video's dialog, in two tabs, Alt Text and Crop (Crop & Trim on a video), around
 * one picture that stays put between them: on a video, one player and timeline, the same on both
 * tabs. Alt Text, the default, is the preview too: the picture as it goes out, larger (the crop
 * applied, the trim playing). The crop tab's controls slide in above and below it, and there the
 * frame and the trim's edges can be moved. One Save keeps both tabs' changes. Side buttons (and the arrow keys) move to the tray's other images and videos,
 * saving this one's changes first. Crops and trims are always taken from the file as it was
 * added, so they can be changed or undone later.
 */
/** A file's object URL for the dialog's visit, and once an image is ready, its size (and the decoded image, kept). */
type Ready = {
  url: string
  size?: Size
  /** Being got ready (or done): the neighbors' effect starts each file once. */
  started?: boolean
  /** An image, kept decoded; for a video, its opening frame, decoded, at `poster`. */
  img?: HTMLImageElement
  poster?: string
  /** A video's length, its timeline's frames, and the read of them under way. */
  duration?: number
  frames?: string[]
  reading?: Promise<string[]>
}

export function MediaDialog(props: Props) {
  // How the open item closes (stopping an edit being made), for the dialog's own close: the
  // overlay, Escape, the X.
  const closerRef = useRef(props.onClose)
  // What Escape does first, if anything (let a picked split go), before it closes the dialog.
  const escapeRef = useRef<() => boolean>(() => false)
  // One object URL per file for the whole visit, made the moment it's asked for, so an item's
  // picture is there on its first frame; let go a moment after the dialog closes (a moment, so
  // React's development double mount doesn't let go of URLs still in use).
  const [files] = useState(() => new Map<Blob, Ready>())
  const release = useRef<{ timer?: ReturnType<typeof setTimeout>; closed?: boolean }>({})
  const urlFor = useCallback(
    (blob: Blob) => {
      let ready = files.get(blob)
      if (!ready) files.set(blob, (ready = { url: URL.createObjectURL(blob) }))
      return ready
    },
    [files],
  )
  useEffect(() => {
    const r = release.current
    clearTimeout(r.timer)
    r.closed = false
    return () => {
      r.timer = setTimeout(() => {
        r.closed = true
        for (const ready of files.values()) {
          URL.revokeObjectURL(ready.url)
          if (ready.poster) URL.revokeObjectURL(ready.poster)
        }
        files.clear()
      }, 2000)
    }
  }, [files])
  // The neighbors got ready ahead, so moving to one shows it at once: an image loaded, decoded
  // and measured; a video's opening frame (decoded, to stand in until the video's own is in), its
  // size and length, then its timeline's frames.
  const { ahead } = props
  useEffect(() => {
    // Loaded, and decoding in the background (kept, so it stays decoded); nothing waits on the
    // decode, which can hold off until the page next paints.
    const load = (url: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          img.decode().catch(() => {})
          resolve(img)
        }
        img.onerror = reject
        img.src = url
      })
    for (const item of ahead ?? []) {
      const ready = urlFor(item.original ?? item.blob)
      if (ready.started) continue
      ready.started = true
      if (!isVideo(item)) {
        load(ready.url)
          .then((img) => {
            ready.img = img
            ready.size = { w: img.naturalWidth, h: img.naturalHeight }
          })
          .catch(() => {})
        continue
      }
      // None of it outlives the dialog: once it has closed, what comes back is let go.
      readFirstLook(ready.url, item.trim?.start ?? 0)
        .then(async (look) => {
          if (release.current.closed) return
          const poster = URL.createObjectURL(look.poster)
          try {
            ready.img = await load(poster)
          } catch (err) {
            URL.revokeObjectURL(poster)
            throw err
          }
          if (release.current.closed) return URL.revokeObjectURL(poster)
          ready.poster = poster
          ready.size = { w: look.width, h: look.height }
          if (Number.isFinite(look.duration)) ready.duration = look.duration
          if (ready.duration && !ready.frames && !ready.reading) {
            const reading = readStrip(
              ready.url,
              ready.duration,
              (frames) => (ready.frames = frames),
              () => !release.current.closed,
            )
            ready.reading = reading
            // Forgotten once it ends, either way, so a strip opened later reads again if it fell short.
            const forget = () => {
              if (ready.reading === reading) ready.reading = undefined
            }
            await reading.then(forget, forget)
          }
        })
        .catch(() => {})
    }
  }, [ahead, urlFor])
  return (
    <Dialog open onOpenChange={(open) => !open && closerRef.current()}>
      {/* Pinned near the top rather than centered, so the title and tabs stay put as the crop
          tab's controls open and close below them: switching tabs needs no move of the pointer.
          A tall dialog scrolls under them. One dialog for the whole visit: moving to another item
          swaps only what's inside, so the panel doesn't play its opening again. */}
      <DialogContent
        // On opening, the panel itself takes focus, not a field in it (the dialog's own choice would
        // be the first tab), and so not the Compose box behind it either: the arrow keys page
        // through the tray at once, and the text box waits for a click.
        onEscapeKeyDown={(e) => {
          if (escapeRef.current()) e.preventDefault()
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
        }}
        // The panel itself doesn't scroll, so the side buttons can sit outside it; its body does.
        className="top-[max(1rem,6dvh)] max-h-none translate-y-0 gap-0 overflow-visible p-0 sm:max-w-2xl"
      >
        {/* Fresh for each item, so its edits start from what's saved. */}
        <MediaItem key={props.image.id} {...props} closerRef={closerRef} escapeRef={escapeRef} urlFor={urlFor} />
      </DialogContent>
    </Dialog>
  )
}

/** One item's tabs, picture and buttons, inside the dialog. */
function MediaItem({
  image,
  n,
  tab,
  onTabChange,
  onClose,
  platforms,
  onAltChange,
  onCrop,
  onVideoChange,
  onNavigate,
  neighbors,
  splitting: splittingFor,
  closerRef,
  escapeRef,
  urlFor,
}: Props & {
  closerRef: React.RefObject<() => void>
  escapeRef: React.RefObject<() => boolean>
  urlFor: (blob: Blob) => Ready
}) {
  const video = isVideo(image)
  const Kind = video ? "Video" : "Image"
  const kind = mediaKind(image)
  const editName = video ? "Crop & Trim" : "Crop"
  const editing = tab === "edit"
  const tabName = editing ? editName : "Alt Text"

  const [text, setText] = useState(image.alt ?? "")
  const count = graphemeLength(text)
  const over = count > ALT_LIMIT

  // The file as it was added, to edit from: a fresh object URL, revoked when the dialog goes.
  // The file as it was added, to edit from: its URL from the dialog, there from the first frame.
  const source = image.original ?? image.blob
  const ready = urlFor(source)
  const sourceUrl = ready.url

  const crop = useCrop(image.crop, ready.size)

  // A video's length (the file as added), its kept span, the length it's locked to, if any, and
  // the size to make it.
  // Known ahead for a video the dialog got ready, so its timeline is there from the first frame.
  const [duration, setDuration] = useState<number | null>(video ? (ready.duration ?? null) : null)
  // Its opening frame, ready and decoded: holds the video's place, at its shape, until the video's
  // own first frame is in. Taken once, as the item opens, so the video isn't moved after.
  const [poster] = useState(() => (video ? ready.poster : undefined))
  const [span, setSpan] = useState<Span | null>(image.trim ?? null)
  const [locked, setLocked] = useState<number | null>(null)
  const [resize, setResize] = useState<number | undefined>(image.resize)
  const [unplayable, setUnplayable] = useState(false)
  // One frame, for the arrow keys' nudges on the timeline: read from the file, 30 a second until then.
  const [frame, setFrame] = useState<number | undefined>()
  useEffect(() => {
    if (!video) return
    let live = true
    readFrameRate(source).then((rate) => live && rate && setFrame(1 / rate))
    return () => {
      live = false
    }
  }, [video, source])
  const player = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const kept = span ?? (duration ? { start: 0, end: duration } : null)
  // The preview plays the kept part, over and over, while it plays.
  const keptRef = useRef(kept)
  useEffect(() => {
    keptRef.current = kept
  })
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const el = player.current
      const k = keptRef.current
      if (el && k) {
        if (el.currentTime >= k.end || el.currentTime < k.start - 0.25) el.currentTime = k.start
        setTime(el.currentTime)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])
  const seek = (t: number) => {
    if (player.current) player.current.currentTime = t
    setTime(t)
  }
  const togglePlay = () => {
    const el = player.current
    if (!el || !kept) return
    if (!el.paused) return el.pause()
    if (el.currentTime < kept.start || el.currentTime >= kept.end - 0.05) seek(kept.start)
    void el.play().catch(() => {})
  }
  const toggleMute = () => {
    if (player.current) player.current.muted = !muted
    setMuted(!muted)
  }
  const lock = (seconds: number | null) => {
    setLocked(seconds)
    if (seconds !== null && kept && duration) {
      const next = lockedSpan(kept, seconds, duration)
      setSpan(next)
      seek(next.start)
    }
  }
  const presets = duration ? lengthPresets(platforms, duration) : []
  const keptLength = kept ? spanLength(kept) : 0

  // Splitting into clips, as Compose splits text into posts: each platform's splits placed by hand
  // (changed here, kept on Save), and its length limit's around them.
  const splitting = video ? splittingFor?.(image.id) : undefined
  const [hand, setHand] = useState<VideoSplits>(() => splitting?.splits ?? {})
  const focusId = splitting?.focus
  const focused = splitting?.platforms.find((p) => p.adapter.id === focusId)?.adapter
  /** Each platform's clips of the kept part, and where they start. */
  const clipsBy = kept
    ? (splitting?.platforms ?? []).map(({ adapter, withOthers }) => {
        const own = hand[adapter.id] ?? []
        const handSplit = clipsFor(kept, undefined, own).length > 1
        const clips = clipsFor(kept, clipCap(adapter, keptLength, { withOthers, handSplit }), own)
        return { adapter, withOthers, clips, marks: splitMarks(clips, own) }
      })
    : []
  const groups: SplitGroup[] = groupMarks(clipsBy.map((c) => ({ id: c.adapter.id, marks: c.marks }))).map((g) => ({
    t: g.t,
    platforms: g.platforms.map((p) => ({ ...p, adapter: clipsBy.find((c) => c.adapter.id === p.id)!.adapter })),
  }))
  // Times as minutes, seconds and frames; splits land on whole frames.
  const fps = frame ? 1 / frame : 30
  const tc = (t: number) => formatTimecode(t, fps)
  const onFrame = (t: number) => Math.round(t * fps) / fps
  /** A time held clear of the kept part's ends, where a split can go. */
  const inside = (t: number) => (kept ? Math.min(kept.end - MIN_SPAN, Math.max(kept.start + MIN_SPAN, t)) : t)
  // The splits as they are this moment, for a drag or a run of key presses that changes them
  // faster than the dialog renders: each change starts from the last, not from the last render.
  const handNow = useRef(hand)
  const putHand = (next: VideoSplits) => {
    handNow.current = next
    setHand(next)
  }
  const editHand = (ids: string[], change: (own: number[]) => number[]) => {
    const h = handNow.current
    putHand({ ...h, ...Object.fromEntries(ids.map((id) => [id, change(h[id] ?? [])])) })
  }
  const addSplitAt = (ids: string[], at: number) => {
    if (!kept) return
    const t = onFrame(at)
    if (!canSplit(kept)) {
      toast.info("This part is too short to split: each clip needs at least half a second.")
      return
    }
    if (t <= kept.start + MIN_SPAN / 2 || t >= kept.end - MIN_SPAN / 2) {
      toast.info("Move the playhead to where the next clip should start, then click the split button.")
      return
    }
    editHand(ids, (own) => addSplit(own, t, kept))
  }
  /**
   * Move the platforms' split at `from` toward `to`; returns where it lands. Where that's too
   * close to another of a platform's own splits (they'd merge, or make a clip under half a
   * second), it stays put, so it's never lost into its neighbor.
   */
  const moveSplitTo = (from: number, to: number, ids: string[]) => {
    if (!kept) return from
    const at = inside(onFrame(to))
    if (ids.some((id) => crowded(handNow.current[id] ?? [], at, from))) return from
    editHand(ids, (own) => moveSplit(own, from, at, kept))
    return at
  }
  // Removing a split offers Undo, which puts back that split alone (splits added since stay); the
  // toast goes with this item, as its splits do once it's saved or left.
  const undoToast = useRef<string | number | null>(null)
  useEffect(
    () => () => {
      if (undoToast.current !== null) toast.dismiss(undoToast.current)
    },
    [],
  )
  const removeSplitAt = (at: number, ids: string[]) => {
    const had = ids.filter((id) => (handNow.current[id] ?? []).some((h) => Math.abs(h - at) < 0.05))
    if (!had.length) return
    editHand(had, (own) => removeSplit(own, at))
    undoToast.current = toast("Split removed", {
      action: {
        label: "Undo",
        onClick: () => editHand(had, (own) => [...own.filter((h) => Math.abs(h - at) >= 0.05), at].sort((a, b) => a - b)),
      },
    })
  }
  // The split picked on the timeline, to nudge or remove from the Splits row (or with the keys).
  const [pick, setPick] = useState<SplitPick | null>(null)
  const pickedGroup =
    pick && groups.find((g) => Math.abs(g.t - pick.t) < 0.05 && pick.ids.every((id) => g.platforms.some((p) => p.adapter.id === id)))
  const picked = pickedGroup ? pick : null
  const nudgePick = (d: number) => {
    if (!picked) return
    const at = moveSplitTo(picked.t, picked.t + d, picked.ids)
    setPick({ ...picked, t: at })
    seek(at)
  }
  useEffect(() => {
    escapeRef.current = () => {
      if (!picked) return false
      setPick(null)
      return true
    }
  })
  const handChanged =
    !!splitting &&
    [...new Set([...Object.keys(hand), ...Object.keys(splitting.splits)])].some(
      (id) => !sameSplits(hand[id] ?? [], splitting.splits[id] ?? []),
    )
  const keepSplits = () => {
    if (splitting && handChanged) splitting.onSplits(hand)
  }
  // The chips: All (every platform) and each platform. Click one to split at the playhead, or drag
  // it onto the timeline, where a dashed line shows where the split would go.
  const track = useRef<HTMLDivElement>(null)
  const [placing, setPlacing] = useState<number | null>(null)
  const chipDragged = useRef(false)
  const chipDown = (ids: string[]) => (e: React.PointerEvent) => {
    if (e.button !== 0 || !kept || !duration) return
    // A fresh press: a drag before that ended off the chip (so its click never came) is over.
    chipDragged.current = false
    const start = { x: e.clientX, y: e.clientY }
    let dragging = false
    let at: number | null = null
    // Over the track (or near it): the time under the pointer.
    const over = (ev: PointerEvent) => {
      const box = track.current?.getBoundingClientRect()
      if (!box || ev.clientX < box.left || ev.clientX > box.right || ev.clientY < box.top - 16 || ev.clientY > box.bottom + 16)
        return null
      // Pulled onto a split already there (another platform's), to share it.
      const t = ((ev.clientX - box.left) / box.width) * duration
      return inside(snapTo(t, groups.map((g) => g.t), (SNAP_DISTANCE / box.width) * duration))
    }
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return
      dragging = true
      chipDragged.current = true
      at = over(ev)
      setPlacing(at)
    }
    const end = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      setPlacing(null)
      if (dragging && at !== null) addSplitAt(ids, at)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
  }
  const chips = [
    ...(clipsBy.length > 1 ? [{ key: "all", ids: clipsBy.map((c) => c.adapter.id), name: "every platform", count: 0 }] : []),
    ...clipsBy.map((c) => ({ key: c.adapter.id, ids: [c.adapter.id], name: c.adapter.name, count: c.clips.length })),
  ]

  // Saving a video's edit: how far along it is, and how to stop it.
  const [progress, setProgress] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const close = () => {
    abort.current?.abort()
    onClose()
  }
  useEffect(() => {
    closerRef.current = close
  })

  const nextCrop = isFull(crop.rect) ? undefined : crop.rect
  const nextTrim = kept && duration && !isWhole(kept, duration) ? kept : undefined
  // The crop in pixels, which the sizes are measured against; a size not below it is no change.
  const cropPx = crop.size && { w: Math.round(crop.rect.w * crop.size.w), h: Math.round(crop.rect.h * crop.size.h) }
  const nextResize = cropPx && resize && sizesBelow(cropPx.w, cropPx.h).includes(resize) ? resize : undefined
  // About what the edit comes to at a size, for the Size row: its bitrate over the kept length.
  const sourceInfo: SourceInfo | null =
    crop.size && duration ? { bytes: source.size, duration, width: crop.size.w, height: crop.size.h } : null
  const estimate = (short: number | undefined) => {
    if (!cropPx || !sourceInfo || !kept) return 0
    // Nothing to make: the video stays as it was added.
    if (!short && !nextCrop && !nextTrim) return source.size
    const out = scaledSize(cropPx.w, cropPx.h, short)
    return estimateBytes(targetBitrate(out, sourceInfo), kept.end - kept.start)
  }
  const edited =
    !sameCrop(nextCrop, image.crop) || (video && (!sameSpan(nextTrim, image.trim) || nextResize !== image.resize))
  const canReset =
    !!nextCrop || !!nextTrim || !!nextResize || locked !== null || crop.turned || Object.values(hand).some((h) => h.length)
  /** Keep this item's changes; false when they can't be kept (alt text over the limit, a failed edit). */
  const commit = async (): Promise<boolean> => {
    // One edit at a time (Ctrl+Enter in the text box can ask again while one is being made).
    if (progress !== null) return false
    if (over) {
      onTabChange("alt")
      return false
    }
    const alt = text.trim()
    if (alt !== (image.alt ?? "")) {
      if (alt) trackUse("edit/alt")
      onAltChange(alt)
    }
    // A video not read yet (its length and size come with it, and the trim and size need them):
    // nothing has been changed on it, so only the alt text is kept. Moving on fast, before it
    // loads, mustn't put it back to the video as added.
    if (video && (!duration || !crop.size)) return true
    if (!edited) {
      keepSplits()
      return true
    }
    if (!video) {
      if (nextCrop) trackUse("edit/crop")
      onCrop(nextCrop ?? null)
      return true
    }
    // Back to the video as added: nothing to make.
    if (!nextCrop && !nextTrim && !nextResize) {
      onVideoChange({ blob: source })
      keepSplits()
      return true
    }
    if (!crop.size) return false
    const controller = new AbortController()
    abort.current = controller
    setProgress(0)
    player.current?.pause()
    try {
      const blob = await renderVideo(
        source,
        {
          crop: nextCrop,
          trim: nextTrim,
          resize: nextResize,
          size: { width: crop.size.w, height: crop.size.h },
          duration: duration ?? 0,
        },
        setProgress,
        controller.signal,
      )
      onVideoChange({ blob, crop: nextCrop, trim: nextTrim, resize: nextResize })
      trackUse("edit/crop-trim")
      keepSplits()
      return true
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false
      setProgress(null)
      toast.error(`Couldn't edit video ${n} in this browser.`, {
        description: err instanceof Error ? err.message : undefined,
      })
      return false
    }
  }
  const save = async () => {
    if (await commit()) onClose()
  }
  /** To the tray's previous or next item, this one's changes kept first. */
  const go = async (dir: -1 | 1) => {
    if (!onNavigate || progress !== null) return
    if (await commit()) onNavigate(dir)
  }
  // The arrow keys page through the tray, unless something under focus uses them itself.
  const goRef = useRef(go)
  useEffect(() => {
    goRef.current = go
  })
  useEffect(() => {
    if (!onNavigate) return
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      if ((e.target as Element | null)?.closest?.(OWNS_ARROWS)) return
      e.preventDefault()
      void goRef.current(e.key === "ArrowLeft" ? -1 : 1)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [onNavigate])

  const reset = () => {
    crop.reset()
    setLocked(null)
    setSpan(null)
    setResize(undefined)
    putHand({})
    setPick(null)
  }

  const busy = progress !== null

  // Opened from a platform's card: whether its clips fit it (the finding), and what to do next.
  const fitStatus = (() => {
    const mine = clipsBy.find((c) => c.adapter.id === focusId)
    if (!mine || !kept) return null
    const { adapter, clips, withOthers } = mine
    const name = adapter.name
    const k = clips.length
    const lengths = clips.map(spanLength)
    const longest = Math.max(...lengths)
    const shortest = Math.min(...lengths)
    const even = lengths.every((l) => Math.abs(l - lengths[0]) < 0.05)
    const clipsSaid = even ? `${k} clips of ${tc(longest)}` : `${k} clips (${lengths.map(tc).join(", ")})`
    // About the biggest clip's size: the edit's, in proportion to its length.
    const bytes = keptLength ? (estimate(nextResize) * longest) / keptLength : 0
    const maxBytes = adapter.video?.maxBytes
    const minSeconds = adapter.video?.minSeconds
    const perPost = adapter.video?.perPost
    const cap = videoCap(adapter, withOthers || k > 1)
    if (maxBytes && bytes > maxBytes)
      return {
        ok: false,
        finding: `About ${formatBytes(bytes)}${k > 1 ? " a clip" : ""}; ${name} takes up to ${formatBytes(maxBytes)}.`,
        next: "Pick a smaller size, or trim it.",
      }
    if (minSeconds && shortest < minSeconds)
      return {
        ok: false,
        finding: `${k > 1 ? "The shortest clip runs" : "It runs"} ${tc(shortest)}; ${name} needs at least ${formatDuration(minSeconds)}.`,
        next: k > 1 ? "Move the split, or take it out." : "Trim less of it.",
      }
    if (k > 1 && perPost !== undefined && k > perPost)
      return {
        ok: false,
        finding: `${clipsSaid}, but ${name} takes ${perPost === 1 ? "one video" : `${perPost} videos`} a post.`,
        next: adapter.chain ? "Move clips to posts of their own on its card." : "Take out a split, or trim it.",
      }
    if (k > 1)
      return {
        ok: true,
        finding: `Fits ${name}: ${clipsSaid}, each its own video in the ${adapter.video?.carouselMaxSeconds ? "carousel" : "post"}.`,
        next: `Drag a split to move it, or the ${name} chip to add one.`,
      }
    return {
      ok: true,
      finding: `Fits ${name}${cap ? `: ${tc(keptLength)} of up to ${formatDuration(cap)}` : ""}.`,
      next: `Drag the ${name} chip onto the timeline to split it into clips.`,
    }
  })()

  return (
    <>
        {onNavigate && neighbors && (
          // To the tray's other images and videos, beside the panel, level with the picture and
          // at one height whatever the tab, so the pointer can rest there. Inside the edges on
          // phones, where there's no room beside it.
          <>
            <SideButton dir={-1} label={neighbors.prev} onClick={() => void go(-1)} disabled={busy} />
            <SideButton dir={1} label={neighbors.next} onClick={() => void go(1)} disabled={busy} />
          </>
        )}
        <div className="grid max-h-[calc(100dvh-max(1rem,6dvh)-1rem)] gap-4 overflow-x-hidden overflow-y-auto rounded-lg p-6">
        <DialogHeader>
          <DialogTitle>
            {/* The tab first, then the item, so the title changes at its start as the tab does. */}
            {tabName} – {Kind} {n}
            {focused && ` for ${focused.name}`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {editing
              ? "Drag inside the frame to move it, or a corner to resize it. With the keyboard, focus the frame: arrow keys move it, and Shift with the arrow keys resizes it."
              : `${Kind} ${n} as it will be posted. Describe it for people who can't see it.`}
            {onNavigate && " The left and right arrow keys move to the other images and videos."}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as MediaTab)} className="gap-0">
          {/* Two tabs of one width, across the dialog. */}
          <TabsList
            className="mb-4 grid w-full grid-cols-2"
            // The arrow keys page through the tray here too, rather than switch tabs (the tab
            // strip's own use of them); Tab reaches each tab instead, switching as it lands.
            onKeyDownCapture={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
              e.preventDefault()
              e.stopPropagation()
              if (onNavigate && !(e.altKey || e.ctrlKey || e.metaKey)) void go(e.key === "ArrowLeft" ? -1 : 1)
            }}
          >
            <TabsTrigger value="alt" disabled={busy} tabIndex={0}>
              Alt Text
            </TabsTrigger>
            <TabsTrigger value="edit" disabled={busy} tabIndex={0}>
              {editName}
            </TabsTrigger>
          </TabsList>
          {/* While an edit is being made, nothing here can change (by pointer or key): the edit
              takes what was set when Save was pressed. */}
          <div inert={busy} className={cn(busy && "opacity-60")}>
            <Reveal open={editing}>
              <div className="space-y-2 pb-3">
                <CropShapes crop={crop} />
                {video && cropPx && sourceInfo && (
                  <SizeControls crop={cropPx} value={nextResize} onChange={setResize} bytes={estimate} />
                )}
              </div>
            </Reveal>
            {unplayable ? (
              <p className="rounded-md bg-muted p-6 text-center text-sm text-muted-foreground">
                This browser can&apos;t play video {n}, so it can&apos;t be shown, cropped or trimmed here.
              </p>
            ) : (
              <CropFrame
                crop={crop}
                // On Alt Text, the picture as it goes out: the crop applied.
                mode={editing ? "edit" : "preview"}
              >
                {sourceUrl &&
                  (video ? (
                    <>
                    {poster && (
                      // eslint-disable-next-line @next/next/no-img-element -- a frame drawn here, as an object URL
                      <img
                        src={poster}
                        alt=""
                        draggable={false}
                        className={cn(
                          "block max-w-full transition-[max-height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                          editing ? "max-h-[42vh]" : "max-h-[58vh]",
                        )}
                      />
                    )}
                    <video
                      ref={player}
                      src={sourceUrl}
                      muted
                      playsInline
                      preload="auto"
                      onLoadedMetadata={(e) => {
                        const el = e.currentTarget
                        crop.setSize({ w: el.videoWidth, h: el.videoHeight })
                        // The tray's reading is of the file as it is now, which for an edited video
                        // isn't the one being edited from.
                        const d = Number.isFinite(el.duration) ? el.duration : image.original ? undefined : image.video?.duration
                        if (d) setDuration(d)
                        const start = span?.start ?? 0
                        if (start) {
                          el.currentTime = start
                          setTime(start)
                        }
                      }}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onError={() => setUnplayable(true)}
                      onClick={togglePlay}
                      className={cn(
                        // Over its opening frame, when there is one, filling the frame's place.
                        poster
                          ? "absolute inset-0 size-full"
                          : [
                              "block max-w-full transition-[max-height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                              // Larger on Alt Text, the preview; smaller on the crop tab, to make room for its controls.
                              editing ? "max-h-[42vh]" : "max-h-[58vh]",
                            ],
                      )}
                    />
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- a local object URL
                    <img
                      src={sourceUrl}
                      alt=""
                      draggable={false}
                      onLoad={(e) => crop.setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                      className={cn(
                        "block max-w-full transition-[max-height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                        editing ? "max-h-[50vh]" : "max-h-[66vh]",
                      )}
                    />
                  ))}
              </CropFrame>
            )}
            {video && kept && duration && sourceUrl && !unplayable && (
              <>
                <div className="pt-3">
                  <VideoTimeline
                    url={sourceUrl}
                    duration={duration}
                    span={kept}
                    onSpan={setSpan}
                    editable={editing}
                    locked={locked !== null}
                    time={time}
                    onSeek={seek}
                    playing={playing}
                    onTogglePlay={togglePlay}
                    muted={muted}
                    onToggleMute={toggleMute}
                    strip={ready}
                    splits={groups}
                    focus={focusId}
                    onMoveSplit={moveSplitTo}
                    onRemoveSplit={removeSplitAt}
                    placing={placing}
                    trackRef={track}
                    paused={busy}
                    picked={picked}
                    onPick={setPick}
                    frame={frame}
                  />
                </div>
                <Reveal open={editing}>
                  <div className="space-y-3 pt-3">
                    {fitStatus && (
                      // What the platform needs, and whether what's set now gives it that: right
                      // under the timeline, above the lengths that fix it, to draw the eye there.
                      <p
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                          // Not yet fixed: the app's warning color (amber, as on the rail's
                          // outlines); fixed: the app's blue.
                          fitStatus.ok
                            ? "border-(--brand-blue)/40 bg-(--brand-blue)/5"
                            : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:border-amber-400/50 dark:text-amber-300",
                        )}
                      >
                        {fitStatus.ok ? (
                          <CheckIcon className="size-4 shrink-0 text-(--brand-blue)" />
                        ) : (
                          <TriangleAlertIcon className="size-4 shrink-0" />
                        )}
                        {/* Two lines whatever it says (the finding, then what to do), so nothing
                            jumps as it changes. */}
                        <span className="flex min-h-10 flex-col justify-center">
                          <span>{fitStatus.finding}</span>
                          <span>{fitStatus.next}</span>
                        </span>
                      </p>
                    )}
                    {chips.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Splits">
                        <RowLabel>Splits</RowLabel>
                        {chips.map((chip) => {
                          const adapter = clipsBy.find((c) => c.adapter.id === chip.key)?.adapter
                          return (
                            <button
                              key={chip.key}
                              type="button"
                              // Too short to split (under a second): nothing to place.
                              disabled={!canSplit(kept)}
                              onPointerDown={chipDown(chip.ids)}
                              onClick={() => {
                                // A drag onto the timeline placed it already.
                                if (chipDragged.current) return void (chipDragged.current = false)
                                addSplitAt(chip.ids, time)
                              }}
                              aria-label={`Split ${chip.name} at the playhead, or drag onto the timeline${
                                chip.count > 1 ? ` (${chip.count} clips now)` : ""
                              }`}
                              style={adapter && ({ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties)}
                              // As Compose's chips: one neutral look, the logo carrying the brand.
                              // Opened from a card, the other platforms' chips fade.
                              className={cn(
                                "relative flex h-8 min-w-8 cursor-grab touch-none items-center justify-center gap-1 rounded-md border border-border bg-secondary px-2 text-sm font-medium transition-[background-color,opacity] hover:bg-accent active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50",
                                focusId && chip.key !== focusId && "opacity-50 hover:opacity-100",
                              )}
                            >
                              {adapter ? (
                                <>
                                  <PlatformLogo adapter={adapter} className="size-4" />
                                  {/* Its clips once it splits: no badge for one, none on All. */}
                                  {chip.count > 1 && (
                                    <span
                                      aria-hidden
                                      className="absolute -right-1.5 -bottom-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-(--brand-blue) px-1 text-[11px] leading-none font-semibold text-white tabular-nums ring-2 ring-background"
                                    >
                                      <span className="[text-box:trim-both_cap_alphabetic]">{chip.count}</span>
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <ScissorsIcon className="size-4" />
                                  All
                                </>
                              )}
                            </button>
                          )
                        })}
                        {picked && pickedGroup ? (
                          // The picked split: whose and where, a frame either way, and (placed by
                          // hand) remove. The keys do the same: comma and period, Delete.
                          <div className="ml-auto flex items-center gap-1.5" role="group" aria-label="Picked split">
                            <span className="flex items-center gap-1 text-sm">
                              {picked.ids.length === clipsBy.length && clipsBy.length > 1 ? (
                                <ScissorsIcon className="size-4" />
                              ) : (
                                pickedGroup.platforms
                                  .filter((p) => picked.ids.includes(p.adapter.id))
                                  .map((p) => (
                                    <span
                                      key={p.adapter.id}
                                      style={{ "--brand": p.adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties}
                                    >
                                      <PlatformLogo adapter={p.adapter} className="size-4" />
                                    </span>
                                  ))
                              )}
                              <span className="ml-0.5 font-medium text-sky-400 tabular-nums">{tc(picked.t)}</span>
                            </span>
                            <Button variant="outline" size="icon-sm" aria-label="Back a frame" onClick={() => nudgePick(-1 / fps)}>
                              <ChevronLeftIcon />
                            </Button>
                            <Button variant="outline" size="icon-sm" aria-label="Forward a frame" onClick={() => nudgePick(1 / fps)}>
                              <ChevronRightIcon />
                            </Button>
                            {pickedGroup.platforms.some((p) => picked.ids.includes(p.adapter.id) && p.manual) && (
                              <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label="Remove split"
                                onClick={() => {
                                  removeSplitAt(picked.t, picked.ids)
                                  setPick(null)
                                }}
                              >
                                <Trash2Icon />
                              </Button>
                            )}
                          </div>
                        ) : (
                          // Phones have no room beside the chips; the chips' labels say the same.
                          <span className="ml-auto hidden text-sm text-muted-foreground sm:inline">
                            or click to split at the playhead
                          </span>
                        )}
                      </div>
                    )}
                    <LengthControls presets={presets} locked={locked} onLock={lock} length={kept.end - kept.start} fps={fps} />
                  </div>
                </Reveal>
              </>
            )}
          </div>
          <TabsContent value="alt" className="mt-4 space-y-1.5">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save()
              }}
              placeholder={`Describe what the ${kind} shows`}
              aria-label={`Alt text for ${kind} ${n}`}
              aria-invalid={over || undefined}
              // While an edit is being made, the text it was asked with is the one kept.
              readOnly={busy}
              className="min-h-24"
            />
            <p className={cn("text-right text-xs tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
              {count.toLocaleString()} / {ALT_LIMIT.toLocaleString()}
            </p>
          </TabsContent>
          {/* The crop tab's controls sit around the picture, above. */}
          {/* Read by screen readers, but no stop for Tab: there's nothing to see or do in it. */}
          <TabsContent value="edit" className="sr-only" tabIndex={-1}>
            {video ? "Crop, trim and size controls are around the video above." : "Crop controls are above the image."}
          </TabsContent>
        </Tabs>
        <DialogFooter className="items-center gap-2">
          {editing && (
            <Button variant="ghost" size="sm" className="sm:mr-auto" disabled={!canReset || busy} onClick={reset}>
              Reset
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="lg" className="min-w-32 tabular-nums" onClick={() => void save()} disabled={over || busy}>
            {busy ? `Saving ${Math.round((progress ?? 0) * 100)}%` : "Save"}
          </Button>
        </DialogFooter>
        {busy && (
          <p className="-mt-2 text-right text-xs text-muted-foreground">
            Making the {nextTrim ? `${tc(nextTrim.end - nextTrim.start)} ` : ""}video here in your browser; nothing is uploaded.
          </p>
        )}
        </div>
    </>
  )
}
