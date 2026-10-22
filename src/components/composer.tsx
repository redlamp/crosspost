"use client"

import { BroomIcon, ImageMinusIcon, RotateCcwIcon } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ComposeEditor, type SplitMarker } from "@/components/compose-editor"
import { ConfirmButton } from "@/components/confirm-button"
import { ImageArea } from "@/components/image-tray"
import { firstProblem, PlatformCard, type PostEdit } from "@/components/platform-card"
import { PlatformLogo } from "@/components/platform-logo"
import { MadeBy } from "@/components/made-by"
import { SplitViewTip } from "@/components/split-view-tip"
import { cardId, StatusRail, type RailItem } from "@/components/status-rail"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { adapters, type PlatformAdapter } from "@/lib/adapters"
import { graphemeLength, shiftBreaks, splitChunks, type Chunk } from "@/lib/text"
import { MAX_IMAGES, reorder, usePageImageInput, useStagedImages } from "@/lib/images"
import { sharedText, useSharedPost } from "@/lib/share-target"
import {
  arrangePlatforms,
  isShown,
  updatePlatformSettings,
  usePlatformSettings,
} from "@/lib/platform-settings"
import { useStoredState } from "@/lib/use-stored-state"

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
}

const NO_PROGRESS: Progress = { posted: {}, copiedPosts: {}, copiedImages: {}, hiddenImages: {} }

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
  const { images, setImages, add: stageImages } = useStagedImages()
  const addImages = (files: File[]) => {
    const { added, skipped } = stageImages(files)
    if (skipped) toast.info(`Posts take up to ${MAX_IMAGES} images, so ${skipped === 1 ? "1 was" : `${skipped} were`} left out.`)
    else if (!added) toast.info("Only images can be staged for now.")
  }
  const drag = usePageImageInput(addImages)

  // Which post each image goes with on threaded platforms: the first unless
  // moved. A move mirrors to every threaded platform; one made with Ctrl held
  // stays on that platform and wins over the shared one.
  const [placement, setPlacement] = useState<Placement>({ shared: {}, only: {} })
  const imagePost = (platformId: string, id: string) =>
    placement.only[platformId]?.[id] ?? placement.shared[id] ?? 0
  const moveImage = (platformId: string, id: string, post: number, onlyHere: boolean) =>
    setPlacement((p) => {
      if (onlyHere) return { ...p, only: { ...p.only, [platformId]: { ...p.only[platformId], [id]: post } } }
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
  const [cardOrder, setCardOrder] = useState<Record<string, string[]>>({})
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
   * Note copies from a platform's card. Once every post and every image still on the card has
   * been copied, the platform is marked posted on its own (never unmarked), with a toast.
   */
  const noteCopy = (
    adapter: PlatformAdapter,
    list: "copiedPosts" | "copiedImages",
    items: string[],
    on: boolean,
    posts: string[],
    imageIds: string[],
  ) => {
    const next = markIn(progressRef.current, list, adapter.id, items, on)
    progressRef.current = next
    const done =
      on &&
      !next.posted[adapter.id] &&
      posts.length > 0 &&
      posts.every((t) => next.copiedPosts[adapter.id]?.includes(t)) &&
      imageIds.every((id) => next.copiedImages[adapter.id]?.includes(id))
    if (!done) return setProgress(next)
    setProgress({ ...next, posted: { ...next.posted, [adapter.id]: true } })
    toast(`Everything for ${adapter.name} is copied, so it's marked posted`, {
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
  const reorderOnCard = (platformId: string, id: string, target: string, after: boolean) =>
    setCardOrder((o) => ({ ...o, [platformId]: reorder(imagesFor(platformId).map((img) => img.id), id, target, after) }))
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
  const imageNumber = (id: string) => images.findIndex((img) => img.id === id) + 1

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
    Object.values(placement.only).some((posts) => Object.keys(posts).some((id) => staged.has(id))) ||
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

  // Cards have no switch of their own: a platform is off when it's in the rail's Off part.
  const isEnabled = (id: string) => !hidden.includes(id)

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
      post.files.length > 0 && (post.files.length === 1 ? "an image" : `${post.files.length} images`),
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
        : firstProblem(adapter, chunks.map((c) => c.text))
    const note = chunks.length > 1 ? `${chunks.length} posts` : chunks.length === 1 ? "1 post" : "Nothing to post"
    return {
      adapter,
      enabled: isEnabled(adapter.id),
      issue,
      note,
      posts: chunks.length,
      posted: !!progress.posted[adapter.id] && chunks.length > 0,
      // Different from Compose: its own splits (only platforms that split have any), edited
      // text, or its own image layout.
      overridden:
        (adapter.chain && [...(breaks[adapter.id] ?? [])].sort((x, y) => x - y).join() !== composeBreaks(adapter.id).join()) ||
        Object.keys(postEdits[adapter.id] ?? {}).length > 0 ||
        Object.keys(placement.only[adapter.id] ?? {}).some((id) => staged.has(id)) ||
        hasOwnOrder(adapter.id),
    }
  })

  // The platforms turned off, for the rail's Off part, in their order.
  const offRailItems: RailItem[] = ordered
    .filter((a) => hidden.includes(a.id))
    .map((adapter) => ({ adapter, enabled: false, issue: null, note: "off", posts: 0 }))

  /** Clear the draft and manual splits, with an undo in the toast. */
  /** Clear the images with how the cards placed and ordered them; returns how to put it all back. */
  const takeImages = () => {
    const saved = { images, placement, cardOrder }
    setImages([])
    setPlacement({ shared: {}, only: {} })
    setCardOrder({})
    return () => {
      // Images added since the clear stay, after the restored ones, as room allows.
      setImages((now) => [...saved.images, ...now.filter((img) => !saved.images.some((s) => s.id === img.id))].slice(0, MAX_IMAGES))
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
  const nothingToClear =
    !draft &&
    Object.keys(breaks).length === 0 &&
    images.length === 0 &&
    Object.keys(postEdits).length === 0 &&
    !Object.values(progress.posted).some(Boolean)
  const clearImages = () => {
    const count = images.length
    const restoreImages = takeImages()
    toast(count === 1 ? "Image cleared" : "Images cleared", {
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
        <Card className="brand-edge gap-4 border-2">
          <CardContent className="space-y-4 lg:flex lg:flex-col">
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
                    Number posts (<span className="font-mono">{maxPosts > 1 ? `1/${maxPosts}` : "X/Y"}</span>)
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
              <span className="tabular-nums">{graphemeLength(draft).toLocaleString()} characters</span>
            </div>
            <ImageArea
              images={images}
              drag={drag}
              onAdd={addImages}
              onRemove={(id) => setImages((list) => list.filter((img) => img.id !== id))}
              onReorder={reorderTray}
              clearPost={
                <ConfirmButton icon={<BroomIcon />} label="Clear Post" onConfirm={startOver} disabled={nothingToClear} />
              }
              clearImages={
                <>
                  <ConfirmButton
                    icon={<ImageMinusIcon />}
                    label={images.length === 1 ? "Clear Image" : "Clear Images"}
                    onConfirm={clearImages}
                  />
                  {imagesCustomized && (
                    <ConfirmButton
                      icon={<RotateCcwIcon />}
                      label={images.length === 1 ? "Reset Image" : "Reset Images"}
                      onConfirm={resetImages}
                    />
                  )}
                </>
              }
            />
          </CardContent>
        </Card>
        <SplitViewTip />
        <MadeBy className="hidden lg:mt-auto lg:flex" />
      </div>

      <div className="sticky top-14 z-30 -mx-4 bg-background/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-20 lg:order-last lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <StatusRail items={railItems} off={offRailItems} onArrange={arrangeRail} onPreview={setRailDrag} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {cardList.map(({ adapter, chunks: made }) => {
          // What Compose gives each post, and the posts as they'll go out, edits in.
          const generated = made.map((c) => c.text)
          const chunks = withEdits(made, postEdits[adapter.id])
          // What has to be copied for the platform to count as done: every post, and every image not left off it.
          const chunkTexts = chunks.map((c) => c.text)
          const cardImageIds = imagesFor(adapter.id)
            .map((img) => img.id)
            .filter((id) => !progress.hiddenImages[adapter.id]?.includes(id))
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
            images={imagesFor(adapter.id)}
            imageNumber={imageNumber}
            ownOrder={hasOwnOrder(adapter.id)}
            onReorderImage={(id, target, after) => reorderOnCard(adapter.id, id, target, after)}
            onMatchCompose={() => matchCompose(adapter.id)}
            imagePost={(id) => imagePost(adapter.id, id)}
            onMoveImage={(id, post, onlyHere) => moveImage(adapter.id, id, post, onlyHere)}
            enabled={isEnabled(adapter.id)}
            posted={!!progress.posted[adapter.id]}
            onPostedChange={(on) => setProgress((p) => ({ ...p, posted: { ...p.posted, [adapter.id]: on } }))}
            copiedPosts={progress.copiedPosts[adapter.id] ?? []}
            onPostCopied={(text) => noteCopy(adapter, "copiedPosts", [text], true, chunkTexts, cardImageIds)}
            copiedImages={new Set(progress.copiedImages[adapter.id])}
            onCopiedImagesChange={(ids, on) => noteCopy(adapter, "copiedImages", ids, on, chunkTexts, cardImageIds)}
            hiddenImages={new Set(progress.hiddenImages[adapter.id])}
            onHideImage={(id) => setProgress((p) => markIn(p, "hiddenImages", adapter.id, [id], true))}
            onShowHidden={() => setProgress((p) => ({ ...p, hiddenImages: { ...p.hiddenImages, [adapter.id]: [] } }))}
          />
          )
        })}
      </div>
    </main>
  )
}
