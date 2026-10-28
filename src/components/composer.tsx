"use client"

import { BroomIcon, ImageMinusIcon, RotateCcwIcon } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ComposeEditor, type SplitMarker } from "@/components/compose-editor"
import { ConfirmButton } from "@/components/confirm-button"
import { ImageArea } from "@/components/image-tray"
import { MediaDialog, type MediaTab, type VideoChange, type VideoSplitting } from "@/components/media-dialog"
import { firstProblem, PlatformCard, type PostEdit } from "@/components/platform-card"
import { PlatformLogo } from "@/components/platform-logo"
import { MadeBy } from "@/components/made-by"
import { SplitViewTip } from "@/components/split-view-tip"
import { WelcomeCard } from "@/components/welcome-card"
import { cardId, StatusRail, type RailItem } from "@/components/status-rail"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { adapters, type PlatformAdapter } from "@/lib/adapters"
import { trackDelivery } from "@/lib/analytics"
import { findMentions, graphemeLength, shiftBreaks, splitChunks, type Chunk } from "@/lib/text"
import { EXAMPLE_IMAGE, EXAMPLE_POST, EXAMPLE_SPLIT } from "@/lib/example"
import { isVideo, mediaNoun, mediaPerPost, mediaProblem, probeVideo } from "@/lib/media"
import {
  altKey,
  cropImage,
  fileName,
  MAX_IMAGES,
  onClearedElsewhere,
  reorder,
  usePageImageInput,
  useStagedImages,
  VERSIONS_KEY,
  type CropRect,
  type StagedImage,
} from "@/lib/images"
import { sharedText, useSharedPost } from "@/lib/share-target"
import {
  arrangePlatforms,
  isShown,
  serverHost,
  updatePlatformSettings,
  usePlatformSettings,
} from "@/lib/platform-settings"
import { blobToDataUrl, buildPayload, payloadJson, PAYLOAD_VERSION, type Payload } from "@/lib/payload"
import { cardProgress, type CardMarks, type CardNeeds } from "@/lib/progress"
import { useGlide } from "@/lib/use-glide"
import { useStoredState } from "@/lib/use-stored-state"
import { spanLength, type Span } from "@/lib/trim"
import { renderVideo } from "@/lib/video-edit"
import { clipCap, clipsFor, sameClips, sameSplits, sharedSplits, type VideoSplits } from "@/lib/video-splits"

type Prefs = {
  /** Add " i/n" to split posts on platforms that don't number threads themselves. */
  numbering: boolean
  enabled: Record<string, boolean>
}

// Numbering starts off: a thread reads fine without " 1/3", and it costs characters.
const DEFAULT_PREFS: Prefs = { numbering: false, enabled: {} }

/** Post index per image id: shared by the threaded platforms, and per-platform overrides. */
type Placement = { shared: Record<string, number>; only: Record<string, Record<string, number>> }

type Breaks = Record<string, number[]>

/**
 * Where each platform stands, kept across reloads: marked posted, the posts and images copied
 * from its card (a post by its text, so an edit makes it new again), and images left off it.
 */
type Progress = {
  posted: Record<string, boolean>
  copiedPosts: Record<string, string[]>
  copiedImages: Record<string, string[]>
  hiddenImages: Record<string, string[]>
  /** The @tags confirmed as right on each platform; a new tag needs confirming again. */
  checkedTags: Record<string, string[]>
  /** Alt texts copied from each platform's card (`altKey`: the item and its text as it was). */
  copiedAlts: Record<string, string[]>
}

const NO_PROGRESS: Progress = {
  posted: {},
  copiedPosts: {},
  copiedImages: {},
  hiddenImages: {},
  checkedTags: {},
  copiedAlts: {},
}

type ProgressList = Exclude<keyof Progress, "posted">

/** Progress with `items` added to (on) or taken out of one platform's list. */
function markIn(p: Progress, list: ProgressList, platformId: string, items: string[], on: boolean): Progress {
  const now = p[list][platformId] ?? []
  const next = on ? [...new Set([...now, ...items])] : now.filter((x) => !items.includes(x))
  return { ...p, [list]: { ...p[list], [platformId]: next } }
}

/** The posts with any that were rewritten on the card swapped in, by post number. */
function withEdits(chunks: Chunk[], edits: Record<number, PostEdit> | undefined): Chunk[] {
  if (!edits) return chunks
  return chunks.map((c, i) => (edits[i] ? { ...c, text: edits[i].text } : c))
}

function chunksFor(adapter: PlatformAdapter, text: string, numbering: boolean, breaks: number[] = []): Chunk[] {
  if (adapter.chain) return splitChunks(text, adapter.limit, adapter.count, { numbering, breaks })
  const trimmed = text.trim()
  if (!trimmed) return []
  const start = text.indexOf(trimmed)
  return [{ text: trimmed, start, end: start + trimmed.length, manual: false }]
}

function listNames(names: string[]) {
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

/** The id of the animation that glides a card to its new place when the cards reorder. */
const CARD_GLIDE = "card-glide"

export default function Composer() {
  const [draft, setDraft] = useStoredState("crosspost:draft", "")
  const [prefs, setPrefs] = useStoredState<Prefs>("crosspost:prefs", DEFAULT_PREFS)
  // Splits the user placed by hand, per platform, as offsets into the draft.
  const [breaks, setBreaks] = useStoredState<Breaks>("crosspost:breaks", {})
  const { images, setImages, add: stageImages, loaded: trayLoaded, saveFailed: traySaveFailed } = useStagedImages()
  // Platforms' clips of tray videos (where a video is split for a platform, by hand or by its
  // length limit), kept apart from the tray.
  const {
    images: versions,
    setImages: setVersions,
    loaded: versionsLoaded,
    saveFailed: versionsSaveFailed,
  } = useStagedImages(VERSIONS_KEY)
  // Clips of tray videos that are gone (removed before clips went with them) aren't kept.
  useEffect(() => {
    if (!trayLoaded || !versionsLoaded) return
    if (versions.some((v) => !images.some((img) => img.id === v.version?.of)))
      setVersions((list) => list.filter((v) => images.some((img) => img.id === v.version?.of)))
    // Once, when both have loaded: later removals take their versions with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayLoaded, versionsLoaded])
  // The browser won't store the images (blocked, or full): say so, once each time it starts.
  const saveFailed = traySaveFailed || versionsSaveFailed
  useEffect(() => {
    if (saveFailed)
      toast.error("This browser isn't saving your images and videos (its storage may be full).", {
        description: "They still work until the page closes. Freeing space, or removing a large video, lets it save again.",
      })
  }, [saveFailed])
  /** A platform's own versions of a tray video, parts in order; none when it takes the tray's. */
  const versionsOf = (platformId: string, id: string) =>
    versions
      .filter((v) => v.version?.of === id && v.version.platform === platformId)
      .sort((a, b) => a.version!.part - b.version!.part)
  /** The tray item a platform's version stands in for (itself, for a tray item). */
  const baseId = (id: string) => versions.find((v) => v.id === id)?.version?.of ?? id
  // An image or video opened from a card, the platform it was opened from, and the tab its dialog is on.
  const [fixing, setFixing] = useState<{ platformId: string; id: string; tab: MediaTab } | null>(null)
  // Clear Data in another tab (or the installed app's window): start fresh here too, rather than
  // keep this tab's copy, which it would write back the next time anything changed.
  useEffect(() => onClearedElsewhere(() => location.reload()), [])
  /**
   * Crop a staged image from the image as it was added (kept, so the crop can change or go), or
   * with null, show all of it again. A cropped image is a new picture, so its copied checks clear.
   */
  const cropStaged = async (id: string, crop: CropRect | null) => {
    const img = images.find((i) => i.id === id)
    if (!img || isVideo(img)) return
    const original = img.original ?? img.blob
    let blob: Blob
    try {
      blob = crop ? await cropImage(original, crop) : original
    } catch {
      toast.error("Couldn't crop that image.")
      return
    }
    setImages((list) =>
      list.map((i) =>
        i.id === id
          ? { ...i, blob, url: URL.createObjectURL(blob), original: crop ? original : undefined, crop: crop ?? undefined }
          : i,
      ),
    )
    setProgress((p) => ({
      ...p,
      copiedImages: Object.fromEntries(Object.entries(p.copiedImages).map(([k, ids]) => [k, ids.filter((x) => x !== id)])),
    }))
  }
  /**
   * Keep a video's crop, trim and size (made in its dialog), or with none, the video as added. Like a
   * crop, it's a new file, so its copied checks clear, and its length and size are read again.
   */
  const editVideo = (id: string, { blob, crop, trim, resize }: VideoChange) => {
    const img = images.find((i) => i.id === id)
    if (!img) return
    const original = img.original ?? img.blob
    const edited = !!crop || !!trim || !!resize
    setImages((list) =>
      list.map((i) =>
        i.id === id
          ? {
              ...i,
              blob: edited ? blob : original,
              url: URL.createObjectURL(edited ? blob : original),
              original: edited ? original : undefined,
              crop,
              trim,
              resize,
              // The old file's reading (its length above all) is no longer this file's: none until
              // the new one is read, so nothing is planned from a length the video no longer has.
              video: (edited ? blob : original) === i.blob ? i.video : undefined,
            }
          : i,
      ),
    )
    // Only while the file is still the one read: a later edit's reading wins.
    const file = edited ? blob : original
    probeVideo(file).then((video) =>
      setImages((list) => list.map((i) => (i.id === id && i.blob === file ? { ...i, video } : i))),
    )
    setProgress((p) => ({
      ...p,
      copiedImages: Object.fromEntries(Object.entries(p.copiedImages).map(([k, ids]) => [k, ids.filter((x) => x !== id)])),
    }))
  }
  const addImages = (files: File[]) => {
    const { added, skipped } = stageImages(files)
    if (skipped)
      toast.info(`Compose holds up to ${MAX_IMAGES} images and videos, so ${skipped === 1 ? "1 was" : `${skipped} were`} left out.`)
    else if (!added) toast.info("Only images and videos can be staged.")
  }
  const drag = usePageImageInput(addImages)

  // Which post each image goes with on threaded platforms: the first unless
  // moved. A move mirrors to every threaded platform; one made with Ctrl held
  // stays on that platform and wins over the shared one.
  // Kept across reloads, so a crash or a closed tab doesn't lose where the images went.
  const [placement, setPlacement] = useStoredState<Placement>("crosspost:image-placement", { shared: {}, only: {} })
  // A platform's version goes where its tray video goes, unless moved itself.
  const imagePost = (platformId: string, id: string): number =>
    placement.only[platformId]?.[id] ?? placement.shared[id] ?? (baseId(id) !== id ? imagePost(platformId, baseId(id)) : 0)
  // A platform's own version is that platform's alone: moving it never mirrors to the others.
  const moveImage = (platformId: string, id: string, post: number, onlyHere: boolean) =>
    setPlacement((p) => {
      if (onlyHere || baseId(id) !== id) return { ...p, only: { ...p.only, [platformId]: { ...p.only[platformId], [id]: post } } }
      // A shared move takes the image along on every platform, overrides included.
      const only: Placement["only"] = {}
      for (const [platform, posts] of Object.entries(p.only)) {
        only[platform] = { ...posts }
        delete only[platform][id]
      }
      return { shared: { ...p.shared, [id]: post }, only }
    })

  // Image order: the Compose tray's by default. Reordering on a card sets an
  // order for that platform alone, until it's set back to match Compose.
  const [cardOrder, setCardOrder] = useStoredState<Record<string, string[]>>("crosspost:image-order", {})
  const [progress, setProgress] = useStoredState<Progress>("crosspost:progress", NO_PROGRESS, (p) => ({
    ...NO_PROGRESS,
    ...p,
  }))
  // The latest progress, for copies noted after an await (the clipboard, the share sheet), so
  // two that overlap don't overwrite each other.
  const progressRef = useRef(progress)
  useEffect(() => {
    progressRef.current = progress
  })
  /**
   * What a platform's card needs done to count as posted: every post, every image or video not
   * left off it, the alt text on those, and its @tags confirmed.
   */
  const needsFor = (adapter: PlatformAdapter, posts: string[]): CardNeeds => {
    const media = mediaFor(adapter.id).filter((img) => !progress.hiddenImages[adapter.id]?.includes(img.id))
    return {
      posts,
      media: media.map((img) => img.id),
      alts: media.filter((img) => img.alt).map(altKey),
      tags: findMentions(posts.join("\n")),
    }
  }
  /** A platform's marks, as `cardProgress` reads them. */
  const marksOf = (p: Progress, id: string): CardMarks => ({
    copiedPosts: p.copiedPosts[id],
    copiedImages: p.copiedImages[id],
    copiedAlts: p.copiedAlts[id],
    checkedTags: p.checkedTags[id],
  })
  /**
   * Note a step done (or undone) on a platform's card: a post, image or alt text copied or ticked
   * by hand, or its tags confirmed. Once every step is done (`cardProgress`), the platform is
   * marked posted on its own (never unmarked), with a toast.
   */
  const noteCopy = (
    adapter: PlatformAdapter,
    list: "copiedPosts" | "copiedImages" | "copiedAlts" | "checkedTags",
    items: string[],
    on: boolean,
    needs: CardNeeds,
  ) => {
    const next = markIn(progressRef.current, list, adapter.id, items, on)
    progressRef.current = next
    const done = on && !next.posted[adapter.id] && cardProgress(needs, marksOf(next, adapter.id)).complete
    if (!done) return setProgress(next)
    setProgress({ ...next, posted: { ...next.posted, [adapter.id]: true } })
    trackDelivery("posted", adapter.id)
    revealNextCard(adapter.id)
    toast(`Everything for ${adapter.name} is done, so it's marked posted`, {
      action: {
        label: "Undo",
        onClick: () => setProgress((p) => ({ ...p, posted: { ...p.posted, [adapter.id]: false } })),
      },
    })
  }
  // Posts rewritten on one platform's card, by post number, each with the text Compose gave it then.
  const [postEdits, setPostEdits] = useStoredState<Record<string, Record<number, PostEdit>>>("crosspost:post-edits", {})
  /** Rewrite one post on one platform; null goes back to Compose's text, with an undo. */
  const setPostEdit = (adapter: PlatformAdapter, post: number, text: string | null, base: string) => {
    const put = (edit: PostEdit | null) =>
      setPostEdits((all) => {
        const posts = { ...all[adapter.id] }
        if (edit) posts[post] = edit
        else delete posts[post]
        const next = { ...all, [adapter.id]: posts }
        if (Object.keys(posts).length === 0) delete next[adapter.id]
        return next
      })
    const saved = postEdits[adapter.id]?.[post]
    // Typed back to what Compose gives: no edit left.
    if (text !== null && text !== base) return put({ text, base: saved?.base ?? base })
    put(null)
    if (text === null && saved) {
      toast(`${adapter.name} post ${post + 1} is back to Compose's text`, {
        action: { label: "Undo", onClick: () => put(saved) },
      })
    }
  }
  const reorderTray = (id: string, target: string, after: boolean) =>
    setImages((list) => {
      const ids = reorder(
        list.map((img) => img.id),
        id,
        target,
        after,
      )
      return ids.map((x) => list.find((img) => img.id === x)!)
    })
  // A platform's versions move with (and as) the tray video they stand for.
  const reorderOnCard = (platformId: string, id: string, target: string, after: boolean) =>
    setCardOrder((o) => ({
      ...o,
      [platformId]: reorder(
        imagesFor(platformId).map((img) => img.id),
        baseId(id),
        baseId(target),
        after,
      ),
    }))
  const matchCompose = (platformId: string) =>
    setCardOrder((o) => {
      const rest = { ...o }
      delete rest[platformId]
      return rest
    })
  /** A platform's images in its order: its own if set (images added since go last), else the tray's. */
  const imagesFor = (platformId: string) => {
    const order = cardOrder[platformId]
    if (!order) return images
    const rank = (id: string) => {
      const at = order.indexOf(id)
      return at < 0 ? order.length + images.findIndex((img) => img.id === id) : at
    }
    return [...images].sort((a, b) => rank(a.id) - rank(b.id))
  }
  /** An image's number: its place in the Compose tray. */
  // A platform's version takes its tray video's number, and a split's parts "1.1", "1.2" and so on.
  const imageNumber = (id: string): number | string => {
    const own = versions.find((v) => v.id === id)?.version
    const n = images.findIndex((img) => img.id === (own?.of ?? id)) + 1
    return own && own.parts > 1 ? `${n}.${own.part}` : n
  }
  /**
   * What a platform's card shows: the tray in its order, with a video's clips (alt text and all,
   * from the tray video) in its place once they're made.
   */
  const mediaFor = (platformId: string): StagedImage[] => {
    const adapter = adapters.find((a) => a.id === platformId)
    return imagesFor(platformId).flatMap((img) => {
      const own = adapter && clipsMade(adapter, img)
      return own ? own.map((v) => ({ ...v, alt: img.alt })) : [img]
    })
  }

  /** Open an image or video from a card in the media dialog, that platform's splits forward. */
  const openFromCard = (platformId: string, id: string, tab: MediaTab) => setFixing({ platformId, id: baseId(id), tab })

  // A card has moved images between posts or set its own order.
  // Only images still staged count; settings for removed ones are left over.
  const staged = new Set(images.map((img) => img.id))
  /** This platform's own order differs from the tray's for the images staged now. */
  const hasOwnOrder = (platformId: string) => {
    const order = cardOrder[platformId]
    return !!order && imagesFor(platformId).some((img, i) => img.id !== images[i].id)
  }
  const imagesCustomized =
    Object.entries(placement.shared).some(([id, post]) => staged.has(id) && post > 0) ||
    Object.values(placement.only).some((posts) => Object.keys(posts).some((id) => staged.has(baseId(id)))) ||
    Object.keys(cardOrder).some(hasOwnOrder)
  /** Put every card back on the tray's order, all images on the first post, with an undo. */
  const resetImages = () => {
    const saved = { placement, cardOrder }
    setPlacement({ shared: {}, only: {} })
    setCardOrder({})
    toast("Images reset to match Compose", {
      action: {
        label: "Undo",
        onClick: () => {
          setPlacement(saved.placement)
          setCardOrder(saved.cardOrder)
        },
      },
    })
  }

  /** Whether this platform's split posts get " i/n" labels. */
  // Platforms that number threads themselves (Bluesky) don't follow Compose's setting.
  const follows = (adapter: PlatformAdapter) => !adapter.numbersThreads
  const numbers = (adapter: PlatformAdapter) => prefs.numbering && follows(adapter)

  // Platforms in the user's order (kept with the platform settings, so the introduction can
  // rearrange them too); any not in the saved order (new ones) go last.
  const platformSettings = usePlatformSettings()
  const ordered = useMemo(() => arrangePlatforms(adapters, platformSettings.order), [platformSettings.order])
  // Platforms hidden in Settings don't appear anywhere in the composer.
  const hidden = useMemo(
    () => adapters.filter((a) => !isShown(platformSettings, a)).map((a) => a.id),
    [platformSettings],
  )
  const shown = useMemo(() => ordered.filter((a) => !hidden.includes(a.id)), [ordered, hidden])
  // While a side-column tile is dragged, the cards take the order the drop would make,
  // and the moving platform's card is kept in view.
  const [railDrag, setRailDrag] = useState<{ ids: string[]; moving: string } | null>(null)

  /**
   * A rail drop: the platforms posted to, in order, then the ones turned off. Saved to the
   * platform settings Settings shows too; turning one off offers an undo.
   */
  const arrangeRail = (on: string[], off: string[]) => {
    const before = platformSettings.order
    updatePlatformSettings((s) => {
      const shownNow = { ...s.shown }
      for (const a of adapters) {
        const want = on.includes(a.id)
        if (want !== isShown(s, a)) shownNow[a.id] = want
      }
      return { ...s, shown: shownNow, order: [...on, ...off] }
    })
    const turnedOff = off.filter((id) => !hidden.includes(id))
    if (turnedOff.length)
      toast(`${turnedOff.map((id) => adapters.find((a) => a.id === id)?.name).join(", ")} turned off`, {
        description: "Drag it back above the line, or use Settings.",
        action: {
          label: "Undo",
          // Only what this drop turned off comes back, each in its old place; anything changed
          // since (other platforms, servers, sorting) stays as it is.
          onClick: () =>
            updatePlatformSettings((s) => {
              const order = s.order.filter((id) => !turnedOff.includes(id))
              for (const id of turnedOff) {
                const at = before.indexOf(id)
                order.splice(at < 0 ? order.length : Math.min(at, order.length), 0, id)
              }
              return { ...s, shown: { ...s.shown, ...Object.fromEntries(turnedOff.map((id) => [id, true])) }, order }
            }),
        },
      })
  }

  const previews = useMemo(
    () =>
      shown.map((adapter) => ({
        adapter,
        chunks: chunksFor(adapter, draft, numbers(adapter), breaks[adapter.id]),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- numbers() reads only prefs
    [shown, draft, prefs.numbering, breaks],
  )

  // How many posts each platform's text comes to, for whether a video shares its post.
  const postCount = new Map(previews.map((p) => [p.adapter.id, p.chunks.length]))

  // Splitting videos into clips, as Compose splits text into posts. Each tray video keeps the
  // splits placed by hand, per platform (seconds into the file as added); each platform's length
  // limit adds its own around them. Clips are made in the background, one platform's set at a time.
  const [videoSplits, setVideoSplits] = useStoredState<Record<string, VideoSplits>>("crosspost:video-splits", {})
  // Splits kept for videos no longer in the tray (removed before splits went with them) go, once
  // the tray has loaded: later removals take their splits with them.
  useEffect(() => {
    if (!trayLoaded) return
    if (Object.keys(videoSplits).some((id) => !images.some((img) => img.id === id)))
      setVideoSplits((all) => Object.fromEntries(Object.entries(all).filter(([id]) => images.some((img) => img.id === id))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayLoaded])
  /** The part of a tray video kept (its trim, or all of it), in seconds into the file as added; null until its length is read. */
  const keptSpan = (img: StagedImage): Span | null =>
    img.trim ?? (img.video?.duration ? { start: 0, end: img.video.duration } : null)
  /** Whether a tray item shares its post on a platform with other photos or videos (not left off it). */
  const sharesPost = (adapter: PlatformAdapter, id: string) => {
    const posts = postCount.get(adapter.id) ?? 1
    const postOf = (x: string) => (adapter.chain && posts > 1 ? Math.min(imagePost(adapter.id, x), posts - 1) : 0)
    const left = progress.hiddenImages[adapter.id] ?? []
    return images.some((o) => o.id !== id && !left.includes(o.id) && postOf(o.id) === postOf(id))
  }
  /** Where a platform cuts a tray video: at its splits, and where its limit needs, around them. One clip: no cut. */
  const clipsOf = (adapter: PlatformAdapter, img: StagedImage): Span[] => {
    const span = isVideo(img) ? keptSpan(img) : null
    if (!span) return []
    const hand = videoSplits[img.id]?.[adapter.id] ?? []
    const handSplit = clipsFor(span, undefined, hand).length > 1
    return clipsFor(span, clipCap(adapter, spanLength(span), { withOthers: sharesPost(adapter, img.id), handSplit }), hand)
  }
  /** Whether a version was made with the tray video's crop and size as they are now. */
  const sameEdit = (v: StagedImage, img: StagedImage) =>
    JSON.stringify(v.crop ?? null) === JSON.stringify(img.crop ?? null) && v.resize === img.resize
  /** A platform's clips of a tray video, when they're made and are the clips it needs now. */
  const clipsMade = (adapter: PlatformAdapter, img: StagedImage) => {
    const clips = clipsOf(adapter, img)
    const own = versionsOf(adapter.id, img.id)
    return clips.length > 1 && sameClips(own.map((v) => v.trim), clips) && own.every((v) => sameEdit(v, img)) ? own : null
  }
  /** Compose's splits of a video as one platform sees them: the ones most of the others share. */
  const composeSplits = (id: string, platformId: string) =>
    sharedSplits(videoSplits[id] ?? {}, shown.map((a) => a.id), platformId)
  /** What the media dialog needs to split a tray video: each platform, its splits, and how to keep new ones. */
  const splittingFor = (id: string, focus?: string): VideoSplitting => ({
    platforms: shown.map((adapter) => ({ adapter, withOthers: sharesPost(adapter, id) })),
    splits: videoSplits[id] ?? {},
    onSplits: (next) =>
      setVideoSplits((all) => {
        const kept = Object.fromEntries(Object.entries(next).filter(([, hand]) => hand.length))
        const rest = { ...all }
        if (Object.keys(kept).length) rest[id] = kept
        else delete rest[id]
        return rest
      }),
    focus,
  })
  /** Set one video's hand-placed splits on one platform, with an undo. */
  const setPlatformSplits = (adapter: PlatformAdapter, id: string, hand: number[], what: string) => {
    const before = videoSplits[id]?.[adapter.id] ?? []
    const put = (next: number[]) =>
      setVideoSplits((all) => {
        const own = { ...all[id] }
        if (next.length) own[adapter.id] = next
        else delete own[adapter.id]
        const rest = { ...all, [id]: own }
        if (!Object.keys(own).length) delete rest[id]
        return rest
      })
    put(hand)
    toast(`Video ${images.findIndex((img) => img.id === id) + 1} on ${adapter.name} ${what}`, {
      action: { label: "Undo", onClick: () => put(before) },
    })
  }

  // Cards have no switch of their own: a platform is off when it's in the rail's Off part.
  const isEnabled = (id: string) => !hidden.includes(id)

  // The clips each platform needs and doesn't have: made from the file as added, with the tray's
  // crop and size, one platform's set at a time. A clip another platform has made already is used
  // again rather than made again. One that couldn't be made isn't tried again until it changes.
  const [failedClips, setFailedClips] = useState<string[]>([])
  const editKey = (img: StagedImage) => `${JSON.stringify(img.crop ?? null)}|${img.resize ?? ""}`
  /** One platform's set of clips of a video, as it would be made: who, from what, and where cut. */
  const clipKey = (adapter: PlatformAdapter, img: StagedImage, clips: Span[]) =>
    `${adapter.id}|${img.id}|${editKey(img)}|${clips.map((c) => `${c.start.toFixed(2)}-${c.end.toFixed(2)}`).join()}`
  const clipJobs = !(trayLoaded && versionsLoaded)
    ? []
    : shown.flatMap((adapter) =>
        images
          .filter((img) => isVideo(img) && !progress.hiddenImages[adapter.id]?.includes(img.id))
          .flatMap((img) => {
            const clips = clipsOf(adapter, img)
            if (clips.length < 2 || clipsMade(adapter, img)) return []
            const key = clipKey(adapter, img, clips)
            return failedClips.includes(key) ? [] : [{ adapter, img, clips, key }]
          }),
      )
  const jobsKey = clipJobs.map((j) => j.key).join("\n")
  const clipRun = useRef<{ key: string; abort: AbortController } | null>(null)
  const makeClips = async ({ adapter, img, clips, key }: (typeof clipJobs)[number], signal: AbortSignal) => {
    const n = images.findIndex((i) => i.id === img.id) + 1
    const source = img.original ?? img.blob
    const toastId = "making-clips"
    // Progress can still come in after the last clip is done: by then the toast has gone for good.
    let over = false
    const say = (done: number) =>
      !over &&
      toast.loading(`Making ${clips.length} clips of video ${n} for ${adapter.name}`, {
        id: toastId,
        description: `${Math.round(done * 100)}%, here in your browser`,
      })
    try {
      const blobs: Blob[] = []
      let info: Awaited<ReturnType<typeof probeVideo>> | undefined
      for (const [i, clip] of clips.entries()) {
        const made = versions.find((v) => v.version?.of === img.id && sameClips([v.trim], [clip]) && sameEdit(v, img))
        if (made) {
          blobs.push(made.blob)
          continue
        }
        say(i / clips.length)
        info ??= await probeVideo(source)
        if (!info) throw new Error("This browser can't read it.")
        blobs.push(
          await renderVideo(
            source,
            { crop: img.crop, trim: clip, resize: img.resize, size: { width: info.width, height: info.height }, duration: info.duration },
            (p) => say((i + p) / clips.length),
            signal,
          ),
        )
      }
      over = true
      toast.dismiss(toastId)
      if (signal.aborted) return
      putClips(adapter, img, clips, blobs)
    } catch (err) {
      over = true
      toast.dismiss(toastId)
      if (signal.aborted) return
      setFailedClips((f) => [...f, key])
      toast.error(`Couldn't make the clips of video ${n} for ${adapter.name} in this browser.`, {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }
  /** Keep a platform's clips of a tray video, made; they keep the ids of the clips they replace, clip for clip. */
  const putClips = (adapter: PlatformAdapter, img: StagedImage, clips: Span[], blobs: Blob[]) => {
    const before = versionsOf(adapter.id, img.id)
    const base = img.name.replace(/\.[^.]*$/, "")
    // Remade clips keep the ids of the clips they replace, clip for clip, so where they were
    // moved, whether they're hidden and their copied alt text all stay with them.
    const made: StagedImage[] = blobs.map((blob, i) => ({
      id: before[i]?.id ?? crypto.randomUUID(),
      name: `${base} clip ${i + 1}.mp4`,
      blob,
      url: URL.createObjectURL(blob),
      crop: img.crop,
      trim: clips[i],
      resize: img.resize,
      version: { of: img.id, platform: adapter.id, part: i + 1, parts: clips.length },
    }))
    setVersions((list) => [
      ...list.filter((v) => !(v.version?.of === img.id && v.version.platform === adapter.id)),
      ...made,
    ])
    // A remade clip is a new file: its copied check goes.
    setProgress((p) => markIn(p, "copiedImages", adapter.id, made.map((v) => v.id), false))
    for (const v of made) {
      probeVideo(v.blob).then((video) =>
        setVersions((list) => list.map((x) => (x.id === v.id && x.blob === v.blob ? { ...x, video } : x))),
      )
    }
  }
  useEffect(() => {
    const running = clipRun.current
    // The set being made is still wanted: let it finish.
    if (running && clipJobs.some((j) => j.key === running.key)) return
    running?.abort.abort()
    clipRun.current = null
    const job = clipJobs[0]
    if (!job) return
    const run = { key: job.key, abort: new AbortController() }
    clipRun.current = run
    // eslint-disable-next-line react-hooks/set-state-in-effect -- made in the background, kept when done
    void makeClips(job, run.abort.signal).finally(() => {
      if (clipRun.current === run) clipRun.current = null
    })
    // Started again only when the clips wanted change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsKey])
  // Clips a platform no longer needs (the video fits it whole now) go.
  const unneeded =
    trayLoaded && versionsLoaded
      ? versions
          .filter((v) => {
            const img = images.find((i) => i.id === v.version?.of)
            const adapter = shown.find((a) => a.id === v.version?.platform)
            return !!img && !!adapter && clipsOf(adapter, img).length === 1
          })
          .map((v) => v.id)
          .join()
      : ""
  useEffect(() => {
    if (unneeded) setVersions((list) => list.filter((v) => !unneeded.split(",").includes(v.id)))
  }, [unneeded, setVersions])


  const editDraft = (next: string) => {
    // Emptied by hand: the posted marks belonged to that post, so a new one starts without them.
    if (draft.trim() && !next.trim() && Object.keys(progress.posted).length) setProgress((p) => ({ ...p, posted: {} }))
    setBreaks((b) =>
      Object.fromEntries(Object.entries(b).map(([id, offsets]) => [id, shiftBreaks(draft, next, offsets)])),
    )
    setDraft(next)
  }

  // A post shared in from another app (Crosspost is a share target once installed): its text
  // fills the draft, or joins it on a new paragraph, and its images go to the tray.
  useSharedPost((post) => {
    const text = sharedText(post)
    const before = draft
    if (text) editDraft(draft.trim() ? `${draft.replace(/\s+$/, "")}\n\n${text}` : text)
    if (post.files.length) addImages(post.files)
    const what = [
      text && "text",
      post.files.length > 0 &&
        mediaNoun(
          post.files.filter((f) => !f.type.startsWith("video/")).length,
          post.files.filter((f) => f.type.startsWith("video/")).length,
        ),
    ].filter(Boolean)
    if (what.length === 0) return
    toast.success(`Added the shared ${what.join(" and ")}`, {
      action: {
        label: "Undo",
        onClick: () => {
          setDraft(before)
          setImages((list) => list.filter((img) => !(post.files as Blob[]).includes(img.blob)))
        },
      },
    })
  })

  // Placing a split (dragging a new one in, moving one, or dragging one out):
  // splits before the drop point stay put, manual ones stay, the rest reflow.
  // The splits as they were when placing started are kept so each move
  // recomputes from the same starting point.
  const placing = useRef<{ ids: string[]; pins: Record<string, Pick<Chunk, "start" | "manual">[]> } | null>(null)
  const placeStart = useCallback(
    (ids: string[], moving?: { offset: number }) => {
      placing.current = {
        ids,
        pins: Object.fromEntries(
          ids.map((id) => {
            const chunks = previews.find((p) => p.adapter.id === id)?.chunks ?? []
            const others = chunks.slice(1).filter((c) => !(moving && c.start === moving.offset))
            return [id, others.map(({ start, manual }) => ({ start, manual }))]
          }),
        ),
      }
    },
    [previews],
  )
  const place = useCallback(
    (offset: number | null) => {
      const p = placing.current
      if (!p) return
      setBreaks((b) => {
        const next = { ...b }
        for (const id of p.ids) {
          const kept = p.pins[id].filter((c) => c.manual || (offset !== null && c.start < offset)).map((c) => c.start)
          next[id] = [...new Set(offset === null ? kept : [...kept, offset])].sort((x, y) => x - y)
        }
        return next
      })
    },
    [setBreaks],
  )
  const placeEnd = useCallback(() => {
    placing.current = null
  }, [])
  const splitAtCursor = (ids: string[], offset: number) => {
    const trimmed = draft.trim()
    const start = draft.indexOf(trimmed)
    if (!trimmed || offset <= start || offset >= start + trimmed.length) {
      toast.info("Put the cursor where the next post should start, then click the split button.")
      return
    }
    placeStart(ids)
    place(offset)
    placeEnd()
  }
  const removeBreak = (m: SplitMarker) =>
    setBreaks((b) => ({ ...b, [m.adapter.id]: (b[m.adapter.id] ?? []).filter((o) => o !== m.offset) }))
  const resetBreaks = (id: string) =>
    setBreaks((b) => {
      const rest = { ...b }
      delete rest[id]
      return rest
    })
  /**
   * Compose's splits as seen from one platform: the hand-placed ones most of the other
   * threading platforms share (what a split dragged in with All leaves on each of them).
   */
  const composeBreaks = (id: string) => {
    const others = previews.filter(({ adapter }) => adapter.chain && adapter.id !== id && isEnabled(adapter.id))
    const counts = new Map<number, number>()
    for (const { adapter } of others) for (const o of breaks[adapter.id] ?? []) counts.set(o, (counts.get(o) ?? 0) + 1)
    return [...counts]
      .filter(([, n]) => n > others.length / 2)
      .map(([o]) => o)
      .sort((x, y) => x - y)
  }
  /** Taking Compose's splits, offered when a threading platform's own differ from them. */
  const matchComposeBreaks = (id: string) => {
    const shared = composeBreaks(id)
    if (!shared.length || shared.join() === (breaks[id] ?? []).join()) return undefined
    return () => setBreaks((b) => ({ ...b, [id]: shared }))
  }

  const markers: SplitMarker[] = previews
    .filter(({ adapter, chunks }) => adapter.chain && isEnabled(adapter.id) && chunks.length > 1)
    .flatMap(({ adapter, chunks }) =>
      chunks.slice(1).map((c, i) => ({ adapter, offset: c.start, index: i + 2, manual: c.manual })),
    )

  // The compose switch covers the threading platforms that follow it. Its label names
  // them and previews the most posts any of them needs.
  const switchPlatforms = previews.filter((p) => p.adapter.chain && follows(p.adapter) && isEnabled(p.adapter.id))
  const maxPosts = Math.max(1, ...switchPlatforms.map((p) => p.chunks.length))

  const cardList = railDrag
    ? [...previews].sort((a, b) => railDrag.ids.indexOf(a.adapter.id) - railDrag.ids.indexOf(b.adapter.id))
    : previews
  const cardKey = cardList.map((p) => p.adapter.id).join(",")

  /**
   * A platform just finished: bring the next one still to do (on, with something to post, not
   * marked posted) fully into view, unless it already is. One taller than the window lines up
   * its top under the sticky header instead (the cards' scroll margin).
   */
  const revealNextCard = (doneId: string) => {
    const after = cardList.findIndex((p) => p.adapter.id === doneId)
    const next = cardList
      .slice(after + 1)
      .find((p) => isEnabled(p.adapter.id) && p.chunks.length > 0 && !progressRef.current.posted[p.adapter.id])
    if (!next) return
    // After the render that marks this one posted, so the measure is of the page as it'll be.
    requestAnimationFrame(() => {
      const el = document.getElementById(cardId(next.adapter.id))
      if (!el) return
      const style = getComputedStyle(el)
      const top = parseFloat(style.scrollMarginTop) || 0
      const bottom = innerHeight - (parseFloat(style.scrollMarginBottom) || 0)
      const rect = el.getBoundingClientRect()
      if (rect.top >= top && rect.bottom <= bottom) return
      const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      el.scrollIntoView({ block: rect.height <= bottom - top ? "nearest" : "start", behavior })
    })
  }
  // When the cards change places, each glides from where it showed to its new place, with the
  // side column's tiles' timing (250ms ease). Each render notes where every card sits on the
  // page, leaving out any glide in progress, so the next reorder knows where they start.
  const cardTops = useRef(new Map<string, number>())
  const lastCards = useRef<{ key: string; moving?: string }>({ key: cardKey })
  useLayoutEffect(() => {
    const reordered = lastCards.current.key !== cardKey
    const tops = new Map<string, number>()
    const shifts = new Map<string, number>()
    for (const { adapter } of cardList) {
      const el = document.getElementById(cardId(adapter.id))
      if (!el) continue
      const glide = el.getAnimations().find((a) => a.id === CARD_GLIDE)
      // How far the card shows from its place, mid-glide.
      const shift = glide ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 : 0
      if (reordered) glide?.cancel()
      tops.set(adapter.id, el.getBoundingClientRect().top + scrollY - (reordered ? 0 : shift))
      shifts.set(adapter.id, shift)
    }
    // Keep the dragged platform's card in view, measured before any glide offsets it.
    const moving = railDrag?.moving
    if (moving && (reordered || moving !== lastCards.current.moving)) {
      document.getElementById(cardId(moving))?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
    if (reordered && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const [id, top] of tops) {
        const before = cardTops.current.get(id)
        if (before === undefined) continue
        const dy = before + (shifts.get(id) ?? 0) - top
        if (Math.abs(dy) < 1) continue
        document
          .getElementById(cardId(id))
          ?.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
            id: CARD_GLIDE,
            duration: 250,
            easing: "ease",
          })
      }
    }
    cardTops.current = tops
    lastCards.current = { key: cardKey, moving }
  })

  // What each platform posts, edits in, for the rail.
  const outgoing = previews.map(({ adapter, chunks }) => ({ adapter, chunks: withEdits(chunks, postEdits[adapter.id]) }))
  const railItems: RailItem[] = outgoing.map(({ adapter, chunks }) => {
    const total = adapter.count(draft.trim())
    const issue =
      !adapter.chain && total > adapter.limit
        ? `${(total - adapter.limit).toLocaleString()} over the limit`
        : (firstProblem(adapter, chunks.map((c) => c.text)) ??
          mediaProblem(
            adapter,
            mediaPerPost(
              mediaFor(adapter.id).filter((img) => !progress.hiddenImages[adapter.id]?.includes(img.id)),
              Math.max(1, chunks.length),
              // As on the card: images on a post that no longer exists fall back to the last one.
              (img) => (adapter.chain && chunks.length > 1 ? Math.min(imagePost(adapter.id, img.id), chunks.length - 1) : 0),
            ),
            (img) => imageNumber(img.id),
            true,
          ))
    const note = chunks.length > 1 ? `${chunks.length} posts` : chunks.length === 1 ? "1 post" : "Nothing to post"
    return {
      adapter,
      enabled: isEnabled(adapter.id),
      issue,
      note,
      posts: chunks.length,
      posted: !!progress.posted[adapter.id] && chunks.length > 0,
      // How it differs from Compose: its own splits (only platforms that split have any), each
      // post edited on its card, its own image order, and each image moved on it alone.
      overrides:
        Number(adapter.chain && [...(breaks[adapter.id] ?? [])].sort((x, y) => x - y).join() !== composeBreaks(adapter.id).join()) +
        Object.keys(postEdits[adapter.id] ?? {}).length +
        Number(hasOwnOrder(adapter.id)) +
        Object.keys(placement.only[adapter.id] ?? {}).filter((id) => staged.has(baseId(id))).length +
        // and each video it splits its own way (not as Compose does).
        images.filter(
          (img) => isVideo(img) && !sameSplits(videoSplits[img.id]?.[adapter.id] ?? [], composeSplits(img.id, adapter.id)),
        ).length,
    }
  })

  // The draft as data for a browser assistant (src/lib/payload.ts, documented on /assistants): in
  // the page as JSON, and from window.crosspost.getPayload(). Read-only.
  const payload = buildPayload({
    app: process.env.NEXT_PUBLIC_VERSION ?? "",
    // A path, not a full address: the page prerenders without one, and a relative link resolves anyway.
    guide: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assistants`,
    draft,
    images: images.map((img, i) => ({
      index: i + 1,
      id: img.id,
      name: img.name,
      mime: img.blob.type,
      bytes: img.blob.size,
      video: isVideo(img),
      altText: img.alt ?? null,
    })),
    platforms: outgoing.map(({ adapter, chunks }, i) => {
      const posts = chunks.map((c) => c.text)
      const media = mediaFor(adapter.id).filter((img) => !progress.hiddenImages[adapter.id]?.includes(img.id))
      return {
        adapter,
        enabled: isEnabled(adapter.id),
        posted: !!progress.posted[adapter.id] && posts.length > 0,
        posts,
        server: adapter.server
          ? serverHost(platformSettings.servers[adapter.id] ?? "") || adapter.server.default
          : undefined,
        media: media.map((img) => ({
          id: img.id,
          n: imageNumber(img.id),
          post: imagePost(adapter.id, img.id),
          altKey: img.alt ? altKey(img) : undefined,
        })),
        needs: needsFor(adapter, posts),
        marks: marksOf(progress, adapter.id),
        problem: railItems[i].issue ?? null,
      }
    }),
  })
  const payloadRef = useRef<Payload>(payload)
  const imagesRef = useRef(images)
  useEffect(() => {
    payloadRef.current = payload
    imagesRef.current = images
  })
  useEffect(() => {
    window.crosspost = {
      getPayload: () => payloadRef.current,
      getImage: async (index) => {
        const img = imagesRef.current[index - 1]
        return img ? { name: fileName(img), type: img.blob.type, dataUrl: await blobToDataUrl(img.blob) } : null
      },
      version: PAYLOAD_VERSION,
    }
    return () => {
      delete window.crosspost
    }
  }, [])

  // The platforms turned off, for the rail's Off part, in their order.
  const offRailItems: RailItem[] = ordered
    .filter((a) => hidden.includes(a.id))
    .map((adapter) => ({ adapter, enabled: false, issue: null, note: "off", posts: 0 }))

  /** Clear the draft and manual splits, with an undo in the toast. */
  /** Clear the images with how the cards placed and ordered them; returns how to put it all back. */
  const takeImages = () => {
    const saved = { images, versions, placement, cardOrder, videoSplits }
    setImages([])
    setVersions([])
    setVideoSplits({})
    setPlacement({ shared: {}, only: {} })
    setCardOrder({})
    return () => {
      // Images added since the clear stay, after the restored ones, as room allows.
      setImages((now) => [...saved.images, ...now.filter((img) => !saved.images.some((s) => s.id === img.id))].slice(0, MAX_IMAGES))
      setVersions((now) => [...saved.versions, ...now.filter((v) => !saved.versions.some((s) => s.id === v.id))])
      setVideoSplits((now) => ({ ...now, ...saved.videoSplits }))
      setPlacement(saved.placement)
      setCardOrder(saved.cardOrder)
    }
  }
  const startOver = () => {
    const saved = { draft, breaks, progress, postEdits }
    setDraft("")
    setBreaks({})
    setProgress(NO_PROGRESS)
    setPostEdits({})
    const restoreImages = takeImages()
    toast("Post cleared", {
      action: {
        label: "Undo",
        onClick: () => {
          setDraft(saved.draft)
          setBreaks(saved.breaks)
          setProgress(saved.progress)
          setPostEdits(saved.postEdits)
          restoreImages()
        },
      },
    })
  }
  /**
   * The example post: its text, a hand-placed split on every platform that threads (a marker to
   * drag), and the site's share image with its alt text. Over a post of your own (anything Clear
   * Post would clear), Try It asks first; loading it then clears that post, and Undo brings it
   * back, images and all.
   */
  const canTryExample = !draft.trim() && images.length === 0
  // The tips below Compose (How it works and the reminder) glide when one's change moves another.
  const tipsRef = useRef<HTMLDivElement>(null)
  useGlide(tipsRef)
  const [confirmExample, setConfirmExample] = useState(false)
  const tryExample = () => (nothingToClear ? loadExample() : setConfirmExample(true))
  const loadExample = async () => {
    setConfirmExample(false)
    const saved = { draft, breaks, progress, postEdits }
    const restoreImages = takeImages()
    setDraft(EXAMPLE_POST)
    setBreaks(Object.fromEntries(ordered.filter((a) => a.chain).map((a) => [a.id, [EXAMPLE_SPLIT]])))
    setProgress(NO_PROGRESS)
    setPostEdits({})
    let imageId: string | null = null
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${EXAMPLE_IMAGE.path}`)
      if (!response.ok) throw new Error(String(response.status))
      const blob = await response.blob()
      const id = crypto.randomUUID()
      imageId = id
      setImages((list) =>
        [...list, { id, name: EXAMPLE_IMAGE.name, blob, alt: EXAMPLE_IMAGE.alt, url: URL.createObjectURL(blob) }].slice(0, MAX_IMAGES),
      )
    } catch {
      // Offline, or the image moved: the text alone still shows the way.
    }
    toast("Example loaded", {
      description: "Drag the split marker in Compose to move where each thread's posts break.",
      action: {
        label: "Undo",
        onClick: () => {
          setDraft(saved.draft)
          setBreaks(saved.breaks)
          setProgress(saved.progress)
          setPostEdits(saved.postEdits)
          // The example's image goes first, so restoring keeps only images added since.
          if (imageId) setImages((list) => list.filter((img) => img.id !== imageId))
          restoreImages()
        },
      },
    })
  }
  const nothingToClear =
    !draft &&
    Object.keys(breaks).length === 0 &&
    images.length === 0 &&
    Object.keys(postEdits).length === 0 &&
    !Object.values(progress.posted).some(Boolean)
  // What the staged files are, for the buttons that clear and reset them: "Images", "Video", "Media".
  const stagedVideos = images.filter(isVideo).length
  const stagedWord =
    stagedVideos === 0
      ? images.length === 1 ? "Image" : "Images"
      : stagedVideos === images.length
        ? images.length === 1 ? "Video" : "Videos"
        : "Media"
  const clearImages = () => {
    const restoreImages = takeImages()
    toast(`${stagedWord} cleared`, {
      action: { label: "Undo", onClick: restoreImages },
    })
  }


  return (
    // On wide screens the bottom padding matches the Compose column's gap to the window's
    // edge (1rem): a pinned column can't reach past the end of its grid row, so with more
    // padding it would ride up at the bottom of the page, and twitch whenever the
    // platform cards change the page's height.
    <main className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] items-start gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:pb-4">
      {/* Pinned below the header and at least as tall as the rest of the window, so nothing in
          the platform column can move it, and the footer at its end sits at the bottom of the
          screen. In a short window the text box shrinks first, down to the height of its text;
          past that (or for a long post) the column rides the page scroll until its bottom is in
          view, then stays pinned there (the editor sets its top; see fitToWindow). */}
      <div
        data-compose-column
        className="space-y-4 lg:sticky lg:top-20 lg:flex lg:min-h-[calc(100dvh-6rem)] lg:flex-col"
      >
        <WelcomeCard place="top" onTryExample={tryExample} />
        {/* The platform cards' padding (16px), not the card's default 24px. */}
        <Card className="brand-edge gap-4 border-2 py-4">
          <CardContent className="space-y-4 px-4 lg:flex lg:flex-col">
            <ComposeEditor
              value={draft}
              onChange={editDraft}
              markers={markers}
              palette={previews
                .map((p) => p.adapter)
                .filter((a) => a.chain && isEnabled(a.id))}
              onPlaceStart={placeStart}
              onPlace={place}
              onPlaceEnd={placeEnd}
              onSplitAtCursor={splitAtCursor}
              onRemove={removeBreak}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Switch
                  id="numbering"
                  checked={prefs.numbering}
                  onCheckedChange={(numbering) => setPrefs((p) => ({ ...p, numbering }))}
                />
                <Label htmlFor="numbering" className="font-normal">
                  {/* One span, so the label's flex gap doesn't open up around the parentheses. */}
                  <span>
                    Number posts (<span className="tabular-nums">{maxPosts > 1 ? `1/${maxPosts}` : "X/Y"}</span>)
                  </span>
                  {switchPlatforms.length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="sr-only">on {listNames(switchPlatforms.map((p) => p.adapter.name))}</span>
                      {/* Each platform's mark in a circle of its brand color. */}
                      {switchPlatforms.map(({ adapter }) => (
                        <span
                          key={adapter.id}
                          style={{ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties}
                          className={`grid size-5 place-items-center rounded-full bg-(--brand) ${
                            // Black-branded marks invert in dark mode, so their glyph must too.
                            adapter.brand.color ? "text-white" : "text-background"
                          }`}
                        >
                          <PlatformLogo adapter={adapter} className="size-3 fill-current" />
                        </span>
                      ))}
                    </span>
                  )}
                </Label>
              </div>
              {canTryExample ? (
                // Nothing written yet: the count would only say 0, so the example takes its place.
                <button
                  type="button"
                  onClick={tryExample}
                  className="py-0.5 underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Try an example
                </button>
              ) : (
                <span className="tabular-nums">{graphemeLength(draft).toLocaleString()} characters</span>
              )}
            </div>
            <ImageArea
              images={images}
              drag={drag}
              onAdd={addImages}
              onRemove={(id) => {
                setImages((list) => list.filter((img) => img.id !== id))
                // Its clips and splits go with it.
                setVersions((list) => list.filter((v) => v.version?.of !== id))
                setVideoSplits((all) => {
                  const rest = { ...all }
                  delete rest[id]
                  return rest
                })
              }}
              onReorder={reorderTray}
              onAltChange={(id, alt) =>
                setImages((list) => list.map((img) => (img.id === id ? { ...img, alt: alt || undefined } : img)))
              }
              onCrop={cropStaged}
              onVideoChange={editVideo}
              platforms={shown}
              splitting={splittingFor}
              clearPost={
                <ConfirmButton icon={<BroomIcon />} label="Clear Post" onConfirm={startOver} disabled={nothingToClear} />
              }
              clearImages={
                <>
                  <ConfirmButton
                    icon={<ImageMinusIcon />}
                    label={`Clear ${stagedWord}`}
                    onConfirm={clearImages}
                  />
                  {imagesCustomized && (
                    <ConfirmButton
                      icon={<RotateCcwIcon />}
                      label={`Reset ${stagedWord}`}
                      onConfirm={resetImages}
                    />
                  )}
                </>
              }
            />
          </CardContent>
        </Card>
        {/* Below Compose, the tips: How it works (after a first visit) and the split view reminder,
            each open across the column or folded to a small button. Open ones come first; folded
            buttons gather at the bottom (their own order), How it works before the reminder. */}
        <div ref={tipsRef} className="flex flex-wrap items-start gap-x-2 gap-y-4 empty:hidden">
          <WelcomeCard place="bottom" onTryExample={tryExample} />
          <SplitViewTip />
        </div>
        <MadeBy className="hidden lg:mt-auto lg:flex" />
        {/* Try It over a post of your own: clear it for the example, or keep it. */}
        <Dialog open={confirmExample} onOpenChange={setConfirmExample}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Clear your current post?</DialogTitle>
              {/* The base text size (the dialog's default description is a size down). */}
              <DialogDescription className="text-base text-balance">
                This demo replaces what&apos;s in Compose with a sample message.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="text-base" onClick={() => setConfirmExample(false)}>
                Return to My Post
              </Button>
              {/* Destructive, as it clears the post (Undo can bring it back), with Clear Post's broom. */}
              <Button variant="destructive" className="text-base" onClick={loadExample}>
                <BroomIcon />
                Clear and Try Demo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="sticky top-14 z-30 -mx-4 bg-background/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-20 lg:order-last lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <StatusRail items={railItems} off={offRailItems} onArrange={arrangeRail} onPreview={setRailDrag} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {cardList.map(({ adapter, chunks: made }) => {
          // What Compose gives each post, and the posts as they'll go out, edits in.
          const generated = made.map((c) => c.text)
          const chunks = withEdits(made, postEdits[adapter.id])
          const chunkTexts = chunks.map((c) => c.text)
          const needs = needsFor(adapter, chunkTexts)
          return (
          <PlatformCard
            key={adapter.id}
            adapter={adapter}
            text={draft}
            chunks={chunkTexts}
            generated={generated}
            manualStarts={chunks.map((c) => c.manual)}
            edits={postEdits[adapter.id] ?? {}}
            onEditPost={(post, text) => setPostEdit(adapter, post, text, generated[post] ?? "")}
            customSplits={(breaks[adapter.id]?.length ?? 0) > 0}
            onResetSplits={() => resetBreaks(adapter.id)}
            onMatchComposeSplits={adapter.chain ? matchComposeBreaks(adapter.id) : undefined}
            images={mediaFor(adapter.id)}
            imageNumber={imageNumber}
            ownOrder={hasOwnOrder(adapter.id)}
            onReorderImage={(id, target, after) => reorderOnCard(adapter.id, id, target, after)}
            onMatchCompose={() => matchCompose(adapter.id)}
            onEditMedia={(id, tab) => openFromCard(adapter.id, id, tab)}
            clips={images.flatMap((img) => {
              const clips = clipsOf(adapter, img)
              const hand = videoSplits[img.id]?.[adapter.id] ?? []
              const shared = composeSplits(img.id, adapter.id)
              // Split here, or not split as Compose splits it (so Revert has a place).
              if (!clips.length || progress.hiddenImages[adapter.id]?.includes(img.id)) return []
              if (clips.length < 2 && sameSplits(hand, shared)) return []
              return [
                {
                  of: img.id,
                  n: images.indexOf(img) + 1,
                  count: clips.length,
                  made: !!clipsMade(adapter, img),
                  failed: failedClips.includes(clipKey(adapter, img, clips)),
                  onRevert:
                    shared.length && !sameSplits(hand, shared)
                      ? () => setPlatformSplits(adapter, img.id, shared, "is back to Compose's splits")
                      : undefined,
                  onAutoSplit: hand.length
                    ? () => setPlatformSplits(adapter, img.id, [], `is back to ${adapter.name}'s length limit alone`)
                    : undefined,
                },
              ]
            })}
            imagePost={(id) => imagePost(adapter.id, id)}
            onMoveImage={(id, post, onlyHere) => moveImage(adapter.id, id, post, onlyHere)}
            enabled={isEnabled(adapter.id)}
            posted={!!progress.posted[adapter.id]}
            onPostedChange={(on) => {
              setProgress((p) => ({ ...p, posted: { ...p.posted, [adapter.id]: on } }))
              if (on) revealNextCard(adapter.id)
            }}
            steps={cardProgress(needs, marksOf(progress, adapter.id))}
            onPostCopied={(text, on = true) => noteCopy(adapter, "copiedPosts", [text], on, needs)}
            copiedImages={new Set(progress.copiedImages[adapter.id])}
            onCopiedImagesChange={(ids, on) => noteCopy(adapter, "copiedImages", ids, on, needs)}
            checkedTags={progress.checkedTags[adapter.id] ?? []}
            copiedAlts={progress.copiedAlts[adapter.id] ?? []}
            onAltCopiedChange={(key, on) => noteCopy(adapter, "copiedAlts", [key], on, needs)}
            onTagsChecked={(postTags, on) => noteCopy(adapter, "checkedTags", postTags, on, needs)}
            hiddenImages={new Set(progress.hiddenImages[adapter.id])}
            onHideImage={(id) => setProgress((p) => markIn(p, "hiddenImages", adapter.id, [id], true))}
            onShowHidden={() => setProgress((p) => ({ ...p, hiddenImages: { ...p.hiddenImages, [adapter.id]: [] } }))}
          />
          )
        })}
      </div>
      {(() => {
        // An image or video opened from a card: the tray's own, edited for every platform, with
        // that platform's splits forward.
        const at = fixing ? images.findIndex((img) => img.id === fixing.id) : -1
        if (!fixing || at < 0) return null
        return (
          <MediaDialog
            image={images[at]}
            n={at + 1}
            tab={fixing.tab}
            onTabChange={(tab) => setFixing((f) => f && { ...f, tab })}
            onClose={() => setFixing(null)}
            platforms={shown}
            onAltChange={(alt) =>
              setImages((list) => list.map((img) => (img.id === fixing.id ? { ...img, alt: alt || undefined } : img)))
            }
            onCrop={(crop) => cropStaged(fixing.id, crop)}
            onVideoChange={(change) => editVideo(fixing.id, change)}
            splitting={(id) => splittingFor(id, fixing.platformId)}
          />
        )
      })()}
      {/* The same payload, readable from the page's source by tools that don't run scripts. */}
      <script
        type="application/json"
        id="crosspost-payload"
        dangerouslySetInnerHTML={{ __html: payloadJson(payload) }}
      />
    </main>
  )
}
