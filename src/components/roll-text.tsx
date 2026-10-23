"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

// One word rolling into another, letter by letter: each letter has a slot one line tall, a window
// onto a strip with the old letter over the new. A wave runs along the slots, each lifting as it
// passes, while its strip scrolls up a row, so the new letter rolls up into view and the old one
// out of the top; the slot eases from the old letter's width to the new one's, so the new word
// ends up spaced as plain text. For the welcome card's title and the tour's (globals.css).

/** Each slot starts this long after the one before it, ms. */
const STAGGER = 40
/** How long one slot takes to roll (and lift), ms. */
const ROLL = 520

/**
 * Text that rolls from `from` to `to` once, as it mounts (or shows `to` at once, without `from`
 * or with reduced motion), then calls `onDone`. Screen readers get `to` alone.
 */
export function RollText({ from, to, onDone }: { from?: string; to: string; onDone?: () => void }) {
  const ref = useRef<HTMLSpanElement>(null)
  // Rolls only between two different words, and not with reduced motion (then `to` at once).
  const [rolls] = useState(
    () => from !== undefined && from !== to && !matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  // Each slot's width, before and after: measured in the text's own font once it's on screen.
  const [widths, setWidths] = useState<{ from: number; to: number }[] | null>(null)
  const [rolled, setRolled] = useState(false)
  const [done, setDone] = useState(!rolls)
  const places = Math.max(from?.length ?? 0, to.length)

  useLayoutEffect(() => {
    const el = ref.current
    if (!rolls || !el) return
    const style = getComputedStyle(el)
    const ctx = document.createElement("canvas").getContext("2d")
    if (ctx) ctx.font = style.font
    // Without a canvas, a rough letter width (more than half an em).
    const w = (c: string | undefined) =>
      !c ? 0 : ctx ? ctx.measureText(c).width : parseFloat(style.fontSize) * 0.55
    setWidths(Array.from({ length: places }, (_, i) => ({ from: w(from?.[i]), to: w(to[i]) })))
  }, [rolls, from, to, places])

  useEffect(() => {
    if (!widths) return
    // A moment after the slots are drawn at the old widths, so the change is a transition.
    const start = setTimeout(() => setRolled(true), 20)
    const end = setTimeout(
      () => {
        setDone(true)
        onDone?.()
      },
      20 + (places - 1) * STAGGER + ROLL,
    )
    return () => {
      clearTimeout(start)
      clearTimeout(end)
    }
    // onDone is the caller's; the roll runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widths, places])

  return (
    <>
      <span className="sr-only">{to}</span>
      <span ref={ref} aria-hidden className="whitespace-pre">
        {done || !widths
          ? done
            ? to
            : from
          : widths.map((width, i) => (
              <span
                key={i}
                className="roll-slot"
                data-rolled={rolled || undefined}
                style={
                  {
                    width: rolled ? width.to : width.from,
                    "--delay": `${i * STAGGER}ms`,
                    "--roll": `${ROLL}ms`,
                  } as React.CSSProperties
                }
              >
                <span className="roll-strip">
                  <span>{from?.[i] ?? ""}</span>
                  <span>{to[i] ?? ""}</span>
                </span>
              </span>
            ))}
      </span>
    </>
  )
}
