"use client"

import { BroomIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ComposeEditor, Flag, type SplitMarker } from "@/components/compose-editor"
import { firstProblem, PlatformCard } from "@/components/platform-card"
import { SplitViewTip } from "@/components/split-view-tip"
import { StatusRail, type RailItem } from "@/components/status-rail"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { adapters, type PlatformAdapter } from "@/lib/adapters"
import { graphemeLength, shiftBreaks, splitChunks, type Chunk } from "@/lib/text"
import { cn } from "@/lib/utils"
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
    const saved = { draft, breaks }
    setDraft("")
    setBreaks({})
    setConfirming(false)
    toast("Post cleared", {
      action: {
        label: "Undo",
        onClick: () => {
          setDraft(saved.draft)
          setBreaks(saved.breaks)
        },
      },
    })
  }
  const nothingToClear = !draft && Object.keys(breaks).length === 0

  // Clearing takes a second click; the question backs out on its own after a few seconds.
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 5000)
    return () => clearTimeout(timer)
  }, [confirming])

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
            <div className="flex flex-wrap items-center justify-start gap-3">
              <Button
                variant={confirming ? "destructive" : "outline"}
                // Outline has a 1px border and destructive none; keep one so the width holds.
                className={cn("border", confirming && "border-transparent")}
                onClick={confirming ? startOver : () => setConfirming(true)}
                onBlur={() => setConfirming(false)}
                onKeyDown={(e) => e.key === "Escape" && setConfirming(false)}
                disabled={nothingToClear}
              >
                <BroomIcon />
                {/* Both labels share one grid cell, so the button keeps the wider one's width. */}
                <span className="grid">
                  <span className={cn("col-start-1 row-start-1", confirming && "invisible")}>Clear post</span>
                  <span className={cn("col-start-1 row-start-1", !confirming && "invisible")}>Confirm</span>
                </span>
              </Button>
            </div>
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
            enabled={isEnabled(adapter.id)}
            onEnabledChange={(on) => setPrefs((p) => ({ ...p, enabled: { ...p.enabled, [adapter.id]: on } }))}
          />
        ))}
      </div>
    </main>
  )
}
