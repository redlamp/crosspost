"use client"

import { CheckIcon, CopyIcon, DownloadIcon, ImagePlusIcon, PlayIcon, WrenchIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { PlatformAdapter } from "@/lib/adapters"
import { writeClipboard } from "@/components/copy-button"
import { MediaDialog, type MediaTab, type VideoChange, type VideoSplitting } from "@/components/media-dialog"
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
  altKey,
  wasDownloaded,
} from "@/lib/images"
import { formatDuration, isVideo, mediaKind, mediaNoun } from "@/lib/media"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** What the pickers take. */
const ACCEPT = "image/*,video/*"

/** "Image 2" or "Video 2". */
const named = (img: StagedImage, n: number) => `${isVideo(img) ? "Video" : "Image"} ${n}`

type PreviewProps = { img: StagedImage; alt: string; playOnHover?: boolean } & Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
>

/**
 * An image, or a video's opening frame, muted; with `playOnHover`, the video plays while the
 * pointer is on it, so it's plain which clip it is.
 */
export function Preview({ img, alt, playOnHover, ...rest }: PreviewProps) {
  if (!isVideo(img)) {
    // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimizable asset
    return <img src={img.url} alt={alt} {...rest} />
  }
  return (
    <video
      // A moment in, so browsers that show nothing until played (Safari) show a frame.
      src={`${img.url}#t=0.1`}
      aria-label={alt || undefined}
      muted
      playsInline
      loop
      preload="metadata"
      onMouseEnter={playOnHover ? (e) => void e.currentTarget.play().catch(() => {}) : undefined}
      onMouseLeave={playOnHover ? (e) => e.currentTarget.pause() : undefined}
      {...rest}
    />
  )
}

/** A video's length, beside its number: a play mark and "0:42" (just the mark until it's read). */
function Length({ img }: { img: StagedImage }) {
  if (!isVideo(img)) return null
  return (
    <span className="flex h-4 items-center gap-0.5 rounded bg-black/60 px-1 text-[10px] leading-none text-white tabular-nums">
      <PlayIcon className="size-2.5 fill-current" aria-hidden />
      {img.video && <span className="[text-box:trim-both_cap_alphabetic]">{formatDuration(img.video.duration)}</span>}
    </span>
  )
}

/**
 * Save a video (the clipboard takes pictures only), or an image for a composer that ignores pasted
 * ones (LinkedIn, Instagram), with a toast saying where it goes next. One
 * saved before, unchanged, isn't saved again: the toast says where it is, with Download again.
 */
export function downloadWithToast(img: StagedImage, what: string, platform?: string) {
  const composer = platform ? `${platform}'s` : "the platform's"
  if (wasDownloaded(img)) {
    toast.info(`Already downloaded ${what}. Check your Downloads folder, and add it in ${composer} composer.`, {
      action: { label: "Download again", onClick: () => downloadImage(img) },
    })
    return
  }
  downloadImage(img)
  toast.success(`Saved ${what}. Add it in ${composer} composer.`)
}

/** Copy an image, with a toast either way. Resolves to whether it worked. */
export async function copyWithToast(img: StagedImage, what = "image") {
  // Making a large PNG takes a few seconds, so the toast says so at once and then turns into the result.
  const id = toast.loading(`Copying ${what}…`)
  try {
    await copyImage(img)
    toast.success(`Copied ${what}. Paste it into the post.`, { id })
    return true
  } catch {
    toast.error(`Couldn't copy ${what}. Drag it or download it instead.`, { id })
    return false
  }
}

const tileButton =
  "grid size-6 place-items-center rounded-md bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"

/**
 * A tile's crop button (Crop & Trim on a video); a tile has two, upper right and under ALT, and
 * its width shows one.
 */
function CropButton({ img, n, onClick, className }: { img: StagedImage; n: number; onClick: () => void; className: string }) {
  const video = isVideo(img)
  const changed = !!img.crop || !!img.trim || !!img.resize
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(tileButton, className)}
          onClick={onClick}
          aria-label={`${video ? "Crop or trim" : "Crop"} ${mediaKind(img)} ${n}`}
        >
          <WrenchIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{changed ? `Change the ${video ? "edit" : "crop"}` : video ? "Crop & Trim" : "Crop"}</TooltipContent>
    </Tooltip>
  )
}

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

/** The empty drop bar's label for a drag of `count` files, `videos` of them videos (null: the browser doesn't say). */
function dropLabel(count: number | null, videos: number | null) {
  if (count === null) return `Drop, paste, or pick up to ${MAX_IMAGES} images or videos`
  if (count <= MAX_IMAGES) return `Add ${mediaNoun(count - (videos ?? 0), videos ?? 0)}`
  return `Add ${MAX_IMAGES} of ${count} files`
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
  /** Keep a video's crop and trim, made in its dialog (or back to the video as added). */
  onVideoChange: (id: string, change: VideoChange) => void
  /** The platforms shown, whose video length caps the trim timeline offers. */
  platforms: PlatformAdapter[]
  /** A video's splits into clips for each platform, for its dialog. */
  splitting?: (id: string) => VideoSplitting
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
  onVideoChange,
  platforms,
  splitting,
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
          <ImageTray
            images={images}
            drag={drag}
            onAdd={onAdd}
            onRemove={onRemove}
            onReorder={onReorder}
            onAltChange={onAltChange}
            onCrop={onCrop}
            onVideoChange={onVideoChange}
            platforms={platforms}
            splitting={splitting}
          />
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
        accept={ACCEPT}
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
                ? dropLabel(drag.count, drag.videos)
                : expanded
                  ? `Drop, paste, or pick up to ${MAX_IMAGES} images or videos`
                  : "Drop, paste, or pick images or videos"}
            </span>
          </TooltipTrigger>
          {!expanded && !drag && <TooltipContent>Drop, paste, or pick up to {MAX_IMAGES} images or videos</TooltipContent>}
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
  onVideoChange: (id: string, change: VideoChange) => void
  platforms: PlatformAdapter[]
  splitting?: (id: string) => VideoSplitting
}

/** Staged images in one row: copy, drag, download or remove each one, or add more in the empty slot. */
function ImageTray({
  images,
  drag = null,
  onAdd,
  onRemove,
  onReorder,
  onAltChange,
  onCrop,
  onVideoChange,
  platforms,
  splitting,
}: TrayProps) {
  const input = useRef<HTMLInputElement>(null)
  // The image whose alt text, or crop, is being edited.
  const [editing, setEditing] = useState<{ id: string; tab: MediaTab } | null>(null)
  const editIndex = images.findIndex((img) => img.id === editing?.id)
  // A touch tap first shows a tile's buttons; a tap on a tile already showing them opens it.
  const tapOpens = useRef(false)
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
  // Where a tile dragged within the tray would land: beside this one.
  const [insert, setInsert] = useState<{ id: string; after: boolean } | null>(null)
  const picker = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT}
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
      {editIndex >= 0 && (
        <MediaDialog
          image={images[editIndex]}
          n={editIndex + 1}
          tab={editing!.tab}
          onTabChange={(tab) => setEditing((e) => e && { ...e, tab })}
          onClose={() => setEditing(null)}
          platforms={platforms}
          onAltChange={(alt) => onAltChange(images[editIndex].id, alt)}
          onCrop={(crop) => onCrop(images[editIndex].id, crop)}
          onVideoChange={(change) => onVideoChange(images[editIndex].id, change)}
          splitting={splitting}
          {...(images.length > 1 && {
            // Round the tray, either way, on the tab in use.
            onNavigate: (dir: -1 | 1) =>
              setEditing((e) => e && { ...e, id: images[(editIndex + dir + images.length) % images.length].id }),
            neighbors: {
              prev: named(images[(editIndex - 1 + images.length) % images.length], ((editIndex - 1 + images.length) % images.length) + 1),
              next: named(images[(editIndex + 1) % images.length], ((editIndex + 1) % images.length) + 1),
            },
            ahead: [images[(editIndex - 1 + images.length) % images.length], images[(editIndex + 1) % images.length]],
          })}
        />
      )}
      <ol
        // Four across, the largest tiles; with a fifth (images and the add slot), five across, and
        // past that a second line. Where five would make the tiles too small, four across.
        className="grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-2 @max-[32rem]:grid-cols-4"
        style={{ "--cols": images.length + (images.length < MAX_IMAGES ? 1 : 0) > 4 ? 5 : 4 } as React.CSSProperties}
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
            // A container, so its buttons can drop out as the tile narrows.
            className="group @container/tile relative aspect-square overflow-hidden rounded-md border bg-muted"
          >
            {/* No hover card: the file name says little (a pasted image's is made up), and the ALT
                badge shows the alt text when hovered. The name is kept for downloads and sharing. */}
            <Preview
              img={img}
              alt={img.alt || named(img, i + 1)}
              playOnHover
              draggable
              onDragStart={(e) => dragOut(e, img, "tray")}
              onDragEnd={() => setInsert(null)}
              onPointerDown={(e) => {
                tapOpens.current = e.pointerType === "mouse" || tapped === img.id
              }}
              onPointerUp={(e) => e.pointerType !== "mouse" && tapped !== img.id && setTapped(img.id)}
              // Clicking the picture opens it on Alt Text, its preview (the wrench opens its crop).
              onClick={() => tapOpens.current && setEditing({ id: img.id, tab: "alt" })}
              className="size-full cursor-pointer object-cover active:cursor-grabbing"
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
            <span className="pointer-events-none absolute bottom-1 left-1 flex gap-1">
              <span className="grid h-4 min-w-4 place-items-center rounded bg-black/60 px-1 text-[10px] leading-none text-white tabular-nums">
                <span className="[text-box:trim-both_cap_alphabetic]">{i + 1}</span>
              </span>
              <Length img={img} />
            </span>
            {/* Shown on hover or focus, or after a tap on touch screens (which can't hover): ALT upper
                left (its own, below, kept in view once there's alt text), crop and remove upper
                right, download and copy lower right. At rest, only the number (and ALT, with alt
                text). On narrower tiles (five across, under 7rem) Download goes and crop moves
                under ALT, since the top row has no room for it; on the narrowest (phones, under
                5.5rem) crop goes too, as it would cover the number. On touch screens they're out
                of the way entirely until the tap, so an invisible button can't take a finger. */}
            {/* ALT, upper left: with the others while the image has none, and always there once it
                has some (the app's blue, as on the cards), so it's plain which images have it. */}
            <div
              className={cn(
                "absolute top-1 left-1 z-10",
                !img.alt && [
                  "pointer-events-none opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [&>*]:pointer-events-auto",
                  tapped === img.id ? "opacity-100" : "pointer-coarse:hidden",
                ],
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setEditing({ id: img.id, tab: "alt" })}
                    aria-label={`${img.alt ? "Edit" : "Add"} alt text for ${mediaKind(img)} ${i + 1}`}
                    className={cn(
                      "grid h-6 place-items-center rounded-md px-1.5 text-[11px] leading-none font-bold tracking-wide text-white backdrop-blur-sm transition-colors",
                      // With alt text: the app's blue, as on the copied checks, so it's plain it has some.
                      img.alt ? "bg-(--brand-blue) hover:bg-(--brand-blue)/85" : "bg-black/60 hover:bg-black/80",
                    )}
                  >
                    <span className="[text-box:trim-both_cap_alphabetic]">ALT</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{img.alt || "Add alt text"}</TooltipContent>
              </Tooltip>
            </div>
            <div
              className={cn(
                "pointer-events-none absolute inset-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [&>*]:pointer-events-auto",
                tapped === img.id ? "opacity-100" : "pointer-coarse:hidden",
              )}
            >
              {/* Narrower tiles: crop under ALT, as the top row has no room for it. */}
              <CropButton
                img={img}
                n={i + 1}
                onClick={() => setEditing({ id: img.id, tab: "edit" })}
                className="absolute top-7 left-0 hidden @max-[7rem]/tile:grid @max-[5.5rem]/tile:hidden"
              />
              <span className="absolute top-0 right-0 flex gap-1">
                <CropButton
                  img={img}
                  n={i + 1}
                  onClick={() => setEditing({ id: img.id, tab: "edit" })}
                  className="@max-[7rem]/tile:hidden"
                />
                <ConfirmX
                  label={`Remove ${mediaKind(img)} ${i + 1}`}
                  onConfirm={() => onRemove(img.id)}
                  className="grid size-6 place-items-center rounded-md text-white backdrop-blur-sm transition-colors"
                  idleClassName="bg-black/60 hover:bg-black/80"
                  iconClassName="size-3.5"
                />
              </span>
              {isVideo(img) ? (
                // A video can't go on the clipboard: Download takes Copy's place, on every width
                // (not on touch screens, where it's in the phone's library already).
                <span className="absolute right-0 bottom-0 flex gap-1 pointer-coarse:hidden">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={tileButton}
                        onClick={() => downloadImage(img)}
                        aria-label={`Download video ${i + 1}`}
                      >
                        <DownloadIcon className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Download</TooltipContent>
                  </Tooltip>
                </span>
              ) : (
              <span className="absolute right-0 bottom-0 flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* Not on touch screens: a phone's tiles are too narrow, and the image is in its
                        photo library already. */}
                    <button
                      type="button"
                      className={cn(tileButton, "pointer-coarse:hidden @max-[7rem]/tile:hidden")}
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
              )}
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
                  aria-label="Add images or videos"
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
              <TooltipContent>Add images or videos (up to {MAX_IMAGES})</TooltipContent>
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
  /** This post's images, with their numbers in the Compose tray ("1.2": video 1's second part). */
  items: { img: StagedImage; n: number | string }[]
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
  /** Alt texts already copied or ticked on this card (`altKey`), and noting or clearing one. */
  copiedAlts?: ReadonlySet<string>
  onAltCopiedChange?: (key: string, on: boolean) => void
  /** Videos the platform won't take as they are, by id, with why: marked in the corner. */
  issues?: ReadonlyMap<string, string>
  /** Open one in the media dialog, from the corner's wrench: to preview and edit it (and fix it). */
  onEdit?: (id: string) => void
}

/**
 * Thumbnails on one of a platform card's posts: click to copy an image or download a video, or drag into
 * the platform's composer or onto another post; the upper left corner's wrench
 * opens one to preview and edit. Copied ones get a check, and the lower right corner checks one
 * off by hand; the x leaves one off
 * this platform only. Numbers match the Compose tray.
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
  issues,
  onEdit,
  copiedAlts,
  onAltCopiedChange,
}: StripProps) {
  // Ends following the thumbnail drag in progress, if any (see followDragOut).
  const endDrag = useRef<(() => boolean) | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ol className="flex flex-wrap gap-2.5 empty:hidden" aria-label={`Images for ${platform.name}`}>
        {items.map(({ img, n }) => {
          // A click copies an image, to paste in the platform's composer, and downloads a video
          // (the clipboard takes pictures only), or an image where the composer ignores pasted
          // ones (LinkedIn, Instagram); the corner's wrench opens it to preview and edit.
          const video = isVideo(img)
          const download = video || platform.compose.image === "file"
          const what = `${mediaKind(img)} ${n}`
          const issue = issues?.get(img.id)
          const altDone = !!img.alt && !!copiedAlts?.has(altKey(img))
          const save = async () => {
            if (download) {
              downloadWithToast(img, what, platform.name)
              onCopiedChange(img.id, true)
            } else if (await copyWithToast(img, what)) onCopiedChange(img.id, true)
          }
          return (
            <li
              key={img.id}
              data-image-id={img.id}
              data-crosspost-step="media"
              data-image={n}
              data-done={copied.has(img.id)}
              className="flex w-14 flex-col gap-1.5"
            >
              {/* The thumbnail and everything on it; the ALT button goes under it. */}
              <div className="group/thumb relative size-14">
              {/* A div acting as the button: Firefox won't start a drag from inside a real <button>.
                  No hover card on the image: the ALT badge shows the alt text when hovered. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={save}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return
                      e.preventDefault()
                      save()
                    }}
                    aria-label={`${download ? "Download" : "Copy"} ${what}${copied.has(img.id) ? " (copied)" : ""}`}
                    data-crosspost-action={download ? "download-image" : "copy-image"}
                    data-platform={platform.id}
                    data-image={n}
                    className={cn(
                      "block size-full cursor-pointer overflow-hidden rounded border bg-muted outline-none focus-visible:ring-2",
                      // Won't go as it is: the rail's warning treatment, a red ring (and the badge below).
                      issue
                        ? "ring-2 ring-destructive ring-offset-2 ring-offset-background focus-visible:ring-destructive"
                        : "hover:ring-2 hover:ring-(--brand-blue) focus-visible:ring-(--brand-blue)",
                    )}
                  >
                    <Preview
                      img={img}
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
              {video && (
                // No room for the length on a thumbnail: the play mark says it's a video.
                <PlayIcon
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-1/2 size-5 -translate-1/2 fill-white text-white drop-shadow transition-opacity group-hover/thumb:opacity-0"
                />
              )}
              {/* Hovered, what a click does, over the darkened thumbnail: copy an image, download a video. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 grid place-items-center rounded bg-black/55 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
              >
                {download ? <DownloadIcon className="size-5" /> : <CopyIcon className="size-5" />}
              </span>
              {onEdit && (
                // The upper left corner: the alert while the platform won't take it, and hovered
                // (always on touch screens), a wrench that opens it to preview and edit, and to fix.
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onEdit(img.id)}
                      aria-label={issue ? `Fix ${what} for ${platform.name}: ${issue}` : `Edit ${what}`}
                      className={cn(
                        "absolute -top-2 -left-2 z-10 grid size-5 place-items-center rounded-full text-white ring-2 ring-background transition-[opacity,background-color] focus-visible:opacity-100",
                        issue
                          ? "bg-destructive hover:bg-destructive/85"
                          : "bg-neutral-700 opacity-0 group-hover/thumb:opacity-100 hover:bg-neutral-600 pointer-coarse:opacity-100",
                      )}
                    >
                      {issue && (
                        <TriangleAlertIcon
                          className="size-3 group-hover/thumb:hidden pointer-coarse:hidden"
                          strokeWidth={3}
                          aria-hidden
                        />
                      )}
                      <WrenchIcon
                        className={cn("size-3", issue && "hidden group-hover/thumb:block pointer-coarse:block")}
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    {issue ? `${issue}. Fix it for ${platform.name}.` : "Edit"}
                  </TooltipContent>
                </Tooltip>
              )}
              <ConfirmX
                label={`Leave ${what} off ${platform.name}`}
                onConfirm={() => onHide(img.id)}
                // Sits over the corner, poking out above the thumbnail. On touch screens, with
                // no hover to bring it out, it's always there.
                className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full text-white ring-2 ring-background transition-[opacity,background-color] focus-visible:opacity-100"
                idleClassName="bg-neutral-700 opacity-0 group-hover/thumb:opacity-100 hover:bg-neutral-600 pointer-coarse:opacity-100"
              />
              {copied.has(img.id) ? (
                // Copied: grayed out like a done item, with a blue check badge on the corner
                // (placed like the post counts on the rail, the same blue on every card).
                // Hovering turns it red; clicking clears it.
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onCopiedChange(img.id, false)}
                      aria-label={`${video ? "Video" : "Image"} ${n} copied. Clear the check`}
                      data-crosspost-action="mark-image"
                      data-platform={platform.id}
                      data-image={n}
                      className="absolute -right-1.5 -bottom-1.5 grid size-4.5 place-items-center rounded-full bg-(--brand-blue) text-white ring-2 ring-background transition-colors hover:bg-destructive focus-visible:bg-destructive focus-visible:outline-none"
                    >
                      <CheckIcon className="size-2.75" strokeWidth={3.5} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Clear the copied check</TooltipContent>
                </Tooltip>
              ) : (
                // Not copied: the same corner, hovered (always on touch screens, as the other
                // corners), checks it off by hand, for one added to the platform some other way.
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onCopiedChange(img.id, true)}
                      aria-label={`Mark ${what} as added to ${platform.name}`}
                      data-crosspost-action="mark-image"
                      data-platform={platform.id}
                      data-image={n}
                      className="absolute -right-1.5 -bottom-1.5 grid size-4.5 place-items-center rounded-full bg-neutral-700 text-white opacity-0 ring-2 ring-background transition-[opacity,background-color] group-hover/thumb:opacity-100 hover:bg-(--brand-blue) focus-visible:bg-(--brand-blue) focus-visible:opacity-100 focus-visible:outline-none pointer-coarse:opacity-100"
                    >
                      <CheckIcon className="size-2.75" strokeWidth={3.5} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Mark as added</TooltipContent>
                </Tooltip>
              )}
              </div>
              {img.alt && (
                // Under the thumbnail, its width: an easy target, and off the crowded corners. Copying
                // it ticks its step; the check beside it ticks or clears it by hand (typed in, say).
                <div
                  className="flex h-6 gap-px"
                  data-crosspost-step="alt"
                  data-image={n}
                  data-done={altDone}
                >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-crosspost-action="copy-alt"
                      data-platform={platform.id}
                      data-image={n}
                      onClick={async () => {
                        try {
                          await writeClipboard(img.alt!)
                          onAltCopiedChange?.(altKey(img), true)
                          toast.success(`Copied alt text for ${what}. Paste it into ${platform.name}'s alt text field.`)
                        } catch {
                          toast.error(`Couldn't copy the alt text for ${what}.`)
                        }
                      }}
                      aria-label={`Copy alt text for ${what}${altDone ? " (done)" : ""}`}
                      className="flex h-6 min-w-0 flex-1 items-center justify-center rounded-l-md bg-(--brand-blue) text-[11px] leading-none font-bold tracking-wide text-white transition-colors hover:bg-(--brand-blue)/85 focus-visible:ring-2 focus-visible:ring-(--brand-blue) focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                    >
                      <span className="[text-box:trim-both_cap_alphabetic]">ALT</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">{img.alt}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-pressed={altDone}
                      aria-label={`Mark alt text for ${what} done on ${platform.name}`}
                      data-crosspost-action="mark-alt"
                      data-platform={platform.id}
                      data-image={n}
                      onClick={() => onAltCopiedChange?.(altKey(img), !altDone)}
                      className={cn(
                        "grid w-5 shrink-0 place-items-center rounded-r-md text-white transition-colors focus-visible:ring-2 focus-visible:ring-(--brand-blue) focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                        // Done (copied, or ticked): the app's blue, as the copied-image checks.
                        altDone ? "bg-(--brand-blue) hover:bg-destructive" : "bg-neutral-700 hover:bg-(--brand-blue)",
                      )}
                    >
                      <CheckIcon className={cn("size-3", !altDone && "opacity-60")} strokeWidth={3} aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{altDone ? "Alt text added. Click to clear" : "Mark alt text as added"}</TooltipContent>
                </Tooltip>
                </div>
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
