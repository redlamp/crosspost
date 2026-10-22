"use client"

import {
  closestCenter,
  DndContext,
  DragOverlay,
  getClientRect,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type ClientRect,
  type CollisionDetection,
  type DroppableContainer,
  type KeyboardSensorProps,
  type UniqueIdentifier,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CheckIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { PlatformLogo } from "@/components/platform-logo"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { PlatformAdapter } from "@/lib/adapters"
import { cn } from "@/lib/utils"

export type RailItem = {
  adapter: PlatformAdapter
  enabled: boolean
  /** What needs dealing with, or null if the platform is fine. */
  issue: string | null
  /** Short status for the tooltip when there's no issue, e.g. "3 posts". */
  note: string
  /** How many posts the draft becomes on this platform; 0 when there's nothing to post. */
  posts: number
  /** Marked posted on its card. */
  posted?: boolean
  /** It differs from Compose (its own splits, edited text or its own image layout): outlined in the warning color. */
  overridden?: boolean
}

export function cardId(platformId: string) {
  return `platform-card-${platformId}`
}

// dnd-kit shifts the rects it measured by however far the page has scrolled since, as if the
// tiles scrolled with it. The rail is sticky and stays put, so scrolling to a card mid-drag
// would send the tile to the wrong slot. These measure the tiles where they are now instead.

function measureInPlace(containers: DroppableContainer[]) {
  return new Map<UniqueIdentifier, ClientRect>(
    containers.flatMap(({ id, node }) =>
      node.current ? [[id, getClientRect(node.current, { ignoreTransform: true })] as const] : [],
    ),
  )
}

const closestInRail: CollisionDetection = (args) =>
  closestCenter({ ...args, droppableRects: measureInPlace(args.droppableContainers) })

/** The keyboard sensor with tiles measured in place, and no page scrolling of its own. */
class RailKeyboardSensor extends KeyboardSensor {
  constructor(props: KeyboardSensorProps) {
    const { context } = props
    super({
      ...props,
      context: {
        get current() {
          const now = context.current
          return {
            ...now,
            droppableRects: measureInPlace(now.droppableContainers.getEnabled()),
            scrollableAncestors: [],
          }
        },
      },
    })
  }
}

function jump(id: string) {
  const card = document.getElementById(cardId(id))
  card?.scrollIntoView({ behavior: "smooth", block: "start" })
  card?.focus({ preventScroll: true })
}

/** The tile's look, shared by the tile in the rail and the copy that follows the pointer while it's dragged. */
function tileLook({ adapter, enabled, issue, overridden }: RailItem, extra?: string) {
  return {
    style: { "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties,
    className: cn(
      // The app's own border and surface: brand tints made gray marks (Threads, X) look
      // switched off and pink ones (Instagram) look like errors. The logo carries the brand.
      "relative grid size-10 cursor-grab touch-none place-items-center rounded-lg border bg-card transition-colors hover:bg-accent active:cursor-grabbing",
      // Issues show as a ring plus a warning badge, never by recoloring the tile,
      // so a red or pink brand can't be mistaken for one.
      issue && enabled && "ring-2 ring-destructive ring-offset-2 ring-offset-background",
      !enabled && "opacity-40 grayscale",
      // Different from Compose on its card: outlined in the warning color (an issue's ring wins).
      overridden && enabled && !issue && "border-amber-500 dark:border-amber-400",
      extra,
    ),
  }
}

function TileFace({ item: { adapter, enabled, issue, posts, posted } }: { item: RailItem }) {
  return (
    <>
      <PlatformLogo adapter={adapter} />
      {issue && enabled && (
        <span className="absolute -top-2 -right-2 grid size-4 place-items-center rounded-full bg-destructive text-white ring-2 ring-background">
          <TriangleAlertIcon className="size-2.5" strokeWidth={3} />
        </span>
      )}
      {/* Posted: a check in the count's place, the app's blue as on the cards' checks. */}
      {posted && enabled && (
        <span
          aria-hidden
          className="absolute -right-1.5 -bottom-1.5 grid size-4 place-items-center rounded-full bg-(--brand-blue) text-white ring-2 ring-background"
        >
          <CheckIcon className="size-2.5" strokeWidth={3.5} />
        </span>
      )}
      {/* Only once the post splits: a single post needs no count. */}
      {posts > 1 && !(posted && enabled) && (
        <span
          aria-hidden
          className={cn(
            "absolute -right-1.5 -bottom-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums ring-2 ring-background",
            // The app's blue, as on the other badges: platform colors are for logos only.
            "bg-(--brand-blue) text-white",
          )}
        >
          {/* Trimmed to the figures (cap height to baseline, no descender room), as the header's
              name is, so the dot centers the number itself. */}
          <span className="[text-box:trim-both_cap_alphabetic]">{posts}</span>
        </span>
      )}
    </>
  )
}

/**
 * An item's slot in the rail: a tile's size, with the space before it (below in the column, to
 * the right in the phone row). While the Off part is closed, its items shrink to nothing, so the
 * whole rail stays one list for the drag (two would keep the line from making room).
 */
function slot(collapsed: boolean) {
  return cn(
    "relative shrink-0 transition-[height,width,margin,opacity] duration-300 ease-out",
    "lg:w-10 lg:not-first:mt-2 max-lg:h-10 max-lg:not-first:ml-2",
    collapsed ? "overflow-hidden opacity-0 lg:h-0 lg:not-first:mt-0 max-lg:w-0 max-lg:not-first:ml-0" : "lg:h-10 max-lg:w-10",
  )
}

function RailTile({ item, off, collapsed = false }: { item: RailItem; off: boolean; collapsed?: boolean }) {
  const { adapter, enabled, issue, note } = item
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: adapter.id })
  const status = off
    ? "turned off. Drag it above the line to post to it (or press Space, then the arrow keys)"
    : !enabled
      ? "off"
      : (issue ?? note)

  return (
    // Moved, never scaled: the strategy sizes items to their neighbors', which would stretch the
    // tiles next to the line.
    <div ref={setNodeRef} inert={collapsed} style={{ transform: CSS.Translate.toString(transform), transition }} className={slot(collapsed)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={off ? undefined : () => jump(adapter.id)}
            aria-label={off ? `${adapter.name}: ${status}.` : `${adapter.name}: ${status}. Drag to reorder, or below the line to turn it off.`}
            // While dragged, this stays behind as a faint placeholder where the tile will land.
            {...tileLook(item, isDragging ? "opacity-30" : undefined)}
          >
            <TileFace item={item} />
          </button>
        </TooltipTrigger>
        {/* Away from the cards, flipping to the left when the window has no room on the right. */}
        {!isDragging && (
          <TooltipContent side="right" collisionPadding={8}>
            {/* Short for a platform that's off; how to bring it back is in its label for screen readers. */}
            {adapter.name}: {off ? "currently off" : status}
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  )
}

/** How long More stays open after the last activity on the rail. */
const CLOSE_MS = 5000

/** The line between the platforms posted to and the ones turned off: a place in the list, never dragged. */
const LINE = "rail-line"

/** The line, with Off under it, as in the introduction. A row's short upright line on phones. */
function OffLine({ collapsed }: { collapsed: boolean }) {
  const { setNodeRef, transform, transition } = useSortable({ id: LINE, disabled: { draggable: true } })
  return (
    // A tile-sized slot, so the tiles that pass it shift by the right amount.
    <div
      ref={setNodeRef}
      aria-hidden
      inert={collapsed}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={slot(collapsed)}
    >
      <div className="flex size-full items-center justify-center gap-1.5 lg:flex-col lg:gap-1">
        <span className="h-8 w-px bg-border lg:h-px lg:w-full" />
        <span className="text-[10px] leading-none font-bold tracking-wide text-muted-foreground uppercase select-none">Off</span>
      </div>
    </div>
  )
}

/**
 * One tile per platform, in two parts as in the introduction: the platforms posted to, then a
 * line, then the ones turned off, grayed. The second part, with a legend of what the tiles do,
 * opens from More at the bottom (on hover, or a tap on touch screens) and while a tile is
 * dragged, so a platform that's off can be dragged back up; More moves below it as Less, and
 * it closes from Less, or 5 seconds after the last activity on the rail. Click a tile to jump
 * to its card; drag to reorder, or across the line to turn a platform off or on (at least one
 * stays on). The same settings as Settings' platform list, so
 * either shows what the other does.
 */
export function StatusRail({
  items,
  off,
  onArrange,
  onPreview,
}: {
  items: RailItem[]
  /** The platforms turned off, in their order. */
  off: RailItem[]
  /** A drop: the platforms posted to, in order, and the ones turned off. */
  onArrange: (on: string[], off: string[]) => void
  /** While a tile is dragged: the order it would make, and which platform is moving; null when it's over. */
  onPreview?: (preview: { ids: string[]; moving: string } | null) => void
}) {
  const onIds = items.map((i) => i.adapter.id)
  const offIds = off.map((i) => i.adapter.id)
  const ids = [...onIds, LINE, ...offIds]
  const all = [...items, ...off]
  const [dragging, setDragging] = useState<string | null>(null)
  // More: the Off part and the legend, open until Less, or a while after the pointer leaves.
  const [more, setMore] = useState(false)
  const open = more || dragging !== null
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const later = (fn: () => void, ms: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(fn, ms)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  /** Hovering More opens it after a moment, so a pointer passing by doesn't (its own timer: moving on the rail puts off closing, not opening). */
  const opening = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(opening.current), [])
  const hoverMore = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || more) return
    clearTimeout(opening.current)
    opening.current = setTimeout(() => setMore(true), 200)
  }
  // Whether a mouse pointer is over the rail. A touch has no hover, so only Less closes it there.
  const over = useRef(false)
  /**
   * Any activity on the rail (a hover, a move, focus, a drag) puts off closing: More closes 5
   * seconds after the last of it, once the pointer is away from the rail and no drag is going.
   */
  const active = () => clearTimeout(timer.current)
  const idle = () => {
    if (more && !over.current) later(() => setMore(false), CLOSE_MS)
  }
  const draggingItem = all.find((i) => i.adapter.id === dragging)
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a click still jumps to the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks a tile up; Enter stays a click.
    useSensor(RailKeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  )

  /** The list as the drop would leave it, split at the line. */
  const split = (active: string, over: string) => {
    const next = arrayMove(ids, ids.indexOf(active), ids.indexOf(over))
    const at = next.indexOf(LINE)
    return { on: next.slice(0, at), off: next.slice(at + 1) }
  }
  // The cards in the order the drop would make, the moving platform's included wherever it lands.
  const preview = (active: string, over: string) => {
    const { on, off: rest } = split(active, over)
    // At least one platform stays on: past that, the drop changes nothing.
    return on.length ? [...on, ...rest] : [...onIds, ...offIds]
  }

  const onDragStart = ({ active: moving }: DragStartEvent) => {
    active()
    setDragging(String(moving.id))
    onPreview?.({ ids: [...onIds, ...offIds], moving: String(moving.id) })
  }
  const onDragOver = ({ active: moving, over: target }: DragOverEvent) => {
    active()
    if (!target) return
    onPreview?.({ ids: preview(String(moving.id), String(target.id)), moving: String(moving.id) })
  }
  const onDragEnd = ({ active: moving, over: target }: DragEndEvent) => {
    setDragging(null)
    onPreview?.(null)
    // Let go away from the rail: the countdown starts from the drop.
    idle()
    if (!target || moving.id === target.id) return
    const next = split(String(moving.id), String(target.id))
    if (next.on.length === 0) return
    onArrange(next.on, next.off)
  }

  return (
    <div
      className="flex flex-col items-center max-lg:flex-row max-lg:items-start"
      // On the rail, any movement keeps it open; leaving starts the countdown (unless a drag is
      // going, which starts it when it ends).
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") over.current = true
        active()
      }}
      onPointerMove={active}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return
        over.current = false
        if (dragging) active()
        else idle()
      }}
      // Keyboard focus leaving the rail closes it the same way.
      onFocus={active}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) idle()
      }}
    >
      <DndContext
        id="status-rail"
        sensors={sensors}
        collisionDetection={closestInRail}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragMove={active}
        onDragCancel={() => {
          setDragging(null)
          onPreview?.(null)
          idle()
        }}
        // The page scrolls only to bring the moving platform's card into view, never on its own.
        autoScroll={false}
        // The Off part opens as the drag starts, so the drop places are measured as they move.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      >
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          {/* A row on phones, wrapping once the platforms outgrow the width; a column beside the cards. */}
          {/* One list: the tiles, the line and the platforms turned off. The line and those after
              it open while a tile is dragged, or from More, growing into place and shrinking back
              after. A row on phones, wrapping once the platforms outgrow the width. */}
          <nav aria-label="Platform status" className="flex flex-wrap items-start gap-y-2 lg:flex-col lg:gap-y-0">
            {items.map((item) => (
              <RailTile key={item.adapter.id} item={item} off={false} />
            ))}
            <OffLine collapsed={!open} />
            {off.map((item) => (
              <RailTile key={item.adapter.id} item={item} off collapsed={!open} />
            ))}
          </nav>
        </SortableContext>
        {/* The tile under the pointer. The rail is sticky, so it stays put when the page scrolls
            to the card, but dnd-kit would shift a tile dragged in place by that scroll. This copy
            is fixed to the window instead, in a portal so no ancestor's blur or transform moves it. */}
        {createPortal(
          <DragOverlay>
            {draggingItem && (
              <div {...tileLook(draggingItem, "cursor-grabbing shadow-lg ring-2 ring-(--brand-blue)")}>
                <TileFace item={draggingItem} />
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
      {/* What the tiles do, with the Off part. Only in the side column; the phone row has no room. */}
      <div
        inert={!more}
        className={cn(
          "hidden transition-[grid-template-rows,opacity] duration-300 ease-out lg:grid",
          more ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Set off by a line above and below, as the Off line is. */}
          <div className="flex cursor-default flex-col items-center gap-3 pt-3 text-center text-[11px] leading-tight whitespace-nowrap select-none">
            <span aria-hidden className="h-px w-10 bg-border" />
            <dl className="flex flex-col items-center gap-3">
              <RailHint gesture="Click" result="Go to" />
              <RailHint gesture="Drag" result="Order" />
            </dl>
            <span aria-hidden className="h-px w-10 bg-border" />
          </div>
        </div>
      </div>
      {/* More, under everything it opens: hover (or tap) for the platforms that are off and the
          legend; Less closes them. */}
      <button
        type="button"
        aria-expanded={open}
        onPointerEnter={hoverMore}
        onPointerLeave={() => clearTimeout(opening.current)}
        onClick={() => {
          clearTimeout(opening.current)
          clearTimeout(timer.current)
          setMore((v) => !v)
        }}
        // Lettered as the legend's gestures (CLICK, DRAG), faded back to 60% until hovered.
        className="mt-2 grid h-7 w-10 shrink-0 place-items-center rounded-lg text-[11px] leading-tight font-bold tracking-wide text-foreground/60 uppercase hover:text-foreground transition-colors select-none hover:bg-accent max-lg:mt-0 max-lg:ml-2 max-lg:h-10 lg:mt-3"
      >
        {more ? "Less" : "More"}
      </button>
    </div>
  )
}

function RailHint({ gesture, result }: { gesture: string; result: string }) {
  return (
    <div className="flex flex-col">
      <dt className="font-bold tracking-wide text-foreground uppercase">{gesture}</dt>
      <dd className="tracking-wide text-muted-foreground uppercase">{result}</dd>
    </div>
  )
}
