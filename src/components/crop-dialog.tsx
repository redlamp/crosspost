"use client"

import { useCallback, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { CropRect, StagedImage } from "@/lib/images"
import { cn } from "@/lib/utils"

type Props = {
  image: StagedImage
  /** The image's number in the Compose tray. */
  n: number
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The new crop, or null for the whole image. */
  onSave: (crop: CropRect | null) => void
}

const FULL: CropRect = { x: 0, y: 0, w: 1, h: 1 }
/** The smallest crop, as a fraction of each side. */
const MIN = 0.05

/** Shapes to crop to: width over height, or null for any. */
const SHAPES: { label: string; ratio: number | null | "original" }[] = [
  { label: "Free", ratio: null },
  { label: "Original", ratio: "original" },
  { label: "Square", ratio: 1 },
  { label: "4:5", ratio: 4 / 5 },
  { label: "16:9", ratio: 16 / 9 },
]

type Handle = "move" | "nw" | "ne" | "sw" | "se"

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** How far each arrow key moves or resizes the frame, as a fraction of the image. */
const STEP = 0.01

/**
 * The frame after a move (handle "move") or a resize from a corner by dx, dy (fractions of the
 * image), kept inside the image and, with a shape (fractions: width over height), to that shape.
 * Null when a resize would make it too small.
 */
function adjusted(handle: Handle, r: CropRect, dx: number, dy: number, shape: number | null): CropRect | null {
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
    // Keep the shape: follow the width, then fit the room.
    h = w / shape
    if (h > room.h) {
      h = room.h
      w = h * shape
    }
    if (w < MIN || h < MIN) return null
  }
  return { x: left ? anchorX - w : anchorX, y: top ? anchorY - h : anchorY, w, h }
}

/** The largest rect of `shape` (in fractions: width over height) centered in the image. */
function centered(shape: number): CropRect {
  const w = shape >= 1 ? 1 : shape
  const h = shape >= 1 ? 1 / shape : 1
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

/**
 * Crop an image: drag inside the frame to move it, a corner to resize it, or pick a shape.
 * The crop always comes from the image as it was added, so it can be changed or reset later.
 */
export function CropDialog({ image, n, open, onOpenChange, onSave }: Props) {
  const source = image.original ?? image.blob
  // The full image to crop from, set on the element when it appears (the dialog mounts its
  // contents after its own effects run), with a fresh URL each time, revoked when it goes. Kept
  // stable, so a re-render (every move of the frame) doesn't reload the image.
  const showSource = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el) return
      const url = URL.createObjectURL(source)
      el.src = url
      return () => URL.revokeObjectURL(url)
    },
    [source],
  )
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [rect, setRect] = useState<CropRect>(image.crop ?? FULL)
  // Width over height in pixels, or null for any shape.
  const [ratio, setRatio] = useState<number | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  // A pixel ratio as a ratio of fractions of this image (width over height).
  const shapeOf = (pixels: number) => (size ? (pixels * size.h) / size.w : pixels)

  const pickShape = (choice: number | null | "original") => {
    if (choice === null) return setRatio(null)
    const pixels = choice === "original" ? (size ? size.w / size.h : 1) : choice
    setRatio(pixels)
    setRect(centered(shapeOf(pixels)))
  }

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const box = frame.current?.getBoundingClientRect()
    if (!box) return
    const start = { x: e.clientX, y: e.clientY, rect }
    const shape = ratio === null ? null : shapeOf(ratio)
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
    const next = adjusted(e.shiftKey ? "se" : "move", rect, step[0], step[1], ratio === null ? null : shapeOf(ratio))
    if (next) setRect(next)
  }

  const whole = rect.x <= 0.001 && rect.y <= 0.001 && rect.w >= 0.999 && rect.h >= 0.999
  const save = () => {
    onSave(whole ? null : rect)
    onOpenChange(false)
  }
  const pct = (v: number) => `${v * 100}%`
  const pixels = size ? `${Math.round(rect.w * size.w)} × ${Math.round(rect.h * size.h)}` : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Image {n} – Crop</DialogTitle>
          <DialogDescription className="sr-only">
            Drag inside the frame to move it, or a corner to resize it. With the keyboard, focus the frame:
            arrow keys move it, and Shift with the arrow keys resizes it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Crop shape">
          {SHAPES.map((s) => {
            const active =
              s.ratio === null
                ? ratio === null
                : ratio !== null &&
                  Math.abs(ratio - (s.ratio === "original" ? (size ? size.w / size.h : -1) : s.ratio)) < 0.001
            return (
              <Button
                key={s.label}
                variant="outline"
                size="sm"
                aria-pressed={active}
                onClick={() => pickShape(s.ratio)}
                className={cn(active && "bg-accent text-foreground")}
              >
                {s.label}
              </Button>
            )
          })}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{pixels}</span>
        </div>
        <div className="grid place-items-center rounded-md bg-muted p-2">
          <div ref={frame} className="relative w-fit touch-none overflow-hidden select-none">
            {
              // eslint-disable-next-line @next/next/no-img-element -- a local object URL
              <img
                ref={showSource}
                alt=""
                draggable={false}
                onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="block max-h-[55vh] max-w-full"
              />
            }
            {size && (
              <div
                onPointerDown={startDrag("move")}
                onKeyDown={onFrameKey}
                tabIndex={0}
                role="group"
                aria-label="Crop frame. Arrow keys move it; Shift and arrow keys resize it."
                // The shade outside the frame is the frame's own shadow, clipped to the image.
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
        <DialogFooter className="items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="sm:mr-auto"
            disabled={whole}
            onClick={() => {
              setRatio(null)
              setRect(FULL)
            }}
          >
            Reset
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" className="min-w-32" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
