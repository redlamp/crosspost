"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ALT_LIMIT, type StagedImage } from "@/lib/images"
import { graphemeLength } from "@/lib/text"
import { cn } from "@/lib/utils"

type Props = {
  image: StagedImage
  /** The image's number in the Compose tray. */
  n: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (alt: string) => void
}

/**
 * Write an image's alt text once, laid out like Bluesky's: the image across the panel, the
 * text below it with a count against Bluesky's 2,000, then Save. The clipboard carries only
 * pixels, so each platform card offers the text on its own ALT button, to paste into the
 * platform's alt field.
 */
export function AltTextDialog({ image, n, open, onOpenChange, onSave }: Props) {
  const [text, setText] = useState(image.alt ?? "")
  // Start from what's saved each time it opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setText(image.alt ?? "")
  }
  const count = graphemeLength(text)
  const over = count > ALT_LIMIT
  const save = () => {
    if (over) return
    onSave(text.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Image {n} – Alt Text</DialogTitle>
          <DialogDescription className="sr-only">
            Describe image {n} for people who can&apos;t see it.
          </DialogDescription>
        </DialogHeader>
        {/* Wider than the text below it: the whole panel, edge to edge. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
        <img
          src={image.url}
          alt=""
          className="-mx-6 block max-h-[50vh] w-[calc(100%+3rem)] max-w-none bg-muted object-contain"
        />
        <div className="space-y-1.5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save()
            }}
            placeholder="Describe what the image shows"
            aria-label={`Alt text for image ${n}`}
            aria-invalid={over || undefined}
            className="min-h-24"
            autoFocus
          />
          <p className={cn("text-right text-xs tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
            {count.toLocaleString()} / {ALT_LIMIT.toLocaleString()}
          </p>
        </div>
        <DialogFooter className="items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" className="min-w-32" onClick={save} disabled={over}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
