"use client"

import {
  CheckIcon,
  CircleCheckBigIcon,
  CopyIcon,
  ExternalLinkIcon,
  ImagePlusIcon,
  LockIcon,
  PlusIcon,
  ScissorsIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { Fragment, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"

import { Flag } from "@/components/compose-editor"
import { Dot } from "@/components/dot"
import { PlatformLogo } from "@/components/platform-logo"
import type { PlatformAdapter } from "@/lib/adapters"
import { bluesky } from "@/lib/adapters/bluesky"
import { facebook } from "@/lib/adapters/facebook"
import { threads } from "@/lib/adapters/threads"
import { x } from "@/lib/adapters/x"
import { graphemeLength, splitChunks } from "@/lib/text"
import { cn } from "@/lib/utils"

// The introduction's illustrations: small drawings of Crosspost's own parts, with a drawn
// pointer (or finger, on touch screens) acting out each gesture. Each is laid out on a
// fixed canvas and zoomed to fit. Counts and splits come from the real adapters and splitter.

const STAGE_W = 520
/** Every drawing is this tall, so the panels match from step to step and tab to tab (Decide's live list too). */
export const STAGE_H = 260
/** The framed box each step's visual sits in, taller than the drawing so it has room around it. */
export const FRAME_H = 320

/** The sample post: 445 characters, so it splits on Bluesky and X. */
const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."

export type Point = { x: number; y: number }
type Wait = (ms: number) => Promise<void>

const brandVars = (adapter: PlatformAdapter) =>
  ({ "--brand": adapter.brand.color ?? "var(--foreground)" }) as React.CSSProperties

/** A platform card's look in a drawing: the app's own border and surface, as the real cards have. */
const MINI_CARD = "border-border bg-card"

/** The key that pastes: ⌘ on a Mac, Ctrl elsewhere. */
const PASTE_KEY =
  typeof navigator !== "undefined" &&
  /mac/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform)
    ? "⌘"
    : "Ctrl"

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (listener) => {
      const list = matchMedia(query)
      list.addEventListener("change", listener)
      return () => list.removeEventListener("change", listener)
    },
    () => matchMedia(query).matches,
    () => false,
  )
}

export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)")
/** A touch screen: the drawings use a finger, and Deliver shows a phone. */
export const useTouch = () => useMediaQuery("(pointer: coarse)")

/**
 * Plays `script` over and over, after `setup` once; returns a function that stops it
 * wherever it is (its pending wait never resolves). `pace` stretches every wait (1.4 is 40%
 * slower), so a drawing can linger without retiming each beat.
 */
export function loop(script: (wait: Wait) => Promise<void>, setup?: (wait: Wait) => Promise<void>, pace = 1) {
  let timer: number | undefined
  const wait: Wait = (ms) =>
    new Promise((resolve) => {
      timer = window.setTimeout(resolve, ms * pace)
    })
  void (async () => {
    await setup?.(wait)
    for (;;) await script(wait)
  })()
  return () => window.clearTimeout(timer)
}

/**
 * An element's box on the canvas, in canvas pixels (before zoom). Measured against the
 * canvas's own width, so the dialog's opening scale and the zoom both cancel out.
 */
function canvasBox(canvas: HTMLElement, el: Element) {
  const box = canvas.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  // The canvas width set on it (before zoom), against the width it shows at.
  const scale = box.width / parseFloat(canvas.style.width) || 1
  return {
    x: (r.left - box.left) / scale,
    y: (r.top - box.top) / scale,
    w: r.width / scale,
    h: r.height / scale,
  }
}

/** The middle of the element marked `data-at={name}`, in canvas pixels. */
function locate(canvas: HTMLElement | null, name: string): Point {
  const target = canvas?.querySelector(`[data-at="${name}"]`)
  if (!canvas || !target) return { x: 0, y: 0 }
  const { x, y, w, h } = canvasBox(canvas, target)
  return { x: x + w / 2, y: y + h / 2 }
}

/** How long the drawing takes to zoom to a new canvas height, and its ease: a quick start that glides to rest. */
const ZOOM_MS = 700
const easeOut = (t: number) => 1 - (1 - t) ** 3

/**
 * The frame for an illustration: a fixed canvas, zoomed to fill the frame (with a 10px margin)
 * either way, so the drawing keeps its proportions at phone widths. Read as one image. When
 * `height` changes, the drawing zooms to fit the new canvas, as a camera pulling back; with
 * `anchor="top"` it stays pinned at the top while it does. A `note` sits in a strip along the
 * bottom of the frame, at full size, under the drawing's own area.
 */
function Stage({
  label,
  canvasRef,
  width = STAGE_W,
  height = STAGE_H,
  anchor = "center",
  note,
  children,
}: {
  label: string
  canvasRef?: React.Ref<HTMLDivElement>
  width?: number
  height?: number
  anchor?: "center" | "top"
  note?: React.ReactNode
  children: React.ReactNode
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const fit = () => Math.min((frame.clientWidth - 20) / width, (frame.clientHeight - 20) / height)
    const show = (z: number) => {
      zoomRef.current = z
      setZoom(z)
    }
    // A new canvas size zooms there; the first fit, and any resize, simply fit.
    let frameId = 0
    const from = zoomRef.current
    const to = fit()
    if (from === null || Math.abs(from - to) < 0.001) show(to)
    else {
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ZOOM_MS)
        show(from + (to - from) * easeOut(t))
        frameId = t < 1 ? requestAnimationFrame(step) : 0
        // The frame may have changed size meanwhile.
        if (!frameId) show(fit())
      }
      frameId = requestAnimationFrame(step)
    }
    const ro = new ResizeObserver(() => {
      if (frameId) return
      show(fit())
    })
    ro.observe(frame)
    return () => {
      cancelAnimationFrame(frameId)
      ro.disconnect()
    }
  }, [width, height])

  return (
    <div
      role="img"
      aria-label={label}
      className="flex flex-col overflow-hidden rounded-lg border bg-[radial-gradient(ellipse_at_75%_100%,var(--background-end),var(--background)_85%)]"
    >
      <div
        ref={frameRef}
        className={cn("flex shrink-0 overflow-hidden", anchor === "top" ? "items-start pt-2.5" : "items-center")}
        style={{ height: FRAME_H }}
      >
        <div
          ref={canvasRef}
          aria-hidden
          className="relative mx-auto select-none"
          style={{ width, height, zoom }}
        >
          {children}
        </div>
      </div>
      {note && <div className="-mt-2 px-6 pb-6">{note}</div>}
    </div>
  )
}

export type Pose = "arrow" | "hand" | "grab" | "finger"

/**
 * The hand pointers, on a 24 by 24 grid. Each is one closed outline, so its white fill
 * covers the whole hand (Lucide draws hands as separate strokes, which leave gaps when
 * filled), with the creases between the fingers drawn on top. `at` is where on the grid
 * the pointer's point sits.
 */
const HANDS: Record<Exclude<Pose, "arrow">, { outline: string; creases: string; at: Point }> = {
  // Open, over something that can be dragged.
  hand: {
    outline:
      "M6.5 12V6A1.5 1.5 0 0 1 9.5 6V4.5A1.5 1.5 0 0 1 12.5 4.5V5.5A1.5 1.5 0 0 1 15.5 5.5V7.5A1.25 1.25 0 0 1 18 7.5V15C18 19 15.1 22 11.5 22H10.5C8.2 22 6.7 21.1 5.5 19.6L3.3 15.8A1.5 1.5 0 0 1 5.5 13.8L6.5 15Z",
    creases: "M9.5 6v5M12.5 5.5v5.5M15.5 7.5v4",
    at: { x: 11.5, y: 10 },
  },
  // Closed, while dragging.
  grab: {
    outline:
      "M6.5 12.5V10.5A1.5 1.5 0 0 1 9.5 10.5V9.5A1.5 1.5 0 0 1 12.5 9.5V10A1.5 1.5 0 0 1 15.5 10V11A1.25 1.25 0 0 1 18 11V15.5C18 19.3 15.1 22 11.5 22H10.5C8.2 22 6.7 21.1 5.5 19.6L3.8 16.6A1.5 1.5 0 0 1 6 14.6L6.5 15.2Z",
    creases: "M9.5 10.5v2.5M12.5 10v2.5M15.5 11v2",
    at: { x: 11.5, y: 11 },
  },
  // A fingertip, for touch screens.
  finger: {
    outline:
      "M8.5 12V3A1.5 1.5 0 0 1 11.5 3V9.5A1.5 1.5 0 0 1 14.5 9.5V10.5A1.5 1.5 0 0 1 17.5 10.5V11.5A1.5 1.5 0 0 1 20.5 11.5V16C20.5 19.6 17.8 22.5 14.3 22.5H13C10.8 22.5 9.4 21.7 8.2 20.3L4.4 16.6A1.6 1.6 0 0 1 6.7 14.4L8.5 16Z",
    creases: "M11.5 9.5v3M14.5 10.5v2.5M17.5 11.5v2",
    at: { x: 10, y: 1.5 },
  },
}
const HAND_SIZE = 22

function Hand({ pose }: { pose: Exclude<Pose, "arrow"> }) {
  const { outline, creases, at } = HANDS[pose]
  const scale = HAND_SIZE / 24
  return (
    <svg
      width={HAND_SIZE}
      height={HAND_SIZE}
      viewBox="0 0 24 24"
      className="block"
      style={{ transform: `translate(${-at.x * scale}px, ${-at.y * scale}px)` }}
    >
      <path d={outline} fill="white" stroke="black" strokeWidth={1.3} strokeLinejoin="round" />
      <path d={creases} fill="none" stroke="black" strokeWidth={1.1} strokeLinecap="round" />
    </svg>
  )
}

/**
 * A drawn pointer whose point sits at `at`, gliding there over `duration`. Open hand over
 * something it can drag, closed while dragging, as the real pointer shows; a fingertip on
 * touch screens, where `pressing` holds it down. Each new `clicks` count plays a ripple.
 */
export function Cursor({
  at,
  duration,
  pose = "arrow",
  clicks = 0,
  pressing = false,
  hidden = false,
  easing = "cubic-bezier(0.45, 0, 0.2, 1)",
  children,
}: {
  at: Point
  duration: number
  pose?: Pose
  clicks?: number
  pressing?: boolean
  hidden?: boolean
  easing?: string
  /** Carried along with the pointer, such as files being dragged in. */
  children?: React.ReactNode
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-30 drop-shadow-[0_1px_1px_rgb(0_0_0/0.35)]",
        hidden && "opacity-0",
      )}
      style={{
        transform: `translate(${at.x}px, ${at.y}px)`,
        transition: `transform ${duration}ms ${easing}, opacity 300ms`,
      }}
    >
      {children}
      {clicks > 0 && <Ripple key={clicks} />}
      {pressing && <span className="absolute -top-3.5 -left-3.5 size-7 rounded-full bg-foreground/30" />}
      {pose === "arrow" ? (
        <svg width="14" height="21" viewBox="0 0 14 21" className="block -translate-px">
          <path
            d="M1 1v16.2l3.9-3.7 2.6 6.3 2.4-1-2.6-6.2H13z"
            fill="white"
            stroke="black"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <Hand pose={pose} />
      )}
    </div>
  )
}

/** A click's ripple under the pointer; each one mounts afresh, so it plays once. */
function Ripple() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    ref.current?.animate(
      [
        { transform: "scale(0.3)", opacity: 1 },
        { transform: "scale(1.4)", opacity: 0 },
      ],
      { duration: 450, easing: "ease-out", fill: "forwards" },
    )
  }, [])
  return <span ref={ref} className="absolute -top-3 -left-3 size-6 rounded-full bg-foreground/40 opacity-0" />
}

/** A tiny button face, for drawings of a card's buttons. */
function MiniButton({ children, className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex h-5 items-center gap-1 rounded border bg-background/60 px-1.5 text-[9px] font-medium whitespace-nowrap [&_svg]:size-2.5",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

/**
 * Text drawn as ghost words: a rounded bar the width of each word, so a drawing shows where
 * the text sits and how it wraps without a wall of Lorem Ipsum to read. With `mark`, each
 * word carries its offset in the text (plus `offset`) for measuring.
 */
function Ghost({ text, offset = 0, mark = false, className }: { text: string; offset?: number; mark?: boolean; className?: string }) {
  return Array.from(text.matchAll(/\S+/g), (m, i) => (
    <Fragment key={m.index}>
      {i > 0 && " "}
      <span
        data-word={mark ? offset + m.index : undefined}
        className={cn("inline-block h-[0.6em] overflow-hidden rounded-full bg-foreground/25 align-middle text-transparent", className)}
      >
        {m[0]}
      </span>
    </Fragment>
  ))
}

/** A mini platform card's header: logo, name, and a note on the right. */
function MiniCardHeader({ adapter, note }: { adapter: PlatformAdapter; note: React.ReactNode }) {
  return (
    <div className="flex h-4 items-center gap-1.5">
      <PlatformLogo adapter={adapter} className="size-3.5" />
      <span className="text-[11px] font-semibold">{adapter.name}</span>
      <span className="ml-auto text-[9px] text-muted-foreground tabular-nums">{note}</span>
    </div>
  )
}

// Draft, the sub-steps. Each takes `onDone`, called once a pass ends, so the step can move
// on to the next.

export type ArtProps = {
  active: boolean
  onDone?: () => void
  /** The tab before was Split: the chips start lit, and dim if this tab doesn't use them. */
  litFrom?: boolean
  /** Which part of the drawing is playing, for a caption that changes with it. */
  onBeat?: (beat: number) => void
}

const NEAR_LIMIT = 0.9

/** A count's color, as on the cards: amber near the limit, red over it. */
function tone(count: number, limit: number) {
  if (count > limit) return "text-destructive"
  if (count >= limit * NEAR_LIMIT) return "text-amber-600 dark:text-amber-400"
  return "text-muted-foreground"
}

/**
 * Draft's sample, shared by its three drawings so each ends where the next begins: Write types
 * it in, Split works its splits and leaves it as it found it, and Images adds pictures to it.
 * At 284 characters only X splits it on its own (at "Duis"), and Bluesky sits near its limit.
 */
const DRAFT_TEXT = LOREM.slice(0, LOREM.indexOf("Duis")) + "Duis aute irure dolor in reprehenderit in voluptate."
const DRAFT_WORDS = Array.from(DRAFT_TEXT.matchAll(/\S+/g), (m) => m[0])
/** How much slower than their scripts' timings Draft's drawings play, so each beat lingers. */
const DRAFT_PACE = 1.4

/**
 * Draft's canvas: just tall enough for Compose, so the drawing fills the frame. Images grows it
 * to fit the tile row once images arrive, and the drawing zooms out to match.
 */
const DRAFT_H = 264
const GROWN_H = 340
/** Compose's width, its text box's height, and how tall it is before images land. */
const COMPOSE_W = 300
const TEXT_H = 144
const COMPOSE_H = 248
/** Where Compose sits, the same on every tab: the canvas grows below it. */
const COMPOSE_TOP = (DRAFT_H - COMPOSE_H) / 2
/** The column beside Compose. */
const SIDE_W = 184
/** The threading platforms, in the order their chips and flags show. */
const THREADERS = [bluesky, threads, x]
/** A split flag at the drawings' size (the real one is 16px tall). */
const MINI_FLAG = "h-3 gap-px px-0.5 text-[8px] [&_svg]:size-2"
/** The caret's height in these drawings, the flag's, and a line of text. */
const CARET_H = 13
const FLAG_H = 12
const LINE_H = 16

/** The app's ease for the drop bar and the glow: a quick start that glides to rest. */
const OPEN_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"
/** The image area's width inside Compose, and a tile in its 4-up row, which the open drop bar matches. */
const AREA_W = COMPOSE_W - 4 - 24
const TILE_GAP = 6
const TILE = (AREA_W - 3 * TILE_GAP) / 4
/** Clear Post, before the drop bar in the area's bottom row. */
const ROW_BUTTONS_W = 70
const ROW_H = 20

/** The All tag: scissors and, in the text, the post number, trimmed to the figures as in Compose. */
function MiniAllTag({ label, className }: { label?: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-3 items-center gap-px rounded-sm rounded-bl-none bg-foreground px-0.5 text-[8px] leading-none font-semibold text-background tabular-nums shadow-sm",
        className,
      )}
    >
      <ScissorsIcon className="size-2" />
      {label != null && <span className="[text-box:trim-both_cap_alphabetic]">{label}</span>}
    </span>
  )
}

type Glow = { x: number; y: number; r: number }

/** The drop glow, as in the app: a soft circle that grows from where the drag came in. */
function GlowSpot({ glow }: { glow: Glow }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    ref.current?.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: 1100, easing: OPEN_EASE, fill: "forwards" })
  }, [])
  return (
    <span
      ref={ref}
      className="pointer-events-none absolute rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--foreground)_14%,transparent)_75%,transparent)]"
      style={{ left: glow.x - glow.r, top: glow.y - glow.r, width: 2 * glow.r, height: 2 * glow.r }}
    />
  )
}

/** An image's number, on its corner as in the tray and on the cards. */
function ImageNumber({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute bottom-0.5 left-0.5 grid h-2.5 min-w-2.5 place-items-center rounded-sm bg-black/60 px-0.5 text-[6px] leading-none text-white tabular-nums",
        className,
      )}
    >
      <span className="[text-box:trim-both_cap_alphabetic]">{n}</span>
    </span>
  )
}

/**
 * Compose's image area, as in the app: Clear Post with the drop bar beside it;
 * while files are over the page (`glow`), the bar opens up across the place the tile row will
 * take, and once they land (`staged`), the tiles sit there with the add slot after them.
 */
function ImageArea({
  areaRef,
  glow = null,
  staged = false,
}: {
  areaRef?: React.Ref<HTMLDivElement>
  glow?: Glow | null
  staged?: boolean
}) {
  const open = !staged && glow !== null
  return (
    <div ref={areaRef} className="relative mt-2">
      {staged ? (
        <ol className="mb-2 grid grid-cols-4" style={{ gap: TILE_GAP }}>
          {PHOTOS.map((_, k) => (
            <li key={k} className="relative aspect-square overflow-hidden rounded border animate-in fade-in zoom-in-90">
              <Photo index={k} className="size-full" />
              <ImageNumber n={k + 1} />
            </li>
          ))}
          <li className="grid aspect-square place-items-center rounded border border-dashed text-muted-foreground">
            <ImagePlusIcon className="size-3.5" />
          </li>
        </ol>
      ) : (
        // Makes room above the buttons while the bar is up there.
        <div className="transition-[height] duration-700" style={{ height: open ? TILE + 8 : 0, transitionTimingFunction: OPEN_EASE }} />
      )}
      <div className="flex gap-1.5" style={{ height: ROW_H }}>
        <MiniButton className="w-16 justify-center">Clear Post</MiniButton>
        {staged && <MiniButton>Clear Images</MiniButton>}
      </div>
      {!staged && (
        <div
          data-at="drop-target"
          className={cn(
            "absolute right-0 flex items-center justify-center gap-1 overflow-hidden rounded-md border border-dashed text-[9px] text-muted-foreground transition-[left,bottom,height,color,border-color] duration-700",
            open && "flex-col border-foreground/40 text-foreground",
          )}
          style={{
            transitionTimingFunction: OPEN_EASE,
            ...(open ? { left: 0, bottom: ROW_H + 8, height: TILE } : { left: ROW_BUTTONS_W, bottom: 0, height: ROW_H }),
          }}
        >
          {glow && <GlowSpot glow={glow} />}
          <ImagePlusIcon className={cn("relative shrink-0", open ? "size-3.5" : "size-3")} />
          <span className="relative">{open ? `Add ${PHOTOS.length} images` : "Drop, paste, or pick images"}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Compose as the app lays it out, the same on all three tabs: the title with the Drag to split
 * chips, the text box (`children`), Number posts and the character count, then the image
 * area (`area`). The chips are dimmed until `lit`, so they come up when they're the subject.
 * `top` is where it sits; it glides there when that changes.
 */
function MiniCompose({
  lit = false,
  characters,
  children,
  area = <ImageArea />,
  top = COMPOSE_TOP,
}: {
  lit?: boolean
  characters: number
  children: React.ReactNode
  area?: React.ReactNode
  top?: number
}) {
  return (
    <div
      className="brand-edge absolute left-3 rounded-xl border-2 p-3 shadow-sm"
      style={{ width: COMPOSE_W, top, transition: `top 700ms ${OPEN_EASE}` }}
    >
      <div className="flex h-5 items-center justify-between gap-2">
        <span className="text-[12px] font-semibold">Compose</span>
        <span className={cn("flex items-center gap-1 transition-opacity duration-500", lit ? "opacity-100" : "opacity-30")}>
          <span className="mr-0.5 text-[9px] text-muted-foreground">Drag to split</span>
          <span data-at="chip-all" className="flex h-5 items-center gap-0.5 rounded border bg-secondary px-1 text-[9px] font-medium">
            <ScissorsIcon className="size-2.5" />
            All
          </span>
          {THREADERS.map((a) => (
            // Each chip sets its brand, as in Compose, so the logo takes its color.
            <span
              key={a.id}
              data-at={`chip-${a.id}`}
              style={brandVars(a)}
              className="grid size-5 place-items-center rounded border bg-secondary"
            >
              <PlatformLogo adapter={a} className="size-3" />
            </span>
          ))}
        </span>
      </div>
      <div className="mt-2">{children}</div>
      <div className="mt-2 flex h-3 items-center justify-between text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          {/* The numbering switch, off. */}
          <span className="h-2.5 w-4 rounded-full bg-input p-px">
            <span className="block size-2 rounded-full bg-foreground/70" />
          </span>
          Number posts
        </span>
        <span className="tabular-nums">{characters.toLocaleString()} characters</span>
      </div>
      {area}
    </div>
  )
}

/** The text box's look, as Compose's textarea. */
const TEXT_BOX = "rounded-md border border-input px-2 py-1.5 text-[10px] leading-4 dark:bg-input/30"

type WordBox = { start: number; x: number; y: number }
/** The text box and each word in it, where its caret would start, in canvas pixels. */
type TextLayout = { words: WordBox[]; box: { x: number; y: number; w: number; h: number }; lastBottom: number }

/**
 * Measures the text box's words once laid out (and again when `version` changes, as while
 * typing), for placing the split markers: the state for drawing, the ref for scripts.
 */
function useTextLayout(canvasRef: React.RefObject<HTMLDivElement | null>, textRef: React.RefObject<HTMLDivElement | null>, version: unknown) {
  const ref = useRef<TextLayout | null>(null)
  const [layout, setLayout] = useState<TextLayout | null>(null)
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const text = textRef.current
    if (!canvas || !text) return
    const measure = () => {
      const words: WordBox[] = []
      for (const span of text.querySelectorAll<HTMLElement>("[data-word]")) {
        const { x, y, h } = canvasBox(canvas, span)
        // The ghost word is a thin bar; the caret centers on it.
        words.push({ start: Number(span.dataset.word), x, y: y + h / 2 - CARET_H / 2 })
      }
      const box = canvasBox(canvas, text)
      const next = { words, box, lastBottom: words.length ? Math.max(...words.map((w) => w.y)) + CARET_H : box.y }
      ref.current = next
      setLayout(next)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(text)
    return () => ro.disconnect()
  }, [canvasRef, textRef, version])
  return [layout, ref] as const
}

type SplitGroup = { adapter: PlatformAdapter; index: number }[]

/** Every threading platform's splits after its first post, grouped by where they fall. */
function splitsOf(postsFor: (a: PlatformAdapter) => { start: number }[]) {
  const splits = new Map<number, SplitGroup>()
  for (const a of THREADERS) {
    postsFor(a).slice(1).forEach((c, i) => {
      const here = splits.get(c.start) ?? []
      here.push({ adapter: a, index: i + 2 })
      splits.set(c.start, here)
    })
  }
  return splits
}

/**
 * The split markers over the text, as in Compose: a spot shared by several platforms shows the
 * All tag (its flags tucked away unless `open` says so), one platform's own its flag. 80% at
 * rest, full while open. Keyed by post and platform, so a dragged one stays the same marker as
 * it snaps from word to word.
 */
function SplitMarkers({
  splits,
  words,
  open = () => false,
}: {
  splits: Map<number, SplitGroup>
  words: WordBox[] | undefined
  open?: (all: boolean) => boolean
}) {
  return [...splits].map(([offset, here]) => {
    const w = words?.find((v) => v.start === offset)
    if (!w) return null
    const all = here.length > 1
    const key = all ? `all-${here[0].index}` : `${here[0].adapter.id}-${here[0].index}`
    const shown = open(all)
    return (
      <div
        key={key}
        style={{ ...brandVars(here[0].adapter), left: w.x, top: w.y }}
        className={cn("absolute z-20", shown ? "opacity-100" : "opacity-80")}
      >
        <div
          className="absolute top-0 -left-px w-[1.5px] rounded-full"
          style={{ height: CARET_H, background: all ? "var(--foreground)" : "var(--brand)" }}
        />
        <div className="absolute -left-px flex" style={{ top: -FLAG_H + 2 }}>
          {all ? (
            <>
              <MiniAllTag label={here[0].index} />
              {shown && here.map((m) => <Flag key={m.adapter.id} adapter={m.adapter} className={cn("ml-px", MINI_FLAG)} />)}
            </>
          ) : (
            <Flag adapter={here[0].adapter} label={here[0].index} className={MINI_FLAG} />
          )}
        </div>
      </div>
    )
  })
}

/** Each platform's own splits of `text`, with no hand-placed ones. */
const ownSplits = (text: string) => splitsOf((a) => splitChunks(text, a.limit, a.count))

const WRITE_ROWS = [bluesky, threads, x, facebook]

/**
 * Write: Draft's sample typed in as ghost words, with each platform counting it its own way;
 * once it passes X's limit, X's split shows in the text, as in Compose. It ends where Split begins.
 */
export function WriteArt({ active, onDone }: ArtProps) {
  const reduced = useReducedMotion()
  const canvasRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [typed, setTyped] = useState(() => (reduced ? DRAFT_WORDS.length : 0))
  const done = useEffectEvent(() => onDone?.())
  const [layout] = useTextLayout(canvasRef, textRef, typed)

  useEffect(() => {
    if (!active || reduced) return
    return loop(
      async (wait) => {
        for (let n = 1; n <= DRAFT_WORDS.length; n++) {
          setTyped(n)
          await wait(55)
        }
        await wait(2200)
        done()
        await wait(600)
        setTyped(0)
        await wait(700)
      },
      async (wait) => {
        await wait(0)
        setTyped(0)
      },
      DRAFT_PACE,
    )
  }, [active, reduced])

  const text = DRAFT_WORDS.slice(0, typed).join(" ")

  return (
    <Stage
      height={DRAFT_H}
      anchor="top"
      canvasRef={canvasRef}
      label="A post typed into Compose, with Bluesky, Threads, X and Facebook each counting it; X splits it into 2 posts once it passes its limit, and its split shows in the text."
    >
      <MiniCompose characters={graphemeLength(text)}>
        <div ref={textRef} className={TEXT_BOX} style={{ height: TEXT_H }}>
          <Ghost text={text} mark />
          {/* The text cursor. */}
          <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-foreground align-middle" />
        </div>
      </MiniCompose>
      <SplitMarkers splits={ownSplits(text)} words={layout?.words} />
      <div className="absolute top-1/2 right-3 -translate-y-1/2 space-y-2" style={{ width: SIDE_W }}>
        {WRITE_ROWS.map((a) => {
          const n = a.count(text)
          const posts = a.chain ? splitChunks(text, a.limit, a.count).length : 1
          return (
            <div
              key={a.id}
              style={brandVars(a)}
              className={cn("flex h-9 items-center gap-1.5 rounded-lg border px-2.5 shadow-xs", MINI_CARD)}
            >
              <PlatformLogo adapter={a} className="size-3.5" />
              <span className="text-[11px] font-medium">{a.name}</span>
              {posts > 1 ? (
                <span
                  className={cn(
                    // The app's blue, as on the cards: platform colors are for logos only.
                    "ml-auto rounded-full bg-(--brand-blue) px-1.5 py-0.5 text-[9px] font-semibold text-white",
                  )}
                >
                  {posts} posts
                </span>
              ) : (
                <span className={cn("ml-auto text-[9.5px] tabular-nums", tone(n, a.limit))}>
                  {n.toLocaleString()} / {a.limit.toLocaleString()}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </Stage>
  )
}

// Split: the two ways to place a split, then the two ways to take one away, each as Compose
// does it, on Write's text as Write left it (X's own split showing). The chips fade up; the
// pointer drags the All chip down into the text, where its marker snaps word to word under the
// pointer until it's let go at an early word; clicks later in the text and then the Bluesky
// chip, which splits Bluesky at the caret; then drags Bluesky's flag and the All tag straight
// down, past where Compose removes them. The text ends as it began, for Images.

/** Where the All chip is let go: the second sentence, which starts post 2 everywhere. */
const ALL_AT = DRAFT_TEXT.indexOf("Ut enim")
/** Where the pointer clicks in the text, and so where the Bluesky chip splits Bluesky. */
const BSKY_AT = DRAFT_TEXT.indexOf("Duis")
/** Where the pointer holds a flag, from the top of the caret: on the flag, as in Compose. */
const HOLD: Point = { x: 14, y: -3 }
const SPLIT_REST: Point = { x: 262, y: DRAFT_H - 28 }
/** One pointer move while dragging: the marker is placed again at each. */
const GLIDE_STEP = 40

type SplitDrag = {
  kind: "all" | "bsky"
  /** An existing split is moving: let go outside the text, it's removed. */
  moving: boolean
  /** Over the text, where the marker itself follows; outside, a copy rides on the pointer. */
  inside: boolean
}

type SplitFrame = {
  /** The split placed with the All chip, or none. */
  all: number | null
  /** Bluesky's own split, placed at the caret with the Bluesky chip, or none. */
  bsky: number | null
  /** The text caret, once the pointer has clicked in the text. */
  caret: number | null
  drag: SplitDrag | null
  /** The chips are up. */
  lit: boolean
  /** The pointer rests on the All tag: its flags show, as on hover in Compose. */
  hoverAll: boolean
  cursor: Point
  duration: number
  easing?: string
  pose: Pose
  clicks: number
}

const SPLIT_START: SplitFrame = {
  all: null,
  bsky: null,
  caret: null,
  drag: null,
  lit: false,
  hoverAll: false,
  cursor: SPLIT_REST,
  duration: 0,
  pose: "arrow",
  clicks: 0,
}

/**
 * Where a split held at `p` would go, as Compose works it out: the start of the word under
 * the flag, or null when the pointer is outside the text, or well below its last line (over
 * a line and a half of empty box), where letting go removes it.
 */
function splitOffsetAt({ words, box, lastBottom }: TextLayout, p: Point): number | null {
  if (p.x < box.x || p.x > box.x + box.w || p.y < box.y - FLAG_H || p.y > box.y + box.h) return null
  const caret = { x: p.x - HOLD.x, y: p.y - HOLD.y }
  if (caret.y > lastBottom + 1.5 * LINE_H) return null
  const lineY = words.reduce((best, w) => (Math.abs(w.y - caret.y) < Math.abs(best - caret.y) ? w.y : best), words[0].y)
  const line = words.filter((w) => Math.abs(w.y - lineY) < 1)
  const word = line.filter((w) => w.x <= caret.x).at(-1) ?? line[0]
  // A split before the first word would leave post 1 empty; the next word takes it.
  return word.start > 0 ? word.start : (words[1]?.start ?? null)
}

export function SplitArt({ active, onDone, onBeat }: ArtProps) {
  const reduced = useReducedMotion()
  const canvasRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [layout, layoutRef] = useTextLayout(canvasRef, textRef, null)
  // Without motion: the All split placed early, and Bluesky's own later on.
  const [frame, setFrame] = useState<SplitFrame>(() =>
    reduced ? { ...SPLIT_START, lit: true, all: ALL_AT, bsky: BSKY_AT } : SPLIT_START,
  )
  const done = useEffectEvent(() => onDone?.())
  const beat = useEffectEvent((n: number) => onBeat?.(n))

  const measured = layout !== null
  useEffect(() => {
    if (!active || reduced || !measured) return
    const set = (change: Partial<SplitFrame>) => setFrame((f) => ({ ...f, ...change }))
    const click = () => setFrame((f) => ({ ...f, clicks: f.clicks + 1 }))
    const L = () => layoutRef.current!
    const at = (offset: number, by: Point = HOLD): Point => {
      const w = L().words.find((v) => v.start === offset)!
      return { x: w.x + by.x, y: w.y + by.y }
    }
    const moveTo = (p: Point, duration = 800) => set({ cursor: p, duration, easing: undefined })
    /**
     * Straight down from `p`, just far enough below the last line that letting go removes the
     * split (as in Compose, over a line and a half of empty box), still inside the box.
     */
    const below = (p: Point): Point => ({ x: p.x, y: L().lastBottom + 1.5 * LINE_H + HOLD.y + 8 })
    const press = async (wait: Wait) => {
      set({ pose: "hand" })
      await wait(380)
      set({ pose: "grab" })
      await wait(220)
    }
    const letGo = async (wait: Wait) => {
      set({ pose: "hand", drag: null })
      await wait(350)
      set({ pose: "arrow" })
    }
    /**
     * Drags a split from `from` to `to` in small pointer moves, placing it again at each, as
     * Compose does: over the text the marker snaps to the word under the flag; outside, there's
     * no split there (an existing one would be removed) and a copy rides on the pointer.
     */
    const drag = async (wait: Wait, kind: SplitDrag["kind"], moving: boolean, from: Point, to: Point, ms: number) => {
      const n = Math.max(1, Math.round(ms / GLIDE_STEP))
      for (let i = 1; i <= n; i++) {
        const t = i / n
        // Eased, so the hand starts and settles gently.
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
        const p = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }
        const offset = splitOffsetAt(L(), p)
        set({ cursor: p, duration: GLIDE_STEP * DRAFT_PACE, easing: "linear", [kind]: offset, drag: { kind, moving, inside: offset !== null } })
        await wait(GLIDE_STEP)
      }
    }
    return loop(
      async (wait) => {
        beat(0)
        await wait(300)
        set({ lit: true })
        await wait(700)
        // Drag in: the All chip, down into the text at an early word, which starts post 2 everywhere.
        const chip = locate(canvasRef.current, "chip-all")
        moveTo(chip)
        await wait(820)
        await press(wait)
        await drag(wait, "all", false, chip, at(ALL_AT), 1500)
        await wait(200)
        // Let go, the pointer still rests on the tag, so its flags stay out until it moves off.
        set({ hoverAll: true })
        await letGo(wait)
        await wait(600)
        // Click: in the text later on, which puts the caret there...
        set({ hoverAll: false })
        moveTo(at(BSKY_AT, { x: 3, y: CARET_H / 2 }))
        await wait(820)
        click()
        set({ caret: BSKY_AT })
        await wait(600)
        // ...then the Bluesky chip, which splits Bluesky at the caret.
        moveTo(locate(canvasRef.current, `chip-${bluesky.id}`), 700)
        await wait(720)
        click()
        set({ bsky: BSKY_AT, caret: null })
        await wait(1200)
        // Drag out: Bluesky's flag, straight down past where Compose removes it...
        beat(1)
        const flag = at(BSKY_AT)
        moveTo(flag)
        await wait(820)
        await press(wait)
        await drag(wait, "bsky", true, flag, below(flag), 700)
        await wait(300)
        await letGo(wait)
        await wait(500)
        // ...and the All tag the same way.
        const tag = at(ALL_AT)
        moveTo(tag)
        await wait(700)
        // Over the tag: its flags come out, as on hover.
        set({ hoverAll: true })
        await wait(500)
        await press(wait)
        await drag(wait, "all", true, tag, below(tag), 1100)
        await wait(300)
        set({ hoverAll: false })
        await letGo(wait)
        moveTo(SPLIT_REST)
        await wait(1800)
        done()
        await wait(600)
      },
      // Start over each time the step comes back.
      async (wait) => {
        await wait(0)
        set(SPLIT_START)
      },
      DRAFT_PACE,
    )
  }, [active, reduced, measured, layoutRef])

  // Each platform's split: the shared one, plus Bluesky's own where placed.
  const postsFor = (a: PlatformAdapter) => {
    const breaks = [frame.all, a.id === bluesky.id ? frame.bsky : null].filter((b): b is number => b !== null)
    return splitChunks(DRAFT_TEXT, a.limit, a.count, { breaks })
  }
  // Bluesky's card, which both splits reflow.
  const chunks = postsFor(bluesky)
  const caret = frame.caret === null ? undefined : layout?.words.find((w) => w.start === frame.caret)
  const ghost = frame.drag && !frame.drag.inside ? frame.drag : null

  return (
    <Stage
      height={DRAFT_H}
      anchor="top"
      label="Compose's split chips come up, and a pointer drags the All chip down into the text, where its marker follows word to word until it's let go at an early word: every platform starts a second post there. It clicks later in the text, then the Bluesky chip, which splits Bluesky at the caret, and Bluesky's card gains a third post. Then it drags Bluesky's flag and the All tag straight down below the text; each turns red on the pointer, and letting go removes it."
      canvasRef={canvasRef}
    >
      <MiniCompose lit={frame.lit} characters={graphemeLength(DRAFT_TEXT)}>
        <div ref={textRef} className={TEXT_BOX} style={{ height: TEXT_H }}>
          <Ghost text={DRAFT_TEXT} mark />
        </div>
      </MiniCompose>

      {/* The text caret, where the pointer clicked. */}
      {caret && (
        <div
          className="absolute z-10 w-px animate-pulse bg-foreground"
          style={{ left: caret.x, top: caret.y - 1, height: CARET_H + 2 }}
        />
      )}

      {/* Flags show while a group is held, or the pointer rests on its tag. */}
      <SplitMarkers
        splits={splitsOf(postsFor)}
        words={layout?.words}
        open={(all) =>
          (frame.drag?.inside === true && frame.drag.kind === (all ? "all" : "bsky")) || (all && frame.hoverAll)
        }
      />

      <div
        style={{ ...brandVars(bluesky), width: SIDE_W }}
        className={cn("absolute top-1/2 right-3 -translate-y-1/2 rounded-xl border p-2.5 shadow-sm", MINI_CARD)}
      >
        <MiniCardHeader adapter={bluesky} note={chunks.length === 1 ? "1 post" : `${chunks.length} posts`} />
        <ol className="mt-2.5 space-y-1.5">
          {chunks.map((c, p) => (
            <li key={p} className="rounded-md border bg-background/40 p-1.5 animate-in fade-in">
              <p className="text-[6px] leading-2">
                <Ghost text={c.text} className="bg-foreground/30" />
              </p>
              <div className="mt-1 flex h-2.5 items-center justify-between text-muted-foreground">
                <span className={cn("text-[8px] tabular-nums", tone(bluesky.count(c.text), bluesky.limit))}>
                  {chunks.length > 1 && (
                    <>
                      {p + 1}
                      <Dot className="mx-1 size-[2px]" />
                    </>
                  )}
                  {bluesky.count(c.text)} / {bluesky.limit}
                </span>
                <CopyIcon className="size-2.5" />
              </div>
            </li>
          ))}
        </ol>
      </div>

      <Cursor at={frame.cursor} duration={frame.duration} pose={frame.pose} easing={frame.easing} clicks={frame.clicks}>
        {/* Outside the text, the split rides on the pointer as in Compose: a plus while it's
            being added; dimmed and red once letting go would remove it. */}
        {ghost && (
          <span className={cn("absolute -top-1.5 -left-1 flex gap-px", ghost.moving && "opacity-60")}>
            {ghost.kind === "all" && <MiniAllTag className={ghost.moving ? "bg-destructive text-white" : undefined} />}
            {(ghost.kind === "all" ? THREADERS : [bluesky]).map((a) => (
              <Flag
                key={a.id}
                adapter={a}
                label={ghost.moving ? "×" : "+"}
                className={cn(MINI_FLAG, ghost.moving && "bg-destructive text-white")}
              />
            ))}
          </span>
        )}
      </Cursor>
    </Stage>
  )
}

// Images: on Split's text as Split left it, files dragged in from outside the page, which
// Compose's drop bar opens up to take, then the third one moved on X's card to its second post,
// as the app does it. The drawing zooms out to fit the tile row as it opens.

type StagingFrame = {
  cursor: Point
  duration: number
  pose: Pose
  /** Files on the pointer, coming in from outside the page. */
  carrying: boolean
  /** The files are over the page: the drop bar opens, with a glow from where they came in. */
  glow: Glow | null
  staged: boolean
  /** The third image is being dragged on the card. */
  moving: boolean
  /** The drag is over post 2. */
  over: boolean
  moved: boolean
}

const STAGING_IN: Point = { x: 580, y: 90 }
/** Where the files come over the page's edge. */
const STAGING_EDGE: Point = { x: 520, y: 112 }
const STAGING_REST: Point = { x: 264, y: GROWN_H - 24 }
const STAGING_START: StagingFrame = {
  cursor: STAGING_IN,
  duration: 0,
  pose: "arrow",
  carrying: true,
  glow: null,
  staged: false,
  moving: false,
  over: false,
  moved: false,
}

export function DraftImagesArt({ active, onDone, litFrom = false }: ArtProps) {
  const reduced = useReducedMotion()
  // Coming from Split, the chips start lit and dim, as they aren't the subject here.
  const [lit, setLit] = useState(litFrom && !reduced)
  useEffect(() => {
    if (!lit) return
    const timer = setTimeout(() => setLit(false), 300)
    return () => clearTimeout(timer)
  }, [lit])
  const canvasRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [layout] = useTextLayout(canvasRef, textRef, null)
  // Without motion: the images staged, the third moved to post 2.
  const [frame, setFrame] = useState<StagingFrame>(() =>
    reduced ? { ...STAGING_START, cursor: STAGING_REST, carrying: false, staged: true, moved: true } : STAGING_START,
  )
  const done = useEffectEvent(() => onDone?.())

  useEffect(() => {
    if (!active || reduced) return
    const set = (change: Partial<StagingFrame>) => setFrame((f) => ({ ...f, ...change }))
    const moveTo = (name: string, duration: number) => set({ cursor: locate(canvasRef.current, name), duration })
    return loop(
      async (wait) => {
        await wait(600)
        // In from outside the window, as a drag of files from the desktop.
        set({ cursor: STAGING_EDGE, duration: 450 })
        await wait(450)
        // Over the page: the drop bar opens up where the image row will be, lit by a glow
        // that spreads from where the files came in, and the drawing zooms out to fit it.
        const canvas = canvasRef.current
        const area = areaRef.current
        if (canvas && area) {
          const box = canvasBox(canvas, area)
          // The open bar fills the top of the area.
          const top = box.y
          const x = STAGING_EDGE.x - box.x
          const y = STAGING_EDGE.y - top
          // Big enough to cover the open bar's farthest corner, with the rim beyond it.
          const r = 1.25 * Math.max(...[0, AREA_W].flatMap((cx) => [0, TILE].map((cy) => Math.hypot(cx - x, cy - y))))
          set({ glow: { x, y, r } })
          // On to the middle of the bar where it's opening to.
          set({ cursor: { x: box.x + AREA_W / 2, y: top + TILE / 2 }, duration: 1000 })
        }
        await wait(1300)
        set({ glow: null, carrying: false, staged: true })
        await wait(1000)
        // Moved: the third image, from post 1 to post 2 on X's card.
        moveTo("img-2", 800)
        await wait(850)
        set({ pose: "hand" })
        await wait(300)
        set({ pose: "grab", moving: true })
        await wait(250)
        moveTo("post-2-slot", 900)
        await wait(600)
        set({ over: true })
        await wait(450)
        set({ pose: "hand", moving: false, over: false, moved: true })
        await wait(400)
        set({ pose: "arrow", cursor: STAGING_REST, duration: 700 })
        await wait(2200)
        done()
        await wait(300)
        set(STAGING_START)
        await wait(400)
      },
      async (wait) => {
        await wait(0)
        set(STAGING_START)
      },
      DRAFT_PACE,
    )
  }, [active, reduced])

  const posts = splitChunks(DRAFT_TEXT, x.limit, x.count)
  /** Whether image `k` sits on `post`: all on the first, until the third moves to the second. */
  const sitsOn = (post: number, k: number) => (k === 2 && frame.moved ? post === 1 : post === 0)
  const grown = frame.staged || frame.glow !== null

  return (
    <Stage
      height={grown ? GROWN_H : DRAFT_H}
      anchor="top"
      note={
        <p className="flex items-center gap-2.5 rounded-lg border border-(--brand-blue)/40 bg-(--brand-blue)/8 px-3 py-3 text-sm text-muted-foreground">
          <ShieldCheckIcon className="size-4 shrink-0 text-(--brand-blue)" />
          Images stay in your browser, never uploaded directly.
        </p>
      }
      label="Three images dragged in from outside the page: Compose's drop bar opens up to take them, and they land in Compose and on X's first post. A pointer then drags the third image across X's card onto the second post's Move here space. A note under the drawing says images stay in your browser."
      canvasRef={canvasRef}
    >
      <MiniCompose
        lit={lit}
        characters={graphemeLength(DRAFT_TEXT)}
        area={<ImageArea areaRef={areaRef} glow={frame.glow} staged={frame.staged} />}
      >
        <div ref={textRef} className={TEXT_BOX} style={{ height: TEXT_H }}>
          <Ghost text={DRAFT_TEXT} mark />
        </div>
      </MiniCompose>
      {/* X's own split, as Split left it. */}
      <SplitMarkers splits={ownSplits(DRAFT_TEXT)} words={layout?.words} />

      <div
        style={{ ...brandVars(x), width: SIDE_W, top: COMPOSE_TOP }}
        className={cn("absolute right-3 rounded-xl border p-2.5 shadow-sm", MINI_CARD)}
      >
        <MiniCardHeader adapter={x} note={posts.length === 1 ? "1 post" : `${posts.length} posts`} />
        <ol className="mt-2.5 space-y-1.5">
          {posts.map((c, post) => {
            const shown = frame.staged ? PHOTOS.map((_, k) => k).filter((k) => sitsOn(post, k)) : []
            // While an image moves, the other post shows where it would land.
            const slot = frame.moving && post === 1
            return (
              <li
                key={post}
                className={cn(
                  "rounded-md border bg-background/40 p-1.5 transition-colors",
                  frame.over && post === 1 && "border-(--brand-blue)/60 bg-(--brand-blue)/10",
                )}
              >
                <p className="line-clamp-2 text-[8px] leading-[11px]">
                  <Ghost text={c.text} className="bg-foreground/30" />
                </p>
                {(shown.length > 0 || slot) && (
                  <div className="mt-1.5 flex gap-1.5">
                    {shown.map((k) => (
                      <span key={k} data-at={`img-${k}`} className="relative size-8 animate-in fade-in">
                        <Photo index={k} className="size-full rounded border" />
                        <ImageNumber n={k + 1} />
                      </span>
                    ))}
                    {slot && (
                      <span
                        data-at="post-2-slot"
                        className={cn(
                          "flex h-8 flex-1 flex-col items-center justify-center rounded border border-dashed leading-tight text-muted-foreground transition-colors",
                          frame.over && "border-(--brand-blue) text-foreground",
                        )}
                      >
                        <span className="text-[7px]">Move here</span>
                        <span className="text-[5.5px]">
                          <span className="font-semibold">On all threads</span> / X only
                        </span>
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-1 text-[8px] text-muted-foreground tabular-nums">
                  {post + 1}
                  <Dot className="mx-1 size-[2px]" />
                  {x.count(c.text)} / {x.limit}
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      <Cursor at={frame.cursor} duration={frame.duration} pose={frame.pose}>
        {/* Files from outside: the desktop's drag picture, a little stack beside the pointer. */}
        {frame.carrying && (
          <span className="absolute top-3 left-3 block">
            {PHOTOS.map((_, k) => (
              <Photo
                key={k}
                index={k}
                className="absolute size-9 rounded border-2 border-white shadow-md"
                // Fanned a little, like a stack of files.
                style={{ transform: `translate(${k * 4}px, ${k * 3}px) rotate(${(k - 1) * 8}deg)` }}
              />
            ))}
          </span>
        )}
        {/* An image dragged on the page: the browser's see-through copy of it, held where the
            pointer took it (its middle), while the image itself stays in place. */}
        {frame.moving && <Photo index={2} className="absolute -top-4 -left-4 size-8 rounded border opacity-60" />}
      </Cursor>
    </Stage>
  )
}

// Deliver: carrying images over by hand, from a card to the platform's own composer.

/** Bluesky's first post of the sample, which its Open button fills in. */
const FIRST_POST = splitChunks(LOREM, bluesky.limit, bluesky.count)[0].text

/** Stand-in photos: a sky, a sun and two hills, in three palettes. */
const PHOTOS = [
  { sky: ["#fdba74", "#db2777"], sun: "#fef3c7", hills: ["#9d174d", "#4c1d95"] },
  { sky: ["#7dd3fc", "#2563eb"], sun: "#ffffff", hills: ["#1e40af", "#172554"] },
  { sky: ["#d9f99d", "#0d9488"], sun: "#fefce8", hills: ["#15803d", "#14532d"] },
]

function Photo({ index, className, style }: { index: number; className?: string; style?: React.CSSProperties }) {
  const id = useId()
  const { sky, sun, hills } = PHOTOS[index]
  return (
    <svg viewBox="0 0 48 48" preserveAspectRatio="xMidYMid slice" className={cn("block", className)} style={style}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" fill={`url(#${id})`} />
      <circle cx="33" cy="16" r="6" fill={sun} />
      <path d="M0 36 14 22l12 11 8-6 14 11v10H0z" fill={hills[0]} />
      <path d="M0 42q14-8 26-2t22 0v8H0z" fill={hills[1]} />
    </svg>
  )
}

/** What the card's progress counts, in the order the drawing does them: each post and each image. */
type Piece = "post-0" | "img-0" | "post-1" | "img-1"
const PIECES: Piece[] = ["post-0", "img-0", "post-1", "img-1"]

type ImagesFrame = {
  cursor: Point
  duration: number
  clicks: number
  /** The platform's composer is open. */
  open: boolean
  /** A second post added to the thread in the composer. */
  thread: boolean
  /** Copied from the card (or opened prefilled), and what has landed in the composer. */
  copied: Piece[]
  pasted: Piece[]
  keycap: boolean
}

/** Deliver's desktop canvas: wide enough for the card and the platform's window side by side. */
const DELIVER_W = 500
const IMAGES_REST: Point = { x: 262, y: 246 }
const IMAGES_START: ImagesFrame = {
  cursor: IMAGES_REST,
  duration: 0,
  clicks: 0,
  open: false,
  thread: false,
  copied: [],
  pasted: [],
  keycap: false,
}
/** Bluesky's two posts of the sample. */
const DELIVER_POSTS = splitChunks(LOREM, bluesky.limit, bluesky.count).map((c) => c.text)

/**
 * Deliver on a desktop: Bluesky's card, its two posts with an image each, beside bsky.app's
 * composer. The pointer opens the first post prefilled, copies its image across, adds a post to
 * the thread, copies the second post and its image across, and posts. Each piece is checked off
 * on the card as it goes, and once all four are, the card marks itself posted.
 */
function DesktopImagesArt({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  const canvasRef = useRef<HTMLDivElement>(null)
  // Without motion: everything carried over, and the card marked posted.
  const [frame, setFrame] = useState<ImagesFrame>(() =>
    reduced ? { ...IMAGES_START, open: true, thread: true, copied: PIECES, pasted: PIECES } : IMAGES_START,
  )

  useEffect(() => {
    if (!active || reduced) return
    const set = (change: Partial<ImagesFrame>) => setFrame((f) => ({ ...f, ...change }))
    const moveTo = (name: string, duration: number) => set({ cursor: locate(canvasRef.current, name), duration })
    const click = () => setFrame((f) => ({ ...f, clicks: f.clicks + 1 }))
    const copy = (piece: Piece) => setFrame((f) => ({ ...f, clicks: f.clicks + 1, copied: [...f.copied, piece] }))
    /** Into the composer at `name`, with the paste keys showing. */
    const paste = async (wait: Wait, name: string, piece: Piece) => {
      moveTo(name, 850)
      await wait(900)
      set({ keycap: true })
      await wait(300)
      setFrame((f) => ({ ...f, pasted: [...f.pasted, piece] }))
      await wait(500)
      set({ keycap: false })
      await wait(250)
    }
    return loop(
      async (wait) => {
        await wait(700)
        // Open the first post prefilled: the composer opens with its text, and it counts as copied.
        moveTo("open", 750)
        await wait(800)
        copy("post-0")
        await wait(200)
        set({ open: true, pasted: ["post-0"] })
        await wait(800)
        // Its image, across.
        moveTo("thumb-0", 800)
        await wait(850)
        copy("img-0")
        await wait(400)
        await paste(wait, "slot-0", "img-0")
        // A second post in the thread...
        moveTo("add", 700)
        await wait(750)
        click()
        set({ thread: true })
        await wait(600)
        // ...with the card's second post...
        moveTo("copy-1", 850)
        await wait(900)
        copy("post-1")
        await wait(400)
        await paste(wait, "text-1", "post-1")
        // ...and its image. With that, everything is copied: the card marks itself posted.
        moveTo("thumb-1", 850)
        await wait(900)
        copy("img-1")
        await wait(400)
        await paste(wait, "slot-1", "img-1")
        await wait(700)
        moveTo("post", 700)
        await wait(750)
        click()
        await wait(350)
        set({ open: false })
        await wait(450)
        set({ cursor: IMAGES_REST, duration: 800 })
        await wait(1800)
        set({ copied: [], pasted: [], thread: false })
        await wait(1200)
      },
      // Start over each time the step comes back.
      async (wait) => {
        await wait(0)
        set(IMAGES_START)
      },
    )
  }, [active, reduced])

  const posted = PIECES.every((p) => frame.copied.includes(p))
  const isCopied = (p: Piece) => frame.copied.includes(p)
  const isPasted = (p: Piece) => frame.pasted.includes(p)

  return (
    <Stage
      label="Bluesky's card with two posts and an image on each, beside bsky.app's composer. A pointer opens the first post prefilled, copies its image across, adds a second post in the composer, copies the card's second post and its image across, then clicks Post. Each is checked off on the card, which marks itself posted once all four are."
      canvasRef={canvasRef}
      width={DELIVER_W}
    >
      <div
        style={brandVars(bluesky)}
        className={cn("absolute top-1/2 left-3 w-[236px] -translate-y-1/2 rounded-xl border p-2.5 shadow-sm", MINI_CARD)}
      >
        <div className="flex h-4 items-center gap-1.5">
          <PlatformLogo adapter={bluesky} className="size-3.5" />
          <span className="text-[11px] font-semibold">{bluesky.name}</span>
          <span className="ml-auto text-[9px] text-muted-foreground tabular-nums">2 posts</span>
          {/* The card's Posted mark: an outline while there's copying to do, filled once it's all done. */}
          <span
            className={cn(
              "grid size-4.5 place-items-center rounded-full transition-colors duration-300",
              posted ? "bg-(--brand-blue) text-white" : "text-muted-foreground",
            )}
          >
            {posted ? <CheckIcon className="size-2.5" strokeWidth={3.5} /> : <CircleCheckBigIcon className="size-3.5" />}
          </span>
        </div>
        <ol className="mt-2 space-y-1.5">
          {DELIVER_POSTS.map((text, i) => {
            const post = `post-${i}` as Piece
            const img = `img-${i}` as Piece
            return (
              <li key={i} className="rounded-md border bg-background/40 p-1.5">
                <p className="line-clamp-2 text-[8px] leading-[11px]">
                  <Ghost text={text} className="bg-foreground/30" />
                </p>
                <span data-at={`thumb-${i}`} className="relative mt-1.5 block size-8">
                  <Photo index={i} className={cn("size-full rounded border transition", isCopied(img) && "opacity-40 grayscale")} />
                  <ImageNumber n={i + 1} />
                  {isCopied(img) && (
                    // The copied check, as on a card.
                    <span className="absolute -right-1 -bottom-1 grid size-3 place-items-center rounded-full bg-(--brand-blue) text-white ring-2 ring-background">
                      <CheckIcon className="size-2" strokeWidth={3.5} />
                    </span>
                  )}
                </span>
                <div className="mt-1.5 flex items-center justify-end gap-1">
                  <span className="mr-auto text-[8px] whitespace-nowrap text-muted-foreground tabular-nums">
                    {i + 1}
                    <Dot className="mx-1 size-[2px]" />
                    {bluesky.count(text)} / {bluesky.limit}
                  </span>
                  {i === 0 && (
                    <MiniButton data-at="open" className="h-4.5 text-[8px]">
                      <ExternalLinkIcon />
                      {bluesky.open.label}
                    </MiniButton>
                  )}
                  {/* Copy: the app's blue once copied, as the card's done state. */}
                  <MiniButton
                    data-at={`copy-${i}`}
                    className={cn("h-4.5 px-1 text-[8px]", isCopied(post) && "border-(--brand-blue)/60 bg-(--brand-blue)/10 text-(--brand-blue)")}
                  >
                    {isCopied(post) ? <CheckIcon /> : <CopyIcon />}
                  </MiniButton>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {/* The platform's own site, in its own window: where the posting happens. */}
      <div
        className={cn(
          "absolute top-1/2 right-3 h-[232px] w-[232px] origin-bottom-left overflow-hidden rounded-lg border bg-card shadow-xl transition-[opacity,scale,translate] duration-300",
          frame.open ? "-translate-y-1/2 opacity-100" : "-translate-y-[48%] scale-95 opacity-0",
        )}
      >
        <div className="flex h-6 items-center gap-1 border-b bg-muted/60 px-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 rounded-full bg-muted-foreground/40" />
          ))}
          <span className="mx-auto flex h-4 items-center gap-1 rounded-full bg-background/80 px-2 text-[9px] text-muted-foreground">
            <LockIcon className="size-2" />
            bsky.app
          </span>
          {/* Balances the dots, so the address centers. */}
          <span className="w-[22px]" />
        </div>
        <div className="space-y-2 p-2.5">
          {DELIVER_POSTS.map((text, i) => {
            const post = `post-${i}` as Piece
            const img = `img-${i}` as Piece
            // The second post shows once it's added to the thread.
            if (i === 1 && !frame.thread) return null
            return (
              <div key={i} className="flex gap-2 animate-in fade-in">
                <div className="flex flex-col items-center">
                  <span className="size-5 shrink-0 rounded-full bg-[color-mix(in_oklab,#1185FE_35%,transparent)]" />
                  {/* The thread line, from the first post down to the second. */}
                  {i === 0 && frame.thread && <span className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p data-at={`text-${i}`} className="line-clamp-2 min-h-[22px] text-[8px] leading-[11px]">
                    {isPasted(post) ? (
                      <span className="animate-in fade-in">
                        <Ghost text={text} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Write your reply</span>
                    )}
                  </p>
                  <span data-at={`slot-${i}`} className="mt-1.5 block size-9">
                    <Photo
                      index={i}
                      className={cn(
                        "size-full rounded transition-[opacity,scale] duration-300",
                        isPasted(img) ? "opacity-100" : "scale-50 opacity-0",
                      )}
                    />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between">
          {/* Adds a post to the thread, as Bluesky's composer does. */}
          <span data-at="add" className="grid size-6 place-items-center rounded-full border text-[#1185FE]">
            <PlusIcon className="size-3.5" />
          </span>
          <span data-at="post" className="flex h-6 items-center rounded-full bg-[#1185FE] px-3.5 text-[10px] font-semibold text-white">
            {frame.thread ? "Post all" : "Post"}
          </span>
        </div>
      </div>

      <Cursor at={frame.cursor} duration={frame.duration} clicks={frame.clicks} />
      {frame.keycap && (
        <kbd
          className="absolute z-40 rounded border bg-popover px-1.5 py-0.5 font-sans text-[10px] font-medium text-popover-foreground shadow-md animate-in fade-in zoom-in-90"
          style={{ left: frame.cursor.x + 12, top: frame.cursor.y + 16 }}
        >
          {PASTE_KEY} V
        </kbd>
      )}
    </Stage>
  )
}

/** Deliver's drawing: a desktop with two windows, or on a touch screen, a phone switching apps. */
export function ImagesArt({ active }: { active: boolean }) {
  return useTouch() ? <PhoneImagesArt active={active} /> : <DesktopImagesArt active={active} />
}

// On a phone: copy an image, open the app, paste it in, post. One app on screen at a time.

const PHONE_W = 300
const PHONE_H = STAGE_H

type PhoneFrame = {
  cursor: Point
  duration: number
  clicks: number
  pressing: boolean
  /** The platform's app is open over Crosspost. */
  inApp: boolean
  copied: boolean
  toast: boolean
  pasteMenu: boolean
  pasted: boolean
}

const PHONE_REST: Point = { x: 236, y: 236 }
const PHONE_START: PhoneFrame = {
  cursor: PHONE_REST,
  duration: 0,
  clicks: 0,
  pressing: false,
  inApp: false,
  copied: false,
  toast: false,
  pasteMenu: false,
  pasted: false,
}

function PhoneImagesArt({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  const canvasRef = useRef<HTMLDivElement>(null)
  // Without motion: the app open, with the image pasted in.
  const [frame, setFrame] = useState<PhoneFrame>(() =>
    reduced ? { ...PHONE_START, inApp: true, copied: true, pasted: true } : PHONE_START,
  )

  useEffect(() => {
    if (!active || reduced) return
    const set = (change: Partial<PhoneFrame>) => setFrame((f) => ({ ...f, ...change }))
    const moveTo = (name: string, duration: number) => set({ cursor: locate(canvasRef.current, name), duration })
    const tap = () => setFrame((f) => ({ ...f, clicks: f.clicks + 1 }))
    return loop(
      async (wait) => {
        await wait(700)
        moveTo("thumb-0", 700)
        await wait(750)
        tap()
        set({ copied: true, toast: true })
        await wait(1100)
        set({ toast: false })
        moveTo("open", 700)
        await wait(750)
        tap()
        await wait(200)
        set({ inApp: true })
        await wait(650)
        // A long press on the post brings up the system's Paste.
        moveTo("slot", 700)
        await wait(750)
        set({ pressing: true })
        await wait(600)
        set({ pressing: false, pasteMenu: true })
        await wait(350)
        moveTo("paste", 400)
        await wait(450)
        tap()
        set({ pasteMenu: false, pasted: true })
        await wait(800)
        moveTo("post", 650)
        await wait(700)
        tap()
        await wait(300)
        set({ inApp: false })
        await wait(400)
        set({ cursor: PHONE_REST, duration: 700 })
        await wait(800)
        set({ copied: false, pasted: false })
        await wait(1400)
      },
      // Start over each time the step comes back.
      async (wait) => {
        await wait(0)
        set(PHONE_START)
      },
    )
  }, [active, reduced])

  const count = bluesky.count(FIRST_POST)

  return (
    <Stage
      label="On a phone: a finger copies an image from Bluesky's card in Crosspost, opens Bluesky, pastes the image into the post there, then taps Post."
      canvasRef={canvasRef}
      width={PHONE_W}
      height={PHONE_H}
    >
      <div className="absolute top-2 left-1/2 h-[244px] w-[132px] -translate-x-1/2 rounded-[22px] border-4 border-neutral-700 bg-background p-1 shadow-xl">
        <div className="relative size-full overflow-hidden rounded-[20px] bg-background">
          {/* Crosspost */}
          <div className="absolute inset-0 flex flex-col p-2 pt-5">
            <div style={brandVars(bluesky)} className={cn("rounded-lg border p-2", MINI_CARD)}>
              <MiniCardHeader adapter={bluesky} note="2 posts" />
              <p className="mt-1.5 line-clamp-3 text-[8px] leading-[11px]">
                <Ghost text={FIRST_POST} />
              </p>
              <div className="mt-2 flex gap-1.5">
                {PHOTOS.map((_, k) => (
                  <span key={k} data-at={`thumb-${k}`} className="relative size-7">
                    <Photo
                      index={k}
                      className={cn("size-full rounded border transition", k === 0 && frame.copied && "opacity-40 grayscale")}
                    />
                    {k === 0 && frame.copied && (
                      <span className="absolute -right-1 -bottom-1 grid size-3 place-items-center rounded-full bg-(--brand-blue) text-white ring-2 ring-background">
                        <CheckIcon className="size-2" strokeWidth={3.5} />
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex justify-end gap-1">
                <MiniButton data-at="open">
                  <ExternalLinkIcon />
                  {bluesky.open.label}
                </MiniButton>
              </div>
              <div className="mt-1 text-[8px] text-muted-foreground tabular-nums">
                1<Dot className="mx-1 size-[2px]" />
                {count} / {bluesky.limit}
              </div>
            </div>
            <div
              className={cn(
                "absolute inset-x-2 bottom-3 rounded-md bg-popover px-2 py-1 text-[8px] text-popover-foreground shadow-lg ring-1 ring-border transition-[opacity,translate] duration-300",
                frame.toast ? "opacity-100" : "translate-y-1 opacity-0",
              )}
            >
              Copied image 1. Paste it into the post.
            </div>
          </div>

          {/* The platform's app, wiping in over Crosspost from the right. A wipe rather than a
              slide, so what the finger aims for is already in place while it comes in. */}
          <div
            className={cn(
              "absolute inset-0 bg-card p-2 pt-5 transition-[clip-path] duration-300 ease-out",
              frame.inApp ? "[clip-path:inset(0)]" : "[clip-path:inset(0_0_0_100%)]",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-[#1185FE]">Cancel</span>
              <span
                data-at="post"
                className="flex h-5 items-center rounded-full bg-[#1185FE] px-2.5 text-[9px] font-semibold text-white"
              >
                Post
              </span>
            </div>
            <div className="mt-3 flex gap-1.5">
              <span className="size-5 shrink-0 rounded-full bg-[color-mix(in_oklab,#1185FE_35%,transparent)]" />
              <p className="line-clamp-4 text-[8px] leading-[11px]">
                <Ghost text={FIRST_POST} />
              </p>
            </div>
            <div data-at="slot" className="relative mt-3 ml-6 size-11">
              <Photo
                index={0}
                className={cn(
                  "size-full rounded transition-[opacity,scale] duration-300",
                  frame.pasted ? "opacity-100" : "scale-50 opacity-0",
                )}
              />
              <span
                data-at="paste"
                className={cn(
                  "absolute -top-6 left-1/2 -translate-x-1/2 rounded-md bg-neutral-800 px-2 py-1 text-[9px] font-medium text-white shadow-md transition-opacity",
                  frame.pasteMenu ? "opacity-100" : "opacity-0",
                )}
              >
                Paste
              </span>
            </div>
          </div>
        </div>
      </div>

      <Cursor
        at={frame.cursor}
        duration={frame.duration}
        pose="finger"
        clicks={frame.clicks}
        pressing={frame.pressing}
      />
    </Stage>
  )
}
