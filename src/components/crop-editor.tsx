"use client"

import { RotateCwSquareIcon } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { CropRect } from "@/lib/images"
import { cn } from "@/lib/utils"

// The crop frame, shared by images and videos in the media dialog: drag inside to move it, a
// corner to resize it, or pick a shape; arrow keys move it, Shift with arrows resizes it.

export const FULL: CropRect = { x: 0, y: 0, w: 1, h: 1 }
/** The smallest crop, as a fraction of each side. */
const MIN = 0.05

/**
 * Shapes to crop to: width over height (or null for any), with the sides as written; Rotate
 * turns each a quarter turn, so 4:5 becomes 5:4 and 16:9 becomes 9:16.
 */
const SHAPES: { ratio: number | null | "original"; sides?: [number, number] }[] = [
  { ratio: null },
  { ratio: "original" },
  { ratio: 1, sides: [1, 1] },
  { ratio: 4 / 5, sides: [4, 5] },
  { ratio: 16 / 9, sides: [16, 9] },
]

type Handle = "move" | "nw" | "ne" | "sw" | "se"

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** How far each arrow key moves or resizes the frame, as a fraction of the picture. */
const STEP = 0.01

/**
 * The frame after a move (handle "move") or a resize from a corner by dx, dy (fractions of the
 * picture), kept inside it and, with a shape (fractions: width over height), to that shape.
 * Null when a resize would make it too small.
 */
export function adjusted(handle: Handle, r: CropRect, dx: number, dy: number, shape: number | null): CropRect | null {
  if (handle === "move") return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) }
  // The corner opposite the one dragged stays put.
  const left = handle === "nw" || handle === "sw"
  const top = handle === "nw" || handle === "ne"
  const anchorX = left ? r.x + r.w : r.x
  const anchorY = top ? r.y + r.h : r.y
  const room = { w: left ? anchorX : 1 - anchorX, h: top ? anchorY : 1 - anchorY }
  let w = clamp(left ? r.w - dx : r.w + dx, MIN, room.w)
  let h = clamp(top ? r.h - dy : r.h + dy, MIN, room.h)
  if (shape !== null) {
    // Keep the shape: follow whichever side moved more (so Shift with up or down resizes too),
    // then fit the room.
    if (Math.abs(dy) > Math.abs(dx)) w = h * shape
    else h = w / shape
    if (h > room.h) {
      h = room.h
      w = h * shape
    }
    if (w > room.w) {
      w = room.w
      h = w / shape
    }
    if (w < MIN || h < MIN) return null
  }
  return { x: left ? anchorX - w : anchorX, y: top ? anchorY - h : anchorY, w, h }
}

/** The largest rect of `shape` (in fractions: width over height) centered in the picture. */
function centered(shape: number): CropRect {
  const w = shape >= 1 ? 1 : shape
  const h = shape >= 1 ? 1 / shape : 1
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

/**
 * The chosen one of a row of outline buttons (a crop shape, a size, a length): the app's blue
 * border and tint, in both themes, so the choice reads at a glance.
 */
export const CHOSEN =
  "border-(--brand-blue) bg-(--brand-blue)/15 text-foreground hover:bg-(--brand-blue)/25 dark:border-(--brand-blue) dark:bg-(--brand-blue)/20 dark:hover:bg-(--brand-blue)/30"

/** A row's name (Ratio, Size, Length), one width for all, so their buttons line up. */
export function RowLabel({ children }: { children: React.ReactNode }) {
  return <span className="w-14 shrink-0 text-sm text-muted-foreground">{children}</span>
}

export const isFull = (r: CropRect) => r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999

export type Size = { w: number; h: number }

/**
 * A crop being edited: the frame, the shape it's held to, whether the shapes are turned a quarter
 * turn, and the picture's size in pixels once known.
 */
export function useCrop(initial: CropRect | undefined, knownSize?: Size) {
  // Known ahead (an image the dialog got ready), the frame can show from the first frame.
  const [size, setSize] = useState<Size | null>(knownSize ?? null)
  const [rect, setRect] = useState<CropRect>(initial ?? FULL)
  // Width over height in pixels, or null for any shape.
  const [ratio, setRatio] = useState<number | null>(null)
  const [turned, setTurned] = useState(false)
  // A pixel ratio as a ratio of fractions of this picture (width over height).
  const shapeOf = (pixels: number) => (size ? (pixels * size.h) / size.w : pixels)
  /** A shape's ratio in pixels as it shows now, turned or not. */
  const ratioOf = (choice: number | "original") => {
    const pixels = choice === "original" ? (size ? size.w / size.h : 1) : choice
    return turned ? 1 / pixels : pixels
  }
  const pickShape = (choice: number | null | "original") => {
    if (choice === null) return setRatio(null)
    const pixels = ratioOf(choice)
    setRatio(pixels)
    setRect(centered(shapeOf(pixels)))
  }
  /**
   * A quarter turn: the frame swaps its width and height about its center (shrinking to fit
   * the picture if it must), and the shapes turn with it.
   */
  const rotate = () => {
    setTurned((t) => !t)
    if (ratio !== null) setRatio(1 / ratio)
    if (!size) return
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    // The frame in pixels, turned, then back to fractions of the picture.
    let w = (rect.h * size.h) / size.w
    let h = (rect.w * size.w) / size.h
    const scale = Math.min(1, 1 / w, 1 / h)
    w *= scale
    h *= scale
    setRect({ x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h })
  }
  const reset = () => {
    setRatio(null)
    setTurned(false)
    setRect(FULL)
  }
  return {
    size,
    setSize,
    rect,
    setRect,
    ratio,
    ratioOf,
    turned,
    rotate,
    shape: ratio === null ? null : shapeOf(ratio),
    pickShape,
    reset,
  }
}

/** A small outline of a shape: `ratio` is width over height, null for any (dashed). */
function ShapeIcon({ ratio }: { ratio: number | null }) {
  const r = ratio ?? 1
  const w = r >= 1 ? 14 : 14 * r
  const h = r >= 1 ? 14 / r : 14
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect
        x={8 - w / 2}
        y={8 - h / 2}
        width={w}
        height={h}
        rx={1.5}
        strokeDasharray={ratio === null ? "2.5 2" : undefined}
      />
    </svg>
  )
}

export type Crop = ReturnType<typeof useCrop>

/**
 * The Ratio row: the shape buttons, each with an outline of its shape, Rotate (a quarter turn of
 * the frame and the shapes), and the crop's size in pixels.
 */
export function CropShapes({ crop }: { crop: Crop }) {
  const { size, rect, ratio, turned } = crop
  const pixels = size ? `${Math.round(rect.w * size.w)} × ${Math.round(rect.h * size.h)}` : ""
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Crop shape">
      <RowLabel>Ratio</RowLabel>
      {SHAPES.map((s) => {
        const shown = s.ratio === null ? null : crop.ratioOf(s.ratio)
        const active = shown === null ? ratio === null : ratio !== null && Math.abs(ratio - shown) < 0.001
        const label =
          s.ratio === null
            ? "Free"
            : s.ratio === "original"
              ? "Original"
              : s.sides![0] === s.sides![1]
                ? "Square"
                : (turned ? [...s.sides!].reverse() : s.sides!).join(":")
        return (
          <Button
            key={label === "Free" || label === "Original" || label === "Square" ? label : s.sides!.join(":")}
            variant="outline"
            size="sm"
            aria-pressed={active}
            // A shape is measured against the picture's size: off until that's known (Free needs none).
            disabled={!size && s.ratio !== null}
            onClick={() => crop.pickShape(s.ratio)}
            className={cn(active && CHOSEN)}
          >
            <ShapeIcon ratio={shown} />
            {label}
          </Button>
        )
      })}
      {/* Rotate isn't a shape to choose but a turn of whichever is chosen: set apart by a bar, a
          quieter icon button, and showing its state only by its icon's turn, so it never reads as
          a second choice. */}
      <span aria-hidden className="mx-1 h-6 w-px bg-border" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={turned}
            disabled={!size}
            onClick={crop.rotate}
            aria-label={turned ? "Rotate the crop back" : "Rotate the crop a quarter turn"}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCwSquareIcon className={cn("transition-transform", turned && "rotate-90")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Rotate</TooltipContent>
      </Tooltip>
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{pixels}</span>
    </div>
  )
}

/**
 * How the crop shows over the picture: its frame to move (the crop tab), or applied (the alt text
 * tab, the preview: the kept part zoomed to fill the picture's box, the rest clipped away).
 */
export type CropMode = "edit" | "preview"

/**
 * The picture (an image or a video, as `children`) with the crop over it as `mode` says, once its
 * size is known. The picture stays the same element in every mode, so a video plays on as the
 * mode changes, and the preview's zoom eases in and out.
 */
export function CropFrame({ crop, mode = "edit", children }: { crop: Crop; mode?: CropMode; children: React.ReactNode }) {
  const editable = mode === "edit"
  const frame = useRef<HTMLDivElement>(null)
  const { rect, setRect, shape } = crop

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const box = frame.current?.getBoundingClientRect()
    if (!box) return
    const start = { x: e.clientX, y: e.clientY, rect }
    const move = (ev: PointerEvent) => {
      const next = adjusted(handle, start.rect, (ev.clientX - start.x) / box.width, (ev.clientY - start.y) / box.height, shape)
      if (next) setRect(next)
    }
    const end = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
  }

  /** Arrow keys move the frame; with Shift they resize it from its lower right corner. */
  const onFrameKey = (e: React.KeyboardEvent) => {
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    }
    const step = arrows[e.key]
    if (!step) return
    e.preventDefault()
    const next = adjusted(e.shiftKey ? "se" : "move", rect, step[0], step[1], shape)
    if (next) setRect(next)
  }

  const pct = (v: number) => `${v * 100}%`
  return (
    <div className="grid place-items-center rounded-md bg-muted p-2">
      <div ref={frame} className="relative w-fit touch-none overflow-hidden select-none">
        <div
          // Relative, for a video laid over the frame that holds its place while it loads.
          className="relative transition-[transform,clip-path] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={
            mode === "preview" && !isFull(rect)
              ? {
                  // Clip to the crop, move its center to the box's, then scale it up to fit.
                  clipPath: `inset(${pct(rect.y)} ${pct(1 - rect.x - rect.w)} ${pct(1 - rect.y - rect.h)} ${pct(rect.x)})`,
                  transform: `scale(${Math.min(1 / rect.w, 1 / rect.h)}) translate(${pct(0.5 - rect.x - rect.w / 2)}, ${pct(0.5 - rect.y - rect.h / 2)})`,
                }
              : { clipPath: "inset(0 0 0 0)", transform: "none" }
          }
        >
          {children}
        </div>
        {crop.size && editable && (
          <div
            onPointerDown={startDrag("move")}
            onKeyDown={onFrameKey}
            tabIndex={0}
            role="group"
            aria-label="Crop frame. Arrow keys move it; Shift and arrow keys resize it."
            // The shade outside the frame is the frame's own shadow, clipped to the picture.
            className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] outline-none focus-visible:border-sky-400"
            style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
          >
            {/* Thirds, to line things up. */}
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/40" />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/40" />
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/40" />
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/40" />
            {(["nw", "ne", "sw", "se"] as const).map((h) => (
              <span
                key={h}
                onPointerDown={startDrag(h)}
                aria-hidden
                className={cn(
                  // Drawn small, caught wide: an invisible margin around each handle takes the
                  // pointer, wider still for a finger.
                  "absolute size-4 rounded-sm border-2 border-white bg-black/60 before:absolute before:-inset-2 pointer-coarse:size-6 pointer-coarse:before:-inset-3",
                  h === "nw" && "-top-2 -left-2 cursor-nwse-resize pointer-coarse:-top-3 pointer-coarse:-left-3",
                  h === "ne" && "-top-2 -right-2 cursor-nesw-resize pointer-coarse:-top-3 pointer-coarse:-right-3",
                  h === "sw" && "-bottom-2 -left-2 cursor-nesw-resize pointer-coarse:-bottom-3 pointer-coarse:-left-3",
                  h === "se" && "-right-2 -bottom-2 cursor-nwse-resize pointer-coarse:-right-3 pointer-coarse:-bottom-3",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
