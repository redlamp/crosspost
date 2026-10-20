"use client"

import { BroomIcon, ImageMinusIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ComposeEditor, Flag, type SplitMarker } from "@/components/compose-editor"
import { ConfirmButton } from "@/components/confirm-button"
import { ImageArea } from "@/components/image-tray"
import { firstProblem, PlatformCard } from "@/components/platform-card"
import { SplitViewTip } from "@/components/split-view-tip"
import { StatusRail, type RailItem } from "@/components/status-rail"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { adapters, type PlatformAdapter } from "@/lib/adapters"
import { graphemeLength, shiftBreaks, splitChunks, type Chunk } from "@/lib/text"
import { MAX_IMAGES, usePageImageInput, useStagedImages } from "@/lib/images"
import { useStoredState } from "@/lib/use-stored-state"

type Prefs = {
  /** Add " i/n" to split posts on platforms that don't number threads themselves. */
  numbering: boolean
  /** Per-platform choice that wins over the default, e.g. numbering Bluesky anyway. */
  numberingFor?: Record<string, boolean>
  enabled: Record<string, boolean>
  /** Platform ids in the order the user arranged them. */
  order?: string[]
}

const DEFAULT_PREFS: Prefs = { numbering: true, enabled: {} }

/** Post index per image id: shared by the threaded platforms, and per-platform overrides. */
type Placement = { shared: Record<string, number>; only: Record<string, Record<string, number>> }

type Breaks = Record<string, number[]>

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

  /** Whether this platform's split posts get " i/n" labels. */
  const numbers = (adapter: PlatformAdapter) =>
    prefs.numberingFor?.[adapter.id] ?? (adapter.numbersThreads ? false : prefs.numbering)

  // Platforms in the user's order; any not in the saved order (new ones) go last.
  const ordered = useMemo(() => {
    const rank = (id: string) => {
      const i = prefs.order?.indexOf(id) ?? -1
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    return [...adapters].sort((a, b) => rank(a.id) - rank(b.id))
  }, [prefs.order])

  const previews = useMemo(
    () =>
      ordered.map((adapter) => ({
        adapter,
        chunks: chunksFor(adapter, draft, numbers(adapter), breaks[adapter.id]),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- numbers() reads only prefs
    [ordered, draft, prefs.numbering, prefs.numberingFor, breaks],
  )

  const isEnabled = (id: string) => prefs.enabled[id] ?? true

  const editDraft = (next: string) => {
    setBreaks((b) =>
      Object.fromEntries(Object.entries(b).map(([id, offsets]) => [id, shiftBreaks(draft, next, offsets)])),
    )
    setDraft(next)
  }

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

  const markers: SplitMarker[] = previews
    .filter(({ adapter, chunks }) => adapter.chain && isEnabled(adapter.id) && chunks.length > 1)
    .flatMap(({ adapter, chunks }) =>
      chunks.slice(1).map((c, i) => ({ adapter, offset: c.start, index: i + 2, manual: c.manual })),
    )

  // The compose switch covers platforms that don't number threads themselves.
  // Its label names them and previews the most posts any of them needs.
  const switchPlatforms = previews.filter((p) => p.adapter.chain && !p.adapter.numbersThreads && isEnabled(p.adapter.id))
  const maxPosts = Math.max(1, ...switchPlatforms.map((p) => p.chunks.length))

  const railItems: RailItem[] = previews.map(({ adapter, chunks }) => {
    const total = adapter.count(draft.trim())
    const issue =
      !adapter.chain && total > adapter.limit
        ? `${(total - adapter.limit).toLocaleString()} over the limit`
        : firstProblem(adapter, chunks.map((c) => c.text))
    const note = chunks.length > 1 ? `${chunks.length} posts` : chunks.length === 1 ? "Fits in one post" : "Nothing to post"
    return { adapter, enabled: isEnabled(adapter.id), issue, note, posts: chunks.length }
  })

  /** Clear the draft and manual splits, with an undo in the toast. */
  const startOver = () => {
    const saved = { draft, breaks, images }
    setDraft("")
    setBreaks({})
    setImages([])
    toast("Post cleared", {
      action: {
        label: "Undo",
        onClick: () => {
          setDraft(saved.draft)
          setBreaks(saved.breaks)
          setImages(saved.images)
        },
      },
    })
  }
  const nothingToClear = !draft && Object.keys(breaks).length === 0 && images.length === 0
  const clearImages = () => {
    const saved = images
    setImages([])
    toast(saved.length === 1 ? "Image cleared" : "Images cleared", {
      action: { label: "Undo", onClick: () => setImages(saved) },
    })
  }


  return (
    <main className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] items-start gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <div className="space-y-4 lg:sticky lg:top-20">
        <Card className="gap-4">
          <CardContent className="space-y-4">
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
                  Number split posts ({maxPosts > 1 ? `1/${maxPosts}` : "x/y"})
                  {switchPlatforms.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      <span className="sr-only">on {listNames(switchPlatforms.map((p) => p.adapter.name))}</span>
                      {switchPlatforms.map(({ adapter }) => (
                        <span key={adapter.id} title={adapter.name}>
                          <Flag adapter={adapter} className="rounded-bl-sm px-0.5" />
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
              clearPost={
                <ConfirmButton icon={<BroomIcon />} label="Clear Post" onConfirm={startOver} disabled={nothingToClear} />
              }
              clearImages={
                <ConfirmButton
                  icon={<ImageMinusIcon />}
                  label={images.length === 1 ? "Clear Image" : "Clear Images"}
                  onConfirm={clearImages}
                />
              }
            />
          </CardContent>
        </Card>
        <SplitViewTip />
      </div>

      <div className="sticky top-14 z-30 -mx-4 bg-background/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-20 lg:order-last lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <StatusRail items={railItems} onReorder={(order) => setPrefs((p) => ({ ...p, order }))} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {previews.map(({ adapter, chunks }) => (
          <PlatformCard
            key={adapter.id}
            adapter={adapter}
            text={draft}
            chunks={chunks.map((c) => c.text)}
            customSplits={(breaks[adapter.id]?.length ?? 0) > 0}
            numbering={numbers(adapter)}
            onNumberingChange={
              adapter.numbersThreads
                ? (on) => setPrefs((p) => ({ ...p, numberingFor: { ...p.numberingFor, [adapter.id]: on } }))
                : undefined
            }
            onResetSplits={() => resetBreaks(adapter.id)}
            images={images}
            imagePost={(id) => imagePost(adapter.id, id)}
            onMoveImage={(id, post, onlyHere) => moveImage(adapter.id, id, post, onlyHere)}
            enabled={isEnabled(adapter.id)}
            onEnabledChange={(on) => setPrefs((p) => ({ ...p, enabled: { ...p.enabled, [adapter.id]: on } }))}
          />
        ))}
      </div>
    </main>
  )
}
