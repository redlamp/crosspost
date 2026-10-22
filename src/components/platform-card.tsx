"use client"

import {
  AtSignIcon,
  CheckIcon,
  CircleCheckBigIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  MinusIcon,
  PencilIcon,
  RotateCcwIcon,
  ScissorsIcon,
  TriangleAlertIcon,
  Undo2Icon,
  UndoDotIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { CopyButton } from "@/components/copy-button"
import { ImageStrip } from "@/components/image-tray"
import { PlatformLogo } from "@/components/platform-logo"
import { Dot } from "@/components/dot"
import { ShareButton } from "@/components/share-button"
import { cardId } from "@/components/status-rail"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Breakpoint, PlatformAdapter } from "@/lib/adapters"
import { dropTarget, moveType, type StagedImage } from "@/lib/images"
import { serverHost, usePlatformSettings } from "@/lib/platform-settings"
import { canShare } from "@/lib/share"
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
              <CheckIcon className="size-4 shrink-0 text-(--brand-blue)" aria-label="Yes" />
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

/** A post rewritten on one platform's card, and the text Compose gave it then. */
export type PostEdit = { text: string; base: string }

type Props = {
  adapter: PlatformAdapter
  /** Compose's text. */
  text: string
  /** The posts as they'll go out, edits in. */
  chunks: string[]
  /** What Compose gives each post, before any edit. */
  generated: string[]
  /** Which posts start at a split placed by hand. */
  manualStarts: boolean[]
  /** Posts rewritten here, by post number. */
  edits: Record<number, PostEdit>
  /** Rewrite a post on this platform; null goes back to Compose's text. */
  onEditPost: (post: number, text: string | null) => void
  /** Off in the rail's Off part (cards have no switch of their own). */
  enabled: boolean
  /** The person marked this platform done, or every post and image on it was copied. */
  posted: boolean
  onPostedChange: (posted: boolean) => void
  /** Texts of the posts already copied from this card; a post whose text changed counts as not copied. */
  copiedPosts: readonly string[]
  onPostCopied: (text: string) => void
  /** Images copied (or shared) from this card, and images left off it. */
  copiedImages: ReadonlySet<string>
  onCopiedImagesChange: (ids: string[], copied: boolean) => void
  hiddenImages: ReadonlySet<string>
  onHideImage: (id: string) => void
  onShowHidden: () => void
  /** The @tags in this platform's posts, and those confirmed as right here. */
  tags: string[]
  checkedTags: readonly string[]
  /** Confirm the tags (or take it back). */
  onTagsChecked: (checked: boolean) => void
  /** The user has moved this platform's splits by hand. */
  customSplits?: boolean
  onResetSplits?: () => void
  /** Set when Compose's shared splits differ from this platform's: take them. */
  onMatchComposeSplits?: () => void
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
  generated,
  manualStarts,
  edits,
  onEditPost,
  enabled,
  posted,
  onPostedChange,
  copiedPosts,
  onPostCopied,
  copiedImages,
  onCopiedImagesChange,
  hiddenImages,
  onHideImage,
  onShowHidden,
  tags,
  checkedTags,
  onTagsChecked,
  customSplits,
  onResetSplits,
  onMatchComposeSplits,
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
  const problem = firstProblem(adapter, chunks)
  // The server to open, for platforms that need one (Mastodon): the one set in Settings, else the default.
  const platformSettings = usePlatformSettings()
  const server = adapter.server
    ? serverHost(platformSettings.servers[adapter.id] ?? "") || adapter.server.default
    : undefined
  // The post being edited in place, if one is open.
  const [editing, setEditing] = useState<number | null>(null)
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
  // Shared images are in the app, as good as copied.
  const markCopied = (ids: string[]) => onCopiedImagesChange(ids, true)
  // The steps to being done: every post and every image still on the card, each copied (or
  // shared); as many as are copied so far.
  // Tags, if any, are one more step: confirmed right for this platform.
  const tagsChecked = tags.length > 0 && tags.every((t) => checkedTags.includes(t))
  const steps = chunks.length + shown.length + (tags.length > 0 ? 1 : 0)
  const stepsDone =
    chunks.filter((c) => copiedPosts.includes(c)).length +
    shown.filter(({ img }) => copiedImages.has(img.id)).length +
    (tagsChecked ? 1 : 0)

  return (
    <Card
      id={cardId(adapter.id)}
      tabIndex={-1}
      style={{ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties}
      className={cn(
        // The app's own border and surface, as every card has; the logo carries the brand
        // (tints made gray marks look switched off and pink ones look like errors).
        "scroll-mt-32 gap-4 py-4 outline-none lg:scroll-mt-20",
        !enabled && "opacity-60",
        // Done: dimmed a little, still readable, so what is left stands out.
        enabled && posted && "opacity-75",
      )}
    >
      <CardHeader className="grid-rows-1 items-center px-4">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <PlatformLogo adapter={adapter} />
          <span>{adapter.name}</span>
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
          {enabled && chunks.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={posted}
                  aria-label={`Posted on ${adapter.name}`}
                  onClick={() => onPostedChange(!posted)}
                  className={cn(
                    "-my-1 rounded-full",
                    // Posted: a filled circle in the app's blue (platform colors are for logos only).
                    posted ? "bg-(--brand-blue) text-white hover:bg-(--brand-blue)/85 hover:text-white" : "text-muted-foreground",
                  )}
                >
                  {posted ? <CheckIcon strokeWidth={3} /> : <CircleCheckBigIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{posted ? "Post Complete!" : `Step ${stepsDone} of ${steps}`}</TooltipContent>
            </Tooltip>
          )}
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

      {enabled && tags.length > 0 && (
        <CardContent className="px-4">
          {tagsChecked ? (
            // Confirmed: a quiet line, with a way to take it back.
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckIcon className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
              <span className="mr-auto">Tags checked: {tags.join(", ")}</span>
              <button
                type="button"
                onClick={() => onTagsChecked(false)}
                className="text-xs underline underline-offset-4 hover:text-foreground"
              >
                Undo
              </button>
            </p>
          ) : (
            // A handle can mean a different account, or nobody, on each platform: a step to confirm.
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
              <AtSignIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="mr-auto">
                Check these tags are right on {adapter.name}: <span className="font-medium">{tags.join(", ")}</span>
              </span>
              <Button variant="outline" size="sm" onClick={() => onTagsChecked(true)}>
                <CheckIcon />
                Tags look right
              </Button>
            </div>
          )}
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
          {(customSplits || onMatchComposeSplits) && (
            // Splits moved by hand, called out: the post count, and the ways back. Auto Split (the
            // hand-placed splits go, and the platform's limit decides) shows whenever there are
            // hand-placed splits, so it holds the right end; Revert (to Compose's splits) shows only
            // when this card's differ from Compose's, so it comes and goes on its left.
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-(--brand-blue)/50 bg-(--brand-blue)/5 px-3 py-2 text-sm">
              <ScissorsIcon className="size-4 shrink-0 text-(--brand-blue)" />
              <span className="mr-auto">{chunks.length} posts</span>
              {onMatchComposeSplits && (
                <Button variant="outline" size="sm" onClick={onMatchComposeSplits}>
                  <UndoDotIcon />
                  Revert
                </Button>
              )}
              {customSplits && (
                <Button variant="outline" size="sm" onClick={onResetSplits}>
                  <RotateCcwIcon />
                  Auto Split
                </Button>
              )}
            </div>
          )}
          <ol className="space-y-2">
            {chunks.map((chunk, i) => {
              const n = adapter.count(chunk)
              const what = chunks.length > 1 ? `${adapter.name} post ${i + 1}` : `${adapter.name} post`
              const edit = edits[i]
              const open = editing === i || !!edit
              return (
                <li
                  key={i}
                  className={cn(
                    "rounded-md border bg-background/40 p-3 transition-colors",
                    // Edited on this platform: the whole post goes orange.
                    edit && "border-orange-500/70 bg-orange-500/10 dark:border-orange-400/60 dark:bg-orange-400/10",
                    dropOn?.post === i && !dropOn.target && "border-(--brand-blue)/60 bg-(--brand-blue)/10",
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
                  {open ? (
                    <>
                      <Textarea
                        value={chunk}
                        onChange={(e) => onEditPost(i, e.target.value)}
                        onBlur={() => editing === i && setEditing(null)}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                        aria-label={`Edit ${what}`}
                        autoFocus={editing === i}
                        className={cn(
                          "min-h-0 bg-background/60 px-2 py-1.5 text-sm md:text-sm",
                          // Edited: the orange post around it says so; the box drops its own outline.
                          edit &&
                            "border-transparent bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-orange-500/30",
                        )}
                      />
                      {edit && edit.base !== generated[i] && (
                        <p className="mt-1 text-xs text-muted-foreground">Compose has changed since this edit.</p>
                      )}
                    </>
                  ) : (
                    <p className="max-h-80 overflow-y-auto text-sm break-words whitespace-pre-wrap">{chunk}</p>
                  )}
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
                          onCopiedChange={(id, copied) => onCopiedImagesChange([id], copied)}
                          onHide={onHideImage}
                          hiddenCount={showHidden ? hiddenCount : 0}
                          onShowHidden={onShowHidden}
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
                      {chunks.length > 1 && (
                        <>
                          {manualStarts[i] && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <ScissorsIcon
                                  aria-label="Starts at a split moved by hand"
                                  className="mr-1 inline size-3.5 align-[-2px] text-(--brand-blue)"
                                />
                              </TooltipTrigger>
                              <TooltipContent side="bottom">Starts at a split moved by hand</TooltipContent>
                            </Tooltip>
                          )}
                          {/* Its own width: a tabular "1" is padded out to a "0"'s and would crowd the dot. */}
                          <span className="proportional-nums">{i + 1}</span>
                          <Dot />
                        </>
                      )}
                      {n.toLocaleString()} / {adapter.limit.toLocaleString()}
                    </span>
                    {/* The post and its images to the platform's app, where there's a share sheet (phones). */}
                    <ShareButton
                      adapter={adapter}
                      text={chunk}
                      images={shown.filter(({ img }) => postOf(img.id) === i).map(({ img }) => img)}
                      what={what}
                      onShared={(ids, textWent) => {
                        if (ids.length) markCopied(ids)
                        if (textWent) onPostCopied(chunk)
                      }}
                    />
                    {i === 0 && (
                      <Button variant="outline" size="sm" asChild>
                        {/* Opening it prefilled delivers the text, so it counts as copied. */}
                        <a
                          href={adapter.open.url(chunk, server)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => onPostCopied(chunk)}
                        >
                          <ExternalLinkIcon />
                          {adapter.open.label}
                        </a>
                      </Button>
                    )}
                    {edit ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => {
                              setEditing(null)
                              onEditPost(i, null)
                            }}
                            aria-label={`Reset ${what} to Compose`}
                            className="border-orange-500/60 text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                          >
                            <Undo2Icon />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Reset to Compose</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-pressed={editing === i}
                            // Keep the box's blur from closing it before this click toggles it.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setEditing(editing === i ? null : i)}
                            aria-label={`Edit ${what}`}
                          >
                            <PencilIcon />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{editing === i ? "Done" : "Edit"}</TooltipContent>
                      </Tooltip>
                    )}
                    <CopyButton
                      text={chunk}
                      what={what}
                      iconOnly
                      done={copiedPosts.includes(chunk)}
                      onCopied={() => onPostCopied(chunk)}
                    />
                  </div>
                </li>
              )
            })}
          </ol>
          {/* What Share hands the app, on touch screens, where the share sheet is the way in. */}
          {canShare() && adapter.share && (
            <p className="hidden text-xs text-muted-foreground pointer-coarse:block">{adapter.share.note}</p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
