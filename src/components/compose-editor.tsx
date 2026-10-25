"use client"

import { PenLineIcon, ScissorsIcon } from "lucide-react"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { PlatformLogo } from "@/components/platform-logo"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PlatformAdapter } from "@/lib/adapters"
import { graphemes, snapToWordStart } from "@/lib/text"
import { cn } from "@/lib/utils"

/** Where one platform's post `index` (2 or more) starts in the draft. */
export type SplitMarker = {
  adapter: PlatformAdapter
  offset: number
  index: number
  manual: boolean
}

type Props = {
  value: string
  onChange: (value: string) => void
  markers: SplitMarker[]
  /** Threading platforms that are on. Each gets a chip that can be dragged into the text. */
  palette: PlatformAdapter[]
  /** A split is being placed for these platforms; `moving` is set when existing splits at that offset are dragged. */
  onPlaceStart: (platformIds: string[], moving?: { offset: number }) => void
  /** Live position while placing; null when the pointer is outside the text (no split, or removal). */
  onPlace: (offset: number | null) => void
  onPlaceEnd: () => void
  onSplitAtCursor: (platformIds: string[], offset: number) => void
  onRemove: (marker: SplitMarker) => void
}

// Styles the mirror copies so its text wraps exactly like the textarea's.
const MIRRORED = [
  "boxSizing",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariantLigatures",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "wordSpacing",
  "tabSize",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
] as const

const FLAG_HEIGHT = 16
/** The text box's usual height (12rem) on wide screens, when the window has room for it. */
const TEXT_BOX_HEIGHT = 192
/** How close to the textarea's top or bottom edge a drag starts scrolling it. */
const SCROLL_ZONE = 28
/** Pointer movement before pressing a chip becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4

type Position = { x: number; y: number; h: number }

type Drag = {
  adapters: PlatformAdapter[]
  /** Set when existing splits are being moved (one platform's, or a shared group). */
  moving?: { offset: number }
  x: number
  y: number
  inside: boolean
  /** Where the split is while the pointer is over the text. */
  offset: number | null
}

const brandOf = (adapter: PlatformAdapter) => adapter.brand.color ?? "var(--foreground)"

/** The value that appears most often (the first of any tie). */
export function mostCommon(values: number[]): number {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
}

function mirrorStyle(ta: HTMLTextAreaElement): React.CSSProperties {
  const cs = getComputedStyle(ta)
  const style: Record<string, string> = {}
  for (const prop of MIRRORED) style[prop] = cs[prop]
  // clientWidth excludes a scrollbar, which narrows the textarea's text area.
  const borders = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)
  return {
    ...style,
    width: `${ta.clientWidth + borders}px`,
    height: `${ta.offsetHeight}px`,
    borderStyle: "solid",
    borderColor: "transparent",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    overflow: "hidden",
  }
}

/** Stop text getting selected while dragging; returns a function that undoes it. */
function lockSelection(): () => void {
  const previous = document.body.style.userSelect
  document.body.style.userSelect = "none"
  return () => {
    document.body.style.userSelect = previous
  }
}

function caretOffsetAt(x: number, y: number, node: Node): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const pos = doc.caretPositionFromPoint?.(x, y)
  if (pos) return pos.offsetNode === node ? pos.offset : null
  const range = doc.caretRangeFromPoint?.(x, y)
  return range && range.startContainer === node ? range.startOffset : null
}

/** A split flag: platform logo plus the number of the post it starts. */
export function Flag({ adapter, label, className }: { adapter: PlatformAdapter; label?: React.ReactNode; className?: string }) {
  return (
    <span
      style={{ "--brand": brandOf(adapter) } as React.CSSProperties}
      className={cn(
        "flex h-4 items-center gap-0.5 rounded-sm rounded-bl-none bg-(--brand) px-1 text-[10px] leading-none font-semibold text-white tabular-nums shadow-sm",
        // Black-branded marks invert in dark mode, so their flag text must too.
        !adapter.brand.color && "text-background",
        className,
      )}
    >
      <PlatformLogo adapter={adapter} bare className="size-2.5 fill-current" />
      {/* Trimmed to the figures (no descender room), so the flag centers them. */}
      {label != null && <span className="[text-box:trim-both_cap_alphabetic]">{label}</span>}
    </span>
  )
}

export function ComposeEditor({
  value,
  onChange,
  markers,
  palette,
  onPlaceStart,
  onPlace,
  onPlaceEnd,
  onSplitAtCursor,
  onRemove,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const hitRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties | null>(null)
  const [positions, setPositions] = useState<Map<number, Position>>(new Map())
  const [visibleHeight, setVisibleHeight] = useState(0)
  const [drag, setDrag] = useState<Drag | null>(null)

  const offsets = [...new Set(markers.map((m) => m.offset))].sort((a, b) => a - b)
  const offsetsKey = offsets.join(",")

  const measure = useCallback(() => {
    const ta = taRef.current
    const mirror = mirrorRef.current
    const wrap = wrapRef.current
    if (!ta || !mirror || !wrap) return
    mirror.scrollTop = ta.scrollTop
    const origin = wrap.getBoundingClientRect()
    const next = new Map<number, Position>()
    for (const span of mirror.querySelectorAll<HTMLElement>("[data-offset]")) {
      const r = span.getClientRects()[0]
      if (!r) continue
      next.set(Number(span.dataset.offset), { x: r.left - origin.left, y: r.top - origin.top, h: r.height })
    }
    setPositions(next)
    setVisibleHeight(ta.clientHeight)
  }, [])

  // Copy the textarea's styles, and again whenever its size changes.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    const update = () => setStyle(mirrorStyle(ta))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(ta)
    void document.fonts?.ready.then(update)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(measure, [measure, value, offsetsKey, style])

  // Wide screens (fitToWindow): the text box takes up to 12rem of the room the Compose
  // column has left in the window after everything else, shrinking with the window but never
  // below its text (it grows to fit its text and doesn't scroll inside). When the column still
  // doesn't fit, its pinned top moves up by the overflow, so the page scroll carries it until
  // its bottom is in view, with no scrollbar of its own.
  useLayoutEffect(() => {
    const ta = taRef.current
    const column = ta?.closest<HTMLElement>("[data-compose-column]")
    if (!ta || !column) return
    const wide = window.matchMedia("(min-width: 64rem)")
    const fit = () => {
      if (!wide.matches) {
        ta.style.minHeight = ""
        column.style.top = ""
        return
      }
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const children = [...column.children] as HTMLElement[]
      // Everything but the text box, with the 1rem gaps between the column's parts. Fractional
      // heights, as the box eases to a new height: rounded ones would retarget it a pixel each way.
      const height = (el: HTMLElement) => el.getBoundingClientRect().height
      const others = children.reduce((sum, el) => sum + height(el), 0) + rem * (children.length - 1) - height(ta)
      const available = parseFloat(getComputedStyle(column).minHeight) // the window less 6rem
      const target = Math.round(Math.max(0, Math.min(TEXT_BOX_HEIGHT, available - others)))
      // Only a real change: setting it again restarts the ease.
      if (Math.abs(target - (parseFloat(ta.style.minHeight) || 0)) >= 1) ta.style.minHeight = `${target}px`
      // Pinned 5rem down (below the header) when it fits; higher by the overflow when it
      // doesn't, so its bottom can still reach 1rem above the window's edge.
      column.style.top = `${Math.min(5 * rem, window.innerHeight - rem - column.offsetHeight)}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(column)
    for (const child of column.children) ro.observe(child)
    // The tips below Compose come and go (a card folding, the reminder appearing) in ways the
    // resize watch can miss, leaving the box at a stale height until something else moves it (a
    // theme switch, mid-transition). So any change in the column fits it again, once a frame.
    let frame = 0
    const later = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), fit()))
    }
    const mo = new MutationObserver(later)
    mo.observe(column, { childList: true, subtree: true })
    wide.addEventListener("change", fit)
    window.addEventListener("resize", fit)
    return () => {
      ro.disconnect()
      mo.disconnect()
      cancelAnimationFrame(frame)
      wide.removeEventListener("change", fit)
      window.removeEventListener("resize", fit)
    }
  }, [])

  const dragAdapters = drag?.adapters

  // The latest props, for drag handlers that live across renders.
  const latest = useRef({ value, onPlace, onPlaceEnd, measure })
  useLayoutEffect(() => {
    latest.current = { value, onPlace, onPlaceEnd, measure }
  })

  /**
   * Start dragging a split. Listeners attach right away (not in an effect),
   * so a quick drag can't release before anyone is listening.
   */
  const beginDrag = (adapters: PlatformAdapter[], x: number, y: number, moving?: { offset: number }) => {
    let pointer = { x, y }
    let lastOffset: number | null | undefined
    const hit = hitRef.current
    // The hit-testing copy normally sits out of the way; during a drag it takes the pointer.
    if (hit) {
      hit.style.visibility = "visible"
      hit.style.pointerEvents = "auto"
    }

    /** Where the split would go for the pointer's position, or null outside the text. */
    const offsetAt = (px: number, py: number): number | null => {
      const ta = taRef.current
      const node = hit?.firstChild
      if (!ta || !hit || !node) return null
      const r = ta.getBoundingClientRect()
      // The pointer holds the flag, which sits above the text line it marks.
      const inside = px >= r.left && px <= r.right && py >= r.top - FLAG_HEIGHT && py <= r.bottom
      if (!inside) return null
      hit.scrollTop = ta.scrollTop
      // Well below the last line of text (over a line and a half of empty box) counts as
      // dragging it out, so the split can be removed without leaving the box.
      const end = document.createRange()
      end.setStart(node, node.textContent?.length ?? 0)
      const lastLine = end.getClientRects()[0] ?? end.getBoundingClientRect()
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 28
      if (py + FLAG_HEIGHT > lastLine.bottom + 1.5 * lineHeight) return null
      const ty = Math.min(Math.max(py + FLAG_HEIGHT, r.top + 4), r.bottom - 4)
      const raw = caretOffsetAt(px, ty, node)
      const { value } = latest.current
      return raw === null ? null : snapToWordStart(value, Math.min(raw, value.length))
    }

    const update = () => {
      const offset = offsetAt(pointer.x, pointer.y)
      setDrag((d) => (d ? { ...d, x: pointer.x, y: pointer.y, inside: offset !== null, offset } : d))
      if (offset !== lastOffset) {
        lastOffset = offset
        latest.current.onPlace(offset)
      }
    }

    const move = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY }
      update()
    }

    // Scroll the compose box while the pointer is near its top or bottom edge.
    const scroller = window.setInterval(() => {
      const ta = taRef.current
      if (!ta) return
      const r = ta.getBoundingClientRect()
      if (pointer.x < r.left || pointer.x > r.right) return
      const dy = pointer.y < r.top + SCROLL_ZONE ? -12 : pointer.y > r.bottom - SCROLL_ZONE ? 12 : 0
      if (dy === 0) return
      const before = ta.scrollTop
      ta.scrollTop += dy
      if (ta.scrollTop !== before) {
        latest.current.measure()
        update()
      }
    }, 30)

    let unlockSelection = () => {}
    const end = (e: PointerEvent) => {
      // The release point counts, even if no move event landed there.
      if (e.type === "pointerup") move(e)
      window.clearInterval(scroller)
      unlockSelection()
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      if (hit) {
        hit.style.visibility = ""
        hit.style.pointerEvents = ""
      }
      setDrag(null)
      latest.current.onPlaceEnd()
    }

    onPlaceStart(
      adapters.map((a) => a.id),
      moving,
    )
    setDrag({ adapters, moving, x, y, inside: !!moving, offset: moving?.offset ?? null })
    unlockSelection = lockSelection()
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    update()
  }

  /** Chips: a short press is a click (split at the cursor); moving a few pixels starts a drag. */
  const chipPointerDown = (adapters: PlatformAdapter[]) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const start = { x: e.clientX, y: e.clientY }
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return
      cleanup()
      beginDrag(adapters, ev.clientX, ev.clientY)
    }
    const cleanup = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", cleanup)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", cleanup, { once: true })
  }

  const splitAtCursor = (adapters: PlatformAdapter[]) => {
    const ta = taRef.current
    if (!ta) return
    onSplitAtCursor(
      adapters.map((a) => a.id),
      snapToWordStart(value, ta.selectionStart),
    )
  }

  // Mirror content: the text, with the first grapheme of each split wrapped so it can be measured.
  const pieces: React.ReactNode[] = []
  let cursor = 0
  for (const offset of offsets) {
    if (offset < cursor || offset >= value.length) continue
    const first = graphemes(value.slice(offset, offset + 8))[0] ?? ""
    pieces.push(value.slice(cursor, offset))
    pieces.push(
      <span key={offset} data-offset={offset}>
        {first}
      </span>,
    )
    cursor = offset + first.length
  }
  pieces.push(value.slice(cursor), "​")

  // How many posts each platform's text comes to (its last split's post number), for its chip's
  // badge: the chip is the action, the badge what it has made so far. Live, as splits move.
  const postsFor = (a: PlatformAdapter) => Math.max(1, ...markers.filter((m) => m.adapter.id === a.id).map((m) => m.index))
  const chips: { key: string; adapters: PlatformAdapter[]; name: string }[] = [
    ...(palette.length > 1 ? [{ key: "all", adapters: palette, name: "all threading platforms" }] : []),
    ...palette.map((a) => ({ key: a.id, adapters: [a], name: a.name })),
  ]

  return (
    <div className="space-y-3 lg:flex lg:flex-col">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        {/* A size up from the cards' titles, as "Start here" is: where to begin. */}
        <Label htmlFor="compose" className="text-lg font-semibold">
          {/* The pencil the platform row's Compose button uses too. */}
          <PenLineIcon className="size-5 text-muted-foreground" aria-hidden />
          Compose
        </Label>
        {chips.length > 0 && (
          <div role="group" aria-label="Add a split" className="flex items-center gap-1.5">
            <span className="mr-0.5 text-sm text-muted-foreground">Drag to split</span>
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onPointerDown={chipPointerDown(chip.adapters)}
                onClick={() => splitAtCursor(chip.adapters)}
                aria-label={`Split ${chip.name} at the cursor, or drag into the text${
                  chip.key !== "all" && postsFor(chip.adapters[0]) > 1 ? ` (${postsFor(chip.adapters[0])} posts now)` : ""
                }`}
                style={{ "--brand": brandOf(chip.adapters[0]) } as React.CSSProperties}
                // One neutral look for every chip, as for the rail's tiles; the logo carries the brand.
                className={cn(
                  "relative flex h-7 min-w-7 cursor-grab touch-none items-center justify-center gap-1 rounded-md border border-border bg-secondary px-1.5 transition-colors hover:bg-accent active:cursor-grabbing",
                  chip.key === "all" && "text-xs font-medium",
                )}
              >
                {chip.key === "all" ? (
                  <>
                    <ScissorsIcon className="size-3.5" />
                    All
                  </>
                ) : (
                  <>
                    <PlatformLogo adapter={chip.adapters[0]} className="size-4" />
                    {/* Its posts once it splits, as on the rail's tiles: no badge for one, none on All
                        (its platforms' counts differ). */}
                    {postsFor(chip.adapters[0]) > 1 && (
                      <span
                        aria-hidden
                        className="absolute -right-1.5 -bottom-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-(--brand-blue) px-1 text-[11px] leading-none font-semibold text-white tabular-nums ring-2 ring-background"
                      >
                        <span className="[text-box:trim-both_cap_alphabetic]">{postsFor(chip.adapters[0])}</span>
                      </span>
                    )}
                  </>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={wrapRef} className="relative lg:flex lg:flex-col">
        <Textarea
          ref={taRef}
          id="compose"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={measure}
          placeholder="What's happening?"
          // Wide screens: grows with its text, never scrolling inside; its minimum height is set
          // below (fitToWindow) from the room the Compose column has left, and eases to a new one
          // (a tip below folding or opening), so what's under it slides rather than jumps.
          className="max-h-[70vh] min-h-48 text-base leading-7 [scrollbar-gutter:stable] md:text-base lg:max-h-none lg:transition-[color,box-shadow,min-height] lg:duration-300 lg:ease-out"
          autoFocus
        />
        {style && (
          <div ref={mirrorRef} aria-hidden className="pointer-events-none invisible absolute top-0 left-0" style={style}>
            {pieces}
          </div>
        )}
        {style && (
          // Hit-testing copy: during a drag it sits on top with transparent text, so the
          // browser can say which character is under the pointer. Hidden otherwise.
          <div
            ref={hitRef}
            aria-hidden
            className="pointer-events-none invisible absolute top-0 left-0 z-10 text-transparent select-none"
            style={style}
          >
            {value + "​"}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 z-20">
          {offsets.map((offset) => {
            const pos = positions.get(offset)
            if (!pos || pos.y < 0 || pos.y + pos.h > visibleHeight + 2) return null
            const here = markers.filter((m) => m.offset === offset)
            // Several platforms split here (an All split, even after some were dragged off on
            // their own): the caret and tag take the All chip's neutral color, the tag shows
            // the scissors and post number, and the platform flags stay tucked away until the tag is hovered
            // or focused, so one can be dragged off. Flags show a number only where it differs.
            const all = here.length > 1
            // A group being dragged shows its flags beside the tag, so what moves is plain.
            const held = all && drag?.inside === true && drag.offset === offset && drag.adapters.length > 1
            const allIndex = all ? mostCommon(here.map((m) => m.index)) : 0
            const names = here.map((m) => m.adapter.name).join(", ")
            return (
              <div
                key={offset}
                // 80% at rest, so the text behind a marker shows through; full while handled.
                className="absolute opacity-80 transition-opacity focus-within:opacity-100 hover:opacity-100"
                style={{ left: pos.x, top: pos.y }}
              >
                <div
                  className="absolute top-0 -left-px w-0.5 rounded-full"
                  style={{ height: pos.h, background: all ? "var(--foreground)" : brandOf(here[0].adapter) }}
                />
                <div
                  // No gap in an All group: the pointer must stay on a button between the
                  // tag and the flags, or the hover that shows them would end.
                  className={cn("absolute flex", all && "group/split")}
                  style={{ top: -FLAG_HEIGHT + 2, left: -1 }}
                >
                  {all && (
                    // One tag moves (or removes) the whole group.
                    <button
                      type="button"
                      aria-label={`Split for ${names}, before post ${allIndex}`}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        beginDrag(
                          here.map((m) => m.adapter),
                          e.clientX,
                          e.clientY,
                          { offset },
                        )
                      }}
                      onDoubleClick={() => here.filter((m) => m.manual).forEach(onRemove)}
                      className="pointer-events-auto flex h-4 cursor-grab touch-none items-center gap-0.5 rounded-sm rounded-bl-none bg-foreground px-1 text-[10px] leading-none font-semibold text-background tabular-nums whitespace-nowrap shadow-sm active:cursor-grabbing"
                    >
                      <ScissorsIcon className="size-2.5" />
                      <span className="[text-box:trim-both_cap_alphabetic]">{allIndex}</span>
                    </button>
                  )}
                  {here.map((m) => (
                    <button
                      key={m.adapter.id}
                      type="button"
                      aria-label={`${m.adapter.name} split before post ${m.index}`}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        beginDrag([m.adapter], e.clientX, e.clientY, { offset: m.offset })
                      }}
                      onDoubleClick={() => m.manual && onRemove(m)}
                      className={cn(
                        "pointer-events-auto cursor-grab touch-none active:cursor-grabbing",
                        // In an All group the padding stands in for a gap, so it's part of the hover area.
                        all && "hidden pl-0.5 group-focus-within/split:block group-hover/split:block",
                        held && "block",
                      )}
                    >
                      <Flag adapter={m.adapter} label={all && m.index === allIndex ? undefined : m.index} />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* The dragged split, following the pointer while it's outside the text. An existing
          split there would be removed on release, so it's dimmed and turns destructive red.
          Portaled to the body: as a child here it would count in the spacing between this
          editor's rows and push everything below the text box down while it shows. */}
      {drag &&
        !drag.inside &&
        dragAdapters &&
        createPortal(
          <div
            aria-hidden
            className={cn("pointer-events-none fixed z-50 flex gap-0.5", drag.moving && "opacity-60")}
            style={{ left: drag.x - 6, top: drag.y - 8 }}
          >
            {dragAdapters.length > 1 && (
              // A group: the All tag's scissors go with its flags.
              <span
                className={cn(
                  "flex h-4 items-center rounded-sm rounded-bl-none bg-foreground px-1 text-background shadow-sm",
                  drag.moving && "bg-destructive text-white",
                )}
              >
                <ScissorsIcon className="size-2.5" />
              </span>
            )}
            {dragAdapters.map((a) => (
              <Flag
                key={a.id}
                adapter={a}
                label={drag.moving ? "×" : "+"}
                className={drag.moving ? "bg-destructive text-white" : undefined}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
