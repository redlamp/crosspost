"use client"

import { useEffect, useState } from "react"

// A departure board's split flaps: the letters of one word turn over, one place after another,
// through the alphabet to the letters of the next. For the welcome card's title and the tour's,
// which become each other as the tour opens and closes (a nod to the journey the app is about).

const ALPHABET = " abcdefghijklmnopqrstuvwxyz"
/** At most this many flaps between a letter and the next, so far-apart letters don't take longer. */
const MAX_FLAPS = 6
/** A flap every this many ms; each place starts a flap after the one before it. */
const TICK = 35

/** The flaps from letter `a` to letter `b`: forward through the alphabet, in `b`'s case. */
function flaps(a: string, b: string): string[] {
  if (a === b) return [a]
  const at = (c: string) => Math.max(0, ALPHABET.indexOf(c.toLowerCase()))
  const from = at(a)
  const distance = (at(b) - from + ALPHABET.length) % ALPHABET.length
  const count = Math.min(MAX_FLAPS, distance)
  const upper = b !== b.toLowerCase()
  const seq = [a]
  for (let s = 1; s < count; s++) {
    const c = ALPHABET[(from + Math.round((distance * s) / count)) % ALPHABET.length]
    seq.push(upper ? c.toUpperCase() : c)
  }
  seq.push(b)
  return seq
}

/**
 * Text that flaps from `from` to `to` once, as it mounts (or shows `to` at once, without `from`
 * or with reduced motion), then calls `onDone`. Screen readers get `to` alone.
 */
export function FlapText({ from, to, onDone }: { from?: string; to: string; onDone?: () => void }) {
  const [text, setText] = useState(from ?? to)
  useEffect(() => {
    if (from === undefined || from === to) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(() => {
        setText(to)
        onDone?.()
      }, 0)
      return () => clearTimeout(id)
    }
    const places = Math.max(from.length, to.length)
    const runs = Array.from({ length: places }, (_, i) => flaps(from[i] ?? " ", to[i] ?? " "))
    let tick = 0
    const id = setInterval(() => {
      tick++
      let settled = true
      const shown = runs.map((run, i) => {
        const k = tick - i
        if (k < run.length - 1) settled = false
        return run[Math.max(0, Math.min(run.length - 1, k))]
      })
      setText(shown.join("").trimEnd())
      if (settled) {
        clearInterval(id)
        setText(to)
        onDone?.()
      }
    }, TICK)
    return () => clearInterval(id)
    // Once, as it mounts: a new pair of words is a new mount (keyed by its caller).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <>
      <span className="sr-only">{to}</span>
      <span aria-hidden className="whitespace-pre">
        {text}
      </span>
    </>
  )
}
