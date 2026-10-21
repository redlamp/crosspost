"use client"

import { CheckIcon, CircleHelpIcon, ExternalLinkIcon, MinusIcon, Settings2Icon, TriangleAlertIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { CopyButton } from "@/components/copy-button"
import { ImageStrip } from "@/components/image-tray"
import { PlatformLogo } from "@/components/platform-logo"
import { cardId } from "@/components/status-rail"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Breakpoint, PlatformAdapter } from "@/lib/adapters"
import { dropTarget, moveType, type StagedImage } from "@/lib/images"
import { serverHost, setSettingsOpen, usePlatformSettings } from "@/lib/platform-settings"
import { cn } from "@/lib/utils"

const NEAR_LIMIT = 0.9

type DropOn = { post: number; onlyHere: boolean; target: { id: string; after: boolean } | null }

const sameDrop = (a: DropOn | null, b: DropOn) =>
  !!a &&
  a.post === b.post &&
  a.onlyHere === b.onlyHere &&
  a.target?.id === b.target?.id &&
  a.target?.after === b.target?.after

/** The first post the platform would reject for reasons other than length, described. */
export function firstProblem(adapter: PlatformAdapter, chunks: string[]): string | null {
  for (let i = 0; i < chunks.length; i++) {
    const problem = adapter.problems?.(chunks[i])
    if (problem) return chunks.length > 1 ? `Post ${i + 1}: ${problem}` : problem
  }
  return null
}

function counterTone(count: number, limit: number) {
  if (count > limit) return "text-destructive"
  if (count >= limit * NEAR_LIMIT) return "text-amber-600 dark:text-amber-400"
  return "text-muted-foreground"
}

function BreakpointList({ breakpoints, text, count }: { breakpoints: Breakpoint[]; text: string; count: number }) {
  return (
    <ul className="space-y-1.5 text-sm" aria-label="Length breakpoints">
      {breakpoints.map((bp) => {
        const blocked = bp.blockedBy?.(text) ?? null
        const ok = !blocked && count <= bp.limit
        const status = blocked ?? (ok ? bp.within : `${bp.beyond} (${(count - bp.limit).toLocaleString()} over)`)
        return (
          <li key={bp.label} className="flex items-center gap-2">
            {ok ? (
              <CheckIcon className="size-4 shrink-0 text-(--brand)" aria-label="Yes" />
            ) : (
              <MinusIcon className="size-4 shrink-0 text-muted-foreground" aria-label="No" />
            )}
            <span className={cn(!ok && "text-muted-foreground")}>{bp.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {bp.approximate ? "~" : "≤"}
              {bp.limit.toLocaleString()}
            </span>
            <span className="ml-auto text-right text-xs text-muted-foreground">{status}</span>
          </li>
        )
      })}
    </ul>
  )
}

type Props = {
  adapter: PlatformAdapter
  text: string
  chunks: string[]
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  /** The user has moved this platform's splits by hand. */
  customSplits?: boolean
  onResetSplits?: () => void
  /** Whether split posts get " i/n" labels here. */
  numbering?: boolean
  /** Set for platforms that number threads themselves, to let the user add labels anyway. */
  onNumberingChange?: (on: boolean) => void
  images?: StagedImage[]
  /** Which post an image goes with on this platform (0 for the first). */
  imagePost?: (id: string) => number
  /** Move an image to a post: on every threaded platform, or with `onlyHere`, on this one. */
  onMoveImage?: (id: string, post: number, onlyHere: boolean) => void
  /** An image's number in the Compose tray. */
  imageNumber?: (id: string) => number
  /** This platform has its own image order rather than the tray's. */
  ownOrder?: boolean
  /** Give this platform its own order, moving an image beside another. */
  onReorderImage?: (id: string, target: string, after: boolean) => void
  /** Go back to the tray's order. */
  onMatchCompose?: () => void
}

export function PlatformCard({
  adapter,
  text,
  chunks,
  enabled,
  onEnabledChange,
  customSplits,
  onResetSplits,
  numbering,
  onNumberingChange,
  images = [],
  imagePost = () => 0,
  onMoveImage,
  imageNumber,
  ownOrder,
  onReorderImage,
  onMatchCompose,
}: Props) {
  const total = adapter.count(text.trim())
  const over = total > adapter.limit
  // When the post becomes a chain anyway, the header total isn't a problem.
  const splits = adapter.chain && chunks.length > 1
  const switchId = `platform-${adapter.id}`
  const problem = firstProblem(adapter, chunks)
  // The server to open, for platforms that need one (Mastodon); empty until set in Settings.
  const platformSettings = usePlatformSettings()
  const server = adapter.server ? serverHost(platformSettings.servers[adapter.id] ?? "") : ""
  // Images copied from this card, so it's clear which are already in the post.
  const [copiedImages, setCopiedImages] = useState<ReadonlySet<string>>(new Set())
  // Images the user left off this platform.
  const [hiddenImages, setHiddenImages] = useState<ReadonlySet<string>>(new Set())
  // The rest, in this platform's order, numbered as in the Compose tray.
  const shown = images
    .map((img, i) => ({ img, n: imageNumber?.(img.id) ?? i + 1 }))
    .filter(({ img }) => !hiddenImages.has(img.id))
  const hiddenCount = images.length - shown.length
  const needsImage = adapter.needsImage && shown.length === 0 && chunks.length > 0
  // The post an image is being dragged from, while one is.
  const [movingFrom, setMovingFrom] = useState<number | null>(null)
  // Where a dragged image is: the post it's over, whether Ctrl (Cmd) keeps a
  // move on this card, and the image it would land beside, if any.
  const [dropOn, setDropOn] = useState<DropOn | null>(null)
  // Ctrl (Cmd) held at any point in the drag, so every post's hint follows it, hovered or not.
  const [keyHeld, setKeyHeld] = useState(false)
  // A drop that moves the image removes the element the drag started on, so
  // its dragend never reaches React. Catch the end of any drag on the window.
  useEffect(() => {
    if (movingFrom === null) return
    // Deferred: resetting first would remove the Move here row before a drop
    // on it reaches the post.
    const end = () =>
      setTimeout(() => {
        setMovingFrom(null)
        setDropOn(null)
        setKeyHeld(false)
      }, 0)
    // dragover repeats over the whole page during a drag, carrying the modifier keys.
    const over = (e: DragEvent) => setKeyHeld(e.ctrlKey || e.metaKey)
    window.addEventListener("dragend", end, true)
    window.addEventListener("drop", end, true)
    window.addEventListener("dragover", over, true)
    return () => {
      window.removeEventListener("dragend", end, true)
      window.removeEventListener("drop", end, true)
      window.removeEventListener("dragover", over, true)
    }
  }, [movingFrom])
  const fromThisCard = (e: React.DragEvent) => e.dataTransfer.types.includes(moveType(adapter.id))
  /** What a drop here would do: land beside an image (reorder, and move if from another post), or move to this post. */
  const dropAt = (e: React.DragEvent, post: number): DropOn | null => {
    if (!fromThisCard(e)) return null
    const target = dropTarget(e)
    // Without an image to land beside, only another post is a place to go.
    if (!target && (!splits || movingFrom === post)) return null
    return { post, onlyHere: e.ctrlKey || e.metaKey, target }
  }
  // Images on a post that no longer exists fall back to the last one.
  const postOf = (id: string) => (splits ? Math.min(imagePost(id), chunks.length - 1) : 0)

  return (
    <Card
      id={cardId(adapter.id)}
      tabIndex={-1}
      style={{ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties}
      className={cn(
        "scroll-mt-32 gap-4 py-4 outline-none lg:scroll-mt-20",
        // A hint of the brand: tinted surface and border, stronger in dark mode.
        "border-[color-mix(in_oklab,var(--brand)_30%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_4%,var(--card))]",
        "dark:border-[color-mix(in_oklab,var(--brand)_35%,var(--border))] dark:bg-[color-mix(in_oklab,var(--brand)_7%,var(--card))]",
        !enabled && "opacity-60",
      )}
    >
      <CardHeader className="grid-rows-1 items-center px-4">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <PlatformLogo adapter={adapter} />
          <label htmlFor={switchId}>{adapter.name}</label>
        </CardTitle>
        <CardAction className="row-span-1 flex items-center gap-3 self-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`How ${adapter.name} counts: ${adapter.countNote}`}
                className="-mr-1.5 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
              >
                <CircleHelpIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{adapter.countNote}</TooltipContent>
          </Tooltip>
          <span
            className={cn(
              "text-sm tabular-nums",
              splits ? "text-muted-foreground" : counterTone(total, adapter.limit),
            )}
          >
            {total.toLocaleString()} / {adapter.limit.toLocaleString()}
          </span>
          <Switch
            id={switchId}
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-label={`Post to ${adapter.name}`}
            className="data-[state=checked]:bg-(--brand)"
          />
        </CardAction>
      </CardHeader>

      {enabled && adapter.breakpoints && (
        <CardContent className="px-4">
          <BreakpointList breakpoints={adapter.breakpoints} text={text.trim()} count={total} />
        </CardContent>
      )}

      {enabled && problem && (
        <CardContent className="px-4">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            {problem}
          </p>
        </CardContent>
      )}

      {enabled && needsImage && (
        <CardContent className="px-4">
          <p className="text-sm text-muted-foreground">{adapter.name} posts need a photo or video. Add one above.</p>
        </CardContent>
      )}

      {enabled && over && !adapter.chain && (
        <CardContent className="px-4">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            {adapter.name} can&apos;t thread long posts. Shorten by{" "}
            {(total - adapter.limit).toLocaleString()} to post here.
          </p>
        </CardContent>
      )}

      {enabled && chunks.length > 0 && (
        <CardContent className="space-y-2 px-4">
          {splits && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs whitespace-nowrap text-muted-foreground">
              <span>
                {chunks.length} posts to copy
              </span>
              {customSplits && (
                <>
                  <span>· split by hand ·</span>
                  <button
                    type="button"
                    onClick={onResetSplits}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Reset splits
                  </button>
                </>
              )}
              {onNumberingChange && (
                <span className="ml-auto flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label htmlFor={`${adapter.id}-numbering`} className="cursor-help">
                        Add 1/{chunks.length} anyway
                      </label>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-60">
                      {adapter.name} shows each post&apos;s place in a thread itself. Other apps and embeds may not, so
                      you can add the label to the text too.
                    </TooltipContent>
                  </Tooltip>
                  <Switch
                    id={`${adapter.id}-numbering`}
                    size="sm"
                    checked={!!numbering}
                    onCheckedChange={onNumberingChange}
                    className="data-[state=checked]:bg-(--brand)"
                  />
                </span>
              )}
            </p>
          )}
          <ol className="space-y-2">
            {chunks.map((chunk, i) => {
              const n = adapter.count(chunk)
              const what = chunks.length > 1 ? `${adapter.name} post ${i + 1}` : `${adapter.name} post`
              return (
                <li
                  key={i}
                  className={cn(
                    "rounded-md border bg-background/40 p-3 transition-colors",
                    dropOn?.post === i && !dropOn.target && "border-(--brand)/60 bg-(--brand)/10",
                  )}
                  // The whole post takes an image dragged from another of this card's
                  // posts; dropped beside an image, it also takes that place in the order.
                  onDragOver={(e) => {
                    const at = dropAt(e, i)
                    if (!at) {
                      if (dropOn?.post === i) setDropOn(null)
                      return
                    }
                    e.preventDefault()
                    e.dataTransfer.dropEffect = "move"
                    if (!sameDrop(dropOn, at)) setDropOn(at)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dropOn?.post === i) setDropOn(null)
                  }}
                  onDrop={(e) => {
                    setDropOn(null)
                    const at = dropAt(e, i)
                    if (!at) return
                    e.preventDefault()
                    const id = e.dataTransfer.getData(moveType(adapter.id))
                    if (splits && movingFrom !== i) onMoveImage?.(id, i, at.onlyHere)
                    if (at.target) onReorderImage?.(id, at.target.id, at.target.after)
                    setMovingFrom(null)
                  }}
                >
                  <p className="max-h-80 overflow-y-auto text-sm break-words whitespace-pre-wrap">{chunk}</p>
                  {(() => {
                    const items = shown.filter(({ img }) => postOf(img.id) === i)
                    const showHidden = i === 0 && hiddenCount > 0
                    const showMatch = i === 0 && !!ownOrder
                    if (items.length === 0 && !showHidden && !showMatch && !(movingFrom !== null && splits)) return null
                    return (
                      <div className="mt-2">
                        <ImageStrip
                          items={items}
                          platform={adapter}
                          copied={copiedImages}
                          onCopiedChange={(id, copied) =>
                            setCopiedImages((s) => {
                              const next = new Set(s)
                              if (copied) next.add(id)
                              else next.delete(id)
                              return next
                            })
                          }
                          onHide={(id) => setHiddenImages((s) => new Set(s).add(id))}
                          hiddenCount={showHidden ? hiddenCount : 0}
                          onShowHidden={() => setHiddenImages(new Set())}
                          movable={splits}
                          moving={movingFrom !== null && movingFrom !== i}
                          onMovingChange={(moving) => setMovingFrom(moving ? i : null)}
                          hovered={dropOn?.post === i && !dropOn.target}
                          onlyHere={keyHeld}
                          insert={dropOn?.post === i ? dropOn.target : null}
                          onMatchCompose={showMatch ? onMatchCompose : undefined}
                        />
                      </div>
                    )
                  })()}
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    <span className={cn("mr-auto text-xs tabular-nums", counterTone(n, adapter.limit))}>
                      {chunks.length > 1 && `${i + 1} · `}
                      {n.toLocaleString()} / {adapter.limit.toLocaleString()}
                    </span>
                    {i === 0 &&
                      (adapter.server && !server ? (
                        // Mastodon has no one site to open: ask for the user's server first.
                        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                          <Settings2Icon />
                          Set your server
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" asChild>
                          <a href={adapter.open.url(chunk, server || undefined)} target="_blank" rel="noopener noreferrer">
                            <ExternalLinkIcon />
                            {adapter.open.label}
                          </a>
                        </Button>
                      ))}
                    <CopyButton text={chunk} what={what} />
                  </div>
                </li>
              )
            })}
          </ol>
        </CardContent>
      )}
    </Card>
  )
}
