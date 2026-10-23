"use client"

import { CheckIcon, CopyIcon, DownloadIcon, ImagePlusIcon, PencilIcon, XIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { PlatformAdapter } from "@/lib/adapters"
import { AltTextDialog } from "@/components/alt-text-dialog"
import { writeClipboard } from "@/components/copy-button"
import { CropDialog } from "@/components/crop-dialog"
import {
  copyImage,
  downloadImage,
  dragOut,
  dropTarget,
  followDragOut,
  MAX_IMAGES,
  TRAY_TYPE,
  type CropRect,
  type ImageDrag,
  type StagedImage,
} from "@/lib/images"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
type Box = { left: number; top: number; width: number; height: number }

function DropGlow({ drag, frame }: { drag: ImageDrag | null; frame?: (el: HTMLElement) => Box }) {
  const glow = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = glow.current
    const parent = el?.parentElement
    if (!el || !parent) return
    // Where the target will be once it settles; it may still be moving.
    const box = frame ? frame(parent) : parent.getBoundingClientRect()
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
  }, [drag, frame])

  return (
    <span
      ref={glow}
      aria-hidden
      className="pointer-events-none absolute rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--foreground)_14%,transparent)_75%,transparent)] opacity-0"
    />
  )
}

const EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]"

/** The key that keeps an image move on one card: ⌘ on a Mac, Ctrl elsewhere (either works). */
const MOVE_KEY =
  typeof navigator !== "undefined" &&
  /mac/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform)
    ? "⌘"
    : "Ctrl"

const plural = (n: number) => `${n} image${n === 1 ? "" : "s"}`

/** The empty drop bar's label for a drag of `count` images (null: the browser doesn't say). */
function dropLabel(count: number | null) {
  if (count === null) return `Drop, paste, or pick up to ${MAX_IMAGES} images`
  if (count <= MAX_IMAGES) return `Add ${plural(count)}`
  return `Add ${MAX_IMAGES} of ${count} images`
}

/** The add tile's note for a drag of `count` images when `room` more fit. */
function fitLabel(count: number, room: number) {
  return count <= room ? `+${count}` : `${room} of ${count} fit`
}

// The expanded drop bar is as tall as a tile in the 4-up row it turns into.
const TILE_HEIGHT = "calc((100cqw - 1.5rem) / 4)"

type AreaProps = {
  images: StagedImage[]
  /** An image drag over the page. */
  drag: ImageDrag | null
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
  /** Move an image beside another in the tray (after it, or before). */
  onReorder: (id: string, target: string, after: boolean) => void
  /** Save an image's alt text. */
  onAltChange: (id: string, alt: string) => void
  /** Crop an image (from the image as added), or with null, show all of it again. */
  onCrop: (id: string, crop: CropRect | null) => void
  /** The Clear Post button, first in the bottom row. */
  clearPost: React.ReactNode
  /** The image buttons (Clear and, after a card changes them, Reset), beside it once images are staged. */
  clearImages: React.ReactNode
}

/**
 * The staged images and the clear buttons. With nothing staged, a slim drop
 * bar sits beside Clear Post; while an image is dragged over the page it
 * moves up and left into the full-width spot the image row will take, and it
 * slides back when the images are cleared.
 */
export function ImageArea({
  images,
  drag,
  onAdd,
  onRemove,
  onReorder,
  onAltChange,
  onCrop,
  clearPost,
  clearImages,
}: AreaProps) {
  const box = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLDivElement>(null)

  // Right after the last image goes, the bar starts in the image row's place
  // for a frame, so it visibly slides back beside Clear Post.
  const [count, setCount] = useState(images.length)
  const [returning, setReturning] = useState(false)
  if (count !== images.length) {
    setCount(images.length)
    if (count > 0 && images.length === 0) setReturning(true)
  }
  useEffect(() => {
    if (!returning) return
    void box.current?.offsetWidth // Lay out the start position so the slide animates.
    const timer = setTimeout(() => setReturning(false), 0)
    return () => clearTimeout(timer)
  }, [returning])

  // The compact bar starts just right of Clear Post.
  useLayoutEffect(() => {
    const el = first.current
    const area = box.current
    if (!el || !area) return
    const sync = () => area.style.setProperty("--bar-left", `${el.offsetWidth + 12}px`)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Transitions start once the bar is in place, so it doesn't slide in on load.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const staged = images.length > 0
  const expanded = !staged && (drag?.phase === "in" || returning)

  return (
    <div ref={box} className="@container relative">
      {staged ? (
        <div className="mb-4">
          <ImageTray images={images} drag={drag} onAdd={onAdd} onRemove={onRemove} onReorder={onReorder} onAltChange={onAltChange} onCrop={onCrop} />
        </div>
      ) : (
        // Makes room above the buttons while the bar is up there.
        <div
          aria-hidden
          className={cn("transition-[height] duration-700", EASE)}
          style={{ height: expanded ? `calc(${TILE_HEIGHT} + 1rem)` : 0 }}
        />
      )}
      <div className="flex flex-wrap items-start gap-3">
        <div ref={first}>{clearPost}</div>
        {staged ? clearImages : <div className="h-9 flex-1" />}
      </div>
      {!staged && <DropBar expanded={expanded} animate={ready} drag={drag} onAdd={onAdd} />}
    </div>
  )
}

/** Where the expanded bar sits: the full width at the top of the area. */
const expandedFrame = (bar: HTMLElement): Box => {
  const area = (bar.offsetParent ?? bar).getBoundingClientRect()
  return { left: area.left, top: area.top, width: area.width, height: (area.width - 24) / 4 }
}

type BarProps = { expanded: boolean; animate: boolean; drag: ImageDrag | null; onAdd: (files: File[]) => void }

function DropBar({ expanded, animate, drag, onAdd }: BarProps) {
  const input = useRef<HTMLInputElement>(null)
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
        // Anchored to the bottom of the area: compact, it fills the row beside
        // Clear Post; expanded, it fills the room made above the row.
        style={
          expanded
            ? { left: 0, bottom: "calc(2.25rem + 1rem)", height: TILE_HEIGHT }
            : { left: "var(--bar-left, 0px)", bottom: 0, height: "2.25rem" }
        }
        className={cn(
          "absolute right-0 flex min-w-0 items-center justify-center gap-2 overflow-hidden rounded-md border border-dashed px-3 text-sm text-muted-foreground duration-700 hover:border-foreground/40 hover:text-foreground",
          "transition-[left,bottom,height,color,border-color]",
          EASE,
          !animate && "transition-none",
          expanded && "flex-col gap-1.5 border-foreground/40 text-foreground",
        )}
      >
        <DropGlow drag={drag} frame={expandedFrame} />
        <ImagePlusIcon className="relative size-4 shrink-0" />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("relative", expanded ? "text-center text-balance" : "truncate")}>
              {drag?.phase === "in"
                ? dropLabel(drag.count)
                : expanded
                  ? `Drop, paste, or pick up to ${MAX_IMAGES} images`
                  : "Drop, paste, or pick images"}
            </span>
          </TooltipTrigger>
          {!expanded && !drag && <TooltipContent>Drop, paste, or pick up to {MAX_IMAGES} images</TooltipContent>}
        </Tooltip>
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
  onReorder: (id: string, target: string, after: boolean) => void
  onAltChange: (id: string, alt: string) => void
  onCrop: (id: string, crop: CropRect | null) => void
}

/** Staged images in one row: copy, drag, download or remove each one, or add more in the empty slot. */
function ImageTray({ images, drag = null, onAdd, onRemove, onReorder, onAltChange, onCrop }: TrayProps) {
  const input = useRef<HTMLInputElement>(null)
  // The image whose alt text, or crop, is being edited.
  const [altFor, setAltFor] = useState<string | null>(null)
  const [cropFor, setCropFor] = useState<string | null>(null)
  const altIndex = images.findIndex((img) => img.id === altFor)
  // Touch screens can't hover: a tap on a tile shows its buttons, and a tap anywhere else hides them.
  const [tapped, setTapped] = useState<string | null>(null)
  useEffect(() => {
    if (!tapped) return
    const away = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(`[data-image-id="${tapped}"]`)) setTapped(null)
    }
    window.addEventListener("pointerdown", away, true)
    return () => window.removeEventListener("pointerdown", away, true)
  }, [tapped])
  const cropIndex = images.findIndex((img) => img.id === cropFor)
  // Where a tile dragged within the tray would land: beside this one.
  const [insert, setInsert] = useState<{ id: string; after: boolean } | null>(null)
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
      {altIndex >= 0 && (
        <AltTextDialog
          image={images[altIndex]}
          n={altIndex + 1}
          open
          onOpenChange={(open) => !open && setAltFor(null)}
          onSave={(alt) => onAltChange(images[altIndex].id, alt)}
        />
      )}
      {cropIndex >= 0 && (
        <CropDialog
          image={images[cropIndex]}
          n={cropIndex + 1}
          open
          onOpenChange={(open) => !open && setCropFor(null)}
          onSave={(crop) => onCrop(images[cropIndex].id, crop)}
        />
      )}
      <ol
        // Four across, the largest tiles; past four images (and the add slot), a column more for
        // each, up to eight. Where eight would make the tiles too small, four across, with the
        // rest on a second line.
        className="grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-2 @max-[32rem]:grid-cols-4"
        style={{ "--cols": Math.min(8, Math.max(4, images.length + (images.length < MAX_IMAGES ? 1 : 0))) } as React.CSSProperties}
        aria-label="Staged images"
        // Drag a tile onto another to reorder; the edge it lands by lights up.
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(TRAY_TYPE)) return
          const target = dropTarget(e)
          if (!target) return
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          if (insert?.id !== target.id || insert.after !== target.after) setInsert(target)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInsert(null)
        }}
        onDrop={(e) => {
          setInsert(null)
          const target = dropTarget(e)
          if (!e.dataTransfer.types.includes(TRAY_TYPE) || !target) return
          e.preventDefault()
          onReorder(e.dataTransfer.getData(TRAY_TYPE), target.id, target.after)
        }}
      >
        {images.map((img, i) => (
          <li
            key={img.id}
            data-image-id={img.id}
            className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
          >
            {/* No hover card: the file name says little (a pasted image's is made up), and the ALT
                badge shows the alt text when hovered. The name is kept for downloads and sharing. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimizable asset */}
            <img
              src={img.url}
              alt={img.alt || `Image ${i + 1}`}
              draggable
              onDragStart={(e) => dragOut(e, img, "tray")}
              onDragEnd={() => setInsert(null)}
              onPointerUp={(e) => e.pointerType !== "mouse" && setTapped(tapped === img.id ? null : img.id)}
              className="size-full cursor-grab object-cover"
            />
            {insert?.id === img.id && (
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-y-0 w-1 bg-foreground",
                  insert.after ? "right-0" : "left-0",
                )}
              />
            )}
            <span className="absolute bottom-1 left-1 grid h-4 min-w-4 place-items-center rounded bg-black/60 px-1 text-[10px] leading-none text-white tabular-nums">
              <span className="[text-box:trim-both_cap_alphabetic]">{i + 1}</span>
            </span>
            {/* Shown on hover or focus, or after a tap on touch screens (which can't hover): ALT upper
                left, crop and remove upper right, download and copy lower right. At rest, only the
                number. On touch screens they're out of the way entirely until the tap, so an
                invisible button can't take a finger. */}
            <div
              className={cn(
                "pointer-events-none absolute inset-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [&>*]:pointer-events-auto",
                tapped === img.id ? "opacity-100" : "pointer-coarse:hidden",
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setAltFor(img.id)}
                    aria-label={img.alt ? `Edit alt text for image ${i + 1}` : `Add alt text for image ${i + 1}`}
                    className={cn(
                      "absolute top-0 left-0 grid h-6 place-items-center rounded-md px-1.5 text-[11px] leading-none font-bold tracking-wide text-white backdrop-blur-sm transition-colors",
                      // With alt text: the app's blue, as on the copied checks, so it's plain it has some.
                      img.alt ? "bg-(--brand-blue) hover:bg-(--brand-blue)/85" : "bg-black/60 hover:bg-black/80",
                    )}
                  >
                    <span className="[text-box:trim-both_cap_alphabetic]">ALT</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{img.alt || "Add alt text"}</TooltipContent>
              </Tooltip>
              <span className="absolute top-0 right-0 flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={tileButton}
                      onClick={() => setCropFor(img.id)}
                      aria-label={`Crop image ${i + 1}`}
                    >
                      <PencilIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{img.crop ? "Change the crop" : "Crop"}</TooltipContent>
                </Tooltip>
                <ConfirmX
                  label={`Remove image ${i + 1}`}
                  onConfirm={() => onRemove(img.id)}
                  className="grid size-6 place-items-center rounded-md text-white backdrop-blur-sm transition-colors"
                  idleClassName="bg-black/60 hover:bg-black/80"
                  iconClassName="size-3.5"
                />
              </span>
              <span className="absolute right-0 bottom-0 flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* Not on touch screens: a phone's tiles are too narrow, and the image is in its
                        photo library already. */}
                    <button
                      type="button"
                      className={cn(tileButton, "pointer-coarse:hidden")}
                      onClick={() => downloadImage(img)}
                      aria-label={`Download image ${i + 1}`}
                    >
                      <DownloadIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={tileButton}
                      onClick={() => copyWithToast(img, `image ${i + 1}`)}
                      aria-label={`Copy image ${i + 1}`}
                    >
                      <CopyIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy</TooltipContent>
                </Tooltip>
              </span>
            </div>
          </li>
        ))}
        {images.length < MAX_IMAGES && (
          <li>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  aria-label="Add images"
                  className={cn(
                    "relative grid aspect-square w-full place-items-center overflow-hidden rounded-md border border-dashed text-muted-foreground transition-colors duration-300 hover:border-foreground/40 hover:text-foreground",
                    drag?.phase === "in" && "border-foreground/40 text-foreground",
                  )}
                >
                  <DropGlow drag={drag} />
                  <span className="relative flex flex-col items-center gap-1">
                    <ImagePlusIcon className="size-5" />
                    {drag?.phase === "in" && drag.count !== null && (
                      <span className="text-xs tabular-nums">
                        {fitLabel(drag.count, MAX_IMAGES - images.length)}
                      </span>
                    )}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Add images (up to {MAX_IMAGES})</TooltipContent>
            </Tooltip>
          </li>
        )}
      </ol>
    </div>
  )
}

type ConfirmXProps = {
  label: string
  onConfirm: () => void
  /** Classes for both states, and for the resting (not yet clicked) state. */
  className: string
  idleClassName: string
  iconClassName?: string
}

/**
 * An x that turns red on the first click and acts on the second. It backs
 * out when the pointer or focus leaves, on Escape, or after a few seconds.
 */
function ConfirmX({ label, onConfirm, className, idleClassName, iconClassName = "size-3" }: ConfirmXProps) {
  const [confirming, setConfirming] = useState(false)
  const [hint, setHint] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  return (
    <Tooltip open={hint || confirming} onOpenChange={setHint}>
      <TooltipTrigger asChild>
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
          className={cn(className, confirming ? "bg-destructive opacity-100" : idleClassName)}
        >
          <XIcon className={iconClassName} strokeWidth={3} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{confirming ? "Click again to confirm" : label}</TooltipContent>
    </Tooltip>
  )
}

/** Text that can turn bold without changing width: a hidden bold copy holds the space. */
function SteadyBold({ bold, children }: { bold: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-grid">
      <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold">
        {children}
      </span>
      <span className={cn("col-start-1 row-start-1", bold && "font-semibold text-foreground")}>{children}</span>
    </span>
  )
}

type StripProps = {
  /** This post's images, with their numbers in the Compose tray. */
  items: { img: StagedImage; n: number }[]
  platform: PlatformAdapter
  /** Ids of the images already copied from this card. */
  copied: ReadonlySet<string>
  onCopiedChange: (id: string, copied: boolean) => void
  /** Leave an image off this platform. */
  onHide: (id: string) => void
  /** Images left off this platform, with a way back; shown on the first post. */
  hiddenCount?: number
  onShowHidden?: () => void
  /** Images can be dragged between this platform's posts (the post handles the drop). */
  movable?: boolean
  /** One of this card's images is being dragged from another post, so show where it can land. */
  moving?: boolean
  onMovingChange?: (moving: boolean) => void
  /** The drag is over this post (and not beside one of its images). */
  hovered?: boolean
  /** Ctrl (Cmd) is held during the drag: a move stays on this card rather than mirroring. */
  onlyHere?: boolean
  /** Where a dragged image would land among these: beside this one. */
  insert?: { id: string; after: boolean } | null
  /** Set when this platform has its own image order: go back to the tray's. */
  onMatchCompose?: () => void
}

/**
 * Thumbnails on one of a platform card's posts: click to copy, or drag into
 * the platform's composer or onto another post. Copied ones get a check; the
 * x leaves one off this platform only. Numbers match the Compose tray.
 */
export function ImageStrip({
  items,
  platform,
  copied,
  onCopiedChange,
  onHide,
  hiddenCount = 0,
  onShowHidden,
  movable,
  moving,
  onMovingChange,
  hovered = false,
  onlyHere = false,
  insert = null,
  onMatchCompose,
}: StripProps) {
  // Ends following the thumbnail drag in progress, if any (see followDragOut).
  const endDrag = useRef<(() => boolean) | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ol className="flex flex-wrap gap-2.5 empty:hidden" aria-label={`Images for ${platform.name}`}>
        {items.map(({ img, n }) => {
          const copy = async () => {
            if (await copyWithToast(img, `image ${n}`)) onCopiedChange(img.id, true)
          }
          return (
            <li key={img.id} data-image-id={img.id} className="group/thumb relative size-14">
              {/* A div acting as the button: Firefox won't start a drag from inside a real <button>.
                  No hover card on the image: the ALT badge shows the alt text when hovered. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={copy}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return
                      e.preventDefault()
                      copy()
                    }}
                    aria-label={copied.has(img.id) ? `Copy image ${n} (copied)` : `Copy image ${n}`}
                    className="block size-full cursor-pointer overflow-hidden rounded border bg-muted outline-none hover:ring-2 hover:ring-(--brand-blue) focus-visible:ring-2 focus-visible:ring-(--brand-blue)"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
                    <img
                      src={img.url}
                      alt=""
                      draggable
                      onDragStart={(e) => {
                        dragOut(e, img, { platformId: platform.id })
                        endDrag.current = followDragOut()
                        // Chrome cancels a drag whose page changes during dragstart, so
                        // show the drop slots just after it.
                        setTimeout(() => onMovingChange?.(true), 0)
                      }}
                      onDragEnd={(e) => {
                        // Dropped outside the page, somewhere that took it (the platform's
                        // composer in another window or the other side of a split view):
                        // as good as copied.
                        const left = endDrag.current?.()
                        endDrag.current = null
                        if (left && e.dataTransfer.dropEffect !== "none") onCopiedChange(img.id, true)
                        onMovingChange?.(false)
                      }}
                      className={cn("size-full object-cover transition", copied.has(img.id) && "opacity-40 grayscale")}
                    />
                  </div>
              {img.alt && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await writeClipboard(img.alt!)
                          toast.success(`Copied alt text for image ${n}. Paste it into ${platform.name}'s alt text field.`)
                        } catch {
                          toast.error(`Couldn't copy the alt text for image ${n}.`)
                        }
                      }}
                      aria-label={`Copy alt text for image ${n}`}
                      className="absolute -top-2 -left-2 grid h-4 place-items-center rounded-full bg-(--brand-blue) px-1.5 text-[10px] leading-none font-bold text-white ring-2 ring-background transition-colors hover:bg-(--brand-blue)/85"
                    >
                      <span className="[text-box:trim-both_cap_alphabetic]">ALT</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">{img.alt}</TooltipContent>
                </Tooltip>
              )}
              {insert?.id === img.id && (
                // The gap this image would drop into.
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-(--brand-blue)",
                    insert.after ? "-right-1.5" : "-left-1.5",
                  )}
                />
              )}
              <span className="pointer-events-none absolute bottom-1 left-1 grid h-4 min-w-4 place-items-center rounded bg-black/60 px-1 text-[10px] leading-none text-white tabular-nums">
                <span className="[text-box:trim-both_cap_alphabetic]">{n}</span>
              </span>
              <ConfirmX
                label={`Leave image ${n} off ${platform.name}`}
                onConfirm={() => onHide(img.id)}
                // Sits over the corner, poking out above the thumbnail. On touch screens, with
                // no hover to bring it out, it's always there.
                className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full text-white ring-2 ring-background transition-[opacity,background-color] focus-visible:opacity-100"
                idleClassName="bg-neutral-700 opacity-0 group-hover/thumb:opacity-100 hover:bg-neutral-600 pointer-coarse:opacity-100"
              />
              {copied.has(img.id) && (
                // Copied: grayed out like a done item, with a blue check badge on the corner
                // (placed like the post counts on the rail, the same blue on every card).
                // Hovering turns it red; clicking clears it.
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onCopiedChange(img.id, false)}
                      aria-label={`Image ${n} copied. Clear the check`}
                      className="absolute -right-1.5 -bottom-1.5 grid size-4 place-items-center rounded-full bg-(--brand-blue) text-white ring-2 ring-background transition-colors hover:bg-destructive focus-visible:bg-destructive focus-visible:outline-none"
                    >
                      <CheckIcon className="size-2.5" strokeWidth={3.5} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Clear the copied check</TooltipContent>
                </Tooltip>
              )}
            </li>
          )
        })}
      </ol>
      {moving && movable && (
        // Where a dragged image lands on this post: the rest of the row, as
        // tall as a thumbnail. Always two lines, so pressing or releasing the
        // key only swaps words: what the drop does, then how to change it.
        <div
          aria-hidden
          className={cn(
            "flex h-14 min-w-40 flex-1 flex-col items-center justify-center rounded border border-dashed px-3 text-center leading-tight text-muted-foreground transition-colors",
            hovered && "border-(--brand-blue) text-foreground",
          )}
        >
          <span className="text-sm">Move here</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {/* The choice in effect is bold; the key switches it. */}
            <SteadyBold bold={!onlyHere}>On all threads</SteadyBold>
            <span aria-hidden>/</span>
            <SteadyBold bold={onlyHere}>{platform.name} only</SteadyBold>
            <kbd
              className={cn(
                "rounded border px-1 font-sans text-[10px] leading-4",
                onlyHere && "border-foreground/40 text-foreground",
              )}
            >
              {MOVE_KEY}
            </kbd>
          </span>
        </div>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onShowHidden}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Show {hiddenCount} hidden
        </button>
      )}
      {onMatchCompose && (
        <button
          type="button"
          onClick={onMatchCompose}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Match Compose order
        </button>
      )}
    </div>
  )
}
