"use client"

import { CheckIcon, ShareIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { writeClipboard } from "@/components/copy-button"
import { Button } from "@/components/ui/button"
import type { PlatformAdapter } from "@/lib/adapters"
import type { StagedImage } from "@/lib/images"
import { canShare, canShareImages, prepareShareFiles, sharePost } from "@/lib/share"

type Props = {
  adapter: PlatformAdapter
  text: string
  /** This post's images, in the card's order. */
  images: StagedImage[]
  /** Names what was shared in the toast, e.g. "Twitter post 2". */
  what: string
  /** Shared: the images that went along, and whether the text did (sent, or on the clipboard), so the card can mark them copied. */
  onShared?: (ids: string[], textWent: boolean) => void
}

const plural = (n: number) => `${n} image${n === 1 ? "" : "s"}`

/**
 * Hands the post to the share sheet, text and images together, for the platform's app. The
 * text goes on the clipboard as well whenever images go along, since some apps keep only
 * those (Bluesky on an iPhone); apps that drop shared text (Meta's) get the images only, and
 * only as many as they take. Nothing when the browser has no share sheet, and hidden on a
 * desktop (a mouse or trackpad pointer).
 */
export function ShareButton({ adapter, text, images, what, onShared }: Props) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1500)
    return () => clearTimeout(t)
  }, [done])

  const { dropsText = false, maxImages } = adapter.share ?? {}
  const sent = maxImages ? images.slice(0, maxImages) : images
  const withImages = canShareImages(sent)
  // Converted ahead of the tap: Safari opens the sheet only close to the gesture, and turning
  // a large image into a PNG inside it can take too long.
  const sentKey = sent.map((img) => img.id).join()
  const [prepared, setPrepared] = useState<{ key: string; files: File[] } | null>(null)
  useEffect(() => {
    if (!withImages) return
    let live = true
    void prepareShareFiles(sent).then((files) => live && setPrepared({ key: sentKey, files }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sentKey stands for sent
  }, [sentKey, withImages])
  // An app that keeps the images only has nothing to take without them.
  if (!canShare() || (dropsText && !withImages)) return null

  const share = async () => {
    // Within the tap, before the sheet: the sheet consumes the gesture.
    let copied = false
    if (text && (dropsText || withImages)) copied = await writeClipboard(text).then(() => true, () => false)
    try {
      const files = prepared?.key === sentKey ? prepared.files : undefined
      const outcome = await sharePost({ text: dropsText ? "" : text, images: sent, files })
      if (outcome === "canceled") return
      setDone(true)
      onShared?.(withImages ? sent.map((img) => img.id) : [], !!text && (!dropsText || copied))
      toast.success(
        message({
          what,
          name: adapter.name,
          sent: withImages ? sent.length : 0,
          left: images.length - sent.length,
          staged: images.length,
          dropsText,
          copied,
        }),
      )
    } catch {
      toast.error(`Couldn't share ${what}. Copy it instead.`)
    }
  }

  return (
    // Touch screens only (phones, tablets), where the share sheet is the way into the apps; on a
    // desktop, Copy and Open do the job, and the sheet there rarely reaches the platforms.
    <Button variant="outline" size="sm" onClick={share} aria-label={`Share ${what}`} className="pointer-fine:hidden">
      {done ? <CheckIcon /> : <ShareIcon />}
      {done ? "Shared" : "Share"}
    </Button>
  )
}

function message({
  what,
  name,
  sent,
  left,
  staged,
  dropsText,
  copied,
}: {
  what: string
  name: string
  /** Images that went along, and how many of the post's were left for the app to take itself. */
  sent: number
  left: number
  staged: number
  dropsText: boolean
  copied: boolean
}) {
  if (dropsText) {
    const rest = left > 0 ? ` ${name} takes ${sent === 1 ? "one" : sent} from the share sheet; add the other${left === 1 ? "" : "s"} there.` : ""
    const text = copied ? ` The text is copied: paste it in ${name}.` : ` ${name} drops shared text, so copy it and paste it in.`
    return `Shared ${plural(sent)}.${rest}${text}`
  }
  if (sent > 0) {
    return `Shared ${what} with ${plural(sent)}.${copied ? " The text is on the clipboard too, in case the app keeps only the images." : ""}`
  }
  if (staged > 0) return `Shared ${what}. This browser can't share images along; copy them separately.`
  return `Shared ${what}.`
}
