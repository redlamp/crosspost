"use client"

import { useState } from "react"

/**
 * Text whose letters move in a wave (globals.css), read as plain text by screen readers. `loop`:
 * a wave runs through it again and again, each letter rising and turning the app's blue as it
 * passes ("Start here"). `enter`: the letters rise into place once, in blue, settling to the text
 * color ("Take the tour", arriving as "Start here" leaves), from `delay` ms (the delay it was
 * first given, so a later change can't shift a wave under way).
 */
export function WaveText({ text, mode, delay = 0 }: { text: string; mode: "loop" | "enter"; delay?: number }) {
  const [start] = useState(delay)
  return (
    <>
      <span className="sr-only">{text}</span>
      <span
        aria-hidden
        className={mode === "loop" ? "letter-wave" : "letter-wave-in"}
        style={{ "--wave-start": `${start}ms` } as React.CSSProperties}
      >
        {[...text].map((ch, i) => (
          <span key={i} style={{ "--i": i } as React.CSSProperties}>
            {ch}
          </span>
        ))}
      </span>
    </>
  )
}
