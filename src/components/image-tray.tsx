"use client"

import { CopyIcon, DownloadIcon, ImagePlusIcon, XIcon } from "lucide-react"
import { useLayoutEffect, useRef } from "react"
import { toast } from "sonner"

import { copyImage, downloadImage, dragOut, MAX_IMAGES, type ImageDrag, type StagedImage } from "@/lib/images"
import { cn } from "@/lib/utils"

export async function copyWithToast(img: StagedImage, what = "image") {
  try {
    await copyImage(img)
    toast.success(`Copied ${what}. Paste it into the post.`)
  } catch {
    toast.error(`Couldn't copy ${what}. Drag it or download it instead.`)
  }
}

const tileButton =
  "grid size-6 place-items-center rounded-md bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"

/**
 * Highlights a drop target while images are dragged over the page: a soft
 * radial glow that spreads across the target from where the drag entered the
 * window, and recedes toward where it left. Place it inside a relatively
 * positioned, overflow-hidden parent.
 */
function DropGlow({ drag }: { drag: ImageDrag | null }) {
  const glow = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = glow.current
    const box = el?.parentElement?.getBoundingClientRect()
    if (!el || !box) return
    if (!drag) {
      // Dropped: fade where it is.
      el.style.opacity = "0"
      return
    }
    // A circle centered on the entry or exit point (often outside the
    // target), big enough to cover the target's farthest corner: it grows
    // from where the drag came in, and shrinks back to where it went out.
    const x = drag.x - box.left
    const y = drag.y - box.top
    // 1.25x so the fading rim passes beyond the far corner.
    const r = 1.25 * Math.max(...[0, box.width].flatMap((cx) => [0, box.height].map((cy) => Math.hypot(cx - x, cy - y))))
    const entering = drag.phase === "in"
    Object.assign(el.style, {
      left: `${x - r}px`,
      top: `${y - r}px`,
      width: `${2 * r}px`,
      height: `${2 * r}px`,
      transition: "none",
      transform: entering ? "scale(0)" : "scale(1)",
      opacity: "1",
    })
    void el.offsetWidth // Commit the start state so the change animates.
    el.style.transition = entering
      ? // Expo-style ease-out: a quick burst from the entry point that glides to rest.
        "transform 1100ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease-out"
      : // Accelerate: a short ramp up, then full speed out toward the exit, no settling.
        "transform 700ms cubic-bezier(0.4, 0, 1, 1), opacity 300ms ease-out"
    el.style.transform = entering ? "scale(1)" : "scale(0)"
  }, [drag])

  return (
    <span
      ref={glow}
      aria-hidden
      className="pointer-events-none absolute rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--foreground)_14%,transparent)_75%,transparent)] opacity-0"
    />
  )
}

type TrayProps = {
  images: StagedImage[]
  /** An image drag over the page, for the drop highlight. */
  drag?: ImageDrag | null
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
}

/** Images staged for the post: drop, paste or pick them; copy, drag or download each one. */
export function ImageTray({ images, drag = null, onAdd, onRemove }: TrayProps) {
  const input = useRef<HTMLInputElement>(null)
  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={(e) => {
        onAdd([...(e.target.files ?? [])])
        e.target.value = ""
      }}
    />
  )

  if (images.length === 0) {
    return (
      <>
        {picker}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={cn(
            "relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground transition-colors duration-300 hover:border-foreground/40 hover:text-foreground",
            drag?.phase === "in" && "border-foreground/40 text-foreground",
          )}
        >
          <DropGlow drag={drag} />
          <ImagePlusIcon className="relative size-4" />
          <span className="relative">Drop, paste, or pick up to {MAX_IMAGES} images</span>
        </button>
      </>
    )
  }

  return (
    <div className="space-y-2">
      {picker}
      <ol className="grid grid-cols-4 gap-2" aria-label="Staged images">
        {images.map((img, i) => (
          <li key={img.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimizable asset */}
            <img
              src={img.url}
              alt={img.name}
              title={`${img.name}: drag into a post, or copy and paste`}
              draggable
              onDragStart={(e) => dragOut(e, img)}
              className="size-full cursor-grab object-cover"
            />
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white tabular-nums">
              {i + 1}
            </span>
            <div className="absolute inset-x-1 top-1 flex justify-between opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <span className="flex gap-1">
                <button
                  type="button"
                  className={tileButton}
                  onClick={() => copyWithToast(img, `image ${i + 1}`)}
                  aria-label={`Copy image ${i + 1}`}
                  title="Copy"
                >
                  <CopyIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={tileButton}
                  onClick={() => downloadImage(img)}
                  aria-label={`Download image ${i + 1}`}
                  title="Download"
                >
                  <DownloadIcon className="size-3.5" />
                </button>
              </span>
              <button
                type="button"
                className={tileButton}
                onClick={() => onRemove(img.id)}
                aria-label={`Remove image ${i + 1}`}
                title="Remove"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
        {images.length < MAX_IMAGES && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              aria-label="Add images"
              title={`Add images (up to ${MAX_IMAGES})`}
              className={cn(
                "relative grid aspect-square w-full place-items-center overflow-hidden rounded-md border border-dashed text-muted-foreground transition-colors duration-300 hover:border-foreground/40 hover:text-foreground",
                drag?.phase === "in" && "border-foreground/40 text-foreground",
              )}
            >
              <DropGlow drag={drag} />
              <ImagePlusIcon className="relative size-5" />
            </button>
          </li>
        )}
      </ol>
    </div>
  )
}

/** Small thumbnails on a platform card: click to copy, or drag into the post. */
export function ImageStrip({ images, platform }: { images: StagedImage[]; platform: string }) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label={`Images for ${platform}`}>
      {images.map((img, i) => (
        <li key={img.id}>
          <button
            type="button"
            onClick={() => copyWithToast(img, `image ${i + 1}`)}
            title={`Copy image ${i + 1}, or drag it into the post`}
            className={cn(
              "relative block size-10 overflow-hidden rounded border bg-muted outline-none",
              "focus-visible:ring-2 focus-visible:ring-(--brand) hover:ring-2 hover:ring-(--brand)",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
            <img
              src={img.url}
              alt={`Image ${i + 1}`}
              draggable
              onDragStart={(e) => dragOut(e, img)}
              className="size-full object-cover"
            />
            <span className="absolute right-0.5 bottom-0.5 rounded-sm bg-black/60 px-0.5 text-[9px] leading-tight text-white tabular-nums">
              {i + 1}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
