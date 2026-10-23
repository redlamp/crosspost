"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

// One phrase rolling into another, word by word, in a one-line window: the old words push up and
// out of the top, one after another, then the new ones push up into view from below. Whole words
// move, so the line reads at every moment. For the welcome card's title and the tour's, which
// become each other as the tour opens and closes. The motion is the Web Animations API and the
// window's shape is inline, so it doesn't lean on a stylesheet that might be stale.

/** Each word starts this long after the one before it, ms. */
const STAGGER = 70
/** How long one word takes to move, ms. */
const MOVE = 420
/** The new words start this long after the old ones, ms. */
const LAG = 80
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"

const WORD: React.CSSProperties = { display: "inline-block", whiteSpace: "pre" }

/** A phrase as its words, each keeping the space after it. */
const wordsOf = (text: string) => text.split(/(?<= )/)

/**
 * Text that rolls from `from` to `to` once, as it mounts (or shows `to` at once, without `from`
 * or with reduced motion), then calls `onDone`. Screen readers get `to` alone.
 */
export function RollText({ from, to, onDone }: { from?: string; to: string; onDone?: () => void }) {
  const box = useRef<HTMLSpanElement>(null)
  // Rolls only between two different phrases, and not with reduced motion (then `to` at once).
  const [rolls] = useState(
    () => from !== undefined && from !== to && !matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  const [done, setDone] = useState(!rolls)

  useLayoutEffect(() => {
    const el = box.current
    if (!rolls || !el) return
    const animations: Animation[] = []
    const move = (words: NodeListOf<Element>, keyframes: Keyframe[], start: number) =>
      words.forEach((word, i) =>
        animations.push(
          word.animate(keyframes, { duration: MOVE, delay: start + i * STAGGER, easing: EASE, fill: "both" }),
        ),
      )
    move(
      el.querySelectorAll("[data-old]"),
      [
        { transform: "translateY(0)", opacity: 1 },
        { transform: "translateY(-110%)", opacity: 0 },
      ],
      0,
    )
    move(
      el.querySelectorAll("[data-new]"),
      [
        { transform: "translateY(110%)", opacity: 0 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      LAG,
    )
    return () => animations.forEach((a) => a.cancel())
  }, [rolls])

  useEffect(() => {
    if (!rolls) return
    const count = Math.max(wordsOf(from ?? "").length, wordsOf(to).length)
    const id = setTimeout(
      () => {
        setDone(true)
        onDone?.()
      },
      LAG + (count - 1) * STAGGER + MOVE,
    )
    return () => clearTimeout(id)
    // onDone is the caller's; the roll runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolls])

  return (
    <>
      <span className="sr-only">{to}</span>
      {done ? (
        <span aria-hidden className="whitespace-pre">
          {to}
        </span>
      ) : (
        // The window: one line tall, clipping the words as they leave and arrive. The new phrase
        // sits in the flow (so the window takes its width); the old one over it.
        <span
          ref={box}
          aria-hidden
          style={{ position: "relative", display: "inline-block", height: "1lh", overflow: "hidden", verticalAlign: "top" }}
        >
          <span style={{ position: "absolute", left: 0, top: 0, whiteSpace: "pre" }}>
            {wordsOf(from ?? "").map((word, i) => (
              <span key={i} data-old style={WORD}>
                {word}
              </span>
            ))}
          </span>
          {wordsOf(to).map((word, i) => (
            <span key={i} data-new style={WORD}>
              {word}
            </span>
          ))}
        </span>
      )}
    </>
  )
}
