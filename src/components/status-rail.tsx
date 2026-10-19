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
              issue && "border-destructive bg-destructive/20 hover:bg-destructive/30",
              !enabled && "opacity-40 grayscale",
              isDragging && "shadow-lg ring-2 ring-(--brand)",
            )}
          >
            <PlatformLogo adapter={adapter} />
            {issue && enabled && (
              <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-destructive ring-2 ring-background" />
            )}
            {posts > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute -right-1.5 -bottom-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums ring-2 ring-background",
                  "bg-(--brand) text-white",
                  // Black-branded marks invert in dark mode, so their badge text must too.
                  !adapter.brand.color && "text-background",
                  issue && "bg-destructive text-white",
                )}
              >
                {posts}
              </span>
            )}
          </button>
        </TooltipTrigger>
        {!isDragging && (
          <TooltipContent side="left">
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
    <DndContext id="status-rail" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <nav aria-label="Platform status" className="flex gap-2 lg:flex-col">
          {items.map((item) => (
            <RailTile key={item.adapter.id} item={item} />
          ))}
        </nav>
      </SortableContext>
    </DndContext>
  )
}
