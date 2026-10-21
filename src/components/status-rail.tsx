"use client"

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { TriangleAlertIcon } from "lucide-react"

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

function jump(id: string) {
  const card = document.getElementById(cardId(id))
  card?.scrollIntoView({ behavior: "smooth", block: "start" })
  card?.focus({ preventScroll: true })
}

function RailTile({ item }: { item: RailItem }) {
  const { adapter, enabled, issue, note, posts } = item
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: adapter.id })
  const status = !enabled ? "off" : (issue ?? note)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={() => jump(adapter.id)}
            aria-label={`${adapter.name}: ${status}. Drag to reorder.`}
            style={{ "--brand": adapter.brand.color ?? "var(--foreground)" } as React.CSSProperties}
            className={cn(
              "relative grid size-10 cursor-grab touch-none place-items-center rounded-lg border transition-colors active:cursor-grabbing",
              "border-[color-mix(in_oklab,var(--brand)_45%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_14%,var(--card))]",
              "hover:bg-[color-mix(in_oklab,var(--brand)_24%,var(--card))]",
              // Issues show as a ring plus a warning badge, never by recoloring the tile,
              // so a red or pink brand can't be mistaken for one.
              issue && enabled && "ring-2 ring-destructive ring-offset-2 ring-offset-background",
              !enabled && "opacity-40 grayscale",
              isDragging && "shadow-lg ring-2 ring-(--brand)",
            )}
          >
            <PlatformLogo adapter={adapter} />
            {issue && enabled && (
              <span className="absolute -top-2 -right-2 grid size-4 place-items-center rounded-full bg-destructive text-white ring-2 ring-background">
                <TriangleAlertIcon className="size-2.5" strokeWidth={3} />
              </span>
            )}
            {posts > 0 && (
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
export function StatusRail({ items, onReorder }: { items: RailItem[]; onReorder: (ids: string[]) => void }) {
  const ids = items.map((i) => i.adapter.id)
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a click still jumps to the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks a tile up; Enter stays a click.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  return (
    <div className="group/rail flex flex-col items-center">
      <DndContext id="status-rail" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <nav aria-label="Platform status" className="flex gap-2 lg:flex-col">
            {items.map((item) => (
              <RailTile key={item.adapter.id} item={item} />
            ))}
          </nav>
        </SortableContext>
      </DndContext>
      {/* What the tiles do. Only in the side column; on narrow screens the tiles sit in a row up top.
          Faded until the tiles are hovered or focused, so it's there when wanted without competing. */}
      <dl
        className={cn(
          "mt-5 hidden flex-col items-center gap-3 text-center text-[11px] leading-tight whitespace-nowrap opacity-50 transition-opacity duration-200 lg:flex",
          "group-has-[nav:hover]/rail:opacity-100 group-has-[nav:focus-visible]/rail:opacity-100",
        )}
      >
        <RailHint gesture="Click" result="Jump" />
        <RailHint gesture="Drag" result="Order" />
      </dl>
    </div>
  )
}

function RailHint({ gesture, result }: { gesture: string; result: string }) {
  return (
    <div className="flex flex-col">
      <dt className="font-medium tracking-wide text-foreground uppercase">{gesture}</dt>
      <dd className="tracking-wide text-muted-foreground uppercase">{result}</dd>
    </div>
  )
}
