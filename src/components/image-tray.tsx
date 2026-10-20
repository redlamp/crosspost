"use client"

import { CheckIcon, CopyIcon, DownloadIcon, ImagePlusIcon, XIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { copyImage, downloadImage, dragOut, MAX_IMAGES, type ImageDrag, type StagedImage } from "@/lib/images"
import { cn } from "@/lib/utils"

/** Copy an image, with a toast either way. Resolves to whether it worked. */
export async function copyWithToast(img: StagedImage, what = "image") {
  try {
    await copyImage(img)
    toast.success(`Copied ${what}. Paste it into the post.`)
    return true
  } catch {
    toast.error(`Couldn't copy ${what}. Drag it or download it instead.`)
    return false
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

type DropZoneProps = {
  /** An image drag over the page: the zone grows and glows. */
  drag?: ImageDrag | null
  onAdd: (files: File[]) => void
  className?: string
}

/**
 * The image drop target while nothing is staged: a slim bar that sits beside
 * Clear Post and grows taller while an image is dragged over the page.
 */
export function ImageDropZone({ drag = null, onAdd, className }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null)
  const active = drag?.phase === "in"
  return (
    <>
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
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          "relative flex h-9 min-w-0 items-center justify-center gap-2 overflow-hidden rounded-md border border-dashed px-3 text-sm text-muted-foreground transition-[height,color,border-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-foreground/40 hover:text-foreground",
          active && "h-24 flex-col gap-1.5 border-foreground/40 text-foreground",
          className,
        )}
      >
        <DropGlow drag={drag} />
        <ImagePlusIcon className="relative size-4 shrink-0" />
        <span
          className={cn("relative", active ? "text-center text-balance" : "truncate")}
          title={`Drop, paste, or pick up to ${MAX_IMAGES} images`}
        >
          {active ? `Drop, paste, or pick up to ${MAX_IMAGES} images` : "Drop, paste, or pick images"}
        </span>
      </button>
    </>
  )
}

type TrayProps = {
  images: StagedImage[]
  /** An image drag over the page, for the drop highlight. */
  drag?: ImageDrag | null
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
}

/** Staged images in one row: copy, drag, download or remove each one, or add more in the empty slot. */
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

/**
 * The x on a card thumbnail. The first click turns it red; the second leaves
 * the image off. It backs out when the pointer or focus leaves, or after a
 * few seconds.
 */
function LeaveOffButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  return (
    <button
      type="button"
      onClick={() => {
        if (!confirming) return setConfirming(true)
        setConfirming(false)
        onConfirm()
      }}
      onBlur={() => setConfirming(false)}
      onMouseLeave={() => setConfirming(false)}
      onKeyDown={(e) => e.key === "Escape" && setConfirming(false)}
      aria-label={confirming ? `${label}: click again to confirm` : label}
      title={confirming ? "Click again to confirm" : label}
      className={cn(
        // Sits over the corner, poking out above the thumbnail.
        "absolute -top-2 -right-2 grid size-5 place-items-center rounded-full text-white ring-2 ring-background transition-[opacity,background-color] focus-visible:opacity-100",
        confirming
          ? "bg-destructive opacity-100"
          : "bg-neutral-700 opacity-0 group-hover/thumb:opacity-100 hover:bg-neutral-600",
      )}
    >
      <XIcon className="size-3" strokeWidth={3} />
    </button>
  )
}

type StripProps = {
  images: StagedImage[]
  platform: string
  /** Ids of the images already copied from this card. */
  copied: ReadonlySet<string>
  onCopied: (id: string) => void
  /** Ids of the images left off this platform's post. */
  hidden: ReadonlySet<string>
  onHiddenChange: (hidden: ReadonlySet<string>) => void
}

/**
 * Small thumbnails on a platform card: click to copy, or drag into the post.
 * Copied ones get a check; the x leaves one off this platform only. Numbers
 * match the Compose tray, so a skipped image leaves a gap.
 */
export function ImageStrip({ images, platform, copied, onCopied, hidden, onHiddenChange }: StripProps) {
  const hiddenCount = images.filter((img) => hidden.has(img.id)).length
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ol className="flex flex-wrap gap-2.5" aria-label={`Images for ${platform}`}>
        {images.map((img, i) =>
          hidden.has(img.id) ? null : (
            <li key={img.id} className="group/thumb relative size-14">
              <button
                type="button"
                onClick={async () => {
                  if (await copyWithToast(img, `image ${i + 1}`)) onCopied(img.id)
                }}
                title={
                  copied.has(img.id)
                    ? `Image ${i + 1} copied for ${platform}. Click to copy again.`
                    : `Copy image ${i + 1}, or drag it into the post`
                }
                aria-pressed={copied.has(img.id)}
                className="block size-full overflow-hidden rounded border bg-muted outline-none hover:ring-2 hover:ring-(--brand) focus-visible:ring-2 focus-visible:ring-(--brand)"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
                <img
                  src={img.url}
                  alt={`Image ${i + 1}`}
                  draggable
                  onDragStart={(e) => dragOut(e, img)}
                  className={cn("size-full object-cover transition", copied.has(img.id) && "opacity-40 grayscale")}
                />
              </button>
              <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white tabular-nums">
                {i + 1}
              </span>
              <LeaveOffButton
                label={`Leave image ${i + 1} off ${platform}`}
                onConfirm={() => onHiddenChange(new Set(hidden).add(img.id))}
              />
              {copied.has(img.id) && (
                // Copied: grayed out like a done item, with a blue check badge on the corner
                // (placed like the post counts on the rail, the same blue on every card).
                <span className="pointer-events-none absolute -right-1.5 -bottom-1.5 grid size-4 place-items-center rounded-full bg-sky-500 text-white ring-2 ring-background">
                  <CheckIcon className="size-2.5" strokeWidth={3.5} aria-label="Copied" />
                </span>
              )}
            </li>
          ),
        )}
      </ol>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => onHiddenChange(new Set())}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Show {hiddenCount} hidden
        </button>
      )}
    </div>
  )
}
