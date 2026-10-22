"use client"

import { useEffect, useEffectEvent, useState } from "react"

import { Cursor, loop, useReducedMotion, useTouch, type Point, type Pose } from "@/components/intro-art"
import { PlatformLogo } from "@/components/platform-logo"
import type { PlatformAdapter } from "@/lib/adapters"
import { bluesky } from "@/lib/adapters/bluesky"
import { facebook } from "@/lib/adapters/facebook"
import { instagram } from "@/lib/adapters/instagram"
import { linkedin } from "@/lib/adapters/linkedin"
import { mastodon } from "@/lib/adapters/mastodon"
import { threads } from "@/lib/adapters/threads"
import { twitter } from "@/lib/adapters/twitter"
import { x } from "@/lib/adapters/x"
import { cn } from "@/lib/utils"

// The introduction's Decide step: a drawing of the platform list, a column of tiles like the
// rail's in two parts, the ones posted to and, below a line, the ones turned off. The pointer
// drags Twitter up into Post to, where it settles into its place by name, then X down to Off.
// It's a demonstration: the list is its own, and nothing here changes the app's settings.

const PLATFORMS = [bluesky, facebook, instagram, linkedin, mastodon, threads, twitter, x]
const platform = (id: string) => PLATFORMS.find((a) => a.id === id)!
const byName = (ids: string[]) =>
  [...ids].sort((a, b) => platform(a).name.localeCompare(platform(b).name, undefined, { sensitivity: "base" }))

type Groups = { on: string[]; off: string[] }

const START: Groups = {
  on: byName([bluesky.id, facebook.id, instagram.id, linkedin.id, threads.id, x.id]),
  off: byName([mastodon.id, twitter.id]),
}
/** Twitter turned on, then X turned off. */
const MIDDLE: Groups = { on: byName([...START.on, twitter.id]), off: [mastodon.id] }
const END: Groups = { on: MIDDLE.on.filter((id) => id !== x.id), off: byName([mastodon.id, x.id]) }

/** The list's measures, as the Figma panel draws it: 30px tiles 32px apart, under 20px headings. */
const HEADING_H = 20
const ROW_H = 30
const PITCH = 32
/** The room on either side of the line between the groups. */
const LINE_GAP = 6
/** Where the pointer holds a row: on its tile, toward the name. */
const HOLD: Point = { x: 24, y: ROW_H / 2 }
const REST: Point = { x: 150, y: 290 }
const GLIDE = "cubic-bezier(0.45, 0, 0.2, 1)"
const SETTLE_MS = 450

/** Where each row, the line and the Off heading sit, for the groups as they are. */
function layout(g: Groups) {
  const rows = new Map<string, number>()
  g.on.forEach((id, i) => rows.set(id, HEADING_H + 2 + i * PITCH))
  const line = HEADING_H + 2 + g.on.length * PITCH + LINE_GAP
  const offHeading = line + 1 + LINE_GAP
  g.off.forEach((id, i) => rows.set(id, offHeading + HEADING_H + 2 + i * PITCH))
  return { rows, line, offHeading }
}
/** Tall enough for the list at its longest, so the step never changes height. */
const HEIGHT = Math.max(...[START, MIDDLE, END].map((g) => layout(g).offHeading + HEADING_H + 2 + g.off.length * PITCH))

/** The row being carried: where its top left is, how long it takes there, and whether it shows as on. */
type Carry = { id: string; at: Point; on: boolean; duration: number }

type Frame = {
  groups: Groups
  carry: Carry | null
  cursor: Point
  duration: number
  pose: Pose
}

const FRAME_START: Frame = { groups: START, carry: null, cursor: REST, duration: 0, pose: "arrow" }

export function DecideArt({ active, onDone, className }: { active: boolean; onDone?: () => void; className?: string }) {
  const reduced = useReducedMotion()
  const touch = useTouch()
  const [frame, setFrame] = useState<Frame>(FRAME_START)
  const done = useEffectEvent(() => onDone?.())

  useEffect(() => {
    if (!active || reduced) return
    const set = (change: Partial<Frame>) => setFrame((f) => ({ ...f, ...change }))
    const point: Pose = touch ? "finger" : "arrow"
    const open: Pose = touch ? "finger" : "hand"
    const grab: Pose = touch ? "finger" : "grab"

    /** Picks up row `id` from where it sits in `g` and carries it to `to` (its top left). */
    const carry = async (wait: (ms: number) => Promise<void>, g: Groups, id: string, to: Point, on: boolean) => {
      const from = { x: 0, y: layout(g).rows.get(id)! }
      set({ cursor: { x: from.x + HOLD.x, y: from.y + HOLD.y }, duration: 800, pose: point })
      await wait(850)
      set({ pose: open })
      await wait(300)
      set({ pose: grab, carry: { id, at: from, on: !on, duration: 0 } })
      await wait(250)
      set({ cursor: { x: to.x + HOLD.x, y: to.y + HOLD.y }, duration: 900, carry: { id, at: to, on, duration: 900 } })
      await wait(950)
    }
    /** Lets the row go: the list takes it in its place by name (`next`), and it settles there. */
    const drop = async (wait: (ms: number) => Promise<void>, next: Groups, id: string) => {
      const top = layout(next).rows.get(id)!
      set({ pose: open, groups: next, carry: { id, at: { x: 0, y: top }, on: next.on.includes(id), duration: SETTLE_MS } })
      // The pointer stays where it let go; the row slides out from under it.
      await wait(SETTLE_MS + 50)
      set({ carry: null })
      await wait(300)
      set({ pose: point })
    }

    return loop(
      async (wait) => {
        await wait(700)
        // Up: Twitter, out of Off and let go just over the line, in Post to...
        await carry(wait, START, twitter.id, { x: 8, y: layout(START).line - ROW_H - 4 }, true)
        await drop(wait, MIDDLE, twitter.id)
        await wait(700)
        // ...then down: X, out of Post to and into Off.
        await carry(wait, MIDDLE, x.id, { x: 8, y: layout(MIDDLE).offHeading + HEADING_H + 6 }, false)
        await drop(wait, END, x.id)
        set({ cursor: REST, duration: 700 })
        await wait(1600)
        done()
        await wait(400)
        // As it was, for the next pass.
        set(FRAME_START)
        await wait(600)
      },
      async (wait) => {
        await wait(0)
        set(FRAME_START)
      },
    )
  }, [active, reduced, touch])

  const { rows, line, offHeading } = layout(frame.groups)
  const ids = [...frame.groups.on, ...frame.groups.off]

  return (
    <div
      role="img"
      aria-label="The platform list, Post to above a line and Off below it: a pointer drags Twitter up into Post to, where it settles in by name between Threads and X, then drags X down into Off."
      className={cn("relative select-none", className)}
      style={{ height: HEIGHT }}
    >
      <span aria-hidden className="absolute top-0 left-0 text-sm leading-5 font-medium text-muted-foreground">
        Post to
      </span>
      <span
        aria-hidden
        className="absolute inset-x-0 h-px bg-border transition-[top] duration-500"
        style={{ top: line, transitionTimingFunction: GLIDE }}
      />
      <span
        aria-hidden
        className="absolute left-0 text-sm leading-5 font-medium text-muted-foreground transition-[top] duration-500"
        style={{ top: offHeading, transitionTimingFunction: GLIDE }}
      >
        Off
      </span>
      {ids.map((id) => {
        const carried = frame.carry?.id === id ? frame.carry : null
        return (
          <Row
            key={id}
            adapter={platform(id)}
            on={carried ? carried.on : frame.groups.on.includes(id)}
            lifted={carried !== null}
            at={carried ? carried.at : { x: 0, y: rows.get(id)! }}
            duration={carried ? carried.duration : 500}
          />
        )
      })}
      {!reduced && <Cursor at={frame.cursor} duration={frame.duration} pose={frame.pose} />}
    </div>
  )
}

function Row({
  adapter,
  on,
  lifted,
  at,
  duration,
}: {
  adapter: PlatformAdapter
  on: boolean
  lifted: boolean
  at: Point
  duration: number
}) {
  return (
    <div
      aria-hidden
      className={cn("absolute top-0 left-0 flex items-center gap-2.5", lifted && "z-10")}
      style={
        {
          "--brand": adapter.brand.color ?? "var(--foreground)",
          transform: `translate(${at.x}px, ${at.y}px)`,
          transition: `transform ${duration}ms ${GLIDE}`,
        } as React.CSSProperties
      }
    >
      <span
        className={cn(
          "grid size-7.5 shrink-0 place-items-center rounded-md border bg-card transition-[opacity,box-shadow,filter]",
          lifted && "shadow-lg",
          // Off: gray, until it's carried over to Post to.
          !on && "opacity-50 grayscale",
        )}
      >
        <PlatformLogo adapter={adapter} className="size-4.5" />
      </span>
      <span className={cn("text-sm transition-colors", on ? "text-foreground" : "text-muted-foreground")}>{adapter.name}</span>
    </div>
  )
}
