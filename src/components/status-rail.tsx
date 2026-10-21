"use client"

import {
  closestCenter,
  DndContext,
  DragOverlay,
  getClientRect,
  KeyboardSensor,
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
import { TriangleAlertIcon } from "lucide-react"
import { useState } from "react"
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
function tileLook({ adapter, enabled, issue }: RailItem, extra?: string) {
  return {
    style: { "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties,
    className: cn(
      "relative grid size-10 cursor-grab touch-none place-items-center rounded-lg border transition-colors active:cursor-grabbing",
      "border-[color-mix(in_oklab,var(--brand)_45%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_14%,var(--card))]",
      "hover:bg-[color-mix(in_oklab,var(--brand)_24%,var(--card))]",
      // Issues show as a ring plus a warning badge, never by recoloring the tile,
      // so a red or pink brand can't be mistaken for one.
      issue && enabled && "ring-2 ring-destructive ring-offset-2 ring-offset-background",
      !enabled && "opacity-40 grayscale",
      extra,
    ),
  }
}

function TileFace({ item: { adapter, enabled, issue, posts } }: { item: RailItem }) {
  return (
    <>
      <PlatformLogo adapter={adapter} />
      {issue && enabled && (
        <span className="absolute -top-2 -right-2 grid size-4 place-items-center rounded-full bg-destructive text-white ring-2 ring-background">
          <TriangleAlertIcon className="size-2.5" strokeWidth={3} />
        </span>
      )}
      {/* Only once the post splits: a single post needs no count. */}
      {posts > 1 && (
        <span
          aria-hidden
          className={cn(
            "absolute -right-1.5 -bottom-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums ring-2 ring-background",
            "bg-(--brand) text-white",
            // Black-branded marks invert in dark mode, so their badge text must too.
            !adapter.brand.color && "text-background",
          )}
        >
          {posts}
        </span>
      )}
    </>
  )
}

function RailTile({ item }: { item: RailItem }) {
  const { adapter, enabled, issue, note } = item
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: adapter.id })
  const status = !enabled ? "off" : (issue ?? note)

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={() => jump(adapter.id)}
            aria-label={`${adapter.name}: ${status}. Drag to reorder.`}
            // While dragged, this stays behind as a faint placeholder where the tile will land.
            {...tileLook(item, isDragging ? "opacity-30" : undefined)}
          >
            <TileFace item={item} />
          </button>
        </TooltipTrigger>
        {/* Away from the cards, flipping to the left when the window has no room on the right. */}
        {!isDragging && (
          <TooltipContent side="right" collisionPadding={8}>
            {adapter.name}: {status}
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  )
}

/**
 * One tile per platform: brand color when fine, red when something needs
 * attention. Click to jump to its card; drag to reorder the platforms.
 */
export function StatusRail({
  items,
  onReorder,
  onPreview,
}: {
  items: RailItem[]
  onReorder: (ids: string[]) => void
  /** While a tile is dragged: the order it would make, and which platform is moving; null when it's over. */
  onPreview?: (preview: { ids: string[]; moving: string } | null) => void
}) {
  const ids = items.map((i) => i.adapter.id)
  const [dragging, setDragging] = useState<string | null>(null)
  const draggingItem = items.find((i) => i.adapter.id === dragging)
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a click still jumps to the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks a tile up; Enter stays a click.
    useSensor(RailKeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  )

  const orderFor = (active: string, over: string) => arrayMove(ids, ids.indexOf(active), ids.indexOf(over))

  const onDragStart = ({ active }: DragStartEvent) => {
    setDragging(String(active.id))
    onPreview?.({ ids, moving: String(active.id) })
  }
  // Show the cards in the order the drop would make, as the tile moves.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (over) onPreview?.({ ids: orderFor(String(active.id), String(over.id)), moving: String(active.id) })
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    onPreview?.(null)
    if (!over || active.id === over.id) return
    onReorder(orderFor(String(active.id), String(over.id)))
  }

  return (
    <div className="group/rail flex flex-col items-center">
      <DndContext
        id="status-rail"
        sensors={sensors}
        collisionDetection={closestInRail}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null)
          onPreview?.(null)
        }}
        // The page scrolls only to bring the moving platform's card into view, never on its own.
        autoScroll={false}
      >
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <nav aria-label="Platform status" className="flex gap-2 lg:flex-col">
            {items.map((item) => (
              <RailTile key={item.adapter.id} item={item} />
            ))}
          </nav>
        </SortableContext>
        {/* The tile under the pointer. The rail is sticky, so it stays put when the page scrolls
            to the card, but dnd-kit would shift a tile dragged in place by that scroll. This copy
            is fixed to the window instead, in a portal so no ancestor's blur or transform moves it. */}
        {createPortal(
          <DragOverlay>
            {draggingItem && (
              <div {...tileLook(draggingItem, "cursor-grabbing shadow-lg ring-2 ring-(--brand)")}>
                <TileFace item={draggingItem} />
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
      {/* What the tiles do. Only in the side column; on narrow screens the tiles sit in a row up top.
          Faded until the tiles are hovered or focused, so it's there when wanted without competing. */}
      <dl
        className={cn(
          // A label, not content: it can't be selected. It brightens while the pointer is
          // anywhere on the rail (tiles, legend, or the gap between, which belongs to the
          // rail's box), or while a tile has keyboard focus.
          "mt-5 hidden cursor-default flex-col items-center gap-3 text-center text-[11px] leading-tight whitespace-nowrap opacity-25 transition-opacity duration-200 select-none lg:flex",
          "group-hover/rail:opacity-100 group-has-[nav:focus-visible]/rail:opacity-100",
        )}
      >
        <RailHint gesture="Click" result="Go to" />
        <RailHint gesture="Drag" result="Order" />
      </dl>
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
