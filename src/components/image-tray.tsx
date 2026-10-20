"use client"

import { CopyIcon, DownloadIcon, ImagePlusIcon, XIcon } from "lucide-react"
import { useRef } from "react"
import { toast } from "sonner"

import { copyImage, downloadImage, dragOut, type StagedImage } from "@/lib/images"
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

type TrayProps = {
  images: StagedImage[]
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
}

/** Images staged for the post: drop, paste or pick them; copy, drag or download each one. */
export function ImageTray({ images, onAdd, onRemove }: TrayProps) {
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
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <ImagePlusIcon className="size-4" />
          Drop, paste or pick images
        </button>
      </>
    )
  }

  return (
    <div className="space-y-2">
      {picker}
      <ol className="flex flex-wrap gap-2" aria-label="Staged images">
        {images.map((img, i) => (
          <li key={img.id} className="group relative size-20 overflow-hidden rounded-md border bg-muted">
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
        <li>
          <button
            type="button"
            onClick={() => input.current?.click()}
            aria-label="Add images"
            title="Add images"
            className="grid size-20 place-items-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <ImagePlusIcon className="size-5" />
          </button>
        </li>
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
